import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, ShoppingBag, FileDown, Eye, Receipt, DollarSign, TrendingUp } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

const Purchases = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "",
  });
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [detailDialog, setDetailDialog] = useState<any>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("store_id", storeId!).eq("is_active", true);
      return data || [];
    },
  });

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`purchases-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["purchases", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const total = Number(form.total_amount) || 0;
      const paid = Number(form.paid_amount) || 0;
      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
      const { error } = await supabase.from("purchases").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: form.supplier_id || null,
        total_amount: total, paid_amount: paid,
        payment_status: status, payment_method: form.payment_method,
        notes: form.notes,
      });
      if (error) throw error;

      if (form.supplier_id && total > paid) {
        const due = total - paid;
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", form.supplier_id).single();
        if (sup) {
          await supabase.from("suppliers").update({ balance_due: Number(sup.balance_due) + due }).eq("id", form.supplier_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      setForm({ supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "" });
      toast.success("Purchase recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Pay remaining due on a purchase
  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = Number(payAmount);
      if (amount <= 0) throw new Error("Invalid amount");
      const due = Number(payDialog.total_amount) - Number(payDialog.paid_amount);
      const newPaid = Number(payDialog.paid_amount) + Math.min(amount, due);
      const newStatus = newPaid >= Number(payDialog.total_amount) ? "paid" : "partial";

      await supabase.from("purchases").update({
        paid_amount: newPaid, payment_status: newStatus, payment_method: payMethod,
      }).eq("id", payDialog.id);

      // Reduce supplier due
      if (payDialog.supplier_id) {
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", payDialog.supplier_id).single();
        if (sup) {
          const reducedDue = Math.max(0, Number(sup.balance_due) - Math.min(amount, due));
          await supabase.from("suppliers").update({ balance_due: reducedDue }).eq("id", payDialog.supplier_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment updated!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportCSV = () => {
    const header = "Date,Supplier,Total,Paid,Due,Status,Method,Notes\n";
    const rows = purchases.map((p: any) =>
      `"${formatDate(new Date(p.purchase_date), "dd MMM yyyy")}","${p.suppliers?.name || ""}",${p.total_amount},${p.paid_amount},${Math.max(0, p.total_amount - p.paid_amount)},"${p.payment_status}","${p.payment_method}","${p.notes || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "purchases.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const totalPurchases = purchases.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
  const totalPaid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount), 0);
  const totalDue = totalPurchases - totalPaid;

  const filteredPurchases = purchases.filter((p: any) => {
    const matchSearch = p.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) || p.notes?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.payment_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="hidden sm:block">
            <h1 className="text-2xl font-bold">Purchases</h1>
            <p className="text-sm text-muted-foreground">Track purchases and supplier payments</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="hidden sm:inline-flex">
              <FileDown className="h-4 w-4 mr-1" /> Export
            </Button>
            <PageGuide title="How Purchases Work" steps={[
              { title: "Record Purchase", description: "Click 'New Purchase' to log goods received from suppliers." },
              { title: "Track Payments", description: "Set paid amount — unpaid balance auto-calculates as due." },
              { title: "Pay Later", description: "Click 'Pay' on unpaid purchases to record additional payments." },
            ]} />
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Purchase</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Purchase</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Supplier</Label>
                    <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Total Amount *</Label><Input type="number" value={form.total_amount} onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} /></div>
                    <div><Label>Paid Amount</Label><Input type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))} /></div>
                  </div>
                  {form.total_amount && (
                    <div className="rounded-lg bg-muted/50 p-2 text-sm">
                      Due: <span className="font-bold text-destructive">{format(Math.max(0, Number(form.total_amount) - Number(form.paid_amount)))}</span>
                    </div>
                  )}
                  <div>
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method} onValueChange={v => setForm(p => ({ ...p, payment_method: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="bkash">bKash</SelectItem>
                        <SelectItem value="nagad">Nagad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Purchase description" /></div>
                  <Button onClick={() => createMutation.mutate()} disabled={!form.total_amount || createMutation.isPending} className="w-full">
                    {createMutation.isPending ? "Saving..." : "Record Purchase"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-3"><ShoppingBag className="h-7 w-7 text-primary" /><div><p className="text-xs text-muted-foreground">Total Purchases</p><p className="text-xl font-bold">{format(totalPurchases)}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><TrendingUp className="h-7 w-7 text-green-600" /><div><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-xl font-bold text-green-600">{format(totalPaid)}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><DollarSign className="h-7 w-7 text-destructive" /><div><p className="text-xs text-muted-foreground">Total Due</p><p className="text-xl font-bold text-destructive">{format(totalDue)}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><Receipt className="h-7 w-7 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Entries</p><p className="text-xl font-bold">{purchases.length}</p></div></CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by supplier or notes..." className="pl-9" />
          </div>
          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
              <TabsTrigger value="partial">Partial</TabsTrigger>
              <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Card>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filteredPurchases.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No purchases found</p>
              ) : filteredPurchases.map((p: any) => {
                const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                return (
                  <div key={p.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{p.suppliers?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</p>
                      </div>
                      <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"}>
                        {p.payment_status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Total: <strong>{format(Number(p.total_amount))}</strong></span>
                      <span>Paid: <strong className="text-green-600">{format(Number(p.paid_amount))}</strong></span>
                      {due > 0 && <span>Due: <strong className="text-destructive">{format(due)}</strong></span>}
                    </div>
                    {p.notes && <p className="text-xs text-muted-foreground truncate">{p.notes}</p>}
                    {due > 0 && (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => { setPayDialog(p); setPayAmount(""); }}>
                        <Receipt className="h-3 w-3 mr-1" /> Pay Due ({format(due)})
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filteredPurchases.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No purchases found</TableCell></TableRow>
                  ) : filteredPurchases.map((p: any) => {
                    const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="font-medium">{p.suppliers?.name || "—"}</TableCell>
                        <TableCell>{format(Number(p.total_amount))}</TableCell>
                        <TableCell className="text-green-600">{format(Number(p.paid_amount))}</TableCell>
                        <TableCell>{due > 0 ? <span className="text-destructive font-medium">{format(due)}</span> : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"}>
                            {p.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{p.payment_method}</Badge></TableCell>
                        <TableCell className="text-right">
                          {due > 0 && (
                            <Button size="sm" variant="outline" onClick={() => { setPayDialog(p); setPayAmount(""); }}>
                              <Receipt className="h-3 w-3 mr-1" /> Pay
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDetailDialog(p)} title="Details">
                            <Eye className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pay Purchase Due Dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pay Purchase Due — {payDialog?.suppliers?.name || "Unknown"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-bold">{format(Number(payDialog?.total_amount || 0))}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Already Paid</span><span className="text-green-600">{format(Number(payDialog?.paid_amount || 0))}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Remaining</span><span className="font-bold text-destructive">{format(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0)))}</span></div>
              </div>
              <div><Label>Payment Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" /></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0))))}>Full Due</Button>
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
              <Button onClick={() => payMutation.mutate()} disabled={!payAmount || payMutation.isPending} className="w-full">
                {payMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Purchase Detail Dialog */}
        <Dialog open={!!detailDialog} onOpenChange={v => { if (!v) setDetailDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
            {detailDialog && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Supplier</span><p className="font-medium">{detailDialog.suppliers?.name || "—"}</p></div>
                  <div><span className="text-muted-foreground">Date</span><p className="font-medium">{formatDate(new Date(detailDialog.purchase_date), "dd MMM yyyy")}</p></div>
                  <div><span className="text-muted-foreground">Total</span><p className="font-bold">{format(Number(detailDialog.total_amount))}</p></div>
                  <div><span className="text-muted-foreground">Paid</span><p className="font-bold text-green-600">{format(Number(detailDialog.paid_amount))}</p></div>
                  <div><span className="text-muted-foreground">Status</span><Badge variant={detailDialog.payment_status === "paid" ? "default" : "destructive"}>{detailDialog.payment_status}</Badge></div>
                  <div><span className="text-muted-foreground">Method</span><Badge variant="outline">{detailDialog.payment_method}</Badge></div>
                </div>
                {detailDialog.notes && (
                  <div><span className="text-muted-foreground text-sm">Notes</span><p className="text-sm">{detailDialog.notes}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Purchases;
