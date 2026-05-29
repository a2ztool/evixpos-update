import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { calculateInvoicePayment } from "@/lib/invoiceCalculations";

const SYM: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

interface InvoiceData {
  order: {
    id: string;
    total_amount: number;
    discount: number;
    discount_type: string;
    payment_method: string;
    payment_currency: string;
    payment_status: string;
    source: string;
    notes: string | null;
    created_at: string;
    meta: { paid_amount?: number; due_amount?: number; [k: string]: any } | null;
  };
  items: Array<{ id: string; quantity: number; price: number; product_name: string | null }>;
  store: { name: string; phone: string; email: string; logo_url: string };
  customer: { name: string; phone: string | null; email: string | null } | null;
}

const PublicInvoice = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Invoice";
    if (!id || !token) { setError("Missing invoice token"); setLoading(false); return; }
    (async () => {
      const { data: rpc, error: err } = await supabase.rpc("get_public_invoice", {
        _order_id: id,
        _token: token,
      });
      if (err || !rpc) {
        setError("Invoice not found or invalid token");
      } else {
        setData(rpc as unknown as InvoiceData);
      }
      setLoading(false);
    })();
  }, [id, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive mb-3" />
        <h1 className="text-lg font-bold text-foreground">Invoice unavailable</h1>
        <p className="text-sm text-muted-foreground mt-1">{error || "This link is invalid or has expired."}</p>
      </div>
    );
  }

  const { order, items, store, customer } = data;
  const sym = SYM[order.payment_currency] || order.payment_currency;
  const subtotal = items.length > 0
    ? items.reduce((s, i) => s + Number(i.price) * i.quantity, 0)
    : Number(order.total_amount);
  const total = Number(order.total_amount);
  const invoiceCalc = calculateInvoicePayment({ subtotal, total, discount: order.discount, discountType: order.discount_type, paymentStatus: order.payment_status, meta: order.meta });
  const discountAmount = invoiceCalc.discountAmount;
  const paid = invoiceCalc.paidAmount;
  const due = invoiceCalc.dueAmount;
  const status = invoiceCalc.status;
  const invoiceId = (order as any).order_number ?? order.id;
  const date = new Date(order.created_at);

  const statusBadge =
    status === "paid" ? { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2, label: "Paid" } :
    status === "partial" ? { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "Partial" } :
    { bg: "bg-red-100", text: "text-red-700", icon: AlertTriangle, label: "Unpaid" };
  const Icon = statusBadge.icon;

  return (
    <div className="min-h-screen bg-muted/20 py-6 px-3 sm:px-6">
      <div className="max-w-xl mx-auto bg-card rounded-2xl shadow-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-5 flex items-center gap-3">
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.name} className="h-10 w-10 rounded-lg object-cover bg-white/10" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-white/15 flex items-center justify-center font-extrabold">
              {store.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-base truncate">{store.name}</h1>
            {store.phone && <p className="text-[11px] opacity-80">{store.phone}</p>}
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${statusBadge.bg} ${statusBadge.text}`}>
            <Icon className="h-3 w-3" /> {statusBadge.label}
          </div>
        </div>

        {/* Meta */}
        <div className="p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Invoice</p>
              <p className="font-mono text-sm font-bold text-foreground">{invoiceId}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Date</p>
              <p className="text-sm font-bold text-foreground">
                {date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>

          {customer && (
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Bill to</p>
              <p className="font-semibold text-sm">{customer.name}</p>
              {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
            </div>
          )}

          {/* Items */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/50 px-3 py-2 grid grid-cols-12 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              <span className="col-span-7">Item</span>
              <span className="col-span-2 text-center">Qty</span>
              <span className="col-span-3 text-right">Amount</span>
            </div>
            {items.length > 0 ? items.map((it) => (
              <div key={it.id} className="px-3 py-2.5 grid grid-cols-12 text-sm border-t border-border first:border-t-0">
                <span className="col-span-7 font-medium truncate">{it.product_name || "—"}</span>
                <span className="col-span-2 text-center text-muted-foreground">{it.quantity}</span>
                <span className="col-span-3 text-right font-semibold">{sym}{(Number(it.price) * it.quantity).toFixed(2)}</span>
              </div>
            )) : (
              <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">Order</div>
            )}
          </div>

          {/* Totals */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{sym}{subtotal.toFixed(2)}</span></div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{invoiceCalc.discountLabel}</span>
                <span className="text-red-500">-{sym}{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-2 border-t border-border">
              <span>Total</span><span>{sym}{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Paid</span><span className="font-semibold">{sym}{paid.toFixed(2)}</span>
            </div>
            <div className={`flex justify-between ${due > 0.01 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              <span>Due</span><span className="font-semibold">{sym}{due.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${statusBadge.bg} ${statusBadge.text}`}>
              <Icon className="h-3 w-3" /> {statusBadge.label}
            </div>
          </div>

          {order.notes && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Notes</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="bg-muted/30 px-5 py-3 text-center border-t border-border">
          <p className="text-[10px] text-muted-foreground">Powered by EvixPOS · Secure invoice</p>
        </div>
      </div>
    </div>
  );
};

export default PublicInvoice;
