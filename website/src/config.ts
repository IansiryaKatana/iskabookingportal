/**
 * Website config. Portal base URL for "Book Now" and account links.
 * Set VITE_PORTAL_URL in .env (e.g. https://portal.urbanhub.uk for production).
 */
export const PORTAL_BASE_URL =
  import.meta.env.VITE_PORTAL_URL?.replace(/\/$/, "") || "https://portal.urbanhub.uk";

export function portalStudiosUrl(year: string, slug: string): string {
  const y = year.replace(/\//g, "-");
  return `${PORTAL_BASE_URL}/studios/${y}/${slug}`;
}

export function portalLoginUrl(): string {
  return `${PORTAL_BASE_URL}/portal/login`;
}

export function portalRegisterUrl(): string {
  return `${PORTAL_BASE_URL}/portal/login?mode=register`;
}

export function portalDashboardUrl(): string {
  return `${PORTAL_BASE_URL}/portal`;
}

export function portalAdminUrl(): string {
  return `${PORTAL_BASE_URL}/admin`;
}
