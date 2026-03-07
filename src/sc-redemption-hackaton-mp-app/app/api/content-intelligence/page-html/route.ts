import { NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * GET /api/content-intelligence/page-html?url=<encoded-url>
 *
 * Server-side proxy that fetches the rendered HTML of a Sitecore page and
 * returns it to the client. Running the fetch server-side avoids CORS issues
 * when the delivery/preview site is on a different origin.
 *
 * Security: the requested URL must begin with NEXT_PUBLIC_SITE_URL (when set)
 * so the proxy cannot be used to fetch arbitrary external URLs.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pageUrl = searchParams.get("url");

  if (!pageUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate against the configured site URL when present
  const allowedBase = process.env.NEXT_PUBLIC_SITE_URL;
  if (allowedBase && !pageUrl.startsWith(allowedBase)) {
    return NextResponse.json(
      { error: "URL is not within the configured NEXT_PUBLIC_SITE_URL" },
      { status: 403 },
    );
  }

  try {
    const res = await fetch(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Sitecore-Content-Intelligence/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const html = await res.text();

    return new Response(html, {
      status: res.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[page-html] fetch error:", msg);
    return NextResponse.json({ error: `Failed to fetch page HTML: ${msg}` }, { status: 502 });
  }
}
