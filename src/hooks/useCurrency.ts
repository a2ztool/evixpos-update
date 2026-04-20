import { useCurrencyContext } from "@/contexts/CurrencyContext";

/**
 * Global per-user currency hook (BDT / INR / USD).
 * Single source of truth via CurrencyContext. Staff inherits owner currency.
 *
 * Backwards-compatible API:
 *  - symbol, format(amount, decimals?), loaded
 *  - activeCurrency, defaultCurrency  (both = the user's currency)
 *  - setActiveCurrency(code)          (updates user-global currency)
 *  - convert(amount)                  (no-op identity — display only)
 *  - currencies                       (the 3 supported entries)
 */
export const useCurrency = () => {
  const { currency, symbol, loaded, setCurrency, format } = useCurrencyContext();

  const currencies = [
    { code: "BDT", symbol: "৳", rate: 1 },
    { code: "INR", symbol: "₹", rate: 1 },
    { code: "USD", symbol: "$", rate: 1 },
  ];

  return {
    currencies,
    defaultCurrency: currency,
    activeCurrency: currency,
    setActiveCurrency: (code: string) => {
      const up = code.toUpperCase();
      if (up === "BDT" || up === "INR" || up === "USD") {
        void setCurrency(up);
      }
    },
    symbol,
    convert: (amount: number) => amount, // display-only system, no conversion
    format,
    loaded,
  };
};
