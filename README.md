# AquaTrace

ESP32 water-quality monitoring prototype with temperature-compensated TDS, sensor history, mapping and threshold alerts. The current local firmware reads TDS on GPIO34 and a DS18B20 temperature probe on GPIO4.

![AquaTrace sensor readings page showing S04 TDS history](docs/sensor-readings.jpg)

*S04 sensor readings page with the 30-day history range selected. The device was offline when this screenshot was captured; the chart shows previously recorded readings.*

**Local laptop + Pixel hotspot demonstration:** start with [LOCAL_WIFI_START_HERE.md](docs/LOCAL_WIFI_START_HERE.md). Use the separate `firmware/aquatrace_tds_local/` sketch and `scripts/start-local-demo.ps1`; no Cloud Run, certificate or internet time server is required during the demo.

**TDS-only ESP32 on GPIO34:** follow [the complete Wi-Fi + Cloud Run walkthrough](docs/ESP32_TDS_WIFI_CLOUD_RUN.md). The separate `firmware/aquatrace_tds_demo/` sketch uploads measured TDS with explicitly simulated turbidity and assumed temperature. It does not require a turbidity probe or DS18B20. The original full-sensor sketch remains available.

A working water-quality monitoring app built with Next.js App Router, TypeScript, Tailwind, Recharts, Leaflet/OpenStreetMap and PostgreSQL/Prisma. Device uploads and user sessions are authenticated separately. The supplied AquaTrace PDF drives the green/white desktop visual system, page layout, badges, cards and login imagery. The written request's five-second timing and editable thresholds take precedence over mockup sample values.

