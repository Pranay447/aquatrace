#pragma once
// Copy this file to secrets.h, in the SAME folder as aquatrace_tds_demo.ino.
// secrets.h is ignored by Git. Never commit completed credentials.
#define WIFI_SSID "YOUR_2_4_GHZ_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_URL "https://YOUR_SERVICE_URL.run.app/api/telemetry"
#define DEVICE_ID "S04"
#define DEVICE_SECRET "THE_SAME_32_PLUS_CHARACTER_DEVICE_KEY_S04_SECRET_AS_CLOUD_RUN"
#define UPLOAD_ENABLED false // First test Serial; change to true after hosting.
#define TDS_ADC_PIN 34
#define TDS_CALIBRATION_FACTOR 1.0f // Tune using a known TDS standard.
#define WATER_TEMPERATURE_C 25.0f // Assumed, NOT measured in this TDS-only sketch.
#define SIMULATED_NTU_PER_PPM 0.05f // Arbitrary demo relationship, NOT a conversion.
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"
