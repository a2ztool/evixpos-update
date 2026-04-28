import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useCurrencyContext, type CurrencyCode } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSubscription } from "@/hooks/useSubscription";
import type { Lang } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Settings as SettingsIcon, CreditCard, DollarSign, Languages, UsersRound,
  Store, UserCircle, ChevronRight, Plus, Trash2, Save, Shield, Eye, EyeOff,
  Smartphone, Landmark, Globe, Wallet, Search, Download, Upload, FileDown, FileUp, AlertTriangle, Crown,
  QrCode, MessageSquare, Key, User as UserIcon, Sparkles, BookOpen, HelpCircle, X, Lightbulb,
  CheckCircle2, Zap, Lock, KeyRound
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGatewayIcon, getGatewayColor } from "@/lib/gatewayBrands";
import { toast } from "sonner";
import { businessSettingsSchema, storeAddSchema, staffMemberSchema, profileUpdateSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";

// ─── Payment Gateway Catalog ───
interface GatewayDef {
  id: string;
  name: string;
  region: "bd" | "in" | "intl";
  icon: any;
  desc: string;
  fields: string[];
  personalFields?: { key: string; label: string; placeholder: string }[];
  defaultInstruction?: string;
}

const GATEWAY_CATALOG: GatewayDef[] = [
  // Bangladesh
  { id: "cash", name: "Cash", region: "bd", icon: Wallet, desc: "Accept cash payments", fields: [], defaultInstruction: "Pay cash on delivery or at store." },
  { id: "bkash", name: "bKash", region: "bd", icon: Smartphone, desc: "bKash mobile banking", fields: ["merchant_number", "api_key"],
    personalFields: [
      { key: "personal_number", label: "bKash Number", placeholder: "01XXXXXXXXX" },
      { key: "account_type", label: "Account Type", placeholder: "personal" },
    ],
    defaultInstruction: "এই নম্বরে bKash Send Money করুন এবং Transaction ID দিন।" },
  { id: "nagad", name: "Nagad", region: "bd", icon: Smartphone, desc: "Nagad mobile banking", fields: ["merchant_number", "api_key"],
    personalFields: [
      { key: "personal_number", label: "Nagad Number", placeholder: "01XXXXXXXXX" },
      { key: "account_type", label: "Account Type", placeholder: "personal" },
    ],
    defaultInstruction: "এই নম্বরে Nagad Send Money করুন এবং Transaction ID দিন।" },
  { id: "rocket", name: "Rocket", region: "bd", icon: Smartphone, desc: "Rocket (DBBL)", fields: ["merchant_number"],
    personalFields: [
      { key: "personal_number", label: "Rocket Number", placeholder: "01XXXXXXXXX" },
    ],
    defaultInstruction: "এই নম্বরে Rocket Send Money করুন এবং Transaction ID দিন।" },
  { id: "upay", name: "Upay", region: "bd", icon: Smartphone, desc: "Upay mobile banking", fields: ["merchant_number"],
    personalFields: [{ key: "personal_number", label: "Upay Number", placeholder: "01XXXXXXXXX" }],
    defaultInstruction: "এই নম্বরে Upay Send Money করুন।" },
  { id: "tap", name: "Tap", region: "bd", icon: Smartphone, desc: "Tap mobile payment", fields: ["merchant_number"],
    personalFields: [{ key: "personal_number", label: "Tap Number", placeholder: "01XXXXXXXXX" }],
    defaultInstruction: "এই নম্বরে Tap Send Money করুন।" },
  { id: "cellfin", name: "CellFin", region: "bd", icon: Smartphone, desc: "CellFin digital wallet", fields: ["merchant_id"],
    personalFields: [{ key: "personal_number", label: "CellFin Number", placeholder: "01XXXXXXXXX" }] },
  { id: "sslcommerz", name: "SSLCommerz", region: "bd", icon: Globe, desc: "SSLCommerz payment gateway", fields: ["store_id", "store_password"] },
  { id: "aamarpay", name: "AamarPay", region: "bd", icon: Globe, desc: "AamarPay online payment", fields: ["store_id", "signature_key"] },
  { id: "shurjopay", name: "ShurjoPay", region: "bd", icon: Globe, desc: "ShurjoPay payment", fields: ["merchant_key", "merchant_code"] },
  { id: "portwallet", name: "PortWallet", region: "bd", icon: Globe, desc: "PortWallet gateway", fields: ["app_key", "secret_key"] },
  { id: "ekpay", name: "EkPay", region: "bd", icon: Globe, desc: "EkPay aggregator", fields: ["merchant_id", "api_key"] },
  { id: "bd_bank", name: "Bank Transfer (BD)", region: "bd", icon: Landmark, desc: "Direct bank transfer", fields: [],
    personalFields: [
      { key: "bank_name", label: "Bank Name", placeholder: "e.g. Dutch Bangla Bank" },
      { key: "account_name", label: "Account Name", placeholder: "Account holder name" },
      { key: "account_number", label: "Account Number", placeholder: "1234567890" },
      { key: "branch_name", label: "Branch", placeholder: "Branch name" },
      { key: "routing_number", label: "Routing Number", placeholder: "Optional" },
    ],
    defaultInstruction: "এই ব্যাংক অ্যাকাউন্টে টাকা ট্রান্সফার করুন এবং স্ক্রিনশট দিন।" },
  { id: "cod_bd", name: "Cash on Delivery", region: "bd", icon: Wallet, desc: "Pay on delivery", fields: [],
    defaultInstruction: "পণ্য হাতে পেয়ে ক্যাশে পেমেন্ট করুন।" },
  // India
  { id: "razorpay", name: "Razorpay", region: "in", icon: Globe, desc: "Razorpay payment gateway", fields: ["key_id", "key_secret"] },
  { id: "paytm", name: "Paytm", region: "in", icon: Smartphone, desc: "Paytm wallet & UPI", fields: ["merchant_id", "merchant_key"],
    personalFields: [
      { key: "personal_number", label: "Paytm Number", placeholder: "+91 XXXXXXXXXX" },
      { key: "upi_id", label: "UPI ID", placeholder: "name@paytm" },
    ],
    defaultInstruction: "Send payment to this Paytm number/UPI and share screenshot." },
  { id: "phonepe", name: "PhonePe", region: "in", icon: Smartphone, desc: "PhonePe UPI payments", fields: ["merchant_id", "salt_key"],
    personalFields: [
      { key: "personal_number", label: "PhonePe Number", placeholder: "+91 XXXXXXXXXX" },
      { key: "upi_id", label: "UPI ID", placeholder: "name@ybl" },
    ],
    defaultInstruction: "Send payment via PhonePe to this UPI ID and share transaction screenshot." },
  { id: "googlepay", name: "Google Pay", region: "in", icon: Smartphone, desc: "Google Pay UPI", fields: ["upi_id"],
    personalFields: [
      { key: "personal_number", label: "Google Pay Number", placeholder: "+91 XXXXXXXXXX" },
      { key: "upi_id", label: "UPI ID", placeholder: "name@okicici" },
    ],
    defaultInstruction: "Send payment via Google Pay to this UPI ID and share screenshot." },
  { id: "payu", name: "PayU", region: "in", icon: Globe, desc: "PayU payment gateway", fields: ["merchant_key", "salt"] },
  { id: "cashfree", name: "Cashfree", region: "in", icon: Globe, desc: "Cashfree payments", fields: ["app_id", "secret_key"] },
  { id: "instamojo", name: "Instamojo", region: "in", icon: Globe, desc: "Instamojo payments", fields: ["api_key", "auth_token"] },
  { id: "ccavenue", name: "CCAvenue", region: "in", icon: Globe, desc: "CCAvenue gateway", fields: ["merchant_id", "access_code", "working_key"] },
  { id: "upi", name: "UPI Direct", region: "in", icon: Smartphone, desc: "Direct UPI transfer", fields: [],
    personalFields: [
      { key: "upi_id", label: "UPI ID", placeholder: "yourname@upi" },
      { key: "personal_number", label: "Phone Number", placeholder: "+91 XXXXXXXXXX" },
    ],
    defaultInstruction: "Send payment to this UPI ID and share the transaction screenshot." },
  { id: "in_bank", name: "Bank Transfer (IN)", region: "in", icon: Landmark, desc: "NEFT/IMPS/RTGS", fields: [],
    personalFields: [
      { key: "bank_name", label: "Bank Name", placeholder: "e.g. SBI, HDFC" },
      { key: "account_name", label: "Account Name", placeholder: "Account holder name" },
      { key: "account_number", label: "Account Number", placeholder: "1234567890" },
      { key: "ifsc_code", label: "IFSC Code", placeholder: "SBIN0001234" },
    ],
    defaultInstruction: "Transfer via NEFT/IMPS/RTGS to this account and share receipt." },
  { id: "cod_in", name: "Cash on Delivery", region: "in", icon: Wallet, desc: "Pay on delivery (India)", fields: [],
    defaultInstruction: "Pay cash when you receive the product." },
  // International
  { id: "paypal", name: "PayPal", region: "intl", icon: Globe, desc: "PayPal international payments", fields: ["client_id", "client_secret"],
    personalFields: [{ key: "paypal_email", label: "PayPal Email", placeholder: "your@email.com" }],
    defaultInstruction: "Send payment to this PayPal email and share confirmation." },
  { id: "stripe", name: "Stripe", region: "intl", icon: Globe, desc: "Stripe card payments", fields: ["publishable_key", "secret_key"] },
  { id: "binance", name: "Binance Pay", region: "intl", icon: Globe, desc: "Binance crypto payments", fields: ["merchant_id", "api_key"],
    personalFields: [{ key: "binance_id", label: "Binance Pay ID", placeholder: "Your Binance Pay ID" }] },
  { id: "payoneer", name: "Payoneer", region: "intl", icon: Globe, desc: "Payoneer global payments", fields: ["email"],
    personalFields: [{ key: "payoneer_email", label: "Payoneer Email", placeholder: "your@email.com" }],
    defaultInstruction: "Send payment to this Payoneer email." },
  { id: "wise", name: "Wise (TransferWise)", region: "intl", icon: Globe, desc: "Wise international transfer", fields: ["email", "account_details"],
    personalFields: [
      { key: "wise_email", label: "Wise Email", placeholder: "your@email.com" },
      { key: "account_details", label: "Account Details", placeholder: "IBAN or account info" },
    ],
    defaultInstruction: "Transfer via Wise to this account." },
  { id: "skrill", name: "Skrill", region: "intl", icon: Globe, desc: "Skrill digital wallet", fields: ["email"],
    personalFields: [{ key: "skrill_email", label: "Skrill Email", placeholder: "your@email.com" }] },
  { id: "crypto", name: "Cryptocurrency", region: "intl", icon: Globe, desc: "Accept BTC, ETH, USDT", fields: [],
    personalFields: [
      { key: "wallet_address", label: "Wallet Address", placeholder: "0x..." },
      { key: "network", label: "Network", placeholder: "e.g. ERC-20, TRC-20, BEP-20" },
      { key: "coin_type", label: "Coin Type", placeholder: "USDT, BTC, ETH" },
    ],
    defaultInstruction: "Send crypto to this wallet address on the specified network." },
  { id: "intl_card", name: "Credit/Debit Card", region: "intl", icon: CreditCard, desc: "Visa, Mastercard, Amex", fields: [] },
  { id: "intl_bank", name: "Wire Transfer", region: "intl", icon: Landmark, desc: "International wire transfer", fields: [],
    personalFields: [
      { key: "bank_name", label: "Bank Name", placeholder: "Bank name" },
      { key: "account_name", label: "Account Name", placeholder: "Account holder" },
      { key: "account_number", label: "Account/IBAN", placeholder: "Account number or IBAN" },
      { key: "swift_code", label: "SWIFT/BIC Code", placeholder: "SWIFT code" },
    ],
    defaultInstruction: "Wire transfer to this bank account. Share receipt after transfer." },
];

const REGION_LABELS: Record<string, Record<Lang, string>> = {
  bd: { en: "🇧🇩 Bangladesh", bn: "🇧🇩 বাংলাদেশ", hi: "🇧🇩 बांग्लादेश" },
  in: { en: "🇮🇳 India", bn: "🇮🇳 ভারত", hi: "🇮🇳 भारत" },
  intl: { en: "🌍 International", bn: "🌍 আন্তর্জাতিক", hi: "🌍 अंतर्राष्ट्रीय" },
};

interface ActiveGateway {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  user_created?: boolean;
}

interface BusinessSettings {
  id?: string;
  business_name: string;
  business_email: string;
  store_slug: string;
  shop_url: string;
  business_phone: string;
  logo_url: string;
  show_payment_in_pos: boolean;
  default_currency: string;
  timezone: string;
  tax_rate: number;
  app_language: string;
  payment_methods: ActiveGateway[];
  currencies: Array<{ code: string; symbol: string; rate: number }>;
}

interface StaffMember {
  id: string; name: string; email: string; phone: string;
  role: string; permissions: string[]; is_active: boolean;
}

interface StoreItem {
  id: string; name: string; address: string; phone: string;
  is_default: boolean; is_active: boolean; store_mode: string;
}

type Tab = "general" | "payment" | "currencies" | "language" | "staff" | "stores" | "profile" | "backup";

const TIMEZONES = [
  "UTC", "Asia/Dhaka", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore",
  "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin",
];

const LANGUAGES_LIST = [
  { code: "en" as Lang, label: "English", native: "English" },
  { code: "bn" as Lang, label: "Bangla", native: "বাংলা" },
  { code: "hi" as Lang, label: "Hindi", native: "हिन्दी" },
];

const PERMISSION_MODULES: { module: string; perms: string[] }[] = [
  { module: "POS", perms: ["pos.access"] },
  { module: "Orders", perms: ["orders.view", "orders.create", "orders.edit", "orders.delete"] },
  { module: "Products", perms: ["products.view", "products.create", "products.edit", "products.delete"] },
  { module: "Customers", perms: ["customers.view", "customers.create", "customers.edit", "customers.delete"] },
  { module: "Subscriptions", perms: ["subscriptions.view", "subscriptions.create", "subscriptions.edit", "subscriptions.delete"] },
  { module: "Due Book", perms: ["due.view", "due.create", "due.edit", "due.delete"] },
  { module: "Reports & Analytics", perms: ["reports.view"] },
  { module: "Finances", perms: ["finances.view", "finances.edit"] },
  { module: "Integrations", perms: ["integrations.view", "integrations.edit"] },
  { module: "Suppliers & Purchases", perms: ["suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete", "purchases.view", "purchases.create", "purchases.edit", "purchases.delete"] },
  { module: "Settings", perms: ["settings.view", "settings.edit"] },
];

const ALL_PERMISSIONS = PERMISSION_MODULES.flatMap(m => m.perms);

const ROLE_PRESETS: Record<string, string[]> = {
  admin: ALL_PERMISSIONS,
  manager: [
    "pos.access",
    "orders.view", "orders.create", "orders.edit",
    "products.view", "products.create", "products.edit",
    "customers.view", "customers.create", "customers.edit",
    "subscriptions.view", "subscriptions.create", "subscriptions.edit",
    "due.view", "due.create", "due.edit",
    "reports.view",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "purchases.view", "purchases.create", "purchases.edit",
  ],
  staff: ["pos.access", "orders.view", "orders.create", "products.view", "customers.view", "due.view"],
  custom: [],
};

const defaultPaymentMethods: ActiveGateway[] = [];

const cleanUserPaymentMethods = (methods: unknown): ActiveGateway[] => {
  if (!Array.isArray(methods)) return [];

  return methods.filter((method): method is ActiveGateway => {
    if (!method || typeof method !== "object") return false;
    const gateway = method as ActiveGateway;
    const config = gateway.config && typeof gateway.config === "object" ? gateway.config : {};
    const hasConfig = Object.values(config).some(value => typeof value === "string" && value.trim().length > 0);

    return Boolean(gateway.id) && (gateway.user_created === true || hasConfig);
  });
};

const defaultSettings: BusinessSettings = {
  business_name: "", business_email: "", store_slug: "", shop_url: "",
  business_phone: "", logo_url: "", show_payment_in_pos: true,
  default_currency: "BDT", timezone: "UTC", tax_rate: 0, app_language: "en",
  payment_methods: defaultPaymentMethods,
  currencies: [
    { code: "BDT", symbol: "৳", rate: 1 },
    { code: "USD", symbol: "$", rate: 0.0082 },
    { code: "INR", symbol: "₹", rate: 0.69 },
  ],
};

const SettingsPage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { setCurrency: setGlobalCurrency } = useCurrencyContext();
  const { t, lang, setLang } = useLanguage();
  const { plan } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "general";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [staffDialog, setStaffDialog] = useState(false);
  const [storeDialog, setStoreDialog] = useState(false);
  const [addGatewayDialog, setAddGatewayDialog] = useState(false);
  const [gatewaySearch, setGatewaySearch] = useState("");
  const [gatewayRegion, setGatewayRegion] = useState<"all" | "bd" | "in" | "intl">("all");
  const [configDialog, setConfigDialog] = useState<string | null>(null);
  const [configTemp, setConfigTemp] = useState<Record<string, string>>({});
  const [newStaff, setNewStaff] = useState({ name: "", email: "", phone: "", password: "", role: "staff", permissions: ROLE_PRESETS["staff"] as string[] });
  const [staffCreating, setStaffCreating] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [newStore, setNewStore] = useState({ name: "", address: "", phone: "" });
  const [profileForm, setProfileForm] = useState({ name: "", email: "", newPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [tabSearch, setTabSearch] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const generalValidation = useFormValidation(businessSettingsSchema);
  const storeValidation = useFormValidation(storeAddSchema);
  const staffValidation = useFormValidation(staffMemberSchema);
  const profileValidation = useFormValidation(profileUpdateSchema);

  useEffect(() => {
    const tab = searchParams.get("tab") as Tab;
    if (tab && ["general","payment","currencies","language","staff","stores","profile","backup"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || !activeStore) return;
    const load = async () => {
      const uid = effectiveUserId || user.id;
      // Try by user_id + store_id first, then user_id only (unique constraint is on user_id)
      let { data: s } = await supabase.from("business_settings").select("*").eq("user_id", uid).eq("store_id", activeStore.id).maybeSingle();
      if (!s) {
        const { data: fallback } = await supabase.from("business_settings").select("*").eq("user_id", uid).maybeSingle();
        s = fallback;
      }
      if (s) {
        setSettings({
          id: s.id, business_name: s.business_name, business_email: s.business_email,
          store_slug: s.store_slug, shop_url: s.shop_url, business_phone: s.business_phone,
          logo_url: s.logo_url, show_payment_in_pos: s.show_payment_in_pos,
          default_currency: s.default_currency, timezone: s.timezone,
          tax_rate: Number(s.tax_rate), app_language: s.app_language,
          payment_methods: cleanUserPaymentMethods(s.payment_methods),
          currencies: (s.currencies as any[]) ?? defaultSettings.currencies,
        });
        if (s.app_language && LANGUAGES_LIST.find(l => l.code === s.app_language)) {
          setLang(s.app_language as Lang);
        }
      } else {
        setSettings(defaultSettings);
      }
      const { data: staffData } = await supabase.from("staff_members").select("*").eq("user_id", user.id).order("created_at");
      if (staffData) setStaff(staffData.map(st => ({ ...st, permissions: (st.permissions as string[]) ?? [] })));
      const { data: storeData } = await supabase.from("stores").select("*").eq("user_id", user.id).order("created_at");
      if (storeData) setStores(storeData);
      const { data: profile } = await supabase.from("profiles").select("name, email").eq("id", user.id).maybeSingle();
      if (profile) setProfileForm(prev => ({ ...prev, name: profile.name, email: profile.email }));
    };
    load();
  }, [user, activeStore]);

  const saveSettings = async () => {
    if (!user || !activeStore) return;
    setLoading(true);
    const uid = effectiveUserId || user.id;
    const payload = {
      user_id: uid, store_id: activeStore.id, business_name: settings.business_name, business_email: settings.business_email,
      store_slug: settings.store_slug, shop_url: settings.shop_url, business_phone: settings.business_phone,
      logo_url: settings.logo_url, show_payment_in_pos: settings.show_payment_in_pos,
      default_currency: settings.default_currency, timezone: settings.timezone, tax_rate: settings.tax_rate,
      app_language: settings.app_language, payment_methods: cleanUserPaymentMethods(settings.payment_methods) as any,
      currencies: settings.currencies as any, updated_at: new Date().toISOString(),
    };
    if (settings.id) {
      const { error } = await supabase.from("business_settings").update(payload).eq("id", settings.id);
      if (error) { toast.error(error.message); setLoading(false); return; }
    } else {
      // Check if a record already exists for this user (unique constraint on user_id)
      const { data: existing } = await supabase.from("business_settings").select("id").eq("user_id", uid).maybeSingle();
      if (!existing) {
        // Also check by store_id
        const { data: storeExisting } = await supabase.from("business_settings").select("id").eq("store_id", activeStore.id).maybeSingle();
        if (storeExisting) {
          const { error } = await supabase.from("business_settings").update(payload).eq("id", storeExisting.id);
          if (error) { toast.error(error.message); setLoading(false); return; }
          setSettings(prev => ({ ...prev, id: storeExisting.id }));
        } else {
          const { data, error } = await supabase.from("business_settings").insert(payload).select().single();
          if (error) { toast.error(error.message); setLoading(false); return; }
          if (data) setSettings(prev => ({ ...prev, id: data.id }));
        }
      } else {
        // Update the existing record with the new store_id and settings
        const { error } = await supabase.from("business_settings").update(payload).eq("id", existing.id);
        if (error) { toast.error(error.message); setLoading(false); return; }
        setSettings(prev => ({ ...prev, id: existing.id }));
      }
    }
    setLoading(false);
    // Sync currency globally across all of the user's stores (single source of truth)
    const cur = (settings.default_currency || "USD").toUpperCase();
    if (cur === "BDT" || cur === "INR" || cur === "USD") {
      await setGlobalCurrency(cur as CurrencyCode);
    }
    toast.success(lang === "bn" ? "সেটিংস সেভ হয়েছে!" : lang === "hi" ? "सेटिंग्स सेव हो गई!" : "Settings saved!");
  };

  // ─── Payment Methods ───
  const addGateway = (gw: GatewayDef) => {
    if (settings.payment_methods.find(p => p.id === gw.id)) {
      toast.error("Already added");
      return;
    }
    setSettings(prev => ({
      ...prev,
      payment_methods: [...cleanUserPaymentMethods(prev.payment_methods), { id: gw.id, name: gw.name, enabled: true, config: {}, user_created: true }],
    }));
    setAddGatewayDialog(false);
    toast.success(`${gw.name} added!`);
  };

  const removeGateway = (id: string) => {
    setSettings(prev => ({ ...prev, payment_methods: cleanUserPaymentMethods(prev.payment_methods).filter(p => p.id !== id) }));
  };

  const toggleGateway = (id: string) => {
    setSettings(prev => ({
      ...prev,
      payment_methods: cleanUserPaymentMethods(prev.payment_methods).map(p => p.id === id ? { ...p, enabled: !p.enabled } : p),
    }));
  };

  const openConfig = (id: string) => {
    const gw = settings.payment_methods.find(p => p.id === id);
    const catalog = GATEWAY_CATALOG.find(g => g.id === id);
    const existingConfig = gw?.config ?? {};
    // Auto-populate default instruction if empty
    if (!existingConfig.instructions && catalog?.defaultInstruction) {
      existingConfig.instructions = catalog.defaultInstruction;
    }
    setConfigTemp(existingConfig);
    setConfigDialog(id);
  };

  const saveConfig = async () => {
    if (!configDialog) return;
    const updatedMethods = cleanUserPaymentMethods(settings.payment_methods).map(p => p.id === configDialog ? { ...p, config: configTemp, user_created: true } : p);
    setSettings(prev => ({ ...prev, payment_methods: updatedMethods }));
    setConfigDialog(null);
    
    // Auto-save to database immediately so Order Form & POS get the latest config
    if (user && activeStore) {
      const payload = { payment_methods: updatedMethods as any, updated_at: new Date().toISOString() };
      if (settings.id) {
        await supabase.from("business_settings").update(payload).eq("id", settings.id);
      } else {
        const { data } = await supabase.from("business_settings").insert({
          user_id: effectiveUserId!, store_id: activeStore.id, ...payload,
        }).select().single();
        if (data) setSettings(prev => ({ ...prev, id: data.id }));
      }
    }
    toast.success("Configuration saved & synced!");
  };

  const filteredGateways = GATEWAY_CATALOG.filter(gw => {
    const matchRegion = gatewayRegion === "all" || gw.region === gatewayRegion;
    const matchSearch = gw.name.toLowerCase().includes(gatewaySearch.toLowerCase());
    const notAdded = !settings.payment_methods.find(p => p.id === gw.id);
    return matchRegion && matchSearch && notAdded;
  });

  // ─── Staff ───
  const storeFilteredStaff = staff.filter(s => !activeStore || (s as any).store_id === activeStore.id || !(s as any).store_id);
  const PLAN_STAFF_LIMITS: Record<string, number> = { free: 1, pro: 3, business: 10 };
  const staffLimit = PLAN_STAFF_LIMITS[plan] ?? 1;
  const activeStaffCount = staff.filter(s => s.is_active).length;
  const canAddStaff = activeStaffCount < staffLimit;

  const applyRolePreset = (role: string, setter: (v: any) => void) => {
    const presets = ROLE_PRESETS[role] ?? [];
    setter((p: any) => ({ ...p, role, permissions: role === "custom" ? p.permissions : presets }));
  };

  const addStaffMember = async () => {
    if (!user) return;
    if (!staffValidation.validateAll(newStaff)) {
      toast.error(lang === "bn" ? "ফর্মে কিছু ভুল আছে" : "Please fix the errors below");
      return;
    }
    setStaffCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-staff-user", {
        body: {
          name: newStaff.name,
          email: newStaff.email,
          password: newStaff.password,
          phone: newStaff.phone,
          role: newStaff.role,
          permissions: newStaff.permissions,
          store_id: activeStore?.id ?? null,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.staff) {
        setStaff(prev => [...prev, { ...data.staff, permissions: (data.staff.permissions as string[]) ?? [] }]);
        setNewStaff({ name: "", email: "", phone: "", password: "", role: "staff", permissions: ROLE_PRESETS["staff"] });
        setStaffDialog(false);
        toast.success(lang === "bn" ? "স্টাফ যোগ হয়েছে! তারা এখন লগইন করতে পারবে।" : "Staff added! They can now login with their email & password.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create staff");
    }
    setStaffCreating(false);
  };

  const updateStaffMember = async () => {
    if (!editingStaff) return;
    const newPwd = (editingStaff as any).password as string | undefined;
    if (newPwd && newPwd.length > 0 && newPwd.length < 6) {
      toast.error(lang === "bn" ? "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে" : "Password must be at least 6 characters");
      return;
    }
    setStaffCreating(true);
    try {
      const { error: updErr } = await supabase.from("staff_members").update({
        name: editingStaff.name, email: editingStaff.email, phone: editingStaff.phone,
        role: editingStaff.role, permissions: editingStaff.permissions as any,
      }).eq("id", editingStaff.id);
      if (updErr) throw new Error(updErr.message);

      if (newPwd && newPwd.length >= 6) {
        const { data, error } = await supabase.functions.invoke("reset-staff-password", {
          body: { staff_id: editingStaff.id, new_password: newPwd },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
      }

      const { password: _pw, ...clean } = editingStaff as any;
      setStaff(prev => prev.map(s => s.id === editingStaff.id ? clean : s));
      setEditingStaff(null);
      toast.success(newPwd
        ? (lang === "bn" ? "স্টাফ এবং পাসওয়ার্ড আপডেট হয়েছে!" : "Staff and password updated!")
        : (lang === "bn" ? "স্টাফ আপডেট হয়েছে!" : "Staff updated!"));
    } catch (err: any) {
      toast.error(err.message || "Failed to update staff");
    }
    setStaffCreating(false);
  };

  const removeStaff = async (id: string) => {
    await supabase.from("staff_members").delete().eq("id", id);
    setStaff(prev => prev.filter(s => s.id !== id));
    toast.success("Staff removed");
  };
  const toggleStaffActive = async (id: string, v: boolean) => {
    await supabase.from("staff_members").update({ is_active: v }).eq("id", id);
    setStaff(prev => prev.map(s => s.id === id ? { ...s, is_active: v } : s));
  };

  // ─── Stores ───
  const PLAN_STORE_LIMITS: Record<string, number> = { free: 1, pro: 3, business: 10 };
  const storeLimit = PLAN_STORE_LIMITS[plan] ?? 1;
  const canCreateStore = stores.length < storeLimit;

  const addStore = async () => {
    if (!user) return;
    if (!storeValidation.validateAll(newStore)) {
      toast.error(lang === "bn" ? "ফর্মে কিছু ভুল আছে" : "Please fix the errors below");
      return;
    }
    if (!canCreateStore) {
      toast.error(lang === "bn" ? "স্টোর লিমিট পূর্ণ। আরো স্টোর যোগ করতে প্ল্যান আপগ্রেড করুন।" : "Store limit reached. Please upgrade your plan to add more stores.");
      navigate("/my-plan");
      return;
    }
    const { data, error } = await supabase.from("stores").insert({
      user_id: effectiveUserId!, name: newStore.name, address: newStore.address, phone: newStore.phone,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) { setStores(prev => [...prev, data]); setNewStore({ name: "", address: "", phone: "" }); setStoreDialog(false); toast.success("Store added!"); }
  };
  const removeStore = async (id: string) => {
    // Frontend safety: never let user delete their last store
    if (stores.length <= 1) {
      toast.error(
        plan === "free"
          ? (lang === "bn" ? "ফ্রি প্ল্যানে আপনার একমাত্র স্টোর ডিলিট করা যাবে না" : "Free plan users cannot delete their only store")
          : (lang === "bn" ? "কমপক্ষে ১টি স্টোর থাকা আবশ্যক" : "At least 1 store is required")
      );
      return;
    }
    if (deletingStoreId) return; // race-condition guard
    const target = stores.find(s => s.id === id);
    if (!target) return;
    if (!confirm(lang === "bn" ? `"${target.name}" ডিলিট করতে চান?` : `Delete "${target.name}"?`)) return;

    setDeletingStoreId(id);
    const { error } = await supabase.from("stores").delete().eq("id", id);
    setDeletingStoreId(null);
    if (error) {
      toast.error(error.message || (lang === "bn" ? "ডিলিট ব্যর্থ হয়েছে" : "Delete failed"));
      return;
    }
    setStores(prev => prev.filter(s => s.id !== id));
    toast.success(lang === "bn" ? "স্টোর ডিলিট হয়েছে" : "Store deleted");
  };
  const setDefaultStore = async (id: string) => {
    if (!user) return;
    await supabase.from("stores").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("stores").update({ is_default: true }).eq("id", id);
    setStores(prev => prev.map(s => ({ ...s, is_default: s.id === id })));
  };

  // ─── Profile ───
  const saveProfile = async () => {
    if (!user) return;
    if (!profileValidation.validateAll(profileForm)) {
      toast.error(lang === "bn" ? "ফর্মে কিছু ভুল আছে" : "Please fix the errors below");
      return;
    }
    await supabase.from("profiles").update({ name: profileForm.name }).eq("id", user.id);
    if (profileForm.newPassword) {
      const { error } = await supabase.auth.updateUser({ password: profileForm.newPassword });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Profile updated!");
    setProfileForm(prev => ({ ...prev, newPassword: "" }));
  };

  // ─── Language change ───
  const changeLanguage = (code: Lang) => {
    setSettings(prev => ({ ...prev, app_language: code }));
    setLang(code);
  };

  // ─── Currencies ───
  const updateCurrencyRate = (code: string, rate: number) => {
    setSettings(prev => ({ ...prev, currencies: prev.currencies.map(c => c.code === code ? { ...c, rate } : c) }));
  };
  const addCurrency = (code: string, symbol: string) => {
    if (settings.currencies.find(c => c.code === code)) return;
    setSettings(prev => ({ ...prev, currencies: [...prev.currencies, { code, symbol, rate: 1 }] }));
  };
  const removeCurrency = (code: string) => {
    if (code === settings.default_currency) { toast.error("Cannot remove default"); return; }
    setSettings(prev => ({ ...prev, currencies: prev.currencies.filter(c => c.code !== code) }));
  };

  // ─── Tab labels ───
  const TABS: Array<{ id: Tab; label: string; sublabel: string; icon: any }> = [
    { id: "general", label: t.general, sublabel: lang === "bn" ? "ব্যবসার তথ্য ও পছন্দ" : lang === "hi" ? "व्यवसाय जानकारी और प्राथमिकताएं" : "Business info & preferences", icon: SettingsIcon },
    { id: "payment", label: t.paymentMethods, sublabel: lang === "bn" ? "পেমেন্ট অপশন ম্যানেজ" : lang === "hi" ? "भुगतान विकल्प प्रबंधित करें" : "Manage payment options", icon: CreditCard },
    { id: "currencies", label: t.currencies, sublabel: lang === "bn" ? "মাল্টি-কারেন্সি সেটআপ" : lang === "hi" ? "मल्टी-मुद्रा सेटअप" : "Multi-currency setup", icon: DollarSign },
    { id: "language", label: t.language, sublabel: lang === "bn" ? "অ্যাপের ভাষা" : lang === "hi" ? "ऐप की भाषा" : "App language", icon: Languages },
    { id: "staff", label: t.staff, sublabel: lang === "bn" ? "টিম ও পারমিশন" : lang === "hi" ? "टीम और अनुमतियां" : "Team & permissions", icon: UsersRound },
    { id: "stores", label: t.stores, sublabel: lang === "bn" ? "মাল্টি-স্টোর ম্যানেজমেন্ট" : lang === "hi" ? "मल्टी-स्टोर प्रबंधन" : "Multi-store management", icon: Store },
    { id: "profile", label: t.profile, sublabel: lang === "bn" ? "অ্যাকাউন্ট ও সিকিউরিটি" : lang === "hi" ? "खाता और सुरक्षा" : "Account & security", icon: UserCircle },
    { id: "backup", label: lang === "bn" ? "ব্যাকআপ" : lang === "hi" ? "बैकअप" : "Backup", sublabel: lang === "bn" ? "ডেটা এক্সপোর্ট ও রিস্টোর" : lang === "hi" ? "डेटा निर्यात और पुनर्स्थापित" : "Export & restore data", icon: Download },
  ];

  // ─── RENDER TABS ───

  const renderGeneral = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><SettingsIcon className="h-5 w-5 text-primary" /></div>
        <div>
          <h2 className="font-bold text-lg">{t.businessSettings}</h2>
          <p className="text-sm text-muted-foreground">{lang === "bn" ? "আপনার স্টোরের তথ্য ও পছন্দ কনফিগার করুন" : lang === "hi" ? "अपने स्टोर का विवरण और प्राथमिकताएं कॉन्फ़िगर करें" : "Configure your store details and preferences"}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{lang === "bn" ? "ব্যবসার নাম" : lang === "hi" ? "व्यवसाय का नाम" : "Business Name"}</Label>
          <Input value={settings.business_name} onChange={e => { setSettings(p => ({ ...p, business_name: e.target.value })); generalValidation.clearField("business_name"); }} error={!!generalValidation.getError("business_name")} />
          {generalValidation.getError("business_name") && <p className="text-xs text-destructive animate-fade-in">{generalValidation.getError("business_name")}</p>}</div>
        <div className="space-y-1.5"><Label>{lang === "bn" ? "ব্যবসার ইমেইল" : lang === "hi" ? "व्यवसाय ईमेल" : "Business Email"}</Label>
          <Input value={settings.business_email} onChange={e => { setSettings(p => ({ ...p, business_email: e.target.value })); generalValidation.clearField("business_email"); }} type="email" error={!!generalValidation.getError("business_email")} />
          {generalValidation.getError("business_email") && <p className="text-xs text-destructive animate-fade-in">{generalValidation.getError("business_email")}</p>}</div>
      </div>
      <div className="space-y-1.5">
        <Label>Store URL (Slug)</Label>
        <div className="flex">
          <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground"><span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">evixpos.com/f/</span></span>
          <Input className="rounded-l-none" value={settings.store_slug} onChange={e => { setSettings(p => ({ ...p, store_slug: e.target.value })); generalValidation.clearField("store_slug"); }} error={!!generalValidation.getError("store_slug")} />
        </div>
        {generalValidation.getError("store_slug") && <p className="text-xs text-destructive animate-fade-in">{generalValidation.getError("store_slug")}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{lang === "bn" ? "শপ / ওয়েবসাইট URL" : "Shop / Website URL"}</Label>
          <Input value={settings.shop_url} onChange={e => { setSettings(p => ({ ...p, shop_url: e.target.value })); generalValidation.clearField("shop_url"); }} error={!!generalValidation.getError("shop_url")} />
          {generalValidation.getError("shop_url") && <p className="text-xs text-destructive animate-fade-in">{generalValidation.getError("shop_url")}</p>}</div>
        <div className="space-y-1.5"><Label>{lang === "bn" ? "ব্যবসার ফোন (WhatsApp)" : "Business Phone (WhatsApp)"}</Label>
          <Input value={settings.business_phone} onChange={e => { setSettings(p => ({ ...p, business_phone: e.target.value })); generalValidation.clearField("business_phone"); }} error={!!generalValidation.getError("business_phone")} />
          {generalValidation.getError("business_phone") && <p className="text-xs text-destructive animate-fade-in">{generalValidation.getError("business_phone")}</p>}</div>
      </div>
      {/* Logo Section */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          Logo
          {plan === "free" && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 font-semibold border-amber-300 text-amber-600">
              <Crown className="h-3 w-3" /> Pro
            </Badge>
          )}
        </Label>

        {/* Logo Preview */}
        {settings.logo_url && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
            <img src={settings.logo_url} alt="Store logo" className="h-12 max-w-[160px] object-contain rounded-md bg-white p-1 border" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{settings.logo_url}</p>
            </div>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 w-8 p-0" onClick={() => setSettings(p => ({ ...p, logo_url: "" }))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Upload Button (Pro/Business only) */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input placeholder="Paste logo URL" value={settings.logo_url} onChange={e => setSettings(p => ({ ...p, logo_url: e.target.value }))} />
          </div>
          {plan !== "free" ? (
            <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0" onClick={() => document.getElementById("logo-upload-input")?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0 opacity-50 cursor-not-allowed" disabled title="Upgrade to Pro to upload logos">
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
          )}
        </div>

        <input
          id="logo-upload-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !activeStore) return;
            if (file.size > 2 * 1024 * 1024) {
              toast.error("Logo must be under 2MB");
              return;
            }
            const ext = file.name.split(".").pop() || "png";
            const filePath = `${activeStore.id}/logo_${Date.now()}.${ext}`;
            toast.loading("Uploading logo...", { id: "logo-upload" });
            const { error } = await supabase.storage.from("store-logos").upload(filePath, file, { upsert: true });
            if (error) {
              toast.error("Upload failed: " + error.message, { id: "logo-upload" });
              return;
            }
            const { data: urlData } = supabase.storage.from("store-logos").getPublicUrl(filePath);
            setSettings(p => ({ ...p, logo_url: urlData.publicUrl }));
            toast.success("Logo uploaded!", { id: "logo-upload" });
            e.target.value = "";
          }}
        />

        {plan === "free" && (
          <p className="text-[11px] text-muted-foreground">
            💡 {lang === "bn" ? "লোগো আপলোড করতে Pro বা Business প্ল্যানে আপগ্রেড করুন। আপনি URL পেস্ট করতে পারেন।" : "Upgrade to Pro or Business plan to upload a logo. You can paste a logo URL instead."}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between p-4 rounded-xl border border-border">
        <div>
          <p className="font-medium text-sm">{lang === "bn" ? "POS এ পেমেন্ট পদ্ধতি দেখান" : "Show Payment Methods in POS"}</p>
          <p className="text-xs text-muted-foreground">{lang === "bn" ? "বন্ধ করলে POS টার্মিনালে পেমেন্ট সিলেকশন লুকানো হবে" : "If disabled, payment selection UI will be hidden in POS"}</p>
        </div>
        <Switch checked={settings.show_payment_in_pos} onCheckedChange={v => setSettings(p => ({ ...p, show_payment_in_pos: v }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{lang === "bn" ? "ডিফল্ট কারেন্সি" : "Default Currency"}</Label>
          <Select value={settings.default_currency} onValueChange={v => setSettings(p => ({ ...p, default_currency: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{settings.currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5"><Label>{lang === "bn" ? "টাইমজোন" : "Timezone"}</Label>
          <Select value={settings.timezone} onValueChange={v => setSettings(p => ({ ...p, timezone: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
          </Select></div>
      </div>
      <div className="space-y-1.5 max-w-xs">
        <Label>{lang === "bn" ? "ট্যাক্স রেট (%)" : "Tax Rate (%)"}</Label>
        <Input type="number" value={settings.tax_rate} onChange={e => setSettings(p => ({ ...p, tax_rate: parseFloat(e.target.value) || 0 }))} min={0} max={100} />
        <p className="text-xs text-muted-foreground">{lang === "bn" ? "POS বিক্রয়ে স্বয়ংক্রিয়ভাবে প্রয়োগ হবে। ০ দিলে ট্যাক্স নেই।" : "Applied automatically to POS sales. Set 0 for no tax."}</p>
      </div>
      <Button onClick={saveSettings} disabled={loading} className="gap-2"><Save className="h-4 w-4" /> {t.save}</Button>
    </div>
  );

  const renderPayment = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><CreditCard className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="font-bold text-lg">{t.paymentMethods}</h2>
            <p className="text-sm text-muted-foreground">{lang === "bn" ? "পেমেন্ট গেটওয়ে যোগ ও ম্যানেজ করুন" : "Add and manage payment gateways"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={saveSettings} disabled={loading} className="gap-1.5">
            <Save className="h-4 w-4" /> {lang === "bn" ? "সেভ করুন" : "Save"}
          </Button>
          <Dialog open={addGatewayDialog} onOpenChange={setAddGatewayDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> {lang === "bn" ? "গেটওয়ে যোগ করুন" : "Add Gateway"}</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader><DialogTitle>{lang === "bn" ? "পেমেন্ট গেটওয়ে যোগ করুন" : "Add Payment Gateway"}</DialogTitle></DialogHeader>
            <div className="flex gap-2 mt-2">
              {(["all", "bd", "in", "intl"] as const).map(r => (
                <Button key={r} size="sm" variant={gatewayRegion === r ? "default" : "outline"} onClick={() => setGatewayRegion(r)} className="text-xs rounded-full">
                  {r === "all" ? (lang === "bn" ? "সব" : "All") : REGION_LABELS[r]?.[lang]}
                </Button>
              ))}
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t.search} value={gatewaySearch} onChange={e => setGatewaySearch(e.target.value)} className="pl-9" />
            </div>
            <div className="overflow-y-auto flex-1 mt-3 space-y-1.5 pr-1">
              {(["bd", "in", "intl"] as const).map(region => {
                const items = filteredGateways.filter(g => g.region === region);
                if (items.length === 0) return null;
                return (
                  <div key={region}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mt-3 mb-2">{REGION_LABELS[region][lang]}</p>
                    {items.map(gw => {
                      const Icon = gw.icon;
                      return (
                        <button key={gw.id} onClick={() => addGateway(gw)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left">
                          <img src={getGatewayIcon(gw.id)} alt={gw.name} className="h-8 w-8 rounded-lg object-contain bg-white p-1 border" onError={(e) => { (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/6963/6963703.png"; }} />
                          <div className="flex-1"><p className="text-sm font-medium">{gw.name}</p><p className="text-xs text-muted-foreground">{gw.desc}</p></div>
                          <Plus className="h-4 w-4 text-primary" />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {filteredGateways.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">{lang === "bn" ? "কোনো গেটওয়ে পাওয়া যায়নি" : "No gateways found"}</p>}
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Active gateways */}
      {settings.payment_methods.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4 rounded-xl border border-dashed border-border bg-muted/30">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <CreditCard className="h-7 w-7 text-primary" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">
            {lang === "bn" ? "এখনো কোনো পেমেন্ট মেথড যোগ করা হয়নি" : "No payment methods added yet"}
          </p>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm">
            {lang === "bn" ? "আপনার প্রথম পেমেন্ট গেটওয়ে যোগ করে গ্রাহকদের থেকে পেমেন্ট গ্রহণ শুরু করুন।" : "Add your first payment gateway to start accepting payments from customers."}
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => setAddGatewayDialog(true)}>
            <Plus className="h-4 w-4" /> {lang === "bn" ? "গেটওয়ে যোগ করুন" : "Add Gateway"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
      {settings.payment_methods.map(pm => {
            const catalog = GATEWAY_CATALOG.find(g => g.id === pm.id);
            const region = catalog?.region ?? "intl";
            const iconUrl = getGatewayIcon(pm.id);
            const hasConfig = (catalog?.fields?.length ?? 0) > 0 || true; // all gateways can have personal/QR config
            return (
              <div key={pm.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${pm.enabled ? "border-primary/20 bg-primary/5" : "border-border"}`}>
                <div className="flex items-center gap-3">
                  <img src={iconUrl} alt={pm.name} className="h-9 w-9 rounded-lg object-contain bg-white p-1 border" onError={(e) => { (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/6963/6963703.png"; }} />
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">{pm.name}
                      <Badge variant="outline" className="text-[10px]">{REGION_LABELS[region]?.[lang]}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{catalog?.desc}</p>
                    {pm.config?.personal_number && <p className="text-[10px] text-muted-foreground">📱 {pm.config.personal_number}</p>}
                    {pm.config?.upi_id && <p className="text-[10px] text-muted-foreground">💳 UPI: {pm.config.upi_id}</p>}
                    {pm.config?.bank_name && <p className="text-[10px] text-muted-foreground">🏦 {pm.config.bank_name} - {pm.config.account_number || ""}</p>}
                    {pm.config?.paypal_email && <p className="text-[10px] text-muted-foreground">📧 {pm.config.paypal_email}</p>}
                    {pm.config?.wallet_address && <p className="text-[10px] text-muted-foreground">🔗 {pm.config.wallet_address?.substring(0, 20)}...</p>}
                    {pm.config?.qr_code_url && <p className="text-[10px] text-primary">📷 QR Code added</p>}
                    {pm.config?.instructions && <p className="text-[10px] text-primary">📝 Instructions set</p>}
                    {!pm.config?.personal_number && !pm.config?.upi_id && !pm.config?.bank_name && !pm.config?.qr_code_url && !pm.config?.instructions && !pm.config?.paypal_email && !pm.config?.wallet_address && Object.keys(pm.config || {}).length === 0 && (
                      <p className="text-[10px] text-amber-500">⚠️ {lang === "bn" ? "কনফিগ করুন" : "Not configured"}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => openConfig(pm.id)}>
                    {lang === "bn" ? "কনফিগ" : "Config"}
                  </Button>
                  <Switch checked={pm.enabled} onCheckedChange={() => toggleGateway(pm.id)} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeGateway(pm.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Config Dialog - Enhanced Long Form */}
      <Dialog open={!!configDialog} onOpenChange={() => setConfigDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {configDialog && <img src={getGatewayIcon(configDialog)} alt="" className="h-6 w-6 rounded object-contain" />}
              {lang === "bn" ? "গেটওয়ে কনফিগারেশন" : "Gateway Configuration"}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="personal" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="personal" className="text-xs gap-1"><UserIcon className="h-3 w-3" /> {lang === "bn" ? "ব্যক্তিগত" : "Personal"}</TabsTrigger>
              <TabsTrigger value="merchant" className="text-xs gap-1"><Key className="h-3 w-3" /> {lang === "bn" ? "মার্চেন্ট" : "Merchant"}</TabsTrigger>
              <TabsTrigger value="extra" className="text-xs gap-1"><QrCode className="h-3 w-3" /> {lang === "bn" ? "QR/নোট" : "QR/Notes"}</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="space-y-4 mt-4">
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "পার্সোনাল অ্যাকাউন্ট তথ্য দিন — কাস্টমার এটি দেখে পেমেন্ট পাঠাবে" : "Enter your personal account details — customers will see this to send payment"}</p>
              {(() => {
                const catalog = GATEWAY_CATALOG.find(g => g.id === configDialog);
                const personalFields = catalog?.personalFields || [
                  { key: "personal_number", label: lang === "bn" ? "অ্যাকাউন্ট নম্বর" : "Account Number", placeholder: "e.g. 01XXXXXXXXX" },
                ];
                return personalFields.map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    {field.key === "account_type" ? (
                      <Select value={configTemp[field.key] ?? "personal"} onValueChange={v => setConfigTemp(p => ({ ...p, [field.key]: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">{lang === "bn" ? "পার্সোনাল" : "Personal"}</SelectItem>
                          <SelectItem value="agent">{lang === "bn" ? "এজেন্ট" : "Agent"}</SelectItem>
                          <SelectItem value="merchant">{lang === "bn" ? "মার্চেন্ট" : "Merchant"}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={configTemp[field.key] ?? ""} onChange={e => setConfigTemp(p => ({ ...p, [field.key]: e.target.value }))} placeholder={field.placeholder} />
                    )}
                  </div>
                ));
              })()}
            </TabsContent>

            <TabsContent value="merchant" className="space-y-4 mt-4">
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "মার্চেন্ট API credentials দিন — অটোমেটিক পেমেন্ট ভেরিফিকেশনের জন্য" : "Enter merchant API credentials for automatic payment verification"}</p>
              {GATEWAY_CATALOG.find(g => g.id === configDialog)?.fields.map(field => (
                <div key={field} className="space-y-1.5">
                  <Label className="capitalize">{field.replace(/_/g, " ")}</Label>
                  <Input value={configTemp[field] ?? ""} onChange={e => setConfigTemp(p => ({ ...p, [field]: e.target.value }))} placeholder={`Enter ${field.replace(/_/g, " ")}`} />
                </div>
              ))}
              {(!GATEWAY_CATALOG.find(g => g.id === configDialog)?.fields?.length) && (
                <p className="text-sm text-muted-foreground text-center py-4">{lang === "bn" ? "এই গেটওয়ের জন্য কোনো API ফিল্ড নেই" : "No API fields for this gateway"}</p>
              )}
            </TabsContent>

            <TabsContent value="extra" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><QrCode className="h-3.5 w-3.5" /> {lang === "bn" ? "QR কোড URL" : "QR Code URL"}</Label>
                <Input value={configTemp.qr_code_url ?? ""} onChange={e => setConfigTemp(p => ({ ...p, qr_code_url: e.target.value }))} placeholder="https://... or upload URL" />
                {configTemp.qr_code_url && (
                  <img src={configTemp.qr_code_url} alt="QR Preview" className="w-32 h-32 rounded-lg border object-contain mx-auto mt-2" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {lang === "bn" ? "পেমেন্ট গাইড / নির্দেশনা" : "Payment Guide / Instructions"}</Label>
                <Textarea value={configTemp.instructions ?? ""} onChange={e => setConfigTemp(p => ({ ...p, instructions: e.target.value }))} placeholder={lang === "bn" ? "কাস্টমারকে কী করতে হবে সেই নির্দেশনা..." : "Instructions for customers on how to pay..."} rows={3} />
                {(() => {
                  const catalog = GATEWAY_CATALOG.find(g => g.id === configDialog);
                  if (catalog?.defaultInstruction && !configTemp.instructions) {
                    return (
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setConfigTemp(p => ({ ...p, instructions: catalog.defaultInstruction! }))}>
                        <MessageSquare className="h-3 w-3" /> {lang === "bn" ? "ডিফল্ট নির্দেশনা ব্যবহার করুন" : "Use default instruction"}
                      </Button>
                    );
                  }
                  return null;
                })()}
              </div>
            </TabsContent>
          </Tabs>
          <Button onClick={saveConfig} className="w-full gap-2 mt-4"><Save className="h-4 w-4" /> {t.save}</Button>
        </DialogContent>
      </Dialog>

    </div>
  );

  const renderCurrencies = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div>
          <div><h2 className="font-bold text-lg">{t.currencies}</h2><p className="text-sm text-muted-foreground">{lang === "bn" ? "এক্সচেঞ্জ রেট কনফিগার করুন" : "Configure exchange rates"}</p></div>
        </div>
        <Select onValueChange={v => { const [code, symbol] = v.split("|"); addCurrency(code, symbol); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t.add} /></SelectTrigger>
          <SelectContent>
            {[{ code: "BDT", symbol: "৳" }, { code: "USD", symbol: "$" }, { code: "INR", symbol: "₹" },
              { code: "EUR", symbol: "€" }, { code: "GBP", symbol: "£" }, { code: "AED", symbol: "د.إ" },
              { code: "SAR", symbol: "﷼" }, { code: "MYR", symbol: "RM" }, { code: "SGD", symbol: "S$" },
            ].filter(c => !settings.currencies.find(sc => sc.code === c.code)).map(c => (
              <SelectItem key={c.code} value={`${c.code}|${c.symbol}`}>{c.symbol} {c.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t.currencies}</TableHead><TableHead>Symbol</TableHead><TableHead>Rate</TableHead><TableHead className="w-[80px]">{t.actions}</TableHead></TableRow></TableHeader>
        <TableBody>
          {settings.currencies.map(c => (
            <TableRow key={c.code}><TableCell className="font-medium">{c.code}</TableCell><TableCell>{c.symbol}</TableCell>
              <TableCell><Input type="number" value={c.rate} onChange={e => updateCurrencyRate(c.code, parseFloat(e.target.value) || 0)} className="w-32" step="0.0001" /></TableCell>
              <TableCell>{c.code !== settings.default_currency && <Button variant="ghost" size="icon" onClick={() => removeCurrency(c.code)} className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button onClick={saveSettings} disabled={loading} className="gap-2"><Save className="h-4 w-4" /> {t.save}</Button>
    </div>
  );

  const renderLanguage = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Languages className="h-5 w-5 text-primary" /></div>
        <div><h2 className="font-bold text-lg">{t.language}</h2><p className="text-sm text-muted-foreground">{lang === "bn" ? "ভাষা পরিবর্তন করলে পুরো প্যানেল পরিবর্তন হবে" : lang === "hi" ? "भाषा बदलने से पूरा पैनल बदल जाएगा" : "Changing language will update the entire panel"}</p></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {LANGUAGES_LIST.map(l => (
          <div key={l.code} onClick={() => changeLanguage(l.code)}
            className={`flex flex-col items-center justify-center p-6 rounded-xl border cursor-pointer transition-all ${settings.app_language === l.code ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/30"}`}>
            <p className="text-2xl mb-2">{l.code === "en" ? "🇬🇧" : l.code === "bn" ? "🇧🇩" : "🇮🇳"}</p>
            <p className="font-semibold text-sm">{l.label}</p>
            <p className="text-xs text-muted-foreground">{l.native}</p>
            {settings.app_language === l.code && <Badge className="mt-2 bg-primary text-primary-foreground text-[10px]">{t.active}</Badge>}
          </div>
        ))}
      </div>
      <Button onClick={saveSettings} disabled={loading} className="gap-2"><Save className="h-4 w-4" /> {t.save}</Button>
    </div>
  );

  const renderPermissionsGrid = (perms: string[], onChange: (perms: string[]) => void) => {
    const allChecked = ALL_PERMISSIONS.every(p => perms.includes(p));
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-xs text-muted-foreground">
            {lang === "bn" ? "প্রতিটি মডিউলের জন্য অ্যাক্সেস নিয়ন্ত্রণ করুন" : "Toggle module-level access and granular permissions"}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => onChange(allChecked ? [] : [...ALL_PERMISSIONS])}>
              {allChecked
                ? (lang === "bn" ? "রিসেট" : "Reset")
                : (lang === "bn" ? "সব সিলেক্ট" : "Select All")}
            </Button>
          </div>
        </div>
        {PERMISSION_MODULES.map(mod => {
          const moduleAllChecked = mod.perms.every(p => perms.includes(p));
          const moduleSomeChecked = mod.perms.some(p => perms.includes(p));
          return (
            <div key={mod.module} className="rounded-lg border border-border bg-card overflow-hidden">
              <label className="flex items-center justify-between gap-2 cursor-pointer px-3 py-2 bg-muted/40 border-b border-border">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={moduleAllChecked}
                    ref={el => { if (el) el.indeterminate = moduleSomeChecked && !moduleAllChecked; }}
                    onChange={() => {
                      if (moduleAllChecked) onChange(perms.filter(p => !mod.perms.includes(p)));
                      else onChange([...perms, ...mod.perms.filter(p => !perms.includes(p))]);
                    }} className="rounded accent-primary" />
                  <span className="text-sm font-semibold">{mod.module}</span>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {mod.perms.filter(p => perms.includes(p)).length}/{mod.perms.length}
                </span>
              </label>
              {mod.perms.length > 1 && (
                <div className="grid grid-cols-2 gap-1 p-3">
                  {mod.perms.map(perm => (
                    <label key={perm} className="flex items-center gap-2 text-xs cursor-pointer py-1 px-2 rounded hover:bg-muted/40">
                      <input type="checkbox" checked={perms.includes(perm)}
                        onChange={() => onChange(perms.includes(perm) ? perms.filter(pp => pp !== perm) : [...perms, perm])}
                        className="rounded accent-primary" />
                      <span className="capitalize">{perm.split(".")[1]}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStaffForm = (data: { name: string; email: string; phone: string; password?: string; role: string; permissions: string[] }, setter: (v: any) => void, onSubmit: () => void, submitLabel: string, isNew = false) => (
    <div className="space-y-4 mt-2">
      <div className="space-y-1.5"><Label>{t.name}</Label>
        <Input value={data.name} onChange={e => { setter((p: any) => ({ ...p, name: e.target.value })); if (isNew) staffValidation.clearField("name"); }} error={isNew && !!staffValidation.getError("name")} />
        {isNew && staffValidation.getError("name") && <p className="text-xs text-destructive animate-fade-in">{staffValidation.getError("name")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>{t.email}</Label>
          <Input value={data.email} onChange={e => { setter((p: any) => ({ ...p, email: e.target.value })); if (isNew) staffValidation.clearField("email"); }} type="email" disabled={!isNew} error={isNew && !!staffValidation.getError("email")} />
          {isNew && staffValidation.getError("email") && <p className="text-xs text-destructive animate-fade-in">{staffValidation.getError("email")}</p>}
        </div>
        <div className="space-y-1.5"><Label>{t.phone}</Label>
          <Input value={data.phone} onChange={e => { setter((p: any) => ({ ...p, phone: e.target.value })); if (isNew) staffValidation.clearField("phone"); }} error={isNew && !!staffValidation.getError("phone")} />
          {isNew && staffValidation.getError("phone") && <p className="text-xs text-destructive animate-fade-in">{staffValidation.getError("phone")}</p>}
        </div>
      </div>
      {isNew ? (
        <div className="space-y-1.5">
          <Label>{lang === "bn" ? "পাসওয়ার্ড" : "Password"}</Label>
          <div className="relative">
            <Input type={showPassword ? "text" : "password"} value={data.password || ""} onChange={e => { setter((p: any) => ({ ...p, password: e.target.value })); staffValidation.clearField("password"); }} placeholder={lang === "bn" ? "কমপক্ষে ৬ অক্ষর" : "Min 6 characters"} error={!!staffValidation.getError("password")} />
            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" type="button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {staffValidation.getError("password") && <p className="text-xs text-destructive animate-fade-in">{staffValidation.getError("password")}</p>}
          <p className="text-xs text-muted-foreground">{lang === "bn" ? "স্টাফ এই ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করবে" : "Staff will use this email & password to login"}</p>
        </div>
      ) : (
        <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
          <Label className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            {lang === "bn" ? "পাসওয়ার্ড রিসেট (ঐচ্ছিক)" : "Reset Password (Optional)"}
          </Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={data.password || ""}
              onChange={e => setter((p: any) => ({ ...p, password: e.target.value }))}
              placeholder={lang === "bn" ? "নতুন পাসওয়ার্ড সেট করুন (কমপক্ষে ৬ অক্ষর)" : "Set new password (min 6 characters)"}
            />
            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" type="button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {lang === "bn"
              ? "নিরাপত্তার কারণে বর্তমান পাসওয়ার্ড দেখানো হয় না। নতুন পাসওয়ার্ড দিলে সেভ করার সাথে সাথেই আপডেট হবে।"
              : "For security, the current password is hidden. Enter a new one to override it on save."}
          </p>
        </div>
      )}
      <div className="space-y-1.5"><Label>Role</Label>
        <Select value={data.role} onValueChange={v => applyRolePreset(v, setter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin — Full access</SelectItem>
            <SelectItem value="manager">Manager — Operations & reports</SelectItem>
            <SelectItem value="staff">Staff — POS & basic access</SelectItem>
            <SelectItem value="custom">Custom — Select manually</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {activeStore && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          <Store className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{lang === "bn" ? "এই স্টাফ যুক্ত হবে:" : "Assigned to:"}</span>
          <Badge variant="outline" className="text-xs">{activeStore.name}</Badge>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>{lang === "bn" ? "পারমিশন" : "Permissions"}</Label>
        <div className="max-h-72 overflow-y-auto pr-1">
          {renderPermissionsGrid(data.permissions, (newPerms) => setter((p: any) => ({ ...p, permissions: newPerms })))}
        </div>
      </div>
      <Button onClick={onSubmit} className="w-full" disabled={staffCreating}>
        {staffCreating ? (lang === "bn" ? "সেভ হচ্ছে..." : "Saving...") : submitLabel}
      </Button>
    </div>
  );

  const renderStaff = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><UsersRound className="h-5 w-5 text-primary" /></div>
          <div><h2 className="font-bold text-lg">{t.staff}</h2><p className="text-sm text-muted-foreground">{lang === "bn" ? "টিম ও তাদের পারমিশন ম্যানেজ করুন" : "Manage your team and permissions"}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={canAddStaff ? "secondary" : "destructive"} className="gap-1">
            <UsersRound className="h-3 w-3" />
            {activeStaffCount}/{staffLimit} {lang === "bn" ? "ব্যবহৃত" : "used"} · {(plan ?? "free").toUpperCase()}
          </Badge>
          {canAddStaff ? (
            <Dialog open={staffDialog} onOpenChange={setStaffDialog}>
              <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> {t.add} {t.staff}</Button></DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{t.add} {t.staff}</DialogTitle></DialogHeader>
                {renderStaffForm(newStaff, setNewStaff, addStaffMember, t.add, true)}
              </DialogContent>
            </Dialog>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                toast.error(
                  lang === "bn"
                    ? `${(plan ?? "free").toUpperCase()} প্ল্যানে সর্বোচ্চ ${staffLimit} জন স্টাফ। আপগ্রেড করুন।`
                    : `${(plan ?? "free").toUpperCase()} plan allows up to ${staffLimit} staff. Upgrade to add more.`
                );
                navigate("/my-plan");
              }}
            >
              <Crown className="h-4 w-4" /> {lang === "bn" ? "আপগ্রেড করুন" : "Upgrade to add"}
            </Button>
          )}
        </div>
      </div>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editingStaff} onOpenChange={v => !v && setEditingStaff(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{lang === "bn" ? "স্টাফ এডিট" : "Edit Staff"}</DialogTitle></DialogHeader>
          {editingStaff && renderStaffForm(editingStaff, setEditingStaff, updateStaffMember, t.save)}
        </DialogContent>
      </Dialog>

      {activeStore && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Store className="h-3.5 w-3.5" />
          {lang === "bn" ? "দেখাচ্ছে:" : "Showing:"} <Badge variant="outline" className="text-[10px]">{activeStore.name}</Badge>
          <span>({storeFilteredStaff.length} {lang === "bn" ? "জন" : "members"})</span>
        </div>
      )}

      {storeFilteredStaff.length === 0 ? (
        <div className="text-center py-12"><UsersRound className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground text-sm">{lang === "bn" ? "এই স্টোরে কোনো স্টাফ নেই" : "No staff members in this store"}</p></div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>{t.name}</TableHead><TableHead>{t.email}</TableHead><TableHead>Role</TableHead><TableHead>{t.status}</TableHead><TableHead>{t.actions}</TableHead></TableRow></TableHeader>
          <TableBody>
            {storeFilteredStaff.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{s.email}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs capitalize">{s.role}</Badge></TableCell>
                <TableCell><Switch checked={s.is_active} onCheckedChange={v => toggleStaffActive(s.id, v)} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingStaff(s)}>
                      <SettingsIcon className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeStaff(s.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );

  const renderStores = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Store className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="font-bold text-lg">{t.stores}</h2>
            <p className="text-sm text-muted-foreground">{lang === "bn" ? "আপনার স্টোরের লোকেশন ম্যানেজ করুন" : "Manage store locations"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {stores.length} / {storeLimit} {lang === "bn" ? "স্টোর ব্যবহৃত" : "stores used"}
          </Badge>
          {canCreateStore ? (
            <Dialog open={storeDialog} onOpenChange={setStoreDialog}>
              <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> {t.add} {t.stores}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t.add} Store</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-1.5"><Label>{t.name}</Label>
                    <Input value={newStore.name} onChange={e => { setNewStore(p => ({ ...p, name: e.target.value })); storeValidation.clearField("name"); }} error={!!storeValidation.getError("name")} />
                    {storeValidation.getError("name") && <p className="text-xs text-destructive animate-fade-in">{storeValidation.getError("name")}</p>}
                  </div>
                  <div className="space-y-1.5"><Label>{t.address}</Label>
                    <Input value={newStore.address} onChange={e => { setNewStore(p => ({ ...p, address: e.target.value })); storeValidation.clearField("address"); }} error={!!storeValidation.getError("address")} />
                    {storeValidation.getError("address") && <p className="text-xs text-destructive animate-fade-in">{storeValidation.getError("address")}</p>}
                  </div>
                  <div className="space-y-1.5"><Label>{t.phone}</Label>
                    <Input value={newStore.phone} onChange={e => { setNewStore(p => ({ ...p, phone: e.target.value })); storeValidation.clearField("phone"); }} error={!!storeValidation.getError("phone")} />
                    {storeValidation.getError("phone") && <p className="text-xs text-destructive animate-fade-in">{storeValidation.getError("phone")}</p>}
                  </div>
                  <Button onClick={addStore} className="w-full">{t.add}</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-orange-600 border-orange-300" onClick={() => navigate("/my-plan")}>
              <Crown className="h-4 w-4" /> {lang === "bn" ? "আপগ্রেড করুন" : "Upgrade Plan"}
            </Button>
          )}
        </div>
      </div>
      {!canCreateStore && (
        <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {lang === "bn"
            ? `স্টোর লিমিট পূর্ণ। আপনার ${plan} প্ল্যানে সর্বোচ্চ ${storeLimit}টি স্টোর অনুমোদিত। আরো স্টোর যোগ করতে প্ল্যান আপগ্রেড করুন।`
            : `Store limit reached. Your ${plan} plan allows up to ${storeLimit} store(s). Upgrade to add more.`}
        </div>
      )}
      {stores.length === 0 ? (
        <div className="text-center py-12"><Store className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground text-sm">{lang === "bn" ? "কোনো স্টোর নেই" : "No stores"}</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stores.map(s => {
            const modeLabel = s.store_mode === "offline" ? "Offline" : "Online";
            const modeColor = s.store_mode === "offline" ? "bg-orange-500/10 text-orange-600 border-orange-500/30" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
            return (
            <Card key={s.id} className={`border-border/50 ${s.is_default ? "ring-2 ring-primary" : ""}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                      {s.name}
                      {s.is_default && <Badge className="bg-primary text-primary-foreground text-[10px]">Default</Badge>}
                      <Badge variant="outline" className={`text-[10px] ${modeColor}`}>{modeLabel}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{s.address || "—"}</p>
                    <p className="text-xs text-muted-foreground">{s.phone || "—"}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      variant="ghost" size="sm" className="text-xs"
                      onClick={async () => {
                        const newMode = s.store_mode === "online" ? "offline" : "online";
                        const confirmed = confirm(
                          `⚠️ Switch "${s.name}" to ${newMode.toUpperCase()} mode?\n\n` +
                          (newMode === "offline"
                            ? "Online-only features (WooCommerce, Bot Automation, Order Forms, Subscriptions, Ad Costs) will be hidden for this store."
                            : "All online features will become available for this store.") +
                          "\n\nYour data will NOT be deleted."
                        );
                        if (!confirmed) return;
                        const { error } = await supabase.from("stores").update({ store_mode: newMode }).eq("id", s.id);
                        if (error) { toast.error(error.message); return; }
                        setStores(prev => prev.map(st => st.id === s.id ? { ...st, store_mode: newMode } : st));
                        toast.success(`Store switched to ${newMode} mode`);
                      }}
                    >
                      {s.store_mode === "online" ? "→ Offline" : "→ Online"}
                    </Button>
                    {!s.is_default && <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDefaultStore(s.id)}>Set Default</Button>}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeStore(s.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><UserCircle className="h-5 w-5 text-primary" /></div>
        <div><h2 className="font-bold text-lg">{t.profile}</h2><p className="text-sm text-muted-foreground">{lang === "bn" ? "অ্যাকাউন্ট সেটিংস ম্যানেজ করুন" : "Manage your account"}</p></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{lang === "bn" ? "পুরো নাম" : "Full Name"}</Label><Input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>{t.email}</Label><Input value={profileForm.email} disabled className="bg-muted/50" /><p className="text-xs text-muted-foreground">{lang === "bn" ? "ইমেইল পরিবর্তন করা যায় না" : "Email cannot be changed here"}</p></div>
      </div>
      <div className="border-t border-border pt-6">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Shield className="h-4 w-4" /> {lang === "bn" ? "পাসওয়ার্ড পরিবর্তন" : "Change Password"}</h3>
        <div className="max-w-sm space-y-1.5">
          <Label>{lang === "bn" ? "নতুন পাসওয়ার্ড" : "New Password"}</Label>
          <div className="relative">
            <Input type={showPassword ? "text" : "password"} value={profileForm.newPassword} onChange={e => setProfileForm(p => ({ ...p, newPassword: e.target.value }))} placeholder={lang === "bn" ? "নতুন পাসওয়ার্ড দিন" : "Enter new password"} />
            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-6">
        <h3 className="font-semibold text-sm mb-2">{lang === "bn" ? "অ্যাকাউন্ট তথ্য" : "Account Info"}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><code className="text-xs bg-muted px-2 py-0.5 rounded">{user?.id?.slice(0, 12)}...</code></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{lang === "bn" ? "যোগদান" : "Joined"}</span><span>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</span></div>
        </div>
      </div>
      <Button onClick={saveProfile} className="gap-2"><Save className="h-4 w-4" /> {t.save} {t.profile}</Button>
    </div>
  );

  // ─── Backup & Restore (hooks already at top) ───

  const exportBackup = async () => {
    if (!user || !activeStore) return;
    setBackupLoading(true);
    try {
      const tableNames = ["products", "customers", "orders", "order_items", "transactions", "subscriptions", "coupons", "order_forms", "tasks", "ad_costs", "bot_automations", "staff_members", "business_settings"];
      const backup: Record<string, any> = { meta: { exported_at: new Date().toISOString(), store_id: activeStore.id, version: 1 } };
      for (const table of tableNames) {
        const { data } = await (supabase.from(table as any).select("*") as any).eq("user_id", user.id);
        backup[table] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evixpos-backup-${activeStore.name || "store"}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(lang === "bn" ? "ব্যাকআপ ডাউনলোড হয়েছে!" : "Backup downloaded!");
    } catch (err) {
      toast.error(lang === "bn" ? "ব্যাকআপ ব্যর্থ হয়েছে" : "Backup failed");
    }
    setBackupLoading(false);
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeStore) return;
    setRestoreLoading(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.meta?.version) throw new Error("Invalid backup file");

      // Restore tables in order (respecting FK constraints)
      const restoreOrder = ["customers", "products", "coupons", "order_forms", "orders", "order_items", "transactions", "subscriptions", "tasks", "ad_costs", "bot_automations", "staff_members", "business_settings"];

      for (const table of restoreOrder) {
        const rows = backup[table];
        if (!rows?.length) continue;
        for (const row of rows) {
          await (supabase.from(table as any) as any).upsert(row, { onConflict: "id" });
        }
      }
      toast.success(lang === "bn" ? "রিস্টোর সফল হয়েছে! পেজ রিলোড হচ্ছে..." : "Restore successful! Reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(lang === "bn" ? "রিস্টোর ব্যর্থ: " + (err?.message || "") : "Restore failed: " + (err?.message || ""));
    }
    setRestoreLoading(false);
    e.target.value = "";
  };

  const renderBackup = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Download className="h-5 w-5 text-primary" /></div>
        <div>
          <h2 className="font-bold text-lg">{lang === "bn" ? "ব্যাকআপ ও রিস্টোর" : "Backup & Restore"}</h2>
          <p className="text-sm text-muted-foreground">{lang === "bn" ? "আপনার সম্পূর্ণ স্টোর ডেটা এক্সপোর্ট বা ইমপোর্ট করুন" : "Export or import your complete store data"}</p>
        </div>
      </div>

      {/* Export Section */}
      <div className="p-5 rounded-xl border border-border space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><FileDown className="h-4 w-4 text-primary" /></div>
          <div>
            <p className="font-semibold text-sm">{lang === "bn" ? "ডেটা এক্সপোর্ট" : "Export Data"}</p>
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "সব প্রোডাক্ট, অর্ডার, কাস্টমার, ট্রানজেকশন ডাউনলোড করুন JSON ফাইলে" : "Download all products, orders, customers, transactions as JSON"}</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-1 pl-12">
          <p>• {lang === "bn" ? "প্রোডাক্ট, কাস্টমার, অর্ডার, ট্রানজেকশন" : "Products, customers, orders, transactions"}</p>
          <p>• {lang === "bn" ? "সাবস্ক্রিপশন, কুপন, টাস্ক, অ্যাড কস্ট" : "Subscriptions, coupons, tasks, ad costs"}</p>
          <p>• {lang === "bn" ? "স্টাফ, বিজনেস সেটিংস, বট অটোমেশন" : "Staff, business settings, bot automations"}</p>
        </div>
        <Button onClick={exportBackup} disabled={backupLoading} className="gap-2 ml-12">
          <Download className="h-4 w-4" />
          {backupLoading ? (lang === "bn" ? "এক্সপোর্ট হচ্ছে..." : "Exporting...") : (lang === "bn" ? "ব্যাকআপ ডাউনলোড" : "Download Backup")}
        </Button>
      </div>

      {/* Import Section */}
      <div className="p-5 rounded-xl border border-border space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center"><FileUp className="h-4 w-4 text-accent-foreground" /></div>
          <div>
            <p className="font-semibold text-sm">{lang === "bn" ? "ডেটা রিস্টোর" : "Restore Data"}</p>
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "আগের ব্যাকআপ ফাইল থেকে ডেটা পুনরুদ্ধার করুন" : "Restore data from a previous backup file"}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 ml-12">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{lang === "bn" ? "সতর্কতা: রিস্টোর করলে বিদ্যমান ডেটা ওভাররাইট হতে পারে। আগে ব্যাকআপ নিন।" : "Warning: Restoring may overwrite existing data. Take a backup first."}</p>
        </div>
        <div className="ml-12">
          <label htmlFor="restore-file">
            <Button variant="outline" className="gap-2 cursor-pointer" disabled={restoreLoading} asChild>
              <span>
                <Upload className="h-4 w-4" />
                {restoreLoading ? (lang === "bn" ? "রিস্টোর হচ্ছে..." : "Restoring...") : (lang === "bn" ? "ব্যাকআপ ফাইল আপলোড" : "Upload Backup File")}
              </span>
            </Button>
          </label>
          <input id="restore-file" type="file" accept=".json" className="hidden" onChange={handleRestore} />
        </div>
      </div>
    </div>
  );

  const tabContent: Record<Tab, () => JSX.Element> = {
    general: renderGeneral, payment: renderPayment, currencies: renderCurrencies,
    language: renderLanguage, staff: renderStaff, stores: renderStores, profile: renderProfile,
    backup: renderBackup,
  };

  // ─── Guide content per tab ───
  const GUIDES: Record<Tab, { title: string; tip: string; steps: { title: string; desc: string }[] }> = {
    general: {
      title: lang === "bn" ? "জেনারেল সেটিংস গাইড" : "General Settings Guide",
      tip: lang === "bn" ? "সঠিক ব্যবসার তথ্য রিসিট, ইনভয়েস ও কাস্টমার কমিউনিকেশনে দেখানো হবে।" : "Accurate business info appears on receipts, invoices, and customer comms.",
      steps: [
        { title: lang === "bn" ? "ব্যবসার নাম ও ইমেইল" : "Business name & email", desc: lang === "bn" ? "এটি ইনভয়েস এবং রিসিটে দেখানো হবে।" : "Shown on invoices and receipts." },
        { title: lang === "bn" ? "Store Slug" : "Store slug", desc: lang === "bn" ? "পাবলিক অর্ডার ফর্ম URL এর জন্য ইউনিক হ্যান্ডেল।" : "Unique handle for your public order form URL." },
        { title: lang === "bn" ? "লোগো আপলোড" : "Logo upload", desc: lang === "bn" ? "Pro/Business প্ল্যানে আপলোড করুন, অথবা URL পেস্ট করুন।" : "Upload on Pro/Business or paste a URL." },
        { title: lang === "bn" ? "কারেন্সি ও ট্যাক্স" : "Currency & tax", desc: lang === "bn" ? "POS-এ অটো-অ্যাপ্লাই হবে।" : "Auto-applied across POS and orders." },
      ],
    },
    payment: {
      title: lang === "bn" ? "পেমেন্ট গেটওয়ে গাইড" : "Payment Gateway Guide",
      tip: lang === "bn" ? "Personal ট্যাবে নম্বর/UPI দিন — কাস্টমার সেটি দেখবে। Merchant ট্যাব অটোমেটিক ভেরিফিকেশনের জন্য।" : "Use Personal tab for numbers customers see. Merchant tab is for auto-verification.",
      steps: [
        { title: lang === "bn" ? "গেটওয়ে যোগ করুন" : "Add a gateway", desc: lang === "bn" ? "অঞ্চল অনুযায়ী bKash, UPI, Stripe ইত্যাদি বেছে নিন।" : "Pick by region: bKash, UPI, Stripe, etc." },
        { title: lang === "bn" ? "Personal কনফিগ" : "Personal config", desc: lang === "bn" ? "নম্বর / UPI ID / ব্যাংক বিস্তারিত যোগ করুন।" : "Add number, UPI ID, or bank details." },
        { title: lang === "bn" ? "Merchant API" : "Merchant API", desc: lang === "bn" ? "অটো-ভেরিফিকেশনের জন্য API key দিন।" : "Add API keys for auto-verification." },
        { title: lang === "bn" ? "QR ও ইনস্ট্রাকশন" : "QR & instructions", desc: lang === "bn" ? "QR কোড ও পেমেন্ট নির্দেশনা সেট করুন।" : "Set a QR image and payment instructions." },
      ],
    },
    currencies: {
      title: lang === "bn" ? "মাল্টি-কারেন্সি গাইড" : "Multi-Currency Guide",
      tip: lang === "bn" ? "ডিফল্ট কারেন্সির রেট সবসময় 1 রাখুন।" : "Keep your default currency rate at 1.",
      steps: [
        { title: lang === "bn" ? "কারেন্সি যোগ করুন" : "Add currency", desc: lang === "bn" ? "কোড, সিম্বল ও কনভার্সন রেট দিন।" : "Provide code, symbol and conversion rate." },
        { title: lang === "bn" ? "ডিফল্ট সেট করুন" : "Set default", desc: lang === "bn" ? "জেনারেল ট্যাব থেকে ডিফল্ট কারেন্সি বেছে নিন।" : "Choose default currency from General tab." },
      ],
    },
    language: {
      title: lang === "bn" ? "ভাষা গাইড" : "Language Guide",
      tip: lang === "bn" ? "ভাষা পরিবর্তন তাৎক্ষণিক প্রযোজ্য হয়।" : "Language changes apply instantly across the app.",
      steps: [
        { title: lang === "bn" ? "ভাষা বেছে নিন" : "Pick a language", desc: "English / বাংলা / हिन्दी" },
      ],
    },
    staff: {
      title: lang === "bn" ? "স্টাফ ম্যানেজমেন্ট গাইড" : "Staff Management Guide",
      tip: lang === "bn" ? "Role প্রিসেট দিয়ে দ্রুত পারমিশন দিন, পরে কাস্টমাইজ করুন।" : "Use role presets for quick permissions, then customize.",
      steps: [
        { title: lang === "bn" ? "স্টাফ যোগ করুন" : "Add staff", desc: lang === "bn" ? "নাম, ইমেইল, পাসওয়ার্ড দিন।" : "Provide name, email, and password." },
        { title: lang === "bn" ? "Role বেছে নিন" : "Choose role", desc: "Admin / Manager / Staff / Viewer / Custom" },
        { title: lang === "bn" ? "পারমিশন কাস্টমাইজ" : "Customize permissions", desc: lang === "bn" ? "মডিউল-ভিত্তিক চেকবক্স থেকে।" : "Module-level checkboxes." },
      ],
    },
    stores: {
      title: lang === "bn" ? "মাল্টি-স্টোর গাইড" : "Multi-Store Guide",
      tip: lang === "bn" ? "প্রতিটি স্টোরের আলাদা ইনভেন্টরি, অর্ডার ও স্টাফ থাকে।" : "Each store has isolated inventory, orders, and staff.",
      steps: [
        { title: lang === "bn" ? "নতুন স্টোর তৈরি" : "Create store", desc: lang === "bn" ? "নাম, ঠিকানা, ফোন দিন।" : "Provide name, address, phone." },
        { title: lang === "bn" ? "ডিফল্ট স্টোর সেট" : "Set default", desc: lang === "bn" ? "লগইনে কোন স্টোর প্রথমে খুলবে।" : "Which store opens first on login." },
      ],
    },
    profile: {
      title: lang === "bn" ? "প্রোফাইল ও সিকিউরিটি গাইড" : "Profile & Security Guide",
      tip: lang === "bn" ? "শক্তিশালী পাসওয়ার্ড (১২+ অক্ষর) ব্যবহার করুন।" : "Use a strong password (12+ chars).",
      steps: [
        { title: lang === "bn" ? "নাম ও ইমেইল" : "Name & email", desc: lang === "bn" ? "অ্যাকাউন্ট তথ্য আপডেট করুন।" : "Keep your account info up to date." },
        { title: lang === "bn" ? "পাসওয়ার্ড পরিবর্তন" : "Change password", desc: lang === "bn" ? "নিয়মিত পাসওয়ার্ড আপডেট নিরাপত্তার জন্য জরুরি।" : "Rotate passwords regularly." },
      ],
    },
    backup: {
      title: lang === "bn" ? "ব্যাকআপ গাইড" : "Backup Guide",
      tip: lang === "bn" ? "মাসে কমপক্ষে একবার ব্যাকআপ ডাউনলোড করুন।" : "Download a backup at least once a month.",
      steps: [
        { title: lang === "bn" ? "এক্সপোর্ট" : "Export", desc: lang === "bn" ? "JSON ফাইলে সম্পূর্ণ ডেটা ডাউনলোড।" : "Download all data as JSON." },
        { title: lang === "bn" ? "রিস্টোর" : "Restore", desc: lang === "bn" ? "সাবধান — বিদ্যমান ডেটা ওভাররাইট হতে পারে।" : "Caution — may overwrite existing data." },
      ],
    },
  };

  const q = tabSearch.trim().toLowerCase();
  const filteredTabs = q
    ? TABS.filter(tab => tab.label.toLowerCase().includes(q) || tab.sublabel.toLowerCase().includes(q))
    : TABS;
  const activeMeta = TABS.find(tab => tab.id === activeTab);
  const guide = GUIDES[activeTab];

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6 pb-8">
        {/* Premium gradient header */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                <SettingsIcon className="h-6 w-6 sm:h-7 sm:w-7 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t.settings}</h1>
                  <Badge variant="outline" className="gap-1 text-[10px] font-semibold border-primary/30 text-primary bg-primary/5">
                    <Sparkles className="h-3 w-3" /> {plan === "free" ? "FREE" : (plan?.toUpperCase() || "")}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                  {lang === "bn" ? "আপনার স্টোর, পেমেন্ট, টিম ও সিকিউরিটি কনফিগার করুন" : "Configure your store, payments, team and security"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setGuideOpen(g => !g)} className="gap-1.5">
                <BookOpen className="h-4 w-4" /> {lang === "bn" ? "গাইড" : "Guide"}
              </Button>
              <Button size="sm" onClick={saveSettings} disabled={loading} className="gap-1.5 shadow-sm">
                <Save className="h-4 w-4" /> {t.save}
              </Button>
            </div>
          </div>

          {/* Quick stats strip */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5">
            {[
              { icon: CheckCircle2, label: lang === "bn" ? "অ্যাক্টিভ গেটওয়ে" : "Active gateways", value: settings.payment_methods.filter(p => p.enabled).length, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { icon: UsersRound, label: lang === "bn" ? "টিম মেম্বার" : "Team members", value: staff.length, color: "text-blue-500", bg: "bg-blue-500/10" },
              { icon: Store, label: lang === "bn" ? "স্টোর" : "Stores", value: stores.length, color: "text-purple-500", bg: "bg-purple-500/10" },
              { icon: DollarSign, label: lang === "bn" ? "কারেন্সি" : "Currencies", value: settings.currencies.length, color: "text-amber-500", bg: "bg-amber-500/10" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl bg-background/60 backdrop-blur-sm border border-border/40 px-3 py-2.5">
                <div className={`h-8 w-8 rounded-lg ${s.bg} ${s.color} flex items-center justify-center shrink-0`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate">{s.label}</p>
                  <p className="text-base font-bold leading-tight tabular-nums">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collapsible guide panel */}
        {guideOpen && guide && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent animate-in fade-in slide-in-from-top-2 duration-300">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Lightbulb className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{guide.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{guide.tip}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setGuideOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {guide.steps.map((step, i) => (
                  <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-background/70 border border-border/40">
                    <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{step.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile: horizontal scrollable tab bar */}
        <div className="lg:hidden overflow-x-auto scrollbar-hide -mx-3 px-3">
          <div className="flex gap-2 min-w-max pb-2">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 lg:gap-6">
          {/* Premium desktop sidebar */}
          <div className="hidden lg:block">
            <Card className="border-border/50 sticky top-4">
              <CardContent className="p-3 space-y-3">
                <div className="px-1 pt-1 pb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "bn" ? "সেটিংস মেনু" : lang === "hi" ? "सेटिंग्स मेनू" : "Settings Menu"}
                  </p>
                </div>
                <div className="space-y-1">
                  {filteredTabs.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-all group ${active ? "bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/20 shadow-sm" : "hover:bg-muted/50 border border-transparent"}`}>
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground group-hover:bg-muted"}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${active ? "text-foreground" : "text-foreground/80"}`}>{tab.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{tab.sublabel}</p>
                        </div>
                        {active && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredTabs.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      {lang === "bn" ? "কোনো সেটিংস পাওয়া যায়নি" : "No settings found"}
                    </p>
                  )}
                </div>

                {plan === "free" && (
                  <button onClick={() => navigate("/myplan")} className="w-full group">
                    <div className="rounded-xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-500/20 p-3 text-left hover:border-amber-500/40 transition-all">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
                          <Crown className="h-3.5 w-3.5 text-white" />
                        </div>
                        <p className="text-xs font-bold">{lang === "bn" ? "Pro তে আপগ্রেড" : "Upgrade to Pro"}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {lang === "bn" ? "লোগো আপলোড, এডভান্সড ফিচার ও বেশি স্টোর আনলক করুন।" : "Unlock logo upload, advanced features and more stores."}
                      </p>
                    </div>
                  </button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Content card with breadcrumb header */}
          <Card className="border-border/50 w-full max-w-4xl mx-auto lg:mx-0">
            {activeMeta && (
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border/40 bg-muted/20 rounded-t-2xl">
                <div className="flex items-center gap-2 text-xs min-w-0">
                  <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{t.settings}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  <span className="font-semibold text-foreground truncate">{activeMeta.label}</span>
                </div>
                {!guideOpen && (
                  <Button variant="ghost" size="sm" onClick={() => setGuideOpen(true)} className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary shrink-0">
                    <HelpCircle className="h-3.5 w-3.5" /> {lang === "bn" ? "সাহায্য" : "Help"}
                  </Button>
                )}
              </div>
            )}
            <CardContent className="p-4 sm:p-6">{tabContent[activeTab]()}</CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
