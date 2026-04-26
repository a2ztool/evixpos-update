import { supabase } from "@/integrations/supabase/client";

// ══════════════════════════════════════════════════════
// Centralized Notification Trigger System
// ══════════════════════════════════════════════════════
// All notification types used across the platform
export type NotificationType =
  | "order" | "order_completed" | "order_pending" | "refund"
  | "payment" | "payment_failed"
  | "subscription" | "subscription_expired"
  | "customer" | "customer_due"
  | "pos_sale" | "pos_register"
  | "system" | "plan_upgrade"
  | "integration"
  | "referral" | "referral_commission" | "referral_withdraw"
  | "support" | "support_reply"
  | "alert" | "low_stock"
  | "task_status_updated"
  | "success" | "error" | "warning" | "info";

// Maps notification types to sound categories
export const SOUND_CATEGORY: Record<string, "order" | "payment" | "alert" | "info" | "success" | "error"> = {
  order: "order",
  order_completed: "order",
  order_pending: "order",
  refund: "payment",
  payment: "payment",
  payment_failed: "error",
  subscription: "payment",
  subscription_expired: "alert",
  customer: "info",
  customer_due: "alert",
  pos_sale: "order",
  pos_register: "info",
  system: "info",
  plan_upgrade: "success",
  integration: "info",
  referral: "success",
  referral_commission: "payment",
  referral_withdraw: "info",
  support: "alert",
  support_reply: "info",
  alert: "alert",
  low_stock: "alert",
  task_status_updated: "info",
  success: "success",
  error: "error",
  warning: "alert",
  info: "info",
};

// Type-to-emoji map for display
export const TYPE_EMOJI: Record<string, string> = {
  order: "🛒",
  order_completed: "✅",
  order_pending: "⏳",
  refund: "💰",
  payment: "💳",
  payment_failed: "❌",
  subscription: "📋",
  subscription_expired: "⚠️",
  customer: "👤",
  customer_due: "📌",
  pos_sale: "🏪",
  pos_register: "💵",
  system: "⚙️",
  plan_upgrade: "🚀",
  integration: "🔗",
  referral: "🤝",
  referral_commission: "💎",
  referral_withdraw: "📤",
  support: "🎫",
  support_reply: "💬",
  alert: "🔔",
  low_stock: "📦",
  task_status_updated: "📋",
  success: "🟢",
  error: "🔴",
  warning: "🟡",
  info: "🔵",
};

// Friendly type labels
export const TYPE_LABEL: Record<string, string> = {
  order: "New Order",
  order_completed: "Order Completed",
  order_pending: "Order Pending",
  refund: "Refund",
  payment: "Payment",
  payment_failed: "Payment Failed",
  subscription: "Subscription",
  subscription_expired: "Subscription Expired",
  customer: "Customer",
  customer_due: "Customer Due",
  pos_sale: "POS Sale",
  pos_register: "Cash Register",
  system: "System",
  plan_upgrade: "Plan Upgrade",
  integration: "Integration",
  referral: "Referral",
  referral_commission: "Commission",
  referral_withdraw: "Withdraw",
  support: "Support",
  support_reply: "Support Reply",
  alert: "Alert",
  low_stock: "Low Stock",
  task_status_updated: "Task Update",
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

// ══════════════════════════════════════════════════════
// Core trigger function
// ══════════════════════════════════════════════════════
interface TriggerOptions {
  userId: string;
  type: NotificationType;
  message: string;
}

// Deduplication: track recently sent notifications to prevent duplicates
const recentNotifications = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000; // 5 seconds

const isDuplicate = (key: string): boolean => {
  const now = Date.now();
  const last = recentNotifications.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentNotifications.set(key, now);
  // Clean old entries periodically
  if (recentNotifications.size > 100) {
    for (const [k, v] of recentNotifications) {
      if (now - v > DEDUP_WINDOW_MS * 2) recentNotifications.delete(k);
    }
  }
  return false;
};

// Offline queue
let offlineQueue: TriggerOptions[] = [];

const flushOfflineQueue = async () => {
  if (offlineQueue.length === 0) return;
  const queue = [...offlineQueue];
  offlineQueue = [];
  for (const item of queue) {
    await triggerNotification(item);
  }
};

// Listen for online event to flush queue
if (typeof window !== "undefined") {
  window.addEventListener("online", flushOfflineQueue);
}

export const triggerNotification = async ({ userId, type, message }: TriggerOptions): Promise<boolean> => {
  // Offline queue
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    offlineQueue.push({ userId, type, message });
    return false;
  }

  // Dedup check
  const dedupKey = `${userId}:${type}:${message}`;
  if (isDuplicate(dedupKey)) return false;

  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    message,
    is_read: false,
  } as any);

  return !error;
};

// ══════════════════════════════════════════════════════
// Convenience trigger functions for each event type
// ══════════════════════════════════════════════════════

// Orders
export const notifyNewOrder = (userId: string, orderId: string, amount?: string) =>
  triggerNotification({ userId, type: "order", message: `New order #${orderId}${amount ? ` — ${amount}` : ""} received` });

export const notifyOrderCompleted = (userId: string, orderId: string) =>
  triggerNotification({ userId, type: "order_completed", message: `Order #${orderId} has been completed` });

export const notifyOrderPending = (userId: string, orderId: string) =>
  triggerNotification({ userId, type: "order_pending", message: `Order #${orderId} is pending review` });

