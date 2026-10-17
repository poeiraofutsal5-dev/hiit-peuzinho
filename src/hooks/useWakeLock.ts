import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Screen Wake Lock API hook with iOS WebKit Video Keep-Awake fallback.
 * Prevents mobile devices (especially iPhone Chrome & Safari) from dimming
 * or turning off the screen during active workouts.
 */
export function useWakeLock(isActive: boolean) {
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const videoFallbackRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  const startVideoFallback = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!videoFallbackRef.current) {
      const video = document.createElement('video');
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.loop = true;
      video.style.position = 'fixed';
      video.style.opacity = '0.001';
      video.style.pointerEvents = 'none';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.zIndex = '-999';

      // 1-pixel blank MP4 data URI loop for iOS WebKit video keep-awake
      video.src = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAhmcmVlAAAAGG1kYXQAAAAAAAD+AABo6QAAAAPv';
      document.body.appendChild(video);
      videoFallbackRef.current = video;
    }

    try {
      videoFallbackRef.current.play().catch(() => {
        // Handled silently if auto-play policy requires user tap
      });
    } catch {
      // Ignore
    }
  }, []);

  const stopVideoFallback = useCallback(() => {
    if (videoFallbackRef.current) {
      try {
        videoFallbackRef.current.pause();
        if (videoFallbackRef.current.parentNode) {
          videoFallbackRef.current.parentNode.removeChild(videoFallbackRef.current);
        }
      } catch {
        // Ignore
      }
      videoFallbackRef.current = null;
    }
  }, []);

  const requestLock = useCallback(async () => {
    // 1. Try native Screen Wake Lock API (supported on Android Chrome & iOS Safari 16.4+)
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (!wakeLockRef.current) {
          const sentinel = await navigator.wakeLock.request('screen');
          wakeLockRef.current = sentinel;
          setIsLocked(true);

          sentinel.addEventListener('release', () => {
            wakeLockRef.current = null;
            setIsLocked(false);
          });
        }
      } catch {
        setIsLocked(false);
      }
    }

    // 2. Always engage iOS video fallback as secondary guarantee against aggressive dimming
    startVideoFallback();
    setIsLocked(true);
  }, [startVideoFallback]);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore
      }
      wakeLockRef.current = null;
    }
    stopVideoFallback();
    setIsLocked(false);
  }, [stopVideoFallback]);

  useEffect(() => {
    if (isActive) {
      requestLock();
    } else {
      releaseLock();
    }

    return () => {
      releaseLock();
    };
  }, [isActive, requestLock, releaseLock]);

  // Re-acquire lock whenever the screen is awakened or tab is restored
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive) {
        requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
    };
  }, [isActive, requestLock]);

  return { isLocked, isSupported };
}
