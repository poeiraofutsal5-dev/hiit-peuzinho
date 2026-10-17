import { GPSCoordinate } from '../types/workout';

/**
 * Calculates distance between two GPS coordinates using Haversine formula in meters
 */
export function calculateDistanceMeters(coord1: GPSCoordinate, coord2: GPSCoordinate): number {
  const R = 6371e3; // Earth radius in meters
  const lat1Rad = (coord1.lat * Math.PI) / 180;
  const lat2Rad = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format pace in seconds/km to "M:SS /km"
 */
export function formatPace(paceSeconds: number): string {
  if (!isFinite(paceSeconds) || paceSeconds <= 0 || paceSeconds > 3600) {
    return '--:-- /km';
  }
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

/**
 * Format pace for clean typography like "4:00 /km"
 */
export function formatPaceShort(paceSeconds: number): string {
  if (!isFinite(paceSeconds) || paceSeconds <= 0 || paceSeconds > 3600) {
    return '-:-- /km';
  }
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

/**
 * Format duration into "1h 12min" or "45min" or "00:45"
 */
export function formatDurationStory(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  if (minutes > 0) {
    return `${minutes}min ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format duration into digital clock "HH:MM:SS" or "MM:SS"
 */
export function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Estimate calories burned during running based on weight and distance/speed
 * Standard ACSM formula: kcal ~ MET * weightKg * hours
 * Running averages ~ 1 kcal per kg per km
 */
export function estimateCalories(distanceMeters: number, durationSeconds: number, weightKg: number = 72): number {
  if (distanceMeters <= 0 || durationSeconds <= 0) return 0;
  const km = distanceMeters / 1000;
  // Approximately 1.036 kcal per kg per km
  const calories = km * weightKg * 1.036;
  return Math.round(calories);
}

/**
 * Normalizes an array of GPS coordinates to fit perfectly inside an SVG / Canvas bounding box
 * for rendering the Strava-style route shape regardless of GPS coordinates location.
 * Accurately handles straight line routes (north-south, east-west, diagonal) without distortion
 * or magnifying microscopic GPS jitter.
 */
export function projectCoordinatesToCanvas(
  coordinates: GPSCoordinate[],
  width: number,
  height: number,
  padding: number = 30
): { x: number; y: number }[] {
  if (!coordinates || coordinates.length === 0) return [];
  if (coordinates.length === 1) return [{ x: width / 2, y: height / 2 }];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const c of coordinates) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }

  const rawLatSpan = maxLat - minLat;
  const rawLngSpan = maxLng - minLng;

  // Cosine of mean latitude for true spherical projection to flat canvas
  const meanLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.2, Math.cos((meanLat * Math.PI) / 180));

  // Convert raw angular span to approximate meters (1 deg lat ~ 111,139m)
  const METERS_PER_DEG_LAT = 111139;
  const METERS_PER_DEG_LNG = 111139 * cosLat;

  const latMeters = rawLatSpan * METERS_PER_DEG_LAT;
  const lngMeters = rawLngSpan * METERS_PER_DEG_LNG;

  // If total displacement is minimal (e.g. user moved very little or stood still),
  // avoid division by zero or jitter explosion.
  const maxDisplacementMeters = Math.max(latMeters, lngMeters);
  const minThresholdMeters = 8; // At least 8 meters of spatial dimension

  // Determine effective metric spans preserving true geographical aspect ratio
  const effectiveLatMeters = Math.max(latMeters, maxDisplacementMeters > minThresholdMeters ? 0.0001 : minThresholdMeters);
  const effectiveLngMeters = Math.max(lngMeters, maxDisplacementMeters > minThresholdMeters ? 0.0001 : minThresholdMeters);

  // Available drawing area
  const drawWidth = Math.max(10, width - padding * 2);
  const drawHeight = Math.max(10, height - padding * 2);

  // Calculate scale preserving isotropic (1:1) physical aspect ratio
  const scale = Math.min(
    drawWidth / (effectiveLngMeters || 1),
    drawHeight / (effectiveLatMeters || 1)
  );

  const contentWidth = effectiveLngMeters * scale;
  const contentHeight = effectiveLatMeters * scale;

  const xOffset = padding + (drawWidth - contentWidth) / 2;
  const yOffset = padding + (drawHeight - contentHeight) / 2;

  return coordinates.map((c) => {
    const xDistMeters = (c.lng - minLng) * METERS_PER_DEG_LNG;
    const yDistMeters = (maxLat - c.lat) * METERS_PER_DEG_LAT; // Inverted latitude (North is up)
    const x = xOffset + xDistMeters * scale;
    const y = yOffset + yDistMeters * scale;
    return { x, y };
  });
}