## Local setup (PowerShell, Node 22.13+ and Docker Desktop)

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d db
```

Edit `.env` locally:

```env
DATABASE_URL=postgresql://aquatrace:local-development-only@localhost:5432/aquatrace
APP_URL=http://localhost:3000
DEMO_MODE=true
```

Generate independent random secrets for `AUTH_SECRET` and each device's `DEVICE_KEY_Sxx`; do not reuse them. To generate one, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Put a separate value in each `.env` entry. At minimum configure `DEVICE_KEY_S04`; configure S01 through S14 except S08/S13 to stream all 12 online demo devices.

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal, `npm run demo:stream`. Open [localhost:3000](http://localhost:3000). Local development accounts only:

| Access        | Email                     | Password             |
| ------------- | ------------------------- | -------------------- |
| Standard user | maya.chen@aquatrace.local | AquaTrace-demo-2026! |
| Administrator | admin@aquatrace.local     | AquaTrace-demo-2026! |

The seed refuses production and requires `DEMO_MODE=true`. **Do not seed these accounts in a production database.** Demo sensors are labeled in the UI based on database records; disabling the environment flag does not disguise seeded data as physical readings. The simulator sends real authenticated HTTP requests and leaves S08/S13 offline. Without the simulator, seeded readings become stale after 60 seconds, then offline after 180 seconds. Seed inserts 30 days of hourly history plus minute-resolution recent history, not 30 days of synthetic five-second samples. Re-seeding preserves existing accounts and configurations.

With an existing PostgreSQL installation, skip Docker and use its URL. The UI never falls back to fabricated data when the database is unavailable.

## Application behavior

- Landing, separate user/admin login, registration, dashboard, map, sensor detail, compare, leaderboard, alerts, analytics and settings.
- Opaque HTTP-only sessions backed by PostgreSQL; passwords use salted scrypt. `AUTH_SECRET` HMACs session identifiers. Secure cookies are enabled for HTTPS `APP_URL`. Registration always creates USER; admin requests require approval by an existing administrator in Settings.
- Read APIs, CSV and every workspace page require a session. Sensor mutations, configuration, audit reads and admin approvals require ADMIN on the server.
- The dashboard refreshes every five seconds. Live status derives from newest measurement timestamps, never an old upload's arrival time. Stale/offline incident reconciliation runs when the protected workspace is fetched. It does not send email/SMS notifications or run a background scheduler.
- Alerts cover configured threshold breaches, >30% turbidity rise within a 20-minute window, staleness and offline devices. Acknowledgement/resolution is audited. A continuing violation can open another incident after manual resolution; a cleared condition resolves its active incident automatically.
- Each sensor may override network thresholds. Defaults: turbidity attention >=5 NTU, critical >20 NTU; TDS attention >=300 ppm, critical >600 ppm; temperature attention outside 15–30°C and critical outside 10–35°C. “Poor” subdivides the attention range above its midpoint. Colors are configured statuses, **not drinking-water claims**.
- Source corridors require online sensors in the same network with increasing flow order, and either >30% + >2 NTU turbidity increase or >30% + >50 ppm TDS increase. This is a comparison heuristic, not causal attribution. Travel-time correction, rainfall and flow measurements are not available from the requested probes.
- Leaderboards exclude stale/offline sensors. Today starts at UTC midnight; week/month are rolling 7/30 days. TDS/turbidity rank period peaks; lowest quality ranks the largest normalized period peak against critical limits; increase compares first/last turbidity in the period. CSV exports raw authorized readings, not a PDF/report or rendered ranking, and cap at the latest 50,000 rows.
- History is aggregated into 1-minute / 15-minute / 2-hour / 6-hour buckets for 1h / 24h / 7d / 30d. Raw five-second readings remain in PostgreSQL. Plan retention/archival for sustained deployment: one device produces 17,280 readings per day.
- Administrative changes and alert actions have immutable application audit entries. Sensor deletion permanently removes associated readings/alerts; the deletion audit remains. Registration and login use DB-backed shared rate limits. Telemetry uses a shared request cap plus per-device and invalid-key limits, so limits apply across Cloud Run instances. Expired sessions/rate-limit records should be pruned periodically (see deployment guide).

## Connect the ESP32

1. In Arduino IDE install the Espressif ESP32 board package, **OneWire** and **DallasTemperature**. Select the exact ESP-32D board; the sketch targets Arduino-ESP32 3.x.
2. Copy `firmware/secrets.example.h` to `firmware/secrets.h` (ignored). Fill these exact values:
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `API_URL`: `https://YOUR_CLOUD_RUN_HOST/api/telemetry`
   - `DEVICE_ID`: registered sensor ID, initially `S04`
   - `DEVICE_SECRET`: the exact server-side `DEVICE_KEY_S04` value
   - `ROOT_CA`: PEM root trust anchor for your deployment's HTTPS chain; never disable certificate verification
   - `TURBIDITY_ADC_PIN`, `TDS_ADC_PIN`: final ADC1 GPIOs that support your selected ESP32 board; placeholders intentionally fail compilation until assigned
   - `DS18B20_DATA_PIN`: final digital GPIO; add the required pull-up and verify probe wiring
   - `TURBIDITY_A/B/C`, `TDS_A/B/C`, `TDS_SCALE`, `TDS_TEMP_COEFFICIENT`, `SENSOR_VOLTAGE_RATIO`: measured calibration/interface values
   - `CALIBRATION_CONFIRMED=true` only after calibration; uploads remain disabled otherwise
   - `UPLOAD_INTERVAL_MS=5000` (match administrator device configuration)
3. Register the sensor/location/MAC in Sensors using an administrator. Provision its matching key in server environment/Secret Manager. The app does not provision keys over the browser, pair BLE devices, or remotely flash firmware.
4. Flash and open Serial at 115200 baud. The main loop samples every second with nine-sample analogue median filtering, aggregates over five seconds and passes the latest batch to a separate upload task. SNTP establishes UTC before TLS and timestamps are measurement time. Failed uploads retry with exponential backoff (1–60s); newest batch replaces an older pending batch. There is no durable offline queue.

### Hardware and calibration decision required

