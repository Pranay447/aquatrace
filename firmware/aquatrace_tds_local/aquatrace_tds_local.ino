/* AquaTrace LOCAL HTTP demonstration, classic ESP32 / ESP-WROOM-32.
 * Private hotspot only. No Google Cloud, TLS certificate or internet needed.
 * SERVER_BASE_URL is your laptop Wi-Fi IPv4 address, never localhost.
 * TDS module signal -> GPIO34 (ADC1), VCC -> 3V3, GND -> GND.
 * Use a compatible analogue TDS interface board, NOT the bare probe.
 * Never apply more than 3.3V to an ESP32 GPIO.
 * DS18B20: VDD -> 3V3, GND -> GND, DQ -> GPIO4.
 * Fit 4.7k ohm between GPIO4 and 3V3 (unless present on the module).
 * Install OneWire (Paul Stoffregen) and DallasTemperature (Miles Burton).
 * TDS uses measured temperature compensation. No turbidity value is sent.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <time.h>
#include <sys/time.h>
#include <stdlib.h>
#include <math.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "secrets.h"


static_assert(TDS_ADC_PIN == 34, "This wiring guide uses GPIO34 on a classic ESP32");
constexpr char FIRMWARE[] = "tds-temp-local-2.0.0";
constexpr uint8_t TEMPERATURE_PIN = 4;
OneWire temperatureBus(TEMPERATURE_PIN);
DallasTemperature temperatureSensor(&temperatureBus);
constexpr uint32_t SAMPLE_MS = 1000, UPLOAD_MS = 5000;
struct Batch { float tds, temperature; int raw; time_t timestamp; };
QueueHandle_t uploadQueue;
uint32_t lastSample=0, lastBatch=0;
float tdsSum=0, temperatureSum=0; long adcSum=0; unsigned samples=0;

float readVoltage(int &raw) {
  uint32_t mv[15]; long counts=0;
  for(int i=0;i<15;i++) { mv[i]=analogReadMilliVolts(TDS_ADC_PIN); counts+=analogRead(TDS_ADC_PIN); delayMicroseconds(200); }
  for(int i=1;i<15;i++) { uint32_t v=mv[i]; int j=i-1; while(j>=0&&mv[j]>v){mv[j+1]=mv[j];j--;} mv[j+1]=v; }
  raw=counts/15;
  return mv[7]/1000.0f;
}

bool privateServer() {
  String address=String(SERVER_BASE_URL);
  if(!address.startsWith("http://"))return false;
  String host=address.substring(7);int colon=host.indexOf(':');if(colon>=0)host=host.substring(0,colon);
  IPAddress ip;if(!ip.fromString(host))return false;
  return ip[0]==10||(ip[0]==172&&ip[1]>=16&&ip[1]<=31)||(ip[0]==192&&ip[1]==168);
}

bool syncLaptopClock() {
  WiFiClient connection;HTTPClient clockRequest;clockRequest.setConnectTimeout(4000);clockRequest.setTimeout(5000);
  if(!clockRequest.begin(connection,String(SERVER_BASE_URL)+"/api/device-time"))return false;
  clockRequest.addHeader("Content-Type","application/json");clockRequest.addHeader("X-Device-Key",DEVICE_SECRET);
  String payload=String("{\"deviceId\":\"")+DEVICE_ID+"\"}";
  int status=clockRequest.POST(payload);String result=clockRequest.getString();clockRequest.end();
  if(status!=200){Serial.printf("Laptop clock failed: HTTP %d. Check server IP, firewall, S04 and device key.\n",status);return false;}
  int key=result.indexOf("\"unixTime\":");if(key<0)return false;
  long long seconds=strtoll(result.c_str()+key+11,nullptr,10);
  if(seconds<1700000000LL||seconds>4102444800LL)return false;
  struct timeval tv;tv.tv_sec=(time_t)seconds;tv.tv_usec=0;
  if(settimeofday(&tv,nullptr)!=0)return false;
  Serial.println("Clock synchronised with laptop. Internet/NTP not needed.");return true;
}

void uploadTask(void *) {
  Batch pending={};bool hasPending=false;uint32_t backoff=1000,lastWifiRetry=0,lastClockAttempt=0,lastClockSuccess=0;
  for(;;){
    Batch newest;if(xQueueReceive(uploadQueue,&newest,pdMS_TO_TICKS(250))==pdTRUE){pending=newest;hasPending=true;}
    if(WiFi.status()!=WL_CONNECTED){if(millis()-lastWifiRetry>10000){lastWifiRetry=millis();Serial.println("Reconnecting to hotspot...");WiFi.reconnect();}continue;}
    if(!privateServer()||strlen(DEVICE_SECRET)<32){Serial.println("Run local setup: private HTTP server address and matching device key required.");vTaskDelay(pdMS_TO_TICKS(10000));continue;}
    bool clockNeeded=time(nullptr)<1700000000||millis()-lastClockSuccess>60000;
    if(clockNeeded&&millis()-lastClockAttempt>5000){lastClockAttempt=millis();if(syncLaptopClock())lastClockSuccess=millis();}
    if(!hasPending)continue;
    if(pending.timestamp<1700000000){hasPending=false;continue;}
    struct tm utc;gmtime_r(&pending.timestamp,&utc);char timestamp[30];strftime(timestamp,sizeof(timestamp),"%Y-%m-%dT%H:%M:%S.000Z",&utc);
    char json[480];
    snprintf(json,sizeof(json),"{\"deviceId\":\"%s\",\"timestamp\":\"%s\",\"tdsPpm\":%.2f,\"temperatureC\":%.2f,\"raw\":{\"tdsAdc\":%d},\"firmwareVersion\":\"%s\"}",DEVICE_ID,timestamp,pending.tds,pending.temperature,pending.raw,FIRMWARE);
    WiFiClient connection;HTTPClient http;http.setConnectTimeout(4000);http.setTimeout(5000);
    int status=-1;
    if(http.begin(connection,String(SERVER_BASE_URL)+"/api/telemetry")){
      http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Key",DEVICE_SECRET);
      status=http.POST((uint8_t*)json,strlen(json));
      if(status>=200&&status<300){Serial.printf("UPLOAD OK %d | S04 | TDS %.1f ppm | temperature %.2f C\n",status,pending.tds,pending.temperature);hasPending=false;backoff=1000;}
      else Serial.printf("UPLOAD FAILED %d | %s\n",status,http.getString().c_str());
      http.end();
    }
    if(hasPending){vTaskDelay(pdMS_TO_TICKS(backoff));backoff=backoff>=30000?60000:backoff*2;}
  }
}

void setup() {
  Serial.begin(115200);delay(300);
  Serial.println("AquaTrace: TDS GPIO34 + DS18B20 temperature GPIO4");
  temperatureSensor.begin();
  temperatureSensor.setResolution(12);
  temperatureSensor.setWaitForConversion(true);
  Serial.printf("DS18B20 sensors found: %d\n",temperatureSensor.getDeviceCount());
  analogReadResolution(12);analogSetPinAttenuation(TDS_ADC_PIN,ADC_11db);
  WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);WiFi.setAutoReconnect(true);
  Serial.printf("ESP32 MAC: %s\n",WiFi.macAddress().c_str());
  uint32_t started=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-started<20000){delay(250);Serial.print('.');}
  if(WiFi.status()==WL_CONNECTED)Serial.printf("\nWi-Fi connected. IP: %s\n",WiFi.localIP().toString().c_str());
  else Serial.println("\nWi-Fi not connected. Sampling continues; background reconnect enabled.");
  // UTC is obtained from the authenticated laptop endpoint, not internet NTP.
  uploadQueue=xQueueCreate(1,sizeof(Batch));
  if(!uploadQueue||xTaskCreate(uploadTask,"aquatrace-upload",12288,nullptr,1,nullptr)!=pdPASS){Serial.println("Unable to allocate uploader task");while(true)delay(1000);}
  Serial.printf("Local server: %s | uploads every 5 seconds\n",SERVER_BASE_URL);
}

void loop() {
  uint32_t now=millis();
  if(now-lastSample>=SAMPLE_MS) {
    lastSample=now;
    if(temperatureSensor.getDeviceCount()==0)temperatureSensor.begin();
    temperatureSensor.requestTemperatures(); // Wait for a real conversion (up to 750ms).
    float temperature=temperatureSensor.getTempCByIndex(0);
    // The water demonstration accepts 0..50C. No fixed-temperature fallback.
    if(!isfinite(temperature)||temperature==DEVICE_DISCONNECTED_C||temperature<0||temperature>50){
      Serial.println("DS18B20 missing or outside 0..50 C: check GPIO4, 3V3, GND and 4.7k pull-up. Upload paused.");
      tdsSum=0;temperatureSum=0;adcSum=0;samples=0;
      delay(10);return;
    }
    int raw;float voltage=readVoltage(raw);
    if(raw>=4090||voltage>3.1f){Serial.println("ADC saturation: inspect module voltage, ground and wiring");return;}
    float compensated=voltage/(1.0f+0.02f*(temperature-25.0f));
    float ppm=(133.42f*powf(compensated,3)-255.86f*powf(compensated,2)+857.39f*compensated)*0.5f*TDS_CALIBRATION_FACTOR;
    if(!isfinite(ppm)||ppm<0||ppm>10000){Serial.println("Invalid calculated TDS; inspect calibration");return;}
    tdsSum+=ppm;temperatureSum+=temperature;adcSum+=raw;samples++;
    Serial.printf("GPIO34: raw=%d, voltage=%.3fV, TDS=%.1fppm | DS18B20 GPIO4=%.2fC\n",raw,voltage,ppm,temperature);
  }
  if(now-lastBatch>=UPLOAD_MS) {
    lastBatch=now;
    if(samples){Batch b={tdsSum/samples,temperatureSum/samples,(int)(adcSum/samples),time(nullptr)};xQueueOverwrite(uploadQueue,&b);tdsSum=0;temperatureSum=0;adcSum=0;samples=0;}
  }
  delay(5);
}
