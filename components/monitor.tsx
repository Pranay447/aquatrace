"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Radio,
  Waves,
  Droplets,
  TriangleAlert,
  Download,
  RefreshCw,
  ArrowUpRight,
  MapPin,
  Plus,
  Search,
  ArrowRight,
  Wifi,
  Activity,
  ArrowLeftRight,
} from "lucide-react";
import type { Snapshot, SensorDTO, AlertDTO } from "@/lib/domain";
import { difference, sourceInsight, isTdsDemo } from "@/lib/domain";
import { tdsGuideline } from "@/lib/freshwater";
import TrendChart from "./trend-chart";
import SensorDialog from "./sensor-dialog";
import SettingsPanel from "./settings-panel";
import SensorLocationControl from "./sensor-location";
const WaterMap = dynamic(() => import("./water-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading waterway map…</div>,
});
const fmt = (n: number | undefined | null, d = 1) =>
  n == null
    ? "—"
    : n.toLocaleString(undefined, {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
const elapsed = (s: string | null) => {
  if (!s) return "Never received";
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(s)) / 1000));
  return sec < 60
    ? sec + " seconds ago"
    : sec < 3600
      ? Math.floor(sec / 60) + " minutes ago"
      : Math.floor(sec / 3600) + " hours ago";
};
function Badge({ value }: { value: string }) {
  return (
    <span className={"badge " + value.toLowerCase().replaceAll(" ", "-")}>
      ● {value === "Safe" ? "Within limits" : value}
    </span>
  );
}
function Metric({
  label,
  value,
  unit,
  note,
  icon: Icon = Activity,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  icon?: typeof Activity;
}) {
  return (
    <article className="card metric">
      <div>
        {label}
        <span className="metric-icon">
          <Icon size={18} />
        </span>
      </div>
      <p>
        {value} <small>{unit}</small>
      </p>
      <small>{note}</small>
    </article>
  );
}
function SensorCard({ s }: { s: SensorDTO }) {
  return (
    <section className="card padded sensor-compare">
      <div className="card-heading">
        <div>
          <h3>Sensor {s.id}</h3>
          <p className="muted">{s.name}</p>
        </div>
        <Badge value={s.connectivity} />
      </div>
      <div className="compare-values">
        <div>
          <small>
            {s.reference
              ? "Historical turbidity statistic"
              : s.tdsOnly || isTdsDemo(s.firmwareVersion)
                ? "Turbidity"
                : "Turbidity"}
          </small>
          <strong>
            {fmt(
              s.reference?.turbidityNtu ??
                (s.tdsOnly ? undefined : s.latest?.turbidityNtu),
            )}{" "}
            <small>NTU</small>
          </strong>
        </div>
        <div>
          <small>Concentration</small>
          <strong>
            {fmt(s.latest?.tdsPpm, 0)} <small>ppm</small>
          </strong>
        </div>
        <div>
          <small>Configured status</small>
          <Badge value={s.quality} />
        </div>
      </div>
      <small className="muted">
        {s.reference ? "Reference" : "ESP32"} · {s.connectionType} ·{" "}
        {s.reference ? "Source period ends Dec 2017" : elapsed(s.lastSeen)}
      </small>
    </section>
  );
}
function Insight({ a, b }: { a: SensorDTO; b: SensorDTO }) {
  if (
    !a.latest ||
    !b.latest ||
    a.connectivity !== "Online" ||
    b.connectivity !== "Online" ||
    a.flowOrder >= b.flowOrder ||
    a.network !== b.network ||
    !sourceInsight(a.latest, b.latest)
  )
    return null;
  const diff = difference(a.latest.tdsPpm, b.latest.tdsPpm);
  return (
    <div className="notice source-insight">
      <TriangleAlert size={19} />
      <div>
        <b>Potential pollution source corridor</b>
        <p>
          {b.id} is recording meaningfully higher readings than upstream {a.id}.
          TDS difference: {fmt(diff.absolute, 0)} ppm (
          {diff.percent === null ? "no baseline" : fmt(diff.percent, 0) + "%"}).
          Inspect the corridor between these monitoring points.
        </p>
        <small>
          This is an investigation prompt. Travel time, calibration, rainfall
          and other inputs can affect the comparison.
        </small>
        <Link
          href={`/map?a=${a.id}&b=${b.id}&sensor=${b.id}`}
          className="text-link"
        >
          View area on map <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
export default function Monitor({
  page,
  sensorId,
  initial,
}: {
  page: string;
  sensorId?: string;
  initial: { sensor: string; a: string; b: string };
}) {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selected, setSelected] = useState(initial.sensor);
  const [network, setNetwork] = useState("East River");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [a, setA] = useState(initial.a === "S03" ? "S04" : initial.a);
  const [b, setB] = useState(initial.b === "S04" ? "SYD01" : initial.b);
  const [dialog, setDialog] = useState<SensorDTO | null | undefined>(undefined);
  const [alertFilter, setAlertFilter] = useState("All events");
  const [ranking, setRanking] = useState("Highest TDS");
  const [period, setPeriod] = useState("1");
  const [rankRows, setRankRows] = useState<
    { deviceId: string; tds: number; ntu: number; increase: number }[]
  >([]);
  const [rankError, setRankError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      setData(payload);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection unavailable");
    }
  }, [router]);
  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (mounted) void refresh();
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [refresh]);
  useEffect(() => {
    if (page !== "leaderboard") return;
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/ranking?days=" + period);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) {
          setRankRows(d.rows);
          setRankError("");
        }
      } catch (e) {
        if (active)
          setRankError(e instanceof Error ? e.message : "Ranking unavailable");
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [page, period]);
  async function mutate(url: string, method: string, body?: unknown) {
    setActionError("");
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await refresh();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
      return false;
    }
  }
  if (!data)
    return (
      <div className="loading-state">
        {error ? (
          <>
            <TriangleAlert />
            <h2>Unable to load the network</h2>
            <p role="alert">{error}</p>
            <button className="button" onClick={refresh}>
              Try again
            </button>
          </>
        ) : (
          <>
            <span className="spinner" />
            Connecting to your waterway…
          </>
        )}
      </div>
    );
  const visibleSensors = data.sensors;
  const visibleNetwork = data.localMode
    ? (visibleSensors[0]?.network ?? network)
    : sensorId
      ? (data.sensors.find((s) => s.id === sensorId)?.network ?? network)
      : network;
  const sensors = data.localMode
    ? visibleSensors
    : visibleSensors.filter((s) => s.network === visibleNetwork);
  const networks = [...new Set(visibleSensors.map((s) => s.network))];
  const online = sensors.filter((s) => s.connectivity === "Online" && s.latest);
  const current =
    sensors.find((s) => s.id === (sensorId ?? selected)) ?? sensors[0];
  const sa = data.sensors.find((s) => s.id === a);
  const sb = data.sensors.find((s) => s.id === b);
  const upstream =
    current && !data.localMode
      ? sensors.filter((s) => s.flowOrder < current.flowOrder).at(-1)
      : undefined;
  const downstream =
    current && !data.localMode
      ? sensors.find((s) => s.flowOrder > current.flowOrder)
      : undefined;
  const activeAlerts = data.alerts.filter(
    (a) => a.state !== "RESOLVED" && sensors.some((s) => s.id === a.deviceId),
  );
  const critical = activeAlerts.filter((a) => a.severity === "CRITICAL");
  const admin = data.user.role === "ADMIN";
  const avg = (key: "tdsPpm" | "turbidityNtu") =>
    data.localMode && key === "turbidityNtu"
      ? undefined
      : online.length
        ? online.reduce((sum, s) => sum + s.latest![key], 0) / online.length
        : undefined;
  const temperatureOnline = online.filter(
    (s) => s.measuredTemperature && s.latest,
  );
  const avgTemperature = temperatureOnline.length
    ? temperatureOnline.reduce((sum, s) => sum + s.latest!.temperatureC, 0) /
      temperatureOnline.length
    : undefined;
  const headings: Record<string, [string, string]> = {
    dashboard: [
      "Water Quality Monitoring",
      "A live view of your waterways. See changes. Find their source.",
    ],
    map: [
      "Network Live Map",
      "Follow your monitoring points along the waterway.",
    ],
    sensors: [
      sensorId ? "Sensor " + sensorId : "All Sensors",
      sensorId
        ? (current?.name ?? "Sensor not found")
        : "Monitor your distributed ESP32 network, locations and device configurations.",
    ],
    compare: [
      "Compare Sensors",
      "Compare water quality measurements across the waterway.",
    ],
    leaderboard: [
      "TDS Readings",
      "Rank sensors by recorded readings and recent changes.",
    ],
    alerts: [
      "Water Quality Alerts",
      "Follow threshold breaches and rapid changes across your monitoring network.",
    ],
    analytics: [
      "Network Analytics",
      "Understand trends, device health and changes from upstream conditions.",
    ],
    settings: [
      "Workspace Settings",
      "Your account, network thresholds and administration.",
    ],
  };
  const filtered = sensors.filter(
    (s) =>
      (s.id + " " + s.name).toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All" || s.quality === filter || s.connectivity === filter),
  );
  function selectors() {
    return (
      <div className="compare-selectors">
        <label>
          Sensor A
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {data!.sensors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          onClick={() => {
            setA(b);
            setB(a);
          }}
        >
          <ArrowLeftRight size={16} /> Swap
        </button>
        <label>
          Sensor B
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {data!.sensors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  const exportUrl =
    "/api/export?days=" +
    period +
    (page === "compare"
      ? `&ids=${a},${b}`
      : sensorId
        ? "&ids=" + sensorId
        : "");
  return (
    <div className="monitor">
      <div className="page-heading">
        <div>
          <h1>{headings[page][0]}</h1>
          <p>{headings[page][1]}</p>
        </div>
        <div className="row">
          {page === "sensors" && !sensorId && admin && !data.localMode ? (
            <button className="button primary" onClick={() => setDialog(null)}>
              <Plus size={17} />
              Add Sensor
            </button>
          ) : (
            <a href={exportUrl} className="button">
              <Download size={16} />
              Export {page === "compare" ? "comparison" : "report"}
            </a>
          )}
        </div>
      </div>
      <div className="status-bar">
        <div className="row wrap">
          <Badge value={error ? "Connection issue" : "System operational"} />
          <label className="sr-only" htmlFor="network">
            Network
          </label>
          <select
            id="network"
            className="network-select"
            value={visibleNetwork}
            disabled={!!sensorId}
            onChange={(e) => setNetwork(e.target.value)}
          >
            {networks.map((n) => (
              <option key={n}>{n}</option>
            ))}
            {!networks.length && <option>East River</option>}
          </select>
          <span>
            {online.length} / {sensors.length} sensors active
          </span>
          <span>
            Last sync{" "}
            {new Date(data.syncedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          {data.demo && <span className="demo-badge">Demo data</span>}
        </div>
        <button className="text-link" onClick={refresh}>
          <RefreshCw size={14} />
          Refresh readings
        </button>
      </div>
      {error && (
        <div role="alert" className="notice danger">
          Connection lost. Showing the last successful sync. {error}
        </div>
      )}
      {actionError && (
        <div role="alert" className="notice danger">
          {actionError}
        </div>
      )}
      {data.presentation && data.presentation.mode !== "live" && (
        <div className="notice" role="status">
          <b>DEMO SCENARIO · {data.presentation.mode.toUpperCase()}</b>{" "}
          Displayed TDS, connection status and charts are presentation values.
          Real sensor records are preserved; exports contain recorded data.
          Restore live readings in administrator Settings.
        </div>
      )}
      {data.localMode && (
        <div className="notice">
          <div>
            <b>Freshwater monitoring · TDS and temperature</b>
            <p>
              NHMRC taste bands: ≤600 ppm good; &gt;600–900 fair; &gt;900–1,200
              poor. Above 1,000 ppm triggers an instrument-range alert for this
              sensor. TDS does not establish drinking-water safety. Temperature
              comes from the DS18B20 on GPIO4 after the updated firmware is
              uploaded. The offline reference is excluded from live analytics.
            </p>
            <a
              className="text-link"
              href={tdsGuideline}
              target="_blank"
              rel="noreferrer"
            >
              Australian Drinking Water Guidelines
            </a>
          </div>
        </div>
      )}
      {data.localMode && (
        <details className="card padded">
          <summary>
            <b>SYD01 · Sydney Harbour Bridge · Offline</b> — historical
            turbidity 2.4 NTU (2012–2017)
          </summary>
          <p>
            Historical reference only. Latest source period: April 2012–December
            2017; no live device or verified individual last reading.
          </p>
          <p>
            <b>2.4 NTU</b> median of monthly average turbidity; monthly averages
            ranged <b>0.7–8.4 NTU</b>. Barangaroo South is used as a nearby
            historical proxy. TDS and temperature: unavailable.
          </p>
          <a
            className="text-link"
            href={data.sensors.find((s) => s.reference)?.reference?.source}
            target="_blank"
            rel="noreferrer"
          >
            NSW marine water quality report · January 2020 · Table 3-5
          </a>
        </details>
      )}
      {!data.localMode &&
        sensors.some((s) => s.tdsOnly || isTdsDemo(s.firmwareVersion)) && (
          <div role="status" className="notice">
            <b>Connected measurements:</b> Only channels with a physical sensor
            are included in measured analytics.
          </div>
        )}
      {admin &&
        current &&
        !current.reference &&
        (page === "dashboard" ||
          page === "map" ||
          (page === "sensors" && sensorId === current.id)) && (
          <SensorLocationControl
            key={current.id}
            sensorId={current.id}
            onSaved={refresh}
            autoStart={data.localMode}
          />
        )}
      {!sensors.length && page !== "settings" ? (
        <section className="card empty-state">
          <Radio size={32} />
          <h2>No sensors in this network</h2>
          <p>
            {admin
              ? "Add your first ESP32 device to start collecting readings."
              : "An administrator can register monitoring devices."}
          </p>
          {admin && (
            <button className="button primary" onClick={() => setDialog(null)}>
              Add Sensor
            </button>
          )}
        </section>
      ) : (
        <>
          {(page === "dashboard" || page === "map") && (
            <>
              <div className="metrics-grid">
                <Metric
                  label="Active Sensors"
                  value={`${online.length} / ${sensors.length}`}
                  unit="Online"
                  note={`${sensors.length - online.length} devices require attention`}
                  icon={Radio}
                />
                <Metric
                  label={
                    data.localMode ? "Average Temperature" : "Average Turbidity"
                  }
                  value={fmt(
                    data.localMode ? avgTemperature : avg("turbidityNtu"),
                  )}
                  unit={data.localMode ? "°C" : "NTU"}
                  note={
                    data.localMode
                      ? "Measured DS18B20 values only"
                      : `Across ${online.length} online sensors`
                  }
                  icon={Waves}
                />
                <Metric
                  label="Average TDS"
                  value={fmt(avg("tdsPpm"), 0)}
                  unit="ppm"
                  note={`Across ${online.length} online sensors`}
                  icon={Droplets}
                />
                <Metric
                  label="Critical Alerts"
                  value={String(critical.length)}
                  unit="Events"
                  note="Review configured threshold breaches"
                  icon={TriangleAlert}
                />
              </div>
              <div className="map-detail-grid">
                <section className="card map-card">
                  <div className="card-heading">
                    <div>
                      <h3>Network live map</h3>
                      <small className="muted">
                        {visibleNetwork} · {filtered.length} monitoring points
                      </small>
                    </div>
                    <label className="sr-only" htmlFor="map-filter">
                      Filter sensors
                    </label>
                    <select
                      id="map-filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        "All",
                        "Safe",
                        "Moderate",
                        "Poor",
                        "Critical",
                        "Offline",
                      ].map((f) => (
                        <option key={f} value={f}>
                          {f === "Safe" ? "Within limits" : f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <WaterMap
                    sensors={
                      data.localMode
                        ? filtered.filter((s) => s.locationSource !== "UNSET")
                        : filtered
                    }
                    selected={current?.id}
                    onSelect={setSelected}
                    focusSelected={data.localMode}
                    corridor={
                      page === "map" &&
                      sa &&
                      sb &&
                      sa.latest &&
                      sb.latest &&
                      sourceInsight(sa.latest, sb.latest) &&
                      sa.flowOrder < sb.flowOrder &&
                      sa.connectivity === "Online" &&
                      sb.connectivity === "Online"
                        ? [a, b]
                        : undefined
                    }
                  />
                  <div className="map-footer">
                    <Wifi size={14} />
                    <span>ESP32 · Five-second uploads</span>
                    <small>Marker colors show configured status</small>
                  </div>
                </section>
                {current && (
                  <section className="card detail-panel">
                    <h2>Sensor {current.id}</h2>
                    <p className="muted">{current.name}</p>
                    <div className="row wrap">
                      <Badge value={current.connectivity} />
                      <Badge value={current.quality} />
                    </div>
                    <dl>
                      <div>
                        <dt>
                          {current.reference
                            ? "Historical turbidity statistic"
                            : data.localMode
                              ? "Turbidity"
                              : "Turbidity"}
                        </dt>
                        <dd>
                          {fmt(
                            current.reference?.turbidityNtu ??
                              (current.tdsOnly
                                ? undefined
                                : current.latest?.turbidityNtu),
                          )}{" "}
                          <small>NTU</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Total dissolved solids (TDS)</dt>
                        <dd className="orange">
                          {fmt(current.latest?.tdsPpm, 0)} <small>ppm</small>
                        </dd>
                      </div>
                      <div>
                        <dt>{"Temperature"}</dt>
                        <dd>
                          {fmt(
                            data.localMode && !current.measuredTemperature
                              ? undefined
                              : current.latest?.temperatureC,
                          )}{" "}
                          <small>°C</small>
                        </dd>
                      </div>
                    </dl>
                    <div className="detail-meta">
                      <div>
                        Last reading{" "}
                        <b>
                          {current.reference
                            ? "Source period ends Dec 2017"
                            : elapsed(current.lastSeen)}
                        </b>
                      </div>
                      <div>
                        Connection <b>{current.connectivity}</b>
                      </div>
                      <div>
                        Battery{" "}
                        <b>
                          {current.battery == null
                            ? "Not supplied"
                            : fmt(current.battery, 0) + "%"}
                        </b>
                      </div>
                      <div>
                        Wireless link{" "}
                        <b>
                          {current.reference
                            ? "No device connected"
                            : `ESP32 · ${current.connectionType}`}
                        </b>
                      </div>
                    </div>
                    <small className="muted">
                      {current.locationSource === "UNSET"
                        ? "Location pending"
                        : `${current.latitude.toFixed(4)}°, ${current.longitude.toFixed(4)}°`}
                    </small>
                    {upstream && <Insight a={upstream} b={current} />}
                    <Link
                      href={"/sensors/" + current.id}
                      className="button primary"
                    >
                      <ArrowUpRight size={16} />
                      View Full Details
                    </Link>
                    <Link
                      href={`/compare?a=${current.id}&b=${sensors.find((s) => s.id !== current.id)?.id ?? current.id}`}
                      className="button"
                    >
                      Compare Sensor
                    </Link>
                  </section>
                )}
              </div>
              {page === "dashboard" && current && (
                <TrendChart ids={[current.id]} />
              )}
            </>
          )}
          {page === "sensors" &&
            sensorId &&
            (current?.id !== sensorId ? (
              <div className="card empty-state">
                Sensor not found. <Link href="/sensors">View all sensors</Link>
              </div>
            ) : (
              <>
                <div className="row wrap">
                  <Badge value={current.connectivity} />
                  <Badge value={current.quality} />
                  <span className="muted">
                    {current.locationSource === "UNSET"
                      ? "Location pending"
                      : `${current.latitude}°, ${current.longitude}°`}{" "}
                    ·{" "}
                    {current.reference
                      ? "Source period ends Dec 2017"
                      : elapsed(current.lastSeen)}
                  </span>
                  <Link className="button" href={"/map?sensor=" + current.id}>
                    <MapPin size={15} />
                    Locate on Map
                  </Link>
                  {admin && !current.reference && (
                    <button
                      className="button"
                      onClick={() => setDialog(current)}
                    >
                      Configure
                    </button>
                  )}
                </div>
                {!current.reference && (
                  <>
                    <div className="metrics-grid detail-metrics">
                      <Metric
                        label="Average Temperature"
                        value={fmt(current.averageTemperatureC)}
                        unit="°C"
                        note="Measured values today · UTC"
                      />
                      <Metric
                        label="Current TDS"
                        value={fmt(current.latest?.tdsPpm, 0)}
                        unit="ppm"
                        note={
                          current.tdsOnly || isTdsDemo(current.firmwareVersion)
                            ? "Measured TDS · temperature compensation"
                            : "Latest device reading"
                        }
                      />
                      <Metric
                        label="Average TDS"
                        value={fmt(current.average.tdsPpm, 0)}
                        unit="ppm"
                        note="Today · UTC"
                      />
                      <Metric
                        label={
                          current.tdsOnly || isTdsDemo(current.firmwareVersion)
                            ? "Temperature"
                            : "Current Temperature"
                        }
                        value={fmt(
                          data.localMode && !current.measuredTemperature
                            ? undefined
                            : current.latest?.temperatureC,
                        )}
                        unit="°C"
                        note={
                          data.localMode
                            ? current.measuredTemperature
                              ? `Average today ${fmt(current.averageTemperatureC)} °C`
                              : "Waiting for DS18B20 firmware upload"
                            : `Average today ${fmt(current.average.temperatureC)} °C`
                        }
                      />
                      <Metric
                        label="Peak TDS Today"
                        value={fmt(current.peakTds, 0)}
                        unit="ppm"
                        note="Maximum recorded today · UTC"
                      />
                    </div>
                    <TrendChart
                      ids={[current.id]}
                      title="Sensor Readings Over Time"
                    />
                  </>
                )}
                <div className="card padded">
                  <h3>Nearby Sensors</h3>
                  <p className="muted">
                    Following the configured direction of water flow
                  </p>
                  <div className="nearby">
                    {[upstream, current, downstream].map((s, i) =>
                      s ? (
                        <Link key={s.id} href={"/sensors/" + s.id}>
                          <small>
                            {["Upstream", "Current", "Downstream"][i]}
                          </small>
                          <b>
                            {s.id} <ArrowRight size={16} />
                          </b>
                          <span>{s.name}</span>
                          <strong>{fmt(s.latest?.tdsPpm, 0)} ppm</strong>
                          <Badge value={s.connectivity} />
                        </Link>
                      ) : (
                        <div key={i}>
                          No {i === 0 ? "upstream" : "downstream"} point
                        </div>
                      ),
                    )}
                  </div>
                  {upstream && <Insight a={upstream} b={current} />}
                  <Link
                    className="button"
                    href={`/compare?a=${upstream?.id ?? current.id}&b=${current.id}`}
                  >
                    Compare sensor <ArrowUpRight size={15} />
                  </Link>
                </div>
              </>
            ))}
          {page === "sensors" && !sensorId && (
            <>
              <div className="filter-bar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by sensor ID or location…"
                    aria-label="Search sensors"
                  />
                </label>
                <div className="segmented">
                  {[
                    "All",
                    "Online",
                    "Offline",
                    "Safe",
                    "Moderate",
                    "Poor",
                    "Critical",
                  ].map((f) => (
                    <button
                      className={filter === f ? "selected" : ""}
                      key={f}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <section className="card table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Sensor / Location</th>
                        <th>Status</th>
                        <th>TDS</th>
                        <th>Turbidity</th>
                        <th>Battery</th>
                        <th>Last updated</th>
                        <th>Configured status</th>
                        {admin && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <Link href={"/sensors/" + s.id}>
                              <b>{s.id}</b>
                              <small>{s.name}</small>
                            </Link>
                          </td>
                          <td>
                            <Badge value={s.connectivity} />
                          </td>
                          <td>
                            {fmt(s.latest?.tdsPpm, 0)} <small>ppm</small>
                          </td>
                          <td>
                            {fmt(
                              s.reference?.turbidityNtu ??
                                (s.tdsOnly
                                  ? undefined
                                  : s.latest?.turbidityNtu),
                            )}{" "}
                            <small>NTU</small>
                          </td>
                          <td>{s.battery == null ? "—" : s.battery + "%"}</td>
                          <td>
                            {s.reference
                              ? "Source period ends Dec 2017"
                              : elapsed(s.lastSeen)}
                          </td>
                          <td>
                            <Badge value={s.quality} />
                          </td>
                          {admin && (
                            <td>
                              {s.reference ? (
                                "Historical reference"
                              ) : (
                                <>
                                  <button
                                    className="text-link"
                                    onClick={() => setDialog(s)}
                                  >
                                    Edit / Configure
                                  </button>
                                  <button
                                    className="text-link destructive"
                                    onClick={async () => {
                                      if (
                                        window.confirm(
                                          `Remove ${s.id}? This permanently removes its readings and alerts.`,
                                        )
                                      )
                                        await mutate(
                                          "/api/sensors/" + s.id,
                                          "DELETE",
                                        );
                                    }}
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty-state">
                    No sensors match this search.
                  </div>
                )}
                <footer>
                  Showing {filtered.length} of {sensors.length} sensors
                  <span>
                    Network averages exclude stale and offline devices
                  </span>
                </footer>
              </section>
              {!admin && (
                <div className="notice">
                  Sensor configuration is available to administrators. Select a
                  sensor to inspect its readings.
                </div>
              )}
            </>
          )}
          {page === "compare" && (
            <>
              {selectors()}
              {sa && sb && sa.id !== sb.id ? (
                <>
                  <div className="two-columns">
                    <SensorCard s={sa} />
                    <SensorCard s={sb} />
                  </div>
                  {sa.latest && sb.latest && (
                    <div className="comparison-strip">
                      <b>
                        {sb.id} compared with {sa.id}
                      </b>
                      {(["tdsPpm", "turbidityNtu"] as const).map((metric) => {
                        const d = difference(
                          sa.latest![metric],
                          sb.latest![metric],
                        );
                        return (
                          <span key={metric}>
                            {metric === "tdsPpm" ? "TDS" : "Turbidity"}{" "}
                            <strong>
                              {d.absolute > 0 ? "+" : ""}
                              {fmt(d.absolute)}{" "}
                              {metric === "tdsPpm" ? "ppm" : "NTU"}
                            </strong>{" "}
                            (
                            {d.percent === null
                              ? "undefined baseline"
                              : fmt(d.percent, 0) + "%"}
                            )
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <TrendChart ids={[a, b]} title="Water Quality Comparison" />
                  <Insight a={sa} b={sb} />
                  <section className="card map-card">
                    <div className="card-heading">
                      <h3>
                        {data.localMode
                          ? "Monitoring locations"
                          : "Potential source corridor"}
                      </h3>
                      <small className="muted">
                        {data.localMode
                          ? "Freshwater and marine references are not directly comparable"
                          : `Flow order: ${sa.flowOrder} → ${sb.flowOrder}`}
                      </small>
                    </div>
                    <WaterMap
                      sensors={[sa, sb]}
                      selected={b}
                      corridor={
                        sa.latest &&
                        sb.latest &&
                        sourceInsight(sa.latest, sb.latest) &&
                        sa.flowOrder < sb.flowOrder &&
                        sa.network === sb.network &&
                        sa.connectivity === "Online" &&
                        sb.connectivity === "Online"
                          ? [a, b]
                          : undefined
                      }
                    />
                  </section>
                </>
              ) : (
                <div className="card empty-state">
                  Select two different sensors to compare.
                </div>
              )}
            </>
          )}
          {page === "leaderboard" && (
            <>
              <div className="filter-bar">
                <div className="segmented">
                  {[
                    ["1", "Today"],
                    ["7", "This Week"],
                    ["30", "This Month"],
                  ].map(([v, label]) => (
                    <button
                      className={period === v ? "selected" : ""}
                      key={v}
                      onClick={() => setPeriod(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="row">
                  Rank by{" "}
                  <select
                    value={ranking}
                    onChange={(e) => setRanking(e.target.value)}
                  >
                    {(data.localMode
                      ? ["Highest TDS"]
                      : [
                          "Highest TDS",
                          "Highest Turbidity",
                          "Lowest Water Quality",
                          "Largest Recent Increase",
                        ]
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              {rankError && (
                <div role="alert" className="notice danger">
                  {rankError}
                </div>
              )}
              <section className="card table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Sensor / Location</th>
                        <th>Peak turbidity</th>
                        <th>Peak TDS</th>
                        <th>Configured status</th>
                        <th>Period increase</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankRows
                        .filter((r) => online.some((s) => s.id === r.deviceId))
                        .sort((x, y) =>
                          ranking === "Highest TDS"
                            ? y.tds - x.tds
                            : ranking === "Highest Turbidity"
                              ? y.ntu - x.ntu
                              : ranking === "Largest Recent Increase"
                                ? y.increase - x.increase
                                : Math.max(
                                    y.tds /
                                      data.settings.thresholds.tdsCritical,
                                    y.ntu /
                                      data.settings.thresholds
                                        .turbidityCritical,
                                  ) -
                                  Math.max(
                                    x.tds /
                                      data.settings.thresholds.tdsCritical,
                                    x.ntu /
                                      data.settings.thresholds
                                        .turbidityCritical,
                                  ),
                        )
                        .map((r, i) => {
                          const s = online.find((s) => s.id === r.deviceId)!;
                          return (
                            <tr key={s.id}>
                              <td>
                                <span
                                  className={i === 0 ? "rank first" : "rank"}
                                >
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                              </td>
                              <td>
                                <Link href={"/sensors/" + s.id}>
                                  <b>{s.id}</b>
                                  <small>{s.name}</small>
                                </Link>
                              </td>
                              <td>
                                {data.localMode
                                  ? "Not connected"
                                  : `${fmt(r.ntu)} NTU`}
                              </td>
                              <td>
                                <b>{fmt(r.tds, 0)}</b> ppm
                              </td>
                              <td>
                                <Badge value={s.quality} />
                              </td>
                              <td>
                                {data.localMode
                                  ? "Not assessed"
                                  : `${r.increase > 0 ? "↑" : "↓"} ${fmt(Math.abs(r.increase), 0)}%`}
                              </td>
                              <td>
                                <Badge value="Online" />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {!rankRows.length && !rankError && (
                  <div className="empty-state">
                    No readings in this ranking period.
                  </div>
                )}
                <footer>
                  {online.length} online sensors eligible ·{" "}
                  {sensors.length - online.length} stale or offline excluded
                  <span>
                    Today: since UTC midnight · Week/month: rolling 7/30 days
                  </span>
                </footer>
              </section>
            </>
          )}
          {page === "alerts" && (
            <>
              <div className="metrics-grid three">
                <Metric
                  label="Critical alerts"
                  value={String(critical.length)}
                  unit="Events"
                  note="Configured threshold breaches"
                  icon={TriangleAlert}
                />
                <Metric
                  label="Warnings"
                  value={String(
                    activeAlerts.filter((a) => a.severity === "WARNING").length,
                  )}
                  unit="Events"
                  note="Device health and attention ranges"
                />
                <Metric
                  label="Resolved today"
                  value={String(
                    data.alerts.filter(
                      (a) =>
                        a.state === "RESOLVED" &&
                        a.updatedAt.slice(0, 10) ===
                          new Date().toISOString().slice(0, 10),
                    ).length,
                  )}
                  unit="Events"
                  note="Recorded incidents · UTC"
                />
              </div>
              <div className="segmented alert-tabs">
                {[
                  "All events",
                  "Critical",
                  "Warning",
                  "Acknowledged",
                  "Resolved",
                ].map((v) => (
                  <button
                    className={alertFilter === v ? "selected" : ""}
                    key={v}
                    onClick={() => setAlertFilter(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="alerts-layout">
                <div className="stack">
                  {data.alerts
                    .filter(
                      (al) =>
                        sensors.some((s) => s.id === al.deviceId) &&
                        (alertFilter === "All events" ||
                          (alertFilter === "Critical" ||
                          alertFilter === "Warning"
                            ? al.severity === alertFilter.toUpperCase() &&
                              al.state !== "RESOLVED"
                            : al.state === alertFilter.toUpperCase())),
                    )
                    .map((al) => (
                      <AlertCard
                        key={al.id}
                        alert={al}
                        sensor={sensors.find((s) => s.id === al.deviceId)}
                        onAction={(state) =>
                          mutate("/api/alerts/" + al.id, "PATCH", { state })
                        }
                      />
                    ))}
                  {!data.alerts.length && (
                    <div className="card empty-state">
                      No alerts. New events will appear here.
                    </div>
                  )}
                </div>
                <aside className="card padded">
                  <h3>Respond with context</h3>
                  <p className="muted">
                    Threshold alerts identify readings to review. They do not
                    establish the source or cause.
                  </p>
                  <ol className="response-list">
                    <li>
                      <b>Compare upstream</b>
                      <p>Use a recent, calibrated reference point.</p>
                    </li>
                    <li>
                      <b>Inspect the corridor</b>
                      <p>Check outlets and sediment controls.</p>
                    </li>
                    <li>
                      <b>Check downstream</b>
                      <p>Monitor whether the change persists.</p>
                    </li>
                  </ol>
                  <Link className="button" href="/compare">
                    Compare sensors <ArrowUpRight size={15} />
                  </Link>
                  <Link className="text-link" href="/settings">
                    Network thresholds
                  </Link>
                </aside>
              </div>
            </>
          )}
          {page === "analytics" && (
            <>
              <div className="metrics-grid">
                <Metric
                  label="Network availability"
                  value={fmt(
                    sensors.filter((s) => !s.reference).length
                      ? (online.length /
                          sensors.filter((s) => !s.reference).length) *
                          100
                      : 0,
                    0,
                  )}
                  unit="%"
                  note="Live devices currently uploading; historical reference excluded"
                  icon={Radio}
                />
                <Metric
                  label={
                    data.localMode ? "Average Temperature" : "Average turbidity"
                  }
                  value={fmt(
                    data.localMode ? avgTemperature : avg("turbidityNtu"),
                  )}
                  unit={data.localMode ? "°C" : "NTU"}
                  note={
                    data.localMode
                      ? "Measured DS18B20 values only"
                      : "Online devices only"
                  }
                  icon={Waves}
                />
                <Metric
                  label="Average TDS"
                  value={fmt(avg("tdsPpm"), 0)}
                  unit="ppm"
                  note="Online devices only"
                  icon={Droplets}
                />
                <Metric
                  label="Open incidents"
                  value={String(activeAlerts.length)}
                  note="Includes acknowledged incidents"
                  icon={TriangleAlert}
                />
              </div>
              <label className="inline-label">
                Investigate sensor
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {sensors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} — {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {current && (
                <TrendChart ids={[current.id]} title="Trend Summary" />
              )}
              <section className="card padded">
                <h3>Sensor health</h3>
                {sensors.map((s) => (
                  <div className="health-row" key={s.id}>
                    <Link href={"/sensors/" + s.id}>
                      {s.id} · {s.name}
                    </Link>
                    <span className="health-track">
                      <i
                        style={{
                          width:
                            s.connectivity === "Online"
                              ? "100%"
                              : s.connectivity === "Stale"
                                ? "50%"
                                : "5%",
                          background:
                            s.connectivity === "Online" ? "#65a984" : "#d7a14b",
                        }}
                      />
                    </span>
                    <Badge value={s.connectivity} />
                    <small>
                      {s.reference
                        ? "Source period ends Dec 2017"
                        : elapsed(s.lastSeen)}
                    </small>
                  </div>
                ))}
              </section>
              <div className="notice">
                {data.presentation?.mode && data.presentation.mode !== "live"
                  ? "Demo scenario values are displayed. "
                  : "Trend summaries use measured sensor values. "}{" "}
                Rainfall, flow, sediment load and biological impact are not
                inferred from turbidity and TDS alone.
              </div>
            </>
          )}
          {page === "settings" && (
            <SettingsPanel data={data} refresh={refresh} />
          )}
        </>
      )}
      {dialog !== undefined && (
        <SensorDialog
          sensor={dialog}
          onClose={() => setDialog(undefined)}
          onSave={refresh}
        />
      )}
      <div className="workspace-footer">
        <span>
          <Droplets size={13} /> AquaTrace · Connected water. Clearer insight.
        </span>
        <span>
          Configured water-quality status · Not a drinking-water assessment
        </span>
      </div>
    </div>
  );
}
function AlertCard({
  alert,
  sensor,
  onAction,
}: {
  alert: AlertDTO;
  sensor?: SensorDTO;
  onAction: (state: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const severity =
    alert.state === "RESOLVED"
      ? "Resolved"
      : alert.severity === "CRITICAL"
        ? "Critical"
        : "Warning";
  return (
    <article className={"card alert-card " + severity.toLowerCase()}>
      <div className="card-heading">
        <div className="row wrap">
          <Badge value={severity} />
          <b>Sensor {alert.deviceId}</b>
          <span className="muted">{sensor?.name}</span>
        </div>
        <small>{elapsed(alert.createdAt)}</small>
      </div>
      <h3>{alert.message}</h3>
      <p className="muted">
        {alert.kind.replaceAll("_", " ")} · {alert.state.toLowerCase()} ·{" "}
        {new Date(alert.createdAt).toLocaleString()}
      </p>
      <div className="row wrap">
        <Link className="button" href={"/map?sensor=" + alert.deviceId}>
          <MapPin size={14} />
          View on Map
        </Link>
        {alert.kind !== "DEMO" && alert.state !== "RESOLVED" && (
          <>
            {alert.state !== "ACKNOWLEDGED" && (
              <button
                disabled={busy}
                className="button"
                onClick={async () => {
                  setBusy(true);
                  await onAction("ACKNOWLEDGED");
                  setBusy(false);
                }}
              >
                Acknowledge
              </button>
            )}
            <button
              disabled={busy}
              className="button"
              onClick={async () => {
                setBusy(true);
                await onAction("RESOLVED");
                setBusy(false);
              }}
            >
              Resolve
            </button>
          </>
        )}
      </div>
    </article>
  );
}
