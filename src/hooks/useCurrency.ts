import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

interface CurrencyInfo {
  code: string;
  symbol: string;
  rate: number;
}

const DEFAULT_CURRENCIES: CurrencyInfo[] = [
  { code: "BDT", symbol: "৳", rate: 1 },
  { code: "INR", symbol: "₹", rate: 0.98 },
  { code: "USD", symbol: "$", rate: 0.012 },
];

const SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

export const useCurrency = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>(DEFAULT_CURRENCIES);
  const [defaultCurrency, setDefaultCurrency] = useState("BDT");
  const [activeCurrency, setActiveCurrency] = useState("BDT");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || !activeStore) return;
    supabase
      .from("business_settings")
      .select("default_currency, currencies")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const cur = data.default_currency || "BDT";
          setDefaultCurrency(cur);
          setActiveCurrency(cur);
          if (Array.isArray(data.currencies) && (data.currencies as any[]).length > 0) {
            setCurrencies(data.currencies as unknown as CurrencyInfo[]);
          }
        }
        setLoaded(true);
      });
  }, [user, activeStore]);

  const symbol = SYMBOLS[activeCurrency] || activeCurrency;

  /** Convert an amount from default currency to active currency */
  const convert = useCallback(
    (amount: number): number => {
      if (activeCurrency === defaultCurrency) return amount;
      const fromRate = currencies.find((c) => c.code === defaultCurrency)?.rate ?? 1;
      const toRate = currencies.find((c) => c.code === activeCurrency)?.rate ?? 1;
      // amount is in default currency. Convert: amount / fromRate * toRate
      return (amount / fromRate) * toRate;
    },
    [activeCurrency, defaultCurrency, currencies]
  );

  const format = useCallback(
    (amount: number, decimals = 2): string => {
      return `${symbol}${convert(amount).toFixed(decimals)}`;
    },
    [symbol, convert]
  );

  return {
    currencies: currencies.filter((c) => ["INR", "BDT", "USD"].includes(c.code)),
    defaultCurrency,
    activeCurrency,
    setActiveCurrency,
    symbol,
    convert,
    format,
    loaded,
  };
};
