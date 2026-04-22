import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { adminEmailSchema, adminPasswordSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import { Loader2 } from "lucide-react";

const AdminSettings = () => {
  const { user } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const emailForm = useFormValidation(adminEmailSchema);
  const passwordForm = useFormValidation(adminPasswordSchema);

  const updateEmail = async () => {
    if (!emailForm.validateAll({ email: newEmail })) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setLoading(false);
    if (error) {
      emailForm.setFieldError("email", error.message);
      toast.error(error.message);
      return;
    }
    toast.success("Confirmation email sent to new address. Check your inbox.");
    setNewEmail("");
  };

  const updatePassword = async () => {
    if (!passwordForm.validateAll({ password: newPassword })) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      passwordForm.setFieldError("password", error.message);
      toast.error(error.message);
      return;
    }
    toast.success("Password updated successfully. Use new password for next login.");
    setNewPassword("");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Admin Settings</h1>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Current Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-300">{user?.email}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Change Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-400">After changing, future admin logins must use the new email.</p>
          <div className="space-y-1.5">
            <Input
              type="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); emailForm.clearField("email"); }}
              error={!!emailForm.getError("email")}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
            />
            {emailForm.getError("email") && (
              <p className="text-xs text-destructive animate-fade-in">{emailForm.getError("email")}</p>
            )}
          </div>
          <Button onClick={updateEmail} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Email"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-400">After changing, future admin logins must use the new password.</p>
          <div className="space-y-1.5">
            <Input
              type="password"
              placeholder="New password (min 6 chars)"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); passwordForm.clearField("password"); }}
              error={!!passwordForm.getError("password")}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
            />
            {passwordForm.getError("password") && (
              <p className="text-xs text-destructive animate-fade-in">{passwordForm.getError("password")}</p>
            )}
          </div>
          <Button onClick={updatePassword} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
