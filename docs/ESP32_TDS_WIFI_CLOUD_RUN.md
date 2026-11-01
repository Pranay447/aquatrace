# GPIO34 → Wi-Fi → Cloud Run → AquaTrace

This guide is for a **classic ESP32 / ESP-WROOM-32 development board**, with a Gravity-compatible analogue TDS interface on **GPIO34**. It measures TDS-related voltage, derives an estimated ppm value, and generates a **clearly simulated** turbidity value for the demonstration. It does not need a separate ESP8266/Wi-Fi module or a turbidity sensor. It assumes 25°C because this sketch has no temperature probe.

The data path is:

```text
TDS probe → TDS interface board → ESP32 GPIO34
                                  │ built-in Wi-Fi (2.4 GHz)
                                  ▼
                       HTTPS POST /api/telemetry
                                  │ X-Device-Key
                                  ▼
                   Cloud Run app → PostgreSQL
                                  ▼
                     authenticated AquaTrace dashboard
```

**TDS and turbidity measure different things. There is no general TDS-to-NTU conversion.** Here `simulated NTU = TDS ppm × 0.05` is only an arbitrary visual demo relationship. At 100 / 300 / 600 ppm it produces 5 / 15 / 30 simulated NTU. Say “TDS measured; turbidity simulated from TDS” in the demonstration. Do not present agreement between these two plotted channels as independent experimental validation. The firmware identifies itself as `tds-demo-1.0.0`; AquaTrace shows a warning and marks exports with simulated/assumed sources.

## 1. Wire the hardware with power disconnected

| TDS interface board pin  | ESP32 connection                            |
| ------------------------ | ------------------------------------------- |
| VCC / +                  | 3V3, if your exact board supports 3.3V      |
| GND / −                  | GND                                         |
| A / AO / analogue signal | GPIO34, often marked D34                    |
| Probe connector          | Plug the TDS probe into its interface board |

Connect the **interface board's analogue output**, not the bare two-wire probe, to GPIO34. Share ground. Supply the ESP32 through USB initially. Never let an ESP32 ADC input exceed 3.3V. Keep the interface board and ESP32 dry; immerse only the rated probe portion. Confirm your module labels rather than guessing from wire colors.

For DFRobot SEN0244, the documented supply is 3.3–5.5V and analogue output is 0–2.3V; the stated measurement range is 0–1000 ppm. Verify that this is actually your module. GPIO34 is ADC1_CH6 on the classic ESP32, avoiding ADC2's Wi-Fi conflict. An ESP32-C3/S3 has a different pin map, so do not use this pin assignment unchanged on those boards.

