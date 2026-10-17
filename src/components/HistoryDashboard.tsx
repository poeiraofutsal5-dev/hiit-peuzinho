import React, { useState } from 'react';
import { Activity, Flame, Clock, Calendar, Sparkles, Trash2, ArrowUpRight, Dumbbell, MapPin, ChevronRight } from 'lucide-react';
import { Workout, GPSWorkout, HIITWorkout } from '../types/workout';
import { calculateWeeklyStats, deleteWorkout, clearAllWorkouts } from '../services/storage';
import { formatClock, formatDurationStory, formatPaceShort } from '../utils/geo';

interface HistoryDashboardProps {
  workouts: Workout[];
  onWorkoutsUpdated: (workouts: Workout[]) => void;
  onOpenStory: (workout: Workout) => void;
}

export const HistoryDashboard: React.FC<HistoryDashboardProps> = ({
  workouts,
  onWorkoutsUpdated,
  onOpenStory,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'running' | 'hiit'>('all');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);

  const weeklyStats = calculateWeeklyStats(workouts);

  const filteredWorkouts = workouts.filter((w) => {
    if (filterType === 'all') return true;
    if (filterType === 'running') return w.type === 'running' || w.type === 'cycling' || w.type === 'walking';
    if (filterType === 'hiit') return w.type === 'hiit';
    return true;
  });

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Deseja realmente excluir este treino do histórico?')) {
      const updated = deleteWorkout(id);
      onWorkoutsUpdated(updated);
      if (selectedWorkout?.id === id) {
        setSelectedWorkout(null);
      }
    }
  };

  const handleClearAll = () => {
    if (confirm('Deseja zerar todas as estatísticas e histórico do aplicativo?')) {
      const reset = clearAllWorkouts();
      onWorkoutsUpdated(reset);
      setSelectedWorkout(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="w-full min-h-[calc(100vh-125px)] p-4 md:p-6 bg-[#0B0F17] flex flex-col items-center select-none overflow-x-hidden">
      <div className="w-full max-w-4xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Histórico &amp; Estatísticas</h2>
            <p className="text-xs text-slate-400">Resumo semanal e registro automático de atividades diárias</p>
          </div>

          {/* Interactive Filter Control & Clear All */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-[#161D2D] rounded-xl border border-slate-800">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  filterType === 'all' ? 'bg-[#FC5200] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({workouts.length})
              </button>
              <button
                onClick={() => setFilterType('running')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  filterType === 'running' ? 'bg-[#FC5200] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Corridas
              </button>
              <button
                onClick={() => setFilterType('hiit')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  filterType === 'hiit' ? 'bg-[#FC5200] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                HIIT
              </button>
            </div>

            {workouts.length > 0 && (
              <button
                onClick={handleClearAll}
                title="Zerar todas as estatísticas e histórico"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl border border-rose-500/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Zerar Tudo</span>
              </button>
            )}
          </div>
        </div>

        {/* Weekly Recap Hero Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total Distance */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800/80 shadow-md">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
              <MapPin className="w-3.5 h-3.5 text-orange-400" /> Distância Semanal
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-black text-white font-sans tabular-nums">
                {weeklyStats.totalKm}
              </span>
              <span className="text-xs font-bold text-orange-400">km</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Últimos 7 dias</span>
          </div>

          {/* Total Calories */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800/80 shadow-md">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> Calorias Queimadas
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-black text-white font-sans tabular-nums">
                {weeklyStats.totalCalories.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-orange-400">kcal</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Total acumulado</span>
          </div>

          {/* Active Time */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800/80 shadow-md">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-orange-400" /> Tempo Ativo
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-black text-white font-sans tabular-nums">
                {formatDurationStory(weeklyStats.totalDurationSeconds)}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Em movimento</span>
          </div>

          {/* Workouts Count */}
          <div className="p-4 rounded-2xl bg-[#121824] border border-slate-800/80 shadow-md">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-orange-400" /> Atividades
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl md:text-3xl font-black text-white font-sans tabular-nums">
                {weeklyStats.workoutCount}
              </span>
              <span className="text-xs font-bold text-slate-400">sessões</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Foco &amp; consistência</span>
          </div>
        </div>

        {/* 7-Day Mini Bar Graph */}
        <div className="p-5 rounded-2xl bg-[#121824] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-300 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-orange-400" /> Volume Diário (Últimos 7 dias)
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">km percorridos por dia</span>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-28 pt-4">
            {weeklyStats.dailyDistance.map((dayData, idx) => {
              const maxKm = Math.max(...weeklyStats.dailyDistance.map((d) => d.km), 5);
              const heightPercent = Math.max(8, (dayData.km / maxKm) * 100);

              return (
                <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">
                    {dayData.km > 0 ? `${dayData.km}k` : '-'}
                  </span>
                  <div className="w-full max-w-[32px] bg-slate-800 rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        dayData.km > 0
                          ? 'bg-gradient-to-t from-orange-600 to-[#FC5200] shadow-sm shadow-orange-500/20'
                          : 'bg-slate-800'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">{dayData.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workouts List */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white">Registro de Sessões</h3>

          {filteredWorkouts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#121824] border border-slate-800 text-center text-slate-400 text-xs">
              Nenhuma atividade encontrada nesta categoria. Inicie uma corrida com GPS ou um treino HIIT!
            </div>
          ) : (
            filteredWorkouts.map((w) => {
              const isRun = w.type === 'running' || w.type === 'cycling' || w.type === 'walking';
              const gps = isRun ? (w as GPSWorkout) : null;
              const hiit = !isRun ? (w as HIITWorkout) : null;

              return (
                <div
                  key={w.id}
                  onClick={() => setSelectedWorkout(w)}
                  className="p-4 rounded-2xl bg-[#121824] hover:bg-[#161F30] border border-slate-800/80 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                >
                  {/* Left: Icon + Title + Date */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isRun ? 'bg-orange-500/10 text-orange-400' : 'bg-cyan-500/10 text-cyan-400'
                      }`}
                    >
                      {isRun ? <MapPin className="w-5 h-5" /> : <Dumbbell className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{w.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                          {isRun ? 'Corrida GPS' : 'HIIT'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-medium mt-0.5 block">
                        {formatDate(w.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Metrics + Quick Story Button */}
                  <div className="flex items-center justify-between sm:justify-end gap-5">
                    <div className="flex items-center gap-4 text-right">
                      {isRun && gps ? (
                        <>
                          <div>
                            <span className="text-xs font-bold text-white tabular-nums">
                              {(gps.distanceMeters / 1000).toFixed(2)} km
                            </span>
                            <span className="text-[10px] text-slate-400 block">Distância</span>
                          </div>
                          <div>
                            <span className="text-xs font-mono font-bold text-white tabular-nums">
                              {formatPaceShort(gps.avgPaceSecondsPerKm)}
                            </span>
                            <span className="text-[10px] text-slate-400 block">Ritmo</span>
                          </div>
                        </>
                      ) : (
                        <>
                          {hiit?.distanceMeters && hiit.distanceMeters > 0 ? (
                            <div>
                              <span className="text-xs font-bold text-white tabular-nums">
                                {(hiit.distanceMeters / 1000).toFixed(2)} km
                              </span>
                              <span className="text-[10px] text-slate-400 block">Trajeto</span>
                            </div>
                          ) : null}
                          <div>
                            <span className="text-xs font-bold text-white tabular-nums">
                              {hiit?.roundsCompleted} rounds
                            </span>
                            <span className="text-[10px] text-slate-400 block">Intervalos</span>
                          </div>
                        </>
                      )}

                      <div>
                        <span className="text-xs font-bold text-white tabular-nums">
                          {formatClock(w.durationSeconds)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">Duração</span>
                      </div>

                      <div>
                        <span className="text-xs font-bold text-orange-400 tabular-nums">
                          {w.calories} kcal
                        </span>
                        <span className="text-[10px] text-slate-400 block">Gasto</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenStory(w);
                        }}
                        title="Gerar Story do Treino"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-xs font-semibold border border-orange-500/30 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Story</span>
                      </button>

                      <button
                        onClick={(e) => handleDelete(w.id, e)}
                        title="Excluir"
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workout Detail Modal */}
      {selectedWorkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#121824] border border-slate-800 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-white">{selectedWorkout.title}</h3>
                <span className="text-xs text-slate-400">{formatDate(selectedWorkout.timestamp)}</span>
              </div>
              <button
                onClick={() => setSelectedWorkout(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Duração</span>
                <span className="text-lg font-black text-white font-mono">
                  {formatClock(selectedWorkout.durationSeconds)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Calorias Queimadas</span>
                <span className="text-lg font-black text-orange-400 font-mono">
                  {selectedWorkout.calories} kcal
                </span>
              </div>

              {selectedWorkout.type === 'running' && (
                <>
                  <div className="p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Distância Total</span>
                    <span className="text-lg font-black text-white font-mono">
                      {((selectedWorkout as GPSWorkout).distanceMeters / 1000).toFixed(2)} km
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161D2D] border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Ritmo Médio</span>
                    <span className="text-lg font-black text-white font-mono">
                      {formatPaceShort((selectedWorkout as GPSWorkout).avgPaceSecondsPerKm)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {selectedWorkout.notes && (
              <div className="p-3 rounded-xl bg-[#161D2D] border border-slate-800 text-xs text-slate-300 mb-6">
                <span className="font-bold text-slate-400 block mb-1">Notas do Treino</span>
                {selectedWorkout.notes}
              </div>
            )}

            <button
              onClick={() => {
                onOpenStory(selectedWorkout);
                setSelectedWorkout(null);
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FC5200] hover:bg-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Gerar Story deste Treino</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
