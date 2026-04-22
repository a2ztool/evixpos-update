import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileJson, FileSpreadsheet, Loader2, Database } from "lucide-react";
import { toast } from "sonner";

const DATASETS = [
  { key: "users", label: "Users / Profiles", desc: "All registered users", icon: "👥" },
  { key: "stores", label: "Stores", desc: "All stores across users", icon: "🏪" },
  { key: "orders", label: "Orders", desc: "Order history", icon: "🛒" },
  { key: "payments", label: "Plan Payments", desc: "Subscription payments", icon: "💰" },
  { key: "subscriptions", label: "Subscriptions", desc: "Active and expired plans", icon: "📋" },
];

const AdminDataExport = () => {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (dataset: string, format: "csv" | "json") => {
    setBusy(`${dataset}-${format}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const url = `https://vuuesqrdjuqnduhiihwz.supabase.co/functions/v1/admin-data`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "export_data", params: { dataset, format } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${dataset}-${new Date().toISOString().slice(0,10)}.${format}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast.success(`Downloaded ${dataset}.${format}`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="h-6 w-6 text-emerald-400" /> Data Export
        </h1>
        <p className="text-sm text-slate-400 mt-1">Download platform data as CSV or JSON (max 10,000 rows)</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DATASETS.map(ds => (
          <Card key={ds.key} className="bg-slate-800 border-slate-700 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl">{ds.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold">{ds.label}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{ds.desc}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(ds.key, "csv")}
                disabled={busy !== null}
                className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                {busy === `${ds.key}-csv` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> CSV</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(ds.key, "json")}
                disabled={busy !== null}
                className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                {busy === `${ds.key}-json` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><FileJson className="h-3.5 w-3.5 mr-1.5" /> JSON</>}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="bg-slate-800/50 border-slate-700 p-4">
        <div className="flex items-start gap-3">
          <Download className="h-4 w-4 text-emerald-400 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <p><Badge variant="outline" className="border-slate-600 text-slate-300 mr-1">Note</Badge> Exports are logged to the audit trail for compliance.</p>
            <p>Finance admins can export only payments/subscriptions. Support admins can export only users/stores/orders.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AdminDataExport;
