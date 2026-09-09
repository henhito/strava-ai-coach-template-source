import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, DatabaseZap, CheckCircle, Clock, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, formatDistanceToNow } from 'date-fns';

const fetchEnrichmentState = async () => {
    const states = await base44.entities.StravaEnrichmentState.list();
    if (states && states.length > 0) {
        return states[0];
    }
    // If no state exists, create a default one to show on the UI
    return {
        status: 'idle',
        processed_count: 0,
        total_activities_to_process: 0,
    };
};

const runEnrichment = async () => {
    const response = await base44.functions.invoke('enrichActivitiesWithStravaData');
    return response.data || response;
};

const STATUS_CONFIG = {
    idle: { color: 'bg-gray-500', text: 'Idle' },
    running: { color: 'bg-blue-500 animate-pulse', text: 'Running' },
    paused: { color: 'bg-yellow-500', text: 'Paused (Rate-limited)' },
    completed: { color: 'bg-green-500', text: 'Completed' },
    error: { color: 'bg-red-500', text: 'Error' },
};

export default function StravaEnrichment() {
    const queryClient = useQueryClient();

    const { data: state, isLoading: isLoadingState, error: stateError } = useQuery({
        queryKey: ['stravaEnrichmentState'],
        queryFn: fetchEnrichmentState,
        refetchInterval: (data) => (data?.state?.status === 'running' ? 5000 : false),
    });

    const enrichmentMutation = useMutation({
        mutationFn: runEnrichment,
        onSuccess: () => {
            // Invalidate to refetch the latest state after the run is complete
            queryClient.invalidateQueries({ queryKey: ['stravaEnrichmentState'] });
        },
    });

    const handleEnrichment = () => {
        enrichmentMutation.mutate();
    };

    const progress = state?.total_activities_to_process > 0
        ? (state.processed_count / state.total_activities_to_process) * 100
        : 0;

    const statusInfo = STATUS_CONFIG[state?.status] || STATUS_CONFIG.idle;

    const canRun = state?.status === 'idle' || state?.status === 'paused';
    const isDisabled = enrichmentMutation.isPending || state?.status === 'running' || (state?.status === 'paused' && state.next_allowed_run_at && new Date(state.next_allowed_run_at) > new Date());

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <DatabaseZap className="w-5 h-5 text-orange-500" />
                    Strava Data Enrichment
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                    Incrementally enrich your activities with detailed Strava data like PBs and splits.
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <Info className="w-4 h-4 text-gray-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>This process fetches full details for each activity to enable advanced analysis. <br/> It runs in small batches to respect Strava's API rate limits.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoadingState ? (
                    <div className="flex items-center justify-center h-24">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : stateError ? (
                    <Alert variant="destructive">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>Could not load enrichment status: {stateError.message}</AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">Status:</span>
                                <Badge className={`${statusInfo.color} hover:${statusInfo.color}`}>{statusInfo.text}</Badge>
                            </div>
                            <span className="text-sm text-gray-600 font-medium">
                                {state.processed_count} / {state.total_activities_to_process || ' ?'} Enriched
                            </span>
                        </div>
                        <Progress value={progress} />

                        <div className="text-xs text-gray-500 grid grid-cols-2 gap-4">
                            <div>
                                <p><strong>Last Run:</strong> {state.last_run_at ? formatDistanceToNow(new Date(state.last_run_at), { addSuffix: true }) : 'Never'}</p>
                            </div>
                            <div>
                                <p><strong>Next Allowed Run:</strong> {state.next_allowed_run_at && new Date(state.next_allowed_run_at) > new Date() ? format(new Date(state.next_allowed_run_at), 'p') : 'Now'}</p>
                            </div>
                        </div>

                        {enrichmentMutation.error && (
                            <Alert variant="destructive">
                                <AlertDescription>{enrichmentMutation.error.message}</AlertDescription>
                            </Alert>
                        )}

                        <Button onClick={handleEnrichment} disabled={isDisabled} className="w-full">
                            {enrichmentMutation.isPending || state?.status === 'running' ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <DatabaseZap className="w-4 h-4 mr-2" />
                            )}
                            {state?.status === 'running' ? 'Enrichment in Progress...' : 'Start / Resume Enrichment'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}