import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Download, Printer, Share2, MessageSquare, Mail, Copy, FileText,
  Calendar, CreditCard, Hash, User, Store, Receipt, TrendingUp,
  Shield, Scale,
} from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { QRCodeSVG } from "qrcode.react";
import evixposLogo from "@/assets/evixpos-logo.png";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  products: { name: string } | null;
}

interface InvoiceOrder {
  id: string;
  total_amount: number;
  cost_price: number;
  discount: number;
  discount_type: string;
  payment_method: string;
  source: string;
  payment_currency: string;
  notes: string;
  status: string;
  payment_status: string;
  created_at: string;
  customers: { name: string } | null;
  customer_id: string | null;
}

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: InvoiceOrder | null;
  orderItems: OrderItem[];
}

const CURRENCY_SYMBOLS: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$" };

const paymentStatusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Paid" },
  unpaid: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Unpaid" },
  partial: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Partial" },
};

const InvoiceModal = ({ open, onOpenChange, order, orderItems }: InvoiceModalProps) => {
  const { activeStore } = useStore();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [businessSettings, setBusinessSettings] = useState<{
    business_name: string;
    business_phone: string;
    business_email: string;
    logo_url: string;
  } | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  useEffect(() => {
    if (!user || !activeStore || !open) return;
    supabase
      .from("business_settings")
      .select("business_name, business_phone, business_email, logo_url")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBusinessSettings(data);
      });
  }, [user, activeStore, open]);

  if (!order) return null;

  const curSymbol = CURRENCY_SYMBOLS[order.payment_currency] || order.payment_currency;
  const invoiceId = `INV-${order.id.slice(0, 8).toUpperCase()}`;
  const orderDate = new Date(order.created_at);
  const storeName = businessSettings?.business_name || activeStore?.name || "Store";
  const storePhone = businessSettings?.business_phone || activeStore?.phone || "";
  const storeEmail = businessSettings?.business_email || "";
  const logoUrl = businessSettings?.logo_url || "";

  const subtotal = orderItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const discountAmount = order.discount_type === "percentage"
    ? (subtotal * Number(order.discount)) / 100
    : Number(order.discount);
  const total = Number(order.total_amount);
  const itemCount = orderItems.length > 0 ? orderItems.reduce((s, i) => s + i.quantity, 0) : 1;
  const statusCfg = paymentStatusConfig[order.payment_status] || paymentStatusConfig.unpaid;

  // QR code data for payment verification
  const qrData = JSON.stringify({
    invoice: invoiceId,
    store: storeName,
    total: total.toFixed(2),
    currency: order.payment_currency,
    status: order.payment_status,
    date: orderDate.toISOString(),
  });

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }
    
    // Clone content and convert QR SVG to data for print
    const cloned = printContent.cloneNode(true) as HTMLElement;
    
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoiceId}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; padding: 0; margin: 0; background: #fff; }
      .inv-wrap { max-width: 780px; margin: 0 auto; padding: 40px 36px; }
      .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #0d9488; }
      .inv-brand img { height: 38px; object-fit: contain; }
      .inv-brand-name { font-size: 20px; font-weight: 800; color: #0d9488; letter-spacing: -0.3px; }
      .inv-title { font-size: 32px; font-weight: 900; color: #0d9488; letter-spacing: 3px; }
      .inv-id { font-size: 12px; color: #666; font-family: monospace; margin-top: 4px; background: #f0fdfa; padding: 3px 10px; border-radius: 4px; display: inline-block; }
      .inv-status { display: inline-flex; align-items: center; gap: 5px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 6px; }
      .inv-status-paid { background: #dcfce7; color: #166534; }
      .inv-status-unpaid { background: #fee2e2; color: #991b1b; }
      .inv-status-partial { background: #fef3c7; color: #92400e; }
      .inv-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 24px; }
      .inv-info-box { padding: 14px 16px; border-radius: 10px; background: #f8fafb; border: 1px solid #e8ecef; }
      .inv-info-label { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #9ca3af; letter-spacing: 1px; margin-bottom: 5px; }
      .inv-info-value { font-size: 13px; font-weight: 600; color: #1a1a2e; }
      .inv-table { width: 100%; border-collapse: collapse; }
      .inv-table thead th { background: #0d9488; color: white; padding: 11px 16px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
      .inv-table thead th:first-child { border-radius: 10px 0 0 0; }
      .inv-table thead th:last-child { border-radius: 0 10px 0 0; text-align: right; }
      .inv-table tbody td { padding: 11px 16px; font-size: 13px; border-bottom: 1px solid #f0f2f5; }
      .inv-table tbody td:last-child { text-align: right; font-weight: 700; }
      .inv-table tbody tr:nth-child(even) { background: #fafbfc; }
      .inv-totals { margin-left: auto; width: 280px; }
      .inv-total-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; }
      .inv-total-row.grand { font-size: 20px; font-weight: 900; color: #0d9488; border-top: 2px solid #0d9488; padding-top: 12px; margin-top: 8px; }
      .inv-qr-section { display: flex; align-items: center; gap: 16px; margin-top: 24px; padding: 16px; background: #f8fafb; border-radius: 10px; border: 1px solid #e8ecef; }
      .inv-qr-text { font-size: 11px; color: #666; }
      .inv-terms { margin-top: 20px; padding: 14px 16px; border-radius: 10px; background: #fefce8; border: 1px solid #fef08a; }
      .inv-terms-title { font-size: 10px; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
      .inv-terms-text { font-size: 11px; color: #92400e; line-height: 1.6; }
      .inv-footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e8ecef; text-align: center; }
      .inv-footer-thanks { font-size: 14px; font-weight: 700; color: #0d9488; }
      .inv-footer-powered { font-size: 9px; color: #bbb; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 8px; }
      @media print { body { padding: 0; } .inv-wrap { padding: 20px; } }
    </style></head><body>${cloned.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const handleDownloadPDF = () => {
    handlePrint();
    toast.success("Print dialog opened — save as PDF");
  };

  const handleShareWhatsApp = () => {
    const text = `📄 *Invoice: ${invoiceId}*\n\n🏪 ${storeName}\n👤 ${order.customers?.name || "Customer"}\n💰 Total: ${curSymbol}${total.toFixed(2)}\n📅 ${orderDate.toLocaleDateString()}\n\n💳 Payment: ${order.payment_status.toUpperCase()}\n📝 Method: ${order.payment_method}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    setShareMenuOpen(false);
  };

  const handleShareEmail = () => {
    const subject = `Invoice ${invoiceId} - ${storeName}`;
    const body = `Invoice: ${invoiceId}\nStore: ${storeName}\nCustomer: ${order.customers?.name || "Customer"}\nTotal: ${curSymbol}${total.toFixed(2)}\nDate: ${orderDate.toLocaleDateString()}\nPayment Status: ${order.payment_status}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    setShareMenuOpen(false);
  };

  const handleCopyLink = () => {
    const text = `Invoice ${invoiceId} | ${storeName} | ${curSymbol}${total.toFixed(2)} | ${order.payment_status}`;
    navigator.clipboard.writeText(text);
    toast.success("Invoice details copied!");
    setShareMenuOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border-border/50 shadow-2xl">
        {/* Premium Action Bar */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border px-3 sm:px-6 py-3 flex items-center justify-between gap-2 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm leading-tight truncate">{invoiceId}</h2>
              <p className="text-[10px] text-muted-foreground">
                {orderDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <Badge className={`text-[10px] px-2 py-0.5 rounded-full border-0 font-bold uppercase tracking-wider shrink-0 ${statusCfg.bg} ${statusCfg.text}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${statusCfg.dot}`} />
              {statusCfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="gap-1 h-8 text-xs rounded-lg hover:bg-primary/5 hover:border-primary/30 transition-all px-2 sm:px-3" onClick={handleDownloadPDF}>
              <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 h-8 text-xs rounded-lg hover:bg-primary/5 hover:border-primary/30 transition-all px-2 sm:px-3" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Print</span>
            </Button>
            <div className="relative">
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs rounded-lg hover:bg-primary/5 hover:border-primary/30 transition-all px-2 sm:px-3" onClick={() => setShareMenuOpen(!shareMenuOpen)}>
                <Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Share</span>
              </Button>
              {shareMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-card border border-border rounded-xl shadow-xl z-50 py-1.5 animate-scale-in">
                  <button onClick={handleShareWhatsApp} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-accent/50 transition-colors">
                    <MessageSquare className="h-4 w-4 text-green-600" /> WhatsApp
                  </button>
                  <button onClick={handleShareEmail} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-accent/50 transition-colors">
                    <Mail className="h-4 w-4 text-blue-600" /> Email
                  </button>
                  <button onClick={handleCopyLink} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-accent/50 transition-colors">
                    <Copy className="h-4 w-4 text-muted-foreground" /> Copy Details
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Preview */}
        <div ref={printRef} className="inv-wrap">
          <div className="p-4 sm:p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-7 pb-5" style={{ borderBottom: "2px solid hsl(var(--primary))" }}>
              <div>
                {logoUrl ? (
                  <img src={logoUrl} alt={storeName} className="h-10 mb-2 object-contain" />
                ) : (
                  <img src={evixposLogo} alt="EvixPOS" className="h-9 mb-2 object-contain" />
                )}
                <p className="text-lg font-extrabold text-primary tracking-tight">{storeName}</p>
                {storePhone && <p className="text-[11px] text-muted-foreground mt-0.5">{storePhone}</p>}
                {storeEmail && <p className="text-[11px] text-muted-foreground">{storeEmail}</p>}
              </div>
              <div className="text-right">
                <h2 className="text-2xl sm:text-3xl font-black text-primary tracking-[3px]">INVOICE</h2>
                <p className="text-xs text-muted-foreground mt-1.5 font-mono bg-primary/5 inline-block px-3 py-1 rounded-md">{invoiceId}</p>
                <div className="mt-2">
                  <Badge className={`text-[10px] px-3 py-1 rounded-full border-0 font-bold uppercase tracking-wider ${statusCfg.bg} ${statusCfg.text}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusCfg.dot}`} />
                    {statusCfg.label}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl bg-muted/40 p-3.5 border border-border/40">
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px] mb-1.5 flex items-center gap-1">
                  <User className="h-3 w-3" /> Bill To
                </p>
                <p className="font-bold text-sm text-foreground">{order.customers?.name || "Walk-in Customer"}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3.5 border border-border/40">
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px] mb-1.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Date
                </p>
                <p className="font-bold text-sm text-foreground">
                  {orderDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {orderDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3.5 border border-border/40">
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px] mb-1.5 flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> Payment
                </p>
                <p className="font-bold text-sm text-foreground capitalize">{order.payment_method}</p>
                <p className="text-[10px] text-muted-foreground capitalize mt-0.5">Source: {order.source}</p>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { icon: Hash, label: "Items", value: String(itemCount) },
                { icon: TrendingUp, label: "Subtotal", value: `${curSymbol}${(orderItems.length > 0 ? subtotal : total).toFixed(2)}` },
                { icon: Receipt, label: "Discount", value: Number(order.discount) > 0 ? `-${curSymbol}${discountAmount.toFixed(2)}` : "—" },
                { icon: Store, label: "Total", value: `${curSymbol}${total.toFixed(2)}`, highlight: true },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-xl p-3 text-center border ${stat.highlight
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30 border-border/30"
                  }`}
                >
                  <stat.icon className={`h-3.5 w-3.5 mx-auto mb-1 ${stat.highlight ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px]">{stat.label}</p>
                  <p className={`text-sm font-extrabold mt-0.5 ${stat.highlight ? "text-primary" : "text-foreground"}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Items Table - Desktop */}
            <div className="hidden sm:block rounded-xl overflow-hidden border border-border/40 mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[1px]">#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[1px]">Item</th>
                    <th className="text-center px-3 py-3 text-[10px] font-bold uppercase tracking-[1px]">Qty</th>
                    <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-[1px]">Unit Price</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[1px]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.length > 0 ? orderItems.map((item, idx) => (
                    <tr key={item.id} className={`${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{String(idx + 1).padStart(2, "0")}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{item.products?.name || "—"}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-md bg-muted/50 text-xs font-bold">{item.quantity}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{curSymbol}{Number(item.price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{curSymbol}{(Number(item.price) * item.quantity).toFixed(2)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-4 py-3 text-muted-foreground text-xs">01</td>
                      <td className="px-4 py-3 font-semibold text-foreground">Order</td>
                      <td className="px-3 py-3 text-center"><span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-md bg-muted/50 text-xs font-bold">1</span></td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{curSymbol}{total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">{curSymbol}{total.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Items - Mobile Cards */}
            <div className="sm:hidden space-y-2 mb-6">
              <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px] flex items-center gap-1 mb-2">
                <FileText className="h-3 w-3" /> Order Items
              </p>
              {(orderItems.length > 0 ? orderItems : [{ id: "fallback", quantity: 1, price: total, products: { name: "Order" } }]).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/30 border border-border/30 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground w-5">{String(idx + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{item.products?.name || "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{curSymbol}{Number(item.price).toFixed(2)} × {item.quantity}</p>
                    </div>
                  </div>
                  <p className="font-bold text-sm text-foreground shrink-0 ml-2">{curSymbol}{(Number(item.price) * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{curSymbol}{(orderItems.length > 0 ? subtotal : total).toFixed(2)}</span>
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Discount {order.discount_type === "percentage" ? `(${order.discount}%)` : ""}
                    </span>
                    <span className="text-red-500 font-medium">-{curSymbol}{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between items-center text-xl font-black text-primary pt-1">
                  <span>Total Due</span>
                  <span>{curSymbol}{total.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-right text-muted-foreground uppercase tracking-wider">
                  {order.payment_currency} • {order.payment_method}
                </p>
              </div>
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="mt-6 rounded-xl bg-muted/30 p-4 border border-border/40">
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px] mb-1.5 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Notes
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{order.notes}</p>
              </div>
            )}

            {/* QR Code Section */}
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 rounded-xl bg-muted/30 p-4 border border-border/40">
              <div className="shrink-0 bg-white p-2 rounded-lg shadow-sm">
                <QRCodeSVG value={qrData} size={80} level="M" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-[1px] flex items-center gap-1 justify-center sm:justify-start mb-1">
                  <Shield className="h-3 w-3" /> Payment Verification
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Scan this QR code to verify invoice authenticity and payment details. This code contains encrypted invoice information for your records.
                </p>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="mt-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 p-4 border border-amber-200/50 dark:border-amber-800/30">
              <p className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-[1px] flex items-center gap-1 mb-2">
                <Scale className="h-3 w-3" /> Terms & Conditions
              </p>
              <ul className="text-[11px] text-amber-800/80 dark:text-amber-300/70 leading-relaxed space-y-1 list-disc list-inside">
                <li>Payment is due upon receipt unless otherwise agreed.</li>
                <li>All sales are final. Refunds subject to store policy.</li>
                <li>This invoice is system-generated and valid without signature.</li>
                <li>For queries, contact the store directly using the details above.</li>
              </ul>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-5 border-t-2 border-primary/10 text-center">
              <p className="text-sm font-bold text-primary">Thank you for your business!</p>
              <p className="text-[11px] text-muted-foreground mt-1">{storeName}</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <img src={evixposLogo} alt="EvixPOS" className="h-5 object-contain opacity-50" />
                <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Powered by EvixPOS</span>
              </div>
              <p className="text-[9px] text-muted-foreground/40 mt-1">Generated on {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceModal;
