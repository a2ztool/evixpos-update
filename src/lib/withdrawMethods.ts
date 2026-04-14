// Withdraw payment method definitions with dynamic fields

export interface WithdrawField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: "text" | "email";
}

export interface WithdrawMethod {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
  emoji: string;
  fields: WithdrawField[];
}

export const WITHDRAW_METHODS: WithdrawMethod[] = [
  // Bangladesh
  {
    id: "bkash", label: "bKash", group: "bd", groupLabel: "🇧🇩 Bangladesh", emoji: "💳",
    fields: [
      { key: "account_number", label: "Account Number", placeholder: "01XXXXXXXXX", required: true },
      { key: "account_name", label: "Account Name", placeholder: "Full name", required: true },
    ],
  },
  {
    id: "nagad", label: "Nagad", group: "bd", groupLabel: "🇧🇩 Bangladesh", emoji: "💳",
    fields: [
      { key: "account_number", label: "Account Number", placeholder: "01XXXXXXXXX", required: true },
      { key: "account_name", label: "Account Name", placeholder: "Full name", required: true },
    ],
  },
  {
    id: "rocket", label: "Rocket", group: "bd", groupLabel: "🇧🇩 Bangladesh", emoji: "🚀",
    fields: [
      { key: "account_number", label: "Account Number", placeholder: "01XXXXXXXXX", required: true },
      { key: "account_name", label: "Account Name", placeholder: "Full name", required: true },
    ],
  },
  {
    id: "bank_bd", label: "Bank Transfer", group: "bd", groupLabel: "🇧🇩 Bangladesh", emoji: "🏦",
    fields: [
      { key: "account_holder", label: "Account Holder Name", placeholder: "Full name", required: true },
      { key: "account_number", label: "Account Number", placeholder: "Account number", required: true },
      { key: "bank_name", label: "Bank Name", placeholder: "e.g. Dutch Bangla Bank", required: true },
      { key: "branch", label: "Branch", placeholder: "Branch name", required: true },
      { key: "routing_number", label: "Routing Number", placeholder: "Routing number", required: false },
    ],
  },
  // India
  {
    id: "gpay", label: "Google Pay (UPI)", group: "in", groupLabel: "🇮🇳 India", emoji: "📱",
    fields: [
      { key: "upi_id", label: "UPI ID", placeholder: "name@upi", required: true },
      { key: "name", label: "Name", placeholder: "Full name", required: true },
    ],
  },
  {
    id: "phonepe", label: "PhonePe (UPI)", group: "in", groupLabel: "🇮🇳 India", emoji: "📱",
    fields: [
      { key: "upi_id", label: "UPI ID", placeholder: "name@ybl", required: true },
      { key: "name", label: "Name", placeholder: "Full name", required: true },
    ],
  },
  {
    id: "paytm", label: "Paytm (UPI)", group: "in", groupLabel: "🇮🇳 India", emoji: "📱",
    fields: [
      { key: "upi_id", label: "UPI ID", placeholder: "name@paytm", required: true },
      { key: "name", label: "Name", placeholder: "Full name", required: true },
    ],
  },
  {
    id: "bank_in", label: "Bank Transfer", group: "in", groupLabel: "🇮🇳 India", emoji: "🏦",
    fields: [
      { key: "account_holder", label: "Account Holder Name", placeholder: "Full name", required: true },
      { key: "account_number", label: "Account Number", placeholder: "Account number", required: true },
      { key: "bank_name", label: "Bank Name", placeholder: "e.g. SBI", required: true },
      { key: "ifsc", label: "IFSC Code", placeholder: "SBIN0001234", required: true },
      { key: "branch", label: "Branch", placeholder: "Branch name", required: false },
    ],
  },
  // International
  {
    id: "paypal", label: "PayPal", group: "intl", groupLabel: "🌍 International (USD)", emoji: "🅿️",
    fields: [
      { key: "paypal_email", label: "PayPal Email", placeholder: "email@example.com", required: true, type: "email" },
    ],
  },
  {
    id: "binance", label: "Binance", group: "intl", groupLabel: "🌍 International (USD)", emoji: "₿",
    fields: [
      { key: "binance_uid", label: "Binance UID", placeholder: "12345678", required: true },
      { key: "wallet_address", label: "Wallet Address (optional)", placeholder: "0x...", required: false },
    ],
  },
];

export const getMethodById = (id: string) => WITHDRAW_METHODS.find(m => m.id === id);

export const getGroupedMethods = () => {
  const groups: { label: string; methods: WithdrawMethod[] }[] = [];
  const seen = new Set<string>();
  for (const m of WITHDRAW_METHODS) {
    if (!seen.has(m.group)) {
      seen.add(m.group);
      groups.push({ label: m.groupLabel, methods: WITHDRAW_METHODS.filter(x => x.group === m.group) });
    }
  }
  return groups;
};
