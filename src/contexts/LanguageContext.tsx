import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Lang = "en" | "bn" | "hi";

interface Translations {
  // Sidebar
  dashboard: string;
  posTerminal: string;
  orders: string;
  allOrders: string;
  createOrder: string;
  pendingOrders: string;
  productCatalog: string;
  products: string;
  orderForms: string;
  coupons: string;
  customers: string;
  subscriptions: string;
  finances: string;
  salesProfit: string;
  incomeExpense: string;
  dueBook: string;
  adCosts: string;
  taskMission: string;
  reports: string;
  integrations: string;
  notifications: string;
  woocommerce: string;
  botAutomation: string;
  whatsapp: string;
  googleSheets: string;
  referral: string;
  myPlan: string;
  support: string;
  settings: string;
  // Common
  save: string;
  cancel: string;
  add: string;
  delete: string;
  edit: string;
  search: string;
  actions: string;
  status: string;
  active: string;
  inactive: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  filter: string;
  export: string;
  import: string;
  loading: string;
  noResults: string;
  view: string;
  date: string;
  amount: string;
  total: string;
  quantity: string;
  price: string;
  category: string;
  description: string;
  notes: string;
  optional: string;
  required: string;
  yes: string;
  no: string;
  all: string;
  // Sections
  overview: string;
  salesProducts: string;
  crmBilling: string;
  performance: string;
  systemGrowth: string;
  supportSection: string;
  // Dashboard
  totalRevenue: string;
  totalOrders: string;
  activePlan: string;
  revenueOverview: string;
  recentOrders: string;
  welcomeBack: string;
  // Settings
  businessSettings: string;
  paymentMethods: string;
  currencies: string;
  language: string;
  staff: string;
  stores: string;
  profile: string;
  general: string;
  // Products page
  addProduct: string;
  productName: string;
  sku: string;
  baseCost: string;
  baseSelling: string;
  stockQuantity: string;
  searchProducts: string;
  sort: string;
  noProductsYet: string;
  noProductsMatch: string;
  variations: string;
  variationName: string;
  // Orders page
  orderId: string;
  customer: string;
  payment: string;
  method: string;
  source: string;
  searchOrders: string;
  allTime: string;
  allStatus: string;
  allPayments: string;
  noOrdersYet: string;
  product: string;
  selectCustomer: string;
  enterProductName: string;
  dateTime: string;
  amountPaid: string;
  costPrice: string;
  discount: string;
  type: string;
  paymentMethod: string;
  items: string;
  // POS page
  selectCustomerHeading: string;
  reviewCart: string;
  orderNotes: string;
  orderSummary: string;
  // Reports page
  reportsAnalytics: string;
  finance: string;
}

