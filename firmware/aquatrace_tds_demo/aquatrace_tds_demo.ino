/* AquaTrace TDS-only demonstration, classic ESP32 / ESP-WROOM-32.
 * TDS module signal -> GPIO34 (ADC1), VCC -> 3V3, GND -> GND.
 * Use a compatible analogue TDS interface board, NOT the bare probe.
 * Never apply more than 3.3V to an ESP32 GPIO.
 * Actual TDS is estimated from measured voltage. Turbidity is SIMULATED
 * from TDS, temperature is ASSUMED, and neither is an independent reading.
 * Uses only libraries bundled with Espressif's Arduino ESP32 board package.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <math.h>
#include "secrets.h"
#include "root_ca.h"

static_assert(TDS_ADC_PIN == 34, "This wiring guide uses GPIO34 on a classic ESP32");
constexpr char FIRMWARE[] = "tds-demo-1.0.0";
constexpr uint32_t SAMPLE_MS = 1000, UPLOAD_MS = 5000;
struct Batch { float tds, ntu, temperature; int raw; time_t timestamp; };
QueueHandle_t uploadQueue;
uint32_t lastSample=0, lastBatch=0;
float tdsSum=0; long adcSum=0; unsigned samples=0;

float readVoltage(int &raw) {
  uint32_t mv[15]; long counts=0;
  for(int i=0;i<15;i++) { mv[i]=analogReadMilliVolts(TDS_ADC_PIN); counts+=analogRead(TDS_ADC_PIN); delayMicroseconds(200); }
  for(int i=1;i<15;i++) { uint32_t v=mv[i]; int j=i-1; while(j>=0&&mv[j]>v){mv[j+1]=mv[j];j--;} mv[j+1]=v; }
  raw=counts/15;
  return mv[7]/1000.0f;
}

void uploadTask(void *) {
  Batch pending={}; bool hasPending=false;
  uint32_t backoff=1000, lastWifiRetry=0;
  for(;;) {
    Batch newest;
    if(xQueueReceive(uploadQueue,&newest,pdMS_TO_TICKS(250))==pdTRUE){pending=newest;hasPending=true;}
    if(WiFi.status()!=WL_CONNECTED) {
      if(millis()-lastWifiRetry>10000){lastWifiRetry=millis();Serial.println("Wi-Fi disconnected: reconnecting to 2.4GHz network");WiFi.reconnect();}
      vTaskDelay(pdMS_TO_TICKS(250)); continue;
    }
    if(!UPLOAD_ENABLED||!hasPending)continue;
    if(pending.timestamp<1700000000){Serial.println("Clock not synchronised; skipping this batch. Check NTP/internet access.");hasPending=false;continue;}
    if(!String(API_URL).startsWith("https://")||strlen(DEVICE_SECRET)<32||strlen(GOOGLE_ROOT_CA)<100){Serial.println("Configure HTTPS API_URL, device secret and root_ca.h before uploading");vTaskDelay(pdMS_TO_TICKS(10000));continue;}
    struct tm utc;gmtime_r(&pending.timestamp,&utc);char timestamp[30];strftime(timestamp,sizeof(timestamp),"%Y-%m-%dT%H:%M:%S.000Z",&utc);
    char json[480];
    // No turbidityAdc field: there is no physical turbidity measurement.
    snprintf(json,sizeof(json),"{\"deviceId\":\"%s\",\"timestamp\":\"%s\",\"tdsPpm\":%.2f,\"turbidityNtu\":%.2f,\"temperatureC\":%.2f,\"raw\":{\"tdsAdc\":%d},\"firmwareVersion\":\"%s\"}",DEVICE_ID,timestamp,pending.tds,pending.ntu,pending.temperature,pending.raw,FIRMWARE);
    WiFiClientSecure client;client.setCACert(GOOGLE_ROOT_CA);client.setHandshakeTimeout(15);
    HTTPClient http;http.setConnectTimeout(15000);http.setTimeout(20000);
    int status=-1;
    if(http.begin(client,API_URL)) {
      http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Key",DEVICE_SECRET);
      status=http.POST((uint8_t*)json,strlen(json));
      if(status>=200&&status<300){Serial.printf("UPLOAD OK %d | %s | TDS %.1f ppm | SIMULATED turbidity %.1f NTU\n",status,DEVICE_ID,pending.tds,pending.ntu);hasPending=false;backoff=1000;}
      else {Serial.printf("UPLOAD FAILED %d | %s\n",status,http.getString().c_str());}
      http.end();
    } else Serial.println("HTTP/TLS setup failed: check URL and certificate");
    if(hasPending){Serial.printf("Retry in %lu ms; latest batch replaces older pending data\n",(unsigned long)backoff);vTaskDelay(pdMS_TO_TICKS(backoff));backoff=backoff>=30000?60000:backoff*2;}
  }
}

void setup() {
  Serial.begin(115200);delay(300);
  Serial.println("AquaTrace: measured TDS voltage, SIMULATED turbidity, ASSUMED 25C temperature");
  analogReadResolution(12);analogSetPinAttenuation(TDS_ADC_PIN,ADC_11db);
  WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);WiFi.setAutoReconnect(true);
  Serial.printf("ESP32 MAC: %s\n",WiFi.macAddress().c_str());
  uint32_t started=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-started<20000){delay(250);Serial.print('.');}
  if(WiFi.status()==WL_CONNECTED)Serial.printf("\nWi-Fi connected. IP: %s\n",WiFi.localIP().toString().c_str());
  else Serial.println("\nWi-Fi not connected. Sampling continues; background reconnect enabled.");
  configTime(0,0,NTP_SERVER_1,NTP_SERVER_2);
  uploadQueue=xQueueCreate(1,sizeof(Batch));
  if(!uploadQueue||xTaskCreate(uploadTask,"aquatrace-upload",12288,nullptr,1,nullptr)!=pdPASS){Serial.println("Unable to allocate uploader task");while(true)delay(1000);}
  Serial.println(UPLOAD_ENABLED?"Uploads enabled every 5s":"SERIAL-ONLY mode. Set UPLOAD_ENABLED=true after Cloud Run setup.");
}

void loop() {
  uint32_t now=millis();
  if(now-lastSample>=SAMPLE_MS) {
    lastSample=now;int raw;float voltage=readVoltage(raw);
    if(raw>=4090||voltage>3.1f){Serial.println("ADC saturation: inspect module voltage, ground and wiring");return;}
    float compensated=voltage/(1.0f+0.02f*(WATER_TEMPERATURE_C-25.0f));
    float ppm=(133.42f*powf(compensated,3)-255.86f*powf(compensated,2)+857.39f*compensated)*0.5f*TDS_CALIBRATION_FACTOR;
    if(!isfinite(ppm)||ppm<0||ppm>10000){Serial.println("Invalid calculated TDS; inspect calibration");return;}
    tdsSum+=ppm;adcSum+=raw;samples++;
    Serial.printf("GPIO34: raw=%d, voltage=%.3fV, TDS=%.1fppm | simulated NTU=%.1f | assumed temperature=%.1fC\n",raw,voltage,ppm,ppm*SIMULATED_NTU_PER_PPM,WATER_TEMPERATURE_C);
  }
  if(now-lastBatch>=UPLOAD_MS) {
    lastBatch=now;
    if(samples){float mean=tdsSum/samples;Batch b={mean,mean*SIMULATED_NTU_PER_PPM,WATER_TEMPERATURE_C,(int)(adcSum/samples),time(nullptr)};xQueueOverwrite(uploadQueue,&b);tdsSum=0;adcSum=0;samples=0;}
  }
  delay(5);
}
