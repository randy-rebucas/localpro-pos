'use client';

import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'laptop' | 'desktop' | 'ipad';

interface DeviceInfo {
  type: DeviceType;
  isTouch: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isLaptop: boolean;
  isDesktop: boolean;
  isIpad: boolean;
  width: number;
  height: number;
}

export function useDeviceType(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    type: 'desktop',
    isTouch: false,
    isMobile: false,
    isTablet: false,
    isLaptop: false,
    isDesktop: false,
    isIpad: false,
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const detectDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      // Detect iPad specifically
      const userAgent = navigator.userAgent.toLowerCase();
      const isIpad = /ipad/.test(userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      let type: DeviceType = 'desktop';
      let isMobile = false;
      let isTablet = false;
      let isLaptop = false;
      let isDesktop = false;

      if (isIpad) {
        type = 'ipad';
        isTablet = true;
      } else if (width < 640) {
        // Mobile phones
        type = 'mobile';
        isMobile = true;
      } else if (width >= 640 && width < 1024) {
        // Tablets (non-iPad)
        type = 'tablet';
        isTablet = true;
      } else if (width >= 1024 && width < 1440) {
        // Laptops
        type = 'laptop';
        isLaptop = true;
      } else {
        // Desktop (large screens)
        type = 'desktop';
        isDesktop = true;
      }

      setDeviceInfo({
        type,
        isTouch,
        isMobile,
        isTablet,
        isLaptop,
        isDesktop,
        isIpad,
        width,
        height,
      });
    };

    // Initial detection
    detectDevice();

    // Listen for resize events
    window.addEventListener('resize', detectDevice);
    
    // Listen for orientation changes (important for tablets/iPads)
    window.addEventListener('orientationchange', detectDevice);

    return () => {
      window.removeEventListener('resize', detectDevice);
      window.removeEventListener('orientationchange', detectDevice);
    };
  }, []);

  return deviceInfo;
}
