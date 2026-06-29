import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, FileText, CheckCircle } from "lucide-react";

type PolicyType = "terms" | "privacy";

interface TermsPrivacyDialogProps {
  open: boolean;
  defaultTab?: PolicyType;
  onOpenChange: (open: boolean) => void;
}

export function TermsPrivacyDialog({
  open,
  defaultTab = "terms",
  onOpenChange,
}: TermsPrivacyDialogProps) {
  const [activeTab, setActiveTab] = useState<PolicyType>(defaultTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 overflow-hidden bg-card border-border/60">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Legal Agreements
            </DialogTitle>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PolicyType)} className="w-full">
          <div className="px-5 pt-2">
            <TabsList className="grid w-full grid-cols-2 h-10 rounded-xl bg-muted/50 p-1">
              <TabsTrigger
                value="terms"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                Terms of Service
              </TabsTrigger>
              <TabsTrigger
                value="privacy"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5"
              >
                <Shield className="h-3.5 w-3.5" />
                Privacy Policy
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="terms" className="mt-0">
            <ScrollArea className="h-[55vh] px-5 pb-5">
              <div className="space-y-5 text-sm text-muted-foreground leading-relaxed pt-2">
                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">1. Acceptance of Terms</h3>
                  <p>
                    By accessing or using EvixPOS ("the Service"), you agree to be bound by these Terms of Service.
                    If you do not agree to all the terms and conditions, you may not access or use the Service.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">2. Description of Service</h3>
                  <p>
                    EvixPOS provides cloud-based point-of-sale, inventory management, customer relationship,
                    billing, and business analytics tools designed for retail and service businesses.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">3. Account Registration</h3>
                  <p>
                    You must provide accurate, complete, and current information during registration. You are
                    responsible for safeguarding your account credentials and for all activities under your account.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">4. Subscription & Payments</h3>
                  <p>
                    Some features require a paid subscription. Billing occurs according to the plan selected. All
                    fees are non-refundable except as required by law or as explicitly stated in our refund policy.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">5. Acceptable Use</h3>
                  <p>
                    You agree not to use the Service for unlawful activities, fraud, spam, or to transmit harmful
                    code. We may suspend or terminate accounts that violate these rules.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">6. Data & Ownership</h3>
                  <p>
                    You retain ownership of your business data. We only use it to provide and improve the Service,
                    in accordance with our Privacy Policy.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">7. Limitation of Liability</h3>
                  <p>
                    EvixPOS is provided "as is" without warranties of any kind. Our liability is limited to the
                    amount paid for the Service in the preceding 12 months, where permitted by law.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">8. Changes to Terms</h3>
                  <p>
                    We may update these terms from time to time. Continued use of the Service after changes
                    constitutes acceptance of the revised terms.
                  </p>
                </section>

                <div className="flex items-start gap-2 pt-2 text-xs">
                  <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    Last updated: {new Date().toLocaleDateString()}. For questions, contact support@evixpos.com.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="privacy" className="mt-0">
            <ScrollArea className="h-[55vh] px-5 pb-5">
              <div className="space-y-5 text-sm text-muted-foreground leading-relaxed pt-2">
                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">1. Information We Collect</h3>
                  <p>
                    We collect information you provide (name, email, business details), transaction data,
                    device/browser information, and usage analytics to operate and improve EvixPOS.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">2. How We Use Your Data</h3>
                  <p>
                    Your data is used to provide the Service, process payments, send notifications, prevent fraud,
                    and improve product features. We do not sell your personal data.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">3. Data Storage & Security</h3>
                  <p>
                    We use industry-standard encryption, secure cloud hosting, and regular backups. Access is
                    restricted to authorized personnel and governed by strict internal policies.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">4. Third-Party Services</h3>
                  <p>
                    We use trusted providers for hosting, payments, analytics, and email delivery. These providers
                    are contractually bound to protect your data and only process it on our behalf.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">5. Cookies & Tracking</h3>
                  <p>
                    We use cookies and similar technologies to remember preferences, authenticate users, and
                    analyze usage. You can manage cookie settings through your browser.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">6. Your Rights</h3>
                  <p>
                    Depending on your location, you may have rights to access, correct, delete, or export your data.
                    Contact us at support@evixpos.com to exercise these rights.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">7. Data Retention</h3>
                  <p>
                    We retain your data for as long as your account is active or as needed to provide the Service.
                    You may request deletion of your account and associated data at any time.
                  </p>
                </section>

                <section>
                  <h3 className="text-base font-semibold text-foreground mb-2">8. Updates to This Policy</h3>
                  <p>
                    We may update this Privacy Policy periodically. We will notify you of material changes via
                    email or through the Service.
                  </p>
                </section>

                <div className="flex items-start gap-2 pt-2 text-xs">
                  <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    Last updated: {new Date().toLocaleDateString()}. For questions, contact support@evixpos.com.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