Sources: [DFRobot TDS module](https://wiki.dfrobot.com/sen0244), [Espressif GPIO reference](https://documentation.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html), [Espressif ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).

## 2. Install Arduino support

1. Install Arduino IDE from arduino.cc.
2. In **File → Preferences → Additional Boards Manager URLs**, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. In Boards Manager, install **esp32 by Espressif Systems**, a current stable 3.x release.
4. Connect the ESP32 by a USB **data** cable. Select your actual board under Tools → Board (commonly **ESP32 Dev Module** for an ESP-WROOM-32 development board), and select its COM port.
5. Open `firmware/aquatrace_tds_demo/aquatrace_tds_demo.ino`. Keep the `.ino` inside its identically named folder. This example uses only the board package's bundled libraries; no OneWire/DallasTemperature library is needed.

## 3. Configure Wi-Fi and test Serial first

From PowerShell in the project directory:

```powershell
Copy-Item .\firmware\aquatrace_tds_demo\secrets.example.h .\firmware\aquatrace_tds_demo\secrets.h
.\scripts\update-esp32-ca.ps1
```

`root_ca.h` has already been generated in this workspace; the second command refreshes it from Google's public certificate repository. In Arduino IDE, open `secrets.h` and fill:

```cpp
#define WIFI_SSID "YOUR_2_4_GHZ_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_URL "https://YOUR_SERVICE_URL.run.app/api/telemetry"
#define DEVICE_ID "S04"
#define DEVICE_SECRET "YOUR_SAVED_64_CHARACTER_DEVICE_SECRET"
#define UPLOAD_ENABLED false
#define TDS_ADC_PIN 34
#define TDS_CALIBRATION_FACTOR 1.0f
#define WATER_TEMPERATURE_C 25.0f
#define SIMULATED_NTU_PER_PPM 0.05f
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"
```

Use a normal 2.4GHz WPA/WPA2 personal network or a phone hotspot configured for 2.4GHz compatibility. The supplied sketch does not implement university enterprise authentication or captive-portal login. A laptop hotspot can help if campus Wi-Fi requires those.

Click **Upload**. If needed, hold BOOT while the IDE displays “Connecting…” and release once flashing begins. Open Serial Monitor at **115200 baud**. You should see:

```text
ESP32 MAC: XX:XX:XX:XX:XX:XX
Wi-Fi connected. IP: 192.168....
SERIAL-ONLY mode. Set UPLOAD_ENABLED=true after Cloud Run setup.
GPIO34: raw=..., voltage=...V, TDS=...ppm | simulated NTU=... | assumed temperature=25.0C
```

Save the MAC address for sensor registration. Changing water samples should change the voltage and ppm; a disconnected/floating ADC can still produce numbers, so numbers alone do not prove correct wiring.

Calibrate using a known TDS solution within the probe's range. The polynomial and compensation coefficient follow DFRobot's example, while the ESP32 uses `analogReadMilliVolts()` rather than an assumed ideal 3.3V/4095 conversion. If the reference is 342 ppm and the stable reading is 300 ppm, a first calibration adjustment is `TDS_CALIBRATION_FACTOR = 342.0 / 300.0`. Recheck multiple known samples. Temperature is assumed at 25°C in this sketch: use a measured water temperature or the existing DS18B20 firmware for genuine temperature compensation.

## 4. Put the application source in Google Cloud Shell

Cloud Run hosts the web/API server; Cloud SQL stores readings and users. An ESP32 sends HTTP requests to the Cloud Run URL, never a direct database connection. Google Cloud requires billing; Cloud SQL and other resources may incur charges even when the demonstration is idle. Set a billing budget alert.

In PowerShell:

```powershell
cd 'C:\Users\prana\OneDrive\Documents\ChatGPT\Aquatrace'
.\scripts\package-cloudrun.ps1
```

Open Google Cloud Console, select/create a billing-enabled project, then click **Activate Cloud Shell**. Its terminal uses **Bash**, so the commands below are Bash, not PowerShell. Upload `aquatrace-cloudrun.zip` using Cloud Shell's Upload File menu. It contains selected server source and excludes private `.env` and firmware secrets.

```bash
mkdir -p ~/aquatrace
unzip ~/aquatrace-cloudrun.zip -d ~/aquatrace
cd ~/aquatrace
ls package.json Dockerfile cloudbuild.yaml
```

## 5. Create cloud infrastructure

Replace `YOUR_PROJECT_ID` with the project ID (not the display name). Region below is Sydney.

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="australia-southeast1"
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create aquatrace --repository-format=docker --location="$REGION"
gcloud iam service-accounts create aquatrace-run --display-name="AquaTrace runtime"
gcloud iam service-accounts create aquatrace-build --display-name="AquaTrace build"
export RUN_SA="aquatrace-run@$PROJECT_ID.iam.gserviceaccount.com"
export BUILD_SA="aquatrace-build@$PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA" --role=roles/cloudsql.client
for ROLE in roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$BUILD_SA" --role="$ROLE"
done

gcloud sql instances create aquatrace-db --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-custom-1-3840 --region="$REGION" --storage-auto-increase --backup-start-time=17:00
gcloud sql databases create aquatrace --instance=aquatrace-db
read -s -p "Choose a strong NEW database password: " DB_PASSWORD; echo
gcloud sql users create aquatrace --instance=aquatrace-db --password="$DB_PASSWORD"
export SQL_CONNECTION="$PROJECT_ID:$REGION:aquatrace-db"
ENCODED_PASSWORD=$(printf '%s' "$DB_PASSWORD" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(),safe=""))')
DATABASE_URL="postgresql://aquatrace:$ENCODED_PASSWORD@localhost/aquatrace?host=/cloudsql/$SQL_CONNECTION&connection_limit=5&pool_timeout=20"
printf '%s' "$DATABASE_URL" | gcloud secrets create aquatrace-database --data-file=-
unset DB_PASSWORD ENCODED_PASSWORD DATABASE_URL
```

Reuse existing resources rather than rerunning “create” commands. Instance creation can take several minutes. This does not authorize the ESP32 to access PostgreSQL: Cloud Run connects through the Cloud SQL Unix socket/proxy. See [Google's Cloud Run → PostgreSQL guide](https://docs.cloud.google.com/sql/docs/postgres/connect-run).

## 6. Create application and device secrets

Generate a device secret once, save it in your password manager, and use **exactly the same value** in the ESP32's private `DEVICE_SECRET` and the Cloud Run `DEVICE_KEY_S04`. You can generate a random 64-character value with `openssl rand -hex 32`. Do not use the dashboard password as the device key.

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create aquatrace-auth --data-file=-
read -s -p "Paste the saved S04 device secret (32+ characters): " DEVICE_SECRET; echo
printf '%s' "$DEVICE_SECRET" | gcloud secrets create aquatrace-device-s04 --data-file=-
unset DEVICE_SECRET
read -s -p "Choose NEW dashboard admin password (12+ characters): " ADMIN_PASSWORD; echo
printf '%s' "$ADMIN_PASSWORD" | gcloud secrets create aquatrace-admin-initial --data-file=-
unset ADMIN_PASSWORD
for SECRET in aquatrace-database aquatrace-auth aquatrace-device-s04 aquatrace-admin-initial; do
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor
done
```

