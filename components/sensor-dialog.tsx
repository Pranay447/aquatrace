"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { SensorDTO, Thresholds } from "@/lib/domain";
import { defaults } from "@/lib/domain";
export function ThresholdFields({ values }: { values: Thresholds }) {
  return (
    <div className="form-grid">
      {Object.entries(values).map(([key, value]) => (
        <label key={key}>
          {
            (
              {
                turbidityGood: "Turbidity attention (NTU)",
                turbidityCritical: "Turbidity critical (NTU)",
                tdsGood: "TDS attention (ppm)",
                tdsCritical: "TDS critical (ppm)",
                tempCriticalLow: "Temperature critical below (°C)",
                tempGoodLow: "Temperature attention below (°C)",
                tempGoodHigh: "Temperature attention above (°C)",
                tempCriticalHigh: "Temperature critical above (°C)",
              } as Record<string, string>
            )[key]
          }
          <input
            name={key}
            type="number"
            step="any"
            required
            defaultValue={value}
          />
        </label>
      ))}
    </div>
  );
}
export function readThresholds(f: FormData): Thresholds {
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, Number(f.get(key))]),
  ) as Thresholds;
}
export default function SensorDialog({
  sensor,
  onClose,
  onSave,
}: {
  sensor: SensorDTO | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(!!sensor?.thresholds);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const data = {
      id: String(f.get("id")),
      name: String(f.get("name")),
      network: String(f.get("network")),
      latitude: Number(f.get("latitude")),
      longitude: Number(f.get("longitude")),
      mac: String(f.get("mac")),
      connectionType: String(f.get("connectionType")),
      intervalSeconds: Number(f.get("intervalSeconds")),
      flowOrder: Number(f.get("flowOrder")),
      enabled: f.get("enabled") === "on",
      thresholds: custom && !sensor?.tdsOnly ? readThresholds(f) : null,
    };
    try {
      const { id, ...rest } = data;
      const r = await fetch(
        sensor ? "/api/sensors/" + sensor.id : "/api/sensors",
        {
          method: sensor ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sensor ? rest : { ...rest, id }),
        },
      );
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      onSave();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save sensor");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="sensor-dialog"
      aria-labelledby="sensor-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">ADMINISTRATOR ACTION</span>
            <h2 id="sensor-dialog-title">
              {sensor ? "Configure " + sensor.id : "Add Sensor"}
            </h2>
            <p className="muted">
              Register and locate an ESP32 monitoring device.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="form-grid">
          <label>
            Sensor ID
            <input
              name="id"
              required
              pattern="[A-Z][A-Z0-9_\-]{1,31}"
              defaultValue={sensor?.id}
              readOnly={!!sensor}
              placeholder="S15"
            />
          </label>
          <label>
            Location name
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={sensor?.name}
              placeholder="Northbank Industrial Outlet"
            />
          </label>
          <label>
            Latitude
            <input
              name="latitude"
              required
              type="number"
              step="any"
              min={-90}
              max={90}
              defaultValue={sensor?.latitude}
              placeholder="40.7134"
            />
          </label>
          <label>
            Longitude
            <input
              name="longitude"
              required
              type="number"
              step="any"
              min={-180}
              max={180}
              defaultValue={sensor?.longitude}
              placeholder="-74.0051"
            />
          </label>
          <label>
            Network
            <input
              name="network"
              required
              defaultValue={sensor?.network ?? "East River"}
            />
          </label>
          <label>
            ESP32 MAC address
            <input
              name="mac"
              required
              pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}"
              defaultValue={sensor?.mac}
              placeholder="24:6F:28:1A:B3:C8"
            />
          </label>
          <label>
            Uplink connection
            <select
              name="connectionType"
              defaultValue={sensor?.connectionType ?? "Wi-Fi"}
            >
              <option>Wi-Fi</option>
              <option>Wi-Fi / BLE</option>
            </select>
          </label>
          <label>
            Reading interval (seconds)
            <input
              name="intervalSeconds"
              required
              type="number"
              min={5}
              max={3600}
              defaultValue={sensor?.intervalSeconds ?? 5}
            />
          </label>
          <label>
            Waterway flow order
            <input
              name="flowOrder"
              required
              type="number"
              min={0}
              max={10000}
              defaultValue={sensor?.flowOrder ?? 15}
            />
          </label>
          <label className="checkbox">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={sensor?.enabled ?? true}
            />{" "}
            Device enabled
          </label>
        </div>
        {!sensor?.tdsOnly && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => setCustom(e.target.checked)}
            />{" "}
            Override network thresholds
          </label>
        )}
        {custom && !sensor?.tdsOnly && (
          <ThresholdFields values={sensor?.thresholds ?? defaults} />
        )}
        <div className="notice">
          Provision <code>DEVICE_KEY_{sensor?.id ?? "YOUR_ID"}</code> on the
          server and copy the same secret to the device’s private secrets.h
          file. Secrets never appear in this form. GPIO pins and upload interval
          must also match the firmware configuration.
        </div>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="button primary">
            {busy ? "Saving…" : sensor ? "Save configuration" : "Add Sensor"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
