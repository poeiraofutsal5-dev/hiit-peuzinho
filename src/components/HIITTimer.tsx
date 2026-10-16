import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Settings, Volume2, VolumeX, Sparkles, Check, Flame } from 'lucide-react';
import confetti from 'canvas-confetti';
import { HIITConfig, HIITPhase, HIITWorkout } from '../types/workout';
import { soundFx } from '../services/audioEngine';
import { saveWorkout } from '../services/storage';

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
    name: 'HIIT Intenso 30/15',
    prepSeconds: 10,
    workSeconds: 30,
    restSeconds: 15,
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

  const timerRef = useRef<number | null>(null);
  const workoutStartTimestampRef = useRef<number>(0);

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
        // Audio cues for 3, 2, 1 seconds countdown
        if (prevTime <= 4 && prevTime > 1) {
          soundFx.playCountdown(prevTime === 2 ? 700 : 600);
        }

        if (prevTime <= 1) {
          // Transition to next phase
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
      // Transition from Prep -> Work (Round 1)
      soundFx.playStartBurst();
      setPhase('work');
      setTimeRemaining(config.workSeconds);
      setPhaseDuration(config.workSeconds);
    } else if (phase === 'work') {
      if (currentRound < config.rounds) {
        // Transition from Work -> Rest
        soundFx.playRestChime();
        setPhase('rest');
        setTimeRemaining(config.restSeconds);
        setPhaseDuration(config.restSeconds);
      } else {
        // Last round of the set
        if (currentSet < config.sets) {
          // Rest between sets
          soundFx.playRestChime();
          setPhase('set_rest');
          setTimeRemaining(config.restBetweenSetsSeconds);
          setPhaseDuration(config.restBetweenSetsSeconds);
        } else {
          // Workout finished!
          finishWorkout();
        }
      }
    } else if (phase === 'rest') {
      // Transition from Rest -> Next Work Round
      soundFx.playStartBurst();
      setCurrentRound((prev) => prev + 1);
      setPhase('work');
      setTimeRemaining(config.workSeconds);
      setPhaseDuration(config.workSeconds);
    } else if (phase === 'set_rest') {
      // Transition from Set Rest -> Round 1 of Next Set
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

    // Estimate HIIT calories: roughly 12-14 kcal/min of vigorous interval training
    const totalDuration = totalElapsedSeconds || config.rounds * (config.workSeconds + config.restSeconds) * config.sets;
    const estimatedCalories = Math.round((totalDuration / 60) * 12.5);

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
      notes: `${config.sets} série(s) de ${config.rounds} rounds (${config.workSeconds}s trab / ${config.restSeconds}s desc).`,
    };

    saveWorkout(finishedHIIT);
    onWorkoutCompleted(finishedHIIT);
  };

  const handleStart = () => {
    if (phase === 'idle' || phase === 'completed') {
      workoutStartTimestampRef.current = Date.now();
      setPhase('prep');
      setTimeRemaining(config.prepSeconds);
      setPhaseDuration(config.prepSeconds);
      setCurrentRound(1);
      setCurrentSet(1);
      setTotalElapsedSeconds(0);
    }
    soundFx.playCountdown(500);
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setPhase('idle');
    setCurrentRound(1);
    setCurrentSet(1);
    setTimeRemaining(config.prepSeconds);
    setPhaseDuration(config.prepSeconds);
    setTotalElapsedSeconds(0);
  };

  const handleSkipForward = () => {
    soundFx.playCountdown(700);
    advancePhase();
  };

  const toggleSound = () => {
    const next = soundFx.toggleMuted();
    setIsMuted(next);
  };

  // Phase color themes
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

  return (
    <div className="relative w-full min-h-[calc(100vh-125px)] flex flex-col items-center justify-between p-4 md:p-6 bg-[#0B0F17] select-none overflow-hidden">
      {/* Background Ambience Gradient */}
      <div className={`absolute inset-0 bg-gradient-radial ${theme.bgGlow} pointer-events-none transition-colors duration-700`} />

      {/* Top Header Bar for HIIT */}
      <div className="relative z-10 w-full max-w-md flex items-center justify-between gap-3">
        <button
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#161D2D] hover:bg-[#1E273D] border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-orange-400" />
          <span className="font-medium truncate max-w-[140px]">{config.name}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            title={isMuted ? 'Ativar Som' : 'Silenciar'}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#161D2D] border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Center Circular Timer & Big Numbers */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto py-4">
        {/* Phase Pill Title */}
        <div className="flex flex-col items-center text-center mb-5">
          <span className={`text-xs md:text-sm font-black uppercase tracking-widest ${theme.textColor} px-3 py-1 rounded-full bg-[#121824] border ${theme.borderColor} mb-1.5`}>
            {theme.title}
          </span>
          <span className="text-xs text-slate-400 font-medium">{theme.subtitle}</span>
        </div>

        {/* Circular Progress Ring */}
        <div className="relative flex items-center justify-center w-72 h-72 md:w-80 md:h-80">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 300 300">
            {/* Background Track */}
            <circle
              cx="150"
              cy="150"
              r="130"
              fill="transparent"
              stroke="#1A2234"
              strokeWidth="12"
            />
            {/* Dynamic Progress Stroke */}
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

          {/* Center Giant Countdown Figures */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-7xl md:text-8xl font-black font-sans tracking-tight text-white tabular-nums drop-shadow-md">
              {timeRemaining}
            </span>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold mt-1">
              segundos
            </span>
          </div>
        </div>

        {/* Rounds and Sets Counter */}
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

      {/* Floating Action Buttons (FABs) Bottom Bar */}
      <div className="relative z-10 w-full max-w-md pb-4">
        {phase === 'completed' ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                const totalDuration = totalElapsedSeconds || config.rounds * (config.workSeconds + config.restSeconds) * config.sets;
                const estimatedCalories = Math.round((totalDuration / 60) * 12.5);
                const mockWorkout: HIITWorkout = {
                  id: `hiit-${Date.now()}`,
                  type: 'hiit',
                  title: config.name,
                  timestamp: Date.now() - totalDuration * 1000,
                  durationSeconds: totalDuration,
                  calories: estimatedCalories,
                  roundsCompleted: config.rounds * config.sets,
                  totalRounds: config.rounds * config.sets,
                  workSeconds: config.workSeconds,
                  restSeconds: config.restSeconds,
                  sets: config.sets,
                };
                onOpenStory(mockWorkout);
              }}
              className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-[#FC5200] text-white font-bold text-base shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
              <span>Criar Story do Treino</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Novo Treino</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleReset}
              title="Reiniciar Timer"
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#161D2D] border border-slate-800 text-slate-400 hover:text-white active:scale-[0.95] transition-transform cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-3 h-14 rounded-2xl bg-gradient-to-r from-orange-500 to-[#FC5200] text-white font-bold text-lg shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-transform cursor-pointer"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>{phase === 'idle' ? 'Iniciar HIIT' : 'Continuar'}</span>
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex-1 flex items-center justify-center gap-3 h-14 rounded-2xl bg-amber-500 text-slate-950 font-bold text-lg shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-transform cursor-pointer"
              >
                <Pause className="w-6 h-6 fill-current" />
                <span>Pausar</span>
              </button>
            )}

            <button
              onClick={handleSkipForward}
              title="Pular para próximo intervalo"
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#161D2D] border border-slate-800 text-slate-400 hover:text-orange-400 active:scale-[0.95] transition-transform cursor-pointer"
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
              {/* Work Seconds */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Tempo de Exercício (s)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, workSeconds: Math.max(5, config.workSeconds - 5) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-orange-400 tabular-nums">
                    {config.workSeconds}s
                  </span>
                  <button
                    onClick={() => setConfig({ ...config, workSeconds: config.workSeconds + 5 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Rest Seconds */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Tempo de Descanso (s)</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, restSeconds: Math.max(0, config.restSeconds - 5) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-cyan-400 tabular-nums">
                    {config.restSeconds}s
                  </span>
                  <button
                    onClick={() => setConfig({ ...config, restSeconds: config.restSeconds + 5 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Rounds */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Rounds por Série</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, rounds: Math.max(1, config.rounds - 1) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-white tabular-nums">
                    {config.rounds}
                  </span>
                  <button
                    onClick={() => setConfig({ ...config, rounds: config.rounds + 1 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Sets */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-xs font-bold text-slate-200">Número de Séries</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig({ ...config, sets: Math.max(1, config.sets - 1) })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-white tabular-nums">
                    {config.sets}
                  </span>
                  <button
                    onClick={() => setConfig({ ...config, sets: config.sets + 1 })}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowConfigModal(false);
                handleReset();
              }}
              className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition-colors cursor-pointer"
            >
              Salvar Configuração
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
