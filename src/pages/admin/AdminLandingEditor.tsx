import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Eye, Loader2, Image, Type, Search, X, Plus, Trash2, RefreshCw, EyeOff, GripVertical, Sparkles, ChevronUp, ChevronDown, Copy } from "lucide-react";

interface ContentItem {
  id: string;
  key: string;
  value: string;
  section: string;
  content_type: string;
  sort_order: number;
}

const SECTION_ORDER = [
  "seo", "banner", "hero", "trust", "pain_points", "about", "features",
  "who_is_it_for", "showcase", "screenshots", "how_it_works", "advanced", "why_us",
  "comparison", "integrations", "mobile", "pricing",
  "testimonials", "faq", "cta", "footer", "policies", "general", "chat",
];

const SECTION_LABELS: Record<string, string> = {
  hero: "🏠 Hero",
  trust: "📊 Trust / Stats",
  pain_points: "🔴 Pain Points & Solutions",
  about: "ℹ️ About Us",
  features: "⭐ Features",
  who_is_it_for: "🎯 Who Is It For",
  showcase: "🖼️ Dashboard Showcase",
  how_it_works: "🔄 How It Works",
  advanced: "🚀 Advanced",
  why_us: "💎 Why Choose Us",
  pricing: "💰 Pricing",
  testimonials: "💬 Testimonials",
  cta: "📢 CTA",
  footer: "🔗 Footer",
  policies: "📜 Policies",
  general: "⚙️ General",
  faq: "❓ FAQ",
  comparison: "📋 Comparison",
  integrations: "🔌 Integrations",
  mobile: "📱 Mobile",
  banner: "🎯 Banner",
  seo: "🔍 SEO",
  screenshots: "📸 Screenshots",
  chat: "💬 Chat",
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  hero: "Headline, subtitle, CTA buttons, hero image, badge text",
  trust: "Stats — users, stores, orders, uptime",
  pain_points: "4 pain points + 4 solutions with titles & descriptions",
  about: "About section: title, descriptions, image, highlight points",
  features: "6 core features with title, description & optional image",
  who_is_it_for: "Marquee items showing target audiences",
  showcase: "Dashboard showcase: up to 6 cards with image, title & description",
  how_it_works: "4 steps showing how users get started",
  advanced: "4 advanced features + optional image",
  why_us: "4 reasons to choose + optional image",
  pricing: "Plan prices & feature lists (pipe-separated)",
  testimonials: "3 customer testimonials with images",
  cta: "Final call-to-action section",
  footer: "Footer text, contact, copyright, highlights",
  policies: "Privacy, Terms, Refund (markdown bold)",
  faq: "5 frequently asked questions",
  comparison: "Comparison table features (pipe-separated)",
  integrations: "Integration partners section",
  mobile: "Mobile app showcase & features",
  banner: "Top announcement banner",
  seo: "Meta title & description",
  screenshots: "Dashboard screenshots (URLs) & labels",
  chat: "Chatbot content, help articles, social links",
};

