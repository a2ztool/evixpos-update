import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import evixLogo from "@/assets/evixpos-logo.png";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !/^\S+@\S+\.\S+$/.test(clean)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("send-email-otp", {
      body: { email: clean, purpose: "reset" },
    });
    const errMsg = (data as any)?.error || error?.message;
    setLoading(false);
    if (errMsg) {
      toast.error(errMsg);
      return;
    }
    toast.success("Verification code sent to your email.");
    navigate("/auth/verify-otp", { state: { email: clean, mode: "reset" } });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-primary/5 via-background to-background relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[180px] pointer-events-none" />
      <div className="absolute -top-20 -right-40 w-[400px] h-[400px] rounded-full bg-primary/8 blur-[150px] pointer-events-none" />

      <header className="relative z-10 px-4 sm:px-8 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/auth")} className="flex items-center">
          <img src={evixLogo} alt="EvixPos" className="h-9 sm:h-10 w-auto object-contain" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="font-medium">Secure password recovery</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md animate-fade-in">
          <button
            onClick={() => navigate("/auth")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Sign in
          </button>

          <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-2xl shadow-2xl shadow-primary/5 p-6 sm:p-8">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

            <div className="relative">
              <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <KeyRound className="h-7 w-7 text-primary" />
              </div>

              <h1 className="text-center text-2xl font-bold tracking-tight">Forgot Password?</h1>
              <p className="text-center text-sm text-muted-foreground mt-2">
                Enter your email and we'll send you a 6-digit code to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-sm font-medium">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                    error={!!emailError}
                    className="h-11 rounded-xl bg-background/50 border-border/50 focus:border-primary/60"
                    placeholder="name@company.com"
                  />
                  {emailError && (
                    <p className="text-xs text-destructive animate-fade-in">{emailError}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 text-primary-foreground gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5"
                >
                  {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Sending code…</>) : (<>Continue <ArrowRight className="h-4 w-4" /></>)}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ForgotPassword;