# DS18B20 temperature on GPIO4

The local S04 firmware now reads TDS on GPIO34 and a DS18B20 on GPIO4. It sends temperature and temperature-compensated TDS every five seconds. It sends no turbidity reading. This replaces the old fixed-temperature firmware.

## Wiring

Disconnect USB/power before wiring. Use normal three-wire powered mode:

| DS18B20 connection | ESP32 connection                                           |
| ------------------ | ---------------------------------------------------------- |
| VDD / VCC          | 3V3                                                        |
| GND                | GND                                                        |
| DQ / DATA          | GPIO4 (pin labelled 4, not the fourth pin along the board) |
| 4.7 kΩ resistor    | Between DATA/GPIO4 and 3V3                                 |

Some modules already include the resistor. Check the module markings or probe datasheet; wire colours can vary. Keep the TDS interface signal on GPIO34 with its existing power and ground. Only immerse a waterproof probe, not exposed electronics. The probe should measure the same water as the TDS probe.

## Upload and view

1. The required OneWire and DallasTemperature libraries have been installed in your configured Arduino sketchbook. If Arduino still reports a missing library, restart it and use Library Manager to install **OneWire by Paul Stoffregen** and **DallasTemperature by Miles Burton**.
2. Open the existing sketch at `C:\Users\prana\OneDrive\Documents\Arduino\Local_Demonstration_AquaTrace\Local_Demonstration_AquaTrace.ino`. Its contents are synchronised with the source in `firmware/aquatrace_tds_local/aquatrace_tds_local.ino`.
3. Keep the existing `secrets.h` beside the sketch. Your Wi-Fi name, password, server IP and device key are unchanged. No new temperature setting is needed in that private file.
4. Select the same ESP32 board and USB port you used before, then click **Upload**. Close Serial Monitor first if the port is busy. Firmware must be uploaded to the ESP32; refreshing the website alone cannot update it.
5. Open Serial Monitor at **115200 baud**. Expect `DS18B20 sensors found: 1`, readings from `DS18B20 GPIO4`, and `UPLOAD OK 201` showing TDS and temperature. The firmware identifies itself as `tds-temp-local-2.0.0`.
6. Keep the laptop server running, connect it and the ESP32 to the configured Wi-Fi, then open `http://localhost:3000/dashboard` on the laptop. Refresh once. The dashboard updates every five seconds. Select **Temperature** in a chart to see measured temperature history. Until new firmware readings arrive, temperature is unavailable rather than the previous fixed 25 °C.

If the DS18B20 is missing, reports its disconnected sentinel, or reports outside the demonstration's 0–50 °C water range, new uploads pause and Serial Monitor explains the wiring check. There is no fallback temperature. A previous valid reading can remain visible with its timestamp and will become stale/offline if uploads stop. Temperature averages and history exclude values from the old fixed-temperature firmware. Existing data is preserved.

The current local webpage shows connected measurements. Turbidity is unavailable for S04; SYD01 retains its separately labelled historical reference statistic. TDS alerts retain the freshwater profile; temperature alone is not treated as a universal pollution or drinking-water danger threshold.

References: [DallasTemperature library](https://github.com/milesburton/Arduino-Temperature-Control-Library), [OneWire library](https://github.com/PaulStoffregen/OneWire), [DS18B20 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf).
