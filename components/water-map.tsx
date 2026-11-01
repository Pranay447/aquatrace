"use client";
import { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { LocateFixed, Layers } from "lucide-react";
import type { SensorDTO } from "@/lib/domain";
const colors = {
  Safe: "#38956d",
  Moderate: "#bd941b",
  Poor: "#e57c32",
  Critical: "#de5555",
  Offline: "#95a49e",
};
function Center({
  sensors,
  selected,
  focusSelected,
}: {
  sensors: SensorDTO[];
  selected?: string;
  focusSelected?: boolean;
}) {
  const map = useMap();
  const centered = useRef(false);
  const target = sensors.find((s) => s.id === selected) ?? sensors[0];
  const latitude = target?.latitude,
    longitude = target?.longitude;
  useEffect(() => {
    if (focusSelected && latitude !== undefined && longitude !== undefined)
      map.setView([latitude, longitude], 14, { animate: false });
  }, [map, latitude, longitude, focusSelected]);
  useEffect(() => {
    if (!centered.current && sensors.length && !focusSelected) {
      map.fitBounds(
        L.latLngBounds(sensors.map((s) => [s.latitude, s.longitude])),
        { padding: [45, 45], maxZoom: 15 },
      );
      centered.current = true;
    }
  }, [map, sensors, focusSelected]);
  return (
    <button
      className="map-center button"
      onClick={() => {
        if (sensors.length)
          map.fitBounds(
            L.latLngBounds(sensors.map((s) => [s.latitude, s.longitude])),
            { padding: [45, 45] },
          );
      }}
    >
      <LocateFixed size={15} /> Center
    </button>
  );
}
export default function WaterMap({
  sensors: inputSensors,
  selected,
  onSelect,
  corridor,
  focusSelected,
}: {
  sensors: SensorDTO[];
  selected?: string;
  onSelect?: (id: string) => void;
  corridor?: string[];
  focusSelected?: boolean;
}) {
  const sensors = inputSensors.filter((s) => s.locationSource !== "UNSET");
  const [heat, setHeat] = useState(true);
  const points = sensors.filter((s) => corridor?.includes(s.id));
  const line = points
    .sort((a, b) => a.flowOrder - b.flowOrder)
    .map((s) => [s.latitude, s.longitude] as [number, number]);
  if (!sensors.length)
    return (
      <div className="map-loading">
        <div style={{ textAlign: "center", padding: 24 }}>
          <h3>Waiting for sensor location</h3>
          <p>
            Allow location access on this laptop to position the sensor
            accurately.
          </p>
        </div>
      </div>
    );
  return (
    <div className="water-map">
      <MapContainer
        center={[sensors[0].latitude, sensors[0].longitude]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={
            process.env.NEXT_PUBLIC_MAP_TILE_URL ??
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {heat &&
          sensors
            .filter((s) => s.quality === "Poor" || s.quality === "Critical")
            .map((s) => (
              <Circle
                key={"heat" + s.id}
                center={[s.latitude, s.longitude]}
                radius={190}
                pathOptions={{
                  color: colors[s.quality],
                  fillColor: colors[s.quality],
                  fillOpacity: 0.12,
                  weight: 0,
                }}
              />
            ))}
        {line.length === 2 && (
          <Polyline
            positions={line}
            pathOptions={{ color: "#e0a141", weight: 25, opacity: 0.4 }}
          />
        )}
        {sensors.map((s) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={L.divIcon({
              className: "sensor-marker",
              html: `<span style="--marker-color:${colors[s.quality]}" class="${selected === s.id ? "chosen" : ""}"><i></i>${s.id}</span>`,
              iconSize: [55, 28],
              iconAnchor: [27, 14],
            })}
            eventHandlers={{ click: () => onSelect?.(s.id) }}
          >
            <Popup>
              <b>
                {s.id} · {s.name}
              </b>
              <br />
              {s.connectivity} ·{" "}
              {s.reference ? "Historical proxy, 2012–2017" : s.quality}
              <br />
              {(s.tdsOnly ? undefined : s.latest?.turbidityNtu.toFixed(1)) ??
                s.reference?.turbidityNtu.toFixed(1) ??
                "—"}{" "}
              NTU · {s.latest?.tdsPpm.toFixed(0) ?? "—"} ppm
            </Popup>
          </Marker>
        ))}
        <Center
          sensors={sensors}
          selected={selected}
          focusSelected={focusSelected}
        />
      </MapContainer>
      <span className="map-live">
        <i className="live-dot" /> Monitoring points
      </span>
      <div className="map-legend">
        {Object.entries(colors).map(([label, c]) => (
          <span key={label}>
            <i style={{ background: c }} />
            {label === "Safe" ? "Within limits" : label}
          </span>
        ))}
      </div>
      <button
        className="map-layers button"
        aria-pressed={heat}
        onClick={() => setHeat(!heat)}
      >
        <Layers size={15} /> {heat ? "Hide" : "Show"} intensity overlay
      </button>
    </div>
  );
}
