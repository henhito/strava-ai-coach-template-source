import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ExternalLink, Trophy, Bike, Footprints, ChevronRight, Settings as SettingsIcon, RefreshCw, Database, Zap, Bug } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';

import { BestEffort } from '@/entities/BestEffort';
import { User } from '@/entities/User';
import { migrateBestEffortsAssignOwner } from '@/functions/migrateBestEffortsAssignOwner';
import { extractBestEffortsFromActivities } from '@/functions/extractBestEffortsFromActivities';
import { testListAllBestEfforts } from '@/functions/testListAllBestEfforts';
import { extractBestEffortsFromDatabase } from '@/functions/extractBestEffortsFromDatabase';

/* ---------- constants ---------- */

const CYCLING_TYPES = [
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "EMountainBikeRide",
  "Velomobile",
];

const RUNNING_TYPES = [
  "Run",
  "VirtualRun",
  "TrailRun",
];

const LONG_RIDE_DISTANCE_M = 180000;

/* ---------- helpers ---------- */

const formatTime = (seconds) => {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 'N/A';
  const s = Math.round(n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}` : `${m}:${String(r).padStart(2,'0')}`;
};

const formatPace = (paceSecsPerKm) => {
  const p = Number(paceSecsPerKm);
  if (!Number.isFinite(p) || p <= 0) return 'N/A';
  const min = Math.floor(p / 60);
  const sec = Math.round(p % 60);
  return `${min}:${String(sec).padStart(2,'0')}/km`;
};

const getDistanceMeters = (effort) => {
  const meters = Number(effort?.distance_m ?? effort?.distance_meters);
  return Number.isFinite(meters) ? meters : 0;
};

const isLongRideEffort = (effort) =>
  CYCLING_TYPES.includes(effort?.activity_type) && getDistanceMeters(effort) > LONG_RIDE_DISTANCE_M;

// Normalize names coming from DB
const canonicalName = (name) => {
  const nameStr = String(name || '').trim().toLowerCase();
  const canonicalMap = {
    // Running distances
    '5k': '5k', '10k': '10k', '15k': '15k', '20k': '20k', '30k': '30k',
    '40k': '40k', '50k': '50k', '100k': '100k',
    'half-marathon': 'half marathon',
    'half marathon': 'half marathon',
    'marathon': 'marathon',
    'full marathon': 'marathon',
    '1 mi': '1 mile', '2 miles': '2 mile', '2 mi': '2 mile', '10 miles': '10 mile', '10 mi': '10 mile',
    '1mile': '1 mile', '2mile': '2 mile', '10mile': '10 mile',
    '50 miles': '50 mile', '50 mi': '50 mile', '100 miles': '100 mile', '100 mi': '100 mile',
    '50mile': '50 mile', '100mile': '100 mile',
    '0.5 mi': '1/2 mile',
    '1/2 mile': '1/2 mile',
    
    // Cycling distances
    '5 mile': '5 mile',
    '5 miles': '5 mile',
    '5 mi': '5 mile',
    '5mi': '5 mile',
    '80k': '80k',
    '90k': '90k',
    '160k': '100 mile',
    '160km': '100 mile',
    '160 k': '100 mile',
    '160 km': '100 mile',
    '180k': '180k',
    '180k+': '180k+',
    '180km+': '180k+',
    '180 k+': '180k+',
    '180 km+': '180k+',
    '180k plus': '180k+',
    '180 km plus': '180k+',
    '100k+': '100k+',
    '100km+': '100k+',
    '100 k+': '100k+',
    '100 km+': '100k+',
    '10km': '10k', '20km': '20k', '40km': '40k', '50km': '50k',
    '80km': '80k', '90km': '90k', '100km': '100k', '180km': '180k',
  };
  return canonicalMap[nameStr] || nameStr;
};

const effortDistanceName = (effort) => {
  const canonical = canonicalName(effort?.distance_name);
  if (canonical === '100k+' || canonical === '180k+') return canonical;
  if (isLongRideEffort(effort)) return '180k+';
  return canonical;
};

const displayDistanceName = (name) => canonicalName(name);

// Slugs for URL routing
const DISTANCE_SLUG_MAP = {
  // Running distances
  '400m':'400m','800m':'800m','1/2 mile':'0_5mi','0.5 mi':'0_5mi',
  '1k':'1k','1 mile':'1mi','1 mi':'1mi',
  '2 mile':'2mi','2 mi':'2mi',
  '5k':'5k','10k':'10k','15k':'15k','10 mile':'10mi','10 mi':'10mi',
  '20k':'20k','half marathon':'half','half-marathon':'half',
  '30k':'30k','marathon':'marathon',
  '40k':'40k','50k':'50k','100k':'100k','50 mile':'50mi','50 mi':'50mi',
  '100 mile':'100mi','100 mi':'100mi',
  
  // Cycling distances
  '5 mile':'5mi','5 miles':'5mi','5 mi':'5mi','5mi':'5mi',
  '80k':'80k',
  '90k':'90k',
  '180k':'180k',
  '180k+':'180kplus',
  '100k+':'100kplus',
};

// Distance order for sorting
const DISTANCE_ORDER = {
  '400m':1,'800m':2,'1k':3,'1/2 mile':3.5,'0.5 mi':3.5,
  '1 mile':4,'1 mi':4,'2 mile':5,'2 mi':5,
  '5k':6,'5 mile':6.5,'5 miles':6.5,'5 mi':6.5,'5mi':6.5,
  '10k':7,'15k':8,'10 mile':9,'10 mi':9,
  '20k':10,'half marathon':11,
  '30k':12,'marathon':13,
  '40k':14,'50k':15,
  '80k':16,
  '50 mile':17,'50 mi':17,
  '90k':18,
  '100k':19,
  '100k+':19.5,
  '100 mile':20,'100 mi':20,
  '180k':21,
  '180k+':22,
};

const safeDateMs = (d) => {
  try { return Number(new Date(d || 0)); } catch { return 0; }
};

// Deduplicate best efforts - keep fastest standard efforts and the longest 180k+ ride.
const deduplicateBestEfforts = (efforts) => {
  const map = new Map();
  
  efforts.forEach(effort => {
    const distanceName = effortDistanceName(effort);
    const key = `${effort.activity_type}:${distanceName}`;
    const existing = map.get(key);

    if (distanceName === '180k+' || distanceName === '100k+') {
      if (!existing || getDistanceMeters(effort) > getDistanceMeters(existing)) {
        map.set(key, effort);
      }
      return;
    }

    const effortTime = Number(effort.elapsed_time_s) || Infinity;
    const existingTime = Number(existing?.elapsed_time_s) || Infinity;
    
    if (!existing || effortTime < existingTime) {
      map.set(key, effort);
    }
  });
  
  return Array.from(map.values());
};

const BestEffortTable = ({ title, efforts, icon: Icon, sortBy, onSortChange, activityType }) => {
  const sorted = [...efforts].sort((a, b) => {
    const aName = effortDistanceName(a);
    const bName = effortDistanceName(b);
    if (sortBy === 'distance') return (DISTANCE_ORDER[aName] || 999) - (DISTANCE_ORDER[bName] || 999);
    if (sortBy === 'time') return (Number(a?.elapsed_time_s) || Infinity) - (Number(b?.elapsed_time_s) || Infinity);
    if (sortBy === 'pace') return (Number(a?.pace_s_per_km) || Infinity) - (Number(b?.pace_s_per_km) || Infinity);
    if (sortBy === 'date') return safeDateMs(b?.activity_date) - safeDateMs(a?.activity_date);
    return 0;
  });

  const isCycling = title === 'Cycling';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-lg">
            <Icon className="w-6 h-6 text-orange-500" />
            {title} Best Efforts ({efforts.length})
          </CardTitle>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="distance">By Distance</SelectItem>
              <SelectItem value="time">By Time</SelectItem>
              {!isCycling && <SelectItem value="pace">By Pace</SelectItem>}
              <SelectItem value="date">By Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No best efforts saved yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Distance</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>{isCycling ? 'Speed' : 'Pace'}</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, i) => {
                const nameCanonical = effortDistanceName(row);
                const displayName = (nameCanonical === '180k+' || nameCanonical === '100k+') ? nameCanonical : displayDistanceName(row?.distance_name);
                const slug = DISTANCE_SLUG_MAP[nameCanonical];
                return (
                  <TableRow key={i} className="group">
                    <TableCell className="font-medium whitespace-nowrap">
                      {slug ? (
                        <Link
                          to={createPageUrl(`BestEffortDetail?distance=${slug}&type=${activityType}`)}
                          className="text-blue-600 hover:underline inline-flex items-center gap-2 whitespace-nowrap"
                        >
                          {displayName || '—'}
                          <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      ) : (
                        <span>{displayName || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-orange-600">
                        {formatTime(row?.elapsed_time_s)}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {isCycling 
                        ? (row?.speed_kph ? `${Number(row.speed_kph).toFixed(1)} km/h` : '—')
                        : formatPace(row?.pace_s_per_km)
                      }
                    </TableCell>
                    <TableCell>
                      <Button variant="link" asChild className="p-0 h-auto">
                        <Link
                          to={createPageUrl(`ActivityDetail?id=${row?.activity_id}`)}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <span className="truncate max-w-[200px]">{row?.activity_name || 'Activity'}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {row?.activity_date ? format(new Date(row.activity_date), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      {slug && (
                        <Button variant="ghost" size="sm" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={createPageUrl(`BestEffortDetail?distance=${slug}&type=${activityType}`)}>Top 5</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default function BestEffortsPage() {
  const [runningBests, setRunningBests] = useState([]);
  const [cyclingBests, setCyclingBests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningSortBy, setRunningSortBy] = useState('distance');
  const [cyclingSortBy, setCyclingSortBy] = useState('distance');
  const [isMigrating, setIsMigrating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [isExtractingFromDB, setIsExtractingFromDB] = useState(false);
  const [activityTypeFilter, setActivityTypeFilter] = useState('all');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await User.me();
        setCurrentUserEmail(user?.email || 'unknown');
        console.log('Current user email:', user?.email);
      } catch (e) {
        console.error('Failed to load user:', e);
      }
    };
    loadUser();
  }, []);

  const loadBestEfforts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('📊 Loading best efforts via RLS-scoped SDK...');
      let resp;
      try {
        resp = await BestEffort.list();
      } catch {
        if (BestEffort.filter) {
          resp = await BestEffort.filter({}, '-activity_date', 1000);
        } else {
          resp = [];
        }
      }
      const all = Array.isArray(resp) ? resp : (resp?.items || resp?.data || []);
      console.log(`✅ Loaded ${all.length} best efforts (before filtering).`);

      // Filter out internal markers and longest_ride category
      const validEfforts = all.filter(e => 
        e && 
        e.distance_name && 
        !e.distance_name.startsWith('__import_complete') &&
        e.category !== 'longest_ride'
      );
      console.log(`✅ Filtered out internal markers, leaving ${validEfforts.length} valid efforts.`);

      // Deduplicate to keep only fastest for each distance
      const deduplicated = deduplicateBestEfforts(validEfforts);
      console.log(`✅ After deduplication: ${deduplicated.length} unique best efforts`);
      
      // Filter by activity type - include all cycling types
      const runs = deduplicated.filter((b) => RUNNING_TYPES.includes(b?.activity_type));
      const rides = deduplicated.filter((b) => CYCLING_TYPES.includes(b?.activity_type));
      console.log(`🏃 Running: ${runs.length}, 🚴 Cycling: ${rides.length}`);
      
      setRunningBests(runs);
      setCyclingBests(rides);
    } catch (e) {
      console.error('❌ Failed to load best efforts:', e);
      setError((e && e.message) || 'Failed to load best efforts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDebug = async () => {
    setIsDebugging(true);
    setDebugInfo(null);
    setError(null);
    
    try {
      console.log('🐛 Running debug check...');
      const response = await testListAllBestEfforts({});
      const data = response.data || response;
      
      console.log('Debug response:', data);
      setDebugInfo(data);
    } catch (err) {
      console.error('❌ Debug error:', err);
      setError(err.message || 'Debug check failed');
    } finally {
      setIsDebugging(false);
    }
  };

  const handleExtraction = async () => {
    setIsExtracting(true);
    setSuccessMessage(null);
    setError(null);
    
    try {
      console.log('🔍 Extracting best efforts from activities...');
      const response = await extractBestEffortsFromActivities({});
      const data = response.data || response;
      
      console.log('Extraction response:', data);
      
      if (data.success) {
        setSuccessMessage(`✅ Extracted ${data.bestEffortsExtracted || 0} best efforts from ${data.activitiesProcessed || 0} activities! Reloading...`);
        setTimeout(() => {
          loadBestEfforts();
          setSuccessMessage(null);
        }, 2000);
      } else {
        setError(data.error || 'Extraction failed. Please make sure you have activities synced.');
      }
    } catch (err) {
      console.error('❌ Extraction error:', err);
      setError(err.message || 'Extraction failed. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleMigration = async () => {
    setIsMigrating(true);
    setSuccessMessage(null);
    setError(null);
    
    try {
      console.log('🔄 Running Best Efforts migration...');
      const response = await migrateBestEffortsAssignOwner({});
      const data = response.data || response;
      
      console.log('Migration response:', data);
      
      if (data.success) {
        setSuccessMessage(`✅ Migration complete! Fixed ${data.replaced || 0} best efforts. Reloading data...`);
        setTimeout(() => {
          loadBestEfforts();
          setSuccessMessage(null);
        }, 2000);
      } else {
        setError(data.error || 'Migration failed. Please try again.');
      }
    } catch (err) {
      console.error('❌ Migration error:', err);
      setError(err.message || 'Migration failed. Please try again.');
    } finally {
      setIsMigrating(false);
    }
  };

  useEffect(() => { loadBestEfforts(); }, [loadBestEfforts]);

  const handleExtractFromDB = async () => {
    setIsExtractingFromDB(true);
    setError(null);
    setSuccessMessage('Starting database scan…');
    try {
      let hasMore = true;
      while (hasMore) {
        const response = await extractBestEffortsFromDatabase({ action: 'start' });
        const data = response.data || response;
        if (!data.success || data.error) throw new Error(data.error || 'Database scan failed.');
        setSuccessMessage(data.message || 'Scanning saved activities…');
        hasMore = data.hasMore === true;
        if (hasMore) await new Promise((resolve) => setTimeout(resolve, 150));
      }
      await loadBestEfforts();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to scan saved activities.');
    } finally {
      setIsExtractingFromDB(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-orange-500" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Best Efforts</h1>
              <p className="text-gray-600">Your personal records saved in the database.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleDebug}
              variant="outline"
              disabled={isDebugging}
              className="gap-2"
            >
              {isDebugging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bug className="w-4 h-4" />
              )}
              Debug
            </Button>
            <Button
              onClick={handleExtractFromDB}
              variant="outline"
              disabled={isExtractingFromDB}
              className="gap-2"
            >
              {isExtractingFromDB ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              Scan Database
            </Button>
            <Button
              onClick={loadBestEfforts}
              variant="outline"
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Best Efforts</SelectItem>
              <SelectItem value="Run">Running</SelectItem>
              <SelectItem value="Ride">Cycling</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {debugInfo && (
          <Alert className="mb-6 bg-purple-50 border-purple-200">
            <Bug className="w-4 h-4 text-purple-600" />
            <AlertTitle className="text-purple-900">Debug Info</AlertTitle>
            <AlertDescription className="text-purple-700">
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div>
                    <span className="font-medium">Total Records:</span> {debugInfo.summary?.total || 0}
                  </div>
                  <div>
                    <span className="font-medium">With Owner:</span> {debugInfo.summary?.withOwner || 0}
                  </div>
                  <div>
                    <span className="font-medium">Without Owner:</span> {debugInfo.summary?.withoutOwner || 0}
                  </div>
                </div>
                {currentUserEmail && (
                  <div className="mt-3 p-2 bg-purple-100 rounded">
                    <strong>Your Email:</strong> {currentUserEmail}
                  </div>
                )}
                {debugInfo.summary?.owners && debugInfo.summary.owners.length > 0 && (
                  <div className="mt-3">
                    <strong>Owners in Database:</strong>
                    <ul className="ml-4 mt-1">
                      {debugInfo.summary.owners.map((owner, i) => (
                        <li key={i} className={owner.email === currentUserEmail ? 'font-bold text-green-600' : ''}>
                          {owner.email}: {owner.count} records
                          {owner.email === currentUserEmail && ' ← YOU'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <Trophy className="w-4 h-4 text-green-600" />
            <AlertTitle className="text-green-900">Success!</AlertTitle>
            <AlertDescription className="text-green-700">{successMessage}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <Card className="text-center p-12">
            <Loader2 className="w-16 h-16 text-orange-400 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Your Best Efforts…</h3>
            <p className="text-gray-500">Reading from the BestEffort table.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {runningBests.length === 0 && cyclingBests.length === 0 ? (
              <Card className="text-center p-12">
                <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Best Efforts Found</h3>
                <p className="text-gray-500 mb-6">
                  Your BestEffort table appears to be empty or not visible. Let's diagnose!
                  <br />
                  <span className="text-sm text-gray-400 mt-1 block">If a specific distance (like a marathon) is missing, please try the 'Extract Best Efforts' button.</span>
                </p>
                
                <Alert className="bg-yellow-50 border-yellow-200 mb-6 text-left max-w-2xl mx-auto">
                  <Bug className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800 text-sm">
                    <p><strong>First: Click "Debug" button above to see what's in the database</strong></p>
                    <p className="mt-2 text-xs">This will show you if data exists and who owns it.</p>
                  </AlertDescription>
                </Alert>

                <div className="border-t border-gray-200 pt-6 mt-6 max-w-2xl mx-auto">
                  <Alert className="bg-blue-50 border-blue-200 mb-6 text-left">
                    <Zap className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 text-sm space-y-2">
                      <p><strong>Option 1: Extract Best Efforts (if no data exists)</strong></p>
                      <p>Analyzes your activities and creates best effort records for standard distances.</p>
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3 justify-center flex-wrap mb-6">
                    <Button
                      onClick={handleExtractFromDB}
                      disabled={isExtractingFromDB}
                      variant="outline"
                      className="gap-2"
                    >
                      {isExtractingFromDB ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Database className="w-5 h-5" />
                      )}
                      Scan Database for PBs
                    </Button>
                    <Button 
                      onClick={handleExtraction}
                      disabled={isExtracting}
                      className="bg-orange-500 hover:bg-orange-600 gap-2"
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Extract Best Efforts
                        </>
                      )}
                    </Button>
                  </div>

                  <Alert className="bg-green-50 border-green-200 mb-4 text-left">
                    <Database className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 text-sm">
                      <p><strong>Option 2: Fix Visibility (if data exists but you can't see it)</strong></p>
                      <p className="text-xs mt-1">Assigns ownership to make existing records visible to you.</p>
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3 justify-center flex-wrap">
                    <Button 
                      onClick={handleMigration}
                      disabled={isMigrating}
                      variant="outline"
                      className="gap-2"
                    >
                      {isMigrating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Fixing...
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          Fix Visibility Issues
                        </>
                      )}
                    </Button>
                    <Link to={createPageUrl('Settings')}>
                      <Button variant="outline" className="gap-2">
                        <SettingsIcon className="w-4 h-4" />
                        Go to Settings
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {activityTypeFilter === 'all' && (
                  <>
                    {runningBests.length > 0 && (
                      <BestEffortTable
                        title="Running"
                        efforts={runningBests}
                        icon={Footprints}
                        sortBy={runningSortBy}
                        onSortChange={setRunningSortBy}
                        activityType="Run"
                      />
                    )}
                    {cyclingBests.length > 0 && (
                      <BestEffortTable
                        title="Cycling"
                        efforts={cyclingBests}
                        icon={Bike}
                        sortBy={cyclingSortBy}
                        onSortChange={setCyclingSortBy}
                        activityType="Ride"
                      />
                    )}
                  </>
                )}
                {activityTypeFilter === 'Run' && (
                  <>
                    {runningBests.length > 0 ? (
                      <BestEffortTable
                        title="Running"
                        efforts={runningBests}
                        icon={Footprints}
                        sortBy={runningSortBy}
                        onSortChange={setRunningSortBy}
                        activityType="Run"
                      />
                    ) : !isLoading && (
                      <Card className="text-center p-12">
                        <p className="text-gray-500">No running best efforts found.</p>
                      </Card>
                    )}
                  </>
                )}
                {activityTypeFilter === 'Ride' && (
                  <>
                    {cyclingBests.length > 0 ? (
                      <BestEffortTable
                        title="Cycling"
                        efforts={cyclingBests}
                        icon={Bike}
                        sortBy={cyclingSortBy}
                        onSortChange={setCyclingSortBy}
                        activityType="Ride"
                      />
                    ) : !isLoading && (
                      <Card className="text-center p-12">
                        <p className="text-gray-500">No cycling best efforts found.</p>
                      </Card>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}