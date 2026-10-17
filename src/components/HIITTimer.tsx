import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Settings,
  Volume2,
  VolumeX,
  Sparkles,
  Flame,
  ShieldCheck,
  Navigation,
  MapPin,
  Layers,
  Maximize2,
  Eye,
} from 'lucide-react';
import L from 'leaflet';
import confetti from 'canvas-confetti';
import { HIITConfig, HIITPhase, HIITWorkout, GPSCoordinate } from '../types/workout';
import { soundFx } from '../services/audioEngine';
import { saveWorkout, SAMPLE_ROUTE_COORDS } from '../services/storage';
import { useWakeLock } from '../hooks/useWakeLock';
import { calculateDistanceMeters, formatPace, formatPaceShort, estimateCalories, formatClock } from '../utils/geo';

interface HIITTimerProps {
  onWorkoutCompleted: (workout: HIITWorkout) => void;
  onOpenStory: (workout: HIITWorkout) => void;
}

const DEFAULT_PRESETS: HIITConfig[] = [
  {
    name: 'Tabata Clássico',
    prepSeconds: 10,
    workSeconds: 20,
    restSeconds: 10,
    rounds: 8,
    sets: 1,
    restBetweenSetsSeconds: 60,
  },
  {
    name: 'HIIT Corrida & Caminhada',
    prepSeconds: 10,
    workSeconds: 30,
    restSeconds: 30,
    rounds: 10,
    sets: 2,
    restBetweenSetsSeconds: 90,
  },
  {
    name: 'Cardio Burn 45/15',
    prepSeconds: 10,
    workSeconds: 45,
    restSeconds: 15,
    rounds: 6,
    sets: 3,
    restBetweenSetsSeconds: 60,
  },
];

