import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { loginSchema, signupSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import { useAuth } from "@/contexts/AuthContext";
import {
  Zap, Eye, EyeOff, ArrowRight, Gift, Check, Sparkles,
  ShieldCheck, Lock, Star, TrendingUp, Globe, Award,
} from "lucide-react";
import evixLogo from "@/assets/evixpos-logo.png";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [pwStrength, setPwStrength] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchParams] = useSearchParams();

  // Detect OAuth callback (Supabase returns tokens in hash, or `code` query for PKCE)
  const isOAuthCallback =
    typeof window !== "undefined" &&
    (window.location.hash.includes("access_token") ||
      window.location.hash.includes("error") ||
      searchParams.has("code"));
  const [processingOAuth, setProcessingOAuth] = useState(isOAuthCallback);

  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";

  // Rotating brand highlights (testimonial-style strip)
  const highlights = [
    { icon: Star, text: "Rated 4.9/5 by 5,000+ business owners", accent: "Trusted" },
    { icon: TrendingUp, text: "Boost sales up to 32% in first 90 days", accent: "Proven" },
    { icon: Globe, text: "Used by 500+ stores across 12 countries", accent: "Global" },
    { icon: Award, text: "Award-winning POS & business automation", accent: "Premium" },
  ];

  useEffect(() => {
    const t = setInterval(() => setHighlightIdx((i) => (i + 1) % highlights.length), 3500);
    return () => clearInterval(t);
  }, [highlights.length]);

  useEffect(() => {
    if (!session) return;
    const checkAdminRedirect = async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      // Clean OAuth params from URL before navigating
      if (window.location.hash || searchParams.has("code")) {
        window.history.replaceState({}, document.title, "/auth");
      }
      navigate(roleData ? "/admin/dashboard" : "/dashboard", { replace: true });
    };
    checkAdminRedirect();
  }, [session, navigate, searchParams]);

  // Safety: if OAuth callback hash exists but session never resolves, stop spinner
  useEffect(() => {
    if (!processingOAuth) return;
    const t = setTimeout(() => setProcessingOAuth(false), 8000);
    return () => clearTimeout(t);
  }, [processingOAuth]);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  // Password strength meter
  useEffect(() => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) s++;
    setPwStrength(s);
  }, [password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateWithToast(loginSchema, { email, password }, toast.error);
    if (!parsed) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.email, password: parsed.password });
    if (error) {
      if (error.message?.includes("Invalid login credentials")) toast.error("Invalid email or password.");
      else if (error.message?.includes("Email not confirmed")) toast.error("Please verify your email first.");
      else if (error.status === 429) toast.error("Too many attempts. Please wait.");
      else toast.error(error.message || "Login failed.");
    } else if (data.user) {
      // Block suspended owners + their staff
      const { data: staffRow } = await supabase
        .from("staff_members")
        .select("user_id")
        .eq("auth_user_id", data.user.id)
        .eq("is_active", true)
        .maybeSingle();
      const ownerId = staffRow?.user_id || data.user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_suspended")
        .eq("id", ownerId)
        .maybeSingle();
      if (profile?.is_suspended) {
        await supabase.auth.signOut();
        toast.error("Your account has been suspended. Please contact support.");
        setLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();
      navigate(roleData ? "/admin/dashboard" : "/dashboard");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      toast.error("Please accept the Terms of Service to continue.");
      return;
    }
    const parsed = validateWithToast(signupSchema, { name, email, password, referralCode: referralCode || undefined }, toast.error);
    if (!parsed) return;
    setLoading(true);

    let referrerId: string | null = null;
    if (referralCode.trim()) {
      const { data: refSettings } = await supabase
        .from("referral_settings")
        .select("user_id, id")
        .eq("referral_code", referralCode.trim().toUpperCase())
        .maybeSingle();

      if (!refSettings) {
        toast.error("Invalid referral code.");
        setLoading(false);
        return;
      }
      referrerId = refSettings.user_id;
      await supabase.rpc("has_role" as any).then(() => {});
      await supabase
        .from("referral_settings")
        .update({ total_clicks: (refSettings as any).total_clicks + 1 })
        .eq("id", refSettings.id);
    }

    const { data: signupData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, referral_code: referralCode.trim().toUpperCase() || null },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      if (error.message?.includes("already registered")) toast.error("Email already registered. Please sign in.");
      else if (error.status === 429) toast.error("Too many attempts. Please wait.");
      else toast.error(error.message || "Signup failed.");
      setLoading(false);
      return;
    }

    if (referrerId && signupData.user) {
      await supabase.from("referrals").insert({
        referrer_id: referrerId,
        referred_email: email,
        referred_user_id: signupData.user.id,
        status: "pending",
        plan: "free",
        commission_amount: 0,
        is_paid: false,
      });
    }

    toast.success("Account created! Check your email to confirm.");
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Please enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent!");
  };

  const Highlight = highlights[highlightIdx].icon;
  const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"][pwStrength];
  const strengthColor = ["bg-muted", "bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-primary"][pwStrength];

  // OAuth callback loading screen — shown while Supabase processes Google sign-in tokens
  if (processingOAuth && !session) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-primary/5 via-background to-background px-4">
        <img src={evixLogo} alt="EvixPos" className="h-12 w-auto mb-8" />
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
        <p className="text-sm font-medium text-foreground">Signing you in…</p>
        <p className="text-xs text-muted-foreground mt-1">Verifying your Google account</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-primary/5 via-background to-background relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[180px] pointer-events-none" />
      <div className="absolute -top-20 -right-40 w-[400px] h-[400px] rounded-full bg-primary/8 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full bg-primary/5 blur-[180px] pointer-events-none" />

      {/* Top Brand Bar — centered on mobile, split on desktop */}
      <header className="relative z-10 px-4 sm:px-8 py-4 flex items-center justify-center sm:justify-between">
        <button onClick={() => navigate("/")} className="flex items-center group">
          <img src={evixLogo} alt="EvixPos" className="h-9 sm:h-10 w-auto object-contain" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="font-medium">Bank-grade security · SOC 2 ready</span>
        </div>
      </header>

      {/* Rotating Highlight Strip */}
      <div className="relative z-10 px-4 sm:px-8 mb-4">
        <div className="mx-auto max-w-md sm:max-w-lg flex items-center justify-center gap-2 rounded-full bg-card/70 backdrop-blur-md border border-border/40 px-4 py-2 shadow-sm">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Highlight className="h-3.5 w-3.5" />
            {highlights[highlightIdx].accent}
          </span>
          <span className="text-xs sm:text-sm text-foreground/80 font-medium truncate transition-opacity duration-500">
            {highlights[highlightIdx].text}
          </span>
        </div>
      </div>

      {/* Main Content — Centered Card */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-8">
        <div className="w-full max-w-md animate-fade-in">
          {/* Hero header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold text-primary tracking-wide">
                #1 SaaS POS for modern businesses
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome to <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">EvixPos</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              Sign in to manage your entire business — anywhere, anytime.
            </p>
          </div>

          {/* Premium Glass Card */}
          <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-2xl shadow-2xl shadow-primary/5 p-6 sm:p-7">
            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

            <div className="relative">
              {/* Google Login */}
              <Button
                variant="outline"
                className="w-full h-11 gap-3 font-medium mb-4 rounded-xl bg-card hover:bg-muted/50 border-border/60 transition-all"
                onClick={handleGoogleLogin}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                  <span className="bg-card px-3 text-muted-foreground font-semibold">or use email</span>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue={defaultTab}>
                <TabsList className="grid w-full grid-cols-2 mb-5 h-11 rounded-xl bg-muted/50 p-1">
                  <TabsTrigger value="login" className="rounded-lg font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-lg font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">Create Account</TabsTrigger>
                </TabsList>

                {/* Login */}
                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email" className="text-sm font-medium">Email address</Label>
                      <Input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="h-11 rounded-xl bg-background/50 border-border/50 focus:border-primary/60"
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                        <button type="button" onClick={handleForgotPassword} className="text-xs font-semibold text-primary hover:underline">
                          Forgot?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoComplete="current-password"
                          className="h-11 rounded-xl pl-9 pr-10 bg-background/50 border-border/50 focus:border-primary/60"
                          placeholder="Enter password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Remember me — circular checkbox */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(v) => setRememberMe(!!v)}
                        className="h-4 w-4 rounded-full border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary [&_svg]:h-3 [&_svg]:w-3"
                      />
                      <Label htmlFor="remember" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
                        Keep me signed in for 30 days
                      </Label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 text-primary-foreground gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5"
                      disabled={loading}
                    >
                      {loading ? "Signing in..." : "Sign In Securely"}
                      {!loading && <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </form>
                </TabsContent>

                {/* Signup */}
                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                      <Input
                        id="signup-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoComplete="name"
                        className="h-11 rounded-xl bg-background/50 border-border/50 focus:border-primary/60"
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email" className="text-sm font-medium">Work Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="h-11 rounded-xl bg-background/50 border-border/50 focus:border-primary/60"
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password" className="text-sm font-medium">Create Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          className="h-11 rounded-xl pl-9 pr-10 bg-background/50 border-border/50 focus:border-primary/60"
                          placeholder="Min. 6 characters"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {/* Strength meter */}
                      {password.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="flex gap-1">
                            {[0, 1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className={`h-1 flex-1 rounded-full transition-colors ${i < pwStrength ? strengthColor : "bg-muted"}`}
                              />
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-medium">
                            Password strength: <span className="text-foreground">{strengthLabel}</span>
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-referral" className="text-sm font-medium flex items-center gap-1.5">
                        <Gift className="h-3.5 w-3.5 text-primary" />
                        Referral Code
                        <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                      </Label>
                      <Input
                        id="signup-referral"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        className="h-11 rounded-xl font-mono tracking-wider uppercase bg-background/50 border-border/50 focus:border-primary/60"
                        placeholder="XXXXXXXX"
                        maxLength={8}
                      />
                    </div>

                    {/* Terms */}
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox id="terms" checked={agreeTerms} onCheckedChange={(v) => setAgreeTerms(!!v)} className="mt-0.5" />
                      <Label htmlFor="terms" className="text-xs text-muted-foreground cursor-pointer leading-relaxed select-none">
                        I agree to the <a href="#" className="text-primary font-medium hover:underline">Terms</a> and <a href="#" className="text-primary font-medium hover:underline">Privacy Policy</a>
                      </Label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 text-primary-foreground gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5"
                      disabled={loading}
                    >
                      {loading ? "Creating account..." : "Start 14-day Free Trial"}
                      {!loading && <ArrowRight className="h-4 w-4" />}
                    </Button>

                    <p className="text-center text-[11px] text-muted-foreground">
                      No credit card required · Cancel anytime
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Trust strip below card */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            {[
              { icon: ShieldCheck, label: "256-bit SSL" },
              { icon: Check, label: "GDPR Ready" },
              { icon: Lock, label: "Encrypted" },
            ].map((t) => (
              <div key={t.label} className="flex items-center justify-center gap-1.5 rounded-lg bg-card/50 backdrop-blur-sm border border-border/30 py-2">
                <t.icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-medium text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-muted-foreground mt-6">
            © {new Date().getFullYear()} EvixPOS · All rights reserved · v2.0
          </p>
        </div>
      </main>
    </div>
  );
};

export default Auth;
