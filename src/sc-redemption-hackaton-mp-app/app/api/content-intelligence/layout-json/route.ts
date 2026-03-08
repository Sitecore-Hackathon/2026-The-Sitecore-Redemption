import { NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * GET /api/content-intelligence/layout-json?siteName=&routePath=&language=
 *
 * Fetches the layout service JSON for a page from Sitecore Experience Edge
 * and returns it to the client for download.
 *
 * Requires SITECORE_EDGE_CONTEXT_ID in .env.local.
 */

const EDGE_ENDPOINT = "https://edge.sitecorecloud.io/api/graphql/v1";

const LAYOUT_QUERY = `
  query LayoutQuery($siteName: String!, $routePath: String!, $language: String!) {
    layout(site: $siteName, routePath: $routePath, language: $language) {
      item {
        rendered
      }
    }
  }
`;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const siteName = searchParams.get("siteName");
  const routePath = searchParams.get("routePath");
  const language = searchParams.get("language") ?? "en";

  if (!siteName || !routePath) {
    return NextResponse.json(
      { error: "Missing required parameters: siteName, routePath" },
      { status: 400 },
    );
  }

  const contextId = process.env.SITECORE_EDGE_CONTEXT_ID;
  if (!contextId) {
    return NextResponse.json(
      { error: "SITECORE_EDGE_CONTEXT_ID is not configured in .env.local" },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(EDGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GQL-Token": contextId,
      },
      body: JSON.stringify({
        query: LAYOUT_QUERY,
        variables: { siteName, routePath, language },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      console.error(`[layout-json] Edge returned ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Experience Edge returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[layout-json] fetch error:", msg);
    return NextResponse.json({ error: `Failed to fetch layout JSON: ${msg}` }, { status: 502 });
  }
}
