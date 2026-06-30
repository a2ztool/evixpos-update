// Menu-only permissions for staff.
//
// Simplified format: `m:<menu_key>` — a menu is either enabled (full access)
// or disabled (hidden). The granular view/create/edit/delete grid has been
// removed because it confused owners and was not enforced consistently in
// the UI.
//
// Backward compatibility: legacy granular keys (`m:<key>:view|create|edit|
// delete`) and the older module-level perms (`products.view`, etc.) still
// grant access if present.

export type MenuAction = "view" | "create" | "edit" | "delete";

export const ACTIONS: MenuAction[] = ["view", "create", "edit", "delete"];

export interface SubMenu {
  key: string;
  label: string;
  /** Deprecated — kept for type-compat. */
  actions?: MenuAction[];
  /** Legacy perms that should grant the given action when present. */
  legacy?: { perm: string; action: MenuAction }[];
}

export interface MenuModule {
  key: string;
  label: string;
  subs: SubMenu[];
}

const crud = (legacyBase: string): SubMenu["legacy"] => [
  { perm: `${legacyBase}.view`, action: "view" },
  { perm: `${legacyBase}.create`, action: "create" },
  { perm: `${legacyBase}.edit`, action: "edit" },
  { perm: `${legacyBase}.delete`, action: "delete" },
];

const viewOnlyLegacy = (perm: string): SubMenu["legacy"] => [
  { perm, action: "view" },
];

export const MENU_MODULES: MenuModule[] = [
  {
    key: "products",
    label: "Products & Inventory",
    subs: [
      { key: "products", label: "Products", legacy: crud("products") },
      { key: "inventory", label: "Inventory", legacy: viewOnlyLegacy("products.view") },
      { key: "order_forms", label: "Order Forms", legacy: viewOnlyLegacy("products.view") },
      { key: "coupons", label: "Coupons", legacy: viewOnlyLegacy("products.edit") },
      { key: "suppliers", label: "Suppliers", legacy: viewOnlyLegacy("products.view") },
      { key: "purchases", label: "Purchases", legacy: viewOnlyLegacy("products.edit") },
      { key: "stock_alerts", label: "Stock Alerts", legacy: viewOnlyLegacy("products.view") },
    ],
  },
  {
    key: "customers",
    label: "Customers & CRM",
    subs: [
      { key: "customers", label: "Customers", legacy: crud("customers") },
      { key: "subscriptions", label: "Subscriptions", legacy: viewOnlyLegacy("customers.view") },
      { key: "customer_credits", label: "Customer Credits", legacy: viewOnlyLegacy("customers.view") },
      { key: "due_customers", label: "Due Customers", legacy: viewOnlyLegacy("customers.view") },
      { key: "loyalty", label: "Loyalty Points", legacy: viewOnlyLegacy("customers.view") },
    ],
  },
  {
    key: "reports",
    label: "Reports & Finance",
    subs: [
      { key: "reports", label: "Reports Overview", legacy: viewOnlyLegacy("reports.view") },
      { key: "sales_profit", label: "Sales & Profit", legacy: viewOnlyLegacy("reports.view") },
      { key: "income_expense", label: "Income / Expense", legacy: viewOnlyLegacy("reports.view") },
      { key: "account_book", label: "Account Book", legacy: viewOnlyLegacy("reports.view") },
      { key: "due_book", label: "Due Book", legacy: viewOnlyLegacy("reports.view") },
      { key: "ad_costs", label: "Ad Costs", legacy: viewOnlyLegacy("reports.view") },
      { key: "facebook_ads", label: "Facebook Ads", legacy: viewOnlyLegacy("reports.view") },
      { key: "transactions", label: "Transactions", legacy: viewOnlyLegacy("reports.view") },
      { key: "daily_report", label: "Daily Report", legacy: viewOnlyLegacy("reports.view") },
      { key: "profit_loss", label: "Profit & Loss", legacy: viewOnlyLegacy("reports.view") },
      { key: "staff_performance", label: "Staff Performance", legacy: viewOnlyLegacy("reports.view") },
    ],
  },
  {
    key: "integrations",
    label: "Settings & Integrations",
    subs: [
      {
        key: "settings",
        label: "Settings",
        legacy: [
          { perm: "settings.view", action: "view" },
          { perm: "settings.edit", action: "edit" },
        ],
      },
      { key: "woocommerce", label: "WooCommerce", legacy: viewOnlyLegacy("settings.edit") },
      { key: "bot_automation", label: "Bot Automation", legacy: viewOnlyLegacy("settings.edit") },
      { key: "whatsapp", label: "WhatsApp", legacy: viewOnlyLegacy("settings.edit") },
      { key: "google_sheets", label: "Google Sheets", legacy: viewOnlyLegacy("settings.edit") },
    ],
  },
];

/** Simple per-menu permission key. */
export const menuKeyPerm = (menuKey: string) => `m:${menuKey}`;

/** Back-compat helper — granular form `m:<key>:<action>`. */
export const menuPerm = (menuKey: string, _action: MenuAction = "view") =>
  menuKeyPerm(menuKey);

