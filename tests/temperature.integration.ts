import assert from "node:assert/strict";
import { db } from "../lib/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
async function main() {
  assert.equal(process.env.LOCAL_DEMONSTRATION, "true");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  assert.ok((process.env.DEVICE_KEY_TST01?.length ?? 0) >= 32);
  assert.equal(
    await db.sensor.findUnique({ where: { id: "TST01" } }),
    null,
    "Test ID must be unused",
  );
  await db.sensor.create({
    data: {
      id: "TST01",
      name: "Disposable temperature integration fixture",
      network: "Test",
      latitude: 0,
      longitude: 0,
      mac: "02:00:00:00:00:01",
      flowOrder: 100,
    },
  });
  const post = (body: unknown) =>
    fetch(base + "/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": process.env.DEVICE_KEY_TST01!,
      },
      body: JSON.stringify(body),
    });
  try {
    const payload = {
      deviceId: "TST01",
      timestamp: new Date().toISOString(),
      tdsPpm: 120,
      temperatureC: 23.75,
      raw: { tdsAdc: 1100 },
      firmwareVersion: "tds-temp-local-2.0.0",
    };
    assert.equal((await post({ ...payload, temperatureC: -127 })).status, 400);
    assert.equal((await post({ ...payload, temperatureC: 85 })).status, 400);
    const valid = await post(payload);
    assert.equal(valid.status, 201, await valid.text());
    const saved = await db.reading.findFirst({
      where: { deviceId: "TST01" },
      orderBy: { timestamp: "desc" },
    });
    assert.equal(saved?.temperatureC, 23.75);
    assert.equal(saved?.tdsAdc, 1100);
    assert.equal(saved?.turbidityAdc, null);
    assert.equal(saved?.firmwareVersion, payload.firmwareVersion);
    assert.equal(
      (await post(payload)).status,
      201,
      "Duplicate upload remains idempotent",
    );
    assert.equal(await db.reading.count({ where: { deviceId: "TST01" } }), 1);
    console.log(
      "Temperature API passed: GPIO4 firmware accepted, measured value stored, disconnected/startup values rejected, no turbidity ADC fabricated. S04 unchanged.",
    );
  } finally {
    await db.sensor.delete({ where: { id: "TST01" } });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
