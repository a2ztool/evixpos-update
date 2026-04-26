export type InvoicePaymentStatus = "paid" | "partial" | "unpaid";

type InvoiceMeta = Record<string, unknown> | null | undefined;

interface InvoiceCalculationInput {
  subtotal: number;
  total: number;
  discount?: number | string | null;
  discountType?: string | null;
  paymentStatus?: string | null;
  meta?: InvoiceMeta;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clampMoney = (value: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max);

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const calculateInvoicePayment = ({
  subtotal,
  total,
  discount,
  discountType,
  paymentStatus,
  meta,
}: InvoiceCalculationInput) => {
  const safeSubtotal = roundMoney(clampMoney(subtotal));
  const safeTotal = roundMoney(clampMoney(total));
  const rawDiscount = toNumber(discount) ?? 0;
  const metaDiscount = toNumber(meta?.discount_amount);
  const derivedDiscount = safeSubtotal > 0 ? Math.max(safeSubtotal - safeTotal, 0) : 0;

  let discountAmount = 0;
  if (metaDiscount !== null) {
    discountAmount = metaDiscount;
  } else if (derivedDiscount > 0.01) {
    discountAmount = derivedDiscount;
  } else if (discountType === "percentage") {
    discountAmount = (safeSubtotal * rawDiscount) / 100;
  } else {
    discountAmount = rawDiscount;
  }
  discountAmount = roundMoney(clampMoney(discountAmount, 0, safeSubtotal));

  const metaPaid = toNumber(meta?.paid_amount);
  const metaDue = toNumber(meta?.due_amount);
  let paidAmount = 0;
  let dueAmount = safeTotal;

  if (metaPaid !== null || metaDue !== null) {
    paidAmount = metaPaid !== null ? clampMoney(metaPaid, 0, safeTotal) : clampMoney(safeTotal - (metaDue ?? 0), 0, safeTotal);
    dueAmount = metaDue !== null ? clampMoney(metaDue, 0, safeTotal) : clampMoney(safeTotal - paidAmount, 0, safeTotal);
    if (Math.abs(paidAmount + dueAmount - safeTotal) > 0.02) {
      dueAmount = clampMoney(safeTotal - paidAmount, 0, safeTotal);
    }
  } else if (paymentStatus === "paid") {
    paidAmount = safeTotal;
    dueAmount = 0;
  } else if (paymentStatus === "partial") {
    paidAmount = 0;
    dueAmount = safeTotal;
  }

  paidAmount = roundMoney(paidAmount);
  dueAmount = roundMoney(dueAmount);

  const status: InvoicePaymentStatus = dueAmount <= 0.01 ? "paid" : paidAmount <= 0.001 ? "unpaid" : "partial";
  const discountPercent = safeSubtotal > 0 && discountAmount > 0 ? roundMoney((discountAmount / safeSubtotal) * 100) : 0;
  const discountLabel = discountAmount > 0 && discountType === "percentage" && discountPercent > 0
    ? `Discount (${discountPercent}%)`
    : "Discount";

  return {
    subtotal: safeSubtotal,
    total: safeTotal,
    discountAmount,
    discountLabel,
    paidAmount,
    dueAmount,
    status,
  };
};