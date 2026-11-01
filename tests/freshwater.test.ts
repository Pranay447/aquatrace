import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshwaterQuality,
  freshwaterAlerts,
  harbourReference,
} from "../lib/freshwater";
import { locationSchema, distanceMetres } from "../lib/location";
test("NHMRC palatability boundaries and instrument range are distinct", () => {
  for (const [ppm, status] of [
    [0, "Safe"],
    [600, "Safe"],
    [600.01, "Moderate"],
    [900, "Moderate"],
    [900.01, "Poor"],
    [1000, "Poor"],
    [1000.01, "Critical"],
  ] as const)
    assert.equal(freshwaterQuality(ppm), status);
  const m = { tdsPpm: 100, turbidityNtu: 4000, temperatureC: 80 };
  assert.deepEqual(
    freshwaterAlerts(m),
    [],
    "simulated channels cannot trigger an alert",
  );
  assert.equal(freshwaterAlerts({ ...m, tdsPpm: 601 })[0].severity, "WARNING");
  assert.match(freshwaterAlerts({ ...m, tdsPpm: 901 })[0].message, /poor/);
  assert.match(
    freshwaterAlerts({ ...m, tdsPpm: 1001 })[0].message,
    /instrument-range/,
  );
});
test("harbour reference has no invented last sample and is always offline", () => {
  assert.equal(harbourReference.connectivity, "Offline");
  assert.equal(harbourReference.latest, null);
  assert.equal(harbourReference.lastSeen, null);
  assert.equal(harbourReference.reference?.turbidityNtu, 2.4);
});
test("location validates coordinates and accuracy without accepting extra fields", () => {
  const p = { latitude: -33.85, longitude: 151.21, accuracyM: 12 };
  assert.equal(locationSchema.safeParse(p).success, true);
  for (const patch of [
    { latitude: 91 },
    { longitude: -181 },
    { accuracyM: -1 },
    { accuracyM: NaN },
    { name: "extra" },
  ])
    assert.equal(locationSchema.safeParse({ ...p, ...patch }).success, false);
  assert.equal(distanceMetres(p, p), 0);
  assert.ok(distanceMetres(p, { ...p, latitude: p.latitude + 0.001 }) > 100);
});
