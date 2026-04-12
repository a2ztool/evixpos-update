import { useState, useEffect } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, QrCode, CreditCard, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Gateway {
  id: string;
  currency: string;
  gateway_name: string;
  gateway_type: string;
  qr_code_url: string;
  payment_details: Record<string, string>;
  is_active: boolean;
  sort_order: number;
}

const CURRENCIES = ["BDT", "INR", "USD"];

const AdminPaymentGateways = () => {
  const { adminCall, loading: adminLoading } = useAdmin();
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Gateway | null>(null);
  const [filterCurrency, setFilterCurrency] = useState("all");

  // Form state
  const [form, setForm] = useState({
    currency: "BDT",
    gateway_name: "",
    gateway_type: "qr",
    qr_code_url: "",
    payment_details: {} as Record<string, string>,
    is_active: true,
    sort_order: 0,
  });
  const [detailKey, setDetailKey] = useState("");
  const [detailValue, setDetailValue] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchGateways = async () => {
    setLoading(true);
    const data = await adminCall("get_payment_gateways");
    setGateways(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchGateways(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ currency: "BDT", gateway_name: "", gateway_type: "qr", qr_code_url: "", payment_details: {}, is_active: true, sort_order: 0 });
    setQrFile(null);
    setDialogOpen(true);
  };

  const openEdit = (gw: Gateway) => {
    setEditing(gw);
    setForm({
      currency: gw.currency,
      gateway_name: gw.gateway_name,
      gateway_type: gw.gateway_type,
      qr_code_url: gw.qr_code_url,
      payment_details: gw.payment_details || {},
      is_active: gw.is_active,
      sort_order: gw.sort_order,
    });
    setQrFile(null);
    setDialogOpen(true);
  };

  const handleUploadQR = async (): Promise<string> => {
    if (!qrFile) return form.qr_code_url;
    setUploading(true);
    const ext = qrFile.name.split(".").pop();
    const path = `qr/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("payment-assets").upload(path, qrFile);
    setUploading(false);
    if (error) { toast.error("QR upload failed"); return form.qr_code_url; }
    const { data } = supabase.storage.from("payment-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!form.gateway_name.trim()) { toast.error("Gateway name required"); return; }
    const qrUrl = await handleUploadQR();
    const payload = { ...form, qr_code_url: qrUrl };

    if (editing) {
      await adminCall("update_payment_gateway", { gateway_id: editing.id, ...payload });
      toast.success("Gateway updated");
    } else {
      await adminCall("create_payment_gateway", payload);
      toast.success("Gateway created");
    }
    setDialogOpen(false);
    fetchGateways();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this gateway?")) return;
    await adminCall("delete_payment_gateway", { gateway_id: id });
    toast.success("Gateway deleted");
    fetchGateways();
  };

  const handleToggle = async (gw: Gateway) => {
    await adminCall("update_payment_gateway", { gateway_id: gw.id, is_active: !gw.is_active });
    fetchGateways();
  };

  const addDetail = () => {
    if (!detailKey.trim()) return;
    setForm(f => ({ ...f, payment_details: { ...f.payment_details, [detailKey]: detailValue } }));
    setDetailKey("");
    setDetailValue("");
  };

  const removeDetail = (key: string) => {
    setForm(f => {
      const d = { ...f.payment_details };
      delete d[key];
      return { ...f, payment_details: d };
    });
  };

  const filtered = filterCurrency === "all" ? gateways : gateways.filter(g => g.currency === filterCurrency);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Payment Gateways</h2>
          <p className="text-slate-400 text-sm">Configure payment methods per currency</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Add Gateway
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <Button size="sm" variant={filterCurrency === "all" ? "default" : "outline"} onClick={() => setFilterCurrency("all")} className="text-xs">All</Button>
        {CURRENCIES.map(c => (
          <Button key={c} size="sm" variant={filterCurrency === c ? "default" : "outline"} onClick={() => setFilterCurrency(c)} className="text-xs">{c}</Button>
        ))}
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400">Gateway</TableHead>
                <TableHead className="text-slate-400">Currency</TableHead>
                <TableHead className="text-slate-400">Type</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">No gateways configured</TableCell></TableRow>
              ) : filtered.map(gw => (
                <TableRow key={gw.id} className="border-slate-700">
                  <TableCell className="text-white font-medium">
                    <div className="flex items-center gap-2">
                      {gw.gateway_type === "qr" ? <QrCode className="h-4 w-4 text-emerald-400" /> : <CreditCard className="h-4 w-4 text-blue-400" />}
                      {gw.gateway_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-slate-300 border-slate-600">{gw.currency}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-300 capitalize">{gw.gateway_type}</TableCell>
                  <TableCell>
                    <Switch checked={gw.is_active} onCheckedChange={() => handleToggle(gw)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(gw)} className="text-slate-400 hover:text-white h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(gw.id)} className="text-slate-400 hover:text-red-400 h-8 w-8">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Payment Gateway</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Type</Label>
                <Select value={form.gateway_type} onValueChange={v => setForm(f => ({ ...f, gateway_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qr">QR Code</SelectItem>
                    <SelectItem value="manual">Manual Transfer</SelectItem>
                    <SelectItem value="redirect">Redirect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-slate-300">Gateway Name</Label>
              <Input className="bg-slate-700 border-slate-600" placeholder="e.g. bKash, UPI, Stripe" value={form.gateway_name} onChange={e => setForm(f => ({ ...f, gateway_name: e.target.value }))} />
            </div>

            {form.gateway_type === "qr" && (
              <div>
                <Label className="text-slate-300">QR Code Image</Label>
                <div className="flex items-center gap-3 mt-1">
                  {(form.qr_code_url || qrFile) && (
                    <div className="w-16 h-16 rounded border border-slate-600 overflow-hidden bg-white">
                      <img src={qrFile ? URL.createObjectURL(qrFile) : form.qr_code_url} alt="QR" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <label className="cursor-pointer flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300">
                    <Upload className="h-4 w-4" /> Upload QR
                    <input type="file" accept="image/*" className="hidden" onChange={e => setQrFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            )}

            <div>
              <Label className="text-slate-300">Payment Details / Instructions</Label>
              <div className="space-y-2 mt-1">
                {Object.entries(form.payment_details).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-sm bg-slate-700 rounded px-3 py-2">
                    <span className="text-slate-400 capitalize">{k}:</span>
                    <span className="text-white flex-1">{v}</span>
                    <button onClick={() => removeDetail(k)} className="text-red-400 hover:text-red-300 text-xs">×</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input className="bg-slate-700 border-slate-600 text-xs" placeholder="Key (e.g. Account)" value={detailKey} onChange={e => setDetailKey(e.target.value)} />
                  <Input className="bg-slate-700 border-slate-600 text-xs" placeholder="Value" value={detailValue} onChange={e => setDetailValue(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={addDetail} className="text-xs border-slate-600">Add</Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-slate-300">Active</Label>
            </div>

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={adminLoading || uploading}>
              {(adminLoading || uploading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? "Update" : "Create"} Gateway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPaymentGateways;
