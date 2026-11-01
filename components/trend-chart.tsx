"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
type Row = {
  deviceId: string;
  timestamp: string;
  turbidityNtu: number;
  tdsPpm: number;
  temperatureC: number | null;
};
export default function TrendChart({
  ids,
  title = "Water Quality Over Time",
}: {
  ids: string[];
  title?: string;
}) {
  const [range, setRange] = useState("1h");
  const [metric, setMetric] = useState<
    "turbidityNtu" | "tdsPpm" | "temperatureC"
  >("tdsPpm");
  const [measuredOnly, setMeasuredOnly] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const key = ids.join(",");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(
          `/api/history?ids=${encodeURIComponent(key)}&range=${range}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (active) {
          setRows(data.rows);
          setMeasuredOnly(data.measuredOnly === true);
          setPresentation(data.presentation === true);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Chart unavailable");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [key, range]);
  const points = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const point = points.get(row.timestamp) ?? {
      time: Date.parse(row.timestamp),
    };
    const value = row[metric];
    if ((!measuredOnly || metric !== "turbidityNtu") && value !== null)
      point[row.deviceId] = value;
    points.set(row.timestamp, point);
  }
  const data = [...points.values()]
    .filter((p) => ids.some((id) => typeof p[id] === "number"))
    .sort((a, b) => Number(a.time) - Number(b.time));
  const unit =
    metric === "tdsPpm" ? "ppm" : metric === "temperatureC" ? "°C" : "NTU";
  return (
    <section className="card chart-card">
      <div className="card-heading">
        <h3>{title}</h3>
        <div className="segmented">
          {[
            ["1h", "1 Hour"],
            ["24h", "24 Hours"],
            ["7d", "7 Days"],
            ["30d", "30 Days"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={range === v ? "selected" : ""}
              onClick={() => {
                setLoading(true);
                setRange(v);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-tabs segmented">
        {(
          [
            ["turbidityNtu", "Turbidity"],
            ["tdsPpm", "TDS / PPM"],
            ["temperatureC", "Temperature"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            className={metric === v ? "selected" : ""}
            disabled={measuredOnly && v === "turbidityNtu"}
            onClick={() => setMetric(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <div className="empty-state" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="empty-state">Loading readings…</div>
      ) : !data.length ? (
        <div className="empty-state">
          No measured readings in this time range.
        </div>
      ) : (
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height={255}>
            <LineChart
              data={data}
              margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
            >
              <CartesianGrid vertical={false} stroke="#e0e8e3" />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) =>
                  new Date(v).toLocaleString(
                    undefined,
                    range === "7d" || range === "30d"
                      ? { month: "short", day: "numeric" }
                      : { hour: "2-digit", minute: "2-digit" },
                  )
                }
                tick={{ fontSize: 11, fill: "#6e8378" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                unit={" " + unit}
                width={65}
                tick={{ fontSize: 10, fill: "#6e8378" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                formatter={(v) => [Number(v).toFixed(1) + " " + unit]}
              />
              <Legend />
              {ids.map((id, i) => (
                <Line
                  key={id}
                  name={id}
                  type="monotone"
                  dataKey={id}
                  stroke={ids.length > 1 && i === 0 ? "#378e71" : "#e47c34"}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="chart-footer">
        {presentation
          ? "DEMO SCENARIO · Generated TDS values"
          : "Five-second device uploads · Time-bucketed averages"}
        <span>
          {ids.join(" ↔ ")} ·{" "}
          {presentation
            ? "Presentation data"
            : measuredOnly
              ? "Measured TDS and temperature"
              : "Device-reported readings"}
        </span>
      </div>
    </section>
  );
}
