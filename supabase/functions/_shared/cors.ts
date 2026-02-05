/**
 * Shared CORS configuration for Edge Functions
 *
 * Allowed Origins:
 * - Production: https://portal.urbanhub.uk
 * - Netlify: https://iskabookingportal.netlify.app
 * - Development: any localhost / 127.0.0.1 (any port)
 */

const ALLOWED_ORIGINS = [
  "https://portal.urbanhub.uk",
  "https://www.portal.urbanhub.uk",
  "https://iskabookingportal.netlify.app",
  "https://www.iskabookingportal.netlify.app",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

/** Match any http localhost or 127.0.0.1 (any port) for development */
function isLocalOrigin(origin: string): boolean {
  if (!origin || typeof origin !== "string") return false;
  return (
    /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)
  );
}

/**
 * Get CORS headers with origin validation.
 * Localhost/127.0.0.1 (any port) are always allowed for development.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";

  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) || isLocalOrigin(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

/**
 * Static CORS headers for webhooks (no origin check needed)
 * Webhooks are server-to-server and don't need CORS
 */
export const webhookCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

/**
 * Static CORS headers used for OPTIONS preflight and error fallback.
 * Ensures CORS is always returned even if getCorsHeaders throws.
 * Using * for Origin so preflight never blocks; tighten per-origin in getCorsHeaders for actual responses.
 */
export const staticCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * Handle CORS preflight request.
 * Uses static headers (Allow-Origin: *) so preflight never blocks any origin;
 * actual request responses still use getCorsHeaders(req) for origin reflection.
 */
export function handleCorsPrelight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: staticCorsHeaders });
  }
  return null;
}

