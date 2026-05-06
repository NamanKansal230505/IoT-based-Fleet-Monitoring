#include <Arduino.h>
#include <TinyGPS++.h>

// UART pins for ESP32
constexpr int RXD2 = 16;
constexpr int TXD2 = 17;
constexpr uint32_t GPS_BAUD = 38400;

// Objects
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

// Timing
unsigned long lastPrint = 0;

void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n[BOOT] ESP32 GPS Tracker Starting...");

    gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RXD2, TXD2);
    Serial.printf("[INFO] GPS UART started at %lu baud\n", GPS_BAUD);
}

void loop()
{
    // Feed GPS data to parser
    while (gpsSerial.available())
    {
        char c = gpsSerial.read();
        gps.encode(c);
    }

    // Print every 1 second
    if (millis() - lastPrint > 1000)
    {
        lastPrint = millis();

        Serial.println("\n====== GPS STATUS ======");

        // Location
        if (gps.location.isValid())
        {
            Serial.print("Latitude : ");
            Serial.println(gps.location.lat(), 6);

            Serial.print("Longitude: ");
            Serial.println(gps.location.lng(), 6);
        }
        else
        {
            Serial.println("Location : INVALID (waiting for fix)");
        }

        // Satellites
        Serial.print("Satellites: ");
        if (gps.satellites.isValid())
            Serial.println(gps.satellites.value());
        else
            Serial.println("N/A");

        // Altitude
        Serial.print("Altitude : ");
        if (gps.altitude.isValid())
            Serial.print(gps.altitude.meters()), Serial.println(" m");
        else
            Serial.println("N/A");

        // Speed
        Serial.print("Speed    : ");
        if (gps.speed.isValid())
            Serial.print(gps.speed.kmph()), Serial.println(" km/h");
        else
            Serial.println("N/A");

        // Date
        Serial.print("Date     : ");
        if (gps.date.isValid())
        {
            Serial.printf("%02d/%02d/%02d\n",
                          gps.date.day(),
                          gps.date.month(),
                          gps.date.year());
        }
        else
        {
            Serial.println("N/A");
        }

        // Time
        Serial.print("Time     : ");
        if (gps.time.isValid())
        {
            Serial.printf("%02d:%02d:%02d\n",
                          gps.time.hour(),
                          gps.time.minute(),
                          gps.time.second());
        }
        else
        {
            Serial.println("N/A");
        }

        Serial.println("========================");
    }
}
