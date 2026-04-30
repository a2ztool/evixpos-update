import { useOfflinePOS } from "@/hooks/useOfflinePOS";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSynced?: () => void;
  className?: string;
}

export const POSOfflineBadge = ({ onSynced, className }: Props) => {
  const { isOnline, pendingCount, syncing, sync } = useOfflinePOS({ onSynced });

  if (isOnline && pendingCount === 0) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Wifi className="h-3.5 w-3.5 text-emerald-500" />
        <span className="hidden sm:inline">Online</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {!isOnline ? (
        <Badge variant="destructive" className="gap-1 text-[10px] sm:text-xs">
          <WifiOff className="h-3 w-3" /> Offline
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs">
          <Wifi className="h-3 w-3 text-emerald-500" /> Online
        </Badge>
      )}
      {pendingCount > 0 && (
        <>
          <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
            <CloudUpload className="h-3 w-3" /> {pendingCount} pending
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={!isOnline || syncing}
            onClick={() => sync(false)}
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", syncing && "animate-spin")} />
            {syncing ? "Syncing" : "Sync"}
          </Button>
        </>
      )}
    </div>
  );
};
