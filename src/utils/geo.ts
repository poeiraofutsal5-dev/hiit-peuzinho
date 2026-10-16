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
 */
export function projectCoordinatesToCanvas(
  coordinates: GPSCoordinate[],
  width: number,
  height: number,
  padding: number = 30
): { x: number; y: number }[] {
  if (coordinates.length === 0) return [];
  if (coordinates.length === 1) return [{ x: width / 2, y: height / 2 }];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  coordinates.forEach((c) => {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  });

  const latSpan = maxLat - minLat || 0.0001;
  const lngSpan = maxLng - minLng || 0.0001;

  // Preserve aspect ratio
  const drawWidth = width - padding * 2;
  const drawHeight = height - padding * 2;

  // Note: Latitude increases north (up), so Canvas Y should be inverted
  const scale = Math.min(drawWidth / lngSpan, drawHeight / latSpan);
  const xOffset = padding + (drawWidth - lngSpan * scale) / 2;
  const yOffset = padding + (drawHeight - latSpan * scale) / 2;

  return coordinates.map((c) => {
    const x = xOffset + (c.lng - minLng) * scale;
    const y = yOffset + (maxLat - c.lat) * scale; // Inverted latitude
    return { x, y };
  });
}
