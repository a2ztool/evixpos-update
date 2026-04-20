import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaff } from "@/contexts/StaffContext";

export type CurrencyCode = "BDT" | "INR" | "USD";

interface CurrencyContextType {
  currency: CurrencyCode;
  symbol: string;
  loaded: boolean;
  setCurrency: (code: CurrencyCode) => Promise<void>;
  format: (amount: number, decimals?: number) => string;
}

const SYMBOLS: Record<CurrencyCode, string> = { BDT: "৳", INR: "₹", USD: "$" };
const VALID: CurrencyCode[] = ["BDT", "INR", "USD"];

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "USD",
  symbol: "$",
  loaded: false,
  setCurrency: async () => {},
  format: (a) => `$${a.toFixed(2)}`,
});

export const useCurrencyContext = () => useContext(CurrencyContext);

/** Detect default currency from browser locale / timezone (no network calls). */
const detectCurrency = (): CurrencyCode => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const locale = (navigator.language || "").toLowerCase();
    if (tz.includes("Dhaka") || locale.startsWith("bn")) return "BDT";
    if (tz.includes("Kolkata") || tz.includes("Calcutta") || locale.startsWith("hi") || locale.endsWith("-in")) return "INR";
  } catch {}
  return "USD";
};

const normalize = (raw: any): CurrencyCode | null => {
  if (!raw) return null;
  const up = String(raw).toUpperCase();
  return (VALID as string[]).includes(up) ? (up as CurrencyCode) : null;
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { effectiveUserId, loading: staffLoading } = useStaff();
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [loaded, setLoaded] = useState(false);

  // Owner's user_id (staff inherits owner currency)
  const ownerId = effectiveUserId || user?.id || null;

  useEffect(() => {
    if (staffLoading) return;
    if (!ownerId) {
      // Logged out — fallback
      setCurrencyState("USD");
      setLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Try cached value for instant UI
      const cacheKey = `currency:${ownerId}`;
      const cached = normalize(localStorage.getItem(cacheKey));
      if (cached) setCurrencyState(cached);

      // 2. Fetch authoritative value from any of the owner's business_settings
      const { data } = await supabase
        .from("business_settings")
        .select("default_currency")
        .eq("user_id", ownerId)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      let resolved = normalize(data?.default_currency);

      // 3. If missing → auto-detect, persist, then use
      if (!resolved) {
        resolved = detectCurrency();
        // Best-effort write to all owner's stores
        await supabase
          .from("business_settings")
          .update({ default_currency: resolved })
          .eq("user_id", ownerId);
      }

      if (!resolved) resolved = "USD";

      localStorage.setItem(cacheKey, resolved);
      setCurrencyState(resolved);
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [ownerId, staffLoading]);

  const setCurrency = useCallback(async (code: CurrencyCode) => {
    if (!ownerId) return;
    const norm = normalize(code) || "USD";
    setCurrencyState(norm);
    localStorage.setItem(`currency:${ownerId}`, norm);

    // Update across ALL of the owner's stores so currency stays unified
    await supabase
      .from("business_settings")
      .update({ default_currency: norm })
      .eq("user_id", ownerId);
  }, [ownerId]);

  const symbol = SYMBOLS[currency] || "$";

  const format = useCallback(
    (amount: number, decimals = 2) => {
      const safe = Number.isFinite(amount) ? amount : 0;
      return `${symbol}${safe.toFixed(decimals)}`;
    },
    [symbol]
  );

  return (
    <CurrencyContext.Provider value={{ currency, symbol, loaded, setCurrency, format }}>
      {children}
    </CurrencyContext.Provider>
  );
};
