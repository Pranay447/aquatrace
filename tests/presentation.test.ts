import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoTds,
  presentationRows,
  presentSnapshot,
} from "../lib/presentation";
import type { Snapshot } from "../lib/domain";
import { harbourReference } from "../lib/freshwater";
test("clean and dirty scenarios fluctuate within distinct, valid TDS ranges", () => {
  const clean = [],
    dirty = [];
  for (let i = 0; i < 100; i++) {
    clean.push(demoTds("clean", i * 5000));
    dirty.push(demoTds("dirty", i * 5000));
  }
  assert.ok(clean.every((v) => v >= 101 && v <= 119));
  assert.ok(dirty.every((v) => v >= 926 && v <= 974));
  assert.ok(new Set(clean).size > 10);
  assert.ok(new Set(dirty).size > 10);
});
test("presentation chart retains clean baseline then dirty spike without measured temperature", () => {
  const rows = presentationRows(
    {
      events: [
        { mode: "clean", at: 0 },
        { mode: "dirty", at: 60000 },
      ],
    },
    0,
    90000,
  );
  assert.ok(rows[0].tdsPpm < 120);
  assert.ok(rows.at(-1)!.tdsPpm > 900);
  assert.ok(
    rows.every((r) => r.temperatureC === null && r.turbidityNtu === null),
  );
});
test("undo restores real snapshot; presentation leaves input and offline reference untouched", () => {
  const actual = {
    localMode: true,
    demo: false,
    sensors: [
      { ...harbourReference, id: "S04", reference: undefined, latest: null },
      harbourReference,
    ],
    alerts: [],
  } as unknown as Snapshot;
  const original = JSON.stringify(actual);
  const shown = presentSnapshot(
    actual,
    { events: [{ mode: "dirty", at: 0 }] },
    5000,
  );
  assert.equal(shown.demo, true);
  assert.equal(shown.presentation?.mode, "dirty");
  assert.equal(shown.sensors[0].quality, "Poor");
  assert.equal(shown.sensors[1], harbourReference);
  assert.equal(JSON.stringify(actual), original);
  assert.deepEqual(
    presentSnapshot(actual, { events: [] }).sensors,
    actual.sensors,
  );
});
