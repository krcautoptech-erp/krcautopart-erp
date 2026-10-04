const endpoint = process.env.PUSH_DISPATCH_URL?.trim();
const secret = process.env.PUSH_DISPATCH_SECRET?.trim();

function fail(message) {
  console.error(`[push-dispatch] ${message}`);
  process.exitCode = 1;
}

if (!endpoint) {
  fail("PUSH_DISPATCH_URL is required.");
} else if (!secret || secret.length < 32) {
  fail("PUSH_DISPATCH_SECRET must contain at least 32 characters.");
} else {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    fail("PUSH_DISPATCH_URL must be a valid absolute URL.");
  }

  if (url) {
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
      fail("Production dispatch requires HTTPS. HTTP is allowed only on localhost.");
    } else if (url.pathname !== "/api/internal/push/dispatch") {
      fail("PUSH_DISPATCH_URL must point to /api/internal/push/dispatch.");
    } else {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${secret}`,
            "content-type": "application/json",
          },
          body: "{}",
          signal: AbortSignal.timeout(20_000),
        });

        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : { body: (await response.text()).slice(0, 300) };

        if (!response.ok || payload?.success !== true) {
          fail(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
        } else {
          console.log(
            JSON.stringify({
              success: true,
              attempted: payload.attempted ?? 0,
              delivered: payload.delivered ?? 0,
              failed: payload.failed ?? 0,
            }),
          );
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : "Dispatch request failed.");
      }
    }
  }
}
