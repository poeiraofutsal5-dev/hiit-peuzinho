import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, Navigation, RotateCcw, Sparkles, MapPin, Activity, Flame, Clock, ShieldCheck, Layers, Lock, Unlock, Smartphone, X } from 'lucide-react';
import L from 'leaflet';
import confetti from 'canvas-confetti';
import { GPSCoordinate, GPSWorkout } from '../types/workout';
import { calculateDistanceMeters, formatPace, formatPaceShort, formatClock, estimateCalories } from '../utils/geo';
import { saveWorkout } from '../services/storage';
import { soundFx } from '../services/audioEngine';
import { useWakeLock } from '../hooks/useWakeLock';

interface GPSRunnerProps {
  onWorkoutCompleted: (workout: GPSWorkout) => void;
  onOpenStory: (workout: GPSWorkout) => void;
}

// Simulated running circuit (e.g. scenic park perimeter) for indoor/desktop testing
const SIMULATED_POINTS = [
  { lat: -23.5855, lng: -46.6580 },
  { lat: -23.5862, lng: -46.6572 },
  { lat: -23.5878, lng: -46.6558 },
  { lat: -23.5889, lng: -46.6534 },
  { lat: -23.5902, lng: -46.6515 },
  { lat: -23.5915, lng: -46.6492 },
  { lat: -23.5928, lng: -46.6468 },
  { lat: -23.5920, lng: -46.6442 },
  { lat: -23.5898, lng: -46.6425 },
  { lat: -23.5875, lng: -46.6415 },
  { lat: -23.5852, lng: -46.6420 },
  { lat: -23.5830, lng: -46.6445 },
  { lat: -23.5815, lng: -46.6480 },
  { lat: -23.5822, lng: -46.6520 },
  { lat: -23.5840, lng: -46.6560 },
  { lat: -23.5855, lng: -46.6580 },
];

