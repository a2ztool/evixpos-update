import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Truck, Phone, Mail, Edit2, Trash2, FileDown, MessageCircle, Receipt, Eye, DollarSign, Users } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

const Suppliers = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [historyDialog, setHistoryDialog] = useState<any>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`suppliers-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["suppliers", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("suppliers").update({
          name: form.name, phone: form.phone, email: form.email,
          address: form.address, notes: form.notes,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          store_id: storeId!, user_id: userId!, name: form.name,
          phone: form.phone, email: form.email, address: form.address, notes: form.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      resetForm();
      toast.success(editId ? "Supplier updated" : "Supplier added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier removed");
    },
  });

  const paySupplierMutation = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = Number(payAmount);
      if (amount <= 0) throw new Error("Invalid amount");
      const newDue = Math.max(0, Number(payDialog.balance_due) - amount);
      await supabase.from("suppliers").update({ balance_due: newDue }).eq("id", payDialog.id);
      // Record as purchase payment
      await supabase.from("purchases").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: payDialog.id,
        total_amount: 0, paid_amount: amount,
        payment_status: "paid", payment_method: payMethod,
        notes: `Due payment to ${payDialog.name}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded! Supplier due updated.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => { setForm({ name: "", phone: "", email: "", address: "", notes: "" }); setEditId(null); };

  const openEdit = (s: any) => {
    setForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" });
    setEditId(s.id);
    setDialogOpen(true);
  };

  const viewPurchaseHistory = async (supplier: any) => {
    setHistoryDialog(supplier);
    const { data } = await supabase
      .from("purchases")
      .select("*")
      .eq("supplier_id", supplier.id)
      .eq("store_id", storeId!)
      .order("created_at", { ascending: false })
      .limit(20);
    setPurchaseHistory(data || []);
  };

  const sendWhatsApp = (supplier: any) => {
    const phone = supplier.phone?.replace(/[^0-9]/g, "") || "";
    if (!phone) { toast.error("No phone number"); return; }
    const text = `Hello ${supplier.name}, your outstanding balance is ${format(Number(supplier.balance_due))}. Please confirm the payment schedule. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const exportCSV = () => {
    const header = "Name,Phone,Email,Address,Balance Due\n";
    const rows = suppliers.map((s: any) =>
      `"${s.name}","${s.phone || ""}","${s.email || ""}","${s.address || ""}",${s.balance_due || 0}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "suppliers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = suppliers.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search)
  );

  const totalDue = suppliers.reduce((sum: number, s: any) => sum + Number(s.balance_due || 0), 0);
  const suppliersWithDue = suppliers.filter((s: any) => Number(s.balance_due) > 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
            <p className="text-sm text-muted-foreground">Manage your suppliers and purchase dues</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="hidden sm:inline-flex">
              <FileDown className="h-4 w-4 mr-1" /> Export
            </Button>
            <PageGuide title="How Suppliers Work" steps={[
              { title: "Add Supplier", description: "Click 'Add Supplier' to register a new supplier with contact info." },
              { title: "Track Balance", description: "Each supplier shows their outstanding balance due from purchases." },
              { title: "Pay Due", description: "Click 'Pay' to record a payment and reduce the supplier's balance." },
              { title: "Purchase History", description: "View all purchases made from each supplier." },
            ]} />
            <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Add Supplier</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Supplier name" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" /></div>
                    <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" /></div>
                  </div>
                  <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" /></div>
                  <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} /></div>
                  <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full">
                    {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Add Supplier"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-3"><Users className="h-7 w-7 text-primary" /><div><p className="text-xs text-muted-foreground">Total Suppliers</p><p className="text-xl font-bold">{suppliers.length}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><DollarSign className="h-7 w-7 text-destructive" /><div><p className="text-xs text-muted-foreground">Total Due</p><p className="text-xl font-bold text-destructive">{format(totalDue)}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><Truck className="h-7 w-7 text-amber-500" /><div><p className="text-xs text-muted-foreground">With Due</p><p className="text-xl font-bold">{suppliersWithDue}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><Receipt className="h-7 w-7 text-green-600" /><div><p className="text-xs text-muted-foreground">Paid Up</p><p className="text-xl font-bold text-green-600">{suppliers.length - suppliersWithDue}</p></div></CardContent></Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..." className="pl-9" />
        </div>

        <Card>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No suppliers found</p>
              ) : filtered.map((s: any) => (
                <div key={s.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <Truck className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        {s.phone && <p className="text-xs text-muted-foreground">{s.phone}</p>}
                      </div>
                    </div>
                    <Badge variant={Number(s.balance_due) > 0 ? "destructive" : "secondary"}>
                      {format(Number(s.balance_due || 0))}
                    </Badge>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {Number(s.balance_due) > 0 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => { setPayDialog(s); setPayAmount(""); }}>
                        <Receipt className="h-3 w-3 mr-1" /> Pay
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => viewPurchaseHistory(s)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(s)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    {s.phone && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => sendWhatsApp(s)}>
                        <MessageCircle className="h-3 w-3 text-green-600" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Balance Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No suppliers found</TableCell></TableRow>
                  ) : filtered.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <Truck className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{s.name}</p>
                            {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {s.phone && <div className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3" />{s.phone}</div>}
                          {s.email && <div className="flex items-center gap-1 text-sm"><Mail className="h-3 w-3" />{s.email}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={Number(s.balance_due) > 0 ? "destructive" : "secondary"}>
                          {format(Number(s.balance_due || 0))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {Number(s.balance_due) > 0 && (
                          <Button variant="outline" size="sm" onClick={() => { setPayDialog(s); setPayAmount(""); }}>
                            <Receipt className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => viewPurchaseHistory(s)} title="Purchase History">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {s.phone && (
                          <Button variant="ghost" size="icon" onClick={() => sendWhatsApp(s)} title="WhatsApp">
                            <MessageCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pay Supplier Dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pay Supplier — {payDialog?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm">Outstanding Due: <span className="font-bold text-destructive">{format(Number(payDialog?.balance_due || 0))}</span></p>
              <div><Label>Payment Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" /></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(payDialog?.balance_due || 0))}>Full Amount</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Number(payDialog?.balance_due || 0) / 2)))}>Half</Button>
              </div>
              <div>
                <Label>Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => paySupplierMutation.mutate()} disabled={!payAmount || paySupplierMutation.isPending} className="w-full">
                {paySupplierMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Purchase History Dialog */}
        <Dialog open={!!historyDialog} onOpenChange={v => { if (!v) setHistoryDialog(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Purchase History — {historyDialog?.name}</DialogTitle></DialogHeader>
            {purchaseHistory.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No purchases from this supplier yet.</p>
            ) : (
              <>
                <div className="text-sm text-muted-foreground mb-2">
                  Total: <span className="font-bold">{format(purchaseHistory.reduce((s: number, p: any) => s + Number(p.total_amount), 0))}</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseHistory.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{formatDate(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell>{format(Number(p.total_amount))}</TableCell>
                          <TableCell className="text-green-600">{format(Number(p.paid_amount))}</TableCell>
                          <TableCell>
                            <Badge variant={p.payment_status === "paid" ? "default" : "destructive"}>{p.payment_status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Suppliers;
