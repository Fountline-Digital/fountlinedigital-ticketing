"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Last-resort error screen (when even the root layout fails). Reports to Sentry.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#000", color: "#fff", fontFamily: "Arial, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#c0c0c0", marginBottom: 24 }}>It's been reported. Try again, or come back in a few minutes.</p>
          {error.digest && <p style={{ color: "#888", fontSize: 12, marginBottom: 24 }}>Reference: {error.digest}</p>}
          <button onClick={reset} style={{ background: "#c0c0c0", color: "#000", border: 0, borderRadius: 6, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
