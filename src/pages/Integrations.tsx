import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plug, ShoppingBag, MessageCircle, Copy, Send, Power, PowerOff } from "lucide-react";

interface Integration {
  id: string;
  type: "woocommerce" | "whatsapp";
  api_key: string;
  status: string;
  webhook_url: string;
  phone_number: string;
}

const Integrations = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [waForm, setWaForm] = useState({ api_key: "", phone_number: "" });
  const [wcForm, setWcForm] = useState({ api_key: "" });
  const [sendOpen, setSendOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const fetchIntegrations = async () => {
    if (!user || !activeStore) return;
    const { data } = await supabase.from("integrations").select("*").eq("user_id", user.id).eq("store_id", activeStore.id);
    if (data) setIntegrations(data as Integration[]);
  };

  useEffect(() => {
    if (user && activeStore) fetchIntegrations();
  }, [user, activeStore]);

  const wc = integrations.find((i) => i.type === "woocommerce");
  const wa = integrations.find((i) => i.type === "whatsapp");

  const webhookUrl = wc
    ? `https://vuuesqrdjuqnduhiihwz.supabase.co/functions/v1/woocommerce-webhook?integration_id=${wc.id}`
    : "";

  const saveWooCommerce = async () => {
    if (wc) {
      const { error } = await supabase.from("integrations").update({ api_key: wcForm.api_key, status: "active" }).eq("id", wc.id);
      if (error) toast.error(error.message);
      else toast.success("WooCommerce updated");
    } else {
      const { error } = await supabase.from("integrations").insert({
        user_id: user!.id, store_id: activeStore?.id, type: "woocommerce" as const, api_key: wcForm.api_key, status: "active",
      });
      if (error) toast.error(error.message);
      else toast.success("WooCommerce connected");
    }
    fetchIntegrations();
  };

  const saveWhatsApp = async () => {
    if (wa) {
      const { error } = await supabase.from("integrations").update({ api_key: waForm.api_key, phone_number: waForm.phone_number, status: "active" }).eq("id", wa.id);
      if (error) toast.error(error.message);
      else toast.success("WhatsApp updated");
    } else {
      const { error } = await supabase.from("integrations").insert({
        user_id: user!.id, store_id: activeStore?.id, type: "whatsapp" as const, api_key: waForm.api_key, phone_number: waForm.phone_number, status: "active",
      });
      if (error) toast.error(error.message);
      else toast.success("WhatsApp connected");
    }
    fetchIntegrations();
  };

  const toggleStatus = async (integration: Integration) => {
    const newStatus = integration.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("integrations").update({ status: newStatus }).eq("id", integration.id);
    if (error) toast.error(error.message);
    else { toast.success(`Integration ${newStatus}`); fetchIntegrations(); }
  };

  const sendWhatsApp = async () => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("send-whatsapp", {
        body: { phone: sendForm.phone, message: sendForm.message },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw res.error;
      toast.success("Message sent!");
      setSendOpen(false);
      setSendForm({ phone: "", message: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
    }
    setSending(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // Pre-fill forms
  useEffect(() => {
    if (wc) setWcForm({ api_key: wc.api_key });
    if (wa) setWaForm({ api_key: wa.api_key, phone_number: wa.phone_number });
  }, [integrations]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Integrations</h1>
      </div>

      <Tabs defaultValue="woocommerce" className="space-y-6">
        <TabsList>
          <TabsTrigger value="woocommerce" className="gap-2"><ShoppingBag className="h-4 w-4" />WooCommerce</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2"><MessageCircle className="h-4 w-4" />WhatsApp</TabsTrigger>
        </TabsList>

        {/* WOOCOMMERCE */}
        <TabsContent value="woocommerce">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />WooCommerce</CardTitle>
                  {wc && <Badge variant={wc.status === "active" ? "default" : "secondary"}>{wc.status}</Badge>}
                </div>
                <CardDescription>Sync orders from your WooCommerce store automatically</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Consumer Secret / API Key</Label>
                  <Input type="password" value={wcForm.api_key} onChange={(e) => setWcForm({ api_key: e.target.value })} placeholder="ck_..." />
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveWooCommerce} className="flex-1">{wc ? "Update" : "Connect"}</Button>
                  {wc && (
                    <Button variant="outline" onClick={() => toggleStatus(wc)}>
                      {wc.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Webhook Setup</CardTitle>
                <CardDescription>Add this URL to your WooCommerce webhook settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {wc ? (
                  <>
                    <div className="space-y-2">
                      <Label>Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="font-medium">Setup steps:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Go to WooCommerce → Settings → Advanced → Webhooks</li>
                        <li>Click "Add webhook"</li>
                        <li>Set Topic to "Order created"</li>
                        <li>Paste the webhook URL above</li>
                        <li>Set Status to "Active" and save</li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">Connect WooCommerce first to get your webhook URL.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* WHATSAPP */}
        <TabsContent value="whatsapp">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" />WhatsApp Business</CardTitle>
                  {wa && <Badge variant={wa.status === "active" ? "default" : "secondary"}>{wa.status}</Badge>}
                </div>
                <CardDescription>Send messages to customers via WhatsApp Business API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <Input type="password" value={waForm.api_key} onChange={(e) => setWaForm({ ...waForm, api_key: e.target.value })} placeholder="EAAx..." />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number ID</Label>
                  <Input value={waForm.phone_number} onChange={(e) => setWaForm({ ...waForm, phone_number: e.target.value })} placeholder="1234567890" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveWhatsApp} className="flex-1">{wa ? "Update" : "Connect"}</Button>
                  {wa && (
                    <>
                      <Button variant="outline" onClick={() => toggleStatus(wa)}>
                        {wa.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <Button variant="secondary" onClick={() => setSendOpen(true)}>
                        <Send className="h-4 w-4 mr-2" />Test
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Setup Guide</CardTitle>
                <CardDescription>How to configure WhatsApp Business API</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground space-y-1">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Meta for Developers</a></li>
                    <li>Create or select your app</li>
                    <li>Add the WhatsApp product</li>
                    <li>Go to WhatsApp → API Setup</li>
                    <li>Copy your Access Token and Phone Number ID</li>
                    <li>Paste them in the form</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Send WhatsApp Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send WhatsApp Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient Phone (with country code)</Label>
              <Input value={sendForm.phone} onChange={(e) => setSendForm({ ...sendForm, phone: e.target.value })} placeholder="+1234567890" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} placeholder="Hello from POS!" rows={4} />
            </div>
            <Button className="w-full" onClick={sendWhatsApp} disabled={sending || !sendForm.phone || !sendForm.message}>
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Integrations;
