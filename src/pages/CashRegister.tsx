import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, Wallet } from "lucide-react";
import PageGuide from "@/components/PageGuide";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

const CashRegister = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { user } = useAuth();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [openAmount, setOpenAmount] = useState("");
  const [closeAmount, setCloseAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

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

  const activeShift = shifts.find((s: any) => s.status === "open");

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
            { title: "Track Sales", description: "Cash in/out updates automatically from POS sales." },
            { title: "Close Shift", description: "Enter closing balance — system detects any mismatch." },
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
              <p className="text-xs text-muted-foreground mb-3">Opened: {formatDate(new Date(activeShift.opened_at), "dd MMM yyyy, hh:mm a")}</p>
              <Button variant="destructive" onClick={() => setCloseDialogOpen(true)}>Close Shift</Button>
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

        {/* Close shift dialog */}
        <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Close Shift</DialogTitle></DialogHeader>
            <div className="space-y-4">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Opening</TableHead>
                  <TableHead>Closing</TableHead>
                  <TableHead>Mismatch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : shifts.filter((s: any) => s.status === "closed").length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No closed shifts yet</TableCell></TableRow>
                ) : shifts.filter((s: any) => s.status === "closed").map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{formatDate(new Date(s.opened_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>{format(Number(s.opening_balance))}</TableCell>
                    <TableCell>{format(Number(s.closing_balance))}</TableCell>
                    <TableCell>
                      {Number(s.mismatch) !== 0 ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit"><AlertTriangle className="h-3 w-3" />{format(Number(s.mismatch))}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-green-600">✓ Match</Badge>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="secondary">Closed</Badge></TableCell>
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

export default CashRegister;
