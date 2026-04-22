import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAdmin } from "@/hooks/useAdmin";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FeatureFlag {
  id: string;
  flag_key: string;
  label: string;
  description: string;
  enabled: boolean;
  allowed_plans: string[];
}

const PLAN_OPTIONS = ["free", "pro", "business"] as const;

const AdminFeatureFlags = () => {
  const { adminCall } = useAdmin();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await adminCall("get_feature_flags");
    setFlags(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (flag: FeatureFlag, enabled: boolean) => {
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled } : f));
    const res = await adminCall("update_feature_flag", { id: flag.id, enabled });
    if (res) toast.success(`${flag.label} ${enabled ? "enabled" : "disabled"}`);
    else load();
  };

  const togglePlan = async (flag: FeatureFlag, plan: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...(flag.allowed_plans || []), plan]))
      : (flag.allowed_plans || []).filter(p => p !== plan);
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, allowed_plans: next } : f));
    const res = await adminCall("update_feature_flag", { id: flag.id, allowed_plans: next });
    if (res) toast.success("Plans updated");
    else load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center">
          <Flag className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Feature Flags</h1>
          <p className="text-sm text-slate-400">Globally enable/disable features and restrict by plan</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
      ) : (
        <div className="grid gap-3">
          {flags.map(flag => (
            <Card key={flag.id} className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      {flag.label}
                      <Badge variant="outline" className="font-mono text-[10px] border-slate-600 text-slate-400">{flag.flag_key}</Badge>
                    </CardTitle>
                    <p className="text-xs text-slate-400 mt-1">{flag.description}</p>
                  </div>
                  <Switch checked={flag.enabled} onCheckedChange={(v) => toggle(flag, v)} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">Allowed plans:</span>
                  {PLAN_OPTIONS.map(plan => (
                    <label key={plan} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={(flag.allowed_plans || []).includes(plan)}
                        onCheckedChange={(c) => togglePlan(flag, plan, !!c)}
                      />
                      <span className="text-xs text-white capitalize">{plan}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminFeatureFlags;
