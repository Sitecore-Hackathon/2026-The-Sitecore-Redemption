/**
 * Next.js Instrumentation — route warmup
 *
 * register() MUST return quickly — Next.js awaits it during server boot.
 * The actual warmup fetch is detached (fire-and-forget) so it never blocks startup.
 */

async function warmupRoutes() {
  if (process.env.NODE_ENV !== "development") return;

  const port = process.env.PORT ?? "3000";
  const base = `http://localhost:${port}`;

  // Wait for Turbopack to finish binding (one flat delay, not a retry loop)
  await new Promise((resolve) => setTimeout(resolve, 8_000));

  for (const route of ["/content-intelligence"]) {
    try {
      const res = await fetch(`${base}${route}`, {
        signal: AbortSignal.timeout(60_000),
      });
      console.log(`[warmup] ${route} — ${res.status} ✓`);
    } catch (err) {
      // Non-fatal — route compiles on first real request instead
      console.warn(
        `[warmup] ${route} — skipped (${err instanceof Error ? err.message : err})`,
      );
    }
  }
}

export function register() {
  // Detach so register() returns immediately and never delays server boot.
  // void silences the "floating promise" lint warning intentionally.
  void warmupRoutes();
}
