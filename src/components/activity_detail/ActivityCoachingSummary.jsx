import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Loader2, RefreshCw } from 'lucide-react';

import { generateActivityComment } from '@/functions/generateActivityComment';
import { Activity } from '@/entities/Activity';

export default function ActivityCoachingSummary({ activity }) {
  const [summary, setSummary] = useState(activity.elite_coach_comment || '');
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(!!activity.elite_coach_comment);
  const [error, setError] = useState(null);

  const generateSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await generateActivityComment({ 
        activityId: activity.id
      });
      
      const data = response.data || response;
      
      if (data.error) {
        setError(data.error);
      } else if (data.success && data.comment) {
        setSummary(data.comment);
        setHasGenerated(true);
      }
    } catch (err) {
      console.error('Error generating coaching summary:', err);
      setError(err.message || 'Failed to generate summary');
    } finally {
      setIsLoading(false);
    }
  }, [activity.id]);

  // Auto-generate summary on component mount if not already present
  useEffect(() => {
    if (!hasGenerated && !isLoading) {
      generateSummary();
    }
  }, [generateSummary, hasGenerated, isLoading]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-orange-500" />
            Elite Coach Analysis
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generateSummary}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isLoading ? 'Analyzing...' : 'Refresh'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !hasGenerated ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Elite Coach is analyzing your performance...</span>
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-red-600 mb-3">{error}</p>
            <Button onClick={generateSummary} size="sm" variant="outline">
              Try Again
            </Button>
          </div>
        ) : summary ? (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="text-gray-800 leading-relaxed">{summary}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}