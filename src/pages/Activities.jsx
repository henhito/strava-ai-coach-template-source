import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { User } from "@/entities/User";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, RefreshCw, Activity as ActivityIcon, Loader2 } from "lucide-react";

import ActivityCard from "../components/activities/ActivityCard";
import ActivityStats from "../components/activities/ActivityStats";

import { syncStravaActivities } from "@/functions/syncStravaActivities";
import { listActivities } from "@/functions/listActivities";
import { extractBestEffortsFromActivities } from "@/functions/extractBestEffortsFromActivities";

const PAGE_SIZE = 30;

export default function ActivitiesPage() {
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  
  // Pagination state
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [seenIds, setSeenIds] = useState(new Set());

  // Intersection Observer ref for infinite scroll
  const sentinelRef = useRef(null);
  const abortRef = useRef(null);

  // Load current user
  useEffect(() => {
    (async () => {
      try {
        const user = await User.me();
        setMe(user || null);
      } catch (e) {
        console.error("Failed to load current user:", e);
        setMe(null);
      }
    })();
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch page function
  const fetchPage = useCallback(async (currentOffset = 0, append = false) => {
    if (!me?.strava_athlete_id) {
      console.log('No athlete_id available yet');
      return;
    }

    try {
      if (!append) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      console.log('=== FETCHING ACTIVITIES ===');
      console.log('Offset:', currentOffset, 'Append:', append);
      console.log('Filters:', { q: debouncedSearch, type: typeFilter });

      // Call the function directly (Platform V2 style)
      const response = await listActivities({
        limit: PAGE_SIZE,
        offset: currentOffset,
        type: typeFilter,
        q: debouncedSearch,
        start_date_from: dateFrom || undefined,
        start_date_to: dateTo || undefined
      });

      const data = response?.data || response;
      
      if (data.error) {
        throw new Error(data.error);
      }

      const incoming = Array.isArray(data.items) ? data.items : [];

      console.log(`✅ Received ${incoming.length} activities`);

      if (append) {
        setItems(prev => {
          // Deduplicate incoming against ITSELF and PREVIOUS items
          const currentKeys = new Set(prev.map(a => String(a.strava_id ?? a.id)));
          const uniqueIncoming = [];
          
          for (const item of incoming) {
            const key = String(item.strava_id ?? item.id);
            // Only add if we haven't seen it in prev OR in the current incoming batch
            if (!currentKeys.has(key)) {
              currentKeys.add(key);
              uniqueIncoming.push(item);
            }
          }
          
          return [...prev, ...uniqueIncoming];
        });
        
        setSeenIds(prev => {
          const next = new Set(prev);
          incoming.forEach(a => next.add(String(a.strava_id ?? a.id)));
          return next;
        });
      } else {
        // Fresh load - Deduplicate incoming against ITSELF
        const uniqueIncoming = [];
        const newKeys = new Set();
        
        for (const item of incoming) {
          const key = String(item.strava_id ?? item.id);
          if (!newKeys.has(key)) {
            newKeys.add(key);
            uniqueIncoming.push(item);
          }
        }
        
        setItems(uniqueIncoming);
        setSeenIds(newKeys);
      }

      setHasMore(data.hasMore ?? false);
      setOffset(data.nextOffset ?? (currentOffset + PAGE_SIZE));

    } catch (err) {
      console.error("Error loading activities:", err);
      setError(`Failed to load activities: ${err.message || String(err)}`);
      if (!append) {
        setItems([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [me, debouncedSearch, typeFilter, dateFrom, dateTo, seenIds]);

  // Reset list when filters change
  useEffect(() => {
    if (me?.strava_athlete_id) {
      console.log('Filters changed, resetting list...');
      setItems([]);
      setOffset(0);
      setHasMore(true);
      setSeenIds(new Set());
      fetchPage(0, false);
    }
  }, [me, debouncedSearch, typeFilter, dateFrom, dateTo]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && offset !== null) {
      fetchPage(offset, true);
    }
  }, [offset, hasMore, isLoadingMore, fetchPage]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && !isLoadingMore) {
          handleLoadMore();
        }
      },
      { rootMargin: '300px 0px' } // Start loading 300px before reaching bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, handleLoadMore]);

  // Manual sync
  const handleRefresh = useCallback(async () => {
    try {
      setIsSyncing(true);
      setError(null);

      const response = await syncStravaActivities({ syncType: "refresh" });
      const data = response?.data || response || {};

      if (data.error) {
        if (data.isRateLimit || /rate limit|429/i.test(data.error)) {
          setError(data.error);
        } else {
          setError(`Sync failed: ${data.error}`);
        }
        // Reload from offset 0 after sync
        setOffset(0);
        await fetchPage(0, false);
        return;
      }

      // Reload from offset 0 after sync
      setOffset(0);
      await fetchPage(0, false);

      if (data.newActivities > 0) {
        console.log(`Sync completed: ${data.newActivities} new activities`);
         try {
          const extractResponse = await extractBestEffortsFromActivities({});
          const extractData = extractResponse?.data || extractResponse || {};
          if (extractData?.success) {
            console.log(`✅ Best efforts refreshed from ${extractData.activitiesProcessed || 0} activities`);
          } else {
            console.warn('⚠️ Best efforts refresh did not complete successfully:', extractData?.error || extractData);
          }
        } catch (extractError) {
          console.warn('⚠️ Failed to refresh best efforts after activity sync:', extractError);
        }
      } else {
        console.log("Sync: no new activities found");
      }
    } catch (err) {
      console.error("Refresh error:", err);
      if (
        err?.response?.data?.isRateLimit ||
        /rate limit|429/i.test(err?.message) ||
        err?.response?.status === 429
      ) {
        const msg =
          err?.response?.data?.error ||
          "🚫 Strava API Rate Limit: Please wait ~15 minutes and try again.";
        setError(msg);
      } else {
        setError(`Refresh failed: ${err.message || String(err)}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [fetchPage]);

  // Calculate stats from loaded items
  const stats = useMemo(() => {
    if (!items.length) return null;
    
    const totalDistance = items.reduce((sum, a) => sum + (a.distance_m || 0), 0);
    const totalTime = items.reduce((sum, a) => sum + (a.moving_time_s || 0), 0);
    const totalElevation = items.reduce((sum, a) => sum + (a.total_elevation_gain_m || 0), 0);
    const activitiesWithHR = items.filter(a => a.average_heartrate);
    const avgHeartRate = activitiesWithHR.length > 0
      ? Math.round(activitiesWithHR.reduce((sum, a) => sum + a.average_heartrate, 0) / activitiesWithHR.length)
      : 0;

    return { totalDistance, totalTime, totalElevation, avgHeartRate, count: items.length };
  }, [items]);

  // Error display
  const RateLimitPanel = ({ message }) => {
    const isRateLimit = /🚫 Strava API Rate Limit|rate limit|429/i.test(message || "");
    return (
      <Card className={`text-center p-12 ${isRateLimit ? "border-yellow-200 bg-yellow-50" : ""}`}>
        <ActivityIcon className={`w-16 h-16 mx-auto mb-4 ${isRateLimit ? "text-yellow-500" : "text-red-300"}`} />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {isRateLimit ? "🚫 Strava Rate Limit" : "Failed to Load Activities"}
        </h3>
        <p className="text-gray-600 mb-4 max-w-2xl mx-auto whitespace-pre-line">{message}</p>

        {isRateLimit ? (
          <div className="space-y-3">
            <div className="bg-white border border-yellow-300 rounded-lg p-4 max-w-xl mx-auto">
              <p className="text-sm text-gray-700 mb-2">
                <strong>What this means:</strong> Strava limits how many requests can be made in a short time window.
              </p>
              <p className="text-sm text-gray-600">
                <strong>What to do:</strong> Wait about 15 minutes, then try syncing again. Your existing activities are still visible below.
              </p>
            </div>
            <Button onClick={() => setError(null)} variant="outline">
              View Existing Activities
            </Button>
          </div>
        ) : (
          <Button onClick={() => fetchPage(0, false)} className="bg-orange-500 hover:bg-orange-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        )}
      </Card>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
        <div className="max-w-7xl mx-auto">
          <RateLimitPanel message={error} />
          {/rate limit|429/i.test(error) && items.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                Your Activities ({items.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((activity) => (
                  <ActivityCard
                    key={activity.strava_id ?? activity.id}
                    activity={activity}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Activities</h1>
            <p className="text-gray-600">
              {items.length > 0 ? `Showing ${items.length} activities` : 'View your training activities'}
              {hasMore && <span className="text-gray-400 ml-2">• Scroll for more</span>}
              {isSyncing && <span className="text-orange-600 ml-2">• Syncing latest activities…</span>}
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline" disabled={isSyncing || isLoading}>
            {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isSyncing ? "Syncing…" : "Sync New"}
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <ActivityStats activities={items} />
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search activities… (debounced)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter} disabled={isLoading}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Run">Running</SelectItem>
                  <SelectItem value="Cycling">All Cycling</SelectItem>
                  <SelectItem value="Ride">Ride</SelectItem>
                  <SelectItem value="VirtualRide">Virtual Ride</SelectItem>
                  <SelectItem value="GravelRide">Gravel Ride</SelectItem>
                  <SelectItem value="MountainBikeRide">Mountain Bike</SelectItem>
                  <SelectItem value="EBikeRide">E-Bike</SelectItem>
                  <SelectItem value="Swim">Swimming</SelectItem>
                  <SelectItem value="Walk">Walk</SelectItem>
                  <SelectItem value="Hike">Hike</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 whitespace-nowrap">From</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={isLoading}
                  className="w-40"
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={isLoading}
                  className="w-40"
                />
                {(dateFrom || dateTo || typeFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setTypeFilter("all"); setDateFrom(""); setDateTo(""); }}
                    disabled={isLoading}
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Filter className="w-4 h-4" />
                {items.length} loaded
                {hasMore && <span className="text-orange-500">• more available</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading && items.length === 0 ? (
            <Card className="col-span-full text-center p-12">
              <RefreshCw className="w-16 h-16 text-gray-300 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Activities…</h3>
              <p className="text-gray-500">Fetching your workouts</p>
            </Card>
          ) : (
            items.map((activity) => (
              <ActivityCard
                key={activity.strava_id ?? activity.id}
                activity={activity}
              />
            ))
          )}

          {/* Loading skeletons while fetching more */}
          {isLoadingMore && (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={`skeleton-${i}`} className="p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="h-24 bg-gray-100 rounded mt-4" />
              </Card>
            ))
          )}
        </div>

        {/* Intersection Observer Sentinel */}
        {hasMore && !isLoading && <div ref={sentinelRef} className="h-20" />}

        {/* Manual Load More Button (fallback) */}
        {hasMore && !isLoading && items.length > 0 && (
          <div className="mt-8 text-center">
            <Button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              variant="outline"
              className="px-8"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading more...
                </>
              ) : (
                <>
                  Load More Activities
                </>
              )}
            </Button>
          </div>
        )}

        {/* End State */}
        {!hasMore && !isLoading && items.length > 0 && (
          <div className="text-center text-sm text-gray-500 py-6">
            ✅ You've reached the end. All activities loaded.
          </div>
        )}

        {/* Empty State */}
        {items.length === 0 && !isLoading && (
          <Card className="text-center p-12">
            <ActivityIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No activities found</h3>
            <p className="text-gray-500 mb-4">
              {me?.strava_athlete_id
                ? "Try adjusting your search or filters, or sync your activities from Strava"
                : "Go to Settings to sync your activities from Strava"}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}