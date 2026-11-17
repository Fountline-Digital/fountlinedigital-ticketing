// Shared by the browser, server and edge Sentry setups. Keeps personal data and
// secrets out of error reports: no cookies, auth headers, query strings or form bodies.
// Loose on purpose so it matches Sentry's own event type in every runtime.
type Req = { headers?: Record<string, string>; cookies?: unknown; data?: unknown; query_string?: unknown; url?: string };
type SentryEvent = { request?: unknown; user?: unknown };

const SECRET_HEADERS = ["cookie", "authorization", "x-forwarded-for", "x-real-ip", "x-nf-client-connection-ip"];

export function scrubEvent<T extends SentryEvent>(event: T): T {
  const req = event.request as Req | undefined;
  if (req) {
    delete req.cookies;
    delete req.data;
    delete req.query_string; // magic link and invite tokens live in query strings
    if (req.url) req.url = req.url.split("?")[0];
    if (req.headers) {
      for (const h of Object.keys(req.headers)) {
        if (SECRET_HEADERS.includes(h.toLowerCase())) delete req.headers[h];
      }
    }
  }
  const user = event.user as { id?: string | number } | undefined;
  if (user) (event as { user?: unknown }).user = user.id ? { id: user.id } : {};
  return event;
}

export const sentryBase = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.CONTEXT ?? process.env.NODE_ENV, // Netlify sets CONTEXT=production / deploy-preview
  // v11 collects cookies, bodies, headers, query strings and IPs unless told not to
  // (`as const` keeps each `false` as the literal Sentry expects, not `boolean`)
  dataCollection: {
    cookies: false as const,
    httpBodies: [],
    httpHeaders: false as const,
    urlQueryParams: false as const,
    userInfo: false,
  },
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
};
