import { z } from "zod";

// ─── Reusable Field Validators ───

export const nameField = (label = "Name") =>
  z.string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must be under 100 characters`)
    .refine(v => !/^https?:\/\//.test(v), `${label} cannot be a URL`)
    .refine(v => !/^\d+$/.test(v), `${label} cannot be only numbers`);

export const emailField = (required = true) => {
  if (required) {
    return z.string().trim().min(1, "Email is required").max(255, "Email must be under 255 characters").email("Invalid email format");
  }
  return z.string().trim().max(255, "Email must be under 255 characters")
    .refine(v => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email format");
};

export const phoneField = (required = false) => {
  const regex = /^(\+?\d{7,15})?$/;
  if (required) {
    return z.string().trim().min(1, "Phone number is required").max(20, "Phone number too long")
      .regex(regex, "Invalid phone number (7-15 digits, optional + prefix)");
  }
  return z.string().trim().max(20, "Phone number too long")
    .refine(v => v === "" || regex.test(v), "Invalid phone number (7-15 digits, optional + prefix)");
};

export const passwordField = z.string()
  .min(6, "Password must be at least 6 characters")
  .max(128, "Password must be under 128 characters");

export const positiveNumber = (label = "Value") =>
  z.string()
    .refine(v => v === "" || !isNaN(Number(v)), `${label} must be a number`)
    .refine(v => v === "" || Number(v) >= 0, `${label} cannot be negative`);

export const requiredPositiveNumber = (label = "Value") =>
  z.string()
    .min(1, `${label} is required`)
    .refine(v => !isNaN(Number(v)), `${label} must be a number`)
    .refine(v => Number(v) > 0, `${label} must be greater than 0`);

export const urlField = (required = false) => {
  if (required) {
    return z.string().trim().min(1, "URL is required").max(2048, "URL too long").url("Invalid URL format");
  }
  return z.string().trim().max(2048, "URL too long")
    .refine(v => v === "" || /^https?:\/\/.+/.test(v), "Invalid URL format");
};

export const textField = (label = "Field", maxLen = 500) =>
  z.string().trim().max(maxLen, `${label} must be under ${maxLen} characters`);

export const requiredTextField = (label = "Field", maxLen = 500) =>
  z.string().trim().min(1, `${label} is required`).max(maxLen, `${label} must be under ${maxLen} characters`);

// ─── Auth Schemas ───

export const loginSchema = z.object({
  email: emailField(),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  name: nameField("Full name"),
  email: emailField(),
  password: passwordField,
  referralCode: z.string().max(8).optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordField,
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ─── Customer Schema ───

export const customerSchema = z.object({
  name: nameField("Customer name"),
  phone: phoneField(),
  email: emailField(false),
  address: textField("Address", 500),
  tags: textField("Tags", 200),
  notes: textField("Notes", 1000),
});

// ─── Product Schema ───

export const productSchema = z.object({
  name: nameField("Product name"),
  sku: textField("SKU", 50),
  category: textField("Category", 100),
  image_url: urlField(),
  description: textField("Description", 2000),
  base_cost: positiveNumber("Base cost"),
  price: positiveNumber("Price"),
  stock: positiveNumber("Stock"),
});

// ─── Coupon Schema ───

export const couponSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required").max(20, "Code too long")
    .regex(/^[A-Z0-9]+$/, "Code must be uppercase alphanumeric"),
  type: z.enum(["fixed", "percentage"]),
  value: requiredPositiveNumber("Discount value"),
  minOrder: positiveNumber("Minimum order"),
  maxUses: positiveNumber("Max uses"),
});

// ─── Supplier Schema ───

export const supplierSchema = z.object({
  name: nameField("Supplier name"),
  phone: phoneField(),
  email: emailField(false),
  address: textField("Address", 500),
  notes: textField("Notes", 1000),
});

// ─── Support Ticket Schema ───

export const supportTicketSchema = z.object({
  subject: requiredTextField("Subject", 200),
  description: textField("Description", 5000),
  category: z.string().min(1, "Category is required"),
  priority: z.string().min(1, "Priority is required"),
});

// ─── Income/Expense Schema ───

export const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: requiredPositiveNumber("Amount"),
  category: z.string().min(1, "Category is required"),
  note: textField("Note", 500),
});

// ─── Due Book Schema ───

export const dueSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: requiredPositiveNumber("Amount"),
  category: z.string().min(1, "Category is required"),
  note: textField("Note", 500),
});

// ─── Purchase Schema ───

export const purchaseSchema = z.object({
  supplier_id: z.string().optional(),
  total_amount: requiredPositiveNumber("Total amount"),
  paid_amount: positiveNumber("Paid amount"),
  payment_method: z.string().min(1, "Payment method is required"),
  notes: textField("Notes", 500),
});

// ─── Onboarding Schema ───

export const onboardingSchema = z.object({
  storeName: requiredTextField("Store name", 100),
  fullName: textField("Full name", 100),
});

// ─── Integration Schema ───

export const whatsappSchema = z.object({
  api_key: z.string().trim().min(1, "Access token is required"),
  phone_number: z.string().trim().min(1, "Phone Number ID is required"),
});

export const woocommerceSchema = z.object({
  api_key: z.string().trim().min(1, "API key is required"),
});

export const sendWhatsAppSchema = z.object({
  phone: z.string().trim().min(1, "Phone is required").regex(/^\+?\d{7,15}$/, "Invalid phone number"),
  message: requiredTextField("Message", 4096),
});

// ─── Admin Settings ───

export const adminEmailSchema = z.object({
  email: emailField(),
});

export const adminPasswordSchema = z.object({
  password: passwordField,
});

// ─── Utility: Validate and return errors map ───

export type ValidationErrors = Record<string, string>;

export function validate<T>(schema: z.ZodType<T>, data: unknown): { success: true; data: T } | { success: false; errors: ValidationErrors } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: ValidationErrors = {};
  const issues = result.error?.issues || [];
  issues.forEach((e) => {
    const path = e.path.join(".");
    if (!errors[path]) errors[path] = e.message;
  });
  return { success: false, errors };
}

/**
 * Validate and show first error as toast. Returns parsed data or null.
 */
export function validateWithToast<T>(schema: z.ZodType<T>, data: unknown, toastFn: (msg: string) => void): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error?.issues || [];
  toastFn(issues[0]?.message || "Validation failed");
  return null;
}
