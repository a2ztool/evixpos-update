import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, Wallet, Plus, Minus, Printer, TrendingUp, TrendingDown, Eye } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const CashRegister = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { user } = useAuth();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [openAmount, setOpenAmount] = useState("");
  const [closeAmount, setCloseAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [movementType, setMovementType] = useState<"in" | "out">("in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [shiftDetailDialog, setShiftDetailDialog] = useState<any>(null);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["cash-shifts", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_register_shifts")
        .select("*")
        .eq("store_id", storeId!)
        .order("opened_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`cash-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_register_shifts", filter: `store_id=eq.${storeId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["cash-shifts", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, queryClient]);

  const activeShift = shifts.find((s: any) => s.status === "open");
  const closedShifts = shifts.filter((s: any) => s.status === "closed");

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cash_register_shifts").insert({
        store_id: storeId!, user_id: userId!,
        opening_balance: Number(openAmount) || 0,
        opened_by: user?.email || "",
        status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
      setOpenAmount("");
      toast.success("Shift opened!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) return;
      const closing = Number(closeAmount) || 0;
      const expected = Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out);
      const mismatch = closing - expected;
      const { error } = await supabase.from("cash_register_shifts").update({
        closing_balance: closing,
        expected_balance: expected,
        mismatch,
        notes: closeNotes,
        status: "closed",
        closed_at: new Date().toISOString(),
      }).eq("id", activeShift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
      setCloseDialogOpen(false);
      setCloseAmount("");
      setCloseNotes("");
      toast.success("Shift closed!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Manual cash in/out
  const cashMovementMutation = useMutation({
    mutationFn: async () => {
      if (!activeShift) return;
      const amount = Number(movementAmount) || 0;
      if (amount <= 0) throw new Error("Invalid amount");

      if (movementType === "in") {
        await supabase.from("cash_register_shifts").update({
          cash_in: Number(activeShift.cash_in) + amount,
          notes: [activeShift.notes, `+${amount} (${movementReason || "Manual cash in"})`].filter(Boolean).join(" | "),
        }).eq("id", activeShift.id);
      } else {
        await supabase.from("cash_register_shifts").update({
          cash_out: Number(activeShift.cash_out) + amount,
          notes: [activeShift.notes, `-${amount} (${movementReason || "Manual cash out"})`].filter(Boolean).join(" | "),
        }).eq("id", activeShift.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
      setCashMovementOpen(false);
      setMovementAmount("");
      setMovementReason("");
      toast.success(`Cash ${movementType === "in" ? "added" : "removed"} successfully`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const printShiftReport = (shift: any) => {
    const expected = Number(shift.opening_balance) + Number(shift.cash_in) - Number(shift.cash_out);
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Shift Report</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:15px;max-width:300px;margin:0 auto}h2{text-align:center;margin-bottom:10px}.row{display:flex;justify-content:space-between;padding:3px 0}.sep{border-top:1px dashed #333;margin:8px 0}.bold{font-weight:bold}.red{color:red}</style></head><body>
      <h2>Cash Register Report</h2>
      <div class="sep"></div>
      <div class="row"><span>Opened:</span><span>${formatDate(new Date(shift.opened_at), "dd MMM yyyy HH:mm")}</span></div>
      ${shift.closed_at ? `<div class="row"><span>Closed:</span><span>${formatDate(new Date(shift.closed_at), "dd MMM yyyy HH:mm")}</span></div>` : ""}
      <div class="row"><span>Opened By:</span><span>${shift.opened_by || "—"}</span></div>
      <div class="sep"></div>
      <div class="row bold"><span>Opening:</span><span>${Number(shift.opening_balance).toFixed(2)}</span></div>
      <div class="row"><span>Cash In:</span><span>+${Number(shift.cash_in).toFixed(2)}</span></div>
      <div class="row"><span>Cash Out:</span><span>-${Number(shift.cash_out).toFixed(2)}</span></div>
      <div class="sep"></div>
      <div class="row bold"><span>Expected:</span><span>${expected.toFixed(2)}</span></div>
      ${shift.closing_balance != null ? `<div class="row bold"><span>Actual:</span><span>${Number(shift.closing_balance).toFixed(2)}</span></div>` : ""}
      ${shift.mismatch != null && Number(shift.mismatch) !== 0 ? `<div class="row bold red"><span>Mismatch:</span><span>${Number(shift.mismatch).toFixed(2)}</span></div>` : ""}
      ${shift.notes ? `<div class="sep"></div><div><strong>Notes:</strong><br>${shift.notes}</div>` : ""}
      <script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  // Chart data: mismatch history
  const chartData = closedShifts.slice(0, 7).reverse().map((s: any) => ({
    date: formatDate(new Date(s.opened_at), "dd MMM"),
    mismatch: Number(s.mismatch) || 0,
    cashIn: Number(s.cash_in) || 0,
  }));

  // Stats
  const totalMismatch = closedShifts.reduce((s: number, sh: any) => s + Math.abs(Number(sh.mismatch) || 0), 0);
  const shiftsWithMismatch = closedShifts.filter((s: any) => Number(s.mismatch) !== 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Cash Register</h1>
            <p className="text-sm text-muted-foreground">Manage daily cash shifts and detect mismatches</p>
          </div>
          <PageGuide title="How Cash Register Works" steps={[
            { title: "Open Shift", description: "Enter opening cash balance to start a new shift." },
            { title: "Cash In/Out", description: "Record manual cash movements during the shift." },
            { title: "Close Shift", description: "Enter closing balance — system detects any mismatch." },
            { title: "Print Report", description: "Print shift summary for recordkeeping." },
          ]} />
        </div>

        {/* Active Shift or Open New */}
        {activeShift ? (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-5 w-5" /> Active Shift</CardTitle>
                <Badge variant="default" className="bg-green-600">Open</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div><p className="text-xs text-muted-foreground">Opening</p><p className="text-lg font-bold">{format(Number(activeShift.opening_balance))}</p></div>
                <div><p className="text-xs text-muted-foreground">Cash In</p><p className="text-lg font-bold text-green-600">{format(Number(activeShift.cash_in))}</p></div>
                <div><p className="text-xs text-muted-foreground">Cash Out</p><p className="text-lg font-bold text-destructive">{format(Number(activeShift.cash_out))}</p></div>
                <div><p className="text-xs text-muted-foreground">Expected</p><p className="text-lg font-bold">{format(Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out))}</p></div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Opened: {formatDate(new Date(activeShift.opened_at), "dd MMM yyyy, hh:mm a")} by {activeShift.opened_by}</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => { setMovementType("in"); setCashMovementOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Cash In
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setMovementType("out"); setCashMovementOpen(true); }}>
                  <Minus className="h-3.5 w-3.5 mr-1" /> Cash Out
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setCloseDialogOpen(true)}>Close Shift</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-end gap-4">
                <div className="flex-1 w-full">
                  <Label>Opening Balance</Label>
                  <Input type="number" value={openAmount} onChange={e => setOpenAmount(e.target.value)} placeholder="0" className="mt-1" />
                </div>
                <Button onClick={() => openShiftMutation.mutate()} disabled={openShiftMutation.isPending} className="h-10">
                  <Wallet className="h-4 w-4 mr-2" /> Open Shift
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-3"><Clock className="h-7 w-7 text-primary" /><div><p className="text-xs text-muted-foreground">Total Shifts</p><p className="text-xl font-bold">{closedShifts.length}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><AlertTriangle className="h-7 w-7 text-amber-500" /><div><p className="text-xs text-muted-foreground">With Mismatch</p><p className="text-xl font-bold text-amber-600">{shiftsWithMismatch}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><TrendingDown className="h-7 w-7 text-destructive" /><div><p className="text-xs text-muted-foreground">Total Mismatch</p><p className="text-xl font-bold text-destructive">{format(totalMismatch)}</p></div></CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3"><TrendingUp className="h-7 w-7 text-green-600" /><div><p className="text-xs text-muted-foreground">Match Rate</p><p className="text-xl font-bold text-green-600">{closedShifts.length > 0 ? Math.round(((closedShifts.length - shiftsWithMismatch) / closedShifts.length) * 100) : 100}%</p></div></CardContent></Card>
        </div>

        {/* Mismatch Chart */}
        {chartData.length > 0 && chartData.some(d => d.cashIn > 0) && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Shift Cash Flow (Recent 7)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="cashIn" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Cash In" />
                  <Bar dataKey="mismatch" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Mismatch" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Cash Movement Dialog */}
        <Dialog open={cashMovementOpen} onOpenChange={setCashMovementOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{movementType === "in" ? "Add Cash In" : "Record Cash Out"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Amount</Label><Input type="number" value={movementAmount} onChange={e => setMovementAmount(e.target.value)} placeholder="Amount" /></div>
              <div><Label>Reason</Label><Input value={movementReason} onChange={e => setMovementReason(e.target.value)} placeholder={movementType === "in" ? "e.g. Loan repayment received" : "e.g. Petty cash withdrawal"} /></div>
              <Button onClick={() => cashMovementMutation.mutate()} disabled={!movementAmount || cashMovementMutation.isPending} className="w-full">
                {cashMovementMutation.isPending ? "Recording..." : `Record Cash ${movementType === "in" ? "In" : "Out"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Close shift dialog */}
        <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Close Shift</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Opening</span><span>{format(Number(activeShift?.opening_balance || 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cash In</span><span className="text-green-600">+{format(Number(activeShift?.cash_in || 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cash Out</span><span className="text-destructive">-{format(Number(activeShift?.cash_out || 0))}</span></div>
                <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Expected</span><span>{format(Number(activeShift?.opening_balance || 0) + Number(activeShift?.cash_in || 0) - Number(activeShift?.cash_out || 0))}</span></div>
              </div>
              <div><Label>Actual Closing Balance</Label><Input type="number" value={closeAmount} onChange={e => setCloseAmount(e.target.value)} placeholder="Count your cash" /></div>
              {closeAmount && activeShift && (
                <div className={`p-3 rounded-lg ${Number(closeAmount) - (Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out)) !== 0 ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-600"}`}>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {Number(closeAmount) - (Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out)) !== 0 && <AlertTriangle className="h-4 w-4" />}
                    Mismatch: {format(Number(closeAmount) - (Number(activeShift.opening_balance) + Number(activeShift.cash_in) - Number(activeShift.cash_out)))}
                  </p>
                </div>
              )}
              <div><Label>Notes</Label><Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Any notes..." rows={2} /></div>
              <Button onClick={() => closeShiftMutation.mutate()} disabled={!closeAmount || closeShiftMutation.isPending} className="w-full" variant="destructive">
                {closeShiftMutation.isPending ? "Closing..." : "Confirm Close"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Shift History */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Shift History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {closedShifts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No closed shifts yet</p>
              ) : closedShifts.map((s: any) => (
                <div key={s.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{formatDate(new Date(s.opened_at), "dd MMM yyyy")}</p>
                      <p className="text-xs text-muted-foreground">{s.opened_by}</p>
                    </div>
                    {Number(s.mismatch) !== 0 ? (
                      <Badge variant="destructive" className="gap-0.5"><AlertTriangle className="h-3 w-3" />{format(Number(s.mismatch))}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-green-600">✓ Match</Badge>
                    )}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Open: {format(Number(s.opening_balance))}</span>
                    <span>Close: {format(Number(s.closing_balance))}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => printShiftReport(s)}>
                      <Printer className="h-3 w-3 mr-1" /> Print
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShiftDetailDialog(s)}>
                      <Eye className="h-3 w-3" />
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
                    <TableHead>Date</TableHead>
                    <TableHead>Opened By</TableHead>
                    <TableHead>Opening</TableHead>
                    <TableHead>Cash In</TableHead>
                    <TableHead>Cash Out</TableHead>
                    <TableHead>Closing</TableHead>
                    <TableHead>Mismatch</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : closedShifts.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No closed shifts yet</TableCell></TableRow>
                  ) : closedShifts.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{formatDate(new Date(s.opened_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-sm">{s.opened_by || "—"}</TableCell>
                      <TableCell>{format(Number(s.opening_balance))}</TableCell>
                      <TableCell className="text-green-600">{format(Number(s.cash_in))}</TableCell>
                      <TableCell className="text-destructive">{format(Number(s.cash_out))}</TableCell>
                      <TableCell>{format(Number(s.closing_balance))}</TableCell>
                      <TableCell>
                        {Number(s.mismatch) !== 0 ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit"><AlertTriangle className="h-3 w-3" />{format(Number(s.mismatch))}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-green-600">✓ Match</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => printShiftReport(s)} title="Print">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShiftDetailDialog(s)} title="Details">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Shift Detail Dialog */}
        <Dialog open={!!shiftDetailDialog} onOpenChange={v => { if (!v) setShiftDetailDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Shift Details</DialogTitle></DialogHeader>
            {shiftDetailDialog && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Opened</span><p className="font-medium">{formatDate(new Date(shiftDetailDialog.opened_at), "dd MMM yyyy HH:mm")}</p></div>
                  <div><span className="text-muted-foreground">Closed</span><p className="font-medium">{shiftDetailDialog.closed_at ? formatDate(new Date(shiftDetailDialog.closed_at), "dd MMM yyyy HH:mm") : "—"}</p></div>
                  <div><span className="text-muted-foreground">Opening</span><p className="font-bold">{format(Number(shiftDetailDialog.opening_balance))}</p></div>
                  <div><span className="text-muted-foreground">Closing</span><p className="font-bold">{format(Number(shiftDetailDialog.closing_balance))}</p></div>
                  <div><span className="text-muted-foreground">Cash In</span><p className="font-bold text-green-600">+{format(Number(shiftDetailDialog.cash_in))}</p></div>
                  <div><span className="text-muted-foreground">Cash Out</span><p className="font-bold text-destructive">-{format(Number(shiftDetailDialog.cash_out))}</p></div>
                  <div><span className="text-muted-foreground">Expected</span><p className="font-bold">{format(Number(shiftDetailDialog.expected_balance))}</p></div>
                  <div>
                    <span className="text-muted-foreground">Mismatch</span>
                    <p className={`font-bold ${Number(shiftDetailDialog.mismatch) !== 0 ? "text-destructive" : "text-green-600"}`}>
                      {format(Number(shiftDetailDialog.mismatch))}
                    </p>
                  </div>
                </div>
                {shiftDetailDialog.notes && (
                  <div className="border-t pt-2"><span className="text-muted-foreground text-xs">Notes</span><p className="text-sm mt-1">{shiftDetailDialog.notes}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default CashRegister;
