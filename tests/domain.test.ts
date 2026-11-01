import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  telemetrySchema,
  validTime,
  classify,
  evaluateAlerts,
  canManage,
  sourceInsight,
  difference,
  connectivity,
  thresholdsSchema,
  isTdsDemo,
} from "../lib/domain";
import { passwordHash, verifyPassword } from "../lib/auth";
const good = { turbidityNtu: 4.8, tdsPpm: 215.4, temperatureC: 22.6 };
test("TDS-only demo accepts only real ADC fields and preserves its explicit provenance", () => {
  const value = {
    deviceId: "S04",
    timestamp: new Date().toISOString(),
    ...good,
    raw: { tdsAdc: 1260 },
    firmwareVersion: "tds-demo-1.0.0",
  };
  assert.equal(telemetrySchema.safeParse(value).success, true);
  assert.equal(telemetrySchema.safeParse({ ...value, raw: {} }).success, false);
  assert.equal(isTdsDemo(value.firmwareVersion), true);
  assert.equal(isTdsDemo("1.0.0"), false);
  assert.equal(isTdsDemo(null), false);
});
test("telemetry validates numbers, ADC ranges, shape and ISO timestamps", () => {
  const payload = {
    deviceId: "S04",
    timestamp: new Date().toISOString(),
    ...good,
    raw: { turbidityAdc: 1840, tdsAdc: 1260 },
  };
  assert.equal(telemetrySchema.safeParse(payload).success, true);
  for (const patch of [
    { tdsPpm: -1 },
    { turbidityNtu: NaN },
    { temperatureC: 100 },
    { tdsPpm: "215" },
    { deviceId: "../secret" },
    { raw: { tdsAdc: 4096 } },
    { timestamp: "tomorrow" },
    { extra: "unexpected" },
  ])
    assert.equal(
      telemetrySchema.safeParse({ ...payload, ...patch }).success,
      false,
    );
});
test("time validation rejects future and over-one-day-old readings", () => {
  const now = Date.now();
  assert.ok(validTime(new Date(now).toISOString(), now));
  assert.equal(validTime(new Date(now + 61000).toISOString(), now), false);
  assert.equal(validTime(new Date(now - 86400001).toISOString(), now), false);
});
test("editable threshold classification respects exact boundaries", () => {
  assert.equal(classify(good), "Safe");
  assert.equal(classify({ ...good, turbidityNtu: 5 }), "Moderate");
  assert.equal(classify({ ...good, turbidityNtu: 18.7 }), "Poor");
  assert.equal(classify({ ...good, turbidityNtu: 20 }), "Poor");
  assert.equal(classify({ ...good, turbidityNtu: 20.01 }), "Critical");
  assert.equal(classify({ ...good, tdsPpm: 600 }), "Poor");
  assert.equal(classify({ ...good, tdsPpm: 601 }), "Critical");
  assert.equal(classify({ ...good, temperatureC: 9 }), "Critical");
  assert.equal(classify({ ...good, temperatureC: 10 }), "Moderate");
  assert.equal(classify({ ...good, temperatureC: 35.1 }), "Critical");
  assert.equal(
    classify(good, { ...defaults, turbidityGood: 2, turbidityCritical: 4 }),
    "Critical",
  );
});
test("invalid threshold ordering is rejected", () => {
  assert.equal(
    thresholdsSchema.safeParse({ ...defaults, tdsGood: 700 }).success,
    false,
  );
  assert.equal(
    thresholdsSchema.safeParse({ ...defaults, tempGoodLow: 36 }).success,
    false,
  );
});
test("alerts detect threshold breaches and a strict over-30-percent rise", () => {
  const rules = evaluateAlerts(
    { ...good, turbidityNtu: 26 },
    { ...good, turbidityNtu: 10 },
  );
  assert.deepEqual(
    rules.map((r) => r.kind),
    ["THRESHOLD", "RAPID_RISE"],
  );
  assert.equal(rules[0].severity, "CRITICAL");
  assert.equal(
    evaluateAlerts(
      { ...good, turbidityNtu: 13 },
      { ...good, turbidityNtu: 10 },
    ).some((r) => r.kind === "RAPID_RISE"),
    false,
  );
  assert.equal(evaluateAlerts(good, null).length, 0);
  assert.equal(
    evaluateAlerts(good, { ...good, turbidityNtu: 0 }).some(
      (r) => r.kind === "RAPID_RISE",
    ),
    false,
  );
});
test("stale and offline status derive from last reading", () => {
  const now = Date.now();
  assert.equal(connectivity(new Date(now - 59000), 60, now), "Online");
  assert.equal(connectivity(new Date(now - 61000), 60, now), "Stale");
  assert.equal(connectivity(new Date(now - 181000), 60, now), "Offline");
  assert.equal(connectivity(null), "Offline");
});
test("only administrator role can manage sensors", () => {
  assert.equal(canManage("ADMIN"), true);
  for (const role of ["USER", "admin", "", "OWNER"])
    assert.equal(canManage(role), false);
});
test("source insight needs a meaningful downstream increase", () => {
  assert.equal(sourceInsight(good, { ...good, turbidityNtu: 5 }), false);
  assert.equal(sourceInsight(good, { ...good, turbidityNtu: 9 }), true);
  assert.equal(sourceInsight(good, { ...good, tdsPpm: 350 }), true);
  assert.equal(sourceInsight(good, { ...good, tdsPpm: 200 }), false);
  assert.equal(difference(0, 10).percent, null);
});
test("password hashes are salted and verify without plaintext storage", () => {
  const a = passwordHash("test long password");
  const b = passwordHash("test long password");
  assert.notEqual(a, b);
  assert.ok(verifyPassword("test long password", a));
  assert.equal(verifyPassword("wrong", a), false);
});
