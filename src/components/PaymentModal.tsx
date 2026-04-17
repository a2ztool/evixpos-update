import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { toast } from "sonner";
import { Check, Upload, QrCode, CreditCard, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Timer } from "lucide-react";

interface RequiredField {
  key: string;
  label: string;
  type: "text" | "number" | "tel" | "email" | "textarea";
  required: boolean;
  placeholder?: string;
}

interface PaymentGateway {
  id: string;
  currency: string;
  gateway_name: string;
  gateway_type: string;
  qr_code_url: string;
  payment_details: Record<string, string>;
  is_active: boolean;
  icon_url?: string | null;
  required_fields?: RequiredField[];
}

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planKey: string;
  planName: string;
  amount: number;
  currency: string;
  currencySymbol: string;
  billingType?: "monthly" | "yearly";
}

// Expiry countdown hook
const useExpiryTimer = (expiresAt: string | null) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft("Expired");
        clearInterval(interval);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return { timeLeft, isExpired };
};

const PaymentModal = ({ open, onOpenChange, planKey, planName, amount, currency, currencySymbol, billingType = "monthly" }: PaymentModalProps) => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingPayment, setExistingPayment] = useState<{ status: string; expires_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const { timeLeft, isExpired } = useExpiryTimer(existingPayment?.expires_at || null);

  useEffect(() => {
    if (!open) return;
    setSelectedGateway(null);
    setTransactionId("");
    setProofFile(null);
    setSubmitted(false);
    setExistingPayment(null);
    setLoading(true);
    setDuplicateWarning(false);
    setFieldValues({});

    const fetchData = async () => {
      const { data: gw } = await supabase
        .from("payment_gateways")
        .select("*")
        .eq("currency", currency)
        .eq("is_active", true)
        .order("sort_order");
      // Show all active gateways for the currency. Admin controls visibility via is_active.
      setGateways(((gw || []) as unknown as PaymentGateway[]));

      if (user) {
        const { data: existing } = await supabase
          .from("plan_payments")
          .select("status, expires_at")
          .eq("user_id", user.id)
          .eq("plan", planKey)
          .eq("status", "pending")
          .maybeSingle();
        if (existing) setExistingPayment(existing);
      }
      setLoading(false);
    };
    fetchData();

    // Realtime sync — admin gateway changes appear instantly
    const channel = supabase
      .channel(`payment_gateways_${currency}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_gateways", filter: `currency=eq.${currency}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, currency, user, planKey]);

  // Duplicate transaction ID check
  const checkDuplicate = useCallback(async (txnId: string) => {
    if (!txnId || txnId.length < 3) {
      setDuplicateWarning(false);
      return;
    }
    const { data } = await supabase
      .from("plan_payments")
      .select("id")
      .eq("transaction_id", txnId)
      .in("status", ["pending", "approved"])
      .maybeSingle();
    setDuplicateWarning(!!data);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => checkDuplicate(transactionId), 500);
    return () => clearTimeout(timeout);
  }, [transactionId, checkDuplicate]);

  const handleSubmit = async () => {
    if (!user || !selectedGateway) return;
    if (duplicateWarning) {
      toast.error("এই Transaction ID আগে ব্যবহার করা হয়েছে!");
      return;
    }

    // Validate dynamic required fields
    const dynFields = selectedGateway.required_fields || [];
    for (const f of dynFields) {
      if (f.required && !(fieldValues[f.key] || "").trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }

    setSubmitting(true);

    try {
      let proofUrl = "";
      if (proofFile) {
        const ext = proofFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-assets")
          .upload(path, proofFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("payment-assets").getPublicUrl(path);
        proofUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("plan_payments").insert({
        user_id: user.id,
        store_id: activeStore?.id || null,
        plan: planKey,
        amount,
        currency,
        gateway_id: selectedGateway.id,
        transaction_id: transactionId,
        proof_url: proofUrl,
        status: "pending",
        payment_data: fieldValues,
      } as any);

      if (error) {
        if (error.message?.includes("idx_plan_payments_unique_txn")) {
          toast.error("এই Transaction ID ইতিমধ্যে ব্যবহৃত হয়েছে!");
        } else {
          throw error;
        }
        return;
      }
      setSubmitted(true);
      toast.success("Payment submitted! Admin-কে notify করা হয়েছে। শীঘ্রই আপনার plan activate হবে।");
      try {
        const { notifyAdminsPlanPayment } = await import("@/lib/notificationTriggers");
        await notifyAdminsPlanPayment(planKey, `${currency} ${amount}`, user.email || undefined);
      } catch {}
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Already submitted or existing pending
  if (submitted || existingPayment) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold">Payment Under Review</h3>
            <p className="text-sm text-muted-foreground">
              Your payment for the <strong>{planName}</strong> plan is pending admin verification.
              You'll be notified once approved.
            </p>

            {/* Expiry Timer */}
            {existingPayment?.expires_at && !isExpired && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-amber-500" />
                <span className="text-amber-600 font-medium">Expires in: {timeLeft}</span>
              </div>
            )}
            {isExpired && (
              <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>Payment expired. Please submit again.</span>
              </div>
            )}

            <Badge variant="outline" className="text-amber-600 border-amber-300">
              <Clock className="h-3 w-3 mr-1" /> Pending Verification
            </Badge>
            <Button variant="outline" className="w-full mt-4" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Upgrade to {planName}
          </DialogTitle>
        </DialogHeader>

        {/* Order Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{planName} Plan</p>
                <p className="text-xs text-muted-foreground">{billingType === "yearly" ? "Yearly" : "Monthly"} subscription</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{currencySymbol}{amount.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{currency}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expiry Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <Timer className="h-3.5 w-3.5" />
          <span>Payment submit করার পর ১ ঘন্টার মধ্যে Admin verify করবে। সময় পার হলে আবার submit করতে হবে।</span>
        </div>

        {gateways.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No payment methods available for {currency}.</p>
            <p className="text-xs mt-1">Please contact support or try a different currency.</p>
          </div>
        ) : (
          <>
            {/* Gateway Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Payment Method</Label>
              <div className="grid grid-cols-2 gap-2">
                {gateways.map((gw) => (
                  <button
                    key={gw.id}
                    onClick={() => { setSelectedGateway(gw); setFieldValues({}); }}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      selectedGateway?.id === gw.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {gw.icon_url ? (
                        <img
                          src={gw.icon_url}
                          alt={gw.gateway_name}
                          className="h-6 w-6 rounded object-contain bg-white p-0.5"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : gw.gateway_type === "qr" ? (
                        <QrCode className="h-4 w-4 text-primary" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-sm font-medium truncate">{gw.gateway_name}</span>
                    </div>
                    {selectedGateway?.id === gw.id && (
                      <Check className="h-3 w-3 text-primary mt-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Gateway Details */}
            {selectedGateway && (
              <div className="space-y-4">
                {/* QR Code */}
                {selectedGateway.gateway_type === "qr" && selectedGateway.qr_code_url && (
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium">Scan QR Code to Pay</p>
                    <div className="mx-auto w-48 h-48 rounded-xl border-2 border-dashed border-border overflow-hidden bg-white">
                      <img
                        src={selectedGateway.qr_code_url}
                        alt="Payment QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pay exactly <strong>{currencySymbol}{amount.toFixed(2)}</strong> to complete
                    </p>
                  </div>
                )}

                {/* Payment Details / Instructions */}
                {selectedGateway.payment_details && Object.keys(selectedGateway.payment_details).length > 0 && (
                  <Card className="bg-muted/30">
                    <CardContent className="py-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Payment Instructions</p>
                      {Object.entries(selectedGateway.payment_details).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                          <span className="font-medium">{val}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Dynamic Required Fields (admin-defined per gateway) */}
                {selectedGateway.required_fields && selectedGateway.required_fields.length > 0 && (
                  <div className="space-y-3">
                    {selectedGateway.required_fields.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <Label htmlFor={`field-${f.key}`} className="text-sm">
                          {f.label}
                          {f.required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        {f.type === "textarea" ? (
                          <Textarea
                            id={`field-${f.key}`}
                            placeholder={f.placeholder || ""}
                            value={fieldValues[f.key] || ""}
                            onChange={(e) => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                            rows={3}
                          />
                        ) : (
                          <Input
                            id={`field-${f.key}`}
                            type={f.type}
                            placeholder={f.placeholder || ""}
                            value={fieldValues[f.key] || ""}
                            onChange={(e) => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Transaction ID with duplicate warning */}
                <div className="space-y-2">
                  <Label htmlFor="txn-id" className="text-sm">Transaction ID (optional)</Label>
                  <Input
                    id="txn-id"
                    placeholder="Enter your transaction/reference ID"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className={duplicateWarning ? "border-destructive" : ""}
                  />
                  {duplicateWarning && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>এই Transaction ID আগে ব্যবহার করা হয়েছে! ভিন্ন ID দিন।</span>
                    </div>
                  )}
                </div>

                {/* Proof Upload */}
                <div className="space-y-2">
                  <Label className="text-sm">Payment Screenshot (optional)</Label>
                  <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
                    {proofFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        {proofFile.name}
                        <button
                          className="text-xs text-destructive ml-2"
                          onClick={() => setProofFile(null)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Click to upload screenshot</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Submit */}
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={submitting || duplicateWarning}
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                  ) : (
                    "Submit Payment"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
