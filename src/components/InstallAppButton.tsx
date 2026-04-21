import { Smartphone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Install App button with smart fallback.
 *
 * - If browser fired beforeinstallprompt → native install dialog
 * - Else (already-installable but event missed, iOS Safari, Firefox, etc.)
 *   → show modal with browser-specific manual instructions
 * - If already installed → show ✓ Installed (disabled)
 */
const InstallAppButton = ({ className = "" }: { className?: string }) => {
  const { canInstall, isInstalled, isStandalone, promptInstall } = usePWAInstall();
  const [showHelp, setShowHelp] = useState(false);

  const installed = isInstalled || isStandalone;

  const handleClick = async () => {
    if (installed) return;
    if (canInstall) {
      const ok = await promptInstall();
      if (ok) {
        toast.success("App installed!", { description: "EvixPOS is now on your device." });
      }
      return;
    }
    // Fallback — show manual instructions
    setShowHelp(true);
  };

  // Detect browser/platform for tailored instructions
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 px-3 text-xs font-medium gap-1.5 border-primary/20 text-primary hover:bg-primary/5 ${className}`}
            onClick={handleClick}
            disabled={installed}
          >
            {installed ? <Check className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
            {installed ? "✓ Installed" : "Install App"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{installed ? "App is installed" : "Install as app"}</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Install EvixPOS
            </DialogTitle>
            <DialogDescription>
              Follow the steps below for your browser to add EvixPOS to your device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {isIOS && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="font-semibold">📱 iPhone / iPad (Safari)</p>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Tap the <strong>Share</strong> button (square with up arrow) at the bottom.</li>
                  <li>Scroll and tap <strong>"Add to Home Screen"</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top-right.</li>
                </ol>
              </div>
            )}

            {isAndroid && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="font-semibold">📱 Android (Chrome)</p>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Tap the <strong>⋮</strong> menu (top-right).</li>
                  <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                  <li>Confirm <strong>Install</strong>.</li>
                </ol>
              </div>
            )}

            {!isIOS && !isAndroid && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="font-semibold">💻 Chrome / Edge / Brave (Desktop)</p>
                  <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                    <li>Look for the <strong>install icon</strong> (⊕ or monitor with arrow) in the address bar on the right.</li>
                    <li>Click it, then click <strong>Install</strong>.</li>
                    <li>Or open the <strong>⋮</strong> menu → <strong>"Install EvixPOS..."</strong>.</li>
                  </ol>
                </div>

                {isFirefox && (
                  <div className="rounded-lg border bg-amber-500/10 border-amber-500/30 p-3 text-xs">
                    <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">⚠️ Firefox Note</p>
                    <p className="text-muted-foreground">
                      Desktop Firefox doesn't support PWA install natively. Please use Chrome, Edge, or Brave for the best install experience.
                    </p>
                  </div>
                )}

                {isSafari && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="font-semibold">🍎 Safari (Mac)</p>
                    <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                      <li>Click <strong>File</strong> menu in the menu bar.</li>
                      <li>Click <strong>"Add to Dock..."</strong>.</li>
                    </ol>
                  </div>
                )}
              </>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              💡 <strong className="text-foreground">Tip:</strong> The install option appears only after the page fully loads.
              If you don't see it, refresh the page once and try again.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallAppButton;
