/**
 * Next.js Instrumentation — route warmup
 *
 * In development, the first request to any route triggers a JIT compile that
 * can take several seconds. This file runs once when the Next.js server starts
 * and pre-fetches the content-intelligence page so it is compiled and ready
 * before Sitecore opens the panel.
 *
 * In production (`next start`) this is a no-op — the build already compiled
 * every route, so no warmup is needed.
 */

async function tryFetch(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    console.log(`[warmup] ${url} — ${res.status} ✓`);
    return true;
  } catch {
    return false;
  }
}

export async function register() {
  // Only warm up in dev; production builds are pre-compiled
  if (process.env.NODE_ENV !== "development") return;

  const port = process.env.PORT ?? "3000";
  const base = `http://localhost:${port}`;
  const routes = ["/content-intelligence"];

  // Turbopack can take 5–10 s to be ready for the first request.
  // Retry up to 6 times with increasing delays (5 s, 10 s, 15 s, 20 s, 25 s, 30 s).
  for (const route of routes) {
    const url = `${base}${route}`;
    let success = false;

    for (let attempt = 1; attempt <= 6 && !success; attempt++) {
      const delay = attempt * 5_000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      console.log(`[warmup] ${route} — attempt ${attempt}…`);
      success = await tryFetch(url);
    }

    if (!success) {
      console.warn(`[warmup] ${route} — gave up after 6 attempts. Route will compile on first real request.`);
    }
  }
}
