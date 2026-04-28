import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, Receipt } from "lucide-react";

interface Payment {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  transaction_id: string | null;
  created_at: string;
}

const SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

const statusConfig: Record<string, { icon: any; class: string; label: string }> = {
  pending: { icon: Clock, class: "bg-amber-500/10 text-amber-500 border-amber-500/20", label: "Pending" },
  approved: { icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", label: "Approved" },
  rejected: { icon: XCircle, class: "bg-red-500/10 text-red-500 border-red-500/20", label: "Rejected" },
};

const PaymentHistory = () => {
  const { session } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from("plan_payments")
      .select("id, plan, amount, currency, status, transaction_id, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setPayments((data as Payment[]) || []);
        setLoading(false);
      });
  }, [session?.user]);

  if (loading) return null;
  if (payments.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-base">Payment History</h3>
        </div>
        <div className="space-y-3">
          {payments.map((p) => {
            const cfg = statusConfig[p.status] || statusConfig.pending;
            const Icon = cfg.icon;
            return (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${cfg.class}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">{p.plan} Plan</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                      {p.transaction_id ? ` · ${p.transaction_id}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    {SYMBOLS[p.currency] || "$"}{p.amount}
                  </span>
                  <Badge variant="outline" className={`text-xs ${cfg.class}`}>
                    {cfg.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentHistory;
