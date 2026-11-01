# Presentation controls

Sign in as an administrator and open Settings → Presentation controls.

- Clean sample · demo: TDS fluctuates around 110 ppm.
- Spike TDS · demo: TDS fluctuates around 950 ppm. The chart shows a transition from the demo clean baseline and a labelled demo warning appears.
- Undo · restore live readings: removes the display scenario immediately at the next refresh and resumes actual sensor data.

The controls are administrator-only and available in local demonstration mode. Display pages and charts clearly identify active presentation values. Other tabs/viewers of the same local server receive the same scenario on their next five-second refresh. Temperature history is not fabricated. Exports remain actual stored records. No fake readings are inserted in the Reading table, and real ESP32 uploads continue normally. Mode changes are audited.

For hardware troubleshooting, first select Undo to return to live readings. TDS reflects dissolved ionic material; visibly muddy water need not produce a large TDS increase. Use the Serial Monitor's GPIO34 voltage and upload messages to separate sensor response from stale website data. A separate cup with a few grains of dissolved table salt can check responsiveness, but cannot replace calibration with a known standard.
