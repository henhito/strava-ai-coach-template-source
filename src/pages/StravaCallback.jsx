import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';

// New function to be created
import { exchangeStravaToken } from '@/functions/exchangeStravaToken';

export default function StravaCallbackPage() {
  const [status, setStatus] = useState('processing'); // 'processing', 'success', 'error'
  const [error, setError] = useState('');

  useEffect(() => {
    const exchange = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const scope = urlParams.get('scope');

      // Handle user denying access on Strava's page
      if (urlParams.get('error') === 'access_denied') {
        setError('You denied access on the Strava authorization page.');
        setStatus('error');
        setTimeout(() => {
          window.location.href = createPageUrl('Chat');
        }, 3000);
        return;
      }

      if (!code || !state) {
        setError('Missing required parameters from Strava redirect.');
        setStatus('error');
        return;
      }

      try {
        console.log('Attempting to exchange Strava code...');
        const response = await exchangeStravaToken({ code, state, scope });
        const data = response.data || response;

        if (data.ok) {
          console.log('Token exchange successful.');
          setStatus('success');
          // Redirect to chat page with success flag
          window.location.href = createPageUrl('Chat') + '?strava_connected=true';
        } else {
          throw new Error(data.error || 'Token exchange failed on the backend.');
        }
      } catch (err) {
        console.error('Error during token exchange:', err);
        setError(err.message);
        setStatus('error');
      }
    };

    exchange();
  }, []);

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md">
        {status === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 mx-auto text-orange-500 animate-spin" />
            <h1 className="mt-4 text-xl font-semibold text-gray-800">Finalizing Connection</h1>
            <p className="mt-2 text-gray-600">Please wait while we connect to your Strava account...</p>
          </>
        )}
        {status === 'success' && (
           <>
            <Loader2 className="w-12 h-12 mx-auto text-green-500 animate-spin" />
            <h1 className="mt-4 text-xl font-semibold text-gray-800">Success!</h1>
            <p className="mt-2 text-gray-600">Redirecting you back to the app...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
            <h1 className="mt-4 text-xl font-semibold text-red-800">Connection Failed</h1>
            <p className="mt-2 text-red-600">{error}</p>
            <p className="mt-2 text-sm text-gray-500">You will be redirected shortly.</p>
          </>
        )}
      </div>
    </div>
  );
}