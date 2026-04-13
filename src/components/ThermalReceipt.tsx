import { forwardRef } from "react";

interface ReceiptItem {
  name: string;
  variation?: string;
  quantity: number;
  price: number;
}

interface ThermalReceiptProps {
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  invoiceId: string;
  date: string;
  customerName: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  notes?: string;
}

const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  ({ storeName, storePhone, storeAddress, invoiceId, date, customerName, items, subtotal, discount, total, paymentMethod, paymentStatus, currency, notes }, ref) => {
    const sym: Record<string, string> = { BDT: "৳", INR: "₹", USD: "$", EUR: "€", GBP: "£" };
    const c = sym[currency] || currency;

    return (
      <div ref={ref} style={{ fontFamily: "'Courier New', monospace", fontSize: "12px", width: "280px", padding: "8px", color: "#000", background: "#fff" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "16px", fontWeight: "bold" }}>{storeName}</div>
          {storeAddress && <div style={{ fontSize: "10px" }}>{storeAddress}</div>}
          {storePhone && <div style={{ fontSize: "10px" }}>Tel: {storePhone}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        {/* Invoice info */}
        <div style={{ fontSize: "11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Invoice:</span><span style={{ fontWeight: "bold" }}>{invoiceId}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Date:</span><span>{date}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Customer:</span><span>{customerName}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        {/* Items */}
        <div style={{ fontSize: "11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginBottom: "4px" }}>
            <span style={{ flex: 1 }}>Item</span>
            <span style={{ width: "30px", textAlign: "center" }}>Qty</span>
            <span style={{ width: "60px", textAlign: "right" }}>Amount</span>
          </div>
          {items.map((item, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                <span style={{ width: "30px", textAlign: "center" }}>{item.quantity}</span>
                <span style={{ width: "60px", textAlign: "right" }}>{c}{(item.price * item.quantity).toFixed(2)}</span>
              </div>
              {item.variation && (
                <div style={{ fontSize: "10px", color: "#555", paddingLeft: "8px" }}>↳ {item.variation}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        {/* Totals */}
        <div style={{ fontSize: "11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
            <span>Subtotal:</span><span>{c}{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span>Discount:</span><span>-{c}{discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px", fontWeight: "bold" }}>
            <span>TOTAL:</span><span>{c}{total.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        {/* Payment info */}
        <div style={{ fontSize: "11px", textAlign: "center" }}>
          <div>Payment: {paymentMethod.toUpperCase()} | {paymentStatus}</div>
          {notes && <div style={{ marginTop: "4px", fontSize: "10px" }}>Note: {notes}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: "10px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Thank you for your purchase!</div>
          <div style={{ color: "#888" }}>Powered by EvixPOS</div>
        </div>
      </div>
    );
  }
);

ThermalReceipt.displayName = "ThermalReceipt";

export default ThermalReceipt;

/** Utility: print thermal receipt from a ref */
export const printThermalReceipt = (ref: React.RefObject<HTMLDivElement>) => {
  if (!ref.current) return;
  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; font-size: 12px; }
      @media print { @page { size: 80mm auto; margin: 2mm; } }
    </style></head><body>
    ${ref.current.innerHTML}
    <script>window.onload=function(){window.print();window.close();}</script>
  </body></html>`);
  win.document.close();
};
