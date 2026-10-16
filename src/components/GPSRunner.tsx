import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Navigation, RotateCcw, Sparkles, MapPin, Activity, Flame, Clock } from 'lucide-react';
import L from 'leaflet';
import confetti from 'canvas-confetti';
import { GPSCoordinate, GPSWorkout } from '../types/workout';
import { calculateDistanceMeters, formatPace, formatClock, estimateCalories } from '../utils/geo';
import { saveWorkout } from '../services/storage';
import { soundFx } from '../services/audioEngine';

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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);

  const timerIntervalRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const simulationIndexRef = useRef<number>(0);
  const simulationIntervalRef = useRef<number | null>(null);
  const lastCoordRef = useRef<GPSCoordinate | null>(null);
  const startTimeRef = useRef<number>(0);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultLat = -23.5855;
    const defaultLng = -46.6580;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([defaultLat, defaultLng], 15);

    // Dark cartographic tiles for high-contrast Strava look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

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

  // Handle Elapsed Timer
  useEffect(() => {
    if (status === 'running') {
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [status]);

  // Handle Real GPS Geolocation Watch
  useEffect(() => {
    if (status === 'running' && !isSimulating) {
      if (!('geolocation' in navigator)) {
        setGpsError('Geolocalização não suportada neste dispositivo.');
        return;
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError(null);
          const { latitude, longitude, speed, altitude } = pos.coords;
          const currentTimestamp = pos.timestamp;

          const newCoord: GPSCoordinate = {
            lat: latitude,
            lng: longitude,
            speed: speed ?? undefined,
            altitude: altitude ?? undefined,
            timestamp: currentTimestamp,
          };

          if (lastCoordRef.current) {
            const addedMeters = calculateDistanceMeters(lastCoordRef.current, newCoord);
            // Ignore GPS jitter under 2 meters or unreasonable jumps
            if (addedMeters >= 2 && addedMeters < 50) {
              setDistanceMeters((prev) => prev + addedMeters);
              setCoordinates((prev) => [...prev, newCoord]);
              lastCoordRef.current = newCoord;

              // Speed in km/h
              const speedKmh = speed ? speed * 3.6 : (addedMeters / ((currentTimestamp - lastCoordRef.current.timestamp) / 1000)) * 3.6;
              setCurrentSpeedKmh(Math.max(0, Number(speedKmh.toFixed(1))));
              setMaxSpeedKmh((prev) => Math.max(prev, speedKmh));
            }
          } else {
            // First point
            setCoordinates([newCoord]);
            lastCoordRef.current = newCoord;
          }
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
          maximumAge: 1000,
          timeout: 10000,
        }
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
  }, [status, isSimulating]);

  // Handle Simulation Mode
  useEffect(() => {
    if (status === 'running' && isSimulating) {
      simulationIntervalRef.current = window.setInterval(() => {
        const index = simulationIndexRef.current % SIMULATED_POINTS.length;
        const target = SIMULATED_POINTS[index];

        // Add subtle natural jitter for realism
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
        setCurrentSpeedKmh(14.2 + (Math.random() * 1.5 - 0.7));
        setMaxSpeedKmh((prev) => Math.max(prev, 15.8));

        simulationIndexRef.current += 1;
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

  const handleStart = () => {
    soundFx.playStartBurst();
    if (status === 'idle') {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);

      if (isSimulating) {
        // Immediately seed initial points so route and pace appear from second 0
        const p1 = { ...SIMULATED_POINTS[0], timestamp: Date.now(), speed: 4.2 };
        const p2 = { ...SIMULATED_POINTS[1], timestamp: Date.now() + 500, speed: 4.2 };
        const initialDist = calculateDistanceMeters(p1, p2);
        setCoordinates([p1, p2]);
        setDistanceMeters(initialDist);
        lastCoordRef.current = p2;
        simulationIndexRef.current = 2;
        setCurrentSpeedKmh(15.1);
        setMaxSpeedKmh(15.5);
      } else {
        setCoordinates([]);
        setDistanceMeters(0);
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
    soundFx.playCountdown(440);
    setStatus('paused');
  };

  const handleResume = () => {
    soundFx.playStartBurst();
    setStatus('running');
  };

  const handleFinish = () => {
    soundFx.playVictory();
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
    setStatus('idle');
    setIsSimulating(false);
    setCoordinates([]);
    setDistanceMeters(0);
    setElapsedSeconds(0);
    setCurrentSpeedKmh(0);
    lastCoordRef.current = null;
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121824]/90 backdrop-blur-md border border-slate-800 text-xs text-slate-300 shadow-lg pointer-events-auto">
            <span className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-emerald-500 animate-pulse' : status === 'paused' ? 'bg-amber-400' : 'bg-slate-400'}`} />
            <span className="font-medium">
              {isSimulating ? 'Simulação GPS' : status === 'running' ? 'Rastreamento Ativo' : status === 'paused' ? 'Pausado' : 'Pronto para Iniciar'}
            </span>
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-all shadow-lg pointer-events-auto ${
                isSimulating
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                  : 'bg-[#121824]/90 text-slate-300 border border-slate-700 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSimulating ? 'Modo Simulação ON' : 'Simular Rota'}</span>
            </button>
          )}
        </div>

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
            <button
              onClick={handlePause}
              className="flex items-center justify-center gap-3 w-full max-w-sm h-14 rounded-2xl bg-amber-500 text-slate-950 font-bold text-lg shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Pause className="w-6 h-6 fill-current" />
              <span>Pausar Treino</span>
            </button>
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
