import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, DollarSign, Users, Receipt, MessageCircle } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

const CustomerCredits = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["customer-credits", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId!)
        .order("total_due", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["credit-payments", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_payments")
        .select("*, customers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Real-time subscription
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`credits-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_credits", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["customer-credits", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_payments", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["credit-payments", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const payMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(payAmount);
      if (!payDialog || amount <= 0) return;

      await supabase.from("credit_payments").insert({
        store_id: storeId!, user_id: userId!,
        customer_id: payDialog.customer_id,
        amount, payment_method: payMethod,
      });

      const newDue = Math.max(0, Number(payDialog.total_due) - amount);
      await supabase.from("customer_credits").update({
        total_due: newDue, last_payment_date: new Date().toISOString(),
      }).eq("id", payDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
      queryClient.invalidateQueries({ queryKey: ["credit-payments"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendWhatsApp = (credit: any) => {
    const phone = credit.customers?.phone?.replace(/[^0-9]/g, "") || "";
    if (!phone) { toast.error("No phone number"); return; }
    const name = credit.customers?.name || "Customer";
    const amount = format(Number(credit.total_due));
    const text = `Hello ${name}, your due amount is ${amount}. Please clear it at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const totalDue = credits.reduce((s: number, c: any) => s + Number(c.total_due), 0);
  const customersWithDue = credits.filter((c: any) => Number(c.total_due) > 0).length;

  const filtered = credits.filter((c: any) =>
    c.customers?.name?.toLowerCase().includes(search.toLowerCase()) || c.customers?.phone?.includes(search)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Customer Credits</h1>
            <p className="text-sm text-muted-foreground">Track customer dues and collect payments</p>
          </div>
          <PageGuide title="How Customer Credits Work" steps={[
            { title: "Auto Sync", description: "Due orders from POS automatically appear here." },
            { title: "Track Dues", description: "Outstanding balances update in real-time." },
            { title: "Collect Payment", description: "Click 'Collect' to record payment. Send WhatsApp reminders." },
          ]} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Due</p><p className="text-2xl font-bold text-destructive">{format(totalDue)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Customers with Due</p><p className="text-2xl font-bold">{customersWithDue}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Recent Payments</p><p className="text-2xl font-bold text-green-600">{payments.length}</p></CardContent></Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="pl-9" />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Customer Dues</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No credit records</p>
              ) : filtered.map((c: any) => (
                <div key={c.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{c.customers?.name}</p>
                      <p className="text-xs text-muted-foreground">{c.customers?.phone}</p>
                    </div>
                    <Badge variant={Number(c.total_due) > 0 ? "destructive" : "secondary"}>
                      {format(Number(c.total_due))}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Limit: {format(Number(c.credit_limit))}</p>
                  <div className="flex gap-2">
                    {Number(c.total_due) > 0 && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setPayDialog(c)} className="flex-1">
                          <Receipt className="h-3 w-3 mr-1" /> Collect
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => sendWhatsApp(c)}>
                          <MessageCircle className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Credit Limit</TableHead>
                    <TableHead>Total Due</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No credit records</TableCell></TableRow>
                  ) : filtered.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-medium">{c.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">{c.customers?.phone}</p>
                      </TableCell>
                      <TableCell>{format(Number(c.credit_limit))}</TableCell>
                      <TableCell>
                        <Badge variant={Number(c.total_due) > 0 ? "destructive" : "secondary"}>
                          {format(Number(c.total_due))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.last_payment_date ? formatDate(new Date(c.last_payment_date), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {Number(c.total_due) > 0 && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setPayDialog(c)}>
                              <Receipt className="h-3 w-3 mr-1" /> Collect
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => sendWhatsApp(c)} title="WhatsApp Reminder">
                              <MessageCircle className="h-3 w-3 text-green-600" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Payments */}
        {payments.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Recent Payments</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{formatDate(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>{p.customers?.name}</TableCell>
                      <TableCell className="text-green-600 font-medium">{format(Number(p.amount))}</TableCell>
                      <TableCell><Badge variant="secondary">{p.payment_method}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pay dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Collect Payment — {payDialog?.customers?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm">Due: <span className="font-bold text-destructive">{format(Number(payDialog?.total_due || 0))}</span></p>
              <div><Label>Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Payment amount" /></div>
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
      </div>
    </DashboardLayout>
  );
};

export default CustomerCredits;
