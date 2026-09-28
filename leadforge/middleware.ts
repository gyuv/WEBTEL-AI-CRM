import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/legal/, /^\/api\/(extension|cron|auth|gmail\/callback)/, /^\/_next/, /^\/(icon\.svg|manifest\.webmanifest|sw\.js|favicon\.ico)$/];

export function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.cookies.get("lf_session")?.value) return NextResponse.next(); // signature verified server-side
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