/** Every sub-menu key as `m:<key>`. */
export const ALL_MENU_PERMS: string[] = MENU_MODULES.flatMap((mod) =>
  mod.subs.map((sub) => menuKeyPerm(sub.key))
);

const SUB_INDEX = new Map<string, SubMenu>();
MENU_MODULES.forEach((m) => m.subs.forEach((s) => SUB_INDEX.set(s.key, s)));

/** Legacy perms that should imply this `(menuKey, action)`. */
export const getLegacyFallbacks = (
  menuKey: string,
  action: MenuAction
): string[] => {
  const sub = SUB_INDEX.get(menuKey);
  if (!sub?.legacy) return [];
  return sub.legacy.filter((l) => l.action === action).map((l) => l.perm);
};

/**
 * Returns true if `perms` grants access to the given menu. The optional
 * `action` argument is accepted for API stability but ignored — once a menu
 * is enabled, the staff has full access inside it.
 */
export const hasMenuAccess = (
  perms: string[],
  menuKey: string,
  _action: MenuAction = "view"
): boolean => {
  // New simple form
  if (perms.includes(menuKeyPerm(menuKey))) return true;
  // Back-compat: any granular `m:<key>:*` still counts as enabled.
  if (perms.some((p) => p.startsWith(`m:${menuKey}:`))) return true;
  // If owner saved permissions in the new menu-only UI, do NOT fall back to
  // legacy module perms — the saved selection is the source of truth.
  if (perms.some((p) => p.startsWith("m:"))) return false;
  const legacy = getLegacyFallbacks(menuKey, "view");
  return legacy.some((p) => perms.includes(p));
};

/** "View" granted for any sub-menu inside the given module. */
export const moduleHasAnyView = (perms: string[], moduleKey: string): boolean => {
  const mod = MENU_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return false;
  return mod.subs.some((s) => hasMenuAccess(perms, s.key));
};

// ─── Role presets ────────────────────────────────────────────────────────
// Each preset maps to a list of sub-menu keys (plus a few legacy perms for
// POS / Orders which aren't part of MENU_MODULES). Selecting "custom" gives
// an empty list so the owner can pick manually.

export interface RolePreset {
  key: string;
  label: string;
  description: string;
  /** Sub-menu keys granted by this preset. */
  menus: string[];
  /** Extra legacy perms (e.g. `pos.access`, `orders.create`). */
  extras?: string[];
}

const ALL_SUB_KEYS = MENU_MODULES.flatMap((m) => m.subs.map((s) => s.key));
const FULL_ORDERS = ["orders.view", "orders.create", "orders.edit", "orders.delete"];

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: "admin",
    label: "Admin",
    description: "Full access to every menu and feature.",
    menus: ALL_SUB_KEYS,
    extras: ["pos.access", ...FULL_ORDERS],
  },
  {
    key: "manager",
    label: "Manager",
    description: "Operations, sales, reports — no system settings.",
    menus: ALL_SUB_KEYS.filter((k) => !["settings", "google_sheets", "bot_automation"].includes(k)),
    extras: ["pos.access", ...FULL_ORDERS],
  },
  {
    key: "accountant",
    label: "Accountant",
    description: "Finance, reports, due book, transactions.",
    menus: [
      "reports", "sales_profit", "income_expense", "account_book", "due_book",
      "ad_costs", "facebook_ads", "transactions", "daily_report", "profit_loss",
      "customer_credits", "due_customers",
    ],
  },
  {
    key: "sales_executive",
    label: "Sales Executive",
    description: "POS, orders and customer-facing menus.",
    menus: ["customers", "due_customers", "loyalty", "subscriptions"],
    extras: ["pos.access", "orders.view", "orders.create", "orders.edit"],
  },
  {
    key: "inventory_manager",
    label: "Inventory Manager",
    description: "Products, stock, suppliers and purchases.",
    menus: ["products", "inventory", "order_forms", "coupons", "suppliers", "purchases", "stock_alerts"],
  },
  {
    key: "support_staff",
    label: "Support Staff",
    description: "Customer support, credits and loyalty.",
    menus: ["customers", "customer_credits", "due_customers", "loyalty", "subscriptions"],
    extras: ["orders.view"],
  },
  {
    key: "custom",
    label: "Custom",
    description: "Manually pick each menu this staff can access.",
    menus: [],
  },
];

export const getPresetPerms = (key: string): string[] => {
  const preset = ROLE_PRESETS.find((p) => p.key === key);
  if (!preset) return [];
  return [
    ...preset.menus.map(menuKeyPerm),
    ...(preset.extras ?? []),
  ];
};

/** Best-effort detection of which preset a permission list matches. */
export const detectPreset = (perms: string[]): string => {
  const set = new Set(perms);
  for (const preset of ROLE_PRESETS) {
    if (preset.key === "custom") continue;
    const expected = getPresetPerms(preset.key);
    if (expected.length === 0) continue;
    // Match if every expected perm is present and no extra menu perms exist
    const allPresent = expected.every((p) => set.has(p));
    const extraMenus = perms.filter((p) => p.startsWith("m:") && !expected.includes(p));
    if (allPresent && extraMenus.length === 0) return preset.key;
  }
  return "custom";
};
