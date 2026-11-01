import assert from "node:assert/strict";
import { db } from "../lib/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
async function main() {
  assert.equal(process.env.LOCAL_DEMONSTRATION, "true");
  const existing = await db.setting.findUnique({
    where: { id: "presentation" },
  });
  assert.ok(
    !existing ||
      (existing.thresholds as { events: unknown[] }).events.length === 0,
    "Do not interrupt an active presentation",
  );
  const login = async (email: string) => {
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ email, password: "AquaTrace-demo-2026!" }),
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const admin = await login("admin@aquatrace.local"),
    user = await login("maya.chen@aquatrace.local");
  const mode = async (value: string, cookie = admin) =>
    fetch(base + "/api/presentation", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Cookie: cookie,
      },
      body: JSON.stringify({ mode: value }),
    });
  const read = async (path: string) => {
    const r = await fetch(base + "/api/" + path, {
      headers: { Cookie: admin },
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  try {
    assert.equal((await mode("dirty", user)).status, 403);
    assert.equal((await mode("invalid")).status, 400);
    assert.equal((await mode("clean")).status, 200);
    const clean = await read("workspace");
    assert.equal(clean.presentation.mode, "clean");
    assert.equal(clean.demo, true);
    assert.ok(
      clean.sensors.find((s: { id: string }) => s.id === "S04").latest.tdsPpm <
        120,
    );
    assert.equal((await mode("dirty")).status, 200);
    const dirty = await read("workspace");
    assert.equal(dirty.presentation.mode, "dirty");
    assert.ok(
      dirty.sensors.find((s: { id: string }) => s.id === "S04").latest.tdsPpm >
        900,
    );
    assert.ok(dirty.alerts.some((a: { kind: string }) => a.kind === "DEMO"));
    const history = await read("history?ids=S04&range=1h");
    assert.equal(history.presentation, true);
    assert.ok(history.rows.some((r: { tdsPpm: number }) => r.tdsPpm < 120));
    const ranking = await read("ranking?days=1");
    assert.equal(ranking.presentation, true);
    assert.equal(
      await db.reading.count({
        where: { firmwareVersion: { startsWith: "presentation" } },
      }),
      0,
    );
  } finally {
    assert.equal((await mode("live")).status, 200);
    const restored = await read("workspace");
    assert.equal(restored.presentation.mode, "live");
    assert.ok(
      !restored.alerts.some((a: { kind: string }) => a.kind === "DEMO"),
    );
    for (const cookie of [admin, user])
      await fetch(base + "/api/auth/logout", {
        method: "POST",
        headers: { Cookie: cookie, Origin: base },
      });
  }
  console.log(
    "Presentation API passed: admin-only controls, fluctuating clean/dirty scenarios, labelled chart/ranking data and undo. Live mode restored.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
