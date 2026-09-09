"use client";
import React, { useEffect, useRef } from 'react';
import Rellax from 'rellax';

export default function ParallaxBackground() {
  const wrapperRef = useRef(null);
  const rellaxInstanceRef = useRef(null);

  useEffect(() => {
    if (wrapperRef.current) {
      const elements = wrapperRef.current.querySelectorAll('.rellax');
      
      if (elements.length > 0 && !rellaxInstanceRef.current) {
        // Initialize Rellax, passing the NodeList directly
        rellaxInstanceRef.current = new Rellax(elements, {
          speed: -2,
          center: false,
          wrapper: null, // Let Rellax auto-detect scrollable parent
          round: true,
          vertical: true,
          horizontal: false,
        });
      }
    }

    // Cleanup function to destroy instance on unmount
    return () => {
      if (rellaxInstanceRef.current) {
        rellaxInstanceRef.current.destroy();
        rellaxInstanceRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount/unmount

  return (
    <div ref={wrapperRef} className="absolute inset-0 -z-10">
      <div
        className="rellax absolute bg-orange-100/20"
        data-rellax-speed="-7"
        style={{ top: '5%', left: '-10%', width: '40%', height: '80%', borderRadius: '50%' }}
      />
      <div
        className="rellax absolute bg-orange-100/30"
        data-rellax-speed="-6"
        style={{ top: '50%', left: '10%', width: '20%', height: '40%', borderRadius: '50%' }}
      />
      <div
        className="rellax absolute bg-gray-100/40"
        data-rellax-speed="-5"
        style={{ top: '20%', right: '-15%', width: '50%', height: '70%', borderRadius: '45%' }}
      />
      <div
        className="rellax absolute bg-orange-50/50"
        data-rellax-speed="-4"
        style={{ bottom: '5%', right: '5%', width: '30%', height: '30%', borderRadius: '60%' }}
      />
      <div
        className="rellax absolute bg-gray-200/20"
        data-rellax-speed="-3"
        style={{ top: '60%', right: '40%', width: '25%', height: '25%', borderRadius: '30%' }}
      />
      <div
        className="rellax absolute bg-orange-200/10"
        data-rellax-speed="-2"
        style={{ top: '30%', left: '30%', width: '45%', height: '45%', borderRadius: '50%' }}
      />
      <div
        className="rellax absolute bg-gray-50/70"
        data-rellax-speed="-1"
        style={{ bottom: '-10%', left: '-5%', width: '50%', height: '50%', borderRadius: '40%' }}
      />
    </div>
  );
}