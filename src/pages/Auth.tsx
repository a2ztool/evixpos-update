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
  Eye, EyeOff, ArrowRight, Gift, Store, Bot,
} from "lucide-react";
import brandLogo from "@/assets/evixPos.png";
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
    // Check if user is admin → redirect to admin panel
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

  // Pre-fill referral code from URL
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
      // Check if this user is admin
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

    // Validate referral code if provided
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

      // Increment click count
      await supabase.rpc("has_role" as any).then(() => {}); // no-op, just for type
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

    // Create referral record if referral code was used
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

  const floatingBadges = [
    { label: "Inventory Tracking", icon: Package, color: "text-red-500", position: "top-[18%] left-[8%]" },
    { label: "Smart Analytics", icon: BarChart3, color: "text-orange-500", position: "top-[32%] right-[12%]" },
    { label: "Multi-Store Support", icon: Users, color: "text-blue-500", position: "top-[55%] right-[8%]" },
    { label: "Real-time Reports", icon: Clock, color: "text-yellow-500", position: "bottom-[28%] left-[5%]" },
    { label: "Secure & Fast", icon: ShieldCheck, color: "text-green-500", position: "bottom-[15%] right-[15%]" },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-[#016B61]/5 via-background to-[#016B61]/10 flex-col justify-center items-center p-12">
        {/* Decorative circles */}
        <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-[#016B61]/5 blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-[#016B61]/8 blur-3xl" />

        <div className="relative z-10 max-w-lg text-center">
          {/* Brand Logo */}
          <div className="inline-flex items-center gap-3 mb-10">
            <img src={brandLogo} alt="EvixPOS" className="h-12 w-auto" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
            Stop losing time to<br />
            <span className="text-[#016B61]">messy operations.</span>
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            All-in-one POS solution for modern businesses. Manage orders, inventory, and customers effortlessly.
          </p>

          {/* Floating Badges */}
          <div className="relative h-80 w-full">
            {/* Central illustration placeholder */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-gradient-to-br from-[#016B61]/10 to-[#016B61]/5 border-2 border-[#016B61]/10 flex items-center justify-center">
              <Zap className="h-16 w-16 text-[#016B61]/30" />
            </div>

            {floatingBadges.map((badge, i) => (
              <div
                key={i}
                className={`absolute ${badge.position} animate-fade-in`}
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border/50 rounded-full px-4 py-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 cursor-default">
                  <div className={`h-2 w-2 rounded-full ${badge.color.replace("text-", "bg-")}`} />
                  <span className="text-sm font-medium whitespace-nowrap">{badge.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-12 text-center">
          {[
            { value: "10K+", label: "Active Users" },
            { value: "50K+", label: "Orders/Day" },
            { value: "99.9%", label: "Uptime" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-bold text-[#016B61]">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-[#016B61] flex items-center justify-center shadow-lg shadow-[#016B61]/25">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight">
                evix<span className="text-[#016B61]">Pos</span>
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card shadow-xl shadow-black/5 p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Welcome back!</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Enter your credentials to access your account
              </p>
            </div>

            {/* Google Login */}
            <Button
              variant="outline"
              className="w-full h-11 gap-3 font-medium mb-5 hover:bg-muted/50 transition-colors"
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
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground font-medium">or continue with</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue={defaultTab}>
              <TabsList className="grid w-full grid-cols-2 mb-5 h-11 rounded-xl bg-muted/50">
                <TabsTrigger value="login" className="rounded-lg font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">Sign Up</TabsTrigger>
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
                      className="h-11 rounded-xl"
                      placeholder="name@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-medium text-[#016B61] hover:underline"
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
                        className="h-11 rounded-xl pr-10"
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
                    className="w-full h-11 rounded-xl font-semibold bg-[#016B61] hover:bg-[#015a52] text-white gap-2 shadow-lg shadow-[#016B61]/20 transition-all hover:shadow-xl hover:shadow-[#016B61]/30"
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
                      className="h-11 rounded-xl"
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
                      className="h-11 rounded-xl"
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
                        className="h-11 rounded-xl pr-10"
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
                      <Gift className="h-3.5 w-3.5 text-[#016B61]" />
                      Referral Code
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="signup-referral"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      className="h-11 rounded-xl font-mono tracking-wider uppercase"
                      placeholder="XXXXXXXX"
                      maxLength={8}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-semibold bg-[#016B61] hover:bg-[#015a52] text-white gap-2 shadow-lg shadow-[#016B61]/20 transition-all hover:shadow-xl hover:shadow-[#016B61]/30"
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
              <a href="#" className="text-[#016B61] hover:underline font-medium">Terms of Service</a>
              {" "}and{" "}
              <a href="#" className="text-[#016B61] hover:underline font-medium">Privacy Policy</a>
            </p>
          </div>

          {/* Powered by */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            © {new Date().getFullYear()} EvixPOS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
