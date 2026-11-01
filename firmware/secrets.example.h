#pragma once
// Copy to secrets.h (gitignored). Never commit the completed file.
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_URL "https://YOUR_CLOUD_RUN_HOST/api/telemetry"
#define DEVICE_ID "S04"
#define DEVICE_SECRET "REPLACE_WITH_THE_SAME_32_PLUS_CHARACTER_SERVER_SECRET"
// Paste the PEM root CA that validates your deployed HTTPS certificate chain.
// Do not use setInsecure(). Keep the trust anchor current.
const char ROOT_CA[] = R"PEM(-----BEGIN CERTIFICATE-----
PASTE_ROOT_CA_CERTIFICATE_HERE
-----END CERTIFICATE-----
)PEM";
// REQUIRED: select final ADC1 pins (ADC2 conflicts with Wi-Fi) and data pin.
#define TURBIDITY_ADC_PIN -1
#define TDS_ADC_PIN -1
#define DS18B20_DATA_PIN -1
// Set true only after calibration against known reference standards.
#define CALIBRATION_CONFIRMED false
// Example placeholders, NOT validated calibration for your sensor.
#define TURBIDITY_A 0.0f
#define TURBIDITY_B -1000.0f
#define TURBIDITY_C 3300.0f
#define TDS_A 133.42f
#define TDS_B -255.86f
#define TDS_C 857.39f
#define TDS_SCALE 0.5f
#define TDS_TEMP_COEFFICIENT 0.02f
#define SENSOR_VOLTAGE_RATIO 1.0f
#define UPLOAD_INTERVAL_MS 5000UL
