import type { AlertRule, Metrics, Quality, SensorDTO } from "./domain";

export const tdsGuideline =
  "https://guidelines.nhmrc.gov.au/australian-drinking-water-guidelines/part-5/physical-chemical-characteristics/total-dissolved-solids";
export function freshwaterQuality(ppm: number): Quality {
  if (ppm > 1000) return "Critical"; // Outside the SEN0244 measurement range.
  if (ppm > 900) return "Poor";
  if (ppm > 600) return "Moderate";
  return "Safe";
}
export function freshwaterAlerts(current: Metrics): AlertRule[] {
  const ppm = current.tdsPpm;
  if (ppm > 1000)
    return [
      {
        kind: "THRESHOLD",
        severity: "CRITICAL",
        message: `TDS ${ppm.toFixed(0)} ppm exceeds the SEN0244 1,000 ppm range. Reading is unreliable; dilute the sample or use a suitable meter. This is an instrument-range alert, not a health diagnosis.`,
      },
    ];
  if (ppm > 600)
    return [
      {
        kind: "THRESHOLD",
        severity: "WARNING",
        message: `TDS ${ppm.toFixed(0)} ppm is in the NHMRC ${ppm > 900 ? "poor (900–1,200)" : "fair (600–900)"} palatability band. Investigate dissolved salts and verify calibration. TDS alone does not determine drinking-water safety.`,
      },
    ];
  return [];
}
export const harbourReference: SensorDTO = {
  id: "SYD01",
  name: "Sydney Harbour Bridge · historical reference",
  network: "Local demonstration",
  latitude: -33.8523,
  longitude: 151.2108,
  locationSource: "CONFIGURED",
  mac: "REFERENCE",
  connectionType: "Historical reference",
  intervalSeconds: 0,
  flowOrder: 99,
  enabled: false,
  demo: false,
  battery: null,
  lastSeen: null,
  firmwareVersion: null,
  thresholds: null,
  latest: null,
  quality: "Offline",
  connectivity: "Offline",
  average: { tdsPpm: 0, turbidityNtu: 2.4, temperatureC: 0 },
  peakTds: 0,
  recentIncrease: 0,
  reference: {
    period: "April 2012–December 2017",
    turbidityNtu: 2.4,
    monthlyAverageLow: 0.7,
    monthlyAverageHigh: 8.4,
    source:
      "https://majorprojects.planningportal.nsw.gov.au/prweb/PRRestService/mp/01/getContent?AttachRef=SSI-8863%2120200116T053315.612+GMT",
    description:
      "Barangaroo South historical proxy, near the bridge: median of monthly average turbidity 2.4 NTU; monthly averages ranged 0.7–8.4 NTU. Source: NSW Western Harbour Tunnel marine water quality report, January 2020, Table 3-5. No instrument is connected here. No individual last sample, TDS or temperature was verified; these are not invented.",
  },
};
