# Start here: local laptop hosting + Pixel hotspot + ESP32 GPIO34

Use this guide instead of the Cloud Run guide. No Google account, cloud deployment, separate Wi-Fi module, certificates or internet connection is needed **during the demo**. Install Arduino's board support beforehand while you have internet.

Readings, uploads and charts work locally without internet. The OpenStreetMap background tiles still require internet access unless already cached; an offline map background does not stop sensor uploads.

Your phone provides the Wi-Fi network. Your **laptop** runs AquaTrace and its local database. Your ESP32 reads the TDS sensor and sends readings to the laptop. Both laptop and ESP32 must join the Pixel hotspot.

```text
TDS sensor → ESP32 GPIO34 → Pixel Wi-Fi hotspot → laptop:3000 → local PostgreSQL
                                                    ↓
                                        laptop browser: localhost:3000
```

Your latest hotspot name (`connection_test`) and supplied password are already stored in the private, Git-ignored `firmware/aquatrace_tds_local/secrets.h` on this computer. They are not in the public example, ZIP, README or app browser bundle. You do not need to connect to the hotspot right now; do that before step 4, then obtain the laptop's address on that network. Never assume today's address on another Wi-Fi network will work at the demonstration.

## 1. Hardware

This sketch assumes a classic ESP32/ESP-WROOM-32 development board, not an ESP32-C3/S3 with a different pin map. With power disconnected:

| TDS module pin           | ESP32 pin                                    |
| ------------------------ | -------------------------------------------- |
| VCC / +                  | 3V3, provided the exact module supports 3.3V |
| GND / −                  | GND                                          |
| AO / A / analogue signal | GPIO34 / D34                                 |
| Probe socket             | Connect the TDS probe to its interface board |

