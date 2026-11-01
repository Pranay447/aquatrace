import { z } from "zod";
export const thresholdsSchema = z
  .object({
    turbidityGood: z.number().min(0).max(1000),
    turbidityCritical: z.number().min(0).max(1000),
    tdsGood: z.number().min(0).max(5000),
    tdsCritical: z.number().min(0).max(5000),
    tempCriticalLow: z.number().min(-10).max(60),
    tempGoodLow: z.number().min(-10).max(60),
    tempGoodHigh: z.number().min(-10).max(60),
    tempCriticalHigh: z.number().min(-10).max(60),
  })
  .refine(
    (t) =>
      t.turbidityGood < t.turbidityCritical &&
      t.tdsGood < t.tdsCritical &&
      t.tempCriticalLow < t.tempGoodLow &&
      t.tempGoodLow < t.tempGoodHigh &&
      t.tempGoodHigh < t.tempCriticalHigh,
    "Thresholds must be ordered",
  );
export type Thresholds = z.infer<typeof thresholdsSchema>;
export const defaults: Thresholds = {
  turbidityGood: 5,
  turbidityCritical: 20,
  tdsGood: 300,
  tdsCritical: 600,
  tempCriticalLow: 10,
  tempGoodLow: 15,
  tempGoodHigh: 30,
  tempCriticalHigh: 35,
};
export type Quality = "Safe" | "Moderate" | "Poor" | "Critical" | "Offline";
export type Metrics = {
  turbidityNtu: number;
  tdsPpm: number;
  temperatureC: number;
};
export const telemetrySchema = z
  .object({
    deviceId: z.string().regex(/^[A-Z][A-Z0-9_-]{1,31}$/),
    timestamp: z.iso.datetime({ offset: true }),
    turbidityNtu: z.number().min(0).max(4000).optional(),
    tdsPpm: z.number().min(0).max(10000),
    temperatureC: z.number().min(-10).max(85),
    raw: z
      .object({
        turbidityAdc: z.number().int().min(0).max(4095).optional(),
        tdsAdc: z.number().int().min(0).max(4095).optional(),
      })
      .strict()
      .refine(
        (raw) => raw.tdsAdc !== undefined || raw.turbidityAdc !== undefined,
        "Supply at least one real ADC reading",
      )
      .optional(),
    firmwareVersion: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine(
    (p) =>
      p.turbidityNtu !== undefined || hasMeasuredTemperature(p.firmwareVersion),
    "Turbidity may be omitted only by firmware that identifies its disconnected channel",
  )
  .refine(
    (p) =>
      !hasMeasuredTemperature(p.firmwareVersion) ||
      (p.temperatureC >= 0 &&
        p.temperatureC <= 50 &&
        p.raw?.tdsAdc !== undefined),
    "DS18B20 firmware requires a valid 0–50 °C water reading and TDS ADC sample",
  )
  // The legacy database column is required. This placeholder is never exposed as a measurement.
  .transform((p) => ({ ...p, turbidityNtu: p.turbidityNtu ?? 0 }));
export function validTime(timestamp: string, now = Date.now()) {
  const t = Date.parse(timestamp);
  return t <= now + 60_000 && t >= now - 24 * 3600_000;
}
export function isTdsDemo(firmwareVersion: string | null | undefined) {
  return firmwareVersion?.startsWith("tds-demo-") ?? false;
}
export function hasMeasuredTemperature(
  firmwareVersion: string | null | undefined,
) {
  return firmwareVersion?.startsWith("tds-temp-") ?? false;
}
export function isMeasuredTdsFirmware(
  firmwareVersion: string | null | undefined,
) {
  return isTdsDemo(firmwareVersion) || hasMeasuredTemperature(firmwareVersion);
}
export function classify(m: Metrics, t: Thresholds = defaults): Quality {
  if (
    m.turbidityNtu > t.turbidityCritical ||
    m.tdsPpm > t.tdsCritical ||
    m.temperatureC < t.tempCriticalLow ||
    m.temperatureC > t.tempCriticalHigh
  )
    return "Critical";
  if (
    m.turbidityNtu >= t.turbidityGood ||
    m.tdsPpm >= t.tdsGood ||
    m.temperatureC < t.tempGoodLow ||
    m.temperatureC > t.tempGoodHigh
  )
    return m.turbidityNtu > (t.turbidityGood + t.turbidityCritical) / 2 ||
      m.tdsPpm > (t.tdsGood + t.tdsCritical) / 2
      ? "Poor"
      : "Moderate";
  return "Safe";
}
export function connectivity(
  lastSeen: string | Date | null,
  staleSeconds = 60,
  now = Date.now(),
): "Online" | "Stale" | "Offline" {
  if (!lastSeen) return "Offline";
  const age = now - new Date(lastSeen).getTime();
  return age > staleSeconds * 3000
    ? "Offline"
    : age > staleSeconds * 1000
      ? "Stale"
      : "Online";
}
export type AlertRule = {
  kind: string;
  severity: "CRITICAL" | "WARNING";
  message: string;
};
export function evaluateAlerts(
  current: Metrics,
  previous: Metrics | null,
  t: Thresholds = defaults,
): AlertRule[] {
  const rules: AlertRule[] = [];
  if (classify(current, t) === "Critical")
    rules.push({
      kind: "THRESHOLD",
      severity: "CRITICAL",
      message:
        "A reading exceeded a configured critical threshold. Inspect the sensor and local conditions.",
    });
  else if (classify(current, t) !== "Safe")
    rules.push({
      kind: "THRESHOLD",
      severity: "WARNING",
      message: "A reading entered the configured attention range.",
    });
  if (
    previous &&
    previous.turbidityNtu > 0 &&
    (current.turbidityNtu - previous.turbidityNtu) / previous.turbidityNtu > 0.3
  )
    rules.push({
      kind: "RAPID_RISE",
      severity: "WARNING",
      message: "Turbidity increased by more than 30% within 20 minutes.",
    });
  return rules;
}
export function canManage(role: string) {
  return role === "ADMIN";
}
export function difference(a: number, b: number) {
  return { absolute: b - a, percent: a === 0 ? null : ((b - a) / a) * 100 };
}
export function sourceInsight(a: Metrics, b: Metrics) {
  const t = difference(a.turbidityNtu, b.turbidityNtu),
    d = difference(a.tdsPpm, b.tdsPpm);
  return (
    (t.absolute > 2 && (t.percent ?? 0) > 30) ||
    (d.absolute > 50 && (d.percent ?? 0) > 30)
  );
}
export type ReadingDTO = Metrics & { timestamp: string };
export type SensorDTO = {
  measuredTemperature?: boolean;
  averageTemperatureC?: number | null;
  tdsOnly?: boolean;
  reference?: {
    period: string;
    turbidityNtu: number;
    monthlyAverageLow: number;
    monthlyAverageHigh: number;
    source: string;
    description: string;
  };
  id: string;
  name: string;
  network: string;
  latitude: number;
  longitude: number;
  locationSource?: "LAPTOP_BROWSER" | "CONFIGURED" | "UNSET";
  locationAccuracyM?: number | null;
  mac: string;
  connectionType: string;
  intervalSeconds: number;
  flowOrder: number;
  enabled: boolean;
  demo: boolean;
  battery: number | null;
  lastSeen: string | null;
  firmwareVersion: string | null;
  thresholds: Thresholds | null;
  latest: ReadingDTO | null;
  quality: Quality;
  connectivity: "Online" | "Stale" | "Offline";
  average: Metrics;
  peakTds: number;
  recentIncrease: number;
};
export type AlertDTO = {
  id: string;
  deviceId: string;
  kind: string;
  severity: string;
  state: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedBy: string | null;
  resolvedBy: string | null;
};
export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  adminRequested: boolean;
};
export type Snapshot = {
  presentation?: { mode: "live" | "clean" | "dirty" };
  localMode: boolean;
  sensors: SensorDTO[];
  alerts: AlertDTO[];
  user: UserDTO;
  settings: { thresholds: Thresholds; staleSeconds: number };
  demo: boolean;
  syncedAt: string;
};
