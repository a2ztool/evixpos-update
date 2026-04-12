import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { toast } from "sonner";
import { Check, Upload, QrCode, CreditCard, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface PaymentGateway {
  id: string;
  currency: string;
  gateway_name: string;
  gateway_type: string;
  qr_code_url: string;
  payment_details: Record<string, string>;
  is_active: boolean;
}

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planKey: string;
  planName: string;
  amount: number;
  currency: string;
  currencySymbol: string;
}

const PaymentModal = ({ open, onOpenChange, planKey, planName, amount, currency, currencySymbol }: PaymentModalProps) => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingPayment, setExistingPayment] = useState<{ status: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelectedGateway(null);
    setTransactionId("");
    setProofFile(null);
    setSubmitted(false);
    setExistingPayment(null);
    setLoading(true);

    const fetchData = async () => {
      // Fetch gateways for this currency
      const { data: gw } = await supabase
        .from("payment_gateways")
        .select("*")
        .eq("currency", currency)
        .eq("is_active", true)
        .order("sort_order");
      setGateways((gw || []) as unknown as PaymentGateway[]);

      // Check for existing pending payment
      if (user) {
        const { data: existing } = await supabase
          .from("plan_payments")
          .select("status")
          .eq("user_id", user.id)
          .eq("plan", planKey)
          .eq("status", "pending")
          .maybeSingle();
        if (existing) setExistingPayment(existing);
      }
      setLoading(false);
    };
    fetchData();
  }, [open, currency, user, planKey]);

  const handleSubmit = async () => {
    if (!user || !selectedGateway) return;
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
      });

      if (error) throw error;
      setSubmitted(true);
      toast.success("Payment submitted! We'll review and activate your plan shortly.");
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
                <p className="text-xs text-muted-foreground">Monthly subscription</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{currencySymbol}{amount.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{currency}</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                    onClick={() => setSelectedGateway(gw)}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      selectedGateway?.id === gw.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {gw.gateway_type === "qr" ? (
                        <QrCode className="h-4 w-4 text-primary" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-sm font-medium">{gw.gateway_name}</span>
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

                {/* Transaction ID */}
                <div className="space-y-2">
                  <Label htmlFor="txn-id" className="text-sm">Transaction ID (optional)</Label>
                  <Input
                    id="txn-id"
                    placeholder="Enter your transaction/reference ID"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                  />
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
                  disabled={submitting}
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
