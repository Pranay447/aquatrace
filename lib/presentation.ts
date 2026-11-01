import { z } from "zod";
import type { Snapshot } from "./domain";
import { freshwaterQuality } from "./freshwater";

export const presentationSchema = z.object({
  events: z
    .array(
      z.object({ mode: z.enum(["clean", "dirty"]), at: z.number().finite() }),
    )
    .max(120),
});
export type Presentation = z.infer<typeof presentationSchema>;
export function demoTds(mode: "clean" | "dirty", now: number) {
  const phase = Math.floor(now / 5000);
  const wave = Math.sin(phase * 0.71) * 0.65 + Math.sin(phase * 1.83) * 0.35;
  return (
    Math.round(
      ((mode === "dirty" ? 950 : 110) + wave * (mode === "dirty" ? 24 : 9)) *
        10,
    ) / 10
  );
}
export function presentationRows(
  state: Presentation,
  since: number,
  now = Date.now(),
) {
  if (!state.events.length) return [];
  const start = Math.max(since, state.events[0].at);
  const step = Math.max(5000, Math.ceil((now - start) / 600 / 5000) * 5000);
  const rows = [];
  for (let at = start; at <= now; at += step) {
    const event = state.events.filter((e) => e.at <= at).at(-1);
    if (event)
      rows.push({
        deviceId: "S04",
        timestamp: new Date(at).toISOString(),
        tdsPpm: demoTds(event.mode, at),
        turbidityNtu: null,
        temperatureC: null,
      });
  }
  return rows;
}
export function presentSnapshot(
  snapshot: Snapshot,
  state: Presentation,
  now = Date.now(),
): Snapshot {
  const event = state.events.at(-1);
  if (!event) return { ...snapshot, presentation: { mode: "live" } };
  const tdsPpm = demoTds(event.mode, now);
  const timestamp = new Date(now).toISOString();
  return {
    ...snapshot,
    demo: true,
    presentation: { mode: event.mode },
    sensors: snapshot.sensors.map((s) =>
      s.id !== "S04"
        ? s
        : {
            ...s,
            demo: true,
            measuredTemperature: false,
            averageTemperatureC: null,
            connectivity: "Online",
            quality: freshwaterQuality(tdsPpm),
            lastSeen: timestamp,
            latest: {
              tdsPpm,
              turbidityNtu: 0,
              temperatureC: s.latest?.temperatureC ?? 0,
              timestamp,
            },
            average: { ...s.average, tdsPpm },
            peakTds: tdsPpm,
          },
    ),
    alerts:
      event.mode === "dirty"
        ? [
            {
              id: "presentation-tds",
              deviceId: "S04",
              kind: "DEMO",
              severity: "WARNING",
              state: "OPEN",
              message:
                "DEMO: elevated TDS sample, approximately 950 ppm. This is a presentation scenario, not a sensor measurement.",
              createdAt: new Date(event.at).toISOString(),
              updatedAt: timestamp,
              acknowledgedBy: null,
              resolvedBy: null,
            },
            ...snapshot.alerts,
          ]
        : snapshot.alerts,
  };
}
