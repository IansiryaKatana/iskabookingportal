/**
 * Shared CORS configuration for Edge Functions
 * 
 * Allowed Origins:
 * - Production: https://portal.urbanhub.uk
 * - Netlify: https://iskabookingportal.netlify.app
 * - Development: http://localhost:8080
 */

const ALLOWED_ORIGINS = [
  // Production
  "https://portal.urbanhub.uk",
  "https://www.portal.urbanhub.uk",
  // Netlify
  "https://iskabookingportal.netlify.app",
  "https://www.iskabookingportal.netlify.app",
  // Development
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
];

/**
 * Get CORS headers with origin validation
 * @param req - The incoming request
 * @returns CORS headers object
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  
  // Check if origin is in allowed list
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
 * Handle CORS preflight request
 * @param req - The incoming request
 * @returns Response for OPTIONS request or null if not OPTIONS
 */
export function handleCorsPrelight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}

