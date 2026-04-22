import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/hooks/useAdmin";
import { Mail, MessageSquare, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface Tpl {
  id: string;
  template_key: string;
  channel: string;
  label: string;
  subject: string;
  body: string;
  variables: string[];
  is_active: boolean;
}

const AdminTemplates = () => {
  const { adminCall } = useAdmin();
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await adminCall("get_system_templates");
    setTemplates(data || []);
    if (data?.[0] && !active) setActive(data[0].id);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<Tpl>) =>
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

  const save = async (t: Tpl) => {
    setSaving(t.id);
    const res = await adminCall("update_system_template", {
      id: t.id, subject: t.subject, body: t.body, is_active: t.is_active, label: t.label,
    });
    setSaving(null);
    if (res) toast.success("Template saved");
  };

  const current = templates.find(t => t.id === active);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center">
          <Mail className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Email & WhatsApp Templates</h1>
          <p className="text-sm text-slate-400">Edit system messages — welcome, payments, reminders</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
          <Card className="bg-slate-800 border-slate-700 max-h-[calc(100vh-200px)] overflow-auto">
            <CardContent className="p-2 space-y-1">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`w-full text-left p-2.5 rounded-lg transition-colors ${active === t.id ? "bg-emerald-600/20 text-emerald-300" : "text-slate-300 hover:bg-slate-700/50"}`}
                >
                  <div className="flex items-center gap-2">
                    {t.channel === "whatsapp" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                    <span className="text-sm font-medium truncate">{t.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{t.template_key}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          {current && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white text-base">{current.label}</CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Active</span>
                  <Switch checked={current.is_active} onCheckedChange={(v) => update(current.id, { is_active: v })} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {current.channel === "email" && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Subject</label>
                    <Input value={current.subject} onChange={(e) => update(current.id, { subject: e.target.value })} className="bg-slate-900 border-slate-700 text-white" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Body</label>
                  <Textarea
                    value={current.body}
                    onChange={(e) => update(current.id, { body: e.target.value })}
                    rows={12}
                    className="bg-slate-900 border-slate-700 text-white font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">Variables:</span>
                  {(current.variables || []).map(v => (
                    <Badge key={v} variant="outline" className="border-slate-600 text-slate-300 font-mono text-[10px]">
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
                <Button onClick={() => save(current)} disabled={saving === current.id} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving === current.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Template
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminTemplates;
