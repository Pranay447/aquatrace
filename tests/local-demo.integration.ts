import assert from "node:assert/strict";
import { db } from "../lib/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
async function main() {
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      email: "admin@aquatrace.local",
      password: "AquaTrace-demo-2026!",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const read = async (path: string) => {
    const r = await fetch(base + "/api/" + path, {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const snap = await read("workspace");
  assert.equal(snap.localMode, true);
  assert.deepEqual(snap.sensors.map((s: { id: string }) => s.id).sort(), [
    "S04",
    "SYD01",
  ]);
  const live = snap.sensors.find((s: { id: string }) => s.id === "S04"),
    ref = snap.sensors.find((s: { id: string }) => s.id === "SYD01");
  const measured = await db.reading.findFirst({
    where: {
      deviceId: "S04",
      OR: [
        { firmwareVersion: { startsWith: "tds-demo-" } },
        { firmwareVersion: { startsWith: "tds-temp-" } },
      ],
      tdsAdc: { not: null },
    },
    orderBy: { timestamp: "desc" },
  });
  assert.equal(live.latest?.tdsPpm ?? null, measured?.tdsPpm ?? null);
  assert.equal(ref.connectivity, "Offline");
  assert.equal(ref.latest, null);
  assert.equal(ref.lastSeen, null);
  assert.equal(ref.reference.turbidityNtu, 2.4);
  assert.ok(
    snap.alerts.every(
      (a: { deviceId: string; kind: string; message: string }) =>
        a.deviceId === "S04" &&
        a.kind !== "RAPID_RISE" &&
        (a.kind !== "THRESHOLD" || a.message.startsWith("TDS ")),
    ),
  );
  const history = await read("history?ids=S04,SYD01&range=30d");
  assert.equal(history.measuredOnly, true);
  assert.ok(
    history.rows.every(
      (r: {
        deviceId: string;
        turbidityNtu: null;
        temperatureC: number | null;
      }) =>
        r.deviceId === "S04" &&
        r.turbidityNtu === null &&
        (r.temperatureC === null || Number.isFinite(r.temperatureC)),
    ),
  );
  assert.equal((await read("history?ids=S03&range=1h")).rows.length, 0);
  const rank = await read("ranking?days=30");
  assert.ok(
    rank.rows.every(
      (r: { deviceId: string; ntu: null; increase: null }) =>
        r.deviceId === "S04" && r.ntu === null && r.increase === null,
    ),
  );
  await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookie, Origin: base },
  });
  console.log(
    "Local demonstration passed: exactly two points, sourced offline reference, real-upload history, measured TDS only, no synthetic-channel alerts or rankings.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
