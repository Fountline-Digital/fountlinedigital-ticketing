// Browser-side Sentry. No session replay: screens show client data.
import * as Sentry from "@sentry/nextjs";
import { sentryBase } from "@/lib/sentry-scrub";

Sentry.init({ ...sentryBase });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
