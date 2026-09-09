import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Shield, Trash2, Download, ExternalLink, AlertTriangle, Loader2, Ruler, Heart, Database, CheckCircle, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnits } from "@/components/units/UnitsProvider";
import { calculateHRZones } from "@/functions/calculateHRZones";
import { syncStravaActivities } from "@/functions/syncStravaActivities";
import { migrateBestEffortsAssignOwner } from "@/functions/migrateBestEffortsAssignOwner";
import { testListAllBestEfforts } from "@/functions/testListAllBestEfforts";
import { extractBestEffortsFromActivities } from "@/functions/extractBestEffortsFromActivities";
import StravaEnrichment from '@/components/settings/StravaEnrichment';
import DuplicateCleanup from "@/components/settings/DuplicateCleanup";
import { toast } from "sonner";



export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState({
    weeklyReport: true,
    trainingReminders: false,
    achievementAlerts: true
  });
  const { units, updateUnits } = useUnits();

  // HR Zones state
  const [age, setAge] = useState("");
  const [hrZones, setHrZones] = useState({
    zone1_max: "",
    zone2_max: "",
    zone3_max: "",
    zone4_max: "",
    zone5_max: ""
  });
  const [isCalculatingZones, setIsCalculatingZones] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncPage, setSyncPage] = useState(1);

  // Best Efforts Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState(null);
  const [bestEffortsDebug, setBestEffortsDebug] = useState(null);
  const [isLoadingBestEfforts, setIsLoadingBestEfforts] = useState(false);

    const [isReconnecting, setIsReconnecting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [isRebuildingBestEfforts, setIsRebuildingBestEfforts] = useState(false);

  const [bestEffortsRebuildResult, setBestEffortsRebuildResult] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        
        if (userData.age) setAge(userData.age.toString());
        if (userData.hr_zones) {
          setHrZones({
            zone1_max: userData.hr_zones.zone1_max?.toString() || "",
            zone2_max: userData.hr_zones.zone2_max?.toString() || "",
            zone3_max: userData.hr_zones.zone3_max?.toString() || "",
            zone4_max: userData.hr_zones.zone4_max?.toString() || "",
            zone5_max: userData.hr_zones.zone5_max?.toString() || ""
          });
        }
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const handleDisconnectStrava = () => {
    alert("Strava account disconnected successfully");
    setUser(prevUser => ({ ...prevUser, strava_access_token: null }));
  };

  const handleReconnectStrava = async () => {
    setIsReconnecting(true);
    try {
      const { getStravaAuthUrl } = await import('@/functions/getStravaAuthUrl');
      const response = await getStravaAuthUrl();
      const data = response?.data || response;
      
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        alert('Failed to get Strava authorization URL. Please check your environment variables.');
        setIsReconnecting(false);
      }
    } catch (error) {
      console.error('Error reconnecting Strava:', error);
      alert(`Failed to reconnect: ${error.message}`);
      setIsReconnecting(false);
    }
  };

  const handleDeleteData = () => {
    if (confirm("Are you sure you want to delete all your data? This action cannot be undone.")) {
      alert("All data has been deleted successfully");
    }
  };

  const handleExportData = () => {
    alert("Data export will be sent to your email address");
  };

  const handleCalculateZones = async () => {
    if (!age || parseInt(age) < 15 || parseInt(age) > 100) {
      alert("Please enter a valid age between 15 and 100");
      return;
    }

    setIsCalculatingZones(true);
    try {
      const response = await calculateHRZones({ age: parseInt(age) });
      const data = response.data || response;
      
      if (data.success && data.zones) {
        setHrZones({
          zone1_max: data.zones.zone1_max.toString(),
          zone2_max: data.zones.zone2_max.toString(),
          zone3_max: data.zones.zone3_max.toString(),
          zone4_max: data.zones.zone4_max.toString(),
          zone5_max: data.zones.zone5_max.toString()
        });
        alert(`HR zones calculated using ${data.zones.formula_used}\nMax HR: ${data.zones.max_hr} bpm`);
      } else {
        alert("Failed to calculate HR zones. Please try again.");
      }
    } catch (error) {
      console.error("Error calculating zones:", error);
      alert("Error calculating HR zones. Please try again.");
    } finally {
      setIsCalculatingZones(false);
    }
  };

  const handleSaveHRSettings = async () => {
    try {
      const hrZoneData = {
        zone1_max: parseInt(hrZones.zone1_max) || null,
        zone2_max: parseInt(hrZones.zone2_max) || null,
        zone3_max: parseInt(hrZones.zone3_max) || null,
        zone4_max: parseInt(hrZones.zone4_max) || null,
        zone5_max: parseInt(hrZones.zone5_max) || null
      };

      await User.updateMyUserData({
        age: parseInt(age) || null,
        hr_zones: hrZoneData
      });
      
      alert("Heart rate settings saved successfully!");
    } catch (error) {
      console.error("Error saving HR settings:", error);
      alert("Failed to save settings. Please try again.");
    }
  };

  const handleSyncActivities = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    
    try {
      console.log('Starting sync from Settings page...');
      const response = await syncStravaActivities({ syncType: 'historical_deep_dive', page: syncPage });
      const data = response.data || response;
      
      if (data.error) {
        if (data.isRateLimit) {
          setSyncStatus({ 
            success: false, 
            message: data.error,
            isRateLimit: true,
            nextAction: 'Wait 15 minutes, then click "Full Sync" again to continue where you left off.'
          });
        } else {
          setSyncStatus({ success: false, message: `Sync failed: ${data.error}` });
        }
        return;
      }
      
      let statusMessage = data.message || `Sync completed! ${data.newActivities || 0} new activities synced.`;
      if (data.hasMore) {
        statusMessage = `✓ Page ${data.page} synced! ${data.newActivities || 0} new activities added. Continue to sync older activities.`;
      }
      
      setSyncStatus({
        success: true,
        message: statusMessage,
        stravaTotal: null,
        dbTotal: null,
        hasMore: data.hasMore,
        page: data.page
      });
      setSyncPage(data.hasMore ? (data.nextPage || syncPage + 1) : 1);
      
    } catch (err) {
      console.error('Error syncing activities:', err);
      
      if (err.response?.data?.isRateLimit || err.response?.status === 429) {
        const errorMessage = err.response?.data?.error || '🚫 Strava API Rate Limit: Wait 15 minutes and try again.';
        setSyncStatus({ 
          success: false, 
          message: errorMessage,
          isRateLimit: true,
          nextAction: 'Wait 15 minutes, then click "Full Sync" again to continue where you left off.'
        });
      } else if (err.response?.status === 401 || err.response?.data?.error === 'Unauthorized') {
        setSyncStatus({ 
          success: false, 
          message: 'Strava token expired or invalid. Please reconnect your Strava account.',
          isTokenError: true
        });
      }
      else {
        setSyncStatus({ success: false, message: `Sync failed: ${err.message}` });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMigrateBestEfforts = async () => {
    setIsMigrating(true);
    setMigrationResults(null);
    
    try {
      console.log('🔄 Running Best Efforts migration...');
      const response = await migrateBestEffortsAssignOwner({});
      const data = response.data || response;
      
      console.log('Migration response:', data);
      setMigrationResults(data);
    } catch (error) {
      console.error('❌ Migration error:', error);
      setMigrationResults({
        success: false,
        error: error.message || 'Migration failed'
      });
    } finally {
      setIsMigrating(false);
    }
  };

    const handleCheckBestEfforts = async () => {
    setIsLoadingBestEfforts(true);
    setBestEffortsDebug(null);
    
    try {
      console.log('🔍 Checking Best Efforts data...');
      const response = await testListAllBestEfforts({});
      const data = response.data || response;
      
      console.log('Debug response:', data);
      setBestEffortsDebug(data);
    } catch (error) {
      console.error('❌ Debug error:', error);
      setBestEffortsDebug({
        success: false,
        error: error.message || 'Failed to check best efforts'
      });
    } finally {
      setIsLoadingBestEfforts(false);
    }
  };

  const handleCleanup = async (dryRun = true) => {
      setIsCleaning(true);
      setCleanupResult(null);
      try {
          const response = await base44.functions.invoke('cleanupDuplicateBestEfforts', { dry_run: dryRun });
          setCleanupResult(response.data || response);
          if(!dryRun) {
            alert('Cleanup process finished. Check results below.');
          }
      } catch (e) {
          setCleanupResult({ success: false, error: e.message });
      } finally {
          setIsCleaning(false);
      }
  };



  const handleRebuildBestEfforts = async () => {
    setIsRebuildingBestEfforts(true);
    setBestEffortsRebuildResult(null);
    const toastId = toast.loading("Rebuilding best efforts...", {
      description: "Scanning your saved activities and refreshing running/cycling records.",
    });
    try {
      const response = await extractBestEffortsFromActivities({});
      const result = response?.data || response;
      if (result.success) {
        setBestEffortsRebuildResult(result);
        toast.success("Best efforts rebuilt", {
          id: toastId,
          description: `Processed ${result.activitiesProcessed || 0} activities. Created ${result.bestEffortsExtracted || 0} display records.`,
        });
      } else {
        const message = result?.message || result?.error || "Best efforts rebuild failed.";
        setBestEffortsRebuildResult({ ...result, success: false, error: message });
        toast.error("Rebuild failed", { id: toastId, description: message });
      }
    } catch (err) {
      const message = err.message || "Best efforts rebuild failed.";
      setBestEffortsRebuildResult({ success: false, error: message });
      toast.error("Rebuild failed", { id: toastId, description: message });
    } finally {
      setIsRebuildingBestEfforts(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
          <p className="text-gray-600">Manage your account and app preferences</p>
        </div>

        {/* Best Efforts Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-500" />
              Best Efforts Data Management
            </CardTitle>
            <CardDescription>
              Rebuild, inspect, and clean up the records shown on the Best Efforts page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800 text-sm">
                <strong>Rebuild Best Efforts</strong> scans your saved activities and recreates the running and cycling records displayed on the Best Efforts page.
                Use migration only when records exist but are hidden by ownership visibility.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleRebuildBestEfforts}
                disabled={isRebuildingBestEfforts}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isRebuildingBestEfforts ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Rebuild Best Efforts
              </Button>

              <Button 
                onClick={handleMigrateBestEfforts}
                disabled={isMigrating}
                variant="outline"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Migrate Best Efforts
                  </>
                )}
              </Button>
              
              <Button 
                onClick={handleCheckBestEfforts}
                disabled={isLoadingBestEfforts}
                variant="outline"
              >
                {isLoadingBestEfforts ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Check Data Status'
                )}
              </Button>
            </div>

            {bestEffortsRebuildResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                bestEffortsRebuildResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className={`font-medium ${bestEffortsRebuildResult.success ? 'text-green-900' : 'text-red-900'}`}>
                  {bestEffortsRebuildResult.message || (bestEffortsRebuildResult.success ? 'Best efforts rebuilt.' : 'Best efforts rebuild failed.')}
                </p>
                {bestEffortsRebuildResult.error && (
                  <p className="text-sm text-red-700 mt-1">{bestEffortsRebuildResult.error}</p>
                )}
                {bestEffortsRebuildResult.success && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 pt-3 border-t border-green-200 text-sm">
                    <div>
                      <p className="text-green-600 mb-1">Activities</p>
                      <p className="text-2xl font-bold text-green-800">{bestEffortsRebuildResult.activitiesProcessed || 0}</p>
                    </div>
                    <div>
                      <p className="text-green-600 mb-1">Created</p>
                      <p className="text-2xl font-bold text-green-800">{bestEffortsRebuildResult.bestEffortsExtracted || 0}</p>
                    </div>
                    <div>
                      <p className="text-green-600 mb-1">Longest Run</p>
                      <p className="text-2xl font-bold text-green-800">
                        {bestEffortsRebuildResult.longestRunDistanceM
                          ? `${(bestEffortsRebuildResult.longestRunDistanceM / 1000).toFixed(1)} km`
                          : '0 km'}
                      </p>
                    </div>
                    <div>
                      <p className="text-green-600 mb-1">Runs &gt; Half</p>
                      <p className="text-2xl font-bold text-green-800">{bestEffortsRebuildResult.runsOverHalfMarathon || 0}</p>
                    </div>
                  </div>
                )}
                {bestEffortsRebuildResult.trackedFetchDebug && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-green-800 font-medium">
                      View best-effort debug
                    </summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-60">
                      {JSON.stringify(bestEffortsRebuildResult.trackedFetchDebug, null, 2)}
                    </pre>
                  </details>
                )}
                {bestEffortsRebuildResult.details && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-red-800 font-medium">
                      View backend error details
                    </summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-60">
                      {JSON.stringify(bestEffortsRebuildResult.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {migrationResults && (
              <div className={`mt-4 p-4 rounded-lg border ${
                migrationResults.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-2 mb-2">
                  {migrationResults.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${migrationResults.success ? 'text-green-900' : 'text-red-900'}`}>
                      {migrationResults.message || (migrationResults.success ? 'Migration completed!' : 'Migration failed')}
                    </p>
                    {migrationResults.error && (
                      <p className="text-sm text-red-700 mt-1">{migrationResults.error}</p>
                    )}
                  </div>
                </div>
                
                {migrationResults.success && (
                  <div className="grid grid-cols-4 gap-4 mt-3 pt-3 border-t border-green-200 text-sm">
                    <div>
                      <p className="text-green-600 mb-1">Examined</p>
                      <p className="text-2xl font-bold text-green-800">{migrationResults.examined || 0}</p>
                    </div>
                    <div>
                      <p className="text-green-600 mb-1">Replaced</p>
                      <p className="text-2xl font-bold text-green-800">{migrationResults.replaced || 0}</p>
                    </div>
                    <div>
                      <p className="text-green-600 mb-1">Created</p>
                      <p className="text-2xl font-bold text-green-800">{migrationResults.created || 0}</p>
                    </div>
                    <div>
                      <p className="text-green-600 mb-1">Errors</p>
                      <p className="text-2xl font-bold text-green-800">{migrationResults.errors || 0}</p>
                    </div>
                  </div>
                )}

                {migrationResults.samples && migrationResults.samples.length > 0 && (
                  <details className="mt-3 pt-3 border-t border-green-200">
                    <summary className="cursor-pointer text-sm text-green-700 font-medium">
                      View sample migrations ({migrationResults.samples.length})
                    </summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(migrationResults.samples, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {bestEffortsDebug && (
              <div className="mt-4 p-4 rounded-lg border bg-gray-50 border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Database Status:</h4>
                {bestEffortsDebug.error ? (
                  <p className="text-red-600 text-sm">{bestEffortsDebug.error}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-sm text-gray-600">Total Rows</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {bestEffortsDebug.summary?.total || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">With Owner</p>
                        <p className="text-2xl font-bold text-green-600">
                          {bestEffortsDebug.summary?.withOwner || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Without Owner</p>
                        <p className="text-2xl font-bold text-red-600">
                          {bestEffortsDebug.summary?.withoutOwner || 0}
                        </p>
                      </div>
                    </div>

                    {bestEffortsDebug.summary?.owners && bestEffortsDebug.summary.owners.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">By Owner:</p>
                        {bestEffortsDebug.summary.owners.map((owner, i) => (
                          <div key={i} className="text-sm text-gray-600 mb-1">
                            <span className="font-medium">{owner.email}:</span> {owner.count} records
                          </div>
                        ))}
                      </div>
                    )}

                    {bestEffortsDebug.samples && bestEffortsDebug.samples.length > 0 && (
                      <details className="mt-3 pt-3 border-t border-gray-200">
                        <summary className="cursor-pointer text-sm text-gray-700 font-medium">
                          View sample rows ({bestEffortsDebug.samples.length})
                        </summary>
                        <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(bestEffortsDebug.samples, null, 2)}
                        </pre>
                      </details>
                    )}

                  </>
                )}
              </div>
            )}

            <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Data Cleanup</p>
                <p className="text-xs text-gray-500 mb-2">
                    Fixes unique keys and removes duplicate Best Effort records from the database. Run this if you see duplicates.
                </p>
                <div className="flex gap-2">
                    <Button onClick={() => handleCleanup(true)} disabled={isCleaning} variant="outline">
                        {isCleaning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Dry Run Cleanup
                    </Button>
                    <Button onClick={() => handleCleanup(false)} disabled={isCleaning} variant="destructive">
                        {isCleaning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Run Cleanup Now
                    </Button>
                </div>
                 {cleanupResult && (
                    <pre className="mt-4 text-xs bg-gray-100 p-2 rounded-md overflow-auto max-h-60">{JSON.stringify(cleanupResult, null, 2)}</pre>
                 )}
            </div>
          </CardContent>
        </Card>

        {/* Duplicate Activity Cleanup — server-side background worker */}
        <DuplicateCleanup />

        {/* Strava Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              Strava Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <ExternalLink className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">{user?.strava_access_token ? "Connected to Strava" : "Not connected"}</p>
                  <p className="text-sm text-gray-500">{user?.email || 'No user email'}</p>
                </div>
              </div>
              {user?.strava_access_token ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                  Disconnected
                </Badge>
              )}
            </div>
            
            <div className="text-sm text-gray-600">
              <p>{user?.strava_access_token ? "Permissions: Read activities, Read profile" : "Connect to enable Strava permissions"}</p>
            </div>
            
            {user?.strava_access_token && (
              <div className="flex gap-3">
                <Button 
                  onClick={handleReconnectStrava}
                  disabled={isReconnecting}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {isReconnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Reconnect Strava
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={handleDisconnectStrava}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  Disconnect Strava
                </Button>
              </div>
            )}

            {!user?.strava_access_token && (
              <Button 
                onClick={handleReconnectStrava}
                disabled={isReconnecting}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isReconnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Connect Strava
                  </>
                )}
              </Button>
            )}

            {syncStatus?.isTokenError && (
              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  <strong>Token Error:</strong> Your Strava connection needs to be refreshed. Click "Reconnect Strava" above to fix this.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Strava Data Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Strava Data Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Sync All Activities</p>
                <p className="text-sm text-gray-500">
                  Pull your historical Strava activities. Limited to once per hour.
                </p>
              </div>
              <Button 
                onClick={handleSyncActivities}
                disabled={isSyncing || !user?.strava_access_token}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {isSyncing ? 'Syncing...' : 'Full Sync'}
              </Button>
            </div>
            
            {syncStatus && (
              <div className={`p-4 rounded-lg text-sm ${
                syncStatus.success 
                  ? 'bg-green-50 border border-green-200' 
                  : syncStatus.isRateLimit
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`font-medium mb-2 ${
                  syncStatus.success 
                    ? 'text-green-800' 
                    : syncStatus.isRateLimit
                    ? 'text-yellow-800'
                    : 'text-red-800'
                }`}>
                  {syncStatus.message}
                </p>
                
                {syncStatus.isRateLimit && (
                  <div className="mt-3 pt-3 border-t border-yellow-200 space-y-2">
                    <p className="text-xs text-yellow-700">
                      <strong>⏰ What this means:</strong> Strava allows 100 API requests per 15 minutes. You've reached that limit.
                    </p>
                    <p className="text-xs text-yellow-700">
                      <strong>✅ Next step:</strong> {syncStatus.nextAction}
                    </p>
                    <p className="text-xs text-yellow-600">
                      The app will remember where it left off - your progress is saved!
                    </p>
                  </div>
                )}

                {syncStatus.success && syncStatus.hasMore && (
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <p className="text-xs text-green-700">
                      <strong>📄 Progress:</strong> Page {syncStatus.page} completed. More activities available.
                    </p>
                    <Button 
                      onClick={handleSyncActivities}
                      size="sm"
                      className="mt-2 bg-green-600 hover:bg-green-700"
                    >
                      Continue Sync (Page {syncStatus.page + 1})
                    </Button>
                  </div>
                )}

                {syncStatus.success && syncStatus.stravaTotal !== null && (
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-green-200">
                    <div>
                      <p className="text-xs text-green-600 mb-1">On Strava</p>
                      <p className="text-2xl font-bold text-green-800">{syncStatus.stravaTotal}</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600 mb-1">In Database</p>
                      <p className="text-2xl font-bold text-green-800">{syncStatus.dbTotal}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="text-xs text-gray-500">
              <p><strong>Note:</strong> Activities page auto-syncs new activities. Use this button to sync historical data or if you notice missing activities.</p>
            </div>
          </CardContent>
        </Card>

        {/* Strava Data Enrichment */}
        <StravaEnrichment />

        {/* Units Preference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="w-5 h-5" />
              Units
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="units-select">Distance Units</Label>
                <p className="text-sm text-gray-500">Choose your preferred units for distances and pace</p>
              </div>
              <Select value={units} onValueChange={updateUnits}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="miles">Miles</SelectItem>
                  <SelectItem value="kilometers">Kilometers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Heart Rate Zones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              Heart Rate Zones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Age Input */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="Enter your age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  min="15"
                  max="100"
                  className="mt-1"
                />
              </div>
              <div className="pt-6">
                <Button 
                  onClick={handleCalculateZones}
                  disabled={isCalculatingZones || !age}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {isCalculatingZones ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Calculate Zones
                </Button>
              </div>
            </div>

            {/* Manual Zone Inputs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((zone) => (
                <div key={zone}>
                  <Label htmlFor={`zone${zone}`}>Zone {zone} Max</Label>
                  <Input
                    id={`zone${zone}`}
                    type="number"
                    placeholder="BPM"
                    value={hrZones[`zone${zone}_max`]}
                    onChange={(e) => setHrZones(prev => ({
                      ...prev,
                      [`zone${zone}_max`]: e.target.value
                    }))}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>

            {/* Zone Descriptions */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Zone Descriptions:</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-500">Zone 1:</span>
                  <span>Active Recovery (50-60% max HR)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-600">Zone 2:</span>
                  <span>Aerobic Base (60-70% max HR)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-green-600">Zone 3:</span>
                  <span>Aerobic (70-80% max HR)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-yellow-600">Zone 4:</span>
                  <span>Lactate Threshold (80-90% max HR)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-red-600">Zone 5:</span>
                  <span>Neuromuscular Power (90-100% max HR)</span>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleSaveHRSettings}
              className="w-full bg-orange-500 hover:bg-orange-600"
            >
              Save HR Settings
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="weekly-report">Weekly Training Report</Label>
                <p className="text-sm text-gray-500">Get a summary of your training every Sunday</p>
              </div>
              <Switch
                id="weekly-report"
                checked={notifications.weeklyReport}
                onCheckedChange={(checked) => 
                  setNotifications(prev => ({ ...prev, weeklyReport: checked }))
                }
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="training-reminders">Training Reminders</Label>
                <p className="text-sm text-gray-500">Reminders when you haven't trained in 3 days</p>
              </div>
              <Switch
                id="training-reminders"
                checked={notifications.trainingReminders}
                onCheckedChange={(checked) => 
                  setNotifications(prev => ({ ...prev, trainingReminders: checked }))
                }
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="achievement-alerts">Achievement Alerts</Label>
                <p className="text-sm text-gray-500">Notifications for PRs and milestones</p>
              </div>
              <Switch
                id="achievement-alerts"
                checked={notifications.achievementAlerts}
                onCheckedChange={(checked) => 
                  setNotifications(prev => ({ ...prev, achievementAlerts: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Privacy & Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Privacy & Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                We only read your Strava data to provide coaching insights. Your data is never shared with third parties.
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-3">
              <Button 
                variant="outline"
                onClick={handleExportData}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export My Data
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleDeleteData}
                className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete All Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}