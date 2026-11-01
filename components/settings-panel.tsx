"use client";
import { useState, useEffect } from "react";
import type { Snapshot } from "@/lib/domain";
import { ThresholdFields, readThresholds } from "./sensor-dialog";
type Audit = { id: string; action: string; target: string; createdAt: string };
type Request = { id: string; name: string; email: string };
export default function SettingsPanel({
  data,
  refresh,
}: {
  data: Snapshot;
  refresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const admin = data.user.role === "ADMIN";
  async function scenario(mode: "live" | "clean" | "dirty") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/presentation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      refresh();
      setMessage(
        mode === "live"
          ? "Live sensor readings restored."
          : "Presentation scenario enabled. Demo values are labelled throughout the workspace.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to change scenario");
    } finally {
      setBusy(false);
    }
  }
  async function loadAdmin() {
    const [a, r] = await Promise.all([
      fetch("/api/audit"),
      fetch("/api/requests"),
    ]);
    if (a.ok) setAudit(await a.json());
    if (r.ok) setRequests(await r.json());
  }
  useEffect(() => {
    if (admin)
      void Promise.resolve()
        .then(loadAdmin)
        .catch(() => setMessage("Could not load administration records."));
  }, [admin]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thresholds: readThresholds(f),
          staleSeconds: Number(f.get("staleSeconds")),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage("Network configuration saved.");
      refresh();
      await loadAdmin();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="card padded">
        <span className="eyebrow">NETWORK CONFIGURATION</span>
        <h3>Thresholds & device health</h3>
        {admin && data.localMode && (
          <section className="card padded">
            <h3>Presentation controls</h3>
            <p>
              Current source: <b>{data.presentation?.mode ?? "live"}</b>. Demo
              scenarios change the display and charts without overwriting sensor
              readings. Exports remain real records.
            </p>
            <div className="row wrap">
              <button
                className="button"
                disabled={busy}
                onClick={() => scenario("clean")}
              >
                Clean sample · demo
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => scenario("dirty")}
              >
                Spike TDS · demo
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => scenario("live")}
              >
                Undo · restore live readings
              </button>
            </div>
            {message && <p role="status">{message}</p>}
          </section>
        )}
        <p className="muted">
          Monitoring profiles describe configured monitoring ranges and do not
          assess drinking-water suitability.
        </p>
        {data.localMode ? (
          <div className="notice">
            Freshwater TDS uses fixed NHMRC palatability bands: ≤600 ppm good,
            &gt;600–900 fair, &gt;900–1,200 poor. Above 1,000 ppm is outside the
            SEN0244 range. Temperature is measured on GPIO4; unconnected
            channels do not trigger alerts. Device health becomes stale after{" "}
            {data.settings.staleSeconds} seconds and offline after{" "}
            {data.settings.staleSeconds * 3} seconds.
          </div>
        ) : (
          <form onSubmit={save}>
            <fieldset disabled={!admin || busy}>
              <ThresholdFields values={data.settings.thresholds} />
              <label>
                Stale-data period (seconds)
                <input
                  name="staleSeconds"
                  type="number"
                  min={15}
                  max={3600}
                  defaultValue={data.settings.staleSeconds}
                />
              </label>
              <p className="muted">
                Offline after three stale periods. Rapid-rise warning: more than
                30% within 20 minutes.
              </p>
              {admin && (
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving…" : "Save configuration"}
                </button>
              )}
            </fieldset>
            {!admin && (
              <div className="notice">
                Only administrators can change network configuration.
              </div>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
          </form>
        )}
      </section>
      <div className="stack">
        <section className="card padded">
          <h3>Your account</h3>
          <p>{data.user.name}</p>
          <p className="muted">{data.user.email}</p>
          <span className="badge safe">
            {data.user.role === "ADMIN" ? "Administrator" : "Standard user"}
          </span>
          {data.user.adminRequested && (
            <p className="notice">Administrator access is awaiting approval.</p>
          )}
          <p className="muted">
            Map tiles: OpenStreetMap. Readings are visible only to authenticated
            workspace users.
          </p>
        </section>
        {admin && (
          <>
            <section className="card padded">
              <h3>Administrator requests</h3>
              {!requests.length ? (
                <p className="muted">No pending requests.</p>
              ) : (
                requests.map((r) => (
                  <div className="request-row" key={r.id}>
                    <div>
                      <b>{r.name}</b>
                      <small>{r.email}</small>
                    </div>
                    <button
                      className="button"
                      onClick={async () => {
                        const response = await fetch("/api/requests/" + r.id, {
                          method: "PATCH",
                        });
                        if (response.ok) await loadAdmin();
                        else setMessage("Could not approve request.");
                      }}
                    >
                      Approve
                    </button>
                  </div>
                ))
              )}
            </section>
            <section className="card padded">
              <h3>Recent audit log</h3>
              {audit.length ? (
                audit.map((a) => (
                  <div className="audit-row" key={a.id}>
                    <b>{a.action.replaceAll("_", " ").toLowerCase()}</b>
                    <small>
                      {a.target} · {new Date(a.createdAt).toLocaleString()}
                    </small>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Administrative changes will appear here.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
