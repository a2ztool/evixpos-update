import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Gift, TrendingUp, Search, ArrowDownCircle } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

const LoyaltyPoints = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format: formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [redeemDialog, setRedeemDialog] = useState<any>(null);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemReason, setRedeemReason] = useState("manual");

  const { data: loyaltyRecords = [], isLoading } = useQuery({
    queryKey: ["loyalty-points", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_points")
        .select("*, customers(name, phone)")
        .eq("store_id", storeId!)
        .order("total_points", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["loyalty-transactions", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_transactions")
        .select("*, customers(name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`loyalty-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_points", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["loyalty-points", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "loyalty_transactions", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["loyalty-transactions", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const redeemMutation = useMutation({
    mutationFn: async () => {
      if (!redeemDialog) return;
      const pts = Number(redeemPoints);
      const available = Number(redeemDialog.total_points) - Number(redeemDialog.redeemed_points);
      if (pts <= 0 || pts > available) {
        throw new Error(`Invalid points. Available: ${available}`);
      }

      // Update loyalty_points
      await supabase.from("loyalty_points").update({
        redeemed_points: Number(redeemDialog.redeemed_points) + pts,
        updated_at: new Date().toISOString(),
      }).eq("id", redeemDialog.id);

      // Record transaction
      await supabase.from("loyalty_transactions").insert({
        customer_id: redeemDialog.customer_id,
        store_id: storeId!,
        user_id: userId!,
        points: pts,
        type: "redeemed",
        notes: `Manual redemption: ${redeemReason}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-points"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setRedeemDialog(null);
      setRedeemPoints("");
      toast.success("Points redeemed successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalPoints = loyaltyRecords.reduce((s: number, r: any) => s + Number(r.total_points), 0);
  const totalRedeemed = loyaltyRecords.reduce((s: number, r: any) => s + Number(r.redeemed_points), 0);
  const totalAvailable = totalPoints - totalRedeemed;

  const filtered = loyaltyRecords.filter((r: any) =>
    r.customers?.name?.toLowerCase().includes(search.toLowerCase()) || r.customers?.phone?.includes(search)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Loyalty Points</h1>
            <p className="text-sm text-muted-foreground">Track customer loyalty and reward repeat purchases</p>
          </div>
          <PageGuide title="How Loyalty Points Work" steps={[
            { title: "Earn Points", description: "Customers earn 1 point per 100 currency on each paid POS order." },
            { title: "Track Balance", description: "View total points, redeemed points, and available balance per customer." },
            { title: "Redeem Rewards", description: "Apply earned points as discount on future purchases or redeem manually." },
          ]} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-3"><Star className="h-8 w-8 text-yellow-500" /><div><p className="text-sm text-muted-foreground">Total Issued</p><p className="text-2xl font-bold">{totalPoints}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><Gift className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Redeemed</p><p className="text-2xl font-bold">{totalRedeemed}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><TrendingUp className="h-8 w-8 text-green-600" /><div><p className="text-sm text-muted-foreground">Available</p><p className="text-2xl font-bold text-green-600">{totalAvailable}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><Star className="h-8 w-8 text-amber-500" /><div><p className="text-sm text-muted-foreground">Members</p><p className="text-2xl font-bold">{loyaltyRecords.length}</p></div></CardContent></Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="pl-9" />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Customer Points</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No loyalty records yet</p>
              ) : filtered.map((r: any) => {
                const available = Number(r.total_points) - Number(r.redeemed_points);
                return (
                  <div key={r.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{r.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">{r.customers?.phone}</p>
                      </div>
                      <Badge variant="default">{available} pts</Badge>
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>Total: {r.total_points}</span>
                      <span>Redeemed: {r.redeemed_points}</span>
                    </div>
                    {available > 0 && (
                      <Button size="sm" variant="outline" className="w-full mt-2 gap-1" onClick={() => { setRedeemDialog(r); setRedeemPoints(""); }}>
                        <ArrowDownCircle className="h-3 w-3" /> Redeem Points
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
                    <TableHead>Customer</TableHead>
                    <TableHead>Total Points</TableHead>
                    <TableHead>Redeemed</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No loyalty records yet</TableCell></TableRow>
                  ) : filtered.map((r: any) => {
                    const available = Number(r.total_points) - Number(r.redeemed_points);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-medium">{r.customers?.name}</p>
                          <p className="text-xs text-muted-foreground">{r.customers?.phone}</p>
                        </TableCell>
                        <TableCell className="font-medium">{r.total_points}</TableCell>
                        <TableCell>{r.redeemed_points}</TableCell>
                        <TableCell><Badge variant="default">{available}</Badge></TableCell>
                        <TableCell className="text-right">
                          {available > 0 && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setRedeemDialog(r); setRedeemPoints(""); }}>
                              <ArrowDownCircle className="h-3 w-3" /> Redeem
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {transactions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Recent Transactions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{formatDate(new Date(t.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>{t.customers?.name}</TableCell>
                      <TableCell className={t.type === "earned" ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                        {t.type === "earned" ? "+" : "-"}{t.points}
                      </TableCell>
                      <TableCell><Badge variant={t.type === "earned" ? "default" : "secondary"}>{t.type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Redeem Points Dialog */}
        <Dialog open={!!redeemDialog} onOpenChange={v => { if (!v) setRedeemDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Redeem Points — {redeemDialog?.customers?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Points</span><span className="font-bold">{redeemDialog?.total_points}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Already Redeemed</span><span>{redeemDialog?.redeemed_points}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Available</span><span className="font-bold text-green-600">{Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)}</span></div>
              </div>
              <div>
                <Label>Points to Redeem</Label>
                <Input type="number" value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)} placeholder="Enter points" max={Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRedeemPoints(String(Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)))}>All Points</Button>
                <Button variant="outline" size="sm" onClick={() => setRedeemPoints(String(Math.floor((Number(redeemDialog?.total_points || 0) - Number(redeemDialog?.redeemed_points || 0)) / 2)))}>Half</Button>
              </div>
              <div>
                <Label>Reason</Label>
                <Select value={redeemReason} onValueChange={setRedeemReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Redemption</SelectItem>
                    <SelectItem value="discount">Discount on Purchase</SelectItem>
                    <SelectItem value="gift">Free Gift/Product</SelectItem>
                    <SelectItem value="cashback">Cashback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 1 point = {formatCurrency(1)} discount value
              </p>
              <Button onClick={() => redeemMutation.mutate()} disabled={!redeemPoints || redeemMutation.isPending} className="w-full">
                {redeemMutation.isPending ? "Redeeming..." : `Redeem ${redeemPoints || 0} Points`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default LoyaltyPoints;
