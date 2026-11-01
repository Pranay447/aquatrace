import { test } from "node:test";
import assert from "node:assert/strict";
import {
  telemetrySchema,
  hasMeasuredTemperature,
  isMeasuredTdsFirmware,
} from "../lib/domain";

const reading = {
  deviceId: "S04",
  timestamp: new Date().toISOString(),
  tdsPpm: 120,
  temperatureC: 23.75,
  raw: { tdsAdc: 1100 },
  firmwareVersion: "tds-temp-local-2.0.0",
};
test("DS18B20 telemetry accepts measured temperature without inventing a turbidity channel", () => {
  const parsed = telemetrySchema.parse(reading);
  assert.equal(parsed.temperatureC, 23.75);
  assert.equal(parsed.turbidityNtu, 0); // Legacy storage placeholder, hidden by channel metadata.
  assert.equal(hasMeasuredTemperature(reading.firmwareVersion), true);
  assert.equal(hasMeasuredTemperature("tds-demo-local-1.0.0"), false);
  assert.equal(isMeasuredTdsFirmware(reading.firmwareVersion), true);
  assert.equal(isMeasuredTdsFirmware("demo-1.0.0"), false);
});
test("DS18B20 rejects disconnected, startup and invalid water-range readings", () => {
  for (const temperatureC of [-127, -1, 50.01, 85, NaN])
    assert.equal(
      telemetrySchema.safeParse({ ...reading, temperatureC }).success,
      false,
    );
  assert.equal(
    telemetrySchema.safeParse({ ...reading, raw: undefined }).success,
    false,
  );
  assert.equal(
    telemetrySchema.safeParse({ ...reading, temperatureC: undefined }).success,
    false,
  );
  assert.equal(
    telemetrySchema.safeParse({ ...reading, firmwareVersion: "1.0.0" }).success,
    false,
  );
});
