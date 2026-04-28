import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, ShieldCheck, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { verifyZinipayPayment, clearPendingValId } from "@/lib/zinipayCheckout";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentUrl: string;
  valId: string;
  amount: number;
  onSuccess?: () => void;
}

const POLL_INTERVAL_MS = 3500;
const MAX_POLL_DURATION_MS = 15 * 60 * 1000;

const ZinipayPaymentDialog = ({ open, onOpenChange, paymentUrl, valId, amount, onSuccess }: Props) => {
  const [status, setStatus] = useState<"loading" | "pending" | "completed" | "failed">("loading");
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const startedAtRef = useRef<number>(0);
  const pollTimerRef = useRef<number | null>(null);
  const loadCheckRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus("loading");
      setIframeLoaded(false);
      setIframeBlocked(false);
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      if (loadCheckRef.current) window.clearTimeout(loadCheckRef.current);
      return;
    }

    startedAtRef.current = Date.now();
    setStatus("pending");

    loadCheckRef.current = window.setTimeout(() => {
      if (!iframeLoaded) setIframeBlocked(true);
    }, 6000);

    const poll = async () => {
      if (!open) return;
      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed > MAX_POLL_DURATION_MS) return;
      try {
        const res = await verifyZinipayPayment(valId);
        if (res.status === "COMPLETED") {
          setStatus("completed");
          clearPendingValId();
          toast.success("Payment successful! Plan activated.");
          onSuccess?.();
          window.setTimeout(() => onOpenChange(false), 1500);
          return;
        }
        if (res.status === "FAILED") {
          setStatus("failed");
          return;
        }
      } catch {
        // ignore — keep polling
      }
      pollTimerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    pollTimerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      if (loadCheckRef.current) window.clearTimeout(loadCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, valId]);

  const handleOpenInNewTab = () => {
    window.open(paymentUrl, "_blank", "noopener,noreferrer");
  };

  const handleClose = () => {
    if (status === "completed") {
      onOpenChange(false);
      return;
    }
    const ok = window.confirm(
      "Close payment window? If you've already paid, we'll keep verifying in the background.",
    );
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="max-w-2xl w-[95vw] h-[90vh] sm:h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
        aria-describedby={undefined}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold leading-tight">Complete Payment</h2>
              <p className="text-[11px] text-muted-foreground leading-tight">
                ৳{amount.toFixed(0)} · Powered by ZiniPay
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleOpenInNewTab} className="text-xs gap-1 h-8">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New tab</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex-1 bg-background min-h-0">
          {status === "completed" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
              <CheckCircle2 className="h-16 w-16 text-success" />
              <h3 className="text-xl font-bold">Payment Successful!</h3>
              <p className="text-sm text-muted-foreground">Your plan has been activated.</p>
            </div>
          ) : status === "failed" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
              <AlertTriangle className="h-16 w-16 text-destructive" />
              <h3 className="text-xl font-bold">Payment Failed</h3>
              <p className="text-sm text-muted-foreground">Please try again or contact support.</p>
              <Button onClick={() => onOpenChange(false)} variant="outline" size="sm">Close</Button>
            </div>
          ) : iframeBlocked && !iframeLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
              <ShieldCheck className="h-12 w-12 text-primary" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Open ZiniPay in a new tab</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  ZiniPay's checkout doesn't allow embedding. Click below to pay in a new tab — we'll auto-detect when payment completes.
                </p>
              </div>
              <Button onClick={handleOpenInNewTab} size="lg" className="gap-2">
                <ExternalLink className="h-4 w-4" /> Open Payment Page
              </Button>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Waiting for payment confirmation…
              </p>
            </div>
          ) : (
            <>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background z-10 pointer-events-none">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Loading secure payment page…</p>
                </div>
              )}
              <iframe
                src={paymentUrl}
                title="ZiniPay Checkout"
                className="w-full h-full border-0"
                allow="payment *; clipboard-write"
                onLoad={() => { setIframeLoaded(true); setIframeBlocked(false); }}
              />
            </>
          )}
        </div>

        {status !== "completed" && status !== "failed" && (
          <div className="px-4 py-2 border-t bg-muted/40 shrink-0">
            <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Do not close this window until payment completes.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ZinipayPaymentDialog;