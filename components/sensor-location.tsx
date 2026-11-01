"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Square } from "lucide-react";
import {
  locationSchema,
  locationError,
  distanceMetres,
  type SensorLocation,
} from "@/lib/location";
export default function SensorLocationControl({
  sensorId,
  onSaved,
  autoStart = false,
}: {
  sensorId: string;
  onSaved: () => Promise<void>;
  autoStart?: boolean;
}) {
  const [following, setFollowing] = useState(autoStart);
  const [busy, setBusy] = useState(autoStart);
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ accuracyM: number; at: string } | null>(
    null,
  );
  const watch = useRef<number | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const lastSaved = useRef<{ point: SensorLocation; at: number } | null>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    }
    abort.current?.abort();
    inFlight.current = false;
    if (mounted.current) {
      setFollowing(false);
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);
  const save = useCallback(
    async (position: GeolocationPosition, force: boolean, session: number) => {
      if (
        !mounted.current ||
        session !== generation.current ||
        inFlight.current
      )
        return;
      const parsed = locationSchema.safeParse({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      });
      if (!parsed.success) {
        setError(
          "The reported location is invalid. Try again or enter coordinates in Configure.",
        );
        setBusy(false);
        return;
      }
      const point = parsed.data;
      const previous = lastSaved.current;
      const now = Date.now();
      if (
        !force &&
        previous &&
        (now - previous.at < 15000 ||
          (distanceMetres(previous.point, point) <
            Math.max(10, point.accuracyM / 2) &&
            point.accuracyM >= previous.point.accuracyM / 2))
      ) {
        setBusy(false);
        return;
      }
      inFlight.current = true;
      setBusy(true);
      setError("");
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch(
          `/api/sensors/${encodeURIComponent(sensorId)}/location`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(point),
            signal: controller.signal,
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Unable to save sensor location");
        if (mounted.current && session === generation.current) {
          lastSaved.current = { point, at: now };
          setLast({
            accuracyM: point.accuracyM,
            at: new Date().toLocaleTimeString(),
          });
          await onSaved();
        }
      } catch (e) {
        if (
          mounted.current &&
          session === generation.current &&
          !(e instanceof DOMException && e.name === "AbortError")
        ) {
          stop();
          setError(
            e instanceof Error ? e.message : "Unable to save sensor location.",
          );
        }
      } finally {
        if (session === generation.current) {
          inFlight.current = false;
          if (mounted.current) setBusy(false);
        }
      }
    },
    [sensorId, onSaved, stop],
  );
  const start = useCallback(
    (continuous: boolean) => {
      stop();
      setError("");
      if (!window.isSecureContext) {
        setError(
          "Open this app at http://localhost:3000 on the laptop, or use HTTPS, to enable location access.",
        );
        return;
      }
      if (!navigator.geolocation) {
        setError(
          "Location is not supported by this browser. Enter coordinates in Configure.",
        );
        return;
      }
      const session = generation.current;
      setBusy(true);
      lastSaved.current = null;
      const failed = (e: GeolocationPositionError) => {
        if (mounted.current && session === generation.current) {
          stop();
          setError(locationError(e.code));
        }
      };
      const options = {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      };
      if (continuous) {
        setFollowing(true);
        watch.current = navigator.geolocation.watchPosition(
          (p) => void save(p, false, session),
          failed,
          options,
        );
      } else
        navigator.geolocation.getCurrentPosition(
          (p) => void save(p, true, session),
          failed,
          options,
        );
    },
    [save, stop],
  );
  useEffect(() => {
    if (!autoStart) return;
    const timer = window.setTimeout(() => start(true), 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, start]);
  return (
    <section
      className="card sensor-location-control"
      aria-label={`Sensor ${sensorId} location`}
    >
      <div>
        <h3>
          <MapPin size={17} /> Sensor location · {sensorId}
        </h3>
        <p className="muted">
          The sensor’s location matches this laptop’s location.
        </p>
      </div>
      <div className="row wrap">
        <button
          className="button"
          disabled={busy || following}
          onClick={() => start(false)}
        >
          <LocateFixed size={15} />
          {busy && !following ? "Locating…" : "Update sensor location"}
        </button>
        <button
          className={"button " + (following ? "" : "primary")}
          aria-pressed={following}
          onClick={() => (following ? stop() : start(true))}
        >
          {following ? <Square size={13} /> : <MapPin size={15} />}{" "}
          {following ? "Stop automatic updates" : "Auto-update location"}
        </button>
      </div>
      <p className="location-status" role="status">
        {following
          ? "Automatic updates are on while this page stays open. "
          : ""}
        {last
          ? `Location saved at ${last.at} · reported accuracy ±${Math.round(last.accuracyM)} m.`
          : "Allow location access when your browser asks."}
      </p>
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
    </section>
  );
}