/* ── All keys the landing page uses, grouped by section ── */
const ALL_LANDING_KEYS: Record<string, { key: string; type: "text" | "image"; defaultValue: string }[]> = {
  seo: [
    { key: "seo_title", type: "text", defaultValue: "EvixPOS — Sell Smarter. Automate Faster." },
    { key: "seo_description", type: "text", defaultValue: "The all-in-one platform to manage orders, products, customers, and finances." },
  ],
  banner: [
    { key: "banner_active", type: "text", defaultValue: "true" },
    { key: "banner_subtitle", type: "text", defaultValue: "Get 50% off your first 3 months on any paid plan. Limited time only." },
    { key: "banner_cta", type: "text", defaultValue: "Claim Offer" },
  ],
  hero: [
    { key: "section_hero_visible", type: "text", defaultValue: "true" },
    { key: "brand_logo", type: "image", defaultValue: "" },
    { key: "brand_name", type: "text", defaultValue: "EvixPOS" },
    { key: "nav_about", type: "text", defaultValue: "About" },
    { key: "nav_features", type: "text", defaultValue: "Features" },
    { key: "nav_pricing", type: "text", defaultValue: "Pricing" },
    { key: "nav_reviews", type: "text", defaultValue: "Reviews" },
    { key: "nav_faq", type: "text", defaultValue: "FAQ" },
    { key: "nav_login", type: "text", defaultValue: "Log In" },
    { key: "nav_start_free", type: "text", defaultValue: "Start Free" },
    { key: "hero_social_proof", type: "text", defaultValue: "Join 3,000+ businesses" },
    { key: "social_proof_avatar_1", type: "image", defaultValue: "" },
    { key: "social_proof_avatar_2", type: "image", defaultValue: "" },
    { key: "social_proof_avatar_3", type: "image", defaultValue: "" },
    { key: "hero_title_line1", type: "text", defaultValue: "Sell Smarter." },
    { key: "hero_title_line2", type: "text", defaultValue: "Automate Faster." },
    { key: "hero_subtitle", type: "text", defaultValue: "POS, subscriptions, WooCommerce sync, auto reminders & profit analytics — built for the busy digital entrepreneur." },
    { key: "hero_cta_primary", type: "text", defaultValue: "Get Started Free" },
    { key: "hero_cta_secondary", type: "text", defaultValue: "See How It Works" },
    { key: "hero_bullet_1", type: "text", defaultValue: "Free forever plan" },
    { key: "hero_bullet_2", type: "text", defaultValue: "No credit card" },
    { key: "hero_bullet_3", type: "text", defaultValue: "Setup in 2 min" },
    { key: "hero_image", type: "image", defaultValue: "" },
    { key: "hero_video_url", type: "text", defaultValue: "" },
    { key: "hero_video_type", type: "text", defaultValue: "youtube" },
    { key: "hero_video_thumbnail", type: "image", defaultValue: "" },
    { key: "hero_video_title", type: "text", defaultValue: "EvixPOS Product Demo" },
  ],
  trust: [
    { key: "section_trust_visible", type: "text", defaultValue: "true" },
    { key: "stats_users", type: "text", defaultValue: "3,000+" },
    { key: "stats_users_label", type: "text", defaultValue: "Active Users" },
    { key: "stats_stores", type: "text", defaultValue: "1,983+" },
    { key: "stats_stores_label", type: "text", defaultValue: "Stores Managed" },
    { key: "stats_orders", type: "text", defaultValue: "50K+" },
    { key: "stats_orders_label", type: "text", defaultValue: "Orders Processed" },
    { key: "stats_uptime", type: "text", defaultValue: "99.9%" },
    { key: "stats_uptime_label", type: "text", defaultValue: "Uptime" },
  ],
  pain_points: [
    { key: "section_pain_points_visible", type: "text", defaultValue: "true" },
    { key: "pain_badge", type: "text", defaultValue: "Pain Point" },
    { key: "pain_title", type: "text", defaultValue: "Your Business Shouldn't Be This Hard" },
    { key: "pain_subtitle", type: "text", defaultValue: "Managing subscriptions, billing, and customers using spreadsheets and guesswork is draining your profits and your time." },
    { key: "pain_old_title", type: "text", defaultValue: "Old Way" },
    { key: "pain_old_image", type: "image", defaultValue: "" },
    { key: "pain_metric_1_label", type: "text", defaultValue: "Time Wasted" },
    { key: "pain_metric_1_val", type: "text", defaultValue: "5+ Hrs/Day" },
    { key: "pain_metric_2_label", type: "text", defaultValue: "Revenue Lost" },
    { key: "pain_metric_2_val", type: "text", defaultValue: "৳40K+/Mo" },
    { key: "pain_metric_3_label", type: "text", defaultValue: "Manual Work" },
    { key: "pain_metric_3_val", type: "text", defaultValue: "Everything" },
    { key: "pain_metric_4_label", type: "text", defaultValue: "Insight" },
    { key: "pain_metric_4_val", type: "text", defaultValue: "None" },
    { key: "pain_1_title", type: "text", defaultValue: "Manual order tracking" },
    { key: "pain_1_desc", type: "text", defaultValue: "Hours wasted on spreadsheets" },
    { key: "pain_2_title", type: "text", defaultValue: "Missed renewals" },
    { key: "pain_2_desc", type: "text", defaultValue: "Customers churn silently" },
    { key: "pain_3_title", type: "text", defaultValue: "No profit visibility" },
    { key: "pain_3_desc", type: "text", defaultValue: "Guessing your margins" },
    { key: "pain_4_title", type: "text", defaultValue: "Disconnected tools" },
    { key: "pain_4_desc", type: "text", defaultValue: "Juggling 5+ apps daily" },
    { key: "pain_new_title", type: "text", defaultValue: "With EvixPOS" },
    { key: "pain_new_image", type: "image", defaultValue: "" },
    { key: "solution_metric_1_label", type: "text", defaultValue: "Time Saved" },
    { key: "solution_metric_1_val", type: "text", defaultValue: "20 Min/Day" },
    { key: "solution_metric_2_label", type: "text", defaultValue: "Revenue Gained" },
    { key: "solution_metric_2_val", type: "text", defaultValue: "৳40K+/Mo" },
    { key: "solution_metric_3_label", type: "text", defaultValue: "Automations" },
    { key: "solution_metric_3_val", type: "text", defaultValue: "Unlimited" },
    { key: "solution_metric_4_label", type: "text", defaultValue: "Insight" },
    { key: "solution_metric_4_val", type: "text", defaultValue: "Real-Time" },
    { key: "solution_1_title", type: "text", defaultValue: "Auto order management" },
    { key: "solution_1_desc", type: "text", defaultValue: "One-click order processing" },
    { key: "solution_2_title", type: "text", defaultValue: "Smart renewal reminders" },
    { key: "solution_2_desc", type: "text", defaultValue: "Automated email & WhatsApp" },
    { key: "solution_3_title", type: "text", defaultValue: "Real-time analytics" },
    { key: "solution_3_desc", type: "text", defaultValue: "See profit instantly" },
    { key: "solution_4_title", type: "text", defaultValue: "All-in-one platform" },
    { key: "solution_4_desc", type: "text", defaultValue: "Everything in one place" },
    { key: "pain_cta", type: "text", defaultValue: "Switch to the Better Way" },
  ],
  features: [
    { key: "section_features_visible", type: "text", defaultValue: "true" },
    { key: "features_badge", type: "text", defaultValue: "Core Features" },
    { key: "features_title", type: "text", defaultValue: "Everything You Need to Scale" },
    { key: "features_subtitle", type: "text", defaultValue: "Powerful tools designed for modern businesses — simple to use, built to scale." },
    ...([1,2,3,4,5,6].flatMap(i => [
      { key: `feature_${i}_badge`, type: "text" as const, defaultValue: "Feature" },
      { key: `feature_${i}_title`, type: "text" as const, defaultValue: "" },
      { key: `feature_${i}_desc`, type: "text" as const, defaultValue: "" },
      { key: `feature_${i}_image`, type: "image" as const, defaultValue: "" },
      { key: `feature_${i}_bullets`, type: "text" as const, defaultValue: "" },
    ])),
  ],
  who_is_it_for: [
    { key: "section_who_visible", type: "text", defaultValue: "true" },
    { key: "who_badge", type: "text", defaultValue: "Who Is It For?" },
    { key: "who_title", type: "text", defaultValue: "Built for Every Business Model" },
    { key: "who_list_1", type: "text", defaultValue: "OTT Subscription|Educational Courses|Memberships|Gym & Fitness|Hosting Services|Themes & Plugins" },
    { key: "who_list_2", type: "text", defaultValue: "License Keys|Physical Products|Personal Services|SaaS Products|Logistic Services|Digital Products" },
  ],
  screenshots: [
    { key: "section_screenshots_visible", type: "text", defaultValue: "true" },
    { key: "screenshots_badge", type: "text", defaultValue: "Product Preview" },
    { key: "screenshots_title", type: "text", defaultValue: "See EvixPOS in Action" },
    { key: "screenshot_1", type: "image", defaultValue: "" },
    { key: "screenshot_1_label", type: "text", defaultValue: "Order Management" },
    { key: "screenshot_2", type: "image", defaultValue: "" },
    { key: "screenshot_2_label", type: "text", defaultValue: "Analytics & Reports" },
    { key: "screenshot_3", type: "image", defaultValue: "" },
    { key: "screenshot_3_label", type: "text", defaultValue: "POS System" },
    { key: "screenshot_4", type: "image", defaultValue: "" },
    { key: "screenshot_4_label", type: "text", defaultValue: "Dashboard" },
  ],
  how_it_works: [
    { key: "section_how_it_works_visible", type: "text", defaultValue: "true" },
    { key: "how_badge", type: "text", defaultValue: "Quick Setup" },
    { key: "how_it_works_title", type: "text", defaultValue: "Up and Running in 15 Minutes" },
    { key: "how_it_works_subtitle", type: "text", defaultValue: "Four steps from sign-up to your first automated renewal going out." },
    ...([1,2,3,4].flatMap(i => [
      { key: `step_${i}_title`, type: "text" as const, defaultValue: `Step ${i}` },
      { key: `step_${i}_desc`, type: "text" as const, defaultValue: "" },
      { key: `step_${i}_tags`, type: "text" as const, defaultValue: "" },
    ])),
  ],
  about: [
    { key: "section_about_visible", type: "text", defaultValue: "true" },
    { key: "about_badge", type: "text", defaultValue: "About Us" },
    { key: "about_title", type: "text", defaultValue: "Built for Modern Entrepreneurs" },
    { key: "about_desc_1", type: "text", defaultValue: "EvixPOS is a comprehensive business management platform designed to simplify operations for small and medium businesses." },
    { key: "about_desc_2", type: "text", defaultValue: "Founded with the mission to empower local businesses with world-class tools." },
    { key: "about_point_1", type: "text", defaultValue: "Multi-Country" },
    { key: "about_point_2", type: "text", defaultValue: "Bank-Grade Security" },
    { key: "about_point_3", type: "text", defaultValue: "24/7 Support" },
    { key: "about_point_4", type: "text", defaultValue: "Mobile Ready" },
    { key: "about_image", type: "image", defaultValue: "" },
  ],
  why_us: [
    { key: "section_why_us_visible", type: "text", defaultValue: "true" },
    { key: "why_badge", type: "text", defaultValue: "Why EvixPOS" },
    { key: "why_title", type: "text", defaultValue: "Stop juggling isolated tools. Run everything in one place." },
    { key: "why_subtitle", type: "text", defaultValue: "We're not just another tool — we're your business partner." },
    ...([1,2,3,4].flatMap(i => [
      { key: `why_${i}_title`, type: "text" as const, defaultValue: `Reason ${i}` },
      { key: `why_${i}_desc`, type: "text" as const, defaultValue: "" },
    ])),
  ],
  showcase: [
    { key: "section_showcase_visible", type: "text", defaultValue: "true" },
    { key: "showcase_badge", type: "text", defaultValue: "Dashboard Showcase" },
    { key: "showcase_title", type: "text", defaultValue: "Powerful Dashboard at Your Fingertips" },
    { key: "showcase_subtitle", type: "text", defaultValue: "See how EvixPOS gives you complete control over your business." },
    ...([1,2,3,4,5,6].flatMap(i => [
      { key: `showcase_${i}_title`, type: "text" as const, defaultValue: "" },
      { key: `showcase_${i}_desc`, type: "text" as const, defaultValue: "" },
      { key: `showcase_${i}_image`, type: "image" as const, defaultValue: "" },
    ])),
  ],
  advanced: [
    { key: "section_advanced_visible", type: "text", defaultValue: "true" },
    { key: "advanced_badge", type: "text", defaultValue: "Advanced" },
    { key: "advanced_title", type: "text", defaultValue: "Advanced Features for Power Users" },
    { key: "advanced_subtitle", type: "text", defaultValue: "Go beyond basics with automation, analytics, and integrations." },
    ...([1,2,3,4].flatMap(i => [
      { key: `adv_${i}_title`, type: "text" as const, defaultValue: "" },
      { key: `adv_${i}_desc`, type: "text" as const, defaultValue: "" },
    ])),
    { key: "advanced_image", type: "image", defaultValue: "" },
  ],
  integrations: [
    { key: "section_integrations_visible", type: "text", defaultValue: "true" },
    { key: "integrations_badge", type: "text", defaultValue: "Integrations" },
    { key: "integrations_title", type: "text", defaultValue: "Connect Your Favorite Tools" },
    { key: "integrations_subtitle", type: "text", defaultValue: "Seamlessly integrate with the tools you already use." },
    { key: "integrations_list", type: "text", defaultValue: "WooCommerce|WhatsApp|Google Sheets|Stripe|PayPal" },
  ],
  comparison: [
    { key: "section_comparison_visible", type: "text", defaultValue: "true" },
    { key: "comparison_badge", type: "text", defaultValue: "Comparison" },
    { key: "comparison_title", type: "text", defaultValue: "Why Choose Us Over Others?" },
    { key: "comparison_features", type: "text", defaultValue: "Multi-Store Management|Built-in POS|WhatsApp Integration|Subscription Tracking|Referral System|Multi-Currency|Free Plan Available|Mobile Optimized" },
  ],
  mobile: [
    { key: "section_mobile_visible", type: "text", defaultValue: "true" },
    { key: "mobile_badge", type: "text", defaultValue: "Mobile App" },
    { key: "app_download_title", type: "text", defaultValue: "Manage Your Business On The Go" },
    { key: "app_download_subtitle", type: "text", defaultValue: "Get the full power of EvixPOS on your mobile device." },
    { key: "app_download_image", type: "image", defaultValue: "" },
    { key: "mobile_features", type: "text", defaultValue: "Process sales from anywhere|Real-time order notifications|Full inventory management|Customer management on the go" },
    { key: "app_download_android", type: "text", defaultValue: "" },
    { key: "app_download_ios", type: "text", defaultValue: "" },
  ],
  pricing: [
    { key: "section_pricing_visible", type: "text", defaultValue: "true" },
    { key: "pricing_badge", type: "text", defaultValue: "Pricing" },
    { key: "pricing_title", type: "text", defaultValue: "Plans That Scale With You" },
    { key: "pricing_subtitle", type: "text", defaultValue: "Start free. Upgrade when you're ready. No hidden fees." },
    ...["free", "pro", "business"].flatMap(plan => [
      { key: `plan_${plan}_price_bdt`, type: "text" as const, defaultValue: plan === "free" ? "0" : plan === "pro" ? "499" : "999" },
      { key: `plan_${plan}_price_inr`, type: "text" as const, defaultValue: plan === "free" ? "0" : plan === "pro" ? "499" : "999" },
      { key: `plan_${plan}_price_usd`, type: "text" as const, defaultValue: plan === "free" ? "0" : plan === "pro" ? "9" : "19" },
      { key: `plan_${plan}_features`, type: "text" as const, defaultValue: "" },
    ]),
  ],
  testimonials: [
    { key: "section_testimonials_visible", type: "text", defaultValue: "true" },
    { key: "testimonials_badge", type: "text", defaultValue: "Testimonials" },
    { key: "testimonials_title", type: "text", defaultValue: "What Our Users Say" },
    { key: "testimonials_subtitle", type: "text", defaultValue: "Trusted by thousands of business owners." },
    ...([1,2,3].flatMap(i => [
      { key: `testimonial_${i}_text`, type: "text" as const, defaultValue: "Great platform!" },
      { key: `testimonial_${i}_name`, type: "text" as const, defaultValue: "User" },
      { key: `testimonial_${i}_role`, type: "text" as const, defaultValue: "Business Owner" },
      { key: `testimonial_${i}_image`, type: "image" as const, defaultValue: "" },
    ])),
  ],
  faq: [
    { key: "section_faq_visible", type: "text", defaultValue: "true" },
    { key: "faq_title", type: "text", defaultValue: "Got Questions? We've Got Answers." },
    { key: "faq_subtitle", type: "text", defaultValue: "Everything you need to know before getting started." },
    ...([1,2,3,4,5,6,7].flatMap(i => [
      { key: `faq_${i}_q`, type: "text" as const, defaultValue: "" },
      { key: `faq_${i}_a`, type: "text" as const, defaultValue: "" },
    ])),
  ],
  cta: [
    { key: "section_cta_visible", type: "text", defaultValue: "true" },
    { key: "cta_title", type: "text", defaultValue: "Ready to Transform Your Business?" },
    { key: "cta_subtitle", type: "text", defaultValue: "Join thousands of entrepreneurs who manage their entire business from one powerful platform." },
    { key: "cta_button", type: "text", defaultValue: "Start Free Today" },
    { key: "cta_button_secondary", type: "text", defaultValue: "Talk to Sales" },
    { key: "cta_trust_1", type: "text", defaultValue: "Secure & Private" },
    { key: "cta_trust_2", type: "text", defaultValue: "No Credit Card" },
    { key: "cta_trust_3", type: "text", defaultValue: "Cancel Anytime" },
  ],
  footer: [
    { key: "footer_tagline", type: "text", defaultValue: "The modern platform for managing your business — orders, products, customers, and more." },
    { key: "brand_email", type: "text", defaultValue: "support@evixpos.com" },
    { key: "brand_whatsapp", type: "text", defaultValue: "+91 8101949890" },
    { key: "footer_col1_title", type: "text", defaultValue: "Product" },
    { key: "footer_col2_title", type: "text", defaultValue: "Company" },
    { key: "footer_col3_title", type: "text", defaultValue: "Account" },
    { key: "footer_link_how", type: "text", defaultValue: "How It Works" },
    { key: "footer_link_screenshots", type: "text", defaultValue: "Screenshots" },
    { key: "footer_link_contact", type: "text", defaultValue: "Contact" },
    { key: "footer_link_login", type: "text", defaultValue: "Login" },
    { key: "footer_link_signup", type: "text", defaultValue: "Sign Up Free" },
    { key: "footer_link_dashboard", type: "text", defaultValue: "Dashboard" },
    { key: "footer_why_title", type: "text", defaultValue: "Why EvixPOS" },
    { key: "footer_highlights", type: "text", defaultValue: "Secure Platform|Multi-Store Support|24/7 Support|Fast & Reliable" },
    { key: "footer_cta_title", type: "text", defaultValue: "Start Your Business Today" },
    { key: "footer_copyright", type: "text", defaultValue: "© 2026 EvixPOS. All rights reserved." },
    { key: "footer_powered_by", type: "text", defaultValue: "LifeAim IT" },
    { key: "footer_powered_url", type: "text", defaultValue: "https://www.lifeaimit.in" },
  ],
  policies: [
    { key: "privacy_policy", type: "text", defaultValue: "" },
    { key: "terms_of_service", type: "text", defaultValue: "" },
    { key: "refund_policy", type: "text", defaultValue: "" },
  ],
  general: [
    { key: "brand_logo", type: "image", defaultValue: "" },
    { key: "brand_name", type: "text", defaultValue: "EvixPOS" },
  ],
  chat: [
    { key: "chatbot_welcome", type: "text", defaultValue: "" },
    { key: "chatbot_name", type: "text", defaultValue: "EvixPOS Support" },
  ],
};

