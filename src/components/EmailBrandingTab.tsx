import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Palette, Save, Monitor, Smartphone, Eye, Send, RefreshCw,
  Type, Image, Sparkles, CheckCircle2, Globe, Facebook, Instagram,
  Twitter, Linkedin, Youtube, Sun, Moon, LayoutTemplate, Copy,
  ExternalLink, Wand2
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────
interface BrandingData {
  logo_url: string;
  brand_color: string;
  secondary_color: string;
  company_name: string;
  tagline: string;
  footer_text: string;
  website_url: string;
  font_family: string;
  border_radius: string;
  header_style: "centered" | "left-aligned" | "gradient" | "minimal";
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_linkedin: string;
  social_youtube: string;
}

// ─── Constants ──────────────────────────────────────────
const FONT_OPTIONS = [
  { value: "Arial, sans-serif", label: "Arial", desc: "Clean & Universal" },
  { value: "'Helvetica Neue', Helvetica, sans-serif", label: "Helvetica", desc: "Modern Swiss" },
  { value: "'Georgia', serif", label: "Georgia", desc: "Elegant Serif" },
  { value: "'Segoe UI', Tahoma, sans-serif", label: "Segoe UI", desc: "Smooth Reading" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet", desc: "Friendly & Open" },
  { value: "'Verdana', sans-serif", label: "Verdana", desc: "Wide & Readable" },
  { value: "'Playfair Display', Georgia, serif", label: "Playfair", desc: "Luxury Serif" },
  { value: "'Roboto', 'Segoe UI', sans-serif", label: "Roboto", desc: "Google Modern" },
];

const RADIUS_OPTIONS = [
  { value: "0px", label: "Sharp", visual: "rounded-none" },
  { value: "4px", label: "Subtle", visual: "rounded-sm" },
  { value: "8px", label: "Rounded", visual: "rounded-md" },
  { value: "12px", label: "Soft", visual: "rounded-lg" },
  { value: "20px", label: "Pill", visual: "rounded-full" },
];

const COLOR_THEMES = [
  { name: "Midnight", primary: "#1a1a2e", secondary: "#4f46e5", emoji: "🌙" },
  { name: "Ocean", primary: "#0c2340", secondary: "#2d8a9e", emoji: "🌊" },
  { name: "Forest", primary: "#1a3c2a", secondary: "#5a8a5c", emoji: "🌿" },
  { name: "Sunset", primary: "#e85d3a", secondary: "#f7931e", emoji: "🌅" },
  { name: "Royal", primary: "#4f46e5", secondary: "#818cf8", emoji: "👑" },
  { name: "Rose", primary: "#be185d", secondary: "#f472b6", emoji: "🌹" },
  { name: "Slate", primary: "#2d3748", secondary: "#718096", emoji: "🪨" },
  { name: "Emerald", primary: "#064e3b", secondary: "#34d399", emoji: "💎" },
  { name: "Noir", primary: "#0d0d0d", secondary: "#c9a84c", emoji: "🖤" },
  { name: "Coral", primary: "#ff6b6b", secondary: "#574b90", emoji: "🪸" },
  { name: "Arctic", primary: "#2e6b8a", secondary: "#b8d4e8", emoji: "❄️" },
  { name: "Lavender", primary: "#6c5ce7", secondary: "#a29bfe", emoji: "💜" },
];

const HEADER_STYLES: { value: BrandingData["header_style"]; label: string; desc: string }[] = [
  { value: "centered", label: "Centered", desc: "Logo & name centered" },
  { value: "left-aligned", label: "Left Aligned", desc: "Logo left, professional" },
  { value: "gradient", label: "Gradient", desc: "Dual-color gradient header" },
  { value: "minimal", label: "Minimal", desc: "Clean line separator" },
];

const SOCIAL_PLATFORMS = [
  { key: "social_facebook", label: "Facebook", icon: Facebook, placeholder: "https://facebook.com/yourpage", color: "#1877F2" },
  { key: "social_instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/yourpage", color: "#E4405F" },
  { key: "social_twitter", label: "Twitter / X", icon: Twitter, placeholder: "https://twitter.com/yourhandle", color: "#1DA1F2" },
  { key: "social_linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/company/your", color: "#0A66C2" },
  { key: "social_youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@yourchannel", color: "#FF0000" },
] as const;

// ─── Social Icons SVG for Email (inline) ────────────────
const socialIconSvg = (platform: string, color: string) => {
  const icons: Record<string, string> = {
    social_facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    social_instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    social_twitter: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    social_linkedin: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    social_youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  };
  return icons[platform] || "";
};

// ─── Component ──────────────────────────────────────────
const EmailBrandingTab = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [settingsTab, setSettingsTab] = useState("identity");

  const [branding, setBranding] = useState<BrandingData>({
    logo_url: "",
    brand_color: "#4f46e5",
    secondary_color: "#818cf8",
    company_name: "",
    tagline: "",
    footer_text: "",
    website_url: "",
    font_family: "Arial, sans-serif",
    border_radius: "8px",
    header_style: "centered",
    social_facebook: "",
    social_instagram: "",
    social_twitter: "",
    social_linkedin: "",
    social_youtube: "",
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("email_branding")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          const sl = typeof data.social_links === "object" && data.social_links !== null
            ? data.social_links as Record<string, string>
            : {};
          setBranding({
            logo_url: data.logo_url ?? "",
            brand_color: data.brand_color || "#4f46e5",
            secondary_color: sl._secondary_color || "#818cf8",
            company_name: data.company_name || "",
            tagline: sl._tagline || "",
            footer_text: data.footer_text || "",
            website_url: data.website_url || "",
            font_family: sl._font_family || "Arial, sans-serif",
            border_radius: sl._border_radius || "8px",
            header_style: (sl._header_style as BrandingData["header_style"]) || "centered",
            social_facebook: sl.facebook || "",
            social_instagram: sl.instagram || "",
            social_twitter: sl.twitter || "",
            social_linkedin: sl.linkedin || "",
            social_youtube: sl.youtube || "",
          });
        }
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      logo_url: branding.logo_url,
      brand_color: branding.brand_color,
      company_name: branding.company_name,
      footer_text: branding.footer_text,
      website_url: branding.website_url,
      social_links: {
        _secondary_color: branding.secondary_color,
        _font_family: branding.font_family,
        _border_radius: branding.border_radius,
        _header_style: branding.header_style,
        _tagline: branding.tagline,
        facebook: branding.social_facebook,
        instagram: branding.social_instagram,
        twitter: branding.social_twitter,
        linkedin: branding.social_linkedin,
        youtube: branding.social_youtube,
      },
      user_id: user.id,
    };
    const { error } = existingId
      ? await supabase.from("email_branding").update(payload).eq("id", existingId)
      : await supabase.from("email_branding").insert(payload);
    if (error) toast.error(error.message);
    else toast.success("✅ Branding saved!");
    setSaving(false);
  };

  const handleTestEmail = async () => {
    if (!activeStore || !testEmail) { toast.error("Enter a test email"); return; }
    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-store-email", {
        body: {
          store_id: activeStore.id,
          test_email: testEmail,
          subject: `${branding.company_name || "Your Store"} — Branding Preview`,
          body: `<h2 style="color:${branding.brand_color}">Welcome!</h2>
<p>This is a branded email preview showing your custom design.</p>
<p>Your subscription for <strong>"Premium Plan"</strong> expires on <strong>2026-05-01</strong>.</p>
[CTA:{"text":"Renew Now","url":"${branding.website_url || "https://example.com"}","color":"${branding.brand_color}"}]`,
        },
      });
      if (error) throw error;
      if (data?.success) toast.success("✅ Branded test email sent!");
      else toast.error(`❌ Failed: ${data?.error}`);
    } catch (e: any) { toast.error(e.message); }
    setTestSending(false);
  };

  const applyTheme = (t: typeof COLOR_THEMES[0]) => {
    setBranding((p) => ({ ...p, brand_color: t.primary, secondary_color: t.secondary }));
  };

  const activeSocials = SOCIAL_PLATFORMS.filter((p) => branding[p.key as keyof BrandingData]);

  // ─── Header HTML Builder ──────────────────────────────
  const buildHeaderHtml = (b: BrandingData) => {
    const logoHtml = b.logo_url ? `<img src="${b.logo_url}" alt="Logo" style="height:44px;margin-bottom:8px;" />` : "";
    const nameHtml = `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${b.company_name || "Your Company"}</h1>`;
    const taglineHtml = b.tagline ? `<p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;font-weight:400;">${b.tagline}</p>` : "";

    switch (b.header_style) {
      case "left-aligned":
        return `<div style="background:${b.brand_color};padding:28px 32px;display:flex;align-items:center;">
          <div>${logoHtml}<div style="text-align:left">${nameHtml}${taglineHtml}</div></div>
        </div>`;
      case "gradient":
        return `<div style="background:linear-gradient(135deg, ${b.brand_color}, ${b.secondary_color});padding:32px;text-align:center;">
          ${logoHtml}${nameHtml}${taglineHtml}
        </div>`;
      case "minimal":
        return `<div style="padding:28px 32px 20px;text-align:center;border-bottom:3px solid ${b.brand_color};">
          ${b.logo_url ? `<img src="${b.logo_url}" alt="Logo" style="height:36px;margin-bottom:8px;" />` : ""}
          <h1 style="color:${b.brand_color};margin:0;font-size:22px;font-weight:800;">${b.company_name || "Your Company"}</h1>
          ${b.tagline ? `<p style="color:#6b7280;margin:4px 0 0;font-size:13px;">${b.tagline}</p>` : ""}
        </div>`;
      default: // centered
        return `<div style="background:${b.brand_color};padding:32px;text-align:center;">
          ${logoHtml}${nameHtml}${taglineHtml}
        </div>`;
    }
  };

  // ─── Social Links HTML Builder ────────────────────────
  const buildSocialHtml = (b: BrandingData) => {
    const links = SOCIAL_PLATFORMS
      .filter((p) => b[p.key as keyof BrandingData])
      .map((p) => {
        const url = b[p.key as keyof BrandingData] as string;
        return `<a href="${url}" style="display:inline-block;margin:0 6px;text-decoration:none;" target="_blank">${socialIconSvg(p.key, "#9ca3af")}</a>`;
      });
    if (links.length === 0) return "";
    return `<div style="margin:12px 0 4px;text-align:center;">${links.join("")}</div>`;
  };

  // ─── Preview HTML ─────────────────────────────────────
  const previewHtml = useMemo(() => {
    const b = branding;
    const isDark = previewTheme === "dark";
    const bgColor = isDark ? "#1a1a2e" : "#ffffff";
    const textColor = isDark ? "#e2e8f0" : "#374151";
    const mutedColor = isDark ? "#94a3b8" : "#6b7280";
    const borderColor = isDark ? "#334155" : "#e5e7eb";
    const footerBg = isDark ? "#0f172a" : "#f9fafb";

    return `
      <div style="font-family:${b.font_family};max-width:600px;margin:0 auto;background:${bgColor};border-radius:${b.border_radius};overflow:hidden;border:1px solid ${borderColor};">
        ${buildHeaderHtml(b)}
        <div style="padding:32px;">
          <h2 style="color:${b.brand_color};font-size:18px;margin:0 0 16px;font-weight:700;">Hello Customer! 👋</h2>
          <p style="color:${textColor};font-size:14px;line-height:1.7;margin:0 0 16px;">
            This is a preview of your branded email. All campaign and automation emails will use this design.
          </p>
          <p style="color:${mutedColor};font-size:14px;line-height:1.7;margin:0 0 24px;">
            Your subscription for <strong style="color:${textColor};">"Premium Plan"</strong> will expire on <strong style="color:${textColor};">2026-05-01</strong>. Renew to continue.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="#" style="display:inline-block;padding:14px 36px;background:${b.brand_color};color:#ffffff;border-radius:${b.border_radius};text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
              Renew Now →
            </a>
          </div>
          <div style="border-top:1px solid ${borderColor};margin-top:28px;padding-top:16px;">
            <p style="color:${mutedColor};font-size:12px;margin:0;">
              Need help? Reply to this email or visit our website.
            </p>
          </div>
        </div>
        <div style="background:${footerBg};padding:24px 32px;border-top:1px solid ${borderColor};text-align:center;">
          ${buildSocialHtml(b)}
          <p style="color:${mutedColor};font-size:12px;margin:8px 0 4px;">${b.footer_text || "© 2026 Your Company. All rights reserved."}</p>
          ${b.website_url ? `<a href="${b.website_url}" style="color:${b.brand_color};font-size:12px;text-decoration:none;font-weight:500;">${b.website_url}</a>` : ""}
        </div>
      </div>`;
  }, [branding, previewTheme]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ─── Hero Header ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <Palette className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold tracking-tight truncate">Email Branding Studio</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">Design professional branded emails for your campaigns</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {existingId && (
              <Badge className="gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15 text-xs">
                <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Active
              </Badge>
            )}
            <Button onClick={save} disabled={saving} size="sm" className="gap-2 shadow-md">
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving..." : "Save All"}
            </Button>
          </div>
        </div>
        <div className="absolute top-3 right-3 opacity-10 hidden sm:block">
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
        {/* ─── Settings Panel ─────────────────────────── */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {/* Quick Themes */}
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Wand2 className="h-3.5 w-3.5 text-primary" /> Quick Themes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.name}
                    onClick={() => applyTheme(theme)}
                    className={`group relative rounded-xl p-2 border-2 transition-all duration-200 hover:scale-[1.05] hover:shadow-md ${
                      branding.brand_color === theme.primary
                        ? "border-primary shadow-md shadow-primary/10"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-0.5 mb-1">
                      <div className="h-4 w-4 rounded-full shadow-inner" style={{ backgroundColor: theme.primary }} />
                      <div className="h-3 w-3 rounded-full shadow-inner" style={{ backgroundColor: theme.secondary }} />
                    </div>
                    <p className="text-[9px] font-semibold text-muted-foreground leading-tight truncate">{theme.emoji} {theme.name}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabbed Settings */}
          <Tabs value={settingsTab} onValueChange={setSettingsTab}>
            <TabsList className="w-full grid grid-cols-4 h-auto sm:h-9 p-1">
              <TabsTrigger value="identity" className="text-[10px] sm:text-xs gap-1 px-1 py-1.5 flex-col sm:flex-row"><Image className="h-3 w-3" /> <span>Identity</span></TabsTrigger>
              <TabsTrigger value="style" className="text-[10px] sm:text-xs gap-1 px-1 py-1.5 flex-col sm:flex-row"><Palette className="h-3 w-3" /> <span>Style</span></TabsTrigger>
              <TabsTrigger value="social" className="text-[10px] sm:text-xs gap-1 px-1 py-1.5 flex-col sm:flex-row"><Globe className="h-3 w-3" /> <span>Social</span></TabsTrigger>
              <TabsTrigger value="layout" className="text-[10px] sm:text-xs gap-1 px-1 py-1.5 flex-col sm:flex-row"><LayoutTemplate className="h-3 w-3" /> <span>Layout</span></TabsTrigger>
            </TabsList>

            {/* Identity Tab */}
            <TabsContent value="identity" className="mt-4 space-y-4">
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Company Name</Label>
                    <Input value={branding.company_name} onChange={(e) => setBranding({ ...branding, company_name: e.target.value })} placeholder="Your Business Name" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tagline</Label>
                    <Input value={branding.tagline} onChange={(e) => setBranding({ ...branding, tagline: e.target.value })} placeholder="Your catchy tagline here" />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Logo URL</Label>
                    <Input value={branding.logo_url} onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })} placeholder="https://example.com/logo.png" />
                    {branding.logo_url && (
                      <div className="mt-2 p-4 border rounded-xl bg-muted/20 inline-flex items-center gap-3">
                        <img src={branding.logo_url} alt="Logo" className="h-10 object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
                        <span className="text-xs text-muted-foreground">Logo loaded ✓</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Website</Label>
                    <Input value={branding.website_url} onChange={(e) => setBranding({ ...branding, website_url: e.target.value })} placeholder="https://mybusiness.com" />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Footer Text</Label>
                    <Textarea value={branding.footer_text} onChange={(e) => setBranding({ ...branding, footer_text: e.target.value })} placeholder="© 2026 My Business. All rights reserved." rows={2} className="resize-none" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Style Tab */}
            <TabsContent value="style" className="mt-4 space-y-4">
              <Card>
                <CardContent className="pt-5 space-y-5">
                  {/* Colors */}
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 block">Brand Colors</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground">Primary</span>
                        <div className="flex gap-1.5 items-center">
                          <div className="relative shrink-0">
                            <Input type="color" className="h-9 w-9 p-0.5 cursor-pointer rounded-lg border-2" value={branding.brand_color} onChange={(e) => setBranding({ ...branding, brand_color: e.target.value })} />
                          </div>
                          <Input value={branding.brand_color} onChange={(e) => setBranding({ ...branding, brand_color: e.target.value })} className="flex-1 min-w-0 font-mono text-xs h-9" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground">Secondary</span>
                        <div className="flex gap-1.5 items-center">
                          <Input type="color" className="h-9 w-9 p-0.5 cursor-pointer rounded-lg border-2 shrink-0" value={branding.secondary_color} onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })} />
                          <Input value={branding.secondary_color} onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })} className="flex-1 min-w-0 font-mono text-xs h-9" />
                        </div>
                      </div>
                    </div>
                    {/* Color preview strip */}
                    <div className="flex mt-3 rounded-lg overflow-hidden h-3">
                      <div className="flex-1" style={{ backgroundColor: branding.brand_color }} />
                      <div className="flex-1" style={{ background: `linear-gradient(90deg, ${branding.brand_color}, ${branding.secondary_color})` }} />
                      <div className="flex-1" style={{ backgroundColor: branding.secondary_color }} />
                    </div>
                  </div>

                  <Separator />

                  {/* Typography */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Typography</Label>
                    <Select value={branding.font_family} onValueChange={(v) => setBranding({ ...branding, font_family: v })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            <div className="flex items-baseline gap-2">
                              <span style={{ fontFamily: f.value }} className="font-semibold">{f.label}</span>
                              <span className="text-xs text-muted-foreground">{f.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Border Radius */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Corner Style</Label>
                    <div className="flex gap-1.5">
                      {RADIUS_OPTIONS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setBranding({ ...branding, border_radius: r.value })}
                          className={`flex-1 py-2 px-1 text-center text-[10px] font-semibold border-2 transition-all ${
                            branding.border_radius === r.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                          style={{ borderRadius: r.value }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Social Media Links</CardTitle>
                  <CardDescription className="text-xs">Add links to display clickable social icons in your email footer</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const Icon = platform.icon;
                    const val = branding[platform.key as keyof BrandingData] as string;
                    return (
                      <div key={platform.key} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: val ? platform.color + "15" : undefined }}>
                            <Icon className="h-3.5 w-3.5" style={{ color: val ? platform.color : undefined }} />
                          </div>
                          <span className="text-xs font-semibold flex-1">{platform.label}</span>
                          {val && <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">Active</Badge>}
                        </div>
                        <Input
                          value={val}
                          onChange={(e) => setBranding({ ...branding, [platform.key]: e.target.value })}
                          placeholder={platform.placeholder}
                          className="h-8 text-xs"
                        />
                      </div>
                    );
                  })}
                  {activeSocials.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-[10px] text-muted-foreground font-medium mb-2">Preview in footer:</p>
                      <div className="flex items-center justify-center gap-3 p-3 bg-muted/30 rounded-lg">
                        {activeSocials.map((p) => {
                          const Icon = p.icon;
                          return (
                            <a key={p.key} href={branding[p.key as keyof BrandingData] as string} target="_blank" rel="noopener noreferrer"
                              className="h-8 w-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 border"
                              style={{ borderColor: p.color + "40" }}
                            >
                              <Icon className="h-4 w-4" style={{ color: p.color }} />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Layout Tab */}
            <TabsContent value="layout" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Header Style</CardTitle>
                  <CardDescription className="text-xs">Choose how your email header appears</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {HEADER_STYLES.map((style) => (
                      <button
                        key={style.value}
                        onClick={() => setBranding({ ...branding, header_style: style.value })}
                        className={`p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm ${
                          branding.header_style === style.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        {/* Mini preview */}
                        <div className="h-8 rounded-md mb-2 overflow-hidden" style={{
                          background: style.value === "gradient"
                            ? `linear-gradient(135deg, ${branding.brand_color}, ${branding.secondary_color})`
                            : style.value === "minimal"
                              ? "transparent"
                              : branding.brand_color,
                          borderBottom: style.value === "minimal" ? `3px solid ${branding.brand_color}` : undefined,
                        }}>
                          <div className={`h-full flex items-center ${
                            style.value === "left-aligned" ? "justify-start px-2" :
                            style.value === "minimal" ? "justify-center" : "justify-center"
                          }`}>
                            <div className={`h-2 rounded-full ${style.value === "minimal" ? "bg-foreground/20" : "bg-white/50"}`} style={{ width: "40%" }} />
                          </div>
                        </div>
                        <p className="text-xs font-bold">{style.label}</p>
                        <p className="text-[10px] text-muted-foreground">{style.desc}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Test Email */}
          <Card className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Send className="h-3.5 w-3.5 text-primary" /> Send Test Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com" type="email" className="flex-1 h-9" />
                <Button size="sm" onClick={handleTestEmail} disabled={testSending || !testEmail} className="h-9 px-4">
                  {testSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1.5" />Send</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Live Preview Panel ─────────────────────── */}
        <div className="lg:col-span-3">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" /> Live Preview
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Dark/Light toggle */}
                  <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                    <Button variant={previewTheme === "light" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewTheme("light")}>
                      <Sun className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant={previewTheme === "dark" ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewTheme("dark")}>
                      <Moon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Device toggle */}
                  <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                    <Button variant={previewMode === "desktop" ? "default" : "ghost"} size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={() => setPreviewMode("desktop")}>
                      <Monitor className="h-3.5 w-3.5" /> Desktop
                    </Button>
                    <Button variant={previewMode === "mobile" ? "default" : "ghost"} size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={() => setPreviewMode("mobile")}>
                      <Smartphone className="h-3.5 w-3.5" /> Mobile
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`rounded-xl p-4 transition-all duration-300 ${
                previewTheme === "dark" ? "bg-slate-900" : "bg-muted/30"
              } ${previewMode === "mobile" ? "max-w-[375px] mx-auto" : ""}`}>
                {/* Email client chrome */}
                <div className={`rounded-lg border shadow-sm overflow-hidden ${previewTheme === "dark" ? "bg-slate-800 border-slate-700" : "bg-background"}`}>
                  <div className={`px-4 py-2.5 border-b flex items-center gap-3 ${previewTheme === "dark" ? "bg-slate-800/50 border-slate-700" : "bg-muted/50"}`}>
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] truncate ${previewTheme === "dark" ? "text-slate-400" : "text-muted-foreground"}`}>
                        From: {branding.company_name || "Your Store"} &lt;noreply@store.com&gt;
                      </p>
                      <p className={`text-[10px] font-semibold truncate ${previewTheme === "dark" ? "text-slate-200" : "text-foreground"}`}>
                        Subject: Your subscription needs renewal — {branding.company_name || "Store"}
                      </p>
                    </div>
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>

              {/* Info bar */}
              <div className="mt-3 flex items-center justify-between px-1">
                <p className="text-[10px] text-muted-foreground">
                  {previewMode === "desktop" ? "600px" : "375px"} width • {previewTheme === "dark" ? "Dark" : "Light"} mode • {activeSocials.length} social link{activeSocials.length !== 1 ? "s" : ""}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {branding.header_style} header
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EmailBrandingTab;
