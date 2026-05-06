# Hardware

## Bill of materials

| Part                     | Notes                                          |
|--------------------------|------------------------------------------------|
| ESP32 Dev Module         | DOIT DevKit V1 / NodeMCU-32S / generic. Any 38-pin variant works. |
| TS100 GPS module         | UBlox-based; runs at 38400 baud out of the box. |
| MPU6050 (GY-521 board)   | 6-axis accel + gyro over I2C. AD0 must be GND or floating to use addr `0x68`. |
| 5V USB power             | Micro-USB or USB-C depending on dev board.     |
| Jumper wires + breadboard| Or a soldered protoboard for permanent install. |

## Wiring

```
                 ┌──────────────────────────┐
                 │         ESP32            │
                 │  (3.3V regulated rail)   │
                 │                          │
   TS100 VCC ────┤ 5V (VIN)                 │
   TS100 GND ────┤ GND                      │
   TS100 TX  ────┤ GPIO16 (RX2)             │
   TS100 RX  ────┤ GPIO17 (TX2)             │
                 │                          │
   MPU VCC   ────┤ 3.3V          ◀── 3.3V only, not 5V on most clones
   MPU GND   ────┤ GND                      │
   MPU SDA   ────┤ GPIO21                   │
   MPU SCL   ────┤ GPIO22                   │
   MPU AD0   ────┤ GND (or leave floating)  │
                 └──────────────────────────┘
```

**Pin mapping is defined in `firmware/AgriTracker/config.h`** — change there if your board's UART2/I2C pins differ.

## Mounting

For accurate engine-on detection the **MPU6050 must be mounted firmly to the chassis**, not loose on a wire. Loose mounting damps the very vibration the algorithm depends on.

The TS100 antenna needs sky view. A roof-mount with the antenna pointing up gives the best fix; on a tractor cab roof or fender works well. Indoors expect either no fix or a wandering one.

## Power

- USB power from a 5V/2A buck (the kind used for dashcams) works fine off a tractor's 12V battery.
- Brown-outs cause the GPS to lose its almanac and re-acquire (cold fix takes 30 s – several minutes). A small reservoir capacitor on the 5V rail helps if the engine cranking causes voltage dips.

## Diagnostics

- **`[MPU] NOT FOUND`** on serial → check 3.3V power, SDA/SCL not swapped, AD0 not pulled high.
- **`[POST] -1`** → server unreachable. Either `SERVER_HOST` IP is wrong or ESP32 isn't on the same Wi-Fi.
- **`fix=false, sats=0` for minutes** → take antenna outdoors. Some windows (tinted/IR-coated glass) block GPS signal.
- **Vibration σ stuck at 0.000** → MPU init failed at boot. Reboot the ESP32 after fixing wiring; the firmware doesn't retry init at runtime.

## Alternative parts

The firmware is intentionally narrow: TinyGPSPlus + raw I2C. To swap parts:

- **GPS** — any NMEA-emitting module works. Update `GPS_BAUD` if needed (NEO-6M/7M default 9600; TS100 38400; some modules 115200).
- **IMU** — replace `mpuInit`/`mpuRead` with calls for ADXL345, BMI160, etc. The σ logic in `updateEngineState()` is sensor-agnostic.
