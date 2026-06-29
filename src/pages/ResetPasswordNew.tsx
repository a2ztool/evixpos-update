import { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import evixLogo from "@/assets/evixpos-logo.png";

const ResetPasswordNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const stateEmail = (location.state as { email?: string; resetToken?: string } | null)?.email;
  const resetToken = (location.state as { email?: string; resetToken?: string } | null)?.resetToken;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const ready = true;

  if (!stateEmail || !resetToken) return <Navigate to="/auth" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < 6) next.password = "Password must be at least 6 characters.";
    if (password !== confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    const { data, error } = await supabase.functions.invoke("set-new-password", {
      body: { email: stateEmail, token: resetToken, password },
    });
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      setLoading(false);
      toast.error(errMsg);
      return;
    }
    toast.success("Password updated successfully!");
    setLoading(false);
    setTimeout(() => navigate("/auth", { replace: true }), 600);
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
          <span className="font-medium">Set a new password</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-2xl shadow-2xl shadow-primary/5 p-6 sm:p-8">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

            <div className="relative">
              <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Lock className="h-7 w-7 text-primary" />
              </div>

              <h1 className="text-center text-2xl font-bold tracking-tight">Set New Password</h1>
              <p className="text-center text-sm text-muted-foreground mt-2">
                Choose a strong password for <span className="font-semibold text-foreground">{stateEmail}</span>
              </p>

              {!ready ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">New Password</Label>
                    <div className="relative">
                      <Input
                        type={show ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                        error={!!errors.password}
                        autoComplete="new-password"
                        className="h-11 rounded-xl pr-10 bg-background/50 border-border/50 focus:border-primary/60"
                        placeholder="Min. 6 characters"
                      />
                      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive animate-fade-in">{errors.password}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Confirm Password</Label>
                    <Input
                      type={show ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
                      error={!!errors.confirm}
                      autoComplete="new-password"
                      className="h-11 rounded-xl bg-background/50 border-border/50 focus:border-primary/60"
                      placeholder="Re-enter password"
                    />
                    {errors.confirm && <p className="text-xs text-destructive animate-fade-in">{errors.confirm}</p>}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 text-primary-foreground gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5"
                  >
                    {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>) : (<><CheckCircle className="h-4 w-4" /> Update Password</>)}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResetPasswordNew;