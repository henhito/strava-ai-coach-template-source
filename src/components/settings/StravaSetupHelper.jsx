
import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Info } from "lucide-react";

export default function StravaSetupHelper() {
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState(null); // {ok: boolean, message: string}
  const [checking, setChecking] = useState(false);

  const origin = useMemo(() => {
    try { return window.location.origin; } catch { return ""; }
  }, []);

  // Show ONLY the correct, active callback URL
  const callbackUrl = useMemo(() => origin ? `${origin}/functions/stravaOauthCallback` : `/functions/stravaOauthCallback`, [origin]);

  const redirectUri = callbackUrl; // default
  const oauthUrl = useMemo(() => {
    const id = clientId?.trim() || "YOUR_CLIENT_ID";
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: "code",
      approval_prompt: "force",
      scope: "read,activity:read_all",
      state: "TEST_STATE"
    });
    return `https://www.strava.com/oauth/authorize?${params.toString()}`;
  }, [clientId, redirectUri]);

  const copy = async (text) => {
    await navigator.clipboard.writeText(text);
    setStatus({ ok: true, message: "Copied to clipboard" });
    setTimeout(() => setStatus(null), 2000);
  };

  const checkFunctions = async () => {
    setChecking(true);
    setStatus(null);
    try {
      // Use SDK imports to test
      const { checkStravaConnection } = await import("@/functions/checkStravaConnection");
      const { getStravaAuthUrl } = await import("@/functions/getStravaAuthUrl");
      
      await checkStravaConnection();
      const res2 = await getStravaAuthUrl();
      const data2 = res2?.data || res2;
      if (!data2?.authUrl) {
        setStatus({ ok: false, message: "No authentication URL returned. Ensure STRAVA_CLIENT_ID and optionally STRAVA_REDIRECT_URI are set." });
      } else {
        setStatus({ ok: true, message: "Backend functions are working correctly!" });
      }
    } catch (err) {
      const statusCode = err?.response?.status || err?.status;
      if (statusCode === 401) setStatus({ ok: false, message: "You must be logged in to test functions. Please log in and try again." });
      else if (statusCode === 404) setStatus({ ok: false, message: "Backend functions are not deployed/enabled. Enable in Dashboard → Settings." });
      else if (statusCode === 500) setStatus({ ok: false, message: "Functions reachable but returned 500. Check STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Settings → Environment Variables." });
      else setStatus({ ok: false, message: "Error reaching backend functions: " + (err.message || "unknown") });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ExternalLink className="w-4 h-4 text-orange-600" />
        <h3 className="font-semibold text-gray-900">Strava Setup Helper</h3>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Current Environment Variables:</p>
            <p>✅ STRAVA_CLIENT_ID - Set</p>
            <p>✅ STRAVA_CLIENT_SECRET - Set</p>
            <p>❓ STRAVA_REDIRECT_URI - Optional (will auto-compute if not set)</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div>
          <Label>Your Callback URL (use this in your Strava app)</Label>
          <div className="grid gap-2 mt-1">
            <div className="flex gap-2">
              <Input readOnly value={callbackUrl} className="bg-gray-50" />
              <Button variant="outline" onClick={() => copy(callbackUrl)}>Copy</Button>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="client-id">Test with your Client ID</Label>
          <Input id="client-id" placeholder="Enter your Strava Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1" />
        </div>

        <div>
          <Label>OAuth URL Preview</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={oauthUrl} className="bg-gray-50" />
            <Button variant="outline" onClick={() => copy(oauthUrl)}>Copy</Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={checkFunctions} disabled={checking} className="bg-orange-500 hover:bg-orange-600">
          {checking ? "Checking..." : "Test Backend Functions"}
        </Button>
        {status && (
          <div className={`flex items-center gap-2 text-sm ${status.ok ? "text-green-700" : "text-yellow-800"}`}>
            {status.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{status.message}</span>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600">
        <p className="font-medium mb-1">Setup Steps:</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Copy the callback URL shown above.</li>
          <li>Go to your Strava App settings.</li>
          <li>Paste the URL into the "Authorization Callback Domain" field, replacing anything that's there.</li>
          <li>Click "Save" on the Strava page.</li>
          <li>Return to the Chat page and try connecting.</li>
        </ol>
      </div>
    </Card>
  );
}
