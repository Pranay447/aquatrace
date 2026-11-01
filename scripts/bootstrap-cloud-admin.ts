import { z } from "zod";
import { db } from "../lib/db";
import { passwordHash } from "../lib/auth";
async function main() {
  const values = z
    .object({
      BOOTSTRAP_ADMIN_EMAIL: z.email(),
      BOOTSTRAP_ADMIN_NAME: z.string().min(2),
      BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128),
    })
    .parse(process.env);
  const email = values.BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim();
  await db.user.upsert({
    where: { email },
    create: {
      email,
      name: values.BOOTSTRAP_ADMIN_NAME,
      passwordHash: passwordHash(values.BOOTSTRAP_ADMIN_PASSWORD),
      role: "ADMIN",
    },
    update: {},
  });
  console.log(
    "Administrator bootstrap complete. Existing accounts/passwords/roles are never overwritten.",
  );
}
main()
  .catch(() => {
    console.error(
      "Administrator bootstrap failed. Check required environment values and database connectivity.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
