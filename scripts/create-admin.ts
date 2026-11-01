import { db } from "../lib/db";
import { passwordHash } from "../lib/auth";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
async function main() {
  const email = (await rl.question("Administrator email: "))
    .trim()
    .toLowerCase();
  const name = await rl.question("Full name: ");
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set ADMIN_INITIAL_PASSWORD (12+ characters) for this command only.",
    );
  await db.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash: passwordHash(password),
      role: "ADMIN",
    },
    update: { role: "ADMIN", adminRequested: false },
  });
  console.log(
    "Administrator created/promoted. Existing password is preserved.",
  );
}
main().finally(() => {
  rl.close();
  return db.$disconnect();
});