export const HIITTimer: React.FC<HIITTimerProps> = ({ onWorkoutCompleted, onOpenStory }) => {
  const [config, setConfig] = useState<HIITConfig>(DEFAULT_PRESETS[0]);
  const [phase, setPhase] = useState<HIITPhase>('idle');
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [currentSet, setCurrentSet] = useState<number>(1);
  const [timeRemaining, setTimeRemaining] = useState<number>(config.prepSeconds);
  const [phaseDuration, setPhaseDuration] = useState<number>(config.prepSeconds);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(soundFx.getMuted());
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [totalElapsedSeconds, setTotalElapsedSeconds] = useState<number>(0);

  // GPS Route Tracking for HIIT (O Trajeto Laranja)
  const [enableGpsRoute, setEnableGpsRoute] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'map' | 'timer'>('map');
  const [coordinates, setCoordinates] = useState<GPSCoordinate[]>([]);
  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState<number>(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'streets'>('dark');
  const [showMapStyleMenu, setShowMapStyleMenu] = useState(false);

  // Keep screen awake while HIIT is running
  const { isLocked: isScreenAwake } = useWakeLock(isRunning);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);

  // Interval & timing refs
  const timerRef = useRef<number | null>(null);
  const workoutStartTimestampRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const simulationIndexRef = useRef<number>(0);
  const simulationIntervalRef = useRef<number | null>(null);
  const lastCoordRef = useRef<GPSCoordinate | null>(null);
  const lastSimTimestampRef = useRef<number>(0);
  const lastFinishedWorkoutRef = useRef<HIITWorkout | null>(null);

  // Initialize Leaflet Map with the signature Strava-vibrant orange polyline (#FC5200)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultLat = -23.5855;
    const defaultLng = -46.6580;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([defaultLat, defaultLng], 15);

    const initialTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    tileLayerRef.current = initialTiles;

    const pane = map.getPane('tilePane');
    if (pane) {
      pane.classList.add('dark-tiles');
    }

    // Trajeto Laranja elétrico idêntico ao da caminhada/corrida (#FC5200)
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

    // Get real current device GPS position
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([latitude, longitude], 16);
            markerRef.current?.setLatLng([latitude, longitude]);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    // Invalidate map size to ensure tiles render properly after DOM resize
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timeout);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [viewMode]);

  // Adjust map size whenever user switches view mode
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    }
  }, [viewMode]);

  // Handle map style switching (Dark / Satellite / Streets)
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    const pane = mapInstanceRef.current.getPane('tilePane');
    if (pane) {
      pane.classList.remove('dark-tiles', 'satellite-tiles');
    }

    let url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    if (mapStyle === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      if (pane) pane.classList.add('satellite-tiles');
    } else if (mapStyle === 'streets') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
    } else {
      if (pane) pane.classList.add('dark-tiles');
    }

    const newLayer = L.tileLayer(url, { maxZoom: 19 }).addTo(mapInstanceRef.current);
    tileLayerRef.current = newLayer;
  }, [mapStyle]);

  // Update Orange Polyline on Map in Real-Time
  useEffect(() => {
    if (!polylineRef.current || !mapInstanceRef.current) return;

    const latLngs = coordinates.map((c) => [c.lat, c.lng] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);

    if (latLngs.length > 0) {
      const latest = latLngs[latLngs.length - 1];
      markerRef.current?.setLatLng(latest);

      // Start green marker on first point
      if (latLngs.length === 1 && !startMarkerRef.current) {
        startMarkerRef.current = L.circleMarker(latLngs[0], {
          radius: 7,
          fillColor: '#10B981',
          fillOpacity: 1,
          color: '#FFFFFF',
          weight: 2,
        }).addTo(mapInstanceRef.current);
      }

      mapInstanceRef.current.panTo(latest, { animate: true, duration: 0.5 });
    }
  }, [coordinates]);

  // Coordinate processor with physics-based speed filter (immune to screen lock throttle)
  const handleNewCoord = useCallback((lat: number, lng: number, speed?: number | null, altitude?: number | null, timestamp?: number) => {
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

      // Realistic filter:
      // Ignore stationary jitter (< 1.2m)
      // Reject impossible teleport spikes (> 130 km/h) only if interval is under 120s
      const isJitter = addedMeters < 1.2;
      const isTeleportGlitch = calculatedSpeedKmh > 130 && deltaSeconds < 120;

      if (!isJitter && !isTeleportGlitch) {
        setDistanceMeters((prev) => prev + addedMeters);
        setCoordinates((prev) => [...prev, newCoord]);
        lastCoordRef.current = newCoord;

        const effectiveSpeedKmh = speed != null && speed > 0 ? speed * 3.6 : calculatedSpeedKmh;
        setCurrentSpeedKmh(Math.max(0, Number(effectiveSpeedKmh.toFixed(1))));
        setMaxSpeedKmh((prev) => Math.max(prev, effectiveSpeedKmh));
      } else if (isTeleportGlitch && deltaSeconds >= 120) {
        lastCoordRef.current = newCoord;
        setCoordinates((prev) => [...prev, newCoord]);
      }
    } else {
      // First fix
      setCoordinates([newCoord]);
      lastCoordRef.current = newCoord;
    }
  }, []);

  // Real GPS Location Watching
  useEffect(() => {
    if (isRunning && enableGpsRoute && !isSimulating && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError(null);
          handleNewCoord(pos.coords.latitude, pos.coords.longitude, pos.coords.speed, pos.coords.altitude, pos.timestamp);
        },
        (err) => {
          console.warn('HIIT GPS watch error:', err);
          if (err.code === 1) {
            setGpsError('Permissão de GPS negada.');
          } else {
            setGpsError('Buscando sinal GPS...');
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } else if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isRunning, enableGpsRoute, isSimulating, handleNewCoord]);

  // Active periodic GPS backup polling for background/screen-off tracking
  useEffect(() => {
    if (!isRunning || !enableGpsRoute || isSimulating || !('geolocation' in navigator)) return;

    const pollInterval = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleNewCoord(pos.coords.latitude, pos.coords.longitude, pos.coords.speed, pos.coords.altitude, pos.timestamp);
        },
        () => {
          // Handled by watchPosition
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 6000 }
      );
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [isRunning, enableGpsRoute, isSimulating, handleNewCoord]);

  // Simulation Mode for Desktop/Indoor HIIT with sleep catch-up
  useEffect(() => {
    if (isRunning && enableGpsRoute && isSimulating) {
      lastSimTimestampRef.current = Date.now();

      simulationIntervalRef.current = window.setInterval(() => {
        const now = Date.now();
        const elapsedSinceLastSim = now - lastSimTimestampRef.current;
        const stepsToAdvance = Math.max(1, Math.min(25, Math.floor(elapsedSinceLastSim / 2000)));
        lastSimTimestampRef.current = now;

        for (let s = 0; s < stepsToAdvance; s++) {
          const index = simulationIndexRef.current % SAMPLE_ROUTE_COORDS.length;
          const target = SAMPLE_ROUTE_COORDS[index];

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
            setDistanceMeters((prev) => prev + added);
          }

          setCoordinates((prev) => [...prev, newCoord]);
          lastCoordRef.current = newCoord;
          simulationIndexRef.current += 1;
        }

        setCurrentSpeedKmh(12.5 + (Math.random() * 2 - 1));
        setMaxSpeedKmh((prev) => Math.max(prev, 14.8));
      }, 2000);
    } else if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, [isRunning, enableGpsRoute, isSimulating]);

  // Sync initial countdown with config when idle
  useEffect(() => {
    if (phase === 'idle') {
      setTimeRemaining(config.prepSeconds);
      setPhaseDuration(config.prepSeconds);
      setCurrentRound(1);
      setCurrentSet(1);
      setTotalElapsedSeconds(0);
    }
  }, [config, phase]);

  // Main high-precision interval tick
  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = window.setInterval(() => {
      setTotalElapsedSeconds((prev) => prev + 1);

      setTimeRemaining((prevTime) => {
        if (prevTime <= 4 && prevTime > 1) {
          soundFx.playCountdown(prevTime === 2 ? 700 : 600);
        }

        if (prevTime <= 1) {
          advancePhase();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, phase, currentRound, currentSet, config]);

  const advancePhase = () => {
    if (phase === 'prep') {
      soundFx.playStartBurst();
      setPhase('work');
      setTimeRemaining(config.workSeconds);
      setPhaseDuration(config.workSeconds);
    } else if (phase === 'work') {
      if (currentRound < config.rounds) {
        soundFx.playRestChime();
        setPhase('rest');
        setTimeRemaining(config.restSeconds);
        setPhaseDuration(config.restSeconds);
      } else {
        if (currentSet < config.sets) {
          soundFx.playRestChime();
          setPhase('set_rest');
          setTimeRemaining(config.restBetweenSetsSeconds);
          setPhaseDuration(config.restBetweenSetsSeconds);
        } else {
          finishWorkout();
        }
      }
    } else if (phase === 'rest') {
      soundFx.playStartBurst();
      setCurrentRound((prev) => prev + 1);
      setPhase('work');
      setTimeRemaining(config.workSeconds);
      setPhaseDuration(config.workSeconds);
    } else if (phase === 'set_rest') {
      soundFx.playStartBurst();
      setCurrentSet((prev) => prev + 1);
      setCurrentRound(1);
      setPhase('work');
      setTimeRemaining(config.workSeconds);
      setPhaseDuration(config.workSeconds);
    }
  };

  const finishWorkout = () => {
    setIsRunning(false);
    setPhase('completed');
    soundFx.playVictory();

    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#FC5200', '#FF6B35', '#10B981', '#F59E0B'],
    });

    const totalDuration = totalElapsedSeconds || config.rounds * (config.workSeconds + config.restSeconds) * config.sets;
    const distanceKm = distanceMeters / 1000;
    const estimatedCalories = distanceMeters > 50
      ? estimateCalories(distanceMeters, totalDuration)
      : Math.round((totalDuration / 60) * 12.5);

    const avgPace = distanceKm > 0.05 ? totalDuration / distanceKm : 0;

    const finishedHIIT: HIITWorkout = {
      id: `hiit-${Date.now()}`,
      type: 'hiit',
      title: config.name,
      timestamp: workoutStartTimestampRef.current || Date.now() - totalDuration * 1000,
      durationSeconds: totalDuration,
      calories: estimatedCalories,
      roundsCompleted: config.rounds * config.sets,
      totalRounds: config.rounds * config.sets,
      workSeconds: config.workSeconds,
      restSeconds: config.restSeconds,
      sets: config.sets,
      coordinates: coordinates.length > 0 ? coordinates : undefined,
      distanceMeters: distanceMeters > 0 ? distanceMeters : undefined,
      avgPaceSecondsPerKm: avgPace > 0 ? avgPace : undefined,
      maxSpeedKmh: maxSpeedKmh > 0 ? maxSpeedKmh : undefined,
      notes: `${config.sets} série(s) de ${config.rounds} rounds (${config.workSeconds}s trab / ${config.restSeconds}s desc).`,
    };

    lastFinishedWorkoutRef.current = finishedHIIT;
    soundFx.stopKeepAlive();
    saveWorkout(finishedHIIT);
    onWorkoutCompleted(finishedHIIT);
  };

  // Sync real-time live HIIT metrics to phone Lock Screen Media Controls
  useEffect(() => {
    if (isRunning) {
      const distKm = distanceMeters / 1000;
      const paceSec = distKm > 0.05 ? Math.round(totalElapsedSeconds / distKm) : 0;
      const paceStr = formatPaceShort(paceSec);
      const calories = distanceMeters > 50
        ? estimateCalories(distanceMeters, totalElapsedSeconds)
        : Math.round((totalElapsedSeconds / 60) * 12.5);

      const phaseLabel = phase === 'work' ? 'Trabalho' : phase === 'rest' ? 'Descanso' : phase === 'prep' ? 'Preparar' : 'Intervalo';
      const roundInfo = `Round ${currentRound}/${config.rounds} (${phaseLabel})`;

      soundFx.updateKeepAliveMetrics({
        activityTitle: 'Treino HIIT',
        distanceKm: distKm,
        paceStr: paceStr,
        elapsedSeconds: totalElapsedSeconds,
        calories: calories,
        extraInfo: roundInfo,
      });
    }
  }, [isRunning, distanceMeters, totalElapsedSeconds, phase, currentRound, config.rounds]);

  const handleStart = () => {
    soundFx.startKeepAlive('Treino HIIT', () => {
      setIsRunning(false);
    });

    if (phase === 'idle' || phase === 'completed') {
      workoutStartTimestampRef.current = Date.now();
      setPhase('prep');
      setTimeRemaining(config.prepSeconds);
      setPhaseDuration(config.prepSeconds);
      setCurrentRound(1);
      setCurrentSet(1);
      setTotalElapsedSeconds(0);

      // If simulation is active, seed first 2 points immediately so the orange route is visible from second 0
      if (enableGpsRoute && isSimulating) {
        const p1 = { ...SAMPLE_ROUTE_COORDS[0], timestamp: Date.now() };
        const p2 = { ...SAMPLE_ROUTE_COORDS[1], timestamp: Date.now() + 500 };
        const initialDist = calculateDistanceMeters(p1, p2);
        setCoordinates([p1, p2]);
        setDistanceMeters(initialDist);
        lastCoordRef.current = p2;
        simulationIndexRef.current = 2;
        lastSimTimestampRef.current = Date.now();
        setCurrentSpeedKmh(13.2);
        setMaxSpeedKmh(14.0);
      } else if (enableGpsRoute) {
        setCoordinates([]);
        setDistanceMeters(0);
        lastCoordRef.current = null;
      }

      if (startMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }
    }

    if (phase === 'work') {
      soundFx.playRunStartSound();
    } else if (phase === 'rest' || phase === 'set_rest') {
      soundFx.playRestSound();
    } else {
      soundFx.playCountdown(500);
    }
    setIsRunning(true);
  };

  const handlePause = () => {
    soundFx.stopKeepAlive();
    soundFx.playRestSound();
    setIsRunning(false);
  };

  const handleReset = () => {
    soundFx.stopKeepAlive();
    soundFx.stopAllSounds();
    setIsRunning(false);
    setPhase('idle');
    setCurrentRound(1);
    setCurrentSet(1);
    setTimeRemaining(config.prepSeconds);
    setPhaseDuration(config.prepSeconds);
    setTotalElapsedSeconds(0);
    setCoordinates([]);
    setDistanceMeters(0);
    setCurrentSpeedKmh(0);
    lastCoordRef.current = null;
    if (polylineRef.current) polylineRef.current.setLatLngs([]);
    if (startMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }
  };

  const handleSkipForward = () => {
    soundFx.playCountdown(700);
    advancePhase();
  };

  const toggleSound = () => {
    const next = soundFx.toggleMuted();
    setIsMuted(next);
  };

  // Phase color themes - work and action buttons prominently feature the signature vibrant electric orange (#FC5200)
  const getPhaseTheme = () => {
    switch (phase) {
      case 'work':
        return {
          title: 'TRABALHO / EXERCÍCIO',
          subtitle: 'Dê o seu máximo na intensidade!',
          bgGlow: 'from-orange-600/30 via-[#FC5200]/20 to-transparent',
          ringColor: '#FC5200',
          textColor: 'text-orange-500',
          borderColor: 'border-orange-500/40',
        };
      case 'rest':
        return {
          title: 'DESCANSO',
          subtitle: 'Respire fundo e recupere o fôlego',
          bgGlow: 'from-teal-600/25 via-cyan-600/15 to-transparent',
          ringColor: '#06B6D4',
          textColor: 'text-cyan-400',
          borderColor: 'border-cyan-500/40',
        };
      case 'set_rest':
        return {
          title: 'INTERVALO ENTRE SÉRIES',
          subtitle: 'Hidrate-se antes da próxima série',
          bgGlow: 'from-indigo-600/25 via-blue-600/15 to-transparent',
          ringColor: '#6366F1',
          textColor: 'text-indigo-400',
          borderColor: 'border-indigo-500/40',
        };
      case 'prep':
        return {
          title: 'PREPARAÇÃO',
          subtitle: 'Ajuste sua postura e prepare-se',
          bgGlow: 'from-amber-600/25 via-yellow-600/15 to-transparent',
          ringColor: '#F59E0B',
          textColor: 'text-amber-400',
          borderColor: 'border-amber-500/40',
        };
      case 'completed':
        return {
          title: 'TREINO CONCLUÍDO!',
          subtitle: 'Parabéns pela dedicação e intensidade!',
          bgGlow: 'from-emerald-600/30 via-teal-600/15 to-transparent',
          ringColor: '#10B981',
          textColor: 'text-emerald-400',
          borderColor: 'border-emerald-500/40',
        };
      default:
        return {
          title: 'PRONTO PARA O HIIT',
          subtitle: `${config.name} (${config.workSeconds}s / ${config.restSeconds}s)`,
          bgGlow: 'from-slate-800/20 to-transparent',
          ringColor: '#334155',
          textColor: 'text-slate-300',
          borderColor: 'border-slate-800',
        };
    }
  };

  const theme = getPhaseTheme();
  const progressRatio = phaseDuration > 0 ? timeRemaining / phaseDuration : 0;
  const strokeDashoffset = 2 * Math.PI * 130 * (1 - progressRatio);

  const distanceKm = distanceMeters / 1000;
  const avgPace = distanceKm > 0.05 ? totalElapsedSeconds / distanceKm : 0;

  return (
    <div className="relative w-full min-h-[calc(100vh-125px)] flex flex-col items-center justify-between p-3 md:p-6 bg-[#0B0F17] select-none overflow-hidden">
      {/* Background Ambience Gradient */}
      <div className={`absolute inset-0 bg-gradient-radial ${theme.bgGlow} pointer-events-none transition-colors duration-700`} />

      {/* Top Header Bar for HIIT */}
      <div className="relative z-20 w-full max-w-4xl flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161D2D] hover:bg-[#1E273D] border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-orange-400" />
            <span className="font-semibold truncate max-w-[120px]">{config.name}</span>
          </button>

          {/* View Mode Switcher: Mapa (Imagem 2) / Timer (Imagem 3) */}
          <div className="flex items-center bg-[#121824] p-0.5 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode('map')}
              title="Visualização Mapa com Painel HUD"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'map' ? 'bg-[#FC5200] text-white shadow-sm shadow-orange-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Mapa</span>
            </button>
            <button
              onClick={() => setViewMode('timer')}
              title="Visualização Timer Circular"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'timer' ? 'bg-[#FC5200] text-white shadow-sm shadow-orange-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Timer</span>
            </button>
          </div>
        </div>

        {/* Right tools: GPS mode, Sound & Screen Wake Lock */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Toggle GPS Simulation for easy indoor/desktop testing */}
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            title="Alternar entre GPS Real e Simulação"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
              isSimulating
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-[#161D2D] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Navigation className={`w-3 h-3 ${isSimulating ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">{isSimulating ? 'Simulação Ativa' : 'GPS Real'}</span>
            <span className="sm:hidden">{isSimulating ? 'Sim' : 'GPS'}</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={isMuted ? 'Ativar Som' : 'Silenciar'}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#161D2D] border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Real-time Trajectory Telemetry Bar (Shown when not in full map mode, because in map mode it is embedded inside the HUD) */}
      {viewMode !== 'map' && (
        <div className="relative z-10 w-full max-w-4xl grid grid-cols-4 gap-2 mb-3">
          <div className="p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 backdrop-blur-md flex flex-col items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trajeto</span>
            <span className="text-sm md:text-base font-black text-white font-mono tabular-nums">
              {distanceKm.toFixed(2)} <span className="text-[10px] font-normal text-orange-400">km</span>
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 backdrop-blur-md flex flex-col items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ritmo</span>
            <span className="text-sm md:text-base font-black text-white font-mono tabular-nums">
              {formatPace(avgPace)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 backdrop-blur-md flex flex-col items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Velocidade</span>
            <span className="text-sm md:text-base font-black text-white font-mono tabular-nums">
              {currentSpeedKmh.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">km/h</span>
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 backdrop-blur-md flex flex-col items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Round</span>
            <span className="text-sm md:text-base font-black text-orange-400 font-mono tabular-nums">
              {currentRound}/{config.rounds}
            </span>
          </div>
        </div>
      )}

      {/* Main Content Area based on ViewMode (Mapa ou Timer) */}
      <div className="relative z-10 w-full max-w-4xl flex-1 flex flex-col items-center justify-center my-auto min-h-0">
        {/* VIEW 1: FULL MAP VIEW WITH EXPANDED FLOATING HIIT HUD CONTAINING TELEMETRY BAR (Imagem 2) */}
        {viewMode === 'map' && (
          <div className="w-full h-[65vh] md:h-[72vh] rounded-3xl overflow-hidden border border-slate-800 bg-[#121824] relative shadow-2xl">
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Floating HIIT HUD Overlay on top of the Map - Enlarged Rectangle with Embedded Telemetry Bar */}
            <div className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-[1000] flex flex-col gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-[#0B0F17]/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl">
              {/* Top Row: Enlarged Countdown + Phase Info + Rounds/Sets + GPS Badge */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  {/* Big Timer Box */}
                  <div className="flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#161D2D] to-[#0E1420] border-2 border-orange-500/50 shadow-lg shadow-orange-500/10 shrink-0">
                    <span className="text-2xl sm:text-3xl font-black font-sans text-orange-400 tabular-nums leading-none">
                      {timeRemaining}
                    </span>
                    <span className="text-[8px] sm:text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">
                      seg
                    </span>
                  </div>

                  {/* Phase & Round / Series Details */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider ${theme.textColor} px-2.5 py-0.5 rounded-lg bg-[#121824] border ${theme.borderColor}`}>
                        {theme.title}
                      </span>
                      {isRunning && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          AO VIVO
                        </span>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-extrabold text-white mt-1">
                      Round {currentRound}/{config.rounds} <span className="text-slate-500 font-normal mx-1">&bull;</span> Série {currentSet}/{config.sets}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">
                      {theme.subtitle}
                    </span>
                  </div>
                </div>

                {/* Right side status / GPS badge */}
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 text-[10px] sm:text-[11px] font-black text-orange-400">
                    <span className="w-2 h-2 rounded-full bg-[#FC5200] animate-pulse" />
                    <span className="hidden sm:inline">TRAJETO LARANJA</span>
                    <span className="sm:hidden">GPS</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-300 mt-1">
                    {formatClock(totalElapsedSeconds)}
                  </span>
                </div>
              </div>

              {/* Bottom Row: A BARRA DE TELEMETRIA (Imagem 3) EMBUTIDA DENTRO DO RETÂNGULO */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-2 border-t border-slate-800/90">
                <div className="p-2 sm:p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trajeto</span>
                  <span className="text-xs sm:text-sm md:text-base font-black text-white font-mono tabular-nums leading-tight mt-0.5">
                    {distanceKm.toFixed(2)} <span className="text-[9px] sm:text-[10px] font-normal text-orange-400">km</span>
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ritmo</span>
                  <span className="text-xs sm:text-sm md:text-base font-black text-white font-mono tabular-nums leading-tight mt-0.5">
                    {formatPace(avgPace)}
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Velocidade</span>
                  <span className="text-xs sm:text-sm md:text-base font-black text-white font-mono tabular-nums leading-tight mt-0.5">
                    {currentSpeedKmh.toFixed(1)} <span className="text-[8px] sm:text-[9px] font-normal text-slate-400">km/h</span>
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-[#121824]/90 border border-slate-800/80 flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calorias</span>
                  <span className="text-xs sm:text-sm md:text-base font-black text-orange-400 font-mono tabular-nums leading-tight mt-0.5">
                    {distanceMeters > 50
                      ? estimateCalories(distanceMeters, totalElapsedSeconds)
                      : Math.round((totalElapsedSeconds / 60) * 12.5) || 0} <span className="text-[8px] sm:text-[9px] font-normal text-slate-400">kcal</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Map Style button and popup */}
            <div className="absolute bottom-4 right-4 z-[1000]">
              <button
                onClick={() => setShowMapStyleMenu(!showMapStyleMenu)}
                className="p-2 rounded-xl bg-black/80 border border-slate-800 text-slate-300 hover:text-white"
                title="Mudar estilo do mapa"
              >
                <Layers className="w-5 h-5" />
              </button>
              {showMapStyleMenu && (
                <div className="absolute bottom-12 right-0 w-28 bg-[#121824] border border-slate-800 rounded-xl shadow-xl overflow-hidden text-xs">
                  {(['dark', 'satellite', 'streets'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => {
                        setMapStyle(style);
                        setShowMapStyleMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left capitalize ${
                        mapStyle === style ? 'bg-orange-500/20 text-orange-400 font-bold' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {style === 'dark' ? 'Escuro' : style === 'satellite' ? 'Satélite' : 'Ruas'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: FULL TIMER VIEW */}
        {viewMode === 'timer' && (
          <div className="flex flex-col items-center justify-center my-auto py-4">
            <div className="flex flex-col items-center text-center mb-5">
              <span className={`text-xs md:text-sm font-black uppercase tracking-widest ${theme.textColor} px-3 py-1 rounded-full bg-[#121824] border ${theme.borderColor} mb-1.5`}>
                {theme.title}
              </span>
              <span className="text-xs text-slate-400 font-medium">{theme.subtitle}</span>
            </div>

            <div className="relative flex items-center justify-center w-72 h-72 md:w-80 md:h-80">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 300 300">
                <circle cx="150" cy="150" r="130" fill="transparent" stroke="#1A2234" strokeWidth="12" />
                <circle
                  cx="150"
                  cy="150"
                  r="130"
                  fill="transparent"
                  stroke={theme.ringColor}
                  strokeWidth="12"
                  strokeDasharray={2 * Math.PI * 130}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-300 ease-linear"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-7xl md:text-8xl font-black font-sans tracking-tight text-white tabular-nums drop-shadow-md">
                  {timeRemaining}
                </span>
                <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold mt-1">
                  segundos
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mt-6 px-6 py-2.5 rounded-2xl bg-[#121824]/90 border border-slate-800/80 backdrop-blur-md">
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Round</span>
                <span className="text-lg md:text-xl font-black text-white font-mono tabular-nums">
                  {currentRound} <span className="text-slate-400 text-sm font-normal">/ {config.rounds}</span>
                </span>
              </div>
              <div className="flex flex-col items-center border-l border-slate-800/80 pl-6">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Série</span>
                <span className="text-lg md:text-xl font-black text-white font-mono tabular-nums">
                  {currentSet} <span className="text-slate-400 text-sm font-normal">/ {config.sets}</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Buttons (FABs) Bottom Bar */}
      <div className="relative z-20 w-full max-w-md pt-3 pb-2">
        {phase === 'completed' ? (
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                if (lastFinishedWorkoutRef.current) {
                  onOpenStory(lastFinishedWorkoutRef.current);
                  return;
                }
                const totalDuration = totalElapsedSeconds || config.rounds * (config.workSeconds + config.restSeconds) * config.sets;
                const distKm = distanceMeters / 1000;
                const estimatedCalories = distanceMeters > 50
                  ? estimateCalories(distanceMeters, totalDuration)
                  : Math.round((totalDuration / 60) * 12.5);
                const avgPaceSec = distKm > 0.05 ? totalDuration / distKm : 0;

                const completedWorkout: HIITWorkout = {
                  id: `hiit-${Date.now()}`,
                  type: 'hiit',
                  title: config.name,
                  timestamp: workoutStartTimestampRef.current || Date.now() - totalDuration * 1000,
                  durationSeconds: totalDuration,
                  calories: estimatedCalories,
                  roundsCompleted: config.rounds * config.sets,
                  totalRounds: config.rounds * config.sets,
                  workSeconds: config.workSeconds,
                  restSeconds: config.restSeconds,
                  sets: config.sets,
                  coordinates: coordinates.length > 0 ? coordinates : undefined,
                  distanceMeters: distanceMeters > 0 ? distanceMeters : undefined,
                  avgPaceSecondsPerKm: avgPaceSec > 0 ? avgPaceSec : undefined,
                  maxSpeedKmh: maxSpeedKmh > 0 ? maxSpeedKmh : undefined,
                };
                saveWorkout(completedWorkout);
                onOpenStory(completedWorkout);
              }}
              className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-[#FC5200] text-white font-bold text-base shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
              <span>Criar Story com Trajeto Laranja</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Novo Treino</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReset}
              title="Reiniciar Timer"
              className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#161D2D] border border-slate-800 text-slate-400 hover:text-white active:scale-[0.95] transition-transform cursor-pointer shrink-0"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2.5 h-14 rounded-2xl bg-[#FC5200] hover:bg-orange-600 text-white font-bold text-base shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{phase === 'idle' ? 'Iniciar HIIT com Trajeto' : 'Continuar'}</span>
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex-1 flex items-center justify-center gap-2.5 h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Pause className="w-5 h-5 fill-current" />
                <span>Pausar Treino</span>
              </button>
            )}

            <button
              onClick={handleSkipForward}
              title="Pular para próximo intervalo"
              className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#161D2D] border border-slate-800 text-slate-400 hover:text-orange-400 active:scale-[0.95] transition-transform cursor-pointer shrink-0"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* HIIT Custom Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-[#121824] border border-slate-800 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-white mb-1">Configurar Treino HIIT</h3>
            <p className="text-xs text-slate-400 mb-5">Personalize os tempos e séries para seu objetivo.</p>

            {/* Quick Presets */}
            <div className="mb-5">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block mb-2">
                Predefinições Rápidas
              </span>
              <div className="grid grid-cols-3 gap-2">
                {DEFAULT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setConfig(p)}
                    className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition-all ${
                      config.name === p.name
                        ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                        : 'bg-[#182133] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {p.workSeconds}s / {p.restSeconds}s
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Inputs */}
            <div className="space-y-3.5 mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Tempo de Exercício (s)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, workSeconds: Math.max(5, config.workSeconds - 5) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-white">{config.workSeconds}s</span>
                  <button
                    onClick={() => setConfig({ ...config, workSeconds: config.workSeconds + 5 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Tempo de Descanso (s)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, restSeconds: Math.max(5, config.restSeconds - 5) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-white">{config.restSeconds}s</span>
                  <button
                    onClick={() => setConfig({ ...config, restSeconds: config.restSeconds + 5 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Rounds por Série</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, rounds: Math.max(1, config.rounds - 1) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-white">{config.rounds}</span>
                  <button
                    onClick={() => setConfig({ ...config, rounds: config.rounds + 1 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Número de Séries</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, sets: Math.max(1, config.sets - 1) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-white">{config.sets}</span>
                  <button
                    onClick={() => setConfig({ ...config, sets: config.sets + 1 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Sound Preview Section */}
            <div className="mb-5 p-3 rounded-2xl bg-[#161D2D] border border-slate-800">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block mb-2">
                Som do Treino (Início e Descanso: Gongo de Boxe)
              </span>
              <button
                type="button"
                onClick={() => soundFx.playBoxingGongSound()}
                className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-400 text-xs font-black transition-all cursor-pointer shadow-lg shadow-cyan-950/20 active:scale-[0.98]"
              >
                <ShieldCheck className="w-4 h-4 shrink-0 text-cyan-400" />
                <span>Ouvir Som: Gongo de Boxe (5s)</span>
              </button>
            </div>

            <button
              onClick={() => setShowConfigModal(false)}
              className="w-full h-12 rounded-xl bg-[#FC5200] hover:bg-orange-600 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
