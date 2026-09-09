import React from 'react';

export default function GarminAttribution({ size = 'small', className = '' }) {
  const sizeClasses = {
    tiny: 'h-3',
    small: 'h-4',
    medium: 'h-6',
    large: 'h-8'
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-xs text-gray-500">Powered by</span>
      <svg 
        className={sizeClasses[size]} 
        viewBox="0 0 120 30" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Garmin"
      >
        {/* Garmin logo - simplified representation */}
        <path 
          d="M15 5C8.925 5 4 9.925 4 16s4.925 11 11 11c2.9 0 5.55-1.125 7.525-2.975l-2.125-2.125C18.85 23.15 17 24 15 24c-4.4 0-8-3.6-8-8s3.6-8 8-8c2 0 3.85.85 5.4 2.1l2.125-2.125C20.55 6.125 17.9 5 15 5z" 
          fill="#007CC3"
        />
        <text 
          x="28" 
          y="20" 
          fontFamily="Arial, sans-serif" 
          fontSize="14" 
          fontWeight="bold" 
          fill="#007CC3"
        >
          GARMIN
        </text>
      </svg>
    </div>
  );
}