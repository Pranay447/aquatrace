import { freshwaterAlerts } from "@/lib/freshwater";
import { presentationState } from "@/lib/presentation-store";
import { presentationRows } from "@/lib/presentation";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { locationSchema } from "@/lib/location";
import {
  sessionUser,
  createSession,
  passwordHash,
  verifyPassword,
  secretHash,
} from "@/lib/auth";
import {
  telemetrySchema,
  validTime,
  thresholdsSchema,
  canManage,
  evaluateAlerts,
  isTdsDemo,
  hasMeasuredTemperature,
  isMeasuredTdsFirmware,
} from "@/lib/domain";
import {
  settings,
  snapshot,
  sensorThresholds,
  reconcileAlerts,
} from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
const ok = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function body(req: NextRequest) {
  const text = await req.text();
  if (Buffer.byteLength(text) > 16384) fail(413, "Request too large");
  try {
    return JSON.parse(text);
  } catch {
    fail(400, "Invalid JSON");
  }
}
async function limit(key: string, max: number) {
  const window = Math.floor(Date.now() / 60_000);
  const record = await db.rateLimit.upsert({
    where: { id: secretHash(key + window) },
    create: {
      id: secretHash(key + window),
      resetAt: new Date((window + 1) * 60_000),
    },
    update: { count: { increment: 1 } },
  });
  if (record.count > max)
    fail(429, "Too many attempts. Try again in a minute.");
}
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL;
  if (!expected) fail(503, "Application URL is not configured");
  if (origin && origin !== new URL(expected!).origin)
    fail(403, "Origin not allowed");
}
const sensorSchema = z
  .object({
    id: z.string().regex(/^[A-Z][A-Z0-9_-]{1,31}$/),
    name: z.string().trim().min(2).max(100),
    network: z.string().trim().min(1).max(80).default("East River"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    mac: z
      .string()
      .regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/)
      .transform((v) => v.toUpperCase()),
    connectionType: z.enum(["Wi-Fi", "Wi-Fi / BLE"]).default("Wi-Fi"),
    intervalSeconds: z.number().int().min(5).max(3600),
    flowOrder: z.number().int().min(0).max(10000),
    enabled: z.boolean().default(true),
    thresholds: thresholdsSchema.nullable().optional(),
  })
  .strict();
