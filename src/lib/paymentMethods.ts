import { getGatewayBrand } from "@/lib/gatewayBrands";

export interface NormalizedPaymentMethod {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface PaymentDetailEntry {
  label: string;
  value: string;
}

const ALWAYS_AVAILABLE_GATEWAYS = new Set(["cash", "cod_bd", "cod_in"]);

const RESERVED_CONFIG_KEYS = new Set(["instructions", "qr_code_url"]);

const PRIVATE_CONFIG_KEYS = new Set([
  "access_code",
  "api_key",
  "app_id",
  "app_key",
  "auth_token",
  "client_id",
  "client_secret",
  "consumer_key",
  "key_id",
  "key_secret",
  "merchant_key",
  "publishable_key",
  "salt",
  "salt_key",
  "secret_key",
  "signature_key",
  "store_password",
  "working_key",
]);

const PRIVATE_KEY_FRAGMENTS = ["secret", "token", "password", "credential"];

const DETAIL_LABELS: Array<{ key: string; label: string }> = [
  { key: "personal_number", label: "📱 Number" },
  { key: "merchant_number", label: "🏪 Merchant Number" },
  { key: "upi_id", label: "💳 UPI ID" },
  { key: "paypal_email", label: "📧 PayPal Email" },
  { key: "payoneer_email", label: "📧 Payoneer Email" },
  { key: "wise_email", label: "📧 Wise Email" },
  { key: "skrill_email", label: "📧 Skrill Email" },
  { key: "email", label: "📧 Email" },
  { key: "binance_id", label: "🔗 Binance ID" },
  { key: "wallet_address", label: "🔗 Wallet Address" },
  { key: "network", label: "🌐 Network" },
  { key: "coin_type", label: "🪙 Coin" },
  { key: "bank_name", label: "🏦 Bank" },
  { key: "account_name", label: "👤 Account Name" },
  { key: "account_number", label: "🔢 Account Number" },
  { key: "branch_name", label: "📍 Branch" },
  { key: "ifsc_code", label: "🏛 IFSC" },
  { key: "swift_code", label: "🌍 SWIFT" },
  { key: "routing_number", label: "#️⃣ Routing" },
  { key: "account_details", label: "ℹ️ Account Details" },
  { key: "account_type", label: "🏷️ Account Type" },
];

const toTitleCase = (value: string) =>
  value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const sanitizePaymentConfig = (config: unknown): Record<string, string> => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(config as Record<string, unknown>)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
};

export const normalizePaymentMethods = (paymentMethods: unknown): NormalizedPaymentMethod[] => {
  if (!Array.isArray(paymentMethods)) {
    return [];
  }

  return paymentMethods.flatMap((entry) => {
    if (typeof entry === "string") {
      const brand = getGatewayBrand(entry);
      return [{
        id: entry,
        name: brand?.name ?? toTitleCase(entry),
        enabled: true,
        config: {},
      }];
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const method = entry as Partial<NormalizedPaymentMethod> & { config?: unknown };
    const id = typeof method.id === "string" && method.id.trim()
      ? method.id.trim()
      : typeof method.name === "string" && method.name.trim()
        ? method.name.trim().toLowerCase().replace(/\s+/g, "_")
        : "";

    if (!id) {
      return [];
    }

    const brand = getGatewayBrand(id);

    return [{
      id,
      name: typeof method.name === "string" && method.name.trim() ? method.name.trim() : brand?.name ?? toTitleCase(id),
      enabled: method.enabled !== false,
      config: sanitizePaymentConfig(method.config),
    }];
  });
};

export const getPublicPaymentDetails = (config: Record<string, string> = {}): PaymentDetailEntry[] => {
  const cleanConfig = sanitizePaymentConfig(config);
  const usedKeys = new Set<string>();

  const priorityDetails = DETAIL_LABELS.flatMap(({ key, label }) => {
    const value = cleanConfig[key];
    if (!value || (key === "account_type" && value.toLowerCase() === "personal")) {
      return [];
    }

    usedKeys.add(key);
    return [{ label, value }];
  });

  const fallbackDetails = Object.entries(cleanConfig)
    .filter(([key, value]) => {
      const loweredKey = key.toLowerCase();
      return (
        typeof value === "string"
        && value.trim().length > 0
        && !usedKeys.has(key)
        && !RESERVED_CONFIG_KEYS.has(key)
        && !PRIVATE_CONFIG_KEYS.has(key)
        && !PRIVATE_KEY_FRAGMENTS.some((fragment) => loweredKey.includes(fragment))
      );
    })
    .map(([key, value]) => ({
      label: toTitleCase(key),
      value,
    }));

  return [...priorityDetails, ...fallbackDetails];
};

export const hasCustomerFacingPaymentConfig = (config: Record<string, string> = {}) => {
  const cleanConfig = sanitizePaymentConfig(config);
  return (
    getPublicPaymentDetails(cleanConfig).length > 0
    || Boolean(cleanConfig.instructions)
    || Boolean(cleanConfig.qr_code_url)
  );
};

export const isCustomerFacingPaymentMethod = (method: NormalizedPaymentMethod) => {
  if (!method.enabled) {
    return false;
  }

  return ALWAYS_AVAILABLE_GATEWAYS.has(method.id) || hasCustomerFacingPaymentConfig(method.config);
};