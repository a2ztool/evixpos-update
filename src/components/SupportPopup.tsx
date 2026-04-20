import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, X, MessageCircle, Mail, Send, Loader2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const SupportPopup = () => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();

  const handleQuickTicket = () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    // Navigate to support page with pre-fill data
    const params = new URLSearchParams();
    params.set("prefill_subject", subject.trim());
    if (description.trim()) params.set("prefill_desc", description.trim());
    setOpen(false);
    setSubject("");
    setDescription("");
    navigate(`/support?${params.toString()}`);
    toast.success("Redirecting to create ticket...");
  };

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-20 sm:bottom-6 right-4 z-[60]"
          >
            <Button
              onClick={() => setOpen(true)}
              className="h-12 w-12 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
              size="icon"
            >
              <Headphones className="h-5 w-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popup */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/20 z-[60] sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed bottom-20 sm:bottom-6 right-4 z-[61] w-[calc(100vw-2rem)] sm:w-[360px] min-h-fit max-h-none overflow-visible sm:max-h-[80vh] sm:overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Headphones className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">EvixPOS Support</h3>
                    <p className="text-[10px] text-muted-foreground">We're here to help!</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Quick Contact */}
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground mb-2">Need instant help? Contact us directly</p>
                <div className="flex gap-2">
                  <a
                    href="https://wa.me/918101949890"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button variant="outline" size="sm" className="w-full gap-1.5 h-9 text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </Button>
                  </a>
                  <a href="mailto:support@evixpos.com" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1.5 h-9 text-xs border-primary/30 text-primary hover:bg-primary/5">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </Button>
                  </a>
                </div>
              </div>

              <Separator />

              {/* Quick Ticket Form */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Quick Ticket</p>
                  <Badge variant="secondary" className="text-[10px]">Auto ID</Badge>
                </div>
                <Input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="What's the issue?"
                  className="h-9 text-sm"
                />
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description (optional)..."
                  rows={2}
                  className="text-sm min-h-[60px] resize-none"
                />
                <Button
                  onClick={handleQuickTicket}
                  className="w-full gap-1.5 h-9 text-xs"
                  disabled={!subject.trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                  Create Ticket
                </Button>
              </div>

              <Separator />

              {/* Go to full support page */}
              <button
                onClick={() => { setOpen(false); navigate("/support"); }}
                className="w-full flex items-center justify-between p-4 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <span>View all tickets & guides</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default SupportPopup;
