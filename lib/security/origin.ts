import { NextRequest } from "next/server";

export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const appUrl = process.env.APP_URL;
  if (!origin || !appUrl) return;
  if (new URL(origin).origin !== new URL(appUrl).origin) throw new Error("Invalid request origin");
}
