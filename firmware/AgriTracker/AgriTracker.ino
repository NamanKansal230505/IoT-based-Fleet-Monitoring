#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <TinyGPS++.h>
#include "esp_log.h"
#include "config.h"

// ====== Globals ======
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

unsigned long lastPost = 0;
unsigned long lastSample = 0;

// Vibration ring buffer for engine detection
float accelMagBuf[ENGINE_SAMPLE_WINDOW];
int accelIdx = 0;
bool accelFilled = false;
bool engineOn = false;
float lastVibStdDev = 0.0f;

// MPU6050 I2C address
static const uint8_t MPU_ADDR = 0x68;
bool mpuPresent = false;

// ---------- MPU6050 ----------
void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

bool mpuInit() {
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.beginTransmission(MPU_ADDR);
  if (Wire.endTransmission() != 0) return false;
  mpuWrite(0x6B, 0x00);          // wake up
  mpuWrite(0x1C, 0x00);          // accel +/- 2g
  mpuWrite(0x1B, 0x00);          // gyro +/- 250 deg/s
  return true;
}

bool mpuRead(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 6) != 6) return false;
  int16_t rx = (Wire.read() << 8) | Wire.read();
  int16_t ry = (Wire.read() << 8) | Wire.read();
  int16_t rz = (Wire.read() << 8) | Wire.read();
  // +/- 2g => 16384 LSB/g
  ax = (rx / 16384.0f) * 9.80665f;
  ay = (ry / 16384.0f) * 9.80665f;
  az = (rz / 16384.0f) * 9.80665f;
  return true;
}

void updateEngineState() {
  if (!mpuPresent) return;
  float ax, ay, az;
  if (!mpuRead(ax, ay, az)) return;
  float mag = sqrtf(ax*ax + ay*ay + az*az);
  accelMagBuf[accelIdx++] = mag;
  if (accelIdx >= ENGINE_SAMPLE_WINDOW) { accelIdx = 0; accelFilled = true; }

  int n = accelFilled ? ENGINE_SAMPLE_WINDOW : accelIdx;
  if (n < 4) return;

  float mean = 0;
  for (int i = 0; i < n; i++) mean += accelMagBuf[i];
  mean /= n;
  float var = 0;
  for (int i = 0; i < n; i++) { float d = accelMagBuf[i] - mean; var += d*d; }
  var /= n;
  lastVibStdDev = sqrtf(var);
  engineOn = lastVibStdDev > ENGINE_ON_THRESHOLD;
}

// ---------- WiFi ----------
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] connecting to %s", WIFI_SSID);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] OK, IP=");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] FAILED (will retry)");
  }
}

// ---------- Telemetry POST ----------
void postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) { connectWiFi(); return; }

  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/telemetry";

  // Build JSON manually (no extra lib)
  String body = "{";
  body += "\"deviceId\":\"" DEVICE_ID "\",";
  body += "\"token\":\"" DEVICE_TOKEN "\",";
  body += "\"ts\":" + String((uint32_t)(millis() / 1000)) + ",";
  body += "\"engineOn\":" + String(engineOn ? "true" : "false") + ",";
  body += "\"vib\":" + String(lastVibStdDev, 3) + ",";

  if (gps.location.isValid()) {
    body += "\"lat\":" + String(gps.location.lat(), 6) + ",";
    body += "\"lng\":" + String(gps.location.lng(), 6) + ",";
    body += "\"fix\":true,";
  } else {
    body += "\"fix\":false,";
  }
  body += "\"sats\":" + String(gps.satellites.isValid() ? gps.satellites.value() : 0) + ",";
  body += "\"speed\":" + String(gps.speed.isValid() ? gps.speed.kmph() : 0.0, 2) + ",";
  body += "\"alt\":" + String(gps.altitude.isValid() ? gps.altitude.meters() : 0.0, 1) + ",";
  body += "\"hdop\":" + String(gps.hdop.isValid() ? gps.hdop.hdop() : 99.9, 2);

  if (gps.date.isValid() && gps.time.isValid()) {
    char utc[32];
    snprintf(utc, sizeof(utc), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    body += ",\"utc\":\"" + String(utc) + "\"";
  }
  body += "}";

  HTTPClient http;
  http.setTimeout(4000);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  Serial.printf("[POST] %d  ip=%s  %s\n", code, WiFi.localIP().toString().c_str(), body.c_str());
  http.end();
}

// ---------- Setup / Loop ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[BOOT] AgriTracker starting...");

  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.printf("[GPS] UART2 @ %d baud\n", GPS_BAUD);

  mpuPresent = mpuInit();
  if (mpuPresent) Serial.println("[MPU] OK");
  else            Serial.println("[MPU] NOT FOUND - skipping (check wiring SDA=21 SCL=22)");
  // Quiet ESP-IDF I2C error logs at runtime when MPU is absent.
  if (!mpuPresent) esp_log_level_set("i2c.master", ESP_LOG_NONE);

  connectWiFi();
}

void loop() {
  // Drain GPS
  while (gpsSerial.available()) gps.encode(gpsSerial.read());

  // Sample MPU @ ~50 Hz
  if (millis() - lastSample >= 20) {
    lastSample = millis();
    updateEngineState();
  }

  // POST every POST_INTERVAL_MS
  if (millis() - lastPost >= POST_INTERVAL_MS) {
    lastPost = millis();
    postTelemetry();
  }
}
