// Sentry error tracking configuration
// This is optional - the app will work fine without Sentry configured

import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENTRY_ENVIRONMENT = import.meta.env.SENTRY_ENVIRONMENT || import.meta.env.NODE_ENV || "development";
const SENTRY_RELEASE = import.meta.env.SENTRY_RELEASE || "1.0.0";

// Only initialize Sentry if DSN is provided
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
    // Session Replay
    replaysSessionSampleRate: SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
    // Filter out sensitive data
    beforeSend(event, hint) {
      // Don't send events in development unless explicitly testing
      if (SENTRY_ENVIRONMENT === "development" && !import.meta.env.VITE_SENTRY_ENABLE_DEV) {
        return null;
      }
      return event;
    },
  });

  console.log("Sentry initialized for error tracking");
} else {
  console.log("Sentry not configured - error tracking disabled");
}

export default Sentry;

