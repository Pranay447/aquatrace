import { db } from "../lib/db";
import { passwordHash } from "../lib/auth";
import { defaults, evaluateAlerts } from "../lib/domain";
import { reconcileAlerts } from "../lib/service";
import { demoLocations, demoBatteries } from "../lib/demo-locations";
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true")
    throw new Error("Demo seed requires local development and DEMO_MODE=true");
  await db.setting.upsert({
    where: { id: "network" },
    create: { id: "network", thresholds: defaults, staleSeconds: 60 },
    update: {},
  });
  for (const [email, name, role] of [
    ["maya.chen@aquatrace.local", "Maya Chen", "USER"],
    ["admin@aquatrace.local", "Network Administrator", "ADMIN"],
  ] as const)
    await db.user.upsert({
      where: { email },
      create: {
        email,
        name,
        role,
        passwordHash: passwordHash("AquaTrace-demo-2026!"),
      },
      update: {},
    });
  const names = [
    "North Headwaters",
    "Riverside Bridge",
    "Upstream Channel",
    "Industrial Outlet",
    "East Channel",
    "Lower River Bend",
    "South Channel",
    "Riverside Reserve",
    "West Tributary",
    "Millbrook Crossing",
    "Wetland Inlet",
    "Harbor Approach",
    "Southbank Outlet",
    "Estuary Station",
  ];
  const tds = [62, 84, 140, 310, 285, 116, 210, 92, 95, 103, 78, 125, 84, 96];
  const ntu = [
    2.8, 3.6, 7.8, 18.7, 16.1, 5.2, 11.3, 4.4, 4.4, 4.9, 3.5, 5.8, 3.6, 4.7,
  ];
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const id = `S${String(i + 1).padStart(2, "0")}`;
    const offline = [7, 12].includes(i);
    const latest = now - (offline ? 4 * 3600_000 : 0);
    await db.sensor.upsert({
      where: { id },
      create: {
        id,
        name: names[i],
        latitude: demoLocations[i][0],
        longitude: demoLocations[i][1],
        mac: `24:6F:28:1A:B3:${(0x10 + i).toString(16).toUpperCase()}`,
        flowOrder: i + 1,
        demo: true,
        battery: demoBatteries[i],
        lastSeen: new Date(latest),
      },
      update: { lastSeen: new Date(latest) },
    });
    const rows = [];
    for (let h = 720; h >= 0; h--) {
      const factor = 1 + Math.sin(h * 0.8 + i) * 0.08;
      rows.push({
        deviceId: id,
        timestamp: new Date(latest - h * 3600_000),
        tdsPpm: tds[i] * factor,
        turbidityNtu: ntu[i] * factor,
        temperatureC: 22 + Math.sin(h * 0.2) * 2,
      });
    }
    for (let m = 59; m >= 0; m--) {
      const factor =
        (i === 3 || i === 4) && m > 20
          ? 0.45
          : 1 + Math.sin(m * 0.8 + i) * 0.035;
      rows.push({
        deviceId: id,
        timestamp: new Date(latest - m * 60_000),
        tdsPpm: tds[i] * factor,
        turbidityNtu: ntu[i] * factor,
        temperatureC: 22.6,
      });
    }
    await db.reading.createMany({ data: rows, skipDuplicates: true });
    await reconcileAlerts(
      id,
      evaluateAlerts(
        { tdsPpm: tds[i], turbidityNtu: ntu[i], temperatureC: 22.6 },
        null,
      ),
    );
  }
  console.log(
    "Seeded 14 East River demo devices and local-only user/admin accounts.",
  );
}
main().finally(() => db.$disconnect());