const VISIBILITY_SECTIONS = [
  "hero", "trust", "pain_points", "features", "who_is_it_for", "screenshots",
  "showcase", "how_it_works", "about", "advanced", "why_us", "comparison",
  "integrations", "mobile", "pricing", "testimonials", "faq", "cta",
];

const VISIBILITY_KEY_MAP: Record<string, string> = {
  hero: "section_hero_visible",
  trust: "section_trust_visible",
  pain_points: "section_pain_points_visible",
  features: "section_features_visible",
  who_is_it_for: "section_who_visible",
  screenshots: "section_screenshots_visible",
  showcase: "section_showcase_visible",
  how_it_works: "section_how_it_works_visible",
  about: "section_about_visible",
  advanced: "section_advanced_visible",
  why_us: "section_why_us_visible",
  comparison: "section_comparison_visible",
  integrations: "section_integrations_visible",
  mobile: "section_mobile_visible",
  pricing: "section_pricing_visible",
  testimonials: "section_testimonials_visible",
  faq: "section_faq_visible",
  cta: "section_cta_visible",
};

const AdminLandingEditor = () => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "image">("text");

  useEffect(() => {
    supabase
      .from("landing_content")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        const d = (data as ContentItem[]) || [];
        setItems(d);
        setLoading(false);
        const sections = [...new Set(d.map((i) => i.section))];
        const sorted = SECTION_ORDER.filter((s) => sections.includes(s));
        sections.forEach((s) => { if (!sorted.includes(s)) sorted.push(s); });
        if (sorted.length > 0) setActiveSection(sorted[0]);
      });
  }, []);

  const handleChange = (id: string, value: string) => {
    setEdited((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(edited);
      for (const [id, value] of updates) {
        await supabase.from("landing_content").update({ value, updated_at: new Date().toISOString() }).eq("id", id);
      }
      setItems((prev) =>
        prev.map((item) => (edited[item.id] !== undefined ? { ...item, value: edited[item.id] } : item))
      );
      setEdited({});
      toast.success(`Saved ${updates.length} change(s) successfully!`);
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = async () => {
    if (!newFieldKey.trim() || !activeSection) return;
    const key = newFieldKey.trim().toLowerCase().replace(/\s+/g, "_");
    const maxSort = items.filter(i => i.section === activeSection).reduce((m, i) => Math.max(m, i.sort_order), 0);
    
    const { data, error } = await supabase.from("landing_content").insert({
      key,
      value: "",
      section: activeSection,
      content_type: newFieldType,
      sort_order: maxSort + 1,
    }).select().single();

    if (error) {
      toast.error("Failed to add field");
      return;
    }
    if (data) {
      setItems(prev => [...prev, data as ContentItem]);
      setNewFieldKey("");
      toast.success(`Added field "${key}" to ${activeSection}`);
    }
  };

  const handleDeleteField = async (id: string, key: string) => {
    if (!confirm(`Delete field "${key}"?`)) return;
    const { error } = await supabase.from("landing_content").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
    const newEdited = { ...edited };
    delete newEdited[id];
    setEdited(newEdited);
    toast.success(`Deleted "${key}"`);
  };

  /* ── Seed all missing keys ── */
  const handleSeedAllKeys = async () => {
    setSeeding(true);
    try {
      const existingKeys = new Set(items.map(i => i.key));
      const toUpsert: { key: string; value: string; section: string; content_type: string; sort_order: number }[] = [];
      
      for (const [section, keys] of Object.entries(ALL_LANDING_KEYS)) {
        keys.forEach((k, idx) => {
          if (!existingKeys.has(k.key)) {
            toUpsert.push({
              key: k.key,
              value: k.defaultValue,
              section,
              content_type: k.type,
              sort_order: idx,
            });
          }
        });
      }

      if (toUpsert.length === 0) {
        toast.info("All keys already exist!");
        setSeeding(false);
        return;
      }

      // Use upsert to avoid duplicate key errors
      const { data, error } = await supabase
        .from("landing_content")
        .upsert(toUpsert, { onConflict: "key", ignoreDuplicates: true })
        .select();
      if (error) {
        toast.error("Failed to seed keys: " + error.message);
      } else {
        // Merge new items, avoiding duplicates in state
        const newItems = (data as ContentItem[]).filter(d => !existingKeys.has(d.key));
        setItems(prev => [...prev, ...newItems]);
        toast.success(`Seeded ${toUpsert.length} key(s) successfully!`);
      }
    } catch {
      toast.error("Failed to seed keys");
    } finally {
      setSeeding(false);
    }
  };

  /* ── Toggle section visibility ── */
  const handleToggleVisibility = async (section: string) => {
    const visKey = VISIBILITY_KEY_MAP[section];
    if (!visKey) return;

    const existingItem = items.find(i => i.key === visKey);
    if (existingItem) {
      const newVal = (edited[existingItem.id] ?? existingItem.value) === "true" ? "false" : "true";
      handleChange(existingItem.id, newVal);
    } else {
      // Create the key
      const { data, error } = await supabase.from("landing_content").insert({
        key: visKey,
        value: "true",
        section,
        content_type: "text",
        sort_order: 0,
      }).select().single();
      if (!error && data) {
        setItems(prev => [...prev, data as ContentItem]);
      }
    }
  };

  const isSectionVisible = (section: string): boolean => {
    const visKey = VISIBILITY_KEY_MAP[section];
    if (!visKey) return true;
    const item = items.find(i => i.key === visKey);
    if (!item) return true;
    const val = edited[item.id] ?? item.value;
    return val !== "false";
  };

  /* ── Move field up/down ── */
  const handleMoveField = async (id: string, direction: "up" | "down") => {
    const sectionItems = (sections[activeSection] || []).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sectionItems.findIndex(i => i.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sectionItems.length) return;

    const item = sectionItems[idx];
    const swap = sectionItems[swapIdx];
    
    await Promise.all([
      supabase.from("landing_content").update({ sort_order: swap.sort_order }).eq("id", item.id),
      supabase.from("landing_content").update({ sort_order: item.sort_order }).eq("id", swap.id),
    ]);

    setItems(prev => prev.map(i => {
      if (i.id === item.id) return { ...i, sort_order: swap.sort_order };
      if (i.id === swap.id) return { ...i, sort_order: item.sort_order };
      return i;
    }));
  };

  /* ── Duplicate field ── */
  const handleDuplicateField = async (item: ContentItem) => {
    const maxSort = items.filter(i => i.section === item.section).reduce((m, i) => Math.max(m, i.sort_order), 0);
    const newKey = item.key + "_copy";
    const { data, error } = await supabase.from("landing_content").insert({
      key: newKey,
      value: item.value,
      section: item.section,
      content_type: item.content_type,
      sort_order: maxSort + 1,
    }).select().single();
    if (!error && data) {
      setItems(prev => [...prev, data as ContentItem]);
      toast.success(`Duplicated "${item.key}"`);
    }
  };

  const sections: Record<string, ContentItem[]> = items.reduce<Record<string, ContentItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const sortedSectionKeys = SECTION_ORDER.filter((s) => sections[s]);
  Object.keys(sections).forEach((s) => { if (!sortedSectionKeys.includes(s)) sortedSectionKeys.push(s); });

  const activeSectionItems = (sections[activeSection] || [])
    .filter((item) => {
      // Hide visibility toggle keys from field list (they appear as toggle in header)
      if (Object.values(VISIBILITY_KEY_MAP).includes(item.key)) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return item.key.toLowerCase().includes(q) || item.value.toLowerCase().includes(q);
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  const hasChanges = Object.keys(edited).length > 0;
  const existingKeyCount = items.length;
  const totalExpectedKeys = Object.values(ALL_LANDING_KEYS).flat().length;
  const missingKeys = totalExpectedKeys - new Set([...items.map(i => i.key), ...Object.values(ALL_LANDING_KEYS).flat().map(k => k.key)]).size + totalExpectedKeys;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            Landing Page Editor
            <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-500/30 text-xs">
              {items.length} fields
            </Badge>
          </h1>
          <p className="text-slate-500 text-xs mt-1">Manage all landing page content, images & sections — fully dynamic</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleSeedAllKeys} 
            disabled={seeding} 
            className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1.5 text-xs"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Seed All Keys
          </Button>
          <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <Eye className="h-4 w-4" /> Preview
          </a>
          <Button onClick={handleSave} disabled={!hasChanges || saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
            {hasChanges && <Badge className="bg-amber-500 text-white text-[10px] ml-1">{Object.keys(edited).length}</Badge>}
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
        {/* Section Sidebar */}
        <div className="w-60 shrink-0 bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-y-auto">
          <div className="p-2">
            {sortedSectionKeys.map((s) => {
              const sectionEdited = (sections[s] || []).filter((item) => edited[item.id] !== undefined).length;
              const isActive = activeSection === s;
              const isVisible = isSectionVisible(s);
              const hasVisToggle = VISIBILITY_SECTIONS.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => { setActiveSection(s); setSearchQuery(""); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 flex items-center justify-between transition-all text-sm group ${
                    isActive
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {hasVisToggle && !isVisible && <EyeOff className="h-3 w-3 text-slate-600 shrink-0" />}
                    <span className={`truncate font-medium text-xs ${hasVisToggle && !isVisible ? "opacity-50 line-through" : ""}`}>
                      {SECTION_LABELS[s] || s}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sectionEdited > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                    <span className={`text-[10px] ${isActive ? "text-emerald-400/70" : "text-slate-500"}`}>{(sections[s] || []).length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-800/30 rounded-xl border border-slate-700/50">
          {/* Section Header */}
          <div className="px-5 py-4 border-b border-slate-700/50 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                    {SECTION_LABELS[activeSection] || activeSection}
                    {VISIBILITY_SECTIONS.includes(activeSection) && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isSectionVisible(activeSection)}
                          onCheckedChange={() => handleToggleVisibility(activeSection)}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                        <span className={`text-[10px] uppercase tracking-wider font-medium ${isSectionVisible(activeSection) ? "text-emerald-400" : "text-slate-500"}`}>
                          {isSectionVisible(activeSection) ? "Visible" : "Hidden"}
                        </span>
                      </div>
                    )}
                  </h2>
                  <p className="text-slate-500 text-xs mt-0.5">{SECTION_DESCRIPTIONS[activeSection] || `${(sections[activeSection] || []).length} fields`}</p>
                </div>
              </div>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter fields..."
                  className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-900/50 border border-slate-600/50 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {activeSectionItems.map((item, idx) => {
              const current = edited[item.id] !== undefined ? edited[item.id] : item.value;
              const isModified = edited[item.id] !== undefined;
              const isLong = current.length > 80 || item.key.includes("subtitle") || item.key.includes("tagline") || item.key.includes("_text") || item.key.includes("_a") || item.key.includes("_desc") || item.key.includes("features") || item.key.includes("_body") || item.key.includes("policy") || item.key.includes("comparison") || item.key.includes("who_list");
              const isImage = item.content_type === "image";

              return (
                <div
                  key={item.id}
                  className={`rounded-lg p-3 transition-colors ${
                    isModified ? "bg-amber-500/5 border border-amber-500/20" : "bg-slate-900/30 border border-slate-700/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {isImage ? (
                      <Image className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    ) : (
                      <Type className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    )}
                    <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
                      {item.key.replace(/_/g, " ")}
                    </label>
                    {isImage && (
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">IMAGE URL</span>
                    )}
                    {isModified && (
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">Modified</span>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      <button onClick={() => handleMoveField(item.id, "up")} className="text-slate-600 hover:text-slate-300 p-1 rounded" title="Move up" disabled={idx === 0}>
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleMoveField(item.id, "down")} className="text-slate-600 hover:text-slate-300 p-1 rounded" title="Move down" disabled={idx === activeSectionItems.length - 1}>
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleDuplicateField(item)} className="text-slate-600 hover:text-blue-400 p-1 rounded" title="Duplicate">
                        <Copy className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleDeleteField(item.id, item.key)} className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded" title="Delete field">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {isLong ? (
                    <Textarea
                      value={current}
                      onChange={(e) => handleChange(item.id, e.target.value)}
                      className="bg-slate-900/60 border-slate-600/50 text-white resize-none text-sm"
                      rows={item.key.includes("features") || item.key.includes("_body") || item.key.includes("policy") || item.key.includes("comparison") || item.key.includes("who_list") ? 4 : 3}
                      placeholder={isImage ? "https://example.com/image.jpg" : "Enter content..."}
                    />
                  ) : (
                    <Input
                      value={current}
                      onChange={(e) => handleChange(item.id, e.target.value)}
                      className="bg-slate-900/60 border-slate-600/50 text-white text-sm"
                      placeholder={isImage ? "https://example.com/image.jpg" : "Enter content..."}
                    />
                  )}
                  {isImage && current && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-700 max-w-[200px]">
                      <img src={current} alt="Preview" className="w-full h-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                  {(item.key.includes("features") || item.key.includes("bullets") || item.key.includes("who_list") || item.key.includes("mobile_features") || item.key.includes("highlights")) && (
                    <p className="text-[10px] text-slate-500 mt-1">Separate items with | (pipe)</p>
                  )}
                </div>
              );
            })}
            {activeSectionItems.length === 0 && !searchQuery && (
              <div className="text-center py-12 text-slate-500">
                <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No fields in this section yet</p>
                <p className="text-xs mt-1">Click "Seed All Keys" above or add fields manually below</p>
              </div>
            )}
            {activeSectionItems.length === 0 && searchQuery && (
              <div className="text-center py-12 text-slate-500">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No fields match "{searchQuery}"</p>
              </div>
            )}
          </div>

          {/* Add New Field */}
          <div className="px-5 py-3 border-t border-slate-700/50 shrink-0">
            <div className="flex items-center gap-2">
              <Input
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                placeholder="New field key (e.g. about_image)"
                className="bg-slate-900/60 border-slate-600/50 text-white text-xs flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleAddField()}
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as "text" | "image")}
                className="bg-slate-900/60 border border-slate-600/50 text-white text-xs rounded-md px-2 py-2"
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
              </select>
              <Button size="sm" onClick={handleAddField} disabled={!newFieldKey.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Save Bar */}
      {hasChanges && (
        <div className="mt-3 bg-slate-800/95 backdrop-blur-sm rounded-xl border border-amber-500/30 p-3 flex items-center justify-between shrink-0">
          <span className="text-sm text-amber-400">{Object.keys(edited).length} unsaved change(s)</span>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminLandingEditor;
