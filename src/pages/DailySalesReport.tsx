import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, TrendingUp, ShoppingCart, DollarSign, Users, Printer, ArrowLeft, ArrowRight } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { format, subDays, addDays, startOfDay, endOfDay, isToday } from "date-fns";

const DailySalesReport = () => {
  const { storeId, ready } = useStoreQuery();
  const { format: formatCurrency } = useCurrency();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dayStart = startOfDay(selectedDate).toISOString();
  const dayEnd = endOfDay(selectedDate).toISOString();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["daily-orders", storeId, dateStr],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name), order_items(quantity, price, products(name))")
        .eq("store_id", storeId!)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["daily-transactions", storeId, dateStr],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("store_id", storeId!)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const totalSales = orders.reduce((s, o: any) => s + Number(o.total_amount), 0);
    const totalCost = orders.reduce((s, o: any) => s + Number(o.cost_price), 0);
    const totalDiscount = orders.reduce((s, o: any) => s + Number(o.discount), 0);
    const profit = totalSales - totalCost - totalDiscount;
    const paidOrders = orders.filter((o: any) => o.payment_status === "paid").length;
    const unpaidOrders = orders.filter((o: any) => o.payment_status !== "paid").length;
    const cashSales = orders.filter((o: any) => o.payment_method === "cash").reduce((s, o: any) => s + Number(o.total_amount), 0);
    const income = transactions.filter((t: any) => t.type === "income").reduce((s, t: any) => s + Number(t.amount), 0);
    const expense = transactions.filter((t: any) => t.type === "expense").reduce((s, t: any) => s + Number(t.amount), 0);
    const uniqueCustomers = new Set(orders.map((o: any) => o.customer_id).filter(Boolean)).size;

    // Payment method breakdown
    const methodBreakdown: Record<string, number> = {};
    orders.forEach((o: any) => {
      const m = o.payment_method || "cash";
      methodBreakdown[m] = (methodBreakdown[m] || 0) + Number(o.total_amount);
    });

    return { totalSales, totalCost, profit, totalDiscount, paidOrders, unpaidOrders, cashSales, income, expense, uniqueCustomers, methodBreakdown, orderCount: orders.length };
  }, [orders, transactions]);

  const handlePrint = () => window.print();

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        {/* Header with date navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:flex-row">
          <div>
            <h1 className="text-2xl font-bold">Daily Sales Report</h1>
            <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, dd MMMM yyyy")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant={isToday(selectedDate) ? "default" : "outline"} size="sm" onClick={() => setSelectedDate(new Date())}>
              <Calendar className="h-4 w-4 mr-1" /> Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))} disabled={isToday(selectedDate)}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="print:hidden">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <PageGuide title="Daily Sales Report Guide" steps={[
              { title: "Navigate Dates", description: "Use arrows to view previous/next day's sales." },
              { title: "Payment Breakdown", description: "See how much was collected via Cash, Card, bKash, etc." },
              { title: "Print Report", description: "Click Print to generate a printable daily summary." },
            ]} />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">Total Sales</span></div>
              <p className="text-xl font-bold">{formatCurrency(stats.totalSales)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-green-600" /><span className="text-xs text-muted-foreground">Profit</span></div>
              <p className="text-xl font-bold text-green-600">{formatCurrency(stats.profit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">Orders</span></div>
              <p className="text-xl font-bold">{stats.orderCount}</p>
              <p className="text-[10px] text-muted-foreground">{stats.paidOrders} paid · {stats.unpaidOrders} unpaid</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-orange-600" /><span className="text-xs text-muted-foreground">Customers</span></div>
              <p className="text-xl font-bold">{stats.uniqueCustomers}</p>
            </CardContent>
          </Card>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(stats.methodBreakdown).map(([method, amount]) => (
                  <div key={method} className="flex justify-between items-center">
                    <Badge variant="outline" className="capitalize">{method}</Badge>
                    <span className="font-medium">{formatCurrency(amount as number)}</span>
                  </div>
                ))}
                {Object.keys(stats.methodBreakdown).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No sales today</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Income & Expense</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Sales Revenue</span><span className="font-medium text-green-600">{formatCurrency(stats.totalSales)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Other Income</span><span className="font-medium text-green-600">{formatCurrency(stats.income)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Cost of Goods</span><span className="font-medium text-destructive">-{formatCurrency(stats.totalCost)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Discounts</span><span className="font-medium text-destructive">-{formatCurrency(stats.totalDiscount)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Expenses</span><span className="font-medium text-destructive">-{formatCurrency(stats.expense)}</span></div>
                <div className="border-t pt-2 flex justify-between"><span className="font-medium">Net Total</span><span className="font-bold text-lg">{formatCurrency(stats.totalSales + stats.income - stats.totalCost - stats.totalDiscount - stats.expense)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Orders ({orders.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : orders.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No orders on this day</TableCell></TableRow>
                ) : orders.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm">{format(new Date(o.created_at), "hh:mm a")}</TableCell>
                    <TableCell className="font-medium">{o.customers?.name || "Walk-in"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.order_items?.length || 0} items</TableCell>
                    <TableCell className="font-medium">{formatCurrency(Number(o.total_amount))}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{o.payment_method}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={o.payment_status === "paid" ? "default" : "destructive"} className="text-xs">
                        {o.payment_status}
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

export default DailySalesReport;