export const notifyRefund = (userId: string, orderId: string, amount?: string) =>
  triggerNotification({ userId, type: "refund", message: `Refund processed for order #${orderId}${amount ? ` — ${amount}` : ""}` });

// Payments
export const notifyPaymentReceived = (userId: string, amount: string, from?: string) =>
  triggerNotification({ userId, type: "payment", message: `Payment of ${amount} received${from ? ` from ${from}` : ""}` });

export const notifyPaymentFailed = (userId: string, amount: string) =>
  triggerNotification({ userId, type: "payment_failed", message: `Payment of ${amount} failed` });

// Subscriptions
export const notifySubscriptionCreated = (userId: string, plan: string) =>
  triggerNotification({ userId, type: "subscription", message: `New subscription created — ${plan} plan` });

export const notifySubscriptionExpired = (userId: string, plan: string) =>
  triggerNotification({ userId, type: "subscription_expired", message: `${plan} plan subscription has expired` });

// Customers
export const notifyNewCustomer = (userId: string, customerName: string) =>
  triggerNotification({ userId, type: "customer", message: `New customer added: ${customerName}` });

export const notifyCustomerDue = (userId: string, customerName: string, amount: string) =>
  triggerNotification({ userId, type: "customer_due", message: `${customerName} has a due of ${amount}` });

// POS
export const notifyPOSSale = (userId: string, amount: string) =>
  triggerNotification({ userId, type: "pos_sale", message: `POS sale completed — ${amount}` });

export const notifyPOSRegister = (userId: string, action: "opened" | "closed") =>
  triggerNotification({ userId, type: "pos_register", message: `Cash register ${action}` });

// System
export const notifyStoreCreated = (userId: string, storeName: string) =>
  triggerNotification({ userId, type: "system", message: `Store "${storeName}" has been created` });

export const notifyPlanUpgrade = (userId: string, plan: string) =>
  triggerNotification({ userId, type: "plan_upgrade", message: `Plan upgraded to ${plan}` });

export const notifyIntegration = (userId: string, name: string, action: "connected" | "disconnected") =>
  triggerNotification({ userId, type: "integration", message: `${name} integration ${action}` });

// Referral
export const notifyReferralSignup = (userId: string, referredName: string) =>
  triggerNotification({ userId, type: "referral", message: `New referral signup: ${referredName}` });

export const notifyCommissionEarned = (userId: string, amount: string) =>
  triggerNotification({ userId, type: "referral_commission", message: `Commission earned: ${amount}` });

export const notifyWithdrawStatus = (userId: string, status: "approved" | "rejected", amount: string) =>
  triggerNotification({ userId, type: "referral_withdraw", message: `Withdraw request of ${amount} ${status}` });

// Support
export const notifyTicketCreated = (userId: string, ticketId: string) =>
  triggerNotification({ userId, type: "support", message: `Support ticket #${ticketId} created` });

export const notifyTicketReply = (userId: string, ticketId: string) =>
  triggerNotification({ userId, type: "support_reply", message: `New reply on support ticket #${ticketId}` });

// Stock
export const notifyLowStock = (userId: string, productName: string, qty: number) =>
  triggerNotification({ userId, type: "low_stock", message: `Low stock alert: ${productName} (${qty} remaining)` });

// ══════════════════════════════════════════════════════
// Staff ↔ User messaging / tasks
// ══════════════════════════════════════════════════════
export const notifyStaffMessage = (receiverUserId: string, senderName: string, preview: string) =>
  triggerNotification({
    userId: receiverUserId,
    type: "support_reply",
    message: `💬 ${senderName}: ${preview.slice(0, 80)}${preview.length > 80 ? "…" : ""}`,
  });

export const notifyStaffTask = (receiverUserId: string, senderName: string, taskTitle: string) =>
  triggerNotification({
    userId: receiverUserId,
    type: "support",
    message: `📋 New task from ${senderName}: ${taskTitle}`,
  });

// ══════════════════════════════════════════════════════
// Admin notifications — fan out to all admin users via edge function
// (uses service role to bypass RLS on user_roles)
// ══════════════════════════════════════════════════════
const notifyAllAdmins = async (type: NotificationType, message: string) => {
  // Dedup at sender side too (5s window) so spam-clicks don't re-broadcast
  const dedupKey = `admins:${type}:${message}`;
  if (isDuplicate(dedupKey)) return;
  try {
    await supabase.functions.invoke("notify-admins", { body: { type, message } });
  } catch (e) {
    console.error("notify-admins failed:", e);
  }
};

export const notifyAdminsNewTicket = (ticketId: string, subject: string, fromName?: string) =>
  notifyAllAdmins("support", `🎫 New support ticket #${ticketId}${fromName ? ` from ${fromName}` : ""}: ${subject.slice(0, 60)}`);

export const notifyAdminsPlanPayment = (plan: string, amount: string, fromName?: string) =>
  notifyAllAdmins("payment", `💳 New plan payment for ${plan} (${amount})${fromName ? ` from ${fromName}` : ""} — needs review`);

export const notifyAdminsLandingMessage = (visitorName: string, preview: string) =>
  notifyAllAdmins("info", `💬 New landing chat from ${visitorName}: ${preview.slice(0, 60)}${preview.length > 60 ? "…" : ""}`);

// User-facing: order from public order form
export const notifyOrderFormOrder = (userId: string, customerName: string, amount: string) =>
  triggerNotification({ userId, type: "order", message: `🛒 New order form order from ${customerName} — ${amount}` });
