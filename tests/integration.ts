import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db } from "../lib/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
  key?: string,
) {
  return fetch(base + "/api/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "X-Device-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(email: string) {
  const response = await request("auth/login", "POST", {
    email,
    password: "AquaTrace-demo-2026!",
    remember: false,
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get("set-cookie")!.split(";")[0];
}
async function main() {
  assert.equal(
    process.env.DEMO_MODE,
    "true",
    "Integration tests require a local seeded demo database",
  );
  for (const path of [
    "workspace",
    "history",
    "export",
    "ranking",
    "audit",
    "requests",
  ])
    assert.equal(
      (await request(path)).status,
      401,
      path + " blocks anonymous read",
    );
  const user = await login("maya.chen@aquatrace.local");
  const admin = await login("admin@aquatrace.local");
  assert.equal(
    (await request("workspace", "GET", undefined, user)).status,
    200,
  );
  assert.equal((await request("sensors", "POST", {}, user)).status, 403);
  assert.equal((await request("settings", "PATCH", {}, user)).status, 403);
  assert.equal((await request("audit", "GET", undefined, user)).status, 403);
  const cross = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { Origin: "https://attacker.invalid", Cookie: user },
  });
  assert.equal(cross.status, 403);
  const email = `test-${randomBytes(5).toString("hex")}@aquatrace.local`;
  const registered = await request("auth/register", "POST", {
    name: "Integration User",
    email,
    password: "Integration-password-2026!",
    adminRequested: true,
  });
  assert.equal(registered.status, 201);
  const registeredCookie = registered.headers.get("set-cookie")!.split(";")[0];
  const me = await (
    await request("workspace", "GET", undefined, registeredCookie)
  ).json();
  assert.equal(me.user.role, "USER");
  assert.equal(me.user.adminRequested, true);
  const sensor = {
    id: "TST01",
    name: "Integration Test Outlet",
    network: "Test",
    latitude: 40.7,
    longitude: -74,
    mac: "02:00:00:00:00:01",
    intervalSeconds: 5,
    connectionType: "Wi-Fi",
    flowOrder: 100,
  };
  await request("sensors/TST01", "DELETE", undefined, admin);
  assert.equal((await request("sensors", "POST", sensor, admin)).status, 201);
  try {
    const location = { latitude: -33.85, longitude: 151.21, accuracyM: 20 };
    assert.equal(
      (await request("sensors/TST01/location", "PATCH", location, user)).status,
      403,
    );
    assert.equal(
      (
        await request(
          "sensors/TST01/location",
          "PATCH",
          { ...location, latitude: 91 },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("sensors/TST01/location", "PATCH", location, admin))
        .status,
      200,
    );
    const located = await db.sensor.findUnique({ where: { id: "TST01" } });
    assert.equal(located?.latitude, location.latitude);
    assert.equal(located?.longitude, location.longitude);
    assert.ok(
      await db.auditLog.findFirst({
        where: { target: "TST01", action: "UPDATE_SENSOR_LOCATION" },
      }),
    );
    const payload = {
      deviceId: "TST01",
      timestamp: new Date().toISOString(),
      turbidityNtu: 25,
      tdsPpm: 700,
      temperatureC: 22.6,
      raw: { turbidityAdc: 1840, tdsAdc: 1260 },
      firmwareVersion: "integration-1",
    };
    const key = process.env.DEVICE_KEY_TST01!;
    assert.ok(
      key?.length >= 32,
      "Configure DEVICE_KEY_TST01 on the local test app",
    );
    assert.equal(
      (await request("device-time", "POST", { deviceId: "TST01" })).status,
      401,
    );
    const clock = await request(
      "device-time",
      "POST",
      { deviceId: "TST01" },
      undefined,
      key,
    );
    assert.equal(clock.status, 200);
    const clockBody = await clock.json();
    assert.ok(Math.abs(clockBody.unixTime - Math.floor(Date.now() / 1000)) < 5);
    assert.deepEqual(Object.keys(clockBody), ["unixTime"]);
    assert.equal((await request("telemetry", "POST", payload)).status, 401);
    assert.equal(
      (
        await request(
          "telemetry",
          "POST",
          { ...payload, tdsPpm: -1 },
          undefined,
          key,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "telemetry",
          "POST",
          { ...payload, timestamp: "2099-01-01T00:00:00Z" },
          undefined,
          key,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("telemetry", "POST", payload, undefined, key)).status,
      201,
    );
    assert.equal(
      (await request("telemetry", "POST", payload, undefined, key)).status,
      201,
      "duplicate is idempotent",
    );
    const snapshot = await (
      await request("workspace", "GET", undefined, admin)
    ).json();
    const testSensor = snapshot.sensors.find(
      (s: { id: string }) => s.id === "TST01",
    );
    assert.equal(testSensor.connectivity, "Online");
    assert.equal(testSensor.quality, "Critical");
    assert.equal(JSON.stringify(snapshot).includes(key), false);
    const alert = snapshot.alerts.find(
      (a: { deviceId: string; kind: string }) =>
        a.deviceId === "TST01" && a.kind === "THRESHOLD",
    );
    assert.ok(alert);
    assert.equal(
      (
        await request(
          "alerts/" + alert.id,
          "PATCH",
          { state: "ACKNOWLEDGED" },
          user,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "alerts/" + alert.id,
          "PATCH",
          { state: "RESOLVED" },
          user,
        )
      ).status,
      200,
    );
    const history = await (
      await request("history?ids=TST01&range=1h", "GET", undefined, user)
    ).json();
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0].tdsPpm, 700);
    for (const range of ["24h", "7d", "30d"]) {
      const response = await request(
        "history?ids=TST01&range=" + range,
        "GET",
        undefined,
        user,
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).rows.length, 1);
    }
    const ranked = await request("ranking?days=7", "GET", undefined, user);
    assert.equal(ranked.status, 200);
    assert.ok(
      (await ranked.json()).rows.some(
        (r: { deviceId: string }) => r.deviceId === "TST01",
      ),
    );
    const delayed = {
      ...payload,
      timestamp: new Date(Date.now() - 20 * 60_000).toISOString(),
      tdsPpm: 100,
    };
    assert.equal(
      (await request("telemetry", "POST", delayed, undefined, key)).status,
      201,
    );
    const afterBackfill = await (
      await request("workspace", "GET", undefined, user)
    ).json();
    assert.equal(
      afterBackfill.sensors.find((s: { id: string }) => s.id === "TST01").latest
        .tdsPpm,
      700,
      "backfill cannot replace live readings",
    );
    const tdsOnly = {
      ...payload,
      timestamp: new Date(Date.parse(payload.timestamp) + 1000).toISOString(),
      raw: { tdsAdc: 1260 },
      firmwareVersion: "tds-demo-1.0.0",
    };
    assert.equal(
      (await request("telemetry", "POST", tdsOnly, undefined, key)).status,
      201,
    );
    const saved = await db.reading.findUnique({
      where: {
        deviceId_timestamp: {
          deviceId: "TST01",
          timestamp: new Date(tdsOnly.timestamp),
        },
      },
    });
    assert.equal(saved?.tdsAdc, 1260);
    assert.equal(saved?.turbidityAdc, null, "no fabricated turbidity ADC");
    const labeled = await (
      await request("workspace", "GET", undefined, user)
    ).json();
    assert.equal(
      labeled.sensors.find((s: { id: string }) => s.id === "TST01").demo,
      true,
    );
    const exported = await request("export?ids=TST01", "GET", undefined, user);
    assert.ok((await exported.text()).includes("not-connected,not-measured"));
    assert.equal(
      (await request("export?ids=TST01", "GET", undefined, user)).headers.get(
        "content-type",
      ),
      "text/csv",
    );
    assert.equal(
      (
        await request(
          "sensors/TST01",
          "PATCH",
          { ...sensor, id: undefined, name: "Updated test outlet" },
          admin,
        )
      ).status,
      200,
    );
    const logs = await (await request("audit", "GET", undefined, admin)).json();
    assert.ok(logs.some((a: { target: string }) => a.target === "TST01"));
    let limited = false;
    for (let i = 0; i < 61; i++) {
      const r = await request(
        "telemetry",
        "POST",
        payload,
        undefined,
        "invalid-key",
      );
      if (r.status === 429) {
        limited = true;
        break;
      }
      assert.equal(r.status, 401);
    }
    assert.ok(
      limited,
      "invalid attempts are rate limited, including across a minute boundary",
    );
  } finally {
    await request("sensors/TST01", "DELETE", undefined, admin);
    await request("auth/logout", "POST", undefined, registeredCookie);
    await db.user.deleteMany({ where: { email } });
  }
  assert.equal(
    (await request("auth/logout", "POST", undefined, user)).status,
    200,
  );
  assert.equal(
    (await request("workspace", "GET", undefined, user)).status,
    401,
    "logout invalidates session",
  );
  console.log(
    "Integration passed: authenticated reads, RBAC, registration approval boundary, telemetry validation/storage/idempotency, alerts, charts, export, admin CRUD, audit, rate limit and logout.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
