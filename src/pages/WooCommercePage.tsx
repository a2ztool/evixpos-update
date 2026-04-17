import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ShoppingBag, Copy, Power, PowerOff, Save, CheckCircle2, XCircle,
  Loader2, RefreshCw, Globe, Key, Lock, Webhook, ArrowRight, ArrowLeft,
  Package, Zap, Wifi, Sparkles, Eye, EyeOff, Check, Activity, Settings2,
  ShieldCheck, Plug,
} from "lucide-react";
import { StepIndicator } from "@/components/google-sheets/StepIndicator";
import { GuidePanel } from "@/components/google-sheets/GuidePanel";
import { cn } from "@/lib/utils";

const WC_STEPS = [
  { id: 1, label: "Credentials", hint: "API Keys" },
  { id: 2, label: "Webhooks", hint: "Real-time sync" },
  { id: 3, label: "Sync", hint: "Import products" },
];

const WooCommercePage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [wc, setWc] = useState<any>(null);
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; meta?: any } | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);

  const fetchIntegration = useCallback(async () => {
    if (!user || !activeStore) { setLoading(false); return; }
    const { data } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .eq("type", "woocommerce")
      .maybeSingle();
    if (data) {
      setWc(data);
      setStoreUrl((data as any).store_url ?? "");
      setConsumerKey((data as any).consumer_key ?? "");
      setConsumerSecret(data.api_key ?? "");
      setStep(data.status === "active" ? 3 : 2);
    } else {
      setWc(null); setStoreUrl(""); setConsumerKey(""); setConsumerSecret("");
      setStep(1);
    }
    setLoading(false);
  }, [user, activeStore]);

  useEffect(() => { fetchIntegration(); }, [fetchIntegration]);

  const webhookUrl = useMemo(() => wc
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/woocommerce-webhook?integration_id=${wc.id}`
    : "", [wc]);

  const isConnected = wc?.status === "active";
  const maxStep = useMemo(() => isConnected ? 3 : (wc ? 2 : 1), [wc, isConnected]);

  const validateInputs = (): boolean => {
    if (!storeUrl.trim()) { toast.error("Enter your WooCommerce store URL"); return false; }
    try { new URL(storeUrl); } catch { toast.error("Invalid URL — use https://yourstore.com"); return false; }
    if (!consumerKey.trim().startsWith("ck_")) { toast.error("Consumer Key must start with ck_"); return false; }
    if (!consumerSecret.trim().startsWith("cs_")) { toast.error("Consumer Secret must start with cs_"); return false; }
    return true;
  };

  const save = async () => {
    if (!user || !activeStore || !validateInputs()) return;
    setSaving(true); setTestResult(null);
    const payload: any = {
      api_key: consumerSecret,
      store_url: storeUrl.replace(/\/+$/, ""),
      consumer_key: consumerKey,
      status: "active",
    };
    if (wc) {
      const { error } = await supabase.from("integrations").update(payload).eq("id", wc.id);
      if (error) toast.error(error.message);
      else { toast.success("Credentials updated"); setStep(2); }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...payload, user_id: effectiveUserId!, store_id: activeStore.id, type: "woocommerce" as const,
      });
      if (error) toast.error(error.message);
      else { toast.success("🎉 WooCommerce connected!"); setStep(2); }
    }
    await fetchIntegration();
    setSaving(false);
  };

  const callSync = async (action: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/woocommerce-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, integration_id: wc.id }),
    });
    return res.json();
  };

  const testConnection = async () => {
    if (!wc) return;
    setTesting(true); setTestResult(null);
    try {
      const result = await callSync("test");
      if (result.success) {
        setTestResult({ success: true, message: `Connected to "${result.store_name}"`, meta: result });
        toast.success("✅ Connection healthy");
      } else {
        setTestResult({ success: false, message: result.error || "Failed" });
        toast.error(result.error || "Connection failed");
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      toast.error("Test failed");
    }
    setTesting(false);
  };

  const syncProducts = async () => {
    if (!wc) return;
    setSyncing(true); setSyncResult(null);
    try {
      const result = await callSync("sync_products");
      if (result.success) {
        setSyncResult({ success: true, message: result.message, count: result.count });
        toast.success(result.message);
      } else {
        setSyncResult({ success: false, message: result.error || "Failed" });
        toast.error(result.error || "Sync failed");
      }
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message });
      toast.error("Sync failed");
    }
    setSyncing(false);
  };

  const toggleStatus = async () => {
    if (!wc) return;
    const newStatus = wc.status === "active" ? "inactive" : "active";
    await supabase.from("integrations").update({ status: newStatus }).eq("id", wc.id);
    toast.success(`Integration ${newStatus === "active" ? "activated" : "deactivated"}`);
    fetchIntegration();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

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
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-purple-500/5 p-6 shadow-card">
          <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-purple-400/20 to-pink-500/20 blur-3xl" />
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <ShoppingBag className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">WooCommerce</h1>
                  <Badge variant="outline" className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px]">
                    <Sparkles className="h-2.5 w-2.5 mr-1" /> PRO
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Real-time product & order sync from your WooCommerce store
                </p>
                <div className="text-xs text-muted-foreground mt-1">
                  Store: <span className="font-medium text-foreground">{activeStore?.name || "—"}</span>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-3 py-1.5",
                isConnected
                  ? "bg-success/10 text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {isConnected ? (
                <><Wifi className="h-3 w-3 mr-1.5" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1.5" /> Not Connected</>
              )}
            </Badge>
          </div>
        </div>

        {/* Stepper */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <StepIndicator currentStep={step} maxStep={maxStep} onStepClick={setStep} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Step 1: Credentials */}
            {step === 1 && (
              <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                <div className="p-6 border-b border-border bg-gradient-to-r from-purple-500/5 to-transparent">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <span className="h-7 w-7 rounded-lg bg-purple-500/10 text-purple-600 text-sm font-bold flex items-center justify-center">1</span>
                        API Configuration
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">Enter your WooCommerce REST API credentials</p>
                    </div>
                    {wc && (
                      <Button variant="outline" size="sm" onClick={toggleStatus}>
                        {isConnected ? (
                          <><PowerOff className="h-3.5 w-3.5 mr-1" /> Deactivate</>
                        ) : (
                          <><Power className="h-3.5 w-3.5 mr-1" /> Activate</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Globe className="h-3 w-3" /> Store URL
                    </Label>
                    <Input
                      value={storeUrl}
                      onChange={(e) => setStoreUrl(e.target.value)}
                      placeholder="https://yourstore.com"
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Key className="h-3 w-3" /> Consumer Key
                    </Label>
                    <Input
                      value={consumerKey}
                      onChange={(e) => setConsumerKey(e.target.value)}
                      placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="mt-2 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Lock className="h-3 w-3" /> Consumer Secret
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        type={showSecret ? "text" : "password"}
                        value={consumerSecret}
                        onChange={(e) => setConsumerSecret(e.target.value)}
                        placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="font-mono text-xs pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">🔒 Stored encrypted, only shown when revealed</p>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-success" />
                      Read/Write permissions required
                    </div>
                    <Button
                      onClick={save}
                      disabled={saving}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 shadow-md shadow-purple-500/20 text-white"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      {wc ? "Update & Continue" : "Save & Continue"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>

                  {testResult && (
                    <div className={cn(
                      "rounded-xl border p-4 flex items-start gap-3",
                      testResult.success
                        ? "border-success/20 bg-success/5"
                        : "border-destructive/20 bg-destructive/5"
                    )}>
                      {testResult.success
                        ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                        : <XCircle className="h-5 w-5 text-destructive shrink-0" />}
                      <div>
                        <div className="text-sm font-semibold">
                          {testResult.success ? "Connection healthy" : "Connection failed"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{testResult.message}</div>
                        {testResult.meta?.wc_version && (
                          <div className="text-xs text-muted-foreground mt-1">
                            WooCommerce v{testResult.meta.wc_version}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Webhooks */}
            {step === 2 && (
              <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                <div className="p-6 border-b border-border bg-gradient-to-r from-purple-500/5 to-transparent">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg bg-purple-500/10 text-purple-600 text-sm font-bold flex items-center justify-center">2</span>
                    Webhook Setup
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Real-time auto-sync for products & orders</p>
                </div>
                <div className="p-6 space-y-4">
                  {wc ? (
                    <>
                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Webhook className="h-3 w-3" /> Delivery URL
                        </Label>
                        <div className="flex gap-2 mt-2">
                          <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted/30" />
                          <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
                            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Returns 200 OK — no "Delivery URL Error" in WooCommerce
                        </p>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <div className="text-sm font-semibold mb-3">Recommended webhook topics</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            "Product created", "Product updated", "Product deleted",
                            "Order created", "Order updated"
                          ].map((t) => (
                            <div key={t} className="flex items-center gap-2 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              <span>{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
                        <div>
                          <Label className="text-sm font-medium">Auto-sync via webhooks</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Push changes from WooCommerce to POS instantly</p>
                        </div>
                        <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Button variant="ghost" onClick={() => setStep(1)}>
                          <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <Button
                          onClick={() => setStep(3)}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 shadow-md shadow-purple-500/20 text-white"
                        >
                          Continue <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Save credentials first to get your webhook URL</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setStep(1)}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Credentials
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Sync Dashboard */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-success/20 bg-gradient-to-br from-success/5 via-card to-purple-500/5 p-5 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">Live Connection</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {storeUrl || "—"}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      isConnected ? "bg-success/10 text-success border-success/30" : "bg-muted"
                    )}>
                      {isConnected ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={syncProducts}
                      disabled={syncing || !isConnected}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 shadow-md shadow-purple-500/20 text-white"
                    >
                      {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Sync Products Now
                    </Button>
                    <Button variant="outline" onClick={testConnection} disabled={testing}>
                      {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                      Test Connection
                    </Button>
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <Settings2 className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  </div>

                  {(testResult || syncResult) && (
                    <div className="mt-4 space-y-2">
                      {testResult && (
                        <div className={cn(
                          "rounded-lg border p-3 flex items-start gap-2 text-xs",
                          testResult.success ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
                        )}>
                          {testResult.success
                            ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                            : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                          <div>
                            <div className="font-medium">{testResult.message}</div>
                            {testResult.meta?.wc_version && (
                              <div className="text-muted-foreground">WooCommerce v{testResult.meta.wc_version}</div>
                            )}
                          </div>
                        </div>
                      )}
                      {syncResult && (
                        <div className={cn(
                          "rounded-lg border p-3 flex items-start gap-2 text-xs",
                          syncResult.success ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
                        )}>
                          {syncResult.success
                            ? <Package className="h-4 w-4 text-success shrink-0 mt-0.5" />
                            : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                          <div className="font-medium">{syncResult.message}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Store URL", value: storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") || "—", icon: Globe },
                    { label: "API Key", value: consumerKey ? `${consumerKey.slice(0, 8)}…` : "—", icon: Key },
                    { label: "Status", value: isConnected ? "Active" : "Inactive", icon: Plug },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <Icon className="h-3 w-3" /> {s.label}
                        </div>
                        <div className="text-sm font-semibold mt-1 truncate">{s.value}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Webhooks
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar guide */}
          <div className="space-y-4">
            {step === 1 && (
              <GuidePanel
                title="How to get API keys"
                steps={[
                  {
                    title: "Open WooCommerce settings",
                    description: "Go to WordPress Admin → WooCommerce → Settings.",
                  },
                  {
                    title: "Navigate to REST API",
                    description: "Click Advanced → REST API → Add Key.",
                  },
                  {
                    title: "Configure permissions",
                    description: "Description: 'POS Sync'. User: admin. Permissions: Read/Write.",
                  },
                  {
                    title: "Copy the keys",
                    description: "Copy Consumer Key (ck_…) & Secret (cs_…) — secret shown ONCE.",
                  },
                  {
                    title: "Paste & save",
                    description: "Fill the form and click Save & Continue.",
                  },
                ]}
              />
            )}
            {step === 2 && (
              <GuidePanel
                title="Setup webhooks"
                steps={[
                  {
                    title: "Open Webhooks",
                    description: "WooCommerce → Settings → Advanced → Webhooks → Add webhook.",
                  },
                  {
                    title: "Name & status",
                    description: "Name it 'POS Sync'. Set status to Active.",
                  },
                  {
                    title: "Pick a topic",
                    description: "Create one webhook per topic: product/order created, updated, deleted.",
                  },
                  {
                    title: "Paste delivery URL",
                    description: "Copy the URL on the left and paste into 'Delivery URL'. Leave Secret blank.",
                  },
                  {
                    title: "Save webhook",
                    description: "Click Save. Repeat for each event you want auto-synced.",
                  },
                ]}
              />
            )}
            {step === 3 && (
              <GuidePanel
                title="Sync & manage"
                steps={[
                  {
                    title: "Test the connection",
                    description: "Verifies credentials and fetches your store info.",
                  },
                  {
                    title: "Sync products",
                    description: "One-time bulk import of your entire catalog into the POS.",
                  },
                  {
                    title: "Auto-sync",
                    description: "Once webhooks are set, new orders & product changes flow in real-time.",
                  },
                  {
                    title: "Multi-store isolation",
                    description: "Data is per-store. Switching store shows different products/orders.",
                  },
                ]}
              />
            )}

            {/* Trust card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-success" />
                <div className="text-sm font-semibold">Secure & isolated</div>
              </div>
              <p className="text-xs text-muted-foreground">
                Credentials encrypted at rest. All data scoped to <strong className="text-foreground">{activeStore?.name || "this store"}</strong> only.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default WooCommercePage;
