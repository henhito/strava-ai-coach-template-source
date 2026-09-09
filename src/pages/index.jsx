import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to Chat page on load
    navigate(createPageUrl("Chat"), { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-2xl">⚡</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Strava Coach</h1>
        <p className="text-gray-600">Redirecting to chat...</p>
      </div>
    </div>
  );
}