**For this design the turbidity sensor is powered at 3.3 V, and ESP32 ADC input must never exceed 3.3 V.** Verify the exact sensor SKU before wiring. Common Gravity **SEN0189 is specified for 5 V**, so its specified performance cannot be assumed at 3.3 V. Choose a compatible 3.3 V sensor/interface, or review a separate 5 V supply plus correctly designed divider/interface and revise the wiring/calibration with your hardware team. Never connect a possible 4.5 V analogue output directly to ESP32. See [DFRobot SEN0189](https://wiki.dfrobot.com/sen0189) and [SEN0244 TDS](https://wiki.dfrobot.com/sen0244).

Calibrate turbidity at multiple known standards with the final supply/interface. The example polynomial is only a placeholder. TDS uses the documented polynomial and temperature compensation around 25°C, with adjustable coefficients and scale; calibrate against standards for the actual probe. An NTU-to-sediment-mass conversion requires independent calibration and flow data and is not implemented.

### Test one upload

With `APP_URL` and `DEVICE_KEY_S04` set in your terminal environment:

```powershell
.\scripts\post-telemetry.ps1 -BaseUrl http://localhost:3000 -DeviceId S04
```

The script reads the secret from environment and generates a current timestamp. The API accepts only known enabled IDs, finite/ranged metrics, 12-bit ADC counts and timestamps within the past 24h / at most 60s ahead. Duplicate device/timestamp pairs are idempotent; delayed uploads cannot replace the latest reading. Device secrets never appear in responses.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

For full API checks, add an independent `DEVICE_KEY_TST01` to the local `.env`, restart the app, then `npm run test:integration`. Use only an isolated seeded demo database: tests create a registration request, create/delete a test sensor, exercise alerts and deliberately consume the invalid-key rate limit. Integration covers authenticated reads, RBAC, cross-origin protection, registration role boundaries, telemetry persistence/idempotency/ranges, alerts, chart aggregation, export, admin CRUD/audit and session invalidation.

## Deploy

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for exact Google Cloud setup, Cloud SQL/managed PostgreSQL, migration image, Secret Manager, Cloud Run deployment and verification commands. No cloud resources have to be created to run the app locally.

## Build-A-Thon alignment

The supplied rulebook permits LLM support; team work must still be produced during the competition period. Technical/mechatronic execution is 40%, sustainability/solution 20%, creativity 15%, presentation 15%, design 10%. The web app supports the prototype and evidence; it does not replace the required physical mechatronic system. The team remains responsible for registration/submission, A2 poster, physical prototype, budget tracking (additional purchased components <=$200 including GST, excluding shipping), less-than-12V/maximum-10A limits, fuses/circuit breakers, enclosure and battery safety, and organiser inspection. A practical demo should compare upstream/outlet/downstream signals in a model creek and record false alerts, identification accuracy and detection delay.

## Troubleshooting

- **Database unavailable**: verify `.env`, PostgreSQL process, port, SSL and `npm run db:migrate`; run Prisma commands after changing schema. The health URL only checks the server, not DB readiness.
- **Login fails**: use `.local` demo addresses, not the sample `.io` addresses shown as visual placeholders. Seed locally first. `APP_URL` must match the browser's origin exactly; use `localhost`, not a mix of localhost/127.0.0.1.
- **All devices offline**: start `npm run demo:stream` with matching demo keys, or inspect physical-device Serial output and clock. Do not increase stale time just to hide failed uploads.
- **Map missing**: map tiles need internet and provider access. Configure `NEXT_PUBLIC_MAP_TILE_URL` at build time for another compatible XYZ source, retain attribution and comply with that provider's tile policy. No offline tile cache is provided.
- **401 uploads**: check ID/key pairing, enabled registration and server secret versions. **400**: inspect timestamp, calibration and ADC ranges. **429**: wait a minute; do not repeatedly send invalid credentials.
- **Changes to pins/interval/calibration**: deploy matching firmware. Admin configuration documents desired values; no remote device-command channel is implemented.
- **Firmware build**: assign real GPIOs, install the two libraries and supply the root CA. The sketch has not been compiled or flashed against your physical board in this environment.
