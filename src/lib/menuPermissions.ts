// Granular per-menu permissions for staff.
//
// Format: `m:<menu_key>:<action>` where action ∈ view | create | edit | delete.
// Each sub-menu also lists legacy fallback perms so existing staff with the
// older module-level perms (e.g. `products.view`) keep working until the
// owner re-saves their permissions in the new UI.

export type MenuAction = "view" | "create" | "edit" | "delete";

export const ACTIONS: MenuAction[] = ["view", "create", "edit", "delete"];

export interface SubMenu {
  key: string;
  label: string;
  /** Actions exposed in the UI for this sub-menu (default: all four). */
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

/** Build a permission key from a sub-menu key + action. */
export const menuPerm = (menuKey: string, action: MenuAction) =>
  `m:${menuKey}:${action}`;

/** Every menu permission key. Used for "Select All" presets. */
export const ALL_MENU_PERMS: string[] = MENU_MODULES.flatMap((mod) =>
  mod.subs.flatMap((sub) =>
    (sub.actions ?? ACTIONS).map((a) => menuPerm(sub.key, a))
  )
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
 * Returns true if `perms` grants the given menu action — either via the new
 * `m:<key>:<action>` key or any matching legacy perm.
 */
export const hasMenuAccess = (
  perms: string[],
  menuKey: string,
  action: MenuAction = "view"
): boolean => {
  if (perms.includes(menuPerm(menuKey, action))) return true;
  const legacy = getLegacyFallbacks(menuKey, action);
  return legacy.some((p) => perms.includes(p));
};

/** "View" granted for any sub-menu inside the given module. */
export const moduleHasAnyView = (perms: string[], moduleKey: string): boolean => {
  const mod = MENU_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return false;
  return mod.subs.some((s) => hasMenuAccess(perms, s.key, "view"));
};
