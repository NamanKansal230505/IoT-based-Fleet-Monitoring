#pragma once
// Copy this file to `config.h` and fill in your values. config.h is gitignored.

// ====== WiFi ======
#define WIFI_SSID      "YOUR_WIFI_SSID"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"

// ====== Server ======
// IP of the laptop / mini PC running the Node server, on the same WiFi.
// On Windows: ipconfig (look for IPv4 Address).
#define SERVER_HOST    "192.168.1.100"
#define SERVER_PORT    3000
#define DEVICE_ID      "tractor-001"
#define DEVICE_TOKEN   "change-me-shared-secret"

// ====== Telemetry ======
#define POST_INTERVAL_MS   500    // POST cadence

// ====== Pins ======
// TS100 GPS
#define GPS_RX_PIN 16   // ESP32 RX2  <- GPS TX
#define GPS_TX_PIN 17   // ESP32 TX2  -> GPS RX
#define GPS_BAUD   38400

// MPU6050 (I2C)
#define I2C_SDA 21
#define I2C_SCL 22

// ====== Engine detection ======
// Vibration (accel magnitude std-dev) above this => engine ON
#define ENGINE_ON_THRESHOLD   0.35f   // m/s^2 stddev
#define ENGINE_SAMPLE_WINDOW  20      // samples per evaluation
