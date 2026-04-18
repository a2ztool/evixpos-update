/**
 * Returns the canonical public origin to use when sharing links
 * (e.g. order form URLs). Avoids surfacing Lovable preview/sandbox
 * domains to end customers.
 *
 * Priority:
 *   1. VITE_PUBLIC_APP_URL env (if configured)
 *   2. Hard-coded production domain
 *   3. Current window origin (last resort, e.g. local dev)
 */
const PRODUCTION_ORIGIN = "https://newevix.lovable.app";

export const getPublicOrigin = (): string => {
  const env = (import.meta as any).env?.VITE_PUBLIC_APP_URL as string | undefined;
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isPreview =
      host.endsWith(".lovableproject.com") ||
      host.includes("id-preview--") ||
      host.includes("sandbox.lovable.dev") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (!isPreview) return window.location.origin;
  }

  return PRODUCTION_ORIGIN;
};

export const buildOrderFormUrl = (slugOrId: string): string =>
  `${getPublicOrigin()}/f/${slugOrId}`;
