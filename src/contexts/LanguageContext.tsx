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

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("app_language") as Lang;
    return saved && translations[saved] ? saved : "en";
  });
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load language preference from DB on auth change
  useEffect(() => {
    if (dbLoaded) return;

    const loadLangFromDb = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data } = await supabase
        .from("business_settings")
        .select("app_language")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();

      if (data?.app_language && translations[data.app_language as Lang]) {
        setLangState(data.app_language as Lang);
        localStorage.setItem("app_language", data.app_language);
      }
      setDbLoaded(true);
    };

    loadLangFromDb();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !dbLoaded) {
        loadLangFromDb();
      }
    });

    return () => subscription.unsubscribe();
  }, [dbLoaded]);

  const changeLang = async (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app_language", newLang);

    // Persist to DB
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from("business_settings")
        .update({ app_language: newLang })
        .eq("user_id", session.user.id);
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};
