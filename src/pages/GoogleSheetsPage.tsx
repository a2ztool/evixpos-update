import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, RefreshCw, ArrowRight, ArrowLeft,
  FileSpreadsheet, Loader2, Zap, Sparkles, Activity,
  Power, Settings2, Wifi
} from "lucide-react";
import { StepIndicator } from "@/components/google-sheets/StepIndicator";
import { GuidePanel } from "@/components/google-sheets/GuidePanel";
import { ServiceAccountCard } from "@/components/google-sheets/ServiceAccountCard";
import { SyncHistoryPanel } from "@/components/google-sheets/SyncHistoryPanel";

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

const extractSheetId = (input: string): string => {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
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
  const [testing, setTesting] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [step, setStep] = useState(1);
  const [historyKey, setHistoryKey] = useState(0);

  const storeId = activeStore?.id;
  const serviceEmail = config.credentials?.client_email;
  const maxStep = useMemo(() => {
    if (config.status === "connected") return 4;
    if (config.credentials && config.sheet_id) return 3;
    if (config.credentials) return 2;
    return 1;
  }, [config]);

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
      const next = {
        id: data.id,
        sheet_id: data.sheet_id,
        tab_name: data.tab_name,
        field_mapping: Array.isArray(data.field_mapping) ? data.field_mapping as string[] : DEFAULT_FIELDS,
        is_auto_sync: data.is_auto_sync,
        status: data.status,
        credentials: data.credentials,
        last_synced_at: data.last_synced_at,
      };
      setConfig(next);
      if (next.status === "connected") setStep(4);
      else if (next.credentials && next.sheet_id) setStep(3);
      else if (next.credentials) setStep(2);
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
        toast.error("Invalid JSON — must include client_email and private_key");
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
      setStep(2);
      toast.success("Credentials saved securely");
    } catch {
      toast.error("Invalid JSON format");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSheetSetup = async () => {
    if (!config.id || !config.sheet_id.trim()) {
      toast.error("Please enter a Sheet ID or paste full URL");
      return;
    }
    setSaving(true);
    const cleanId = extractSheetId(config.sheet_id);
    const { error } = await supabase.from("google_sheets_config").update({
      sheet_id: cleanId,
      tab_name: config.tab_name || "Orders",
    }).eq("id", config.id);
    if (error) toast.error("Failed to save");
    else {
      setConfig(prev => ({ ...prev, sheet_id: cleanId }));
      setStep(3);
      toast.success("Sheet configured");
    }
    setSaving(false);
  };

  const handleSaveMapping = async () => {
    if (!config.id) return;
    setSaving(true);
    const { error } = await supabase.from("google_sheets_config").update({
      field_mapping: config.field_mapping,
      is_auto_sync: config.is_auto_sync,
      status: "connected",
    }).eq("id", config.id);
    if (error) toast.error("Failed to save");
    else {
      setConfig(prev => ({ ...prev, status: "connected" }));
      setStep(4);
      toast.success("🎉 Google Sheets connected!");
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
      toast.success(`✅ Synced ${result?.rows_synced ?? 0} orders`);
      await fetchConfig();
      setHistoryKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
      setHistoryKey(k => k + 1);
    } finally {
      setSyncing(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    // Reuse sync as a connectivity test
    try {
      const res = await supabase.functions.invoke("google-sheets-sync", {
        body: { store_id: storeId, action: "test" },
      });
      if (res.error) throw new Error("Connection failed");
      toast.success("✅ Connection healthy");
    } catch {
      toast.error("Connection test failed — check sharing & credentials");
    } finally {
      setTesting(false);
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

  const selectAllFields = () => setConfig(p => ({ ...p, field_mapping: Object.keys(FIELD_LABELS) }));
  const clearAllFields = () => setConfig(p => ({ ...p, field_mapping: [] }));

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
      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        {/* Premium Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-card">
          <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-emerald-400/20 to-primary/20 blur-3xl" />
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <FileSpreadsheet className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">Google Sheets</h1>
                  <Badge variant="outline" className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px]">
                    <Sparkles className="h-2.5 w-2.5 mr-1" /> PRO
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Auto-sync your orders to Google Sheets in real-time
                </p>
                <div className="text-xs text-muted-foreground mt-1">
                  Store: <span className="font-medium text-foreground">{activeStore?.name || "—"}</span>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-xs px-3 py-1.5 ${
                isConnected
                  ? "bg-success/10 text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {isConnected ? (
                <><Wifi className="h-3 w-3 mr-1.5" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1.5" /> Not Connected</>
              )}
            </Badge>
          </div>
        </div>

        {/* Connected Dashboard */}
        {isConnected && step === 4 && (
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Status card */}
            <div className="lg:col-span-2 rounded-2xl border border-success/20 bg-gradient-to-br from-success/5 via-card to-emerald-500/5 p-5 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Live Connection</div>
                    <div className="text-xs text-muted-foreground">
                      {config.last_synced_at
                        ? `Last sync: ${new Date(config.last_synced_at).toLocaleString()}`
                        : "Never synced"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Auto-sync</Label>
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
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-background/60 border border-border/50 p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Sheet ID</div>
                  <div className="text-xs font-mono truncate mt-1">{config.sheet_id}</div>
                </div>
                <div className="rounded-lg bg-background/60 border border-border/50 p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Tab</div>
                  <div className="text-xs font-medium mt-1">{config.tab_name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="bg-gradient-to-r from-emerald-600 to-primary hover:opacity-90 shadow-md shadow-primary/20"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sync Now
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => setStep(3)}>
                  <Settings2 className="h-4 w-4 mr-2" /> Edit Mapping
                </Button>
                <Button variant="ghost" className="text-destructive hover:text-destructive ml-auto" onClick={handleDisconnect}>
                  <Power className="h-4 w-4 mr-2" /> Disconnect
                </Button>
              </div>
            </div>

            {/* Synced fields */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="text-sm font-semibold mb-3">Synced Fields ({config.field_mapping.length})</div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {config.field_mapping.map(f => (
                  <Badge key={f} variant="secondary" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                    {FIELD_LABELS[f] || f}
                  </Badge>
                ))}
              </div>
            </div>

            {/* History */}
            <div className="lg:col-span-3">
              <SyncHistoryPanel storeId={storeId} refreshKey={historyKey} />
            </div>
          </div>
        )}

        {/* Setup Wizard */}
        {(!isConnected || step < 4) && (
          <div className="space-y-6">
            {/* Stepper */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <StepIndicator currentStep={step} maxStep={maxStep} onStepClick={setStep} />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main step content */}
              <div className="lg:col-span-2 space-y-4">
                {step === 1 && (
                  <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                    <div className="p-6 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">1</span>
                        Connect Service Account
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">Paste your Google Cloud service account JSON key</p>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Service Account JSON</Label>
                        <Textarea
                          value={serviceAccountJson}
                          onChange={e => setServiceAccountJson(e.target.value)}
                          placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                          className="font-mono text-xs min-h-[180px] mt-2 bg-muted/30"
                        />
                        <p className="text-xs text-muted-foreground mt-1.5">🔒 Stored securely & encrypted</p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveCredentials}
                          disabled={saving || !serviceAccountJson.trim()}
                          className="bg-gradient-to-r from-emerald-600 to-primary hover:opacity-90 shadow-md shadow-primary/20"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Save & Continue <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                    <div className="p-6 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">2</span>
                        Sheet Setup
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">Connect to your Google Spreadsheet</p>
                    </div>
                    <div className="p-6 space-y-4">
                      <ServiceAccountCard email={serviceEmail} />

                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Spreadsheet URL or ID</Label>
                        <Input
                          value={config.sheet_id}
                          onChange={e => setConfig(prev => ({ ...prev, sheet_id: e.target.value }))}
                          placeholder="Paste full URL or just the Sheet ID"
                          className="mt-2 font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground mt-1.5">
                          We'll auto-extract the ID from the URL
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sheet Tab Name</Label>
                        <Input
                          value={config.tab_name}
                          onChange={e => setConfig(prev => ({ ...prev, tab_name: e.target.value }))}
                          placeholder="Orders"
                          className="mt-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Tab will be created automatically if it doesn't exist
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Button variant="ghost" onClick={() => setStep(1)}>
                          <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <Button
                          onClick={handleSaveSheetSetup}
                          disabled={saving || !config.sheet_id.trim()}
                          className="bg-gradient-to-r from-emerald-600 to-primary hover:opacity-90 shadow-md shadow-primary/20"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Continue <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                    <div className="p-6 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-semibold flex items-center gap-2">
                            <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">3</span>
                            Field Mapping
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Choose which order fields appear as columns
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={selectAllFields}>All</Button>
                          <Button size="sm" variant="ghost" onClick={clearAllFields}>None</Button>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(FIELD_LABELS).map(([key, label]) => {
                          const selected = config.field_mapping.includes(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleField(key)}
                              className={`rounded-xl border-2 p-3 text-left text-sm transition-all ${
                                selected
                                  ? "border-primary bg-primary/5 text-foreground shadow-sm"
                                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`h-4 w-4 rounded-md border-2 flex items-center justify-center transition-all ${
                                  selected ? "bg-primary border-primary" : "border-muted-foreground/30"
                                }`}>
                                  {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                                </div>
                                <span className="text-xs font-medium">{label}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                        <div>
                          <Label className="text-sm font-medium">Auto-sync new orders</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Push new orders to sheet automatically</p>
                        </div>
                        <Switch
                          checked={config.is_auto_sync}
                          onCheckedChange={v => setConfig(prev => ({ ...prev, is_auto_sync: v }))}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Button variant="ghost" onClick={() => setStep(2)}>
                          <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <Button
                          onClick={handleSaveMapping}
                          disabled={saving || config.field_mapping.length === 0}
                          className="bg-gradient-to-r from-emerald-600 to-primary hover:opacity-90 shadow-md shadow-primary/20"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                          Connect & Finish
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar guide */}
              <div className="space-y-4">
                {step === 1 && (
                  <GuidePanel
                    title="How to get credentials"
                    steps={[
                      {
                        title: "Open Google Cloud Console",
                        description: "Go to IAM & Admin → Service Accounts in your project.",
                        link: { label: "Open Console", url: "https://console.cloud.google.com/iam-admin/serviceaccounts" },
                      },
                      {
                        title: "Create a Service Account",
                        description: "Click 'Create Service Account', give it a name, and skip role assignment.",
                      },
                      {
                        title: "Generate JSON key",
                        description: "Open the account → Keys tab → Add Key → JSON. Download the file.",
                      },
                      {
                        title: "Enable Sheets API",
                        description: "Search for 'Google Sheets API' and click Enable in your project.",
                        link: { label: "Enable API", url: "https://console.cloud.google.com/apis/library/sheets.googleapis.com" },
                      },
                      {
                        title: "Paste the JSON",
                        description: "Copy the entire JSON file content and paste it in the textarea.",
                      },
                    ]}
                  />
                )}
                {step === 2 && (
                  <GuidePanel
                    title="Connect your sheet"
                    steps={[
                      {
                        title: "Create or open a Google Sheet",
                        description: "Use any existing sheet or create a fresh one for orders.",
                        link: { label: "New Sheet", url: "https://sheets.new" },
                      },
                      {
                        title: "Share with service account",
                        description: "Click Share, paste the service account email above, and set as Editor.",
                      },
                      {
                        title: "Copy URL or Sheet ID",
                        description: "Paste the full URL — we'll auto-extract the ID. The ID is between /d/ and /edit.",
                      },
                      {
                        title: "Choose tab name",
                        description: "Default 'Orders' works fine. We'll create the tab if it doesn't exist.",
                      },
                    ]}
                  />
                )}
                {step === 3 && (
                  <GuidePanel
                    title="Pick your columns"
                    steps={[
                      {
                        title: "Select fields to sync",
                        description: "Click any field to toggle. Selected fields become columns in your sheet.",
                      },
                      {
                        title: "Order matters",
                        description: "Fields appear in the sheet in the order shown here (left to right).",
                      },
                      {
                        title: "Enable auto-sync",
                        description: "Turn on to push every new POS order to the sheet automatically.",
                      },
                      {
                        title: "Header row",
                        description: "Row 1 will contain column names. Don't edit it manually.",
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default GoogleSheetsPage;
