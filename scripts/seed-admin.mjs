import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const email = (process.env.ADMIN_EMAIL || "").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
if (!email || !password || password === "CHANGE_ME_BEFORE_RUNNING_SEED") {
  console.error("Set ADMIN_EMAIL and a strong ADMIN_PASSWORD before running npm run seed:admin");
  process.exit(1);
}
if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters");
  process.exit(1);
}
const passwordHash = await bcrypt.hash(password, 12);
const user = await db.user.upsert({
  where: { email },
  update: { passwordHash, role: "ADMIN", isActive: true },
  create: { name: "Administrator", email, passwordHash, role: "ADMIN" }
});
console.log(`Admin ready: ${user.email}`);
await db.$disconnect();
