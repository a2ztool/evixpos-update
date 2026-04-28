import { useState, useEffect } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, QrCode, CreditCard, Upload, Loader2, Zap, Hand, Settings2, Link2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useFormValidation } from "@/hooks/useFormValidation";
import { gatewaySchema } from "@/lib/validations";

interface RequiredField {
  key: string;
  label: string;
  type: "text" | "number" | "tel" | "email" | "textarea";
  required: boolean;
  placeholder?: string;
}

interface Gateway {
  id: string;
  currency: string;
  gateway_name: string;
  gateway_type: string;
  qr_code_url: string;
  payment_details: Record<string, string>;
  is_active: boolean;
  sort_order: number;
  mode: string;
  api_config: Record<string, string>;
  icon_url: string;
  required_fields: RequiredField[];
}

const CURRENCIES = ["BDT", "INR", "USD"];

const GATEWAY_ICONS: Record<string, string> = {
  bkash: "https://cdn.jsdelivr.net/gh/nicedaycode/payment-icons/bkash.png",
  nagad: "https://cdn.jsdelivr.net/gh/nicedaycode/payment-icons/nagad.png",
  rocket: "https://cdn.jsdelivr.net/gh/nicedaycode/payment-icons/rocket.png",
  upay: "https://cdn.jsdelivr.net/gh/nicedaycode/payment-icons/upay.png",
  upi: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/120px-UPI-Logo-vector.svg.png",
  stripe: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Stripe_Logo%2C_revised_2016.svg/120px-Stripe_Logo%2C_revised_2016.svg.png",
  paypal: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/120px-PayPal.svg.png",
  sslcommerz: "https://sslcommerz.com/wp-content/uploads/2021/11/logo.png",
};

const getIconForGateway = (gw: Gateway) => {
  if (gw.icon_url) return gw.icon_url;
  const name = gw.gateway_name.toLowerCase().replace(/\s/g, "");
  for (const [key, url] of Object.entries(GATEWAY_ICONS)) {
    if (name.includes(key)) return url;
  }
  return "";
};

