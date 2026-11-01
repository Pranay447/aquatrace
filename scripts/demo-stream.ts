if (process.env.LOCAL_DEMONSTRATION === "true")
  throw new Error(
    "Synthetic stream is disabled for the live local demonstration.",
  );
import { db } from "../lib/db";
if (process.env.DEMO_MODE !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Local demo mode required");
async function tick() {
  const sensors = await db.sensor.findMany({
    where: { demo: true, enabled: true, id: { notIn: ["S08", "S13"] } },
  });
  for (const s of sensors) {
    const key = process.env[`DEVICE_KEY_${s.id}`];
    if (!key) continue;
    const last = await db.reading.findFirst({
      where: { deviceId: s.id },
      orderBy: { timestamp: "desc" },
    });
    if (!last) continue;
    try {
      const res = await fetch(`${process.env.APP_URL}/api/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Key": key },
        body: JSON.stringify({
          deviceId: s.id,
          timestamp: new Date().toISOString(),
          tdsPpm: Math.max(0, last.tdsPpm + (Math.random() - 0.5) * 0.5),
          turbidityNtu: Math.max(
            0,
            last.turbidityNtu + (Math.random() - 0.5) * 0.05,
          ),
          temperatureC: 22.6,
          raw: { turbidityAdc: 1840, tdsAdc: 1260 },
          firmwareVersion: "demo-1.0.0",
        }),
      });
      if (!res.ok) console.error(s.id, res.status);
    } catch {
      console.error("Start the app before the simulator.");
    }
  }
}
console.log(
  "Streaming demo telemetry through the authenticated API every five seconds.",
);
async function run() {
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, 5000));
  }
}
run().finally(() => db.$disconnect());