const translations: Record<Lang, Translations> = {
  en: {
    dashboard: "Dashboard", posTerminal: "POS Terminal", orders: "Orders", allOrders: "All Orders",
    createOrder: "Create Order", pendingOrders: "Pending Orders", productCatalog: "Product Catalog",
    products: "Products", orderForms: "Order Forms", coupons: "Coupons", customers: "Customers",
    subscriptions: "Subscriptions", finances: "Finances", salesProfit: "Sales & Profit",
    incomeExpense: "Income & Expense", dueBook: "Due Book", adCosts: "Ad Costs",
    taskMission: "Task & Mission", reports: "Reports", integrations: "Integrations",
    notifications: "Notifications", woocommerce: "WooCommerce", botAutomation: "Bot Automation",
    whatsapp: "WhatsApp", googleSheets: "Google Sheets", referral: "Referral", myPlan: "My Plan", support: "Support",
    settings: "Settings", save: "Save", cancel: "Cancel", add: "Add", delete: "Delete",
    edit: "Edit", search: "Search...", actions: "Actions", status: "Status", active: "Active",
    inactive: "Inactive", name: "Name", email: "Email", phone: "Phone", address: "Address",
    overview: "Overview", salesProducts: "Sales & Products", crmBilling: "CRM & Billing",
    performance: "Performance", systemGrowth: "System & Growth", supportSection: "Support",
    totalRevenue: "Total Revenue", totalOrders: "Total Orders", activePlan: "Active Plan",
    revenueOverview: "Revenue Overview", recentOrders: "Recent Orders",
    welcomeBack: "Welcome back — here's what's happening today.",
    businessSettings: "Business Settings", paymentMethods: "Payment Methods",
    currencies: "Currencies", language: "Language", staff: "Staff", stores: "Stores",
    profile: "Profile", general: "General",
    filter: "Filter", export: "Export", import: "Import", loading: "Loading...",
    noResults: "No results", view: "View", date: "Date", amount: "Amount",
    total: "Total", quantity: "Quantity", price: "Price", category: "Category",
    description: "Description", notes: "Notes", optional: "Optional", required: "Required",
    yes: "Yes", no: "No", all: "All",
    addProduct: "Add Product", productName: "Product Name", sku: "SKU",
    baseCost: "Base Cost", baseSelling: "Base Selling", stockQuantity: "Stock Quantity",
    searchProducts: "Search by name, SKU, or category...", sort: "Sort",
    noProductsYet: "No products yet", noProductsMatch: "No products match filters",
    variations: "Variations", variationName: "Variation name",
    orderId: "Order ID", customer: "Customer", payment: "Payment", method: "Method",
    source: "Source", searchOrders: "Search orders...", allTime: "All Time",
    allStatus: "All Status", allPayments: "All Payments", noOrdersYet: "No orders yet",
    product: "Product", selectCustomer: "Select customer",
    enterProductName: "Enter product name", dateTime: "Date & Time",
    amountPaid: "Amount Paid", costPrice: "Cost Price", discount: "Discount",
    type: "Type", paymentMethod: "Payment Method", items: "Items",
    selectCustomerHeading: "Select Customer", reviewCart: "Review Cart",
    orderNotes: "Order Notes", orderSummary: "Order Summary",
    reportsAnalytics: "Reports & Analytics", finance: "Finance",
  },
  bn: {
    dashboard: "ড্যাশবোর্ড", posTerminal: "POS টার্মিনাল", orders: "অর্ডার", allOrders: "সব অর্ডার",
    createOrder: "অর্ডার তৈরি", pendingOrders: "পেন্ডিং অর্ডার", productCatalog: "পণ্য ক্যাটালগ",
    products: "পণ্যসমূহ", orderForms: "অর্ডার ফর্ম", coupons: "কুপন", customers: "কাস্টমার",
    subscriptions: "সাবস্ক্রিপশন", finances: "ফাইন্যান্স", salesProfit: "বিক্রয় ও মুনাফা",
    incomeExpense: "আয় ও ব্যয়", dueBook: "বাকি বই", adCosts: "বিজ্ঞাপন খরচ",
    taskMission: "টাস্ক ও মিশন", reports: "রিপোর্ট", integrations: "ইন্টিগ্রেশন",
    notifications: "নোটিফিকেশন", woocommerce: "WooCommerce", botAutomation: "বট অটোমেশন",
    whatsapp: "হোয়াটসঅ্যাপ", googleSheets: "গুগল শীটস", referral: "রেফারেল", myPlan: "আমার প্ল্যান", support: "সাপোর্ট",
    settings: "সেটিংস", save: "সেভ করুন", cancel: "বাতিল", add: "যোগ করুন", delete: "মুছুন",
    edit: "সম্পাদনা", search: "সার্চ করুন...", actions: "অ্যাকশন", status: "স্ট্যাটাস",
    active: "সক্রিয়", inactive: "নিষ্ক্রিয়", name: "নাম", email: "ইমেইল", phone: "ফোন",
    address: "ঠিকানা", overview: "ওভারভিউ", salesProducts: "বিক্রয় ও পণ্য",
    crmBilling: "CRM ও বিলিং", performance: "পারফরম্যান্স", systemGrowth: "সিস্টেম ও গ্রোথ",
    supportSection: "সাপোর্ট", totalRevenue: "মোট আয়", totalOrders: "মোট অর্ডার",
    activePlan: "সক্রিয় প্ল্যান", revenueOverview: "আয়ের সারসংক্ষেপ",
    recentOrders: "সাম্প্রতিক অর্ডার",
    welcomeBack: "স্বাগতম — আজকের আপডেট এখানে দেখুন।",
    businessSettings: "ব্যবসার সেটিংস", paymentMethods: "পেমেন্ট পদ্ধতি",
    currencies: "মুদ্রা", language: "ভাষা", staff: "স্টাফ", stores: "স্টোর",
    profile: "প্রোফাইল", general: "সাধারণ",
    filter: "ফিল্টার", export: "এক্সপোর্ট", import: "ইম্পোর্ট", loading: "লোড হচ্ছে...",
    noResults: "কোনো ফলাফল নেই", view: "দেখুন", date: "তারিখ", amount: "পরিমাণ",
    total: "মোট", quantity: "পরিমাণ", price: "দাম", category: "ক্যাটাগরি",
    description: "বিবরণ", notes: "নোট", optional: "ঐচ্ছিক", required: "আবশ্যক",
    yes: "হ্যাঁ", no: "না", all: "সব",
    addProduct: "পণ্য যোগ করুন", productName: "পণ্যের নাম", sku: "SKU",
    baseCost: "ক্রয় মূল্য", baseSelling: "বিক্রয় মূল্য", stockQuantity: "স্টক পরিমাণ",
    searchProducts: "নাম, SKU বা ক্যাটাগরি দিয়ে খুঁজুন...", sort: "সাজান",
    noProductsYet: "কোনো পণ্য নেই", noProductsMatch: "কোনো পণ্য মিলেনি",
    variations: "ভ্যারিয়েশন", variationName: "ভ্যারিয়েশনের নাম",
    orderId: "অর্ডার আইডি", customer: "কাস্টমার", payment: "পেমেন্ট", method: "মাধ্যম",
    source: "উৎস", searchOrders: "অর্ডার খুঁজুন...", allTime: "সব সময়",
    allStatus: "সব স্ট্যাটাস", allPayments: "সব পেমেন্ট", noOrdersYet: "এখনো কোনো অর্ডার নেই",
    product: "পণ্য", selectCustomer: "কাস্টমার নির্বাচন করুন",
    enterProductName: "পণ্যের নাম লিখুন", dateTime: "তারিখ ও সময়",
    amountPaid: "প্রদত্ত পরিমাণ", costPrice: "ক্রয় মূল্য", discount: "ছাড়",
    type: "ধরন", paymentMethod: "পেমেন্ট পদ্ধতি", items: "আইটেম",
    selectCustomerHeading: "কাস্টমার নির্বাচন", reviewCart: "কার্ট পর্যালোচনা",
    orderNotes: "অর্ডার নোট", orderSummary: "অর্ডার সারসংক্ষেপ",
    reportsAnalytics: "রিপোর্ট ও অ্যানালিটিক্স", finance: "ফাইন্যান্স",
  },
  hi: {
    dashboard: "डैशबोर्ड", posTerminal: "POS टर्मिनल", orders: "ऑर्डर", allOrders: "सभी ऑर्डर",
    createOrder: "ऑर्डर बनाएं", pendingOrders: "लंबित ऑर्डर", productCatalog: "उत्पाद कैटलॉग",
    products: "उत्पाद", orderForms: "ऑर्डर फॉर्म", coupons: "कूपन", customers: "ग्राहक",
    subscriptions: "सब्सक्रिप्शन", finances: "वित्त", salesProfit: "बिक्री और लाभ",
    incomeExpense: "आय और व्यय", dueBook: "बकाया बही", adCosts: "विज्ञापन लागत",
    taskMission: "कार्य और मिशन", reports: "रिपोर्ट", integrations: "एकीकरण",
    notifications: "सूचनाएं", woocommerce: "WooCommerce", botAutomation: "बॉट ऑटोमेशन",
    whatsapp: "व्हाट्सएप", googleSheets: "गूगल शीट्स", referral: "रेफरल", myPlan: "मेरा प्लान", support: "सहायता",
    settings: "सेटिंग्स", save: "सेव करें", cancel: "रद्द करें", add: "जोड़ें", delete: "हटाएं",
    edit: "संपादित करें", search: "खोजें...", actions: "कार्रवाई", status: "स्थिति",
    active: "सक्रिय", inactive: "निष्क्रिय", name: "नाम", email: "ईमेल", phone: "फ़ोन",
    address: "पता", overview: "अवलोकन", salesProducts: "बिक्री और उत्पाद",
    crmBilling: "CRM और बिलिंग", performance: "प्रदर्शन", systemGrowth: "सिस्टम और ग्रोथ",
    supportSection: "सहायता", totalRevenue: "कुल राजस्व", totalOrders: "कुल ऑर्डर",
    activePlan: "सक्रिय प्लान", revenueOverview: "राजस्व अवलोकन",
    recentOrders: "हालिया ऑर्डर",
    welcomeBack: "स्वागत है — आज क्या हो रहा है यहाँ देखें।",
    businessSettings: "व्यवसाय सेटिंग्स", paymentMethods: "भुगतान विधियां",
    currencies: "मुद्राएं", language: "भाषा", staff: "स्टाफ़", stores: "स्टोर",
    profile: "प्रोफ़ाइल", general: "सामान्य",
    filter: "फ़िल्टर", export: "एक्सपोर्ट", import: "इम्पोर्ट", loading: "लोड हो रहा है...",
    noResults: "कोई परिणाम नहीं", view: "देखें", date: "तारीख", amount: "राशि",
    total: "कुल", quantity: "मात्रा", price: "मूल्य", category: "श्रेणी",
    description: "विवरण", notes: "नोट्स", optional: "वैकल्पिक", required: "आवश्यक",
    yes: "हाँ", no: "नहीं", all: "सभी",
    addProduct: "उत्पाद जोड़ें", productName: "उत्पाद का नाम", sku: "SKU",
    baseCost: "लागत मूल्य", baseSelling: "विक्रय मूल्य", stockQuantity: "स्टॉक मात्रा",
    searchProducts: "नाम, SKU या श्रेणी से खोजें...", sort: "क्रमबद्ध करें",
    noProductsYet: "अभी तक कोई उत्पाद नहीं", noProductsMatch: "कोई उत्पाद नहीं मिला",
    variations: "वेरिएशन", variationName: "वेरिएशन का नाम",
    orderId: "ऑर्डर आईडी", customer: "ग्राहक", payment: "भुगतान", method: "विधि",
    source: "स्रोत", searchOrders: "ऑर्डर खोजें...", allTime: "सभी समय",
    allStatus: "सभी स्थिति", allPayments: "सभी भुगतान", noOrdersYet: "अभी तक कोई ऑर्डर नहीं",
    product: "उत्पाद", selectCustomer: "ग्राहक चुनें",
    enterProductName: "उत्पाद का नाम दर्ज करें", dateTime: "तारीख और समय",
    amountPaid: "भुगतान की गई राशि", costPrice: "लागत मूल्य", discount: "छूट",
    type: "प्रकार", paymentMethod: "भुगतान विधि", items: "आइटम",
    selectCustomerHeading: "ग्राहक चुनें", reviewCart: "कार्ट समीक्षा",
    orderNotes: "ऑर्डर नोट्स", orderSummary: "ऑर्डर सारांश",
    reportsAnalytics: "रिपोर्ट और एनालिटिक्स", finance: "वित्त",
  },
};

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export const useLanguage = () => useContext(LanguageContext);