const AdminPaymentGateways = () => {
  const { adminCall, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Gateway | null>(null);
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [filterMode, setFilterMode] = useState("all");

  const [form, setForm] = useState({
    currency: "BDT",
    gateway_name: "",
    gateway_type: "qr",
    qr_code_url: "",
    payment_details: {} as Record<string, string>,
    is_active: true,
    sort_order: 0,
    mode: "manual" as string,
    api_config: {} as Record<string, string>,
    icon_url: "",
    required_fields: [] as RequiredField[],
  });
  const [detailKey, setDetailKey] = useState("");
  const [detailValue, setDetailValue] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiValue, setApiValue] = useState("");
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
    setForm({ currency: "BDT", gateway_name: "", gateway_type: "qr", qr_code_url: "", payment_details: {}, is_active: true, sort_order: 0, mode: "manual", api_config: {}, icon_url: "", required_fields: [] });
    setQrFile(null);
    setDialogOpen(true);
  };

  const openEdit = (gw: Gateway) => {
    setEditing(gw);
    setForm({
      currency: gw.currency,
      gateway_name: gw.gateway_name,
      gateway_type: gw.gateway_type,
      qr_code_url: gw.qr_code_url || "",
      payment_details: gw.payment_details || {},
      is_active: gw.is_active,
      sort_order: gw.sort_order,
      mode: gw.mode || "manual",
      api_config: gw.api_config || {},
      icon_url: gw.icon_url || "",
      required_fields: Array.isArray(gw.required_fields) ? gw.required_fields : [],
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

  const v = useFormValidation(gatewaySchema);

  const handleSave = async () => {
    if (!v.validateAll({ gateway_name: form.gateway_name, currency: form.currency, qr_code_url: form.qr_code_url, icon_url: form.icon_url })) return;
    const qrUrl = await handleUploadQR();
    const cleanFields = form.required_fields.filter(f => f.key.trim() && f.label.trim());
    const payload = { ...form, qr_code_url: qrUrl, required_fields: cleanFields };

    if (editing) {
      await adminCall("update_payment_gateway", { gateway_id: editing.id, ...payload });
      toast.success("Gateway updated");
    } else {
      await adminCall("create_payment_gateway", payload);
      toast.success("Gateway created");
    }
    setDialogOpen(false);
    v.clearErrors();
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

  const quickAddZinipay = async () => {
    const exists = gateways.find(g => g.gateway_name?.toLowerCase().includes("zinipay"));
    if (exists) {
      toast.info("ZiniPay gateway already exists. Edit it instead.");
      openEdit(exists);
      return;
    }
    const payload = {
      currency: "BDT",
      gateway_name: "ZiniPay",
      gateway_type: "redirect",
      qr_code_url: "",
      payment_details: {
        info: "Pay via bKash, Nagad, Rocket, Upay or Card through ZiniPay secure checkout",
      },
      is_active: true,
      sort_order: 0,
      mode: "auto",
      api_config: {
        provider: "zinipay",
        note: "API key is stored as ZINIPAY_API_KEY secret in Supabase Edge Functions",
      },
      icon_url: "https://zinipay.com/assets/img/logo.png",
      required_fields: [],
    };
    await adminCall("create_payment_gateway", payload);
    toast.success("ZiniPay gateway added! BDT users can now pay via bKash/Nagad/Card.");
    fetchGateways();
  };

  const addDetail = () => {
    if (!detailKey.trim()) return;
    setForm(f => ({ ...f, payment_details: { ...f.payment_details, [detailKey]: detailValue } }));
    setDetailKey(""); setDetailValue("");
  };

  const removeDetail = (key: string) => {
    setForm(f => { const d = { ...f.payment_details }; delete d[key]; return { ...f, payment_details: d }; });
  };

  const addApiConfig = () => {
    if (!apiKey.trim()) return;
    setForm(f => ({ ...f, api_config: { ...f.api_config, [apiKey]: apiValue } }));
    setApiKey(""); setApiValue("");
  };

  const removeApiConfig = (key: string) => {
    setForm(f => { const d = { ...f.api_config }; delete d[key]; return { ...f, api_config: d }; });
  };

  const filtered = gateways.filter(g => {
    if (filterCurrency !== "all" && g.currency !== filterCurrency) return false;
    if (filterMode !== "all" && g.mode !== filterMode) return false;
    return true;
  });

  const manualCount = gateways.filter(g => g.mode === "manual").length;
  const autoCount = gateways.filter(g => g.mode === "auto").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Payment Gateways</h2>
          <p className="text-slate-400 text-sm">Configure manual & automatic payment methods</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={quickAddZinipay} className="gap-2 border-pink-500/30 text-pink-400 hover:bg-pink-500/10">
            <Sparkles className="h-4 w-4" /> Quick-Add ZiniPay
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/auto-payments")} className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            <Zap className="h-4 w-4" /> Auto Dashboard
          </Button>
          <Button onClick={openCreate} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Add Gateway
          </Button>
        </div>
      </div>

      {/* Mode Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-slate-800 border-slate-700 cursor-pointer hover:border-slate-600 transition-colors" onClick={() => setFilterMode("all")}>
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-lg font-bold text-white">{gateways.length}</p>
              <p className="text-xs text-slate-400">Total Gateways</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700 cursor-pointer hover:border-blue-500/30 transition-colors" onClick={() => setFilterMode("manual")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Hand className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-lg font-bold text-white">{manualCount}</p>
              <p className="text-xs text-slate-400">Manual</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700 cursor-pointer hover:border-amber-500/30 transition-colors" onClick={() => setFilterMode("auto")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-lg font-bold text-white">{autoCount}</p>
              <p className="text-xs text-slate-400">Automatic</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Currency Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={filterCurrency === "all" ? "default" : "outline"} onClick={() => setFilterCurrency("all")} className="text-xs">All</Button>
        {CURRENCIES.map(c => (
          <Button key={c} size="sm" variant={filterCurrency === c ? "default" : "outline"} onClick={() => setFilterCurrency(c)} className="text-xs">{c}</Button>
        ))}
        {filterMode !== "all" && (
          <Button size="sm" variant="ghost" onClick={() => setFilterMode("all")} className="text-xs text-slate-400">
            Clear mode filter ×
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400">Gateway</TableHead>
                <TableHead className="text-slate-400">Currency</TableHead>
                <TableHead className="text-slate-400">Type</TableHead>
                <TableHead className="text-slate-400">Mode</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">No gateways found</TableCell></TableRow>
              ) : filtered.map(gw => {
                const iconUrl = getIconForGateway(gw);
                return (
                  <TableRow key={gw.id} className="border-slate-700">
                    <TableCell className="text-white font-medium">
                      <div className="flex items-center gap-3">
                        {iconUrl ? (
                          <img src={iconUrl} alt={gw.gateway_name} className="h-7 w-7 rounded-md object-contain bg-white p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          gw.gateway_type === "qr" ? <QrCode className="h-5 w-5 text-emerald-400" /> : <CreditCard className="h-5 w-5 text-blue-400" />
                        )}
                        <span>{gw.gateway_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-slate-300 border-slate-600">{gw.currency}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-300 capitalize text-sm">{gw.gateway_type}</TableCell>
                    <TableCell>
                      <Badge className={gw.mode === "auto"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"
                        : "bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1"
                      }>
                        {gw.mode === "auto" ? <Zap className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                        {gw.mode === "auto" ? "Auto" : "Manual"}
                      </Badge>
                    </TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Payment Gateway</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="w-full bg-slate-700">
              <TabsTrigger value="basic" className="flex-1 text-xs">Basic Info</TabsTrigger>
              <TabsTrigger value="mode" className="flex-1 text-xs">Mode & API</TabsTrigger>
              <TabsTrigger value="details" className="flex-1 text-xs">Details</TabsTrigger>
              <TabsTrigger value="fields" className="flex-1 text-xs">User Fields</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
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
                <Input
                  className="bg-slate-700 border-slate-600"
                  placeholder="e.g. bKash, UPI, Stripe"
                  value={form.gateway_name}
                  error={!!v.getError("gateway_name")}
                  onChange={e => { setForm(f => ({ ...f, gateway_name: e.target.value })); v.clearField("gateway_name"); }}
                />
                {v.getError("gateway_name") && <p className="text-xs text-destructive mt-1">{v.getError("gateway_name")}</p>}
              </div>

              <div>
                <Label className="text-slate-300">Icon URL (optional)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    className="bg-slate-700 border-slate-600 flex-1"
                    placeholder="https://..."
                    value={form.icon_url}
                    error={!!v.getError("icon_url")}
                    onChange={e => { setForm(f => ({ ...f, icon_url: e.target.value })); v.clearField("icon_url"); }}
                  />
                  {(form.icon_url || getIconForGateway({ ...form } as any)) && (
                    <img src={form.icon_url || getIconForGateway({ ...form } as any)} alt="" className="h-8 w-8 rounded bg-white p-0.5 object-contain" />
                  )}
                </div>
                {v.getError("icon_url") && <p className="text-xs text-destructive mt-1">{v.getError("icon_url")}</p>}
                <p className="text-[10px] text-slate-500 mt-1">Leave empty for auto-detected icon</p>
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

              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label className="text-slate-300">Active</Label>
              </div>
            </TabsContent>

            <TabsContent value="mode" className="space-y-4 mt-4">
              <div>
                <Label className="text-slate-300 mb-2 block">Payment Mode</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, mode: "manual" }))}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      form.mode === "manual" ? "border-blue-500 bg-blue-500/10" : "border-slate-600 bg-slate-700/50 hover:border-slate-500"
                    }`}
                  >
                    <Hand className={`h-6 w-6 mb-2 ${form.mode === "manual" ? "text-blue-400" : "text-slate-400"}`} />
                    <p className="font-medium text-white text-sm">Manual</p>
                    <p className="text-[10px] text-slate-400 mt-1">Personal account — manually verify payments</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, mode: "auto" }))}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      form.mode === "auto" ? "border-amber-500 bg-amber-500/10" : "border-slate-600 bg-slate-700/50 hover:border-slate-500"
                    }`}
                  >
                    <Zap className={`h-6 w-6 mb-2 ${form.mode === "auto" ? "text-amber-400" : "text-slate-400"}`} />
                    <p className="font-medium text-white text-sm">Automatic</p>
                    <p className="text-[10px] text-slate-400 mt-1">Merchant API — auto verify & activate plans</p>
                  </button>
                </div>
              </div>

              {form.mode === "auto" && (
                <div className="space-y-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-1">
                      <Settings2 className="h-4 w-4" /> API Configuration
                    </div>
                    <p className="text-[11px] text-slate-400">Add your merchant API credentials below. These will be used for automatic payment verification.</p>
                  </div>

                  {Object.entries(form.api_config).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-sm bg-slate-700 rounded px-3 py-2">
                      <span className="text-amber-400 capitalize font-medium">{k}:</span>
                      <span className="text-white flex-1 font-mono text-xs">
                        {k.toLowerCase().includes("secret") || k.toLowerCase().includes("password") ? "••••••••" : v}
                      </span>
                      <button onClick={() => removeApiConfig(k)} className="text-red-400 hover:text-red-300 text-xs">×</button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input className="bg-slate-700 border-slate-600 text-xs" placeholder="Key (e.g. app_key)" value={apiKey} onChange={e => setApiKey(e.target.value)} />
                    <Input className="bg-slate-700 border-slate-600 text-xs" placeholder="Value" value={apiValue} onChange={e => setApiValue(e.target.value)} />
                    <Button size="sm" variant="outline" onClick={addApiConfig} className="text-xs border-amber-500/30 text-amber-400">Add</Button>
                  </div>
                </div>
              )}

              {form.mode === "manual" && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
                    <Hand className="h-4 w-4" /> Manual Mode
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
                    <li>User submits Transaction ID & payment proof</li>
                    <li>Admin manually verifies and approves</li>
                    <li>Plan activates after admin approval</li>
                    <li>Duplicate Transaction ID detection enabled</li>
                    <li>1-hour expiry timer on pending payments</li>
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="space-y-4 mt-4">
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
            </TabsContent>

            <TabsContent value="fields" className="space-y-3 mt-4">
              <div className="bg-slate-700/40 border border-slate-600 rounded-lg p-3">
                <p className="text-xs text-slate-300 font-medium mb-1">Dynamic User Input Fields</p>
                <p className="text-[11px] text-slate-400">When user selects this gateway during checkout, these fields will appear for them to fill (e.g. Phone, Transaction ID, Account Number).</p>
              </div>

              {form.required_fields.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-3">No fields added yet. Add one below.</p>
              )}

              {form.required_fields.map((f, idx) => (
                <div key={idx} className="bg-slate-700 rounded-lg p-3 space-y-2 border border-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Field #{idx + 1}</span>
                    <button
                      onClick={() => setForm(s => ({ ...s, required_fields: s.required_fields.filter((_, i) => i !== idx) }))}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >Remove</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      className="bg-slate-800 border-slate-600 text-xs h-8"
                      placeholder="Key (e.g. phone)"
                      value={f.key}
                      onChange={e => setForm(s => ({ ...s, required_fields: s.required_fields.map((x, i) => i === idx ? { ...x, key: e.target.value.replace(/\s+/g, "_").toLowerCase() } : x) }))}
                    />
                    <Input
                      className="bg-slate-800 border-slate-600 text-xs h-8"
                      placeholder="Label (e.g. Your Phone)"
                      value={f.label}
                      onChange={e => setForm(s => ({ ...s, required_fields: s.required_fields.map((x, i) => i === idx ? { ...x, label: e.target.value } : x) }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={f.type}
                      onValueChange={v => setForm(s => ({ ...s, required_fields: s.required_fields.map((x, i) => i === idx ? { ...x, type: v as RequiredField["type"] } : x) }))}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-600 text-xs h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="tel">Phone</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="textarea">Long Text</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="bg-slate-800 border-slate-600 text-xs h-8"
                      placeholder="Placeholder"
                      value={f.placeholder || ""}
                      onChange={e => setForm(s => ({ ...s, required_fields: s.required_fields.map((x, i) => i === idx ? { ...x, placeholder: e.target.value } : x) }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <Switch
                      checked={f.required}
                      onCheckedChange={v => setForm(s => ({ ...s, required_fields: s.required_fields.map((x, i) => i === idx ? { ...x, required: v } : x) }))}
                    />
                    Required field
                  </label>
                </div>
              ))}

              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => setForm(s => ({ ...s, required_fields: [...s.required_fields, { key: "", label: "", type: "text", required: true, placeholder: "" }] }))}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
              </Button>
            </TabsContent>
          </Tabs>

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 mt-4" onClick={handleSave} disabled={adminLoading || uploading}>
            {(adminLoading || uploading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editing ? "Update" : "Create"} Gateway
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPaymentGateways;
