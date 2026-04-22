import { useEffect, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wrench, AlertTriangle, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFormValidation } from "@/hooks/useFormValidation";
import { maintenanceSchema } from "@/lib/validations";

const AdminMaintenance = () => {
  const { adminCall, loading } = useAdmin();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [allowAdmin, setAllowAdmin] = useState(true);
  const v = useFormValidation(maintenanceSchema);

  const fetchSetting = async () => {
    const data = await adminCall("get_system_setting", { key: "maintenance_mode" });
    if (data?.value) {
      setEnabled(!!data.value.enabled);
      setMessage(data.value.message || "");
      setAllowAdmin(data.value.allow_admin !== false);
    }
  };

  useEffect(() => { fetchSetting(); /* eslint-disable-next-line */ }, []);

  const handleSave = async () => {
    if (!v.validateAll({ message })) return;
    const result = await adminCall("update_system_setting", {
      key: "maintenance_mode",
      value: { enabled, message, allow_admin: allowAdmin },
      description: "Site-wide maintenance mode toggle",
    });
    if (result) toast.success("Maintenance settings saved");
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Maintenance Mode</h1>
          <p className="text-xs text-slate-400">Show a site-wide banner or block access during downtime</p>
        </div>
      </div>

      {enabled && (
        <Card className="bg-amber-500/10 border-amber-500/30 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-semibold text-sm">Maintenance mode is currently ACTIVE</p>
            <p className="text-amber-200/70 text-xs mt-1">All users will see the maintenance banner on the site.</p>
          </div>
        </Card>
      )}

      <Card className="bg-slate-800 border-slate-700 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Enable Maintenance Mode</h3>
            <p className="text-slate-400 text-xs mt-1">Display a maintenance banner across the entire app</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="border-t border-slate-700 pt-5">
          <label className="text-white text-sm font-medium block mb-2">
            Maintenance Message
            <Badge className="ml-2 bg-slate-700 text-slate-300 border-0 text-[10px]">Shown to users</Badge>
          </label>
          <Textarea
            rows={3}
            value={message}
            onChange={(e) => { setMessage(e.target.value); v.clearField("message"); }}
            aria-invalid={!!v.getError("message")}
            placeholder="We are performing scheduled maintenance. Please check back soon."
            className={`bg-slate-900 border-slate-700 text-white ${v.getError("message") ? "border-destructive" : ""}`}
          />
          {v.getError("message") && <p className="text-xs text-destructive mt-1">{v.getError("message")}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-slate-700 pt-5">
          <div>
            <h3 className="text-white text-sm font-medium">Allow admins to bypass</h3>
            <p className="text-slate-400 text-xs mt-1">Admins can still access the panel during maintenance</p>
          </div>
          <Switch checked={allowAdmin} onCheckedChange={setAllowAdmin} />
        </div>

        <Button onClick={handleSave} disabled={loading} className="bg-amber-600 hover:bg-amber-700 w-full md:w-auto">
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </Card>
    </div>
  );
};

export default AdminMaintenance;
