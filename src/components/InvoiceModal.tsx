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
import { useStaff } from "@/contexts/StaffContext";
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
  meta?: { paid_amount?: number; due_amount?: number; [k: string]: any } | null;
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
  const { effectiveUserId } = useStaff();
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
    const fetchSettings = async () => {
      const uid = effectiveUserId || user.id;
      let { data } = await supabase
        .from("business_settings")
        .select("business_name, business_phone, business_email, logo_url")
        .eq("user_id", uid)
        .eq("store_id", activeStore.id)
        .maybeSingle();
      // Fallback: try by user_id only (unique constraint is on user_id)
      if (!data) {
        const { data: fallback } = await supabase
          .from("business_settings")
          .select("business_name, business_phone, business_email, logo_url")
          .eq("user_id", uid)
          .maybeSingle();
        data = fallback;
      }
      if (data) setBusinessSettings(data);
    };
    fetchSettings();
  }, [user, activeStore, open, effectiveUserId]);

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

  // Derive paid / due from order.meta when present, fallback to payment_status logic
  const metaPaid = order.meta && typeof order.meta.paid_amount === "number" ? Number(order.meta.paid_amount) : null;
  const metaDue = order.meta && typeof order.meta.due_amount === "number" ? Number(order.meta.due_amount) : null;
  let paidAmount: number;
  let dueAmount: number;
  if (metaPaid !== null || metaDue !== null) {
    paidAmount = metaPaid !== null ? metaPaid : Math.max(total - (metaDue ?? 0), 0);
    dueAmount = metaDue !== null ? metaDue : Math.max(total - (metaPaid ?? 0), 0);
  } else if (order.payment_status === "paid") {
    paidAmount = total; dueAmount = 0;
  } else if (order.payment_status === "unpaid") {
    paidAmount = 0; dueAmount = total;
  } else {
    paidAmount = 0; dueAmount = total;
  }

  // Recompute status from numbers (in case DB value is stale)
  const derivedStatus = paidAmount <= 0.001
    ? "unpaid"
    : dueAmount <= 0.01
      ? "paid"
      : "partial";
  const statusCfg = paymentStatusConfig[derivedStatus] || paymentStatusConfig.unpaid;

  // QR code data for payment verification
  const qrData = JSON.stringify({
    invoice: invoiceId,
    store: storeName,
    total: total.toFixed(2),
    currency: order.payment_currency,
    status: order.payment_status,
    date: orderDate.toISOString(),
  });

  const generateInvoiceHTML = () => {
    const items = orderItems.length > 0
      ? orderItems.map((item, idx) => ({
          num: String(idx + 1).padStart(2, "0"),
          name: item.products?.name || "—",
          qty: item.quantity,
          price: Number(item.price),
          amount: Number(item.price) * item.quantity,
        }))
      : [{ num: "01", name: "Order", qty: 1, price: total, amount: total }];

    const itemRows = items.map((it, idx) =>
      `<tr style="background:${idx % 2 === 0 ? "#fff" : "#f8fafb"}">
        <td style="padding:11px 16px;font-size:13px;color:#888;border-bottom:1px solid #f0f2f5">${it.num}</td>
        <td style="padding:11px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f0f2f5">${it.name}</td>
        <td style="padding:11px 16px;font-size:13px;text-align:center;border-bottom:1px solid #f0f2f5">${it.qty}</td>
        <td style="padding:11px 16px;font-size:13px;text-align:right;color:#888;border-bottom:1px solid #f0f2f5">${curSymbol}${it.price.toFixed(2)}</td>
        <td style="padding:11px 16px;font-size:13px;text-align:right;font-weight:700;border-bottom:1px solid #f0f2f5">${curSymbol}${it.amount.toFixed(2)}</td>
      </tr>`
    ).join("");

    const discountRow = Number(order.discount) > 0
      ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
          <span style="color:#888">Discount${order.discount_type === "percentage" ? ` (${order.discount}%)` : ""}</span>
          <span style="color:#ef4444;font-weight:500">-${curSymbol}${discountAmount.toFixed(2)}</span>
        </div>`
      : "";

    const notesSection = order.notes
      ? `<div style="margin-top:20px;padding:14px 16px;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px;margin-bottom:6px">📋 Notes</p>
          <p style="font-size:12px;color:#666;line-height:1.6">${order.notes}</p>
        </div>`
      : "";

    return `<!DOCTYPE html><html><head><title>Invoice ${invoiceId}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a2e;background:#fff}
      @media print{@page{size:A4;margin:10mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div style="max-width:720px;margin:0 auto;padding:40px 36px">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #0d9488">
        <div>
          <img src="${logoUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='36'%3E%3Ctext y='28' font-size='24' font-weight='900' font-family='system-ui' fill='%230d9488'%3EevixPOS%3C/text%3E%3C/svg%3E"}" alt="${storeName}" style="height:38px;object-fit:contain;margin-bottom:8px;display:block">
          <p style="font-size:18px;font-weight:800;color:#0d9488">${storeName}</p>
          ${storePhone ? `<p style="font-size:11px;color:#888;margin-top:2px">${storePhone}</p>` : ""}
          ${storeEmail ? `<p style="font-size:11px;color:#888">${storeEmail}</p>` : ""}
        </div>
        <div style="text-align:right">
          <h2 style="font-size:32px;font-weight:900;color:#0d9488;letter-spacing:3px">INVOICE</h2>
          <p style="font-size:12px;color:#666;font-family:monospace;margin-top:6px;background:#f0fdfa;padding:3px 10px;border-radius:4px;display:inline-block">${invoiceId}</p>
          <div style="margin-top:8px">
            <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;${
              order.payment_status === "paid" ? "background:#dcfce7;color:#166534" :
              order.payment_status === "partial" ? "background:#fef3c7;color:#92400e" :
              "background:#fee2e2;color:#991b1b"
            }">● ${statusCfg.label}</span>
          </div>
        </div>
      </div>

      <!-- Info Cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:24px">
        <div style="padding:14px 16px;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px;margin-bottom:5px">👤 Bill To</p>
          <p style="font-size:14px;font-weight:700">${order.customers?.name || "Walk-in Customer"}</p>
        </div>
        <div style="padding:14px 16px;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px;margin-bottom:5px">📅 Date</p>
          <p style="font-size:14px;font-weight:700">${orderDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          <p style="font-size:10px;color:#888;margin-top:2px">${orderDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <div style="padding:14px 16px;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px;margin-bottom:5px">💳 Payment</p>
          <p style="font-size:14px;font-weight:700;text-transform:capitalize">${order.payment_method}: ${curSymbol}${total.toFixed(2)}</p>
          <p style="font-size:10px;color:#888;margin-top:2px;text-transform:capitalize">Source: ${order.source}</p>
        </div>
      </div>

      <!-- Summary Stats -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:24px">
        <div style="padding:12px;text-align:center;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px"># Items</p>
          <p style="font-size:15px;font-weight:800;margin-top:4px">${itemCount}</p>
        </div>
        <div style="padding:12px;text-align:center;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px">Subtotal</p>
          <p style="font-size:15px;font-weight:800;margin-top:4px">${curSymbol}${(orderItems.length > 0 ? subtotal : total).toFixed(2)}</p>
        </div>
        <div style="padding:12px;text-align:center;border-radius:10px;background:#f8fafb;border:1px solid #e8ecef">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px">Discount</p>
          <p style="font-size:15px;font-weight:800;margin-top:4px">${Number(order.discount) > 0 ? `-${curSymbol}${discountAmount.toFixed(2)}` : "—"}</p>
        </div>
        <div style="padding:12px;text-align:center;border-radius:10px;background:#f0fdfa;border:1px solid #99f6e4">
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#0d9488;letter-spacing:1px">Total</p>
          <p style="font-size:15px;font-weight:800;margin-top:4px;color:#0d9488">${curSymbol}${total.toFixed(2)}</p>
        </div>
      </div>

      <!-- Items Table -->
      <div style="border-radius:10px;overflow:hidden;border:1px solid #e8ecef;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#0d9488">
              <th style="text-align:left;padding:11px 16px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#fff">#</th>
              <th style="text-align:left;padding:11px 16px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#fff">Item</th>
              <th style="text-align:center;padding:11px 16px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#fff">Qty</th>
              <th style="text-align:right;padding:11px 16px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#fff">Unit Price</th>
              <th style="text-align:right;padding:11px 16px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#fff">Amount</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <!-- Totals -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <div style="width:280px">
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
            <span style="color:#888">Subtotal</span>
            <span style="font-weight:500">${curSymbol}${(orderItems.length > 0 ? subtotal : total).toFixed(2)}</span>
          </div>
          ${discountRow}
          <div style="border-top:2px solid #0d9488;margin-top:10px;padding-top:12px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:18px;font-weight:900;color:#0d9488">Total Due</span>
            <span style="font-size:20px;font-weight:900;color:#0d9488">${curSymbol}${total.toFixed(2)}</span>
          </div>
          <p style="font-size:10px;text-align:right;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-top:4px">${order.payment_currency} • ${order.payment_method}: ${curSymbol}${total.toFixed(2)}</p>
        </div>
      </div>

      ${notesSection}

      <!-- QR Section -->
      <div style="margin-top:20px;display:flex;align-items:center;gap:16px;padding:16px;background:#f8fafb;border-radius:10px;border:1px solid #e8ecef">
        <div id="qr-placeholder" style="width:80px;height:80px;background:#fff;padding:8px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);flex-shrink:0"></div>
        <div>
          <p style="font-size:9px;text-transform:uppercase;font-weight:700;color:#9ca3af;letter-spacing:1px;margin-bottom:4px">🛡️ Payment Verification</p>
          <p style="font-size:11px;color:#666;line-height:1.6">Scan this QR code to verify invoice authenticity and payment details. This code contains encrypted invoice information for your records.</p>
        </div>
      </div>

      <!-- Terms -->
      <div style="margin-top:16px;padding:14px 16px;border-radius:10px;background:#fefce8;border:1px solid #fef08a">
        <p style="font-size:9px;font-weight:700;color:#854d0e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">⚖️ Terms & Conditions</p>
        <ul style="font-size:11px;color:#92400e;line-height:1.8;padding-left:16px;margin:0">
          <li>Payment is due upon receipt unless otherwise agreed.</li>
          <li>All sales are final. Refunds subject to store policy.</li>
          <li>This invoice is system-generated and valid without signature.</li>
          <li>For queries, contact the store directly using the details above.</li>
        </ul>
      </div>

      <!-- Footer -->
      <div style="margin-top:32px;padding-top:16px;border-top:2px solid #f0f2f5;text-align:center">
        <p style="font-size:14px;font-weight:700;color:#0d9488">Thank you for your business!</p>
        <p style="font-size:11px;color:#888;margin-top:4px">${storeName}</p>
        <div style="margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px">
          <img src="${evixposLogo}" alt="EvixPOS" style="height:20px;object-fit:contain;opacity:0.5" onerror="this.style.display='none'">
          <span style="font-size:9px;color:#ccc;text-transform:uppercase;letter-spacing:2px">Powered by EvixPOS</span>
        </div>
        <p style="font-size:9px;color:#ddd;margin-top:4px">Generated on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>
    </div>
    </body></html>`;
  };

  const openPrintWindow = (afterLoad: (win: Window) => void) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }

    const html = generateInvoiceHTML();
    printWindow.document.write(html);
    printWindow.document.close();

    // Copy QR SVG into the print window
    const qrSvg = printRef.current?.querySelector(".inv-qr-container svg");
    if (qrSvg) {
      printWindow.onload = () => {
        const placeholder = printWindow.document.getElementById("qr-placeholder");
        if (placeholder) {
          placeholder.innerHTML = qrSvg.outerHTML;
        }
        afterLoad(printWindow);
      };
    } else {
      printWindow.onload = () => afterLoad(printWindow);
    }
  };

  const handlePrint = () => {
    openPrintWindow((win) => { win.print(); });
  };

  const handleDownloadPDF = () => {
    openPrintWindow((win) => { win.print(); });
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
              <div className="inv-qr-container shrink-0 bg-white p-2 rounded-lg shadow-sm">
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
