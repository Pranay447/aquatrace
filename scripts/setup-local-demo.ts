import { db } from "../lib/db";
import { passwordHash } from "../lib/auth";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Local development database required");
  await db.user.upsert({
    where: { email: "admin@aquatrace.local" },
    create: {
      email: "admin@aquatrace.local",
      name: "Local Demo Administrator",
      role: "ADMIN",
      passwordHash: passwordHash("AquaTrace-demo-2026!"),
    },
    update: {},
  });
  await db.sensor.upsert({
    where: { id: "S04" },
    create: {
      id: "S04",
      name: "Live freshwater TDS sensor",
      network: "Local demonstration",
      latitude: 0,
      longitude: 0,
      mac: "02:00:00:00:00:04",
      flowOrder: 4,
      demo: true,
      connectionType: "Wi-Fi",
      intervalSeconds: 5,
    },
    update: {
      name: "Live freshwater TDS sensor",
      enabled: true,
      network: "Local demonstration",
    },
  });
  console.log(
    "Local administrator and enabled S04 are ready. Allow location access at localhost to position S04. Check the real ESP32 MAC in Sensors. Existing readings and account passwords are preserved.",
  );
}
main()
  .catch(() => {
    console.error(
      "Local setup failed: check the development database and migrations.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
