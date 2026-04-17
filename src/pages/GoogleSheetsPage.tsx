import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Sheet, CheckCircle2, XCircle, RefreshCw, Settings2, ArrowRight,
  FileSpreadsheet, Loader2, Upload, Link2, Zap, AlertTriangle, Info
} from "lucide-react";

interface SheetsConfig {
  id?: string;
  sheet_id: string;
  tab_name: string;
  field_mapping: string[];
  is_auto_sync: boolean;
  status: string;
  credentials: any;
  last_synced_at: string | null;
}

const DEFAULT_FIELDS = [
  "order_id", "customer_name", "phone", "product_name", "variation",
  "quantity", "total_amount", "currency", "payment_status", "order_date"
];

const FIELD_LABELS: Record<string, string> = {
  order_id: "Order ID",
  customer_name: "Customer Name",
  phone: "Phone",
  product_name: "Product Name",
  variation: "Variation",
  quantity: "Quantity",
  total_amount: "Total Amount",
  currency: "Currency",
  payment_status: "Payment Status",
  payment_method: "Payment Method",
  order_date: "Order Date",
  status: "Order Status",
  notes: "Notes",
  discount: "Discount",
  store_name: "Store Name",
};

const GoogleSheetsPage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [config, setConfig] = useState<SheetsConfig>({
    sheet_id: "",
    tab_name: "Orders",
    field_mapping: [...DEFAULT_FIELDS],
    is_auto_sync: false,
    status: "disconnected",
    credentials: null,
    last_synced_at: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [step, setStep] = useState(1);

  const storeId = activeStore?.id;

  const fetchConfig = useCallback(async () => {
    if (!user || !storeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("google_sheets_config")
      .select("*")
      .eq("store_id", storeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setConfig({
        id: data.id,
        sheet_id: data.sheet_id,
        tab_name: data.tab_name,
        field_mapping: Array.isArray(data.field_mapping) ? data.field_mapping as string[] : DEFAULT_FIELDS,
        is_auto_sync: data.is_auto_sync,
        status: data.status,
        credentials: data.credentials,
        last_synced_at: data.last_synced_at,
      });
      if (data.status === "connected") setStep(4);
      else if (data.credentials) setStep(3);
      else setStep(1);
    }
    setLoading(false);
  }, [user, storeId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSaveCredentials = async () => {
    if (!user || !storeId) return;
    try {
      const creds = JSON.parse(serviceAccountJson);
      if (!creds.client_email || !creds.private_key) {
        toast.error("Invalid service account JSON — must have client_email and private_key");
        return;
      }
      setSaving(true);

      const payload = {
        user_id: user.id,
        store_id: storeId,
        credentials: creds,
        status: "configured",
        sheet_id: config.sheet_id,
        tab_name: config.tab_name,
        field_mapping: config.field_mapping,
        is_auto_sync: config.is_auto_sync,
      };

      if (config.id) {
        await supabase.from("google_sheets_config").update(payload).eq("id", config.id);
      } else {
        const { data } = await supabase.from("google_sheets_config").insert(payload).select().single();
        if (data) setConfig(prev => ({ ...prev, id: data.id }));
      }
      setConfig(prev => ({ ...prev, credentials: creds, status: "configured" }));
      setStep(3);
      toast.success("Credentials saved securely");
    } catch {
      toast.error("Invalid JSON format");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config.id || !config.sheet_id.trim()) {
      toast.error("Please enter a Google Sheet ID");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("google_sheets_config").update({
      sheet_id: config.sheet_id,
      tab_name: config.tab_name,
      field_mapping: config.field_mapping,
      is_auto_sync: config.is_auto_sync,
      status: "connected",
    }).eq("id", config.id);

    if (error) toast.error("Failed to save");
    else {
      setConfig(prev => ({ ...prev, status: "connected" }));
      setStep(4);
      toast.success("Google Sheets connected!");
    }
    setSaving(false);
  };

  const handleSyncNow = async () => {
    if (!storeId) return;
    setSyncing(true);
    try {
      const res = await supabase.functions.invoke("google-sheets-sync", {
        body: { store_id: storeId, action: "sync_all" },
      });
      const result: any = res.data;
      if (res.error) {
        let backendMsg: string | null = null;
        try {
          const ctx: any = (res.error as any).context;
          if (ctx?.json) {
            const j = await ctx.json();
            backendMsg = j?.error || null;
          }
        } catch { /* ignore */ }
        throw new Error(backendMsg || result?.error || res.error.message || "Sync failed");
      }
      if (result?.success === false) throw new Error(result.error || "Sync failed");
      toast.success(`Synced ${result?.rows_synced ?? 0} orders to Google Sheets`);
      await fetchConfig();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!config.id) return;
    await supabase.from("google_sheets_config").update({
      status: "disconnected", credentials: null,
    }).eq("id", config.id);
    setConfig(prev => ({ ...prev, status: "disconnected", credentials: null }));
    setServiceAccountJson("");
    setStep(1);
    toast.success("Disconnected");
  };

  const toggleField = (field: string) => {
    setConfig(prev => ({
      ...prev,
      field_mapping: prev.field_mapping.includes(field)
        ? prev.field_mapping.filter(f => f !== field)
        : [...prev.field_mapping, field],
    }));
  };

  const isConnected = config.status === "connected";

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <FileSpreadsheet className="h-6 w-6 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-2xl font-bold tracking-tight">Google Sheets Integration</h1>
              <p className="text-sm text-muted-foreground">
                Auto-sync POS orders to Google Sheets • Store: <span className="font-medium text-foreground">{activeStore?.name || "—"}</span>
              </p>
            </div>
          </div>
          <Badge variant={isConnected ? "default" : "secondary"} className={`text-xs px-3 py-1 ${isConnected ? "bg-green-500/10 text-green-600 border-green-500/20" : ""}`}>
            {isConnected ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</> : <><XCircle className="h-3 w-3 mr-1" /> Not Connected</>}
          </Badge>
        </div>

        {/* Connected Dashboard */}
        {isConnected && (
          <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-emerald-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Sheet ID: <span className="font-mono text-xs text-muted-foreground">{config.sheet_id}</span></p>
                  <p className="text-sm">Tab: <span className="font-medium">{config.tab_name}</span></p>
                  {config.last_synced_at && (
                    <p className="text-xs text-muted-foreground">Last synced: {new Date(config.last_synced_at).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Auto-sync</Label>
                    <Switch
                      checked={config.is_auto_sync}
                      onCheckedChange={async (v) => {
                        setConfig(prev => ({ ...prev, is_auto_sync: v }));
                        if (config.id) {
                          await supabase.from("google_sheets_config").update({ is_auto_sync: v }).eq("id", config.id);
                          toast.success(v ? "Auto-sync enabled" : "Auto-sync disabled");
                        }
                      }}
                    />
                  </div>
                  <Button onClick={handleSyncNow} disabled={syncing} className="bg-green-600 hover:bg-green-700">
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Sync Now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                    <Settings2 className="h-4 w-4 mr-1" /> Settings
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Setup Steps */}
        {(!isConnected || step < 4) && (
          <div className="space-y-4">
            {/* Step indicators */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{s}</div>
                  <span className={`text-sm font-medium ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                    {s === 1 ? "Credentials" : s === 2 ? "Sheet Setup" : "Field Mapping"}
                  </span>
                  {s < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />}
                </div>
              ))}
            </div>

            {/* Step 1: Service Account */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" /> Connect Google Service Account
                  </CardTitle>
                  <CardDescription>
                    Create a Google Cloud Service Account and paste the JSON key below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                    <p className="font-medium flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> How to set up:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener" className="text-primary underline">Google Cloud Console → Service Accounts</a></li>
                      <li>Create a new service account</li>
                      <li>Create a JSON key and download it</li>
                      <li>Enable the <strong>Google Sheets API</strong> in your project</li>
                      <li>Share your Google Sheet with the service account email (Editor access)</li>
                      <li>Paste the JSON key below</li>
                    </ol>
                  </div>
                  <div>
                    <Label>Service Account JSON Key</Label>
                    <Textarea
                      value={serviceAccountJson}
                      onChange={e => setServiceAccountJson(e.target.value)}
                      placeholder='{"type": "service_account", "project_id": "...", ...}'
                      className="font-mono text-xs min-h-[160px] mt-1"
                    />
                  </div>
                  <Button onClick={handleSaveCredentials} disabled={saving || !serviceAccountJson.trim()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                    Save Credentials & Continue
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Sheet Config */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-primary" /> Sheet Configuration
                  </CardTitle>
                  <CardDescription>Enter your Google Sheet ID and tab name.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <p>Find the Sheet ID in your Google Sheets URL:</p>
                    <p className="font-mono mt-1 break-all">https://docs.google.com/spreadsheets/d/<strong className="text-primary">SHEET_ID_HERE</strong>/edit</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Google Sheet ID</Label>
                      <Input
                        value={config.sheet_id}
                        onChange={e => setConfig(prev => ({ ...prev, sheet_id: e.target.value }))}
                        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label>Sheet Tab Name</Label>
                      <Input
                        value={config.tab_name}
                        onChange={e => setConfig(prev => ({ ...prev, tab_name: e.target.value }))}
                        placeholder="Orders"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                    <Button onClick={() => setStep(3)} disabled={!config.sheet_id.trim()}>
                      Continue <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Field Mapping */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sheet className="h-5 w-5 text-primary" /> Field Mapping
                  </CardTitle>
                  <CardDescription>Choose which fields to sync to your Google Sheet.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!config.sheet_id.trim() && (
                    <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span>Please go back and enter a Sheet ID first.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(FIELD_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => toggleField(key)}
                        className={`rounded-lg border p-3 text-left text-sm transition-all ${
                          config.field_mapping.includes(key)
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {config.field_mapping.includes(key) ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                          )}
                          {label}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label>Auto-sync new orders</Label>
                      <Switch
                        checked={config.is_auto_sync}
                        onCheckedChange={v => setConfig(prev => ({ ...prev, is_auto_sync: v }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                    <Button onClick={handleSaveConfig} disabled={saving || !config.sheet_id.trim()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Connect & Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Synced Fields Preview */}
        {isConnected && step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Synced Fields</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {config.field_mapping.map(f => (
                  <Badge key={f} variant="secondary" className="text-xs">
                    {FIELD_LABELS[f] || f}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default GoogleSheetsPage;
