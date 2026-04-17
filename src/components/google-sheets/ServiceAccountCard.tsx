import { useState } from "react";
import { Copy, Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  email?: string;
}

export const ServiceAccountCard = ({ email }: Props) => {
  const [copied, setCopied] = useState(false);
  if (!email) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    toast.success("Service account email copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Mail className="h-4 w-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold mb-1">Share your sheet with this email</div>
          <div className="text-xs text-muted-foreground mb-2">
            Open your Google Sheet → click <strong>Share</strong> → add as <strong>Editor</strong>
          </div>
          <div className="flex items-center gap-2 bg-background rounded-lg border border-border p-2">
            <code className="text-xs font-mono flex-1 truncate text-foreground">{email}</code>
            <Button size="sm" variant="ghost" onClick={copy} className="h-7 px-2">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