Use the TDS **interface board**, not the bare probe directly. Keep electronics dry. Never apply more than 3.3V to GPIO34. Power the ESP32 by USB initially. For the SEN0244 the specified supply is 3.3–5.5V and its output is 0–2.3V; check your exact module rather than guessing by wire color. [DFRobot specification](https://wiki.dfrobot.com/sen0244), [Espressif ADC reference](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).

## 2. Install Arduino support now

1. Install Arduino IDE from https://www.arduino.cc/en/software.
2. In File → Preferences → Additional Boards Manager URLs add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. Open Boards Manager and install **esp32 by Espressif Systems**, a current stable **3.x** release.
4. Select the correct board (commonly **ESP32 Dev Module** for an ESP-WROOM-32 board) and COM port. Use a USB data cable.

The local sketch only uses libraries bundled with the ESP32 board package. Do not use the earlier Cloud Run sketch for this workflow.

## 3. Prepare the Pixel hotspot for the demonstration

On the Pixel, open Settings → Network & internet → Hotspot & tethering → Wi-Fi hotspot and turn it on. Enable a band/compatibility option that supports **2.4GHz**; the exact label varies by Android version. Avoid a 5GHz/6GHz-only mode for a classic ESP32. Disable automatic hotspot shutdown for the demonstration if needed.

Set the phone hotspot name to `connection_test` and its password to the latest value you supplied, then connect the Windows laptop to it. Updating the ESP32 file does not change the phone settings automatically. Leave the phone hotspot on. Mobile data is not required by this application if the phone permits local client communication with it disabled. The ESP32 obtains time from the laptop rather than public NTP. [Pixel hotspot help](https://support.google.com/pixelphone/answer/2812516).

In Windows, set **this trusted hotspot connection** to **Private** under the Wi-Fi network's properties. Do not change unrelated networks.

## 4. Find the laptop's hotspot IP

Open PowerShell and run:

```powershell
ipconfig
```

Under **Wireless LAN adapter Wi-Fi**, find **IPv4 Address**. It might look like `192.168.123.45`. Use the laptop's address, **not** Default Gateway (the phone), not the phone's IP, not an Ethernet/VPN/virtual adapter, and not `127.0.0.1`.

The address can change after reconnecting. Repeat this step if it changes.

## 5. Start AquaTrace and configure the ESP32 automatically

This Windows workspace already has Node.js, dependencies, a local PostgreSQL runtime, migrations and local accounts prepared. Open PowerShell and run:

```powershell
cd 'C:\Users\prana\OneDrive\Documents\ChatGPT\Aquatrace'
.\scripts\start-local-demo.ps1 -ComputerIp 192.168.123.45
```

**Replace `192.168.123.45` with the real Wi-Fi IPv4 from step 4.** Do not copy the example address unchanged. If PowerShell blocks the script, run this once in that terminal (it changes only that process):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then run the startup command again. Do not use Bypass to run unrelated downloaded scripts.

The startup helper:

- Keeps your private hotspot credentials intact.
- Writes the correct laptop address into the local firmware's private `secrets.h`.
- Copies the existing server's S04 device key into that same private file; you do not have to copy or display the key.
- Starts the prepared PostgreSQL database on loopback port 55432 if needed.
- Applies migrations and ensures an enabled S04 and local administrator exist.
- Starts the app on port 3000, listening on the laptop's interfaces.

Keep that PowerShell terminal open. The final output should include `Ready` and `http://localhost:3000`.

If port 3000 is already occupied by an older AquaTrace terminal, stop that terminal with Ctrl+C before rerunning the helper. The helper does not kill arbitrary processes. **Do not run `npm run demo:stream`**: the physical ESP32 should be the writer for S04.

Open **http://localhost:3000/admin/login** on the laptop:

- Email: `admin@aquatrace.local`
- Password: `AquaTrace-demo-2026!`
- Select **Admin Login**.

This is a local demo account. The helper preserves any existing password. It does not reset accounts or delete data. S04 initially shows Offline until the ESP32 uploads. Other seeded demonstration devices may remain Offline; that is expected.

## 6. Allow the laptop connection through Windows Firewall

If Windows asks whether Node.js can communicate, allow it on your **Private network**. The ESP32 needs inbound access to TCP port 3000.

If the prompt never appears and the ESP32 cannot connect, open **PowerShell as Administrator** and add a narrowly scoped rule:

```powershell
New-NetFirewallRule -DisplayName 'AquaTrace local demo TCP 3000' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

Do not disable Windows Firewall. No port forwarding is needed. Local HTTP is unencrypted, including the device-key header; use only your trusted demonstration hotspot and do not expose port 3000 to the internet.

## 7. Open and flash the LOCAL sketch

In Arduino IDE open this exact file:

```text
C:\Users\prana\OneDrive\Documents\ChatGPT\Aquatrace\firmware\aquatrace_tds_local\aquatrace_tds_local.ino
```

Keep it in the identically named `aquatrace_tds_local` folder. The startup helper updates `secrets.h` next to it. It already contains your hotspot credentials; do not replace it with the generic example. Its server setting will now look like:

```cpp
#define SERVER_BASE_URL "http://YOUR_LAPTOP_WIFI_IP:3000"
#define DEVICE_ID "S04"
#define TDS_ADC_PIN 34
```

The helper supplies the actual address and matching device secret. **There is no Cloud Run URL, certificate step, NTP setting or UPLOAD_ENABLED switch in this local sketch.** It starts local uploads automatically.

Click Verify, then Upload. If flashing stalls on “Connecting…”, hold BOOT briefly until flashing begins, then release. Open Serial Monitor at **115200 baud**.

Expect:

```text
ESP32 MAC: ...
Wi-Fi connected. IP: ...
Local server: http://YOUR_LAPTOP_WIFI_IP:3000 | uploads every 5 seconds
Clock synchronised with laptop. Internet/NTP not needed.
GPIO34: raw=..., voltage=...V, TDS=...ppm
UPLOAD OK 201 | S04 | TDS ... ppm | SIMULATED turbidity ... NTU
```

The ESP32's own IP is different from the laptop's; that is normal. The clock endpoint is authenticated by the same device key, checks S04 is enabled, and returns only the laptop's UTC epoch time. It does not expose telemetry or dashboard access.

## 8. View and demonstrate

On the laptop go to Dashboard or Sensors → S04. Within a five-second refresh, S04 should show Online and changing readings. Keep the laptop awake, the app terminal open, the local DB running, the phone hotspot on and the ESP32 powered.

For presentation accuracy, replace the demo location and MAC in Sensors → Configure with the actual test details. A newly created local sensor uses a clearly artificial 0,0 location and placeholder MAC until you fill those in. They do not authenticate the upload: the device ID and secret do.

TDS is estimated from the measured analogue voltage and needs calibration against a known standard. The sketch uses:

```text
simulated turbidity = TDS ppm × 0.05
assumed temperature = 25°C
```

This is an arbitrary visual demonstration relationship, not a scientific TDS-to-NTU conversion. AquaTrace labels it as simulated/assumed. To calibrate TDS, adjust `TDS_CALIBRATION_FACTOR` in the private header after testing a known reference. No independent turbidity or temperature measurement exists in this configuration.

## 9. Next time / changing Wi-Fi

Connect the laptop to the Pixel hotspot, run `ipconfig`, rerun the same startup command with that IP, then reflash if the server address changed. The sketch remembers only its compiled server address. Stopping and restarting the app does not erase stored readings.

Stop the app with Ctrl+C when finished. Do not create a cloud deployment or start the synthetic stream for this workflow.

## Troubleshooting

| Symptom                                               | Check                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Wi-Fi never connects                                  | Hotspot on; configured name/password; 2.4GHz compatibility; correct classic ESP32 board                      |
| `Laptop clock failed: HTTP -1` or other negative code | Laptop's current hotspot IPv4, app running, Windows Private profile/firewall, peer communication allowed     |
| Clock/upload 401                                      | Rerun startup helper to copy matching S04 key; reflash; do not put the dashboard password in DEVICE_SECRET   |
| Clock/upload 404                                      | Enabled S04 must exist; startup helper ensures it; verify SERVER_BASE_URL has no `/api/telemetry` suffix     |
| Upload 400                                            | Laptop clock/date, calibration/ranges, current app version; inspect Serial JSON error                        |
| 429                                                   | Wait a minute, fix incorrect key or looping requests                                                         |
| 503                                                   | Local PostgreSQL, migrations or server configuration                                                         |
| Laptop browser works but ESP32 cannot reach it        | `localhost` browser access does not prove LAN access; check firewall and hotspot client isolation            |
| Constant/floating readings                            | Shared ground, module AO → GPIO34, correct supply, connected probe; a floating ADC can still produce numbers |
| Sensor becomes Offline                                | App/device/phone power or Wi-Fi loss; stale after 60s and offline after 180s by default                      |

Some hotspot/network configurations isolate clients. That must be tested when you connect the devices; if the Pixel blocks communication between them, use another trusted Wi-Fi router/hotspot that permits peer traffic. An IP address on the same named network does not override client isolation.

### If the prepared PostgreSQL runtime is missing

On another machine, the ignored QA database/runtime is not part of the source ZIP. Install Docker Desktop or PostgreSQL rather than expecting it to appear automatically. With Docker Desktop, `docker compose up -d db` starts the supplied local database at port 5432. Set DATABASE_URL in `.env` to the README's local Docker URL, then use `node scripts/prepare-local-device.mjs YOUR_IP`, `npm run db:migrate`, `npx tsx --env-file=.env scripts/setup-local-demo.ts` and `npm run dev`. The convenience startup helper is specifically for the prepared port-55432 database in this Windows workspace.

### Verification limits

The backend and local configuration validation are tested on this computer. Your physical board has not been flashed here. The phone hotspot is not currently connected, so ESP32-to-laptop peer access and Windows Firewall must be verified at demonstration setup time.

## Two monitoring points and real-data alerts

Local demonstration mode (`LOCAL_DEMONSTRATION=true`, set by the preparation helper) shows S04 and SYD01 only. Old seeded sensors and readings remain stored but are excluded from this view. S04 charts, daily TDS averages, peak TDS, rankings and CSV exports use uploads identified as `tds-demo-*` with a supplied TDS ADC sample. No synthetic stream should run; it is disabled in local mode. Until physical uploads arrive, no measured history is shown.

S04 measures freshwater TDS on GPIO34. Turbidity is simulated from TDS and temperature is assumed at 25 °C, including for TDS compensation. These channels do not trigger alerts and are excluded from measured charts and network averages. Calibrate the TDS meter with a suitable standard; temperature and calibration affect accuracy.

The fixed freshwater profile follows the [Australian Drinking Water Guidelines TDS fact sheet](https://guidelines.nhmrc.gov.au/australian-drinking-water-guidelines/part-5/physical-chemical-characteristics/total-dissolved-solids): up to 600 mg/L (approximately ppm in freshwater) is good palatability, above 600–900 fair, above 900–1,200 poor, above 1,200 unacceptable. The app warns above 600 ppm, marks above 900 poor, and raises a critical instrument-range alert above 1,000 ppm because the [SEN0244 range](https://wiki.dfrobot.com/sen0244) is only 0–1,000 ppm. These are taste bands and an instrument limit, not health-based danger limits. Low TDS does not prove drinking-water safety. No seawater comparison or pollution diagnosis is made.

SYD01 is a permanently offline historical reference at the Sydney Harbour Bridge, not an installed device. Its linked source is the NSW Western Harbour Tunnel marine water quality technical report (January 2020), Table 3-5: Barangaroo South, April 2012–December 2017. The median of monthly average turbidity was 2.4 NTU, with monthly averages ranging 0.7–8.4 NTU. This is a nearby historical proxy, not a bridge-specific measurement. There is no verified individual last sample or TDS/temperature record, so the app shows the source period and leaves those values unavailable. The reference never contributes alerts or measured analytics.

## Sensor location

On the laptop open **http://localhost:3000/admin/login**, sign in, then open Dashboard or Map and allow browser location access. The sensor location matches this laptop’s location. Automatic updates run while that page remains open; the saved coordinates also update the shared map for other viewers. Reported accuracy is displayed. Until a location is saved, S04 says Location pending and no old American marker is shown. SYD01 remains fixed at the bridge.

If location is unavailable, enable Windows Settings → Privacy & security → Location, and check the browser’s location permission for localhost. Retry **Update sensor location**, or enter known coordinates under Sensors → S04 → Configure. Browser location may be approximate; most laptops do not have GPS hardware. Being on the same Wi-Fi does not itself determine coordinates. Location requests require localhost or HTTPS; use localhost on the laptop rather than the LAN HTTP address. Map tiles and some location providers may need internet access, even though ESP32 uploads are local.
