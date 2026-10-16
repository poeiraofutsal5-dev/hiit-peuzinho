export interface GPSCoordinate {
  lat: number;
  lng: number;
  altitude?: number | null;
  speed?: number | null;
  timestamp: number;
}

export type ActivityType = 'running' | 'hiit' | 'cycling' | 'walking';

export interface BaseWorkout {
  id: string;
  type: ActivityType;
  title: string;
  timestamp: number; // Start date epoch
  durationSeconds: number;
  calories: number;
  notes?: string;
}

export interface GPSWorkout extends BaseWorkout {
  type: 'running' | 'cycling' | 'walking';
  distanceMeters: number;
  avgPaceSecondsPerKm: number;
  maxSpeedKmh: number;
  coordinates: GPSCoordinate[];
}

export interface HIITWorkout extends BaseWorkout {
  type: 'hiit';
  roundsCompleted: number;
  totalRounds: number;
  workSeconds: number;
  restSeconds: number;
  sets: number;
}

export type Workout = GPSWorkout | HIITWorkout;

export interface HIITConfig {
  name: string;
  prepSeconds: number;
  workSeconds: number;
  restSeconds: number;
  rounds: number;
  sets: number;
  restBetweenSetsSeconds: number;
}

export type HIITPhase = 'idle' | 'prep' | 'work' | 'rest' | 'set_rest' | 'completed';

export interface WeeklyStats {
  totalKm: number;
  totalCalories: number;
  totalDurationSeconds: number;
  workoutCount: number;
  dailyDistance: { day: string; km: number; calories: number }[];
}
