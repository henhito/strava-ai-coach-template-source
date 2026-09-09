import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/entities/User';

const UnitsContext = createContext();

export const useUnits = () => {
  const context = useContext(UnitsContext);
  if (!context) {
    throw new Error('useUnits must be used within a UnitsProvider');
  }
  return context;
};

export function UnitsProvider({ children }) {
  const [units, setUnits] = useState('miles'); // Default to miles
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUnits = async () => {
      try {
        const user = await User.me();
        setUnits(user.preferred_units || 'miles');
      } catch (error) {
        console.log('Could not load user units, using default');
        setUnits('miles');
      } finally {
        setIsLoading(false);
      }
    };

    loadUnits();
  }, []);

  const updateUnits = async (newUnits) => {
    try {
      await User.updateMyUserData({ preferred_units: newUnits });
      setUnits(newUnits);
    } catch (error) {
      console.error('Failed to update units preference:', error);
    }
  };

  const formatDistance = (meters) => {
    if (typeof meters !== 'number' || isNaN(meters)) return 'N/A';
    
    if (units === 'kilometers') {
      const km = meters / 1000;
      return `${km.toFixed(1)} km`;
    } else {
      const miles = meters * 0.000621371;
      return `${miles.toFixed(1)} mi`;
    }
  };

  const formatPace = (metersPerSecond) => {
    if (typeof metersPerSecond !== 'number' || isNaN(metersPerSecond) || metersPerSecond === 0) {
      return 'N/A';
    }

    if (units === 'kilometers') {
      // Convert to min/km and round total seconds to avoid displaying values like 3:60/km.
      const totalSeconds = Math.round(1000 / metersPerSecond);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
    } else {
      // Convert to min/mile and round total seconds to avoid displaying values like 6:60/mi.
      const totalSeconds = Math.round(1609.344 / metersPerSecond);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
    }
  };

  const formatElevation = (meters) => {
    if (typeof meters !== 'number' || isNaN(meters)) return 'N/A';
    if (units === 'kilometers') {
      return `${Math.round(meters).toLocaleString()} m`;
    }
    return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
  };

  const getDistanceUnit = () => {
    return units === 'kilometers' ? 'km' : 'mi';
  };

  const getPaceUnit = () => {
    return units === 'kilometers' ? '/km' : '/mi';
  };

  return (
    <UnitsContext.Provider value={{
      units,
      updateUnits,
      formatDistance,
      formatElevation,
      formatPace,
      getDistanceUnit,
      getPaceUnit,
      isLoading
    }}>
      {children}
    </UnitsContext.Provider>
  );
}