async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const method = req.method;
    if (route === "health" && method === "GET") return ok({ status: "ok" });
    // A keyed device can obtain UTC from the laptop on an isolated local LAN.
    // This endpoint exposes the clock only, never readings or user information.
    if (route === "device-time" && method === "POST") {
      await limit("device-time:all", 120);
      const { deviceId } = z
        .object({ deviceId: z.string().regex(/^[A-Z][A-Z0-9_-]{1,31}$/) })
        .strict()
        .parse(await body(req));
      const key = req.headers.get("x-device-key") ?? "";
      const expected = process.env[`DEVICE_KEY_${deviceId}`];
      if (
        !expected ||
        expected.length < 32 ||
        key.length > 512 ||
        !timingSafeEqual(
          Buffer.from(secretHash(key)),
          Buffer.from(secretHash(expected)),
        )
      ) {
        await limit("device-time:invalid", 20);
        fail(401, "Invalid device credentials");
      }
      const sensor = await db.sensor.findUnique({ where: { id: deviceId } });
      if (!sensor || !sensor.enabled) fail(404, "Device not found or disabled");
      return ok({ unixTime: Math.floor(Date.now() / 1000) });
    }
    if (route === "telemetry" && method === "POST") {
      // Global DB-backed limit also bounds invalid requests across Cloud Run replicas.
      await limit("telemetry:all", 1800);
      const payload = telemetrySchema.parse(await body(req));
      const key = req.headers.get("x-device-key") ?? "";
      const expected = process.env[`DEVICE_KEY_${payload.deviceId}`];
      if (
        !expected ||
        expected.length < 32 ||
        key.length > 512 ||
        !timingSafeEqual(
          Buffer.from(secretHash(key)),
          Buffer.from(secretHash(expected)),
        )
      ) {
        await limit("telemetry:invalid", 30);
        fail(401, "Invalid device credentials");
      }
      await limit("device:" + payload.deviceId, 60);
      if (!validTime(payload.timestamp))
        fail(
          400,
          "Timestamp must be within the past 24 hours and no more than 60 seconds ahead",
        );
      const sensor = await db.sensor.findUnique({
        where: { id: payload.deviceId },
      });
      if (!sensor || !sensor.enabled) fail(404, "Device not found or disabled");
      if (
        process.env.LOCAL_DEMONSTRATION === "true" &&
        sensor.id === "S04" &&
        (!isMeasuredTdsFirmware(payload.firmwareVersion) ||
          payload.raw?.tdsAdc === undefined)
      )
        fail(
          400,
          "Local S04 requires TDS firmware and a real GPIO34 ADC sample; synthetic streams are disabled.",
        );
      const config = await settings();
      const previous = await db.reading.findFirst({
        where: {
          deviceId: payload.deviceId,
          timestamp: {
            gte: new Date(Date.parse(payload.timestamp) - 20 * 60_000),
            lt: new Date(Date.parse(payload.timestamp) - 5_000),
          },
        },
        orderBy: { timestamp: "asc" },
      });
      const timestamp = new Date(payload.timestamp);
      const { raw, ...values } = payload;
      await db.$transaction(async (tx) => {
        await tx.reading.upsert({
          where: {
            deviceId_timestamp: { deviceId: payload.deviceId, timestamp },
          },
          create: {
            ...values,
            timestamp,
            turbidityAdc: raw?.turbidityAdc,
            tdsAdc: raw?.tdsAdc,
          },
          update: {},
        });
        await tx.sensor.updateMany({
          where: {
            id: sensor.id,
            OR: [{ lastSeen: null }, { lastSeen: { lt: timestamp } }],
          },
          data: {
            lastSeen: timestamp,
            firmwareVersion: payload.firmwareVersion,
          },
        });
      });
      // Delayed uploads are stored, but cannot replace live status or live alerts.
      if (!sensor.lastSeen || timestamp >= sensor.lastSeen) {
        await reconcileAlerts(
          sensor.id,
          isMeasuredTdsFirmware(payload.firmwareVersion) ||
            (process.env.LOCAL_DEMONSTRATION === "true" && sensor.id === "S04")
            ? freshwaterAlerts(payload)
            : evaluateAlerts(
                payload,
                previous,
                sensorThresholds(sensor.thresholds, config.thresholds),
              ),
        );
        await reconcileAlerts(sensor.id, [], ["STALE", "OFFLINE"]);
      }
      return ok(
        { ok: true, deviceId: sensor.id, timestamp: payload.timestamp },
        201,
      );
    }
    if (method !== "GET") sameOrigin(req);
    if (route === "auth/login" && method === "POST") {
      await limit("login:all", 100);
      const data = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase().trim()),
          password: z.string().min(1).max(128),
          admin: z.boolean().default(false),
          remember: z.boolean().default(false),
        })
        .parse(await body(req));
      await limit("login:" + data.email, 10);
      const user = await db.user.findUnique({ where: { email: data.email } });
      if (
        !user ||
        !verifyPassword(data.password, user.passwordHash) ||
        (data.admin && user.role !== "ADMIN")
      )
        fail(401, "Email, password, or access type is incorrect");
      await createSession(user!.id, data.remember);
      return ok({ ok: true });
    }
    if (route === "auth/register" && method === "POST") {
      await limit("register:all", 20);
      const data = z
        .object({
          name: z.string().trim().min(2).max(80),
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase().trim()),
          password: z.string().min(12).max(128),
          adminRequested: z.boolean().default(false),
        })
        .parse(await body(req));
      const user = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: passwordHash(data.password),
          adminRequested: data.adminRequested,
          role: "USER",
        },
      });
      await createSession(user.id, false);
      return ok({ ok: true }, 201);
    }
    const user = await sessionUser();
    if (!user) fail(401, "Sign in to continue");
    if (route === "auth/logout" && method === "POST") {
      const jar = await cookies();
      const token = jar.get("aquatrace_session")?.value;
      if (token)
        await db.session.deleteMany({ where: { id: secretHash(token) } });
      jar.delete("aquatrace_session");
      return ok({ ok: true });
    }
    if (route === "workspace" && method === "GET")
      return ok(await snapshot(user!));
    if (route === "history" && method === "GET") {
      let ids = (req.nextUrl.searchParams.get("ids") ?? "S04")
        .split(",")
        .slice(0, 2);
      if (process.env.LOCAL_DEMONSTRATION === "true")
        ids = ids.filter((id) => id === "S04");
      if (!ids.length) return ok({ rows: [], measuredOnly: true });
      const range = req.nextUrl.searchParams.get("range") ?? "1h";
      const hours = (
        { "1h": 1, "24h": 24, "7d": 168, "30d": 720 } as Record<string, number>
      )[range];
      if (!hours) fail(400, "Invalid range");
      const bucket =
        hours === 1 ? 60 : hours === 24 ? 900 : hours === 168 ? 7200 : 21600;
      const since = new Date(Date.now() - hours * 3600_000);
      const presentation = await presentationState();
      if (presentation.events.length)
        return ok({
          rows: ids.includes("S04")
            ? presentationRows(presentation, since.getTime())
            : [],
          measuredOnly: true,
          presentation: true,
        });
      const rows = await db.$queryRaw<
        {
          deviceId: string;
          timestamp: Date;
          turbidityNtu: number;
          tdsPpm: number;
          temperatureC: number;
        }[]
      >(
        Prisma.sql`SELECT "deviceId", to_timestamp(floor(extract(epoch from "timestamp") / ${bucket}) * ${bucket}) AS timestamp, avg("turbidityNtu")::float8 AS "turbidityNtu", avg("tdsPpm")::float8 AS "tdsPpm", avg(CASE WHEN "firmwareVersion" LIKE 'tds-temp-%' OR "firmwareVersion" NOT LIKE 'tds-demo-%' THEN "temperatureC" END)::float8 AS "temperatureC" FROM "Reading" WHERE "deviceId" IN (${Prisma.join(ids)}) AND "timestamp" >= ${since} ${process.env.LOCAL_DEMONSTRATION === "true" ? Prisma.sql`AND ("firmwareVersion" LIKE 'tds-demo-%' OR "firmwareVersion" LIKE 'tds-temp-%') AND "tdsAdc" IS NOT NULL` : Prisma.empty} GROUP BY "deviceId", 2 ORDER BY timestamp ASC`,
      );
      return ok({
        rows:
          process.env.LOCAL_DEMONSTRATION === "true"
            ? rows.map((r) => ({
                ...r,
                turbidityNtu: null,
                temperatureC: r.temperatureC,
              }))
            : rows,
        measuredOnly: process.env.LOCAL_DEMONSTRATION === "true",
      });
    }
    if (route === "ranking" && method === "GET") {
      const presentation = await presentationState();
      if (presentation.events.length) {
        const rows = presentationRows(presentation, 0);
        return ok({
          rows: [
            {
              deviceId: "S04",
              tds: Math.max(...rows.map((r) => r.tdsPpm)),
              ntu: null,
              increase: null,
            },
          ],
          presentation: true,
        });
      }
      const days = Number(req.nextUrl.searchParams.get("days") ?? 1);
      if (![1, 7, 30].includes(days)) fail(400, "Invalid period");
      const start =
        days === 1
          ? new Date(new Date().setUTCHours(0, 0, 0, 0))
          : new Date(Date.now() - days * 86400_000);
      const rows = await db.$queryRaw<
        { deviceId: string; tds: number; ntu: number; increase: number }[]
      >(
        Prisma.sql`SELECT "deviceId", max("tdsPpm")::float8 AS tds, max("turbidityNtu")::float8 AS ntu, COALESCE(((array_agg("turbidityNtu" ORDER BY "timestamp" DESC))[1] - (array_agg("turbidityNtu" ORDER BY "timestamp" ASC))[1]) / NULLIF((array_agg("turbidityNtu" ORDER BY "timestamp" ASC))[1],0)*100,0)::float8 AS increase FROM "Reading" WHERE "timestamp">=${start} ${process.env.LOCAL_DEMONSTRATION === "true" ? Prisma.sql`AND "deviceId"='S04' AND ("firmwareVersion" LIKE 'tds-demo-%' OR "firmwareVersion" LIKE 'tds-temp-%') AND "tdsAdc" IS NOT NULL` : Prisma.empty} GROUP BY "deviceId"`,
      );
      return ok({
        rows:
          process.env.LOCAL_DEMONSTRATION === "true"
            ? rows.map((r) => ({ ...r, ntu: null, increase: null }))
            : rows,
      });
    }
    if (route === "export" && method === "GET") {
      const ids = (req.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .filter(Boolean);
      const days = Math.min(
        30,
        Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 1),
      );
      const rows = await db.reading.findMany({
        where: {
          ...(process.env.LOCAL_DEMONSTRATION === "true"
            ? {
                deviceId: "S04",
                OR: [
                  { firmwareVersion: { startsWith: "tds-demo-" } },
                  { firmwareVersion: { startsWith: "tds-temp-" } },
                ],
                tdsAdc: { not: null },
              }
            : ids.length
              ? { deviceId: { in: ids } }
              : {}),
          timestamp: { gte: new Date(Date.now() - days * 86400_000) },
        },
        orderBy: { timestamp: "desc" },
        take: 50000,
      });
      return new NextResponse(
        "deviceId,timestamp,turbidityNtu,tdsPpm,temperatureC,turbiditySource,temperatureSource\n" +
          rows
            .map((r) =>
              [
                r.deviceId,
                r.timestamp.toISOString(),
                isMeasuredTdsFirmware(r.firmwareVersion) ? "" : r.turbidityNtu,
                r.tdsPpm,
                isTdsDemo(r.firmwareVersion) ? "" : r.temperatureC,
                isMeasuredTdsFirmware(r.firmwareVersion)
                  ? "not-connected"
                  : "device-reported",
                hasMeasuredTemperature(r.firmwareVersion)
                  ? "measured-ds18b20-gpio4"
                  : isTdsDemo(r.firmwareVersion)
                    ? "not-measured"
                    : "device-reported",
              ].join(","),
            )
            .join("\n"),
        {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              'attachment; filename="aquatrace-readings.csv"',
            "Cache-Control": "no-store",
            "X-Export-Limit": "50000",
          },
        },
      );
    }
    if (path[0] === "alerts" && path[1] && method === "PATCH") {
      const { state } = z
        .object({ state: z.enum(["ACKNOWLEDGED", "RESOLVED"]) })
        .parse(await body(req));
      const alert = await db.alert.findUnique({ where: { id: path[1] } });
      if (!alert) fail(404, "Alert not found");
      await db.$transaction([
        db.alert.update({
          where: { id: path[1] },
          data:
            state === "RESOLVED"
              ? { state, activeKey: null, resolvedBy: user!.id }
              : { state, acknowledgedBy: user!.id },
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "ALERT_" + state,
            target: path[1],
            details: {},
          },
        }),
      ]);
      return ok({ ok: true });
    }
    if (!canManage(user!.role)) fail(403, "Administrator access required");
    if (route === "presentation" && method === "PATCH") {
      if (process.env.LOCAL_DEMONSTRATION !== "true")
        fail(403, "Presentation mode is local only");
      const { mode } = z
        .object({ mode: z.enum(["live", "clean", "dirty"]) })
        .strict()
        .parse(await body(req));
      const previous = await presentationState();
      const now = Date.now();
      const events =
        mode === "live"
          ? []
          : [
              ...(previous.events.length
                ? previous.events
                : [{ mode: "clean" as const, at: now - 60000 }]),
              { mode: mode as "clean" | "dirty", at: now },
            ].slice(-120);
      const state = { events };
      await db.$transaction([
        db.setting.upsert({
          where: { id: "presentation" },
          create: { id: "presentation", thresholds: state },
          update: { thresholds: state },
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "PRESENTATION_" + mode.toUpperCase(),
            target: "S04",
            details: { mode },
          },
        }),
      ]);
      return ok({ ok: true, mode });
    }
    if (
      path.length === 3 &&
      path[0] === "sensors" &&
      path[2] === "location" &&
      method === "PATCH"
    ) {
      const point = locationSchema.parse(await body(req));
      await db.$transaction([
        db.sensor.update({
          where: { id: path[1] },
          data: { latitude: point.latitude, longitude: point.longitude },
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "UPDATE_SENSOR_LOCATION",
            target: path[1],
            details: { ...point, source: "LAPTOP_BROWSER" },
          },
        }),
      ]);
      return ok({ ok: true, ...point });
    }
    if (route === "audit" && method === "GET")
      return ok(
        await db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    if (route === "requests" && method === "GET")
      return ok(
        await db.user.findMany({
          where: { adminRequested: true, role: "USER" },
          select: { id: true, name: true, email: true },
        }),
      );
    if (path[0] === "requests" && path[1] && method === "PATCH") {
      await db.$transaction([
        db.user.update({
          where: { id: path[1] },
          data: { role: "ADMIN", adminRequested: false },
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "APPROVE_ADMIN",
            target: path[1],
            details: {},
          },
        }),
      ]);
      return ok({ ok: true });
    }
    if (route === "settings" && method === "PATCH") {
      const data = z
        .object({
          thresholds: thresholdsSchema,
          staleSeconds: z.number().int().min(15).max(3600),
        })
        .parse(await body(req));
      await db.$transaction([
        db.setting.upsert({
          where: { id: "network" },
          create: { id: "network", ...data },
          update: data,
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "UPDATE_SETTINGS",
            target: "network",
            details: data,
          },
        }),
      ]);
      return ok({ ok: true });
    }
    if (route === "sensors" && method === "POST") {
      const data = sensorSchema.parse(await body(req));
      await db.$transaction([
        db.sensor.create({
          data: { ...data, thresholds: data.thresholds ?? Prisma.DbNull },
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "CREATE_SENSOR",
            target: data.id,
            details: data,
          },
        }),
      ]);
      return ok({ ok: true }, 201);
    }
    if (path[0] === "sensors" && path[1] && method === "PATCH") {
      const data = sensorSchema.omit({ id: true }).parse(await body(req));
      await db.$transaction([
        db.sensor.update({
          where: { id: path[1] },
          data: { ...data, thresholds: data.thresholds ?? Prisma.DbNull },
        }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "UPDATE_SENSOR",
            target: path[1],
            details: data,
          },
        }),
      ]);
      return ok({ ok: true });
    }
    if (path[0] === "sensors" && path[1] && method === "DELETE") {
      await db.$transaction([
        db.sensor.delete({ where: { id: path[1] } }),
        db.auditLog.create({
          data: {
            actorId: user!.id,
            action: "REMOVE_SENSOR",
            target: path[1],
            details: {},
          },
        }),
      ]);
      return ok({ ok: true });
    }
    return ok({ error: "Route not found" }, 404);
  } catch (error) {
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return ok(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return ok({ error: "This identifier is already in use" }, 409);
      if (error.code === "P2025") return ok({ error: "Record not found" }, 404);
    }
    console.error(
      "AquaTrace request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return ok(
      {
        error:
          "Service unavailable. Check database configuration and try again.",
      },
      503,
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