// Resolve the owner user_id for the current auth user.
// Staff members inherit their store owner's language preference.
const resolveOwnerId = async (authUserId: string): Promise<string> => {
  const { data: staff } = await supabase
    .from("staff_members")
    .select("user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return staff?.user_id || authUserId;
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("app_language") as Lang;
    return saved && translations[saved] ? saved : "en";
  });

  // Load language from DB on auth state change (handles login, refresh, switch user)
  useEffect(() => {
    let cancelled = false;

    const loadLangFromDb = async (authUserId: string) => {
      const ownerId = await resolveOwnerId(authUserId);
      const { data } = await supabase
        .from("business_settings")
        .select("app_language")
        .eq("user_id", ownerId)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (data?.app_language && translations[data.app_language as Lang]) {
        setLangState(data.app_language as Lang);
        localStorage.setItem("app_language", data.app_language);
      }
    };

    // Initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadLangFromDb(session.user.id);
    });

    // Re-sync whenever auth changes (login / token refresh / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadLangFromDb(session.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const changeLang = async (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app_language", newLang);

    // Persist to DB against the owner's settings (staff updates owner's pref)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const ownerId = await resolveOwnerId(session.user.id);
      await supabase
        .from("business_settings")
        .update({ app_language: newLang })
        .eq("user_id", ownerId);
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};
