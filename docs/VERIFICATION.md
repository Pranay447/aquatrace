# Verification record

Verified locally on 21 October 2026 (Australia/Sydney) using Node 24.12 and a workspace-local PostgreSQL 18.4 instance with its session timezone set to Australia/Sydney.

| Check                                     | Result                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                            | Passed with no warnings/errors                                                                                          |
| `npm run typecheck`                       | Passed                                                                                                                  |
| `npm test`                                | All 11 unit tests passed                                                                                |
| `npm run build`                           | Passed; standalone server and assets generated                                                                          |
| `npm run test:integration`                | Passed against the production standalone server and real PostgreSQL                                                     |
| `npm audit` after dependency installation | 0 vulnerabilities                                                                                                       |
| `npm audit --omit=dev` final check        | 0 vulnerabilities                                                                                                       |
| Desktop visual check                      | Dashboard, real map markers, sensor list/dialog and comparison chart inspected at 1440×1000                             |
| Responsive visual check                   | Comparison cards and mobile navigation inspected at 390×844; dashboard also inspected at the default narrow panel width |

API integration checks include anonymous-read denial, standard-user mutation denial, cross-origin denial, registration's admin-approval boundary, device authentication, metric/timestamp validation, persistent/idempotent uploads, delayed backfill preserving the live reading, alert acknowledgement/resolution, all four historical ranges, period ranking, CSV export, administrator CRUD/audit, invalid-key throttling and logout/session invalidation. Temporary test devices and the final test registration are removed by the suite.

The DB tests exposed and verified fixes for SQL chart grouping and timezone-dependent filtering. All persistent timestamps now use PostgreSQL `TIMESTAMPTZ(3)`; the second migration preserves existing UTC measurement instants.

`dashboard-preview.png` is a captured working dashboard, not a static substitute for the application. Tile imagery requires network access. Illustrative monitoring positions do not represent real deployed instruments.

Not verified here: a Docker image build (Docker is not installed on this host), a live Google Cloud deployment (no project/database credentials were supplied), or compilation/flashing/calibration of the Arduino sketch (final board, GPIOs, sensor variant and trust anchor remain to be supplied).

Unattended notifications and durable firmware buffering are not included. Device-health incidents reconcile during authenticated workspace polling. The firmware keeps the latest pending batch in RAM; newer data can replace an older failed upload. See README and the deployment guide for these operational limits and retention planning.

## TDS-only firmware follow-up

Added GPIO34 firmware and verified its exact TDS-only payload against the production standalone server: real TDS ADC persisted, absent turbidity ADC remains null, device is labeled Demo data, and exports include simulated/assumed provenance. Lint, type checks, all 10 unit tests, expanded integration suite and production build pass. Source and firmware ZIPs were inspected to exclude .env and completed secrets.h files. Google root certificates were downloaded over HTTPS; actual board compilation/flashing and cloud deployment remain unverified.

## Local hotspot follow-up

Added a separate local HTTP sketch, private hotspot configuration, a laptop-clock endpoint authenticated by the device key, and Windows startup/configuration helpers. Verified lint, TypeScript, 11 unit tests, production build, expanded API integration (including keyed clock, no anonymous clock access, ADC provenance and telemetry), PowerShell startup syntax, and exclusion of private credentials from the local ZIP. Actual hotspot peer connectivity, firewall behavior and board compilation/flashing cannot be verified until the hardware is connected. The test web server was stopped so the user startup command can take port 3000; the local database remains available.
