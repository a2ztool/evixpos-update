import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, ShoppingBag } from "lucide-react";
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
  const [form, setForm] = useState({
    supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "",
  });

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

      // Update supplier balance_due
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

  const totalPurchases = purchases.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
  const totalDue = purchases.reduce((s: number, p: any) => s + Math.max(0, Number(p.total_amount) - Number(p.paid_amount)), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Purchases</h1>
            <p className="text-sm text-muted-foreground">Track purchases and supplier payments</p>
          </div>
          <div className="flex items-center gap-2">
            <PageGuide title="How Purchases Work" steps={[
              { title: "Record Purchase", description: "Click 'New Purchase' to log goods received from suppliers." },
              { title: "Track Payments", description: "Set paid amount — unpaid balance auto-calculates as due." },
              { title: "Stock Auto-Update", description: "Product stock automatically increases when purchase is saved." },
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
                <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
                <Button onClick={() => createMutation.mutate()} disabled={!form.total_amount || createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Saving..." : "Record Purchase"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Purchases</p><p className="text-2xl font-bold">{format(totalPurchases)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Due</p><p className="text-2xl font-bold text-destructive">{format(totalDue)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Entries</p><p className="text-2xl font-bold">{purchases.length}</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : purchases.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No purchases yet</TableCell></TableRow>
                ) : purchases.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{p.suppliers?.name || "—"}</TableCell>
                    <TableCell>{format(Number(p.total_amount))}</TableCell>
                    <TableCell>{format(Number(p.paid_amount))}</TableCell>
                    <TableCell>
                      <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"}>
                        {p.payment_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Purchases;
