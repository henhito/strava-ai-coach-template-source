import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink, Shield, Activity, Loader2, AlertTriangle } from "lucide-react";

export default function StravaConnect({
  onConnect,
  isConnecting = false,
  isFunctionsAvailable = true,
}) {
  // Prevent rapid double-clicks locally; parent still controls isConnecting
  const [clicked, setClicked] = useState(false);

  const handleClick = async () => {
    if (clicked || isConnecting) return;
    setClicked(true);
    try {
      await onConnect?.();
    } finally {
      // Re-enable after a short delay; OAuth flow will navigate away anyway
      setTimeout(() => setClicked(false), 1500);
    }
  };

  // Do NOT block when functions appear unavailable — that flag can be a false negative during deploys
  const disabled = isConnecting || clicked;

  return (
    <Card className="p-6 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto">
          <Activity className="w-8 h-8 text-white" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Connect your Strava account
          </h3>
          <p className="text-gray-600 text-sm">
            Get personalized training insights and coaching recommendations
          </p>
        </div>

        {!isFunctionsAvailable && (
          <div className="flex items-center justify-center gap-2 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Backend functions may be deploying. You can still try to connect.</span>
          </div>
        )}

        <Button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={`text-white px-6 py-2 flex items-center gap-2 mx-auto ${
            disabled ? "bg-gray-300 hover:bg-gray-300 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
          }`}
          aria-busy={isConnecting}
        >
          {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          {isConnecting ? "Redirecting..." : "Connect Strava"}
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <Shield className="w-4 h-4" />
          <span>We only read your Strava data to answer your questions. You can disconnect anytime.</span>
        </div>
      </div>
    </Card>
  );
}