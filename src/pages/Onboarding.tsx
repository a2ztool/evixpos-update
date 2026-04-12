import { useState, useEffect } from "react";
import brandLogo from "@/assets/evixPos.png";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, Lang } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, ArrowRight, Shield, Zap, Sparkles, Link2, User, Languages, Coins } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "en", label: "🇺🇸 English" },
  { code: "bn", label: "🇧🇩 বাংলা" },
  { code: "hi", label: "🇮🇳 हिन्दी" },
];

const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "₹ INR" },
  { code: "BDT", symbol: "৳", label: "৳ BDT" },
  { code: "USD", symbol: "$", label: "$ USD" },
];

const Onboarding = () => {
  const { user, loading: authLoading } = useAuth();
  const { stores, loading: storeLoading, createStore } = useStore();
  const { setLang } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("INR");
  const [creating, setCreating] = useState(false);

  // Redirect returning users (who already have stores) to dashboard
  useEffect(() => {
    if (!authLoading && !storeLoading) {
      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }
      if (stores.length > 0) {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [user, stores, authLoading, storeLoading, navigate]);

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  const handleStoreNameChange = (val: string) => {
    setStoreName(val);
    setStoreSlug(generateSlug(val));
  };

  const handleCreate = async () => {
    if (!storeName.trim()) {
      toast.error("Please enter a store name");
      return;
    }
    setCreating(true);

    // Update profile name if provided
    if (fullName.trim() && user) {
      await supabase.from("profiles").update({ name: fullName.trim() }).eq("id", user.id);
    }

    const store = await createStore(storeName.trim(), "", "");
    if (store && user) {
      // Save business settings with selected language & currency
      await supabase.from("business_settings").insert({
        user_id: user.id,
        store_id: store.id,
        store_slug: storeSlug || generateSlug(storeName),
        app_language: language,
        default_currency: currency,
        business_name: storeName.trim(),
        currencies: [
          { code: "INR", symbol: "₹", rate: 1 },
          { code: "BDT", symbol: "৳", rate: 0.98 },
          { code: "USD", symbol: "$", rate: 0.012 },
        ],
      });

      // Apply language immediately
      setLang(language as Lang);

      toast.success("Store created successfully!");
      navigate("/dashboard", { replace: true });
    } else {
      toast.error("Failed to create store");
    }
    setCreating(false);
  };

  // Show loading while checking auth/store state
  if (authLoading || storeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Don't render form if user already has stores (will redirect)
  if (stores.length > 0) return null;

  const totalSteps = 4;
  const currentProgress = step;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border/50 rounded-xl px-5 py-3 shadow-sm mb-6">
            <img src={brandLogo} alt="EvixPOS" className="h-8 w-auto" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to EvixPOS!</h1>
          <p className="text-muted-foreground">Set up your business in under a minute</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8 px-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                i < currentProgress ? "bg-primary" : "bg-primary/20"
              }`}
            />
          ))}
        </div>

        {/* Form card */}
        <Card className="border-border/50 shadow-xl bg-background/80 backdrop-blur-sm">
          <CardContent className="p-8 space-y-6">
            {/* Your Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-primary" />
                Your Name
              </Label>
              <Input
                placeholder="Enter your full name"
                value={fullName}
                onChange={e => { setFullName(e.target.value); if (step < 2) setStep(1); }}
                onFocus={() => setStep(1)}
                className="h-11 bg-muted/50 border-border/50"
              />
            </div>

            {/* Store Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Store className="h-4 w-4 text-primary" />
                Store Name
              </Label>
              <Input
                placeholder="My Store"
                value={storeName}
                onChange={e => { handleStoreNameChange(e.target.value); if (step < 3) setStep(2); }}
                onFocus={() => { if (step < 2) setStep(2); }}
                className="h-11 bg-muted/50 border-border/50"
              />
            </div>

            {/* Store URL (Slug) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4 text-primary" />
                Store URL (Slug)
              </Label>
              <div className="flex">
                <div className="flex items-center px-3 bg-muted border border-r-0 border-border/50 rounded-l-md text-sm text-muted-foreground whitespace-nowrap">
                  evixpos.com/f/
                </div>
                <Input
                  placeholder="my-store-name"
                  value={storeSlug}
                  onChange={e => { setStoreSlug(generateSlug(e.target.value)); setStep(3); }}
                  onFocus={() => setStep(3)}
                  className="h-11 bg-muted/50 border-border/50 rounded-l-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your public forms will be accessible at: <span className="text-primary font-medium">evixpos.com/f/{storeSlug || "..."}</span>
              </p>
            </div>

            {/* Language & Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Languages className="h-4 w-4 text-primary" />
                  Language
                </Label>
                <Select value={language} onValueChange={(v) => { setLanguage(v); setStep(4); }}>
                  <SelectTrigger className="h-11 bg-muted/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Coins className="h-4 w-4 text-primary" />
                  Currency
                </Label>
                <Select value={currency} onValueChange={(v) => { setCurrency(v); setStep(4); }}>
                  <SelectTrigger className="h-11 bg-muted/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating || !storeName.trim()}
              className="w-full h-12 text-base font-semibold gap-2"
            >
              {creating ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <>Get Started <ArrowRight className="h-5 w-5" /></>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-primary" /> Secure</span>
          <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-primary" /> Quick Setup</span>
          <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-primary" /> Free Forever</span>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3">© 2026 EvixPOS.com</p>
      </div>
    </div>
  );
};

export default Onboarding;
