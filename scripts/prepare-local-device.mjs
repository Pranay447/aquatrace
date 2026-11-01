import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
export function privateIpv4(value) {
  const p = value.split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255))
    return false;
  const [a, b] = p.map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}
export function configure(ip) {
  if (!privateIpv4(ip))
    throw new Error(
      "Enter the private IPv4 address of your laptop Wi-Fi adapter, for example 192.168.1.25.",
    );
  if (!existsSync(".env")) {
    writeFileSync(
      ".env",
      `DATABASE_URL=postgresql://aquatrace@localhost:55432/aquatrace\nAPP_URL=http://localhost:3000\nDEMO_MODE=true\nAUTH_SECRET=${randomBytes(32).toString("hex")}\nDEVICE_KEY_S04=${randomBytes(32).toString("hex")}\n`,
    );
  }
  process.loadEnvFile(".env");
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(database.hostname))
    throw new Error(
      "This helper only operates on a local development database.",
    );
  const localLines = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("LOCAL_DEMONSTRATION="));
  writeFileSync(".env", localLines.join("\n") + "\nLOCAL_DEMONSTRATION=true\n");
  let key = process.env.DEVICE_KEY_S04;
  if (!key || key.length < 32) {
    key = randomBytes(32).toString("hex");
    const lines = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => !l.startsWith("DEVICE_KEY_S04="));
    writeFileSync(".env", lines.join("\n") + `\nDEVICE_KEY_S04=${key}\n`);
  }
  const folder = "firmware/aquatrace_tds_local";
  mkdirSync(folder, { recursive: true });
  const target = folder + "/secrets.h";
  let text = readFileSync(
    existsSync(target) ? target : folder + "/secrets.example.h",
    "utf8",
  );
  text = text
    .replace(
      /^#define SERVER_BASE_URL .*$/m,
      `#define SERVER_BASE_URL ${JSON.stringify(`http://${ip}:3000`)}`,
    )
    .replace(
      /^#define DEVICE_SECRET .*$/m,
      `#define DEVICE_SECRET ${JSON.stringify(key)}`,
    );
  writeFileSync(target, text);
  writeFileSync(
    "tmp/local-device-address.txt",
    `Dashboard on laptop: http://localhost:3000\nESP32 server: http://${ip}:3000\n`,
  );
  console.log(`ESP32 address configured: http://${ip}:3000`);
  console.log(
    "Matching device key copied privately to firmware/aquatrace_tds_local/secrets.h. No key was printed.",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    process.chdir(root);
    mkdirSync("tmp", { recursive: true });
    configure(process.argv[2] ?? "");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
