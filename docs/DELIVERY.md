# AquaTrace handoff

All application files were created in this initially empty workspace. See the file inventory below, the main README, and DEPLOYMENT.md.

## Run the configured workspace now

The local QA database has been initialized, migrated and seeded on **127.0.0.1:55432**. A private, ignored `.env` contains generated development secrets. The PostgreSQL process remains available for local use; the temporary preview server and simulator are stopped after verification.

From this workspace, run:

```powershell
npm run dev
```

In another terminal:

```powershell
npm run demo:stream
```

Visit http://localhost:3000. For the tested production build, use `npm start` instead of `npm run dev`. Do not run both on port 3000.

The two local accounts are documented in README: `maya.chen@aquatrace.local` and `admin@aquatrace.local`, both with local demo password `AquaTrace-demo-2026!`.

For a clean setup on another machine, follow the README's Docker PostgreSQL setup, environment configuration, generation, migration and seed commands. This machine's QA database uses a different port from the README's fresh Docker example. To restart this existing local QA database after a reboot (while its ignored test runtime files remain):

```powershell
Start-Process -FilePath (Resolve-Path '.\tmp\qa\node_modules\@embedded-postgres\windows-x64\native\bin\postgres.exe') -ArgumentList '-D .local-db -h 127.0.0.1 -p 55432' -WindowStyle Hidden
```

Do not run that command while the QA database is already running. The QA cluster uses trust authentication on loopback only and is unsuitable for deployment. The application deployment uses managed PostgreSQL with real credentials.

## ESP32 values to fill

Copy `firmware/secrets.example.h` to ignored `firmware/secrets.h`. Fill `WIFI_SSID`, `WIFI_PASSWORD`, `API_URL`, `DEVICE_ID`, `DEVICE_SECRET`, `ROOT_CA`, `TURBIDITY_ADC_PIN`, `TDS_ADC_PIN` and `DS18B20_DATA_PIN`. Measure and set `TURBIDITY_A/B/C`, `TDS_A/B/C`, `TDS_SCALE`, `TDS_TEMP_COEFFICIENT`, `SENSOR_VOLTAGE_RATIO`, then set `CALIBRATION_CONFIRMED=true`. Keep `UPLOAD_INTERVAL_MS=5000` unless intentionally matching a different configured device interval. GPIO placeholders intentionally prevent compilation until assigned.

## Cloud Run deployment

DEPLOYMENT.md contains exact copyable Cloud Shell commands, in order: enable project APIs; create Artifact Registry and the runtime service account; create Cloud SQL/database/user; create and grant Secret Manager secrets; build web and migration images; execute the migration job; bootstrap a real administrator; deploy Cloud Run; set its returned URL as APP_URL; register the physical sensor; and verify protected reads plus keyed uploads. It also documents an alternative managed PostgreSQL URL.

No cloud resources were created or deployed during this task.

## Decisions still needed

1. **Exact turbidity sensor SKU and electrical interface.** The requested 3.3 V design conflicts with the 5 V rating of common SEN0189 boards. Confirm a compatible variant/interface before power or calibration; ESP32 ADC input must never exceed 3.3 V.
2. **Board GPIOs, calibration and TLS root CA.** These require the real hardware and final HTTPS deployment. Do not treat the example polynomial as calibrated.
3. **Cloud project/region, DB credentials and physical device secret/location/MAC.** The deployment guide uses explicit placeholders. Demo devices and accounts must stay out of the production database.
4. **Operational scope.** Choose retention/backups and whether unattended notification delivery or durable device-side buffering is needed. Neither is silently simulated.

Verification results are recorded in VERIFICATION.md. The Docker image, cloud deployment and physical firmware have not been tested in their target environments.

## Created file inventory

- `.dockerignore`
- `.env.example`
- `.gitignore`
- `.prettierignore`
- `Dockerfile`
- `README.md`
- `app/(workspace)/[...section]/page.tsx`
- `app/(workspace)/layout.tsx`
- `app/(workspace)/loading.tsx`
- `app/admin/login/page.tsx`
- `app/api/[...path]/route.ts`
- `app/error.tsx`
- `app/globals.css`
- `app/help/page.tsx`
- `app/layout.tsx`
- `app/login/page.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `app/register/page.tsx`
- `components/auth-form.tsx`
- `components/monitor.tsx`
- `components/sensor-dialog.tsx`
- `components/settings-panel.tsx`
- `components/trend-chart.tsx`
- `components/water-map.tsx`
- `components/workspace.tsx`
- `compose.yaml`
- `docs/DELIVERY.md`
- `docs/DEPLOYMENT.md`
- `docs/VERIFICATION.md`
- `docs/dashboard-preview.png`
- `eslint.config.mjs`
- `firmware/aquatrace_esp32.ino`
- `firmware/secrets.example.h`
- `lib/auth.ts`
- `lib/db.ts`
- `lib/demo-locations.ts`
- `lib/domain.ts`
- `lib/service.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `postcss.config.mjs`
- `prisma/migrations/20261021000000_init/migration.sql`
- `prisma/migrations/20261021010000_utc_timestamps/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `public/river.jpg`
- `scripts/create-admin.ts`
- `scripts/demo-stream.ts`
- `scripts/post-telemetry.ps1`
- `scripts/prepare-standalone.mjs`
- `scripts/start.mjs`
- `tests/domain.test.ts`
- `tests/integration.ts`
- `tsconfig.json`
