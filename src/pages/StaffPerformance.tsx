import { useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, ShoppingCart, DollarSign, TrendingUp, Award } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { subDays, startOfDay } from "date-fns";

const StaffPerformance = () => {
  const { storeId, ready } = useStoreQuery();
  const { format: fmt } = useCurrency();

  const last30 = startOfDay(subDays(new Date(), 30)).toISOString();

  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-list", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name, role, email, auth_user_id, is_active")
        .eq("store_id", storeId!)
        .eq("is_active", true);
      return data || [];
    },
  });

  // Get store owner profile
  const { data: storeData } = useQuery({
    queryKey: ["store-owner", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("user_id").eq("id", storeId!).single();
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["staff-orders", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("user_id, total_amount, cost_price, payment_status, created_at")
        .eq("store_id", storeId!)
        .gte("created_at", last30);
      return data || [];
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["staff-shifts", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_register_shifts")
        .select("user_id, opening_balance, closing_balance, mismatch, status, opened_at, closed_at")
        .eq("store_id", storeId!)
        .gte("opened_at", last30);
      return data || [];
    },
  });

  const performanceData = useMemo(() => {
    // Build a map: auth_user_id → staff info
    const allUsers = [
      ...(storeData ? [{ id: "owner", name: "Owner", role: "owner", auth_user_id: storeData.user_id }] : []),
      ...staffMembers.map((s: any) => ({ id: s.id, name: s.name, role: s.role, auth_user_id: s.auth_user_id })),
    ];

    return allUsers.map(staff => {
      // Match orders by user_id (which is the store owner's user_id for owner, or mapped via staff)
      const staffOrders = orders.filter((o: any) => o.user_id === staff.auth_user_id);
      const totalSales = staffOrders.reduce((s, o: any) => s + Number(o.total_amount), 0);
      const totalProfit = staffOrders.reduce((s, o: any) => s + (Number(o.total_amount) - Number(o.cost_price)), 0);
      const orderCount = staffOrders.length;
      const paidOrders = staffOrders.filter((o: any) => o.payment_status === "paid").length;
      const avgOrder = orderCount > 0 ? totalSales / orderCount : 0;

      const staffShifts = shifts.filter((s: any) => s.user_id === staff.auth_user_id);
      const totalMismatch = staffShifts.reduce((s, sh: any) => s + Math.abs(Number(sh.mismatch || 0)), 0);
      const shiftCount = staffShifts.length;

      return {
        ...staff,
        totalSales, totalProfit, orderCount, paidOrders, avgOrder,
        totalMismatch, shiftCount,
        score: orderCount * 10 + totalSales * 0.01 - totalMismatch * 5,
      };
    }).sort((a, b) => b.score - a.score);
  }, [staffMembers, storeData, orders, shifts]);

  const topPerformer = performanceData[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Staff Performance</h1>
          <p className="text-sm text-muted-foreground">Last 30 days performance overview</p>
        </div>

        {/* Top Performer */}
        {topPerformer && topPerformer.orderCount > 0 && (
          <Card className="border-yellow-500/30 bg-gradient-to-r from-yellow-500/5 to-transparent">
            <CardContent className="pt-4 flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Award className="h-7 w-7 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">🏆 Top Performer</p>
                <p className="text-lg font-bold">{topPerformer.name}</p>
                <p className="text-sm text-muted-foreground">{topPerformer.orderCount} orders · {fmt(topPerformer.totalSales)} sales</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">Active Staff</span></div><p className="text-xl font-bold">{staffMembers.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">Total Orders</span></div><p className="text-xl font-bold">{orders.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-xs text-muted-foreground">Total Sales</span></div><p className="text-xl font-bold">{fmt(orders.reduce((s, o: any) => s + Number(o.total_amount), 0))}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-orange-600" /><span className="text-xs text-muted-foreground">Avg/Order</span></div><p className="text-xl font-bold">{fmt(orders.length > 0 ? orders.reduce((s, o: any) => s + Number(o.total_amount), 0) / orders.length : 0)}</p></CardContent></Card>
        </div>

        {/* Performance Table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Individual Performance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Avg Order</TableHead>
                  <TableHead>Shifts</TableHead>
                  <TableHead>Cash Mismatch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No staff data</TableCell></TableRow>
                ) : performanceData.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {i === 0 && s.orderCount > 0 ? "🥇" : i === 1 && s.orderCount > 0 ? "🥈" : i === 2 && s.orderCount > 0 ? "🥉" : i + 1}
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{s.role}</Badge></TableCell>
                    <TableCell>{s.orderCount}</TableCell>
                    <TableCell className="font-medium">{fmt(s.totalSales)}</TableCell>
                    <TableCell>{fmt(s.avgOrder)}</TableCell>
                    <TableCell>{s.shiftCount}</TableCell>
                    <TableCell>
                      {s.totalMismatch > 0 ? (
                        <Badge variant="destructive" className="text-xs">{fmt(s.totalMismatch)}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">✓ Clean</Badge>
                      )}
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

export default StaffPerformance;
