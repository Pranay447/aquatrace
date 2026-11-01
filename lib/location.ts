import { z } from "zod";
export const locationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(10_000_000),
  })
  .strict();
export type SensorLocation = z.infer<typeof locationSchema>;
export function locationError(code: number) {
  if (code === 1)
    return "Location permission was denied. Allow location for localhost in your browser and Windows Location settings, then try again.";
  if (code === 2)
    return "Location is unavailable. Check Windows Location settings and your connection, or enter coordinates in Configure.";
  if (code === 3)
    return "Location request timed out. Try again, or enter coordinates in Configure.";
  return "Unable to get the sensor location. Try again or enter coordinates in Configure.";
}
export function distanceMetres(
  a: Pick<SensorLocation, "latitude" | "longitude">,
  b: Pick<SensorLocation, "latitude" | "longitude">,
) {
  const rad = Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * rad,
    deltaLon = (b.longitude - a.longitude) * rad;
  const term =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(term)));
}
