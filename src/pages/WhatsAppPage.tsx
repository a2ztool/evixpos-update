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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { MessageCircle, Send, Power, PowerOff, Save, Users } from "lucide-react";
import { format } from "date-fns";

const WhatsAppPage = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [wa, setWa] = useState<any>(null);
  const [form, setForm] = useState({ api_key: "", phone_number: "" });
  const [sendOpen, setSendOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ phone: "", message: "" });
  const [bulkMessage, setBulkMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchData = async () => {
    if (!user || !activeStore) return;
    const [{ data: integration }, { data: custs }, { data: logData }] = await Promise.all([
      supabase.from("integrations").select("*").eq("user_id", user.id).eq("store_id", activeStore.id).eq("type", "whatsapp").maybeSingle(),
      supabase.from("customers").select("id, name, phone").eq("user_id", user.id).eq("store_id", activeStore.id),
      supabase.from("notification_logs").select("*").eq("user_id", user.id).eq("channel", "whatsapp").order("created_at", { ascending: false }).limit(50),
    ]);
    if (integration) { setWa(integration); setForm({ api_key: integration.api_key ?? "", phone_number: integration.phone_number ?? "" }); }
    else { setWa(null); setForm({ api_key: "", phone_number: "" }); }
    if (custs) setCustomers(custs);
    if (logData) setLogs(logData);
  };

  useEffect(() => { fetchData(); }, [user, activeStore]);

  const save = async () => {
    if (!user) return;
    if (wa) {
      await supabase.from("integrations").update({ api_key: form.api_key, phone_number: form.phone_number, status: "active" }).eq("id", wa.id);
      toast.success("WhatsApp updated");
    } else {
      await supabase.from("integrations").insert({ user_id: user.id, store_id: activeStore?.id, type: "whatsapp" as const, api_key: form.api_key, phone_number: form.phone_number, status: "active" });
      toast.success("WhatsApp connected");
    }
    fetchData();
  };

  const toggleStatus = async () => {
    if (!wa) return;
    const s = wa.status === "active" ? "inactive" : "active";
    await supabase.from("integrations").update({ status: s }).eq("id", wa.id);
    toast.success(`WhatsApp ${s}`);
    fetchData();
  };

  const sendSingle = async () => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("send-whatsapp", {
        body: { phone: sendForm.phone, message: sendForm.message },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw res.error;
      // Log it
      await supabase.from("notification_logs").insert({
        user_id: user!.id, channel: "whatsapp", recipient: sendForm.phone, message: sendForm.message, status: "sent",
      });
      toast.success("Message sent!");
      setSendOpen(false);
      setSendForm({ phone: "", message: "" });
      fetchData();
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    }
    setSending(false);
  };

  const sendBulk = async () => {
    if (!bulkMessage || selectedCustomers.length === 0) { toast.error("Select customers and write a message"); return; }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    let success = 0, fail = 0;
    for (const cid of selectedCustomers) {
      const c = customers.find((cu) => cu.id === cid);
      if (!c?.phone) { fail++; continue; }
      try {
        const res = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: c.phone, message: bulkMessage },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) { fail++; } else {
          success++;
          await supabase.from("notification_logs").insert({
            user_id: user!.id, channel: "whatsapp", recipient: c.phone, message: bulkMessage, status: "sent",
          });
        }
      } catch { fail++; }
    }
    toast.success(`Sent: ${success}, Failed: ${fail}`);
    setBulkOpen(false);
    setSelectedCustomers([]);
    setBulkMessage("");
    fetchData();
    setSending(false);
  };

  const toggleCustomer = (id: string) => {
    setSelectedCustomers((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><MessageCircle className="h-8 w-8" />WhatsApp</h1>
          <p className="text-muted-foreground mt-1">Send single and bulk messages via WhatsApp Business API.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)} disabled={!wa || wa.status !== "active"}>
            <Users className="h-4 w-4 mr-2" />Bulk Send
          </Button>
          <Button onClick={() => setSendOpen(true)} disabled={!wa || wa.status !== "active"}>
            <Send className="h-4 w-4 mr-2" />Send Message
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Config */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>API Configuration</CardTitle>
              {wa && <Badge variant={wa.status === "active" ? "default" : "secondary"}>{wa.status}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="EAAx..." />
            </div>
            <div className="space-y-2">
              <Label>Phone Number ID</Label>
              <Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="1234567890" />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} className="flex-1"><Save className="h-4 w-4 mr-2" />{wa ? "Update" : "Connect"}</Button>
              {wa && (
                <Button variant="outline" onClick={toggleStatus}>
                  {wa.status === "active" ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader><CardTitle>Message Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold">{logs.length}</p>
                <p className="text-sm text-muted-foreground">Total Sent</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold">{logs.filter((l) => l.status === "sent").length}</p>
                <p className="text-sm text-muted-foreground">Successful</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold">{logs.filter((l) => l.status === "failed").length}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-bold">{customers.filter((c) => c.phone).length}</p>
                <p className="text-sm text-muted-foreground">Contacts with Phone</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Messages */}
      <Card className="mt-6">
        <CardHeader><CardTitle>Recent Messages</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">No messages sent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{format(new Date(l.created_at), "MMM dd, HH:mm")}</TableCell>
                    <TableCell className="text-sm">{l.recipient}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">{l.message}</TableCell>
                    <TableCell><Badge variant={l.status === "sent" ? "default" : "destructive"}>{l.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Single Send Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send WhatsApp Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient Phone (with country code)</Label>
              <Input value={sendForm.phone} onChange={(e) => setSendForm({ ...sendForm, phone: e.target.value })} placeholder="+8801XXXXXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} rows={4} />
            </div>
            <Button className="w-full" onClick={sendSingle} disabled={sending || !sendForm.phone || !sendForm.message}>
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Send Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk WhatsApp Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Customers ({selectedCustomers.length} selected)</Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {customers.filter((c) => c.phone).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0">
                    <input type="checkbox" checked={selectedCustomers.includes(c.id)} onChange={() => toggleCustomer(c.id)} />
                    <span className="text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>
                  </label>
                ))}
                {customers.filter((c) => c.phone).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">No customers with phone numbers.</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} rows={4} placeholder="Hello! We have an exciting offer..." />
            </div>
            <Button className="w-full" onClick={sendBulk} disabled={sending || selectedCustomers.length === 0 || !bulkMessage}>
              {sending ? "Sending..." : `Send to ${selectedCustomers.length} customers`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default WhatsAppPage;
