import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { resetPasswordSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const form = useFormValidation(resetPasswordSchema);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setReady(true);
    } else {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setReady(true);
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.validateAll({ password, confirmPassword })) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setTimeout(() => navigate("/auth"), 1500);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-800/80 backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/20 flex items-center justify-center">
            <KeyRound className="h-8 w-8 text-emerald-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Reset Password</CardTitle>
          <p className="text-slate-400 text-sm">Enter your new password below</p>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" />
              <p className="text-slate-400 text-sm">Verifying recovery link...</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-1.5">
                <Input
                  type="password"
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); form.clearField("password"); }}
                  error={!!form.getError("password")}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
                {form.getError("password") && (
                  <p className="text-xs text-destructive animate-fade-in">{form.getError("password")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Input
                  type="password"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); form.clearField("confirmPassword"); }}
                  error={!!form.getError("confirmPassword")}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
                {form.getError("confirmPassword") && (
                  <p className="text-xs text-destructive animate-fade-in">{form.getError("confirmPassword")}</p>
                )}
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Update Password</span>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
