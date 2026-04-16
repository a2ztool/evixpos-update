import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { validateWithToast, loginSchema, signupSchema } from "@/lib/validations";
import { useAuth } from "@/contexts/AuthContext";
import {
  ShieldCheck, Zap, BarChart3, Package, Users, CreditCard,
  Eye, EyeOff, ArrowRight, Gift, Store, Bot, ShoppingCart, FileText, Crown,
} from "lucide-react";
import evixIcon from "@/assets/evixpos-icon.png";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchParams] = useSearchParams();

  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";

  useEffect(() => {
    if (!session) return;
    const checkAdminRedirect = async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleData) {
        navigate("/admin/dashboard");
      } else {
        navigate("/dashboard");
      }
    };
    checkAdminRedirect();
  }, [session, navigate]);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateWithToast(loginSchema, { email, password }, toast.error);
    if (!parsed) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.email, password: parsed.password });
    if (error) {
      toast.error(error.message);
    } else if (data.user) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleData) {
        navigate("/admin/dashboard");
      } else {
        navigate("/dashboard");
      }
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
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
        toast.error("Invalid referral code. Please check and try again.");
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
      toast.error(error.message);
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) toast.error(error.message);
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
    else toast.success("Password reset link sent to your email!");
  };

  const orbitFeatures = [
    { label: "Orders", icon: ShoppingCart },
    { label: "Inventory", icon: Package },
    { label: "Analytics", icon: BarChart3 },
    { label: "Payments", icon: CreditCard },
    { label: "Customers", icon: Users },
    { label: "Automation", icon: Bot },
    { label: "Multi-Store", icon: Store },
    { label: "Reports", icon: FileText },
    { label: "POS", icon: Zap },
    { label: "Plans", icon: Crown },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/8">
      {/* Global subtle background blobs */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[180px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/4 blur-[150px] pointer-events-none" />

      {/* ── Left: Visual Hub Section ── */}
      <div className="hidden lg:flex lg:w-[52%] relative items-center justify-center p-8">
        <div className="relative flex flex-col items-center animate-fade-in">
          {/* Title */}
          <h1 className="text-3xl font-bold tracking-tight text-center mb-1.5 leading-tight">
            Run Your Entire Business.
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              One Platform.
            </span>
          </h1>
          <p className="text-muted-foreground text-sm mb-10 text-center max-w-sm">
            Manage orders, customers, payments & automation — all in one POS.
          </p>

          {/* Central Hub with Orbit — circle-centered layout */}
          <div className="relative w-[420px] h-[420px]">
            {/* Orbit rings — centered on logo */}
            <div className="absolute inset-[35px] rounded-full border border-primary/10 animate-[spin_60s_linear_infinite]" />
            <div className="absolute inset-[60px] rounded-full border border-primary/8 animate-[spin_45s_linear_infinite_reverse]" />
            <div className="absolute inset-[85px] rounded-full border border-dashed border-primary/6" />

            {/* Soft glow behind logo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-44 h-44 rounded-full bg-primary/10 blur-[60px]" />

            {/* Center logo — circle center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110px] h-[110px] rounded-full bg-card/90 backdrop-blur-xl border border-border/50 shadow-2xl shadow-primary/15 flex items-center justify-center z-20">
              <img src={evixIcon} alt="EvixPOS" className="h-[80px] w-[80px] rounded-full" />
            </div>

            {/* Orbit feature items — positioned relative to circle center */}
            {orbitFeatures.map((feature, i) => {
              const angle = (360 / orbitFeatures.length) * i - 90;
              const radius = 190;
              const x = Math.cos((angle * Math.PI) / 180) * radius;
              const y = Math.sin((angle * Math.PI) / 180) * radius;
              return (
                <div
                  key={feature.label}
                  className="absolute z-10"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: "translate(-50%, -50%)",
                    animation: `floatBadge 4s ease-in-out ${i * 0.3}s infinite`,
                  }}
                >
                  <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur-md border border-border/40 rounded-full px-3 py-1.5 shadow-md hover:shadow-lg hover:bg-card/95 transition-all duration-300 cursor-default">
                    <feature.icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] font-semibold whitespace-nowrap text-foreground">{feature.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom stats — premium compact */}
          <div className="flex gap-4 mt-8">
            {[
              { value: "10K+", label: "Users" },
              { value: "50K+", label: "Orders/Day" },
              { value: "99.9%", label: "Uptime" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card/70 backdrop-blur-md border border-border/30 rounded-2xl px-6 py-3 text-center hover:bg-card/90 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-default group"
              >
                <p className="text-lg font-bold text-primary group-hover:scale-105 transition-transform">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Auth Form ── */}
      <div className="w-full lg:w-[48%] flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold tracking-tight">
                evix<span className="text-primary">Pos</span>
              </span>
            </div>
          </div>

          {/* Glassmorphism card */}
          <div className="rounded-2xl border border-border/40 bg-card/70 backdrop-blur-xl shadow-2xl shadow-black/5 p-7 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Welcome back!</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Enter your credentials to continue
              </p>
            </div>

            {/* Google Login */}
            <Button
              variant="outline"
              className="w-full h-11 gap-3 font-medium mb-5 rounded-xl bg-card/50 hover:bg-card/80 border-border/50 transition-all duration-200"
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
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/70 backdrop-blur-sm px-3 text-muted-foreground font-medium">or</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue={defaultTab}>
              <TabsList className="grid w-full grid-cols-2 mb-5 h-11 rounded-xl bg-muted/40 backdrop-blur-sm">
                <TabsTrigger value="login" className="rounded-lg font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">Sign Up</TabsTrigger>
              </TabsList>

              {/* Login */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 rounded-xl bg-card/50 border-border/40 focus:border-primary/50 focus:bg-card/80 transition-all duration-200"
                      placeholder="name@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-11 rounded-xl pr-10 bg-card/50 border-border/40 focus:border-primary/50 focus:bg-card/80 transition-all duration-200"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground gap-2 shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30"
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign In"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </TabsContent>

              {/* Signup */}
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                    <Input
                      id="signup-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="h-11 rounded-xl bg-card/50 border-border/40 focus:border-primary/50 focus:bg-card/80 transition-all duration-200"
                      placeholder="Your full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-sm font-medium">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 rounded-xl bg-card/50 border-border/40 focus:border-primary/50 focus:bg-card/80 transition-all duration-200"
                      placeholder="name@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="h-11 rounded-xl pr-10 bg-card/50 border-border/40 focus:border-primary/50 focus:bg-card/80 transition-all duration-200"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-referral" className="text-sm font-medium flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-primary" />
                      Referral Code
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="signup-referral"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      className="h-11 rounded-xl font-mono tracking-wider uppercase bg-card/50 border-border/40 focus:border-primary/50 focus:bg-card/80 transition-all duration-200"
                      placeholder="XXXXXXXX"
                      maxLength={8}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground gap-2 shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30"
                    disabled={loading}
                  >
                    {loading ? "Creating account..." : "Create Account"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              By continuing, you agree to our{" "}
              <a href="#" className="text-primary hover:underline font-medium">Terms of Service</a>
              {" "}and{" "}
              <a href="#" className="text-primary hover:underline font-medium">Privacy Policy</a>
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            © {new Date().getFullYear()} EvixPOS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
