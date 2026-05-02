import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  verifyZinipayPayment,
  readPendingValId,
  clearPendingValId,
  type VerifyResult,
} from "@/lib/zinipayCheckout";
import { toast } from "sonner";

type State = "verifying" | "success" | "pending" | "failed" | "error";

const ZinipaySuccess = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("verifying");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const valId = params.get("val_id") || readPendingValId();
    if (!valId) {
      setState("error");
      setErrorMsg("No payment reference found.");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6; // ~30s total with 5s interval

    const tick = async () => {
      attempts += 1;
      try {
        const r = await verifyZinipayPayment(valId);
        if (cancelled) return;
        setResult(r);
        const status = String(r.status || "").toUpperCase();
        if (status === "COMPLETED") {
          setState("success");
          clearPendingValId();
          toast.success("🎉 Your plan has been upgraded!", {
            description: "Redirecting to My Plan…",
          });
          // Short delay to let realtime propagate, then redirect
          setTimeout(() => navigate("/my-plan", { replace: true }), 1200);
        } else if (status === "FAILED") {
          setState("failed");
          clearPendingValId();
        } else {
          // PENDING — retry
          if (attempts < maxAttempts) {
            setTimeout(tick, 5000);
          } else {
            setState("pending");
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        if (attempts < maxAttempts) {
          setTimeout(tick, 5000);
        } else {
          setState("error");
          setErrorMsg(e?.message || "Could not verify payment.");
        }
      }
    };

    tick();
    return () => { cancelled = true; };
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-4">
          {state === "verifying" && (
            <>
              <Loader2 className="h-14 w-14 mx-auto animate-spin text-primary" />
              <h1 className="text-2xl font-semibold">Verifying payment…</h1>
              <p className="text-sm text-muted-foreground">
                Please wait while we confirm your transaction with ZiniPay.
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <CheckCircle2 className="h-14 w-14 mx-auto text-success" />
              <h1 className="text-2xl font-semibold">Payment successful!</h1>
              <p className="text-sm text-muted-foreground">
                Your plan is now active. Redirecting to My Plan…
              </p>
              {result?.transaction_id && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-left space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transaction ID</span>
                    <span className="font-mono">{result.transaction_id}</span>
                  </div>
                  {result.payment_method && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method</span>
                      <span className="capitalize">{result.payment_method}</span>
                    </div>
                  )}
                  {result.amount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span>৳{result.amount}</span>
                    </div>
                  )}
                </div>
              )}
              <Button asChild className="w-full mt-2">
                <Link to="/my-plan">Go to My Plan</Link>
              </Button>
            </>
          )}

          {state === "pending" && (
            <>
              <Clock className="h-14 w-14 mx-auto text-yellow-500" />
              <h1 className="text-2xl font-semibold">Payment pending</h1>
              <p className="text-sm text-muted-foreground">
                Your payment is being processed. We'll activate your plan automatically
                once confirmed. You can safely close this page.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/my-plan">Back to My Plan</Link>
              </Button>
            </>
          )}

          {state === "failed" && (
            <>
              <AlertCircle className="h-14 w-14 mx-auto text-destructive" />
              <h1 className="text-2xl font-semibold">Payment failed</h1>
              <p className="text-sm text-muted-foreground">
                Your payment could not be completed. Please try again.
              </p>
              <Button asChild className="w-full">
                <Link to="/my-plan">Try Again</Link>
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <AlertCircle className="h-14 w-14 mx-auto text-destructive" />
              <h1 className="text-2xl font-semibold">Verification error</h1>
              <p className="text-sm text-muted-foreground">
                {errorMsg || "We couldn't verify your payment automatically."}
              </p>
              <p className="text-xs text-muted-foreground">
                If money was deducted, your plan will be activated within a few minutes
                via webhook. Please refresh My Plan shortly.
              </p>
              <Button asChild className="w-full">
                <Link to="/my-plan">Back to My Plan</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ZinipaySuccess;