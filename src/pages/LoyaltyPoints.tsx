import { useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Gift, TrendingUp } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { format as formatDate } from "date-fns";

const LoyaltyPoints = () => {
  const { storeId, ready } = useStoreQuery();
  const queryClient = useQueryClient();

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

  // Real-time subscription
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

  const totalPoints = loyaltyRecords.reduce((s: number, r: any) => s + Number(r.total_points), 0);
  const totalRedeemed = loyaltyRecords.reduce((s: number, r: any) => s + Number(r.redeemed_points), 0);

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
            { title: "Redeem Rewards", description: "Apply earned points as discount on future purchases." },
          ]} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-3"><Star className="h-8 w-8 text-yellow-500" /><div><p className="text-sm text-muted-foreground">Total Points Issued</p><p className="text-2xl font-bold">{totalPoints}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><Gift className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Points Redeemed</p><p className="text-2xl font-bold">{totalRedeemed}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><TrendingUp className="h-8 w-8 text-green-600" /><div><p className="text-sm text-muted-foreground">Active Members</p><p className="text-2xl font-bold">{loyaltyRecords.length}</p></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Customer Points</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : loyaltyRecords.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No loyalty records yet</p>
              ) : loyaltyRecords.map((r: any) => (
                <div key={r.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.customers?.name}</p>
                      <p className="text-xs text-muted-foreground">{r.customers?.phone}</p>
                    </div>
                    <Badge variant="default">{r.total_points - r.redeemed_points} pts</Badge>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Total: {r.total_points}</span>
                    <span>Redeemed: {r.redeemed_points}</span>
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
                    <TableHead>Total Points</TableHead>
                    <TableHead>Redeemed</TableHead>
                    <TableHead>Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : loyaltyRecords.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No loyalty records yet</TableCell></TableRow>
                  ) : loyaltyRecords.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium">{r.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">{r.customers?.phone}</p>
                      </TableCell>
                      <TableCell className="font-medium">{r.total_points}</TableCell>
                      <TableCell>{r.redeemed_points}</TableCell>
                      <TableCell><Badge variant="default">{r.total_points - r.redeemed_points}</Badge></TableCell>
                    </TableRow>
                  ))}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LoyaltyPoints;
