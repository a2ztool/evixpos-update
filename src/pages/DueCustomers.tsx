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
import { Search, Users, Receipt, MessageCircle, Eye, DollarSign, AlertTriangle, TrendingDown, Calendar } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const DueCustomers = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [txDialog, setTxDialog] = useState<any>(null);
  const [txData, setTxData] = useState<any[]>([]);

  const { data: dueCustomers = [], isLoading } = useQuery({
    queryKey: ["due-customers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*, customers(name, phone, email)")
        .eq("store_id", storeId!)
        .gt("total_due", 0)
        .order("total_due", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch payment history for chart (last 30 days)
  const { data: paymentHistory = [] } = useQuery({
    queryKey: ["payment-history-chart", storeId],
    enabled: ready,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data } = await supabase
        .from("credit_payments")
        .select("amount, created_at")
        .eq("store_id", storeId!)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`due-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_credits", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["due-customers", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_payments", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["payment-history-chart", storeId] });
        queryClient.invalidateQueries({ queryKey: ["due-customers", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  // Build chart data
  const chartData = (() => {
    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = formatDate(subDays(new Date(), i), "dd MMM");
      dayMap.set(d, 0);
    }
    paymentHistory.forEach((p: any) => {
      const d = formatDate(new Date(p.created_at), "dd MMM");
      if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) || 0) + Number(p.amount));
    });
    return Array.from(dayMap.entries()).map(([date, amount]) => ({ date, amount }));
  })();

  const totalDue = dueCustomers.reduce((s: number, c: any) => s + Number(c.total_due), 0);
  const highestDue = dueCustomers.length > 0 ? dueCustomers[0] : null;

  const filtered = dueCustomers.filter((c: any) =>
    c.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.customers?.phone?.includes(search)
  );

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
      queryClient.invalidateQueries({ queryKey: ["due-customers"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const viewTransactions = async (credit: any) => {
    setTxDialog(credit);
    const { data } = await supabase
      .from("credit_payments")
      .select("*")
      .eq("customer_id", credit.customer_id)
      .eq("store_id", storeId!)
      .order("created_at", { ascending: false })
      .limit(20);
    setTxData(data || []);
  };

  const sendWhatsApp = (credit: any) => {
    const phone = credit.customers?.phone?.replace(/[^0-9]/g, "") || "";
    if (!phone) { toast.error("No phone number for this customer"); return; }
    const name = credit.customers?.name || "Customer";
    const amount = format(Number(credit.total_due));
    const text = `Hello ${name}, your due amount is ${amount}. Please clear it at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const sendBulkWhatsApp = () => {
    let sent = 0;
    dueCustomers.forEach((c: any) => {
      const phone = c.customers?.phone?.replace(/[^0-9]/g, "") || "";
      if (phone) sent++;
    });
    if (sent === 0) { toast.error("No customers with phone numbers"); return; }
    toast.info(`Opening WhatsApp for ${dueCustomers.length} customers individually...`);
    if (dueCustomers.length > 0) sendWhatsApp(dueCustomers[0]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="hidden sm:block">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Due Customers
            </h1>
            <p className="text-sm text-muted-foreground">Customers with outstanding dues</p>
          </div>
          <Button variant="outline" size="sm" onClick={sendBulkWhatsApp} disabled={dueCustomers.length === 0}>
            <MessageCircle className="h-4 w-4 mr-1" /> Send Reminders
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Card>
            <CardContent className="pt-3 sm:pt-4 flex items-center gap-3">
              <DollarSign className="h-7 w-7 sm:h-8 sm:w-8 text-destructive" />
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-lg sm:text-2xl font-bold text-destructive">{format(totalDue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 sm:pt-4 flex items-center gap-3">
              <Users className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Due Customers</p>
                <p className="text-lg sm:text-2xl font-bold">{dueCustomers.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 sm:pt-4 flex items-center gap-3">
              <TrendingDown className="h-7 w-7 sm:h-8 sm:w-8 text-amber-500" />
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Highest Due</p>
                <p className="text-sm sm:text-lg font-bold">{highestDue ? `${highestDue.customers?.name}: ${format(Number(highestDue.total_due))}` : "—"}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Collection Chart */}
        {chartData.some(d => d.amount > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Payment Collections (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number) => [format(value), "Collected"]}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="pl-9" />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Due List</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No due customers 🎉</p>
              ) : filtered.map((c: any) => (
                <div key={c.id} className="bg-card rounded-2xl border border-border/40 p-3.5 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{c.customers?.name}</p>
                      <p className="text-xs text-muted-foreground">{c.customers?.phone}</p>
                    </div>
                    <Badge variant="destructive">{format(Number(c.total_due))}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPayDialog(c)} className="flex-1">
                      <Receipt className="h-3 w-3 mr-1" /> Pay
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => viewTransactions(c)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => sendWhatsApp(c)}>
                      <MessageCircle className="h-3 w-3" />
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
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Total Due</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No due customers 🎉</TableCell></TableRow>
                  ) : filtered.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.customers?.name}</TableCell>
                      <TableCell>{c.customers?.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{format(Number(c.total_due))}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.last_payment_date ? formatDate(new Date(c.last_payment_date), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => setPayDialog(c)}>
                          <Receipt className="h-3 w-3 mr-1" /> Pay Now
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => viewTransactions(c)} title="View Transactions">
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => sendWhatsApp(c)} title="WhatsApp Reminder">
                          <MessageCircle className="h-3 w-3 text-green-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pay dialog */}
        <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Collect Payment — {payDialog?.customers?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm">Due: <span className="font-bold text-destructive">{format(Number(payDialog?.total_due || 0))}</span></p>
              <div><Label>Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Payment amount" /></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(payDialog?.total_due || 0))}>Full Amount</Button>
                <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(Number(payDialog?.total_due || 0) / 2)))}>Half</Button>
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

        {/* Transaction history dialog */}
        <Dialog open={!!txDialog} onOpenChange={v => { if (!v) setTxDialog(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Payment History — {txDialog?.customers?.name}</DialogTitle></DialogHeader>
            {txData.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No payment records yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txData.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{formatDate(new Date(t.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-green-600 font-medium">{format(Number(t.amount))}</TableCell>
                      <TableCell><Badge variant="secondary">{t.payment_method}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default DueCustomers;
