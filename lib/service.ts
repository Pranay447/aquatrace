import { freshwaterQuality, harbourReference } from "./freshwater";
import { presentSnapshot } from "./presentation";
import { presentationState } from "./presentation-store";
import { db } from "./db";
import {
  defaults,
  thresholdsSchema,
  classify,
  connectivity,
  evaluateAlerts,
  difference,
  isTdsDemo,
  hasMeasuredTemperature,
  isMeasuredTdsFirmware,
  type Thresholds,
  type Snapshot,
} from "./domain";
import type { User } from "@prisma/client";
export async function settings() {
  const s = await db.setting.findUnique({ where: { id: "network" } });
  return {
    thresholds: thresholdsSchema.parse(s?.thresholds ?? defaults),
    staleSeconds: s?.staleSeconds ?? 60,
  };
}
export async function reconcileAlerts(
  deviceId: string,
  rules: ReturnType<typeof evaluateAlerts>,
  kinds = ["THRESHOLD", "RAPID_RISE"],
) {
  await db.$transaction(async (tx) => {
    for (const kind of kinds) {
      const rule = rules.find((r) => r.kind === kind);
      const key = `${deviceId}:${kind}`;
      if (rule)
        await tx.alert.upsert({
          where: { activeKey: key },
          create: { deviceId, ...rule, activeKey: key },
          update: { message: rule.message, severity: rule.severity },
        });
      else
        await tx.alert.updateMany({
          where: { activeKey: key },
          data: { state: "RESOLVED", activeKey: null, resolvedBy: "SYSTEM" },
        });
    }
  });
}
export async function snapshot(user: User): Promise<Snapshot> {
  const config = await settings();
  const localMode = process.env.LOCAL_DEMONSTRATION === "true";
  const all = await db.sensor.findMany({
    where: localMode ? { id: "S04" } : {},
    orderBy: { flowOrder: "asc" },
    include: {
      readings: {
        where: localMode
          ? {
              OR: [
                { firmwareVersion: { startsWith: "tds-demo-" } },
                { firmwareVersion: { startsWith: "tds-temp-" } },
              ],
              tdsAdc: { not: null },
            }
          : {},
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });
  const locationLogs = await db.auditLog.findMany({
    where: {
      action: {
        in: ["UPDATE_SENSOR_LOCATION", "UPDATE_SENSOR", "CREATE_SENSOR"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  for (const s of all) {
    const state = s.enabled
      ? connectivity(
          localMode ? (s.readings[0]?.timestamp ?? null) : s.lastSeen,
          config.staleSeconds,
        )
      : "Offline";
    await reconcileAlerts(
      s.id,
      state === "Online"
        ? []
        : [
            {
              kind: state === "Stale" ? "STALE" : "OFFLINE",
              severity: "WARNING",
              message:
                state === "Stale"
                  ? "No recent upload. Check connectivity."
                  : "Device offline. Check power and wireless coverage.",
            },
          ],
      ["STALE", "OFFLINE"],
    );
  }
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const aggregates = await db.reading.groupBy({
    by: ["deviceId"],
    where: {
      timestamp: { gte: dayStart },
      ...(localMode
        ? {
            deviceId: "S04",
            OR: [
              { firmwareVersion: { startsWith: "tds-demo-" } },
              { firmwareVersion: { startsWith: "tds-temp-" } },
            ],
            tdsAdc: { not: null },
          }
        : {}),
    },
    _avg: { tdsPpm: true, turbidityNtu: true, temperatureC: true },
    _max: { tdsPpm: true },
  });
  const temperatureAverages = await db.reading.groupBy({
    by: ["deviceId"],
    where: {
      timestamp: { gte: dayStart },
      firmwareVersion: { startsWith: "tds-temp-" },
      tdsAdc: { not: null },
    },
    _avg: { temperatureC: true },
  });
  const baselines = await Promise.all(
    all.map((s) =>
      db.reading.findFirst({
        where: {
          deviceId: s.id,
          timestamp: {
            gte: new Date(Date.now() - 20 * 60_000),
            lte: new Date(Date.now() - 15 * 60_000),
          },
        },
        orderBy: { timestamp: "asc" },
      }),
    ),
  );
  const sensors: Snapshot["sensors"] = all.map((s, i) => {
    const locationLog = locationLogs.find((l) => l.target === s.id);
    const location = locationLog?.details as
      | {
          latitude?: number;
          longitude?: number;
          source?: string;
          accuracyM?: number;
        }
      | undefined;
    const matches =
      location &&
      location.latitude === s.latitude &&
      location.longitude === s.longitude;
    const latest = s.readings[0];
    const state = s.enabled
      ? connectivity(
          localMode ? (s.readings[0]?.timestamp ?? null) : s.lastSeen,
          config.staleSeconds,
        )
      : "Offline";
    const t = thresholdsSchema.parse(s.thresholds ?? config.thresholds);
    const avg = aggregates.find((a) => a.deviceId === s.id);
    const { readings: _, ...rest } = s;
    void _;
    return {
      ...rest,
      battery: localMode ? null : s.battery,
      locationSource: matches
        ? location?.source === "LAPTOP_BROWSER"
          ? ("LAPTOP_BROWSER" as const)
          : ("CONFIGURED" as const)
        : s.demo
          ? ("UNSET" as const)
          : ("CONFIGURED" as const),
      locationAccuracyM:
        matches && typeof location?.accuracyM === "number"
          ? location.accuracyM
          : null,
      demo: localMode ? false : s.demo || isTdsDemo(s.firmwareVersion),
      firmwareVersion: s.firmwareVersion,
      tdsOnly: localMode || isMeasuredTdsFirmware(s.firmwareVersion),
      measuredTemperature: hasMeasuredTemperature(latest?.firmwareVersion),
      averageTemperatureC:
        temperatureAverages.find((a) => a.deviceId === s.id)?._avg
          .temperatureC ?? null,
      lastSeen:
        (localMode ? latest?.timestamp : s.lastSeen)?.toISOString() ?? null,
      createdAt: undefined,
      thresholds: s.thresholds ? t : null,
      latest: latest
        ? {
            tdsPpm: latest.tdsPpm,
            turbidityNtu: latest.turbidityNtu,
            temperatureC: latest.temperatureC,
            timestamp: latest.timestamp.toISOString(),
          }
        : null,
      quality:
        state === "Online" && latest
          ? localMode || isMeasuredTdsFirmware(s.firmwareVersion)
            ? freshwaterQuality(latest.tdsPpm)
            : classify(latest, t)
          : ("Offline" as const),
      connectivity: state,
      average: {
        tdsPpm: avg?._avg.tdsPpm ?? 0,
        turbidityNtu: avg?._avg.turbidityNtu ?? 0,
        temperatureC: avg?._avg.temperatureC ?? 0,
      },
      peakTds: avg?._max.tdsPpm ?? 0,
      recentIncrease:
        !localMode && latest && baselines[i]
          ? (difference(baselines[i]!.turbidityNtu, latest.turbidityNtu)
              .percent ?? 0)
          : 0,
    };
  });
  const alerts = await db.alert.findMany({
    where: localMode
      ? {
          deviceId: "S04",
          OR: [
            { kind: { notIn: ["THRESHOLD", "RAPID_RISE"] } },
            { kind: "THRESHOLD", message: { startsWith: "TDS " } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return presentSnapshot(
    {
      localMode: process.env.LOCAL_DEMONSTRATION === "true",
      sensors: localMode ? [...sensors, harbourReference] : sensors,
      alerts: alerts.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      settings: config,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        adminRequested: user.adminRequested,
      },
      demo: sensors.some((s) => s.demo),
      syncedAt: new Date().toISOString(),
    },
    await presentationState(),
  );
}
export function sensorThresholds(value: unknown, fallback: Thresholds) {
  return value ? thresholdsSchema.parse(value) : fallback;
}