The commands assume newly created secrets have version **1**. Use the actual version numbers if reusing secrets. The Cloud Run web service will receive only DB/auth/device secrets; the administrator password is used only by a one-off bootstrap job. See [Google's Secret Manager integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

## 7. Build both images in Cloud Build

No Docker installation is required on your laptop.

```bash
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/aquatrace/web:v1"
export MIGRATION_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/aquatrace/migration:v1"
gcloud builds submit --region="$REGION" --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA" --config=cloudbuild.yaml --substitutions="_WEB_IMAGE=$IMAGE,_MIGRATION_IMAGE=$MIGRATION_IMAGE" .
```

Wait for **SUCCESS**. If your account cannot create service accounts or grant IAM roles, a project administrator must grant the listed permissions; changing source code cannot fix an IAM denial.

## 8. Initialize the production database and first administrator

```bash
gcloud run jobs create aquatrace-migrate --image="$MIGRATION_IMAGE" --region="$REGION" --service-account="$RUN_SA" --set-cloudsql-instances="$SQL_CONNECTION" --set-secrets=DATABASE_URL=aquatrace-database:1 --tasks=1 --max-retries=0
gcloud run jobs execute aquatrace-migrate --region="$REGION" --wait

read -p "Your dashboard administrator email: " ADMIN_EMAIL
gcloud run jobs create aquatrace-bootstrap --image="$MIGRATION_IMAGE" --region="$REGION" --service-account="$RUN_SA" --set-cloudsql-instances="$SQL_CONNECTION" --set-secrets=DATABASE_URL=aquatrace-database:1,BOOTSTRAP_ADMIN_PASSWORD=aquatrace-admin-initial:1 --set-env-vars="BOOTSTRAP_ADMIN_EMAIL=$ADMIN_EMAIL,BOOTSTRAP_ADMIN_NAME=Network Administrator" --command=./node_modules/.bin/tsx --args=scripts/bootstrap-cloud-admin.ts --tasks=1 --max-retries=0
gcloud run jobs execute aquatrace-bootstrap --region="$REGION" --wait
```

Both executions must succeed before continuing. This creates a new administrator without seeding demo accounts or changing existing users/passwords/roles. You may delete the one-off bootstrap job after successful setup and remove its password-secret access. For later releases, update job images and run migrations again. [Cloud Run job command reference](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/create).

## 9. Deploy AquaTrace

```bash
gcloud run deploy aquatrace --image="$IMAGE" --region="$REGION" --service-account="$RUN_SA" --port=8080 --allow-unauthenticated --add-cloudsql-instances="$SQL_CONNECTION" --set-secrets=DATABASE_URL=aquatrace-database:1,AUTH_SECRET=aquatrace-auth:1,DEVICE_KEY_S04=aquatrace-device-s04:1 --set-env-vars=APP_URL=https://placeholder.invalid,DEMO_MODE=false --memory=512Mi --cpu=1 --max-instances=3 --concurrency=40
export APP_URL="$(gcloud run services describe aquatrace --region="$REGION" --format='value(status.url)')"
gcloud run services update aquatrace --region="$REGION" --update-env-vars="APP_URL=$APP_URL"
echo "$APP_URL"
```

Open the printed HTTPS URL. **Do not put `localhost` in the ESP32 API_URL**: that means the ESP32 itself, not your computer or Cloud Run. First set the actual Cloud Run URL as APP_URL using the update above so browser mutations pass origin checks.

`--allow-unauthenticated` makes the service reachable from an ordinary ESP32. The app still requires dashboard sessions for read routes and `X-Device-Key` for device uploads. The upload key goes in an HTTPS header, never the URL. The database is not public telemetry access. No CORS changes or port forwarding are needed.

## 10. Register S04 in the hosted dashboard

1. Open `$APP_URL/admin/login` and log in using the administrator email/password you just created. Local `.local` demo logins do **not** exist in this fresh production DB.
2. Go to **Sensors → Add Sensor**.
3. Enter **Sensor ID S04** exactly. Server environment **DEVICE_KEY_S04** must correspond to the sketch's **DEVICE_ID S04**.
4. Set a descriptive location name such as **Bench demo — TDS measured / turbidity simulated**. Enter your actual test location's latitude/longitude and the ESP32 MAC from Serial. Do not use sample East River coordinates for a real deployment.
5. Keep network **East River** for the existing workspace selector, connection **Wi-Fi**, interval **5 seconds**, flow order **4**, and device enabled. You can rename/configure another network later.
6. Save. S04 will initially show Offline until the first upload arrives.

Stop the laptop's `npm run demo:stream` before connecting a physical ESP32 to the **same local database and device ID**, or their uploads will mix. Your local simulator does not normally target the fresh hosted DB.

## 11. Point the ESP32 at Cloud Run and upload

In the private `firmware/aquatrace_tds_demo/secrets.h`:

```cpp
#define API_URL "https://THE_EXACT_PRINTED_CLOUD_RUN_HOST/api/telemetry"
#define DEVICE_ID "S04"
#define DEVICE_SECRET "THE_EXACT_VALUE_SAVED_AS_aquatrace-device-s04"
#define UPLOAD_ENABLED true
```

Keep GPIO34 and your Wi-Fi credentials. Reflash. The included Google trust roots validate HTTPS without `setInsecure()`; SNTP sets UTC for certificate checks and measurement timestamps. Refresh roots with `scripts/update-esp32-ca.ps1` if required and reflash. For a custom domain using another CA, supply the appropriate trusted root instead. Public root certificates are not passwords. [Google Trust Services repository](https://pki.goog/repository/).

Expected Serial output:

```text
UPLOAD OK 201 | S04 | TDS ... ppm | SIMULATED turbidity ... NTU
```

The authenticated dashboard should show S04 Online within a refresh cycle. You can turn off the PC after hosting: the ESP32 needs USB power, Wi-Fi and internet, not a running local app. Your chosen Wi-Fi access point must remain on.

## 12. Verify and troubleshoot

```bash
curl --fail "$APP_URL/api/health"   # {"status":"ok"}
curl -i "$APP_URL/api/workspace"   # 401 without login
curl -i "$APP_URL/api/export"      # 401 without login
gcloud run services logs read aquatrace --region="$REGION" --limit=50
```

| Symptom                           | What to check                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Wi-Fi never connects              | Correct 2.4GHz SSID/password, signal, hotspot compatibility; no captive portal/enterprise login                                            |
| Always 0 ppm                      | Interface AO → D34, shared ground, sensor power, probe connector; do not test a floating ADC                                               |
| ADC near 4095                     | Wrong wiring/attenuation or excessive voltage; disconnect and inspect before continuing                                                    |
| HTTPS error / negative HTTP code  | Internet/DNS, SNTP clock, correct HTTPS URL, trusted root, outbound network restrictions; initial Cloud Run cold start may require a retry |
| 400                               | Read JSON error: missing fields, bad ranges, invalid timestamp, or server still on an older version that requires turbidity ADC            |
| 401                               | Exact matching DEVICE_SECRET and DEVICE_KEY_S04 secret version; no dashboard password in the key field                                     |
| 404                               | Register S04, enable it, and use `/api/telemetry` exactly                                                                                  |
| 429                               | Wait a minute, correct invalid credentials, preserve five-second uploads                                                                   |
| 503                               | Check Cloud SQL, migrations, secret bindings and service-account roles                                                                     |
| Serial 201 but chart not updating | Open the hosted URL, correct network/S04, select 1 Hour, check current timestamp and refresh                                               |
| Sensor goes stale                 | Upload failures, Wi-Fi/power loss or incorrect clock; stale defaults to 60s, offline 180s                                                  |

Firmware uploads run on a separate task so failed HTTPS requests do not stop one-second sampling. Backoff is 1–60s; only the newest pending five-second batch is kept in RAM. This is not a durable offline recorder. The delivered code has not been compiled/flashed against your board here; use Arduino IDE Verify/Upload and the Serial checks before relying on it. Cloud resources are described, not created by this guide.