export const GPSRunner: React.FC<GPSRunnerProps> = ({ onWorkoutCompleted, onOpenStory }) => {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [coordinates, setCoordinates] = useState<GPSCoordinate[]>([]);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState<number>(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'streets'>('dark');
  const [showMapStyleMenu, setShowMapStyleMenu] = useState(false);
  const [isPocketMode, setIsPocketMode] = useState<boolean>(false);
  const [showIosTip, setShowIosTip] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  });

  // Keep screen awake while workout is running
  const { isLocked: isScreenAwake } = useWakeLock(status === 'running');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);

  const timerIntervalRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const simulationIndexRef = useRef<number>(0);
  const simulationIntervalRef = useRef<number | null>(null);
  const lastCoordRef = useRef<GPSCoordinate | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseStartRef = useRef<number | null>(null);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const lastSimTimestampRef = useRef<number>(0);
  const distanceMetersRef = useRef<number>(0);
  const coordinatesRef = useRef<GPSCoordinate[]>([]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultLat = -23.5855;
    const defaultLng = -46.6580;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([defaultLat, defaultLng], 15);

    // Clean OpenStreetMap tiles with no watermark and dark filter
    const initialTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    tileLayerRef.current = initialTiles;

    const pane = map.getPane('tilePane');
    if (pane) {
      pane.classList.add('dark-tiles');
    }

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Route polyline with Strava-signature vibrant electric orange
    const polyline = L.polyline([], {
      color: '#FC5200',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Runner current position pulsing marker
    const marker = L.circleMarker([defaultLat, defaultLng], {
      radius: 8,
      fillColor: '#FF6B35',
      fillOpacity: 1,
      color: '#FFFFFF',
      weight: 3,
    }).addTo(map);

    mapInstanceRef.current = map;
    polylineRef.current = polyline;
    markerRef.current = marker;

    // Try to get initial real position
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (mapInstanceRef.current && status === 'idle') {
            mapInstanceRef.current.setView([latitude, longitude], 16);
            markerRef.current?.setLatLng([latitude, longitude]);
          }
        },
        () => {
          // Keep default park view
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Switch tile layer and classes when user changes map style
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    const pane = mapInstanceRef.current.getPane('tilePane');
    if (pane) {
      pane.classList.remove('dark-tiles', 'satellite-tiles');
    }

    let url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    if (mapStyle === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri, Maxar, Earthstar Geographics';
      if (pane) pane.classList.add('satellite-tiles');
    } else if (mapStyle === 'streets') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri, OpenStreetMap';
    } else {
      url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
      if (pane) pane.classList.add('dark-tiles');
    }

    const newTiles = L.tileLayer(url, {
      attribution,
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = newTiles;
  }, [mapStyle]);

  // Update map polyline whenever coordinates change
  useEffect(() => {
    if (!polylineRef.current || !mapInstanceRef.current) return;

    const latLngs = coordinates.map((c) => [c.lat, c.lng] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);

    if (latLngs.length > 0) {
      const latest = latLngs[latLngs.length - 1];
      markerRef.current?.setLatLng(latest);

      // Start marker on the first point
      if (latLngs.length === 1 && !startMarkerRef.current) {
        startMarkerRef.current = L.circleMarker(latLngs[0], {
          radius: 7,
          fillColor: '#10B981', // green start marker
          fillOpacity: 1,
          color: '#FFFFFF',
          weight: 2,
        }).addTo(mapInstanceRef.current);
      }

      // Smooth pan to latest location
      mapInstanceRef.current.panTo(latest, { animate: true, duration: 0.5 });
    }
  }, [coordinates]);

  // High-precision delta elapsed time calculation (immune to screen locks and tab throttling)
  const updateElapsed = useCallback(() => {
    if (status !== 'running' || !startTimeRef.current) return;
    const now = Date.now();
    const activeMs = now - startTimeRef.current - pausedAccumulatedMsRef.current;
    const currentSeconds = Math.max(0, Math.floor(activeMs / 1000));
    setElapsedSeconds(currentSeconds);

    // Direct background lock-screen notification update (does not depend on React re-render)
    const currentDistM = distanceMetersRef.current;
    const distKm = currentDistM / 1000;
    const paceSec = distKm > 0.05 ? currentSeconds / distKm : 0;
    const paceStr = paceSec > 0 ? formatPaceShort(paceSec) : '0:00 /km';
    const cal = estimateCalories(currentDistM, currentSeconds);

    soundFx.updateKeepAliveMetrics({
      activityTitle: 'Corrida GPS',
      distanceKm: distKm,
      paceStr,
      elapsedSeconds: currentSeconds,
      calories: cal,
    });
  }, [status]);

  // Handle Elapsed Timer with high frequency and timestamp delta
  useEffect(() => {
    if (status === 'running') {
      updateElapsed();
      timerIntervalRef.current = window.setInterval(() => {
        updateElapsed();
      }, 500);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [status, updateElapsed]);

  // Centralized coordinate processor with physics-based speed filter & sleep catch-up
  const handleNewCoord = useCallback((
    lat: number,
    lng: number,
    speed?: number | null,
    altitude?: number | null,
    timestamp?: number
  ) => {
    const currentTimestamp = timestamp || Date.now();
    const newCoord: GPSCoordinate = {
      lat,
      lng,
      speed: speed ?? undefined,
      altitude: altitude ?? undefined,
      timestamp: currentTimestamp,
    };

    if (lastCoordRef.current) {
      const addedMeters = calculateDistanceMeters(lastCoordRef.current, newCoord);
      const lastTs = lastCoordRef.current.timestamp || currentTimestamp - 1000;
      const deltaSeconds = Math.max(0.4, (currentTimestamp - lastTs) / 1000);
      const calculatedSpeedKmh = (addedMeters / deltaSeconds) * 3.6;

      // Filter:
      // 1. Ignore micro-jitter when stationary (< 1.2m)
      // 2. Reject impossible physical spikes (> 130 km/h) only if interval is under 60s
      const isJitter = addedMeters < 1.2;
      const isTeleportGlitch = calculatedSpeedKmh > 130 && deltaSeconds < 60;

      if (!isJitter && !isTeleportGlitch) {
        // If device was asleep or locked (gap > 8s and distance > 8m),
        // interpolate intermediate points along the straight segment so the route stays continuous
        if (deltaSeconds > 8 && addedMeters > 8) {
          const numSteps = Math.min(6, Math.max(2, Math.floor(addedMeters / 15)));
          for (let i = 1; i < numSteps; i++) {
            const fraction = i / numSteps;
            const interpLat = lastCoordRef.current.lat + (lat - lastCoordRef.current.lat) * fraction;
            const interpLng = lastCoordRef.current.lng + (lng - lastCoordRef.current.lng) * fraction;
            const interpTs = Math.round(lastTs + (currentTimestamp - lastTs) * fraction);
            coordinatesRef.current.push({
              lat: interpLat,
              lng: interpLng,
              speed: calculatedSpeedKmh / 3.6,
              timestamp: interpTs,
            });
          }
        }

        distanceMetersRef.current += addedMeters;
        coordinatesRef.current.push(newCoord);

        setDistanceMeters(distanceMetersRef.current);
        setCoordinates([...coordinatesRef.current]);
        lastCoordRef.current = newCoord;

        const effectiveSpeedKmh = speed != null && speed > 0 ? speed * 3.6 : calculatedSpeedKmh;
        setCurrentSpeedKmh(Math.max(0, Number(effectiveSpeedKmh.toFixed(1))));
        setMaxSpeedKmh((prev) => Math.max(prev, effectiveSpeedKmh));

        // Immediately push updated stats to lock-screen notification and audio engine
        if (startTimeRef.current) {
          const now = Date.now();
          const activeSec = Math.max(0, Math.floor((now - startTimeRef.current - pausedAccumulatedMsRef.current) / 1000));
          const currentDistKm = distanceMetersRef.current / 1000;
          const currentPaceSec = currentDistKm > 0.05 ? activeSec / currentDistKm : 0;
          const currentPaceStr = currentPaceSec > 0 ? formatPaceShort(currentPaceSec) : '0:00 /km';
          const currentCals = estimateCalories(distanceMetersRef.current, activeSec);

          soundFx.updateKeepAliveMetrics({
            activityTitle: 'Corrida GPS',
            distanceKm: currentDistKm,
            paceStr: currentPaceStr,
            elapsedSeconds: activeSec,
            calories: currentCals,
          });
        }
      } else if (isTeleportGlitch && deltaSeconds >= 60) {
        // Device was asleep/locked for over 1 minute: accept new coordinate to resume tracking
        lastCoordRef.current = newCoord;
        coordinatesRef.current.push(newCoord);
        setCoordinates([...coordinatesRef.current]);
      }
    } else {
      // First point
      coordinatesRef.current = [newCoord];
      setCoordinates([newCoord]);
      lastCoordRef.current = newCoord;
    }
  }, []);

  // Dedicated function to start/revive GPS Watch (crucial for iOS WebKit which drops GPS on sleep)
  const startGpsWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsError('Geolocalização não suportada neste dispositivo.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError(null);
          handleNewCoord(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.speed,
            pos.coords.altitude,
            pos.timestamp || Date.now()
          );
        },
        (err) => {
          console.warn('GPS watch error:', err);
          if (err.code === 1) {
            setGpsError('Permissão de GPS negada. Ative a localização nas configurações.');
          } else {
            setGpsError('Buscando sinal de satélite GPS...');
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }
      );
    } catch (err) {
      console.warn('Failed to start GPS watch:', err);
    }
  }, [handleNewCoord]);

  // Listen for screen unlock / foreground event to catch up immediately and revive GPS
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateElapsed();

        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
          if (lastCoordRef.current) {
            mapInstanceRef.current.panTo([lastCoordRef.current.lat, lastCoordRef.current.lng], { animate: true, duration: 0.5 });
          }
        }

        // On screen wake, revive watchPosition because iOS WebKit frequently freezes it after lock
        if (status === 'running' && !isSimulating) {
          startGpsWatch();

          // Force fresh hardware GPS query (maximumAge: 0 bypasses iOS cache)
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                handleNewCoord(
                  pos.coords.latitude,
                  pos.coords.longitude,
                  pos.coords.speed,
                  pos.coords.altitude,
                  pos.timestamp || Date.now()
                );
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.panTo([pos.coords.latitude, pos.coords.longitude], { animate: true });
                }
              },
              (err) => console.warn('Wake GPS fix error:', err),
              { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
            );
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [status, isSimulating, updateElapsed, handleNewCoord, startGpsWatch]);

  // Handle Real GPS Geolocation Watch
  useEffect(() => {
    if (status === 'running' && !isSimulating) {
      startGpsWatch();
    } else if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [status, isSimulating, startGpsWatch]);

  // Active periodic GPS polling fallback (guarantees fresh coordinates with maximumAge: 0)
  useEffect(() => {
    if (status !== 'running' || isSimulating || !('geolocation' in navigator)) return;

    const pollInterval = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleNewCoord(pos.coords.latitude, pos.coords.longitude, pos.coords.speed, pos.coords.altitude, pos.timestamp);
        },
        () => {
          // Handled by watchPosition
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
      );
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [status, isSimulating, handleNewCoord]);

  // Handle Simulation Mode with sleep catch-up
  useEffect(() => {
    if (status === 'running' && isSimulating) {
      lastSimTimestampRef.current = Date.now();

      simulationIntervalRef.current = window.setInterval(() => {
        const now = Date.now();
        const elapsedSinceLastSim = now - lastSimTimestampRef.current;
        // Catch up all steps that should have happened while screen was off
        const stepsToAdvance = Math.max(1, Math.min(25, Math.floor(elapsedSinceLastSim / 2000)));
        lastSimTimestampRef.current = now;

        for (let s = 0; s < stepsToAdvance; s++) {
          const index = simulationIndexRef.current % SIMULATED_POINTS.length;
          const target = SIMULATED_POINTS[index];

          const jitterLat = (Math.random() - 0.5) * 0.00006;
          const jitterLng = (Math.random() - 0.5) * 0.00006;

          const newCoord: GPSCoordinate = {
            lat: target.lat + jitterLat,
            lng: target.lng + jitterLng,
            timestamp: Date.now(),
            speed: 3.8 + Math.random() * 0.6,
          };

          if (lastCoordRef.current) {
            const added = calculateDistanceMeters(lastCoordRef.current, newCoord);
            distanceMetersRef.current += added;
            setDistanceMeters(distanceMetersRef.current);
          }

          coordinatesRef.current.push(newCoord);
          setCoordinates([...coordinatesRef.current]);
          lastCoordRef.current = newCoord;
          simulationIndexRef.current += 1;
        }

        setCurrentSpeedKmh(14.5 + (Math.random() * 1.5 - 0.7));
        setMaxSpeedKmh((prev) => Math.max(prev, 15.8));
      }, 2000);
    } else if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, [status, isSimulating]);

  // Derived metrics
  const distanceKm = distanceMeters / 1000;
  const avgPaceSecondsPerKm = distanceKm > 0.05 ? elapsedSeconds / distanceKm : 0;
  const caloriesBurned = estimateCalories(distanceMeters, elapsedSeconds);

  // Sync real-time live metrics (KM, Pace, Calories, Time) to phone Lock Screen Media Controls
  useEffect(() => {
    if (status === 'running') {
      const paceStr = avgPaceSecondsPerKm > 0 ? formatPaceShort(avgPaceSecondsPerKm) : '0:00 /km';
      soundFx.updateKeepAliveMetrics({
        activityTitle: 'Corrida GPS',
        distanceKm,
        paceStr,
        elapsedSeconds,
        calories: caloriesBurned,
      });
    }
  }, [status, distanceKm, avgPaceSecondsPerKm, elapsedSeconds, caloriesBurned]);

  const handleTogglePause = useCallback(() => {
    setStatus((curr) => {
      if (curr === 'running') {
        soundFx.playRestSound();
        soundFx.stopKeepAlive();
        pauseStartRef.current = Date.now();
        return 'paused';
      } else if (curr === 'paused') {
        soundFx.playRunStartSound();
        if (pauseStartRef.current) {
          pausedAccumulatedMsRef.current += Date.now() - pauseStartRef.current;
          pauseStartRef.current = null;
        }
        soundFx.startKeepAlive('Corrida com GPS', handleTogglePause);
        return 'running';
      }
      return curr;
    });
  }, []);

  const handleStart = () => {
    soundFx.playStartBurst();
    soundFx.startKeepAlive('Corrida com GPS', handleTogglePause);
    if (status === 'idle') {
      startTimeRef.current = Date.now();
      pauseStartRef.current = null;
      pausedAccumulatedMsRef.current = 0;
      setElapsedSeconds(0);

      if (isSimulating) {
        // Immediately seed initial points so route and pace appear from second 0
        const p1 = { ...SIMULATED_POINTS[0], timestamp: Date.now(), speed: 4.2 };
        const p2 = { ...SIMULATED_POINTS[1], timestamp: Date.now() + 500, speed: 4.2 };
        const initialDist = calculateDistanceMeters(p1, p2);
        setCoordinates([p1, p2]);
        setDistanceMeters(initialDist);
        distanceMetersRef.current = initialDist;
        coordinatesRef.current = [p1, p2];
        lastCoordRef.current = p2;
        simulationIndexRef.current = 2;
        lastSimTimestampRef.current = Date.now();
        setCurrentSpeedKmh(15.1);
        setMaxSpeedKmh(15.5);
      } else {
        setCoordinates([]);
        setDistanceMeters(0);
        distanceMetersRef.current = 0;
        coordinatesRef.current = [];
        lastCoordRef.current = null;
      }

      if (startMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }
    }
    setStatus('running');
  };

  const handlePause = () => {
    handleTogglePause();
  };

  const handleResume = () => {
    handleTogglePause();
  };

  const handleFinish = () => {
    soundFx.playVictory();
    soundFx.stopKeepAlive();
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FC5200', '#FF6B35', '#10B981', '#38BDF8'],
    });

    // Use exact real recorded metrics from the user's session
    const finalCoords = coordinates;
    const finalDistanceMeters = Math.round(distanceMeters);
    const finalDurationSeconds = Math.max(elapsedSeconds, 1);
    const finalPaceSeconds = distanceKm > 0.05 ? Math.round(elapsedSeconds / distanceKm) : 0;
    const finalCalories = caloriesBurned;

    const finishedWorkout: GPSWorkout = {
      id: `run-${Date.now()}`,
      type: 'running',
      title: 'Corrida com GPS',
      timestamp: startTimeRef.current || Date.now() - finalDurationSeconds * 1000,
      durationSeconds: finalDurationSeconds,
      distanceMeters: finalDistanceMeters,
      avgPaceSecondsPerKm: finalPaceSeconds,
      maxSpeedKmh: Number(maxSpeedKmh.toFixed(1)) || 0,
      calories: finalCalories,
      coordinates: finalCoords,
      notes: finalPaceSeconds > 0 ? `Ritmo médio: ${formatPace(finalPaceSeconds)}.` : 'Corrida registrada.',
    };

    saveWorkout(finishedWorkout);
    onWorkoutCompleted(finishedWorkout);
    onOpenStory(finishedWorkout);

    // Reset state
    setStatus('idle');
    setIsSimulating(false);
  };

  const handleDiscard = () => {
    soundFx.stopKeepAlive();
    setStatus('idle');
    setIsSimulating(false);
    setCoordinates([]);
    setDistanceMeters(0);
    distanceMetersRef.current = 0;
    coordinatesRef.current = [];
    setElapsedSeconds(0);
    setCurrentSpeedKmh(0);
    lastCoordRef.current = null;
    pauseStartRef.current = null;
    pausedAccumulatedMsRef.current = 0;
    setShowDiscardConfirm(false);

    if (polylineRef.current) polylineRef.current.setLatLngs([]);
    if (startMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-125px)] min-h-[580px] flex flex-col bg-[#0B0F17] overflow-hidden select-none">
      {/* Map Viewport Area */}
      <div className="relative w-full flex-1">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Top Overlay Badge & Simulation Toggle */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121824]/90 backdrop-blur-md border border-slate-800 text-xs text-slate-300 shadow-lg pointer-events-auto">
              <span className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-emerald-500 animate-pulse' : status === 'paused' ? 'bg-amber-400' : 'bg-slate-400'}`} />
              <span className="font-medium">
                {isSimulating ? 'Simulação GPS' : status === 'running' ? 'Rastreamento Ativo' : status === 'paused' ? 'Pausado' : 'Pronto para Iniciar'}
              </span>
            </div>

            {status === 'running' && isScreenAwake && (
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400 backdrop-blur-md pointer-events-auto shadow-lg">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Tela Ativa</span>
              </div>
            )}

            {status === 'running' && (
              <button
                onClick={() => setIsPocketMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30 backdrop-blur-md shadow-lg pointer-events-auto cursor-pointer transition-all"
                title="Ativar Modo Bolso com tela preta e economia de bateria"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Modo Bolso</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Map Style Switcher (Dark, Satellite HD, Streets) */}
            <div className="relative pointer-events-auto">
              <button
                onClick={() => setShowMapStyleMenu(!showMapStyleMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#121824]/90 backdrop-blur-md text-slate-300 border border-slate-700 hover:text-white shadow-lg cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-orange-400" />
                <span>
                  {mapStyle === 'dark' ? 'Modo Escuro' : mapStyle === 'satellite' ? 'Satélite HD' : 'Ruas'}
                </span>
              </button>

              {showMapStyleMenu && (
                <div className="absolute right-0 top-10 w-36 py-1 rounded-xl bg-[#161D2D] border border-slate-700 shadow-2xl z-30">
                  <button
                    onClick={() => { setMapStyle('dark'); setShowMapStyleMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      mapStyle === 'dark' ? 'text-orange-400 bg-orange-500/10' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Modo Escuro
                  </button>
                  <button
                    onClick={() => { setMapStyle('satellite'); setShowMapStyleMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      mapStyle === 'satellite' ? 'text-orange-400 bg-orange-500/10' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Satélite HD
                  </button>
                  <button
                    onClick={() => { setMapStyle('streets'); setShowMapStyleMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      mapStyle === 'streets' ? 'text-orange-400 bg-orange-500/10' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Ruas &amp; Mapa
                  </button>
                </div>
              )}
            </div>

            {status === 'idle' && (
              <button
                onClick={() => {
                  setIsSimulating(!isSimulating);
                  if (!isSimulating) {
                    setCoordinates([]);
                    setDistanceMeters(0);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-all shadow-lg pointer-events-auto cursor-pointer ${
                  isSimulating
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                    : 'bg-[#121824]/90 text-slate-300 border border-slate-700 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSimulating ? 'Simulação ON' : 'Simular Rota'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Proactive iPhone guidance banner */}
        {showIosTip && status === 'running' && !isPocketMode && (
          <div className="absolute top-16 left-4 right-4 z-20 flex items-center justify-between gap-2 p-3 rounded-xl bg-[#161D2D]/95 border border-orange-500/40 text-orange-200 text-xs backdrop-blur-md shadow-xl animate-in slide-in-from-top duration-300 pointer-events-auto">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <span>
                <strong>Dica iPhone:</strong> Use o <strong>Modo Bolso</strong> para o iOS não pausar seu GPS ao guardar o celular!
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setIsPocketMode(true)}
                className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] cursor-pointer"
              >
                Ativar
              </button>
              <button
                onClick={() => setShowIosTip(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
                title="Fechar dica"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {gpsError && !isSimulating && (
          <div className="absolute top-16 left-4 right-4 z-10 p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs text-center backdrop-blur-md">
            {gpsError}
          </div>
        )}
      </div>

      {/* Primary Athletic Telemetry Panel (Strava / High-Performance Style) */}
      <div className="relative z-20 w-full bg-[#121824]/95 backdrop-blur-xl border-t border-slate-800 px-5 pt-4 pb-6 shadow-2xl">
        {/* Main Giant Metric: Distance */}
        <div className="flex flex-col items-center justify-center mb-3">
          <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-0.5">
            Distância
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl md:text-6xl font-black tracking-tight text-white font-sans tabular-nums">
              {distanceKm.toFixed(2)}
            </span>
            <span className="text-lg md:text-xl font-bold text-orange-500">km</span>
          </div>
        </div>

        {/* 3 Secondary Athletic Telemetry Metrics */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-800/80 mb-5">
          {/* Pace */}
          <div className="flex flex-col items-center text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-0.5 flex items-center gap-1">
              <Activity className="w-3 h-3 text-orange-400" /> Ritmo Médio
            </span>
            <span className="text-xl md:text-2xl font-bold text-white font-mono tabular-nums">
              {formatPace(avgPaceSecondsPerKm).replace(' /km', '')}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">/km</span>
          </div>

          {/* Time */}
          <div className="flex flex-col items-center text-center border-x border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3 text-orange-400" /> Tempo
            </span>
            <span className="text-xl md:text-2xl font-bold text-white font-mono tabular-nums">
              {formatClock(elapsedSeconds)}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">decorrido</span>
          </div>

          {/* Calories */}
          <div className="flex flex-col items-center text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-0.5 flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-400" /> Calorias
            </span>
            <span className="text-xl md:text-2xl font-bold text-white font-mono tabular-nums">
              {caloriesBurned}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">kcal est.</span>
          </div>
        </div>

        {/* Floating Action Buttons (FABs) */}
        <div className="flex items-center justify-center gap-4">
          {status === 'idle' && (
            <button
              onClick={handleStart}
              className="flex items-center justify-center gap-3 w-full max-w-sm h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-[#FC5200] text-white font-bold text-lg shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Play className="w-6 h-6 fill-current" />
              <span>Iniciar Corrida</span>
            </button>
          )}

          {status === 'running' && (
            <div className="flex items-center justify-center gap-3 w-full max-w-md">
              <button
                onClick={handlePause}
                className="flex-1 flex items-center justify-center gap-3 h-14 rounded-2xl bg-amber-500 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-transform cursor-pointer"
              >
                <Pause className="w-5 h-5 fill-current" />
                <span>Pausar Treino</span>
              </button>

              <button
                onClick={() => setIsPocketMode(true)}
                className="flex items-center justify-center gap-2 px-5 h-14 rounded-2xl bg-[#161D2D] hover:bg-[#1E2638] text-orange-400 border border-orange-500/30 font-bold text-sm shadow-lg active:scale-[0.98] transition-transform cursor-pointer"
                title="Ativar Modo Bolso com tela preta e toques protegidos"
              >
                <Lock className="w-5 h-5 text-orange-400" />
                <span className="hidden xs:inline">Modo Bolso</span>
              </button>
            </div>
          )}

          {status === 'paused' && (
            <div className="flex items-center justify-center gap-3 w-full max-w-md">
              <button
                onClick={handleResume}
                className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl bg-[#FC5200] text-white font-bold text-base shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-transform cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Continuar</span>
              </button>

              <button
                onClick={handleFinish}
                className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-transform cursor-pointer"
              >
                <Square className="w-5 h-5 fill-current" />
                <span>Finalizar</span>
              </button>

              <button
                onClick={() => setShowDiscardConfirm(true)}
                title="Descartar treino"
                className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700 active:scale-[0.95] transition-transform cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen OLED Pocket Mode (Protected Screen with Zero Battery Drain) */}
      {isPocketMode && (
        <div className="fixed inset-0 z-50 bg-[#000000] text-white flex flex-col justify-between p-6 select-none animate-in fade-in duration-200">
          {/* Top Status */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-orange-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold tracking-wider">MODO BOLSO ATIVO</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>GPS 100% ATIVO</span>
            </div>
          </div>

          {/* Central High-Contrast Athletics HUD */}
          <div className="flex flex-col items-center justify-center my-auto space-y-8">
            <div className="text-center">
              <span className="text-xs uppercase tracking-widest text-slate-500 font-bold block mb-1">
                DISTÂNCIA PERCORRIDA
              </span>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-7xl md:text-8xl font-black font-sans tracking-tight text-white tabular-nums">
                  {distanceKm.toFixed(2)}
                </span>
                <span className="text-2xl md:text-3xl font-black text-orange-500">KM</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full max-w-sm text-center border-t border-b border-slate-900 py-6">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1 font-semibold">
                  RITMO
                </span>
                <span className="text-2xl font-bold font-mono text-slate-200 tabular-nums">
                  {formatPace(avgPaceSecondsPerKm).replace(' /km', '')}
                </span>
                <span className="text-[9px] text-slate-500 block">/km</span>
              </div>

              <div className="border-x border-slate-900 px-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1 font-semibold">
                  TEMPO
                </span>
                <span className="text-2xl font-bold font-mono text-slate-200 tabular-nums">
                  {formatClock(elapsedSeconds)}
                </span>
                <span className="text-[9px] text-slate-500 block">ativo</span>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1 font-semibold">
                  CALORIAS
                </span>
                <span className="text-2xl font-bold font-mono text-slate-200 tabular-nums">
                  {caloriesBurned}
                </span>
                <span className="text-[9px] text-slate-500 block">kcal</span>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-900 text-[11px] text-slate-400 max-w-xs text-center leading-relaxed">
              <span>
                💡 A tela está preta em modo OLED para economizar bateria e os toques acidentais estão bloqueados. Seu GPS, pace e calorias continuam contando sem parar!
              </span>
            </div>
          </div>

          {/* Large Unlock Action (Pocket-Safe) */}
          <div className="w-full max-w-sm mx-auto pb-4">
            <button
              onClick={() => setIsPocketMode(false)}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 border border-slate-700 text-orange-400 font-bold text-base tracking-wide shadow-2xl active:scale-[0.98] transition-all cursor-pointer"
            >
              <Unlock className="w-5 h-5 text-orange-400" />
              <span>Toque para Destravar Tela</span>
            </button>
          </div>
        </div>
      )}

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#161D2D] border border-slate-700 p-6 shadow-2xl text-center">
            <h3 className="text-lg font-bold text-white mb-2">Descartar Treino?</h3>
            <p className="text-sm text-slate-400 mb-6">
              Todos os dados e o trajeto desta sessão serão perdidos permanentemente.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-200 font-medium text-sm hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDiscard}
                className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
