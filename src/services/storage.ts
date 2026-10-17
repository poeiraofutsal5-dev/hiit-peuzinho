import { Workout, GPSWorkout, HIITWorkout, WeeklyStats, GPSCoordinate } from '../types/workout';

// Increment storage key to reset all previous mock data
const STORAGE_KEY = 'pulse_workouts_v2';

// Clean empty initial state - 0 km, 0 workouts, 0 calories
const INITIAL_WORKOUTS: Workout[] = [];

// Sample route coordinates kept only as a reference fallback for vector rendering if needed
export const SAMPLE_ROUTE_COORDS: GPSCoordinate[] = [
  { lat: -23.5855, lng: -46.6580, timestamp: 1713000000000, speed: 4.1 },
  { lat: -23.5862, lng: -46.6572, timestamp: 1713000100000, speed: 4.2 },
  { lat: -23.5878, lng: -46.6558, timestamp: 1713000200000, speed: 4.2 },
  { lat: -23.5889, lng: -46.6534, timestamp: 1713000300000, speed: 4.3 },
  { lat: -23.5902, lng: -46.6515, timestamp: 1713000400000, speed: 4.0 },
  { lat: -23.5915, lng: -46.6492, timestamp: 1713000500000, speed: 4.1 },
  { lat: -23.5928, lng: -46.6468, timestamp: 1713000600000, speed: 4.2 },
  { lat: -23.5918, lng: -46.6442, timestamp: 1713000700000, speed: 4.1 },
  { lat: -23.5898, lng: -46.6425, timestamp: 1713000800000, speed: 4.2 },
  { lat: -23.5875, lng: -46.6415, timestamp: 1713000900000, speed: 4.3 },
  { lat: -23.5852, lng: -46.6420, timestamp: 1713001000000, speed: 4.2 },
  { lat: -23.5830, lng: -46.6445, timestamp: 1713001100000, speed: 4.1 },
  { lat: -23.5815, lng: -46.6480, timestamp: 1713001200000, speed: 4.0 },
  { lat: -23.5822, lng: -46.6520, timestamp: 1713001300000, speed: 4.1 },
  { lat: -23.5840, lng: -46.6560, timestamp: 1713001400000, speed: 4.2 },
  { lat: -23.5855, lng: -46.6580, timestamp: 1713001500000, speed: 4.1 },
];

export function getStoredWorkouts(): Workout[] {
  try {
    // Clear legacy v1 mock data if present
    if (localStorage.getItem('pulse_workouts_v1')) {
      localStorage.removeItem('pulse_workouts_v1');
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_WORKOUTS));
      return INITIAL_WORKOUTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_WORKOUTS;
  } catch {
    return INITIAL_WORKOUTS;
  }
}

export function saveWorkout(workout: Workout): Workout[] {
  const existing = getStoredWorkouts();
  const updated = [workout, ...existing.filter((w) => w.id !== workout.id)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save to localStorage', err);
  }
  return updated;
}

export function deleteWorkout(id: string): Workout[] {
  const existing = getStoredWorkouts();
  const updated = existing.filter((w) => w.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete workout', err);
  }
  return updated;
}

export function clearAllWorkouts(): Workout[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('pulse_workouts_v1');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  } catch (err) {
    console.error('Failed to clear workouts', err);
  }
  return [];
}

export function calculateWeeklyStats(workouts: Workout[]): WeeklyStats {
  const now = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(now.getDate() - 7);
  oneWeekAgo.setHours(0, 0, 0, 0);

  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dailyMap: { [key: string]: { km: number; calories: number } } = {};

  // Initialize last 7 days with 0
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dayLabel = daysOfWeek[d.getDay()];
    dailyMap[dayLabel] = { km: 0, calories: 0 };
  }

  let totalKm = 0;
  let totalCalories = 0;
  let totalDurationSeconds = 0;
  let workoutCount = 0;

  workouts.forEach((w) => {
    if (w.timestamp >= oneWeekAgo.getTime()) {
      workoutCount++;
      totalCalories += w.calories;
      totalDurationSeconds += w.durationSeconds;

      const d = new Date(w.timestamp);
      const dayLabel = daysOfWeek[d.getDay()];

      let km = 0;
      if (w.type === 'running' || w.type === 'cycling' || w.type === 'walking') {
        const gpsW = w as GPSWorkout;
        km = gpsW.distanceMeters / 1000;
        totalKm += km;
      } else if (w.type === 'hiit') {
        const hiitW = w as HIITWorkout;
        if (hiitW.distanceMeters && hiitW.distanceMeters > 0) {
          km = hiitW.distanceMeters / 1000;
          totalKm += km;
        }
      }

      if (dailyMap[dayLabel]) {
        dailyMap[dayLabel].km += km;
        dailyMap[dayLabel].calories += w.calories;
      }
    }
  });

  const dailyDistance = Object.keys(dailyMap).map((day) => ({
    day,
    km: Number(dailyMap[day].km.toFixed(2)),
    calories: dailyMap[day].calories,
  }));

  return {
    totalKm: Number(totalKm.toFixed(2)),
    totalCalories,
    totalDurationSeconds,
    workoutCount,
    dailyDistance,
  };
}
