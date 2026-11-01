/* AquaTrace ESP-32D | Arduino-ESP32 3.x
 * Libraries: OneWire, DallasTemperature.
 * HARDWARE WARNING: power the turbidity sensor at 3.3 V for this design.
 * ESP32 ADC input MUST NEVER exceed 3.3 V. Verify the exact sensor variant's
 * supply rating and output with a meter; use a divider/interface if required.
 * Common SEN0189 boards specify 5 V and need a reviewed interface/redesign.
 * Final wiring must be reviewed before applying power. See README.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>
#include "secrets.h"

static_assert(TURBIDITY_ADC_PIN >= 0 && TDS_ADC_PIN >= 0 && DS18B20_DATA_PIN >= 0,
              "Fill TURBIDITY_ADC_PIN, TDS_ADC_PIN and DS18B20_DATA_PIN in secrets.h");
OneWire wire(DS18B20_DATA_PIN);
DallasTemperature temperature(&wire);
struct Batch { float turbidity, tds, temp; int turbidityRaw, tdsRaw; time_t stamp; bool valid; };
QueueHandle_t uploads;
unsigned long lastSample = 0, lastBatch = 0;
float turbiditySum = 0, tdsSum = 0, tempSum = 0;
long rawTurbiditySum = 0, rawTdsSum = 0;
int samples = 0;

float medianVoltage(int pin, int &raw) {
  int values[9]; long rawSum=0;
  for(int i=0;i<9;i++){ values[i]=analogReadMilliVolts(pin); rawSum+=analogRead(pin); delayMicroseconds(100); }
  for(int i=1;i<9;i++){int v=values[i],j=i-1;while(j>=0&&values[j]>v){values[j+1]=values[j];j--;}values[j+1]=v;}
  raw=rawSum/9;
  return values[4]/1000.0f;
}

void uploader(void *) {
  unsigned long backoff=1000;
  Batch pending={};
  for(;;){
    Batch latest;
    if(xQueueReceive(uploads,&latest,pdMS_TO_TICKS(1000))==pdTRUE)pending=latest;
    if(!pending.valid)continue;
    if(WiFi.status()!=WL_CONNECTED){Serial.println("Wi-Fi disconnected; reconnecting");WiFi.reconnect();vTaskDelay(pdMS_TO_TICKS(backoff));backoff=min(backoff*2,60000UL);continue;}
    if(time(nullptr)<1700000000){Serial.println("Waiting for SNTP before authenticated TLS upload");vTaskDelay(pdMS_TO_TICKS(2000));continue;}
    if(pending.stamp<1700000000){pending.valid=false;continue;}
    if(!String(API_URL).startsWith("https://")){Serial.println("Validation: API_URL must use HTTPS");vTaskDelay(pdMS_TO_TICKS(60000));continue;}
    struct tm utc;gmtime_r(&pending.stamp,&utc);char timestamp[30];strftime(timestamp,sizeof(timestamp),"%Y-%m-%dT%H:%M:%S.000Z",&utc);
    char json[512];snprintf(json,sizeof(json),"{\"deviceId\":\"%s\",\"timestamp\":\"%s\",\"turbidityNtu\":%.3f,\"tdsPpm\":%.3f,\"temperatureC\":%.3f,\"raw\":{\"turbidityAdc\":%d,\"tdsAdc\":%d},\"firmwareVersion\":\"1.0.0\"}",DEVICE_ID,timestamp,pending.turbidity,pending.tds,pending.temp,pending.turbidityRaw,pending.tdsRaw);
    WiFiClientSecure tls;tls.setCACert(ROOT_CA);HTTPClient http;http.setConnectTimeout(5000);http.setTimeout(8000);
    if(!http.begin(tls,API_URL)){Serial.println("TLS setup failed; inspect API URL and root CA");vTaskDelay(pdMS_TO_TICKS(backoff));backoff=min(backoff*2,60000UL);continue;}
    http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Key",DEVICE_SECRET);
    int code=http.POST((uint8_t*)json,strlen(json));
    if(code>=200&&code<300){Serial.printf("Uploaded %s: %.1f NTU / %.1f ppm / %.1f C\n",DEVICE_ID,pending.turbidity,pending.tds,pending.temp);pending.valid=false;backoff=1000;}
    else{Serial.printf("Upload failed (%d). Check Wi-Fi, TLS, clock, key, device registration and ranges. Retrying in %lu ms\n",code,backoff);vTaskDelay(pdMS_TO_TICKS(backoff));backoff=min(backoff*2,60000UL);}
    http.end();
  }
}

void setup(){
  Serial.begin(115200);
  if(!CALIBRATION_CONFIRMED){Serial.println("Calibration not confirmed. Edit secrets.h after reference calibration; uploads disabled.");while(true)delay(1000);}
  analogReadResolution(12);analogSetPinAttenuation(TURBIDITY_ADC_PIN,ADC_11db);analogSetPinAttenuation(TDS_ADC_PIN,ADC_11db);
  temperature.begin();temperature.setResolution(11);temperature.setWaitForConversion(false);temperature.requestTemperatures();
  WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);WiFi.setAutoReconnect(true);
  configTime(0,0,"pool.ntp.org","time.google.com");
  uploads=xQueueCreate(1,sizeof(Batch));xTaskCreatePinnedToCore(uploader,"aquatrace-upload",12288,nullptr,1,nullptr,0);
  Serial.println("AquaTrace sampling every 1s; averaging and uploading every 5s.");
}

void loop(){
  unsigned long now=millis();
  if(now-lastSample>=1000){lastSample=now;float temp=temperature.getTempCByIndex(0);temperature.requestTemperatures();
    if(temp==DEVICE_DISCONNECTED_C||!isfinite(temp)||temp<-10||temp>85||fabsf(temp-85)<0.01){Serial.println("DS18B20 validation failed: check probe wiring and pull-up resistor");return;}
    int rawT,rawD;float vt=medianVoltage(TURBIDITY_ADC_PIN,rawT),vd=medianVoltage(TDS_ADC_PIN,rawD);
    if(vt>3.25f||vd>3.25f||rawT>=4090||rawD>=4090){Serial.println("ADC saturation: disconnect and inspect input voltage and interface");return;}
    vt*=SENSOR_VOLTAGE_RATIO;float compensation=1.0f+TDS_TEMP_COEFFICIENT*(temp-25.0f);float vc=vd/compensation;
    float ntu=TURBIDITY_A*vt*vt+TURBIDITY_B*vt+TURBIDITY_C;
    float tds=(TDS_A*vc*vc*vc+TDS_B*vc*vc+TDS_C*vc)*TDS_SCALE;
    if(!isfinite(ntu)||!isfinite(tds)||ntu<0||ntu>4000||tds<0||tds>10000){Serial.println("Calibration result outside plausible range; sample discarded");return;}
    turbiditySum+=ntu;tdsSum+=tds;tempSum+=temp;rawTurbiditySum+=rawT;rawTdsSum+=rawD;samples++;
  }
  if(now-lastBatch>=UPLOAD_INTERVAL_MS){lastBatch=now;if(samples>0){Batch b={turbiditySum/samples,tdsSum/samples,tempSum/samples,(int)(rawTurbiditySum/samples),(int)(rawTdsSum/samples),time(nullptr),true};xQueueOverwrite(uploads,&b);turbiditySum=tdsSum=tempSum=0;rawTurbiditySum=rawTdsSum=0;samples=0;}else Serial.println("No valid sensor samples for upload");}
  delay(5);
}
