import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Loader2, Check, RotateCw, Mail } from "lucide-react";
import evixLogo from "@/assets/evixpos-logo.png";

type OtpMode = "signup" | "reset";

interface LocationState {
  email: string;
  mode: OtpMode;
  password?: string;
  name?: string;
  referralCode?: string;
}

const VerifyOtp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const otp = digits.join("");
  const complete = otp.length === 6 && digits.every((d) => /\d/.test(d));

  const handleChange = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (!clean) {
      setDigits((d) => { const n = [...d]; n[i] = ""; return n; });
      return;
    }
    if (clean.length > 1) {
      // Paste
      const arr = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      arr.forEach((ch, idx) => { next[idx] = ch; });
      setDigits(next);
      const focusIdx = Math.min(arr.length, 5);
      inputs.current[focusIdx]?.focus();
      return;
    }
    setDigits((d) => { const n = [...d]; n[i] = clean; return n; });
    if (i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      inputs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    text.split("").forEach((ch, idx) => { next[idx] = ch; });
    setDigits(next);
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  const finishSignup = useCallback(async () => {
    if (!state) return;
    // 1) Set password on the new account
    if (state.password) {
      const { error: pwErr } = await supabase.auth.updateUser({ password: state.password });
      if (pwErr) {
        // Non-fatal: continue, user can reset later. But surface a warning.
        console.warn("Failed to set password after OTP:", pwErr.message);
      }
    }

    // 2) Update profile name (in case trigger created it with empty name)
    const { data: { user } } = await supabase.auth.getUser();
    if (user && state.name) {
      await supabase.from("profiles").update({ name: state.name }).eq("id", user.id);
    }

    // 3) Handle referral
    if (user && state.referralCode) {
      const code = state.referralCode.trim().toUpperCase();
      const { data: refSettings } = await supabase
        .from("referral_settings")
        .select("user_id, id, total_clicks")
        .eq("referral_code", code)
        .maybeSingle();
      if (refSettings) {
        await supabase.from("referrals").insert({
          referrer_id: refSettings.user_id,
          referred_email: state.email,
          referred_user_id: user.id,
          status: "pending",
          plan: "free",
          commission_amount: 0,
          is_paid: false,
        });
        await supabase
          .from("referral_settings")
          .update({ total_clicks: ((refSettings as any).total_clicks ?? 0) + 1 })
          .eq("id", refSettings.id);
      }
    }
  }, [state]);

  const handleVerify = async () => {
    if (!complete || !state) return;
    setError("");
    setLoading(true);
    const { error: verErr } = await supabase.auth.verifyOtp({
      email: state.email,
      token: otp,
      type: "email",
    });
    if (verErr) {
      setLoading(false);
      setError(verErr.message?.includes("expired") || verErr.message?.includes("invalid")
        ? "Invalid or expired code. Please try again."
        : verErr.message || "Verification failed.");
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
      return;
    }

    try {
      if (state.mode === "signup") {
        await finishSignup();
      }
    } catch (e: any) {
      console.error(e);
    }

    setSuccess(true);
    setLoading(false);

    // Brief success animation, then route
    setTimeout(() => {
      if (state.mode === "signup") {
        navigate("/onboarding", { replace: true });
      } else {
        // recovery flow → go set new password
        navigate("/reset-password-new", { replace: true, state: { email: state.email } });
      }
    }, 900);
  };

  const handleResend = async () => {
    if (!state || seconds > 0) return;
    setResending(true);
    setError("");
    const { error: resErr } = await supabase.auth.signInWithOtp({
      email: state.email,
      options: {
        shouldCreateUser: state.mode === "signup",
        data: state.mode === "signup" ? { name: state.name } : undefined,
      },
    });
    setResending(false);
    if (resErr) {
      toast.error(resErr.message || "Could not resend code.");
      return;
    }
    setSeconds(60);
    setDigits(["", "", "", "", "", ""]);
    inputs.current[0]?.focus();
    toast.success("New code sent to your email.");
  };

  if (!state?.email) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-primary/5 via-background to-background relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[180px] pointer-events-none" />
      <div className="absolute -top-20 -right-40 w-[400px] h-[400px] rounded-full bg-primary/8 blur-[150px] pointer-events-none" />

      <header className="relative z-10 px-4 sm:px-8 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/auth")} className="flex items-center group">
          <img src={evixLogo} alt="EvixPos" className="h-9 sm:h-10 w-auto object-contain" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="font-medium">Secure email verification</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md animate-fade-in">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-2xl shadow-2xl shadow-primary/5 p-6 sm:p-8">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

            <div className="relative">
              <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                {success ? (
                  <Check className="h-7 w-7 text-primary animate-scale-in" />
                ) : (
                  <Mail className="h-7 w-7 text-primary" />
                )}
              </div>

              <h1 className="text-center text-2xl font-bold tracking-tight">
                {success ? "Verified!" : "Verify Your Email"}
              </h1>
              <p className="text-center text-sm text-muted-foreground mt-2">
                {success ? (
                  "Redirecting you now…"
                ) : (
                  <>We sent a 6-digit verification code to<br />
                  <span className="font-semibold text-foreground">{state.email}</span></>
                )}
              </p>

              {!success && (
                <>
                  <div className="flex justify-center gap-2 sm:gap-3 mt-7">
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => { inputs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={i === 0 ? 6 : 1}
                        value={d}
                        onChange={(e) => handleChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        onPaste={handlePaste}
                        aria-label={`Digit ${i + 1}`}
                        className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold rounded-xl border-2 bg-background/60 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-primary/15 ${
                          error
                            ? "border-destructive/60"
                            : d
                              ? "border-primary/60 scale-[1.02]"
                              : "border-border/60"
                        }`}
                      />
                    ))}
                  </div>

                  {error && (
                    <p className="text-xs text-destructive text-center mt-3 animate-fade-in">{error}</p>
                  )}

                  <Button
                    onClick={handleVerify}
                    disabled={!complete || loading}
                    className="w-full mt-6 h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 text-primary-foreground gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                    ) : (
                      "Verify & Continue"
                    )}
                  </Button>

                  <div className="mt-5 text-center text-xs text-muted-foreground">
                    {seconds > 0 ? (
                      <span>Resend code in <span className="font-semibold text-foreground">{seconds}s</span></span>
                    ) : (
                      <button
                        onClick={handleResend}
                        disabled={resending}
                        className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline disabled:opacity-60"
                      >
                        {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                        Resend code
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            Didn't get the email? Check your spam folder.
          </p>
        </div>
      </main>
    </div>
  );
};

export default VerifyOtp;