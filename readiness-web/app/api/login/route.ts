import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = process.env.APP_ACCESS_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: true, reason: "gate disabled" });
  }

  const form = await req.formData();
  const supplied = String(form.get("secret") ?? "");
  const next = String(form.get("next") ?? "/today");

  if (supplied !== secret) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next || "/today", req.url), { status: 303 });
  res.cookies.set("app_access", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
