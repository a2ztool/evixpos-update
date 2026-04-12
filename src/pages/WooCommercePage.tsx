import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ShoppingBag, Copy, Power, PowerOff, Save, ExternalLink, CheckCircle2,
  XCircle, Loader2, RefreshCw, Plug, Globe, Key, Lock, Webhook, ArrowRight,
  Package, Zap, Shield, AlertTriangle, Info,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const WooCommercePage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [wc, setWc] = useState<any>(null);
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchIntegration = async () => {
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
    } else {
      setWc(null);
      setStoreUrl("");
      setConsumerKey("");
      setConsumerSecret("");
    }
    setLoading(false);
  };

  useEffect(() => { fetchIntegration(); }, [user, activeStore]);

  const webhookUrl = wc
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/woocommerce-webhook?integration_id=${wc.id}`
    : "";

  const isConnected = wc?.status === "active";

  const validateInputs = (): boolean => {
    if (!storeUrl.trim()) {
      toast.error("Please enter your WooCommerce store URL");
      return false;
    }
    try {
      new URL(storeUrl);
    } catch {
      toast.error("Invalid store URL. Please enter a valid URL (e.g., https://yourstore.com)");
      return false;
    }
    if (!consumerKey.trim()) {
      toast.error("Please enter your Consumer Key");
      return false;
    }
    if (!consumerSecret.trim()) {
      toast.error("Please enter your Consumer Secret");
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!user || !activeStore) return;
    if (!validateInputs()) return;
    setSaving(true);
    setTestResult(null);

    const payload: any = {
      api_key: consumerSecret,
      store_url: storeUrl.replace(/\/+$/, ""),
      consumer_key: consumerKey,
      status: "active",
    };

    if (wc) {
      const { error } = await supabase.from("integrations").update(payload).eq("id", wc.id);
      if (error) toast.error(error.message);
      else toast.success("WooCommerce credentials updated!");
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...payload,
        user_id: effectiveUserId!,
        store_id: activeStore.id,
        type: "woocommerce" as const,
      });
      if (error) toast.error(error.message);
      else toast.success("WooCommerce connected!");
    }
    await fetchIntegration();
    setSaving(false);
  };

  const testConnection = async () => {
    if (!wc) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/woocommerce-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "test", integration_id: wc.id }),
      });
      const result = await res.json();
      if (result.success) {
        setTestResult({
          success: true,
          message: `Connected to "${result.store_name}" (WooCommerce v${result.wc_version})`,
        });
        toast.success("Connection successful!");
      } else {
        setTestResult({ success: false, message: result.error || "Connection failed" });
        toast.error(result.error || "Connection failed");
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      toast.error("Connection test failed");
    }
    setTesting(false);
  };

  const syncProducts = async () => {
    if (!wc) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/woocommerce-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "sync_products", integration_id: wc.id }),
      });
      const result = await res.json();
      if (result.success) {
        setSyncResult({ success: true, message: result.message });
        toast.success(result.message);
      } else {
        setSyncResult({ success: false, message: result.error || "Sync failed" });
        toast.error(result.error || "Sync failed");
      }
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message });
      toast.error("Product sync failed");
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
    toast.success("Copied to clipboard!");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ShoppingBag className="h-8 w-8" />
              WooCommerce Integration
            </h1>
            <p className="text-muted-foreground mt-1">
              Sync products and orders from your WooCommerce store automatically.
            </p>
          </div>
          {wc && (
            <Badge
              variant={isConnected ? "default" : "secondary"}
              className={`text-sm px-3 py-1 ${isConnected ? "bg-emerald-600" : ""}`}
            >
              {isConnected ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Connected</>
              ) : (
                <><XCircle className="h-3.5 w-3.5 mr-1" /> Disconnected</>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* Step-by-Step Guide */}
      {!wc && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Info className="h-5 w-5 text-primary" />
              Getting Started — Setup Guide
            </CardTitle>
            <CardDescription>Follow these steps to connect your WooCommerce store</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: "1",
                  icon: Key,
                  title: "Generate API Keys",
                  desc: "In WooCommerce → Settings → Advanced → REST API → Add Key. Set permissions to Read/Write.",
                },
                {
                  step: "2",
                  icon: Globe,
                  title: "Enter Credentials",
                  desc: "Copy your Store URL, Consumer Key, and Consumer Secret into the form below.",
                },
                {
                  step: "3",
                  icon: Webhook,
                  title: "Setup Webhook",
                  desc: "After connecting, copy the Webhook URL and add it in WooCommerce → Settings → Advanced → Webhooks.",
                },
                {
                  step: "4",
                  icon: Zap,
                  title: "Sync & Test",
                  desc: "Test the connection, then use Sync Now to import all products to your POS.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-3 p-4 rounded-lg bg-background border">
                  <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground text-sm font-bold">{item.step}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon className="h-4 w-4 text-primary" />
                      <p className="font-semibold text-sm">{item.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* API Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                API Configuration
              </CardTitle>
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
            <CardDescription>Enter your WooCommerce REST API credentials.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Store URL
              </Label>
              <Input
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://yourstore.com"
              />
              <p className="text-xs text-muted-foreground">Your WooCommerce store URL (with https://)</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" /> Consumer Key
              </Label>
              <Input
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">Must start with <code className="bg-muted px-1 rounded">ck_</code> — get it from WooCommerce → Settings → Advanced → REST API</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Consumer Secret
              </Label>
              <Input
                type="password"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">Must start with <code className="bg-muted px-1 rounded">cs_</code> — shown only once when you create the API key</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> {wc ? "Update Credentials" : "Connect Store"}</>
                )}
              </Button>
            </div>

            {wc && (
              <>
                <Separator />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={testConnection}
                    disabled={testing}
                    className="flex-1"
                  >
                    {testing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                    ) : (
                      <><Plug className="h-4 w-4 mr-2" /> Test Connection</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={syncProducts}
                    disabled={syncing || !isConnected}
                    className="flex-1"
                  >
                    {syncing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" /> Sync Products</>
                    )}
                  </Button>
                </div>
              </>
            )}

            {testResult && (
              <Alert variant={testResult.success ? "default" : "destructive"}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertTitle>{testResult.success ? "Success" : "Error"}</AlertTitle>
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}

            {syncResult && (
              <Alert variant={syncResult.success ? "default" : "destructive"}>
                {syncResult.success ? (
                  <Package className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertTitle>{syncResult.success ? "Sync Complete" : "Sync Failed"}</AlertTitle>
                <AlertDescription>{syncResult.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Webhook Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Setup
            </CardTitle>
            <CardDescription>
              Configure webhooks for real-time auto-sync of products and orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {wc ? (
              <>
                <div className="space-y-2">
                  <Label>Delivery URL (Webhook URL)</Label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(webhookUrl)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This URL accepts WooCommerce webhook payloads and returns 200 OK automatically.
                  </p>
                </div>

                <div className="bg-muted/30 p-4 rounded-lg text-sm space-y-3">
                  <p className="font-semibold text-foreground">Webhook Setup Steps:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Go to <span className="font-medium text-foreground">WooCommerce → Settings → Advanced → Webhooks</span></li>
                    <li>Click <span className="font-medium text-foreground">"Add webhook"</span></li>
                    <li>Set <span className="font-medium text-foreground">Name</span> to anything (e.g., "Zenith POS Sync")</li>
                    <li>Set <span className="font-medium text-foreground">Status</span> to "Active"</li>
                    <li>Set <span className="font-medium text-foreground">Topic</span> — create separate webhooks for:
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                        <li>Product created</li>
                        <li>Product updated</li>
                        <li>Product deleted</li>
                        <li>Order created</li>
                        <li>Order updated</li>
                      </ul>
                    </li>
                    <li>Paste the <span className="font-medium text-foreground">Delivery URL</span> above</li>
                    <li>Set <span className="font-medium text-foreground">Secret</span> (optional — leave blank)</li>
                    <li>Click <span className="font-medium text-foreground">Save webhook</span></li>
                  </ol>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>No "Delivery URL Error"</AlertTitle>
                  <AlertDescription>
                    This webhook endpoint is configured to return a proper 200 OK response, so WooCommerce will not show a delivery error.
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Connect your WooCommerce store first to get your webhook URL.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>Your WooCommerce store syncs seamlessly with your POS</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                {
                  step: "1",
                  icon: Key,
                  title: "Connect API",
                  desc: "Enter your WooCommerce store URL, Consumer Key, and Secret to authenticate.",
                },
                {
                  step: "2",
                  icon: Webhook,
                  title: "Configure Webhooks",
                  desc: "Add webhook URLs in WooCommerce for real-time product and order sync.",
                },
                {
                  step: "3",
                  icon: RefreshCw,
                  title: "Sync Products",
                  desc: "Use Sync Now to import all products, or let webhooks auto-sync changes.",
                },
                {
                  step: "4",
                  icon: Package,
                  title: "Sell on POS",
                  desc: "All synced products appear in your POS panel, ready to sell — per store.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-3 p-4 rounded-lg bg-muted/30">
                  <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground text-sm font-bold">{item.step}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon className="h-4 w-4 text-primary" />
                      <p className="font-medium text-sm">{item.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Multi-Store Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Multi-Store Data Isolation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Store-Specific Data</AlertTitle>
              <AlertDescription>
                All WooCommerce data (products, orders, and credentials) is isolated per store.
                Products synced for <strong>{activeStore?.name || "this store"}</strong> will only appear
                in this store's POS and product list. Switching stores shows different data.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default WooCommercePage;
