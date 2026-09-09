import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, CheckCircle, AlertTriangle, StopCircle, RotateCcw, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function StatusBadge({ status }) {
  if (!status) return null;
  const map = {
    idle:      { label: "Idle",      className: "bg-gray-100 text-gray-700" },
    scanning:  { label: "Scanning…", className: "bg-blue-100 text-blue-700" },
    deleting:  { label: "Deleting…", className: "bg-orange-100 text-orange-700" },
    completed: { label: "Complete",  className: "bg-green-100 text-green-700" },
    error:     { label: "Error",     className: "bg-red-100 text-red-700" },
    stopped:   { label: "Stopped",   className: "bg-yellow-100 text-yellow-700" },
  };
  const { label, className } = map[status] || { label: status, className: "bg-gray-100 text-gray-700" };
  return <Badge className={className}>{label}</Badge>;
}

export default function DuplicateCleanup() {
  const [job, setJob] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState(null);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const stopRequestedRef = useRef(false);

  // Load status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("runDuplicateCleanupWorker", { action: "status" });
        const data = res?.data || res;
        if (data?.job) setJob(data.job);
      } catch { /* silent */ }
    })();
  }, []);

  // The main loop: call start repeatedly until done or stopped
  const runLoop = async () => {
    stopRequestedRef.current = false;
    setIsRunning(true);
    setError(null);

    try {
      while (true) {
        if (stopRequestedRef.current) break;

        const res = await base44.functions.invoke("runDuplicateCleanupWorker", { action: "start" });
        const data = res?.data || res;

        // Check again after awaiting — reset may have been triggered during the request
        if (stopRequestedRef.current) break;

        if (data?.error && data.error !== 'A cleanup job is already running.') {
          setError(data.error);
          break;
        }

        if (data?.job) setJob(data.job);

        // Stop if complete, error, or no more work
        if (!data?.hasMore || data?.job?.status === 'completed' || data?.job?.status === 'error') {
          break;
        }

        // Brief pause between batches
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Cleanup failed.");
    } finally {
      setIsRunning(false);
      // Refresh final status
      try {
        const res = await base44.functions.invoke("runDuplicateCleanupWorker", { action: "status" });
        const data = res?.data || res;
        if (data?.job) setJob(data.job);
      } catch { /* silent */ }
    }
  };

  const handleReset = async () => {
    stopRequestedRef.current = true;
    setIsRunning(false);
    setIsStopping(false);
    setError(null);
    try {
      await base44.functions.invoke("runDuplicateCleanupWorker", { action: "reset" });
      setJob(null); // clear job state — fresh start
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to reset job.");
    }
  };

  const handleDryRun = async () => {
    setIsDryRunning(true);
    setError(null);
    setDryRunResult(null);
    try {
      const res = await base44.functions.invoke("runDuplicateCleanupWorker", { action: "dryrun" });
      const data = res?.data || res;
      setDryRunResult(data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Dry run failed.");
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleStop = async () => {
    stopRequestedRef.current = true;
    setIsStopping(true);
    try {
      const res = await base44.functions.invoke("runDuplicateCleanupWorker", { action: "stop" });
      const data = res?.data || res;
      if (data?.job) setJob(data.job);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to stop cleanup.");
    } finally {
      setIsStopping(false);
      setIsRunning(false);
    }
  };

  const progress = job?.total_duplicates > 0
    ? Math.round((job.deleted_count / job.total_duplicates) * 100)
    : 0;

  const formatTime = (iso) => iso ? new Date(iso).toLocaleString() : "—";
  const isStopped = !job || job?.status === 'stopped' || job?.status === 'idle';
  const isComplete = job?.status === 'completed';
  const isError = job?.status === 'error';
  const isStuck = job?.status === 'deleting' || job?.status === 'scanning';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-orange-500" />
          Remove Duplicate Activities
        </CardTitle>
        <CardDescription>
          Scans your database and removes all duplicate activity rows. Runs in small batches to avoid timeouts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Buttons */}
        <div className="flex gap-2 flex-wrap">
          {!isRunning && (
            <Button
              variant="outline"
              onClick={handleDryRun}
              disabled={isDryRunning}
            >
              {isDryRunning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning…</>
              ) : (
                <><Search className="w-4 h-4 mr-2" />Dry Run (Scan Only)</>
              )}
            </Button>
          )}
          {!isRunning && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-orange-500 hover:bg-orange-600">
                  {isStopped ? (
                    <><RotateCcw className="w-4 h-4 mr-2" />Resume Cleanup</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" />Start Cleanup</>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isStopped ? "Resume duplicate activity cleanup?" : "Start duplicate activity cleanup?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will scan your database, find all duplicate activity rows, and delete them in small batches.
                    One row per activity is kept (the most complete record). Keep this page open while it runs.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={runLoop}>
                    {isStopped ? "Yes, Resume" : "Yes, Start Cleanup"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isRunning && (
            <>
              <Button className="bg-orange-500 hover:bg-orange-600" disabled>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…
              </Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={isStopping}
                onClick={handleStop}
              >
                {isStopping ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Stopping…</>
                ) : (
                  <><StopCircle className="w-4 h-4 mr-2" />Stop</>
                )}
              </Button>
              <Button
                variant="outline"
                className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4 mr-2" />Force Reset
              </Button>
            </>
          )}
        </div>

        {isStuck && !isRunning && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between gap-2">
            <p className="text-sm text-yellow-800">Job appears stuck. Reset it to start fresh.</p>
            <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700 hover:bg-yellow-100" onClick={handleReset}>
              <RotateCcw className="w-3 h-3 mr-1" />Force Reset
            </Button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {dryRunResult && (
          <div className={`p-4 rounded-lg border space-y-1 ${
            dryRunResult.duplicateCount > 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"
          }`}>
            <div className="flex items-center gap-2">
              {dryRunResult.duplicateCount > 0
                ? <AlertTriangle className="w-4 h-4 text-orange-600" />
                : <CheckCircle className="w-4 h-4 text-green-600" />}
              <span className="font-medium text-sm">
                {dryRunResult.duplicateCount > 0
                  ? `Found ${dryRunResult.duplicateCount} duplicate rows out of ${dryRunResult.totalRows} total activities.`
                  : `No duplicates found across ${dryRunResult.totalRows} activities. Database is clean!`}
              </span>
            </div>
          </div>
        )}

        {/* Job status card */}
        {job && (
          <div className={`p-4 rounded-lg border space-y-3 ${
            isComplete  ? "bg-green-50 border-green-200" :
            isError     ? "bg-red-50 border-red-200" :
            isStopped   ? "bg-yellow-50 border-yellow-200" :
            "bg-blue-50 border-blue-200"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isComplete && <CheckCircle className="w-4 h-4 text-green-600" />}
                {isError    && <AlertTriangle className="w-4 h-4 text-red-600" />}
                {isRunning  && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                <span className="font-medium text-sm">
                  {job.status === "scanning"  && "Scanning database for duplicates…"}
                  {job.status === "deleting"  && `Deleting… ${job.deleted_count} / ${job.total_duplicates}`}
                  {isComplete                 && `Done! Deleted ${job.deleted_count} duplicate rows.`}
                  {isError                    && "Cleanup encountered an error."}
                  {isStopped                  && `Stopped at ${job.deleted_count} / ${job.total_duplicates}. Click Resume to continue.`}
                </span>
              </div>
              <StatusBadge status={job.status} />
            </div>

            {(job.status === "deleting" || isComplete) && job.total_duplicates > 0 && (
              <div className="space-y-1">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-gray-500 text-right">{progress}%</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-sm pt-1">
              <div>
                <p className="text-gray-500 text-xs">Total Duplicates</p>
                <p className="font-bold text-lg">{job.total_duplicates ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Deleted</p>
                <p className="font-bold text-lg">{job.deleted_count ?? 0}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Remaining</p>
                <p className="font-bold text-lg">{Math.max(0, (job.total_duplicates ?? 0) - (job.deleted_count ?? 0))}</p>
              </div>
            </div>

            {job.error_message && (
              <p className="text-sm text-red-700">{job.error_message}</p>
            )}

            <div className="text-xs text-gray-400 pt-1 border-t border-gray-200 flex justify-between">
              <span>Started: {formatTime(job.started_at)}</span>
              {job.completed_at && <span>Finished: {formatTime(job.completed_at)}</span>}
            </div>
          </div>
        )}

        {isRunning && (
          <p className="text-xs text-gray-500">
            ✓ Deleting in small batches — keep this page open. Progress updates after each batch.
          </p>
        )}
      </CardContent>
    </Card>
  );
}