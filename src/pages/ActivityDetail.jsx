import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { createPageUrl } from '@/utils';
import { Activity } from '@/entities/Activity';

import ActivityDetailMap from '../components/activity_detail/ActivityDetailMap';
import ActivityDetailCharts from '../components/activity_detail/ActivityDetailCharts';
import ActivityDetailSplits from '../components/activity_detail/ActivityDetailSplits';
import ActivityDetailSummary from '../components/activity_detail/ActivityDetailSummary';
import ActivityCoachingSummary from '../components/activity_detail/ActivityCoachingSummary';
import ActivityDistanceBestEfforts from '../components/activity_detail/ActivityDistanceBestEfforts';
import ActivityNoteEditor from '../components/activity_detail/ActivityNoteEditor';

import { getStravaActivityDetails } from '@/functions/getStravaActivityDetails';
import { analyzeActivity } from '@/functions/analyzeActivity';

export default function ActivityDetailPage() {
  const location = useLocation();
  const [activityId, setActivityId] = useState(null);
  const [activity, setActivity] = useState(null);
  const [streams, setStreams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      setActivityId(id);
    } else {
      setError('No activity ID provided.');
      setIsLoading(false);
    }
  }, [location.search]);

  useEffect(() => {
    if (!activityId) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('Loading activity with ID:', activityId);
        
        let dbActivity = null;
        
        // Try to load by database ID first
        try {
          dbActivity = await Activity.get(activityId);
          console.log('✅ Found activity by database ID');
        } catch (err) {
          console.log('❌ Not found by database ID, trying Strava ID...');
          
          // Fallback: Try to find by Strava ID
          const activities = await Activity.filter({ strava_id: parseInt(activityId) });
          
          if (activities && activities.length > 0) {
            dbActivity = activities[0];
            console.log('✅ Found activity by Strava ID');
            
            // Update URL to use the correct database ID (optional, improves future loads)
            const newUrl = `${window.location.pathname}?id=${dbActivity.id}`;
            window.history.replaceState({}, '', newUrl);
          } else {
            throw new Error('Activity not found by database ID or Strava ID');
          }
        }
        
        if (!dbActivity) {
          throw new Error('Activity not found in database');
        }
        
        console.log('Loaded activity from database:', dbActivity);

        // Transform the database activity format
        const transformedActivity = {
          ...dbActivity.raw_data,
          id: dbActivity.id,
          strava_id: dbActivity.strava_id,
          updated_date: dbActivity.updated_date,
          name: dbActivity.name,
          type: dbActivity.type,
          start_date: dbActivity.start_date,
          start_date_local: dbActivity.start_date,
          distance: dbActivity.distance_m,
          moving_time: dbActivity.moving_time_s,
          elapsed_time: dbActivity.elapsed_time_s,
          total_elevation_gain: dbActivity.total_elevation_gain_m,
          average_speed: dbActivity.average_speed_mps,
          max_speed: dbActivity.max_speed_mps,
          average_heartrate: dbActivity.average_heartrate,
          max_heartrate: dbActivity.max_heartrate,
          suffer_score: dbActivity.suffer_score,
          kudos_count: dbActivity.kudos_count,
          average_cadence: dbActivity.average_cadence,
          max_cadence: dbActivity.max_cadence,
          average_watts: dbActivity.average_watts,
          max_watts: dbActivity.max_watts,
          average_temp: dbActivity.average_temp,
          source_device_brand: dbActivity.source_device_brand,
          athlete_note: dbActivity.athlete_note,
          elite_coach_comment: dbActivity.elite_coach_comment
        };
        
        setActivity(transformedActivity);
        
        // Try to get streams data from Strava for charts (optional)
        try {
          if (dbActivity.strava_id) {
            console.log('Fetching streams for Strava ID:', dbActivity.strava_id);
            const streamsResponse = await getStravaActivityDetails({ 
              activityId: dbActivity.strava_id 
            });
            const streamsData = streamsResponse.data || streamsResponse;
            
            if (streamsData.isRateLimit) {
              console.warn('Strava rate limit hit, continuing without streams');
              setStreams([]);
            } else if (streamsData.streamsUnavailable) {
              console.warn('Streams unavailable for this activity:', streamsData.streamsError);
              setStreams([]);
            } else if (streamsData.streams) {
              setStreams(streamsData.streams);
              console.log('Loaded streams data');
            } else {
              setStreams([]);
            }
          } else {
            console.log('No Strava ID found for activity, skipping streams fetch.');
            setStreams([]);
          }
        } catch (streamsError) {
          console.warn('Could not load streams data:', streamsError);
          
          if (streamsError.message?.includes('rate limit') || 
              streamsError.response?.data?.isRateLimit || 
              streamsError.response?.status === 429) {
            console.warn('Strava rate limit hit during streams fetch, continuing without streams');
            setError('🚫 Strava API Rate Limit exceeded. Charts and maps unavailable temporarily.');
          } else {
            console.error('Error fetching Strava streams:', streamsError);
          }
          
          setStreams([]);
        }
        
      } catch (err) {
        console.error('Error loading activity:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activityId]);

  const handleAnalyzeActivity = async () => {
      if (!activity?.id) return;
      setIsAnalyzing(true);
      try {
          const response = await analyzeActivity({ activityId: activity.id });
          const data = response?.data || response;
          setAnalysis(data);
      } catch (err) {
          console.error("Analysis error:", err);
          // Optionally set an error state for analysis
      } finally {
          setIsAnalyzing(false);
      }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
        <p className="mt-4 text-gray-600">Loading activity details...</p>
      </div>
    );
  }

  if (error) {
    const isRateLimitError = error.includes('rate limit') || error.includes('🚫 Strava API Rate Limit');
    
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <AlertCircle className={`w-12 h-12 ${isRateLimitError ? 'text-yellow-500' : 'text-red-500'}`} />
        <p className={`mt-4 ${isRateLimitError ? 'text-yellow-700' : 'text-red-700'} max-w-md text-center`}>
          {isRateLimitError ? (
            <>
              {error}
              <br /><br />
              <span className="text-sm text-gray-600">
                You can still view your activity's basic details, but charts and maps require fresh data from Strava. Please try again later.
              </span>
            </>
          ) : (
            `Error: ${error}`
          )}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={createPageUrl('Activities')}>Go Back to Activities</Link>
        </Button>
      </div>
    );
  }
  
  if (!activity) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
            <Button asChild variant="outline" size="icon">
                <Link to={createPageUrl('Activities')}>
                    <ArrowLeft className="w-4 h-4" />
                </Link>
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{activity.name}</h1>
        </div>

        <ActivityDetailSummary activity={activity} />

        <ActivityNoteEditor activityId={activity.id} initialNote={activity.athlete_note} />

        {['Run', 'TrailRun', 'VirtualRun'].includes(activity.type) && (
          <ActivityDistanceBestEfforts activity={activity} />
        )}

        {streams.length > 0 && (
          <>
            <ActivityDetailMap activity={activity} streams={streams} />
            <ActivityDetailCharts streams={streams} activity={activity} />
            <ActivityDetailSplits streams={streams} activity={activity} />
          </>
        )}

        {streams.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <p className="text-yellow-800">
              📊 Advanced charts and maps are not available right now. 
              This could be due to Strava's rate limits or an issue with retrieving activity streams. 
              The activity summary above shows all the key details from your database.
            </p>
            <p className="text-sm text-yellow-600 mt-2">
              If it's a rate limit issue, please wait 15 minutes and refresh the page to load charts and maps.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ActivityCoachingSummary activity={activity} />
            <Card>
                <CardHeader>
                    <CardTitle>Performance Analysis</CardTitle>
                    <CardDescription>Compare this activity against your historical performance.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isAnalyzing ? (
                        <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Analyzing performance...</span>
                        </div>
                    ) : analysis ? (
                        <div className="text-sm space-y-2">
                            <p><strong>Fitness Trend:</strong> {analysis.coach_interpretation?.fitness_trend}</p>
                            <p><strong>Primary Factor:</strong> {analysis.coach_interpretation?.primary_factor}</p>
                            <p><strong>Summary:</strong> {analysis.elite_coach_summary}</p>
                        </div>
                    ) : (
                        <Button onClick={handleAnalyzeActivity} disabled={isAnalyzing}>
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Analyze Activity
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}