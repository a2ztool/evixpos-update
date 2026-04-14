import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { toast } from "sonner";

const OfflineBanner = () => {
  const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);

  // Show reconnected toast
  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowReconnected(true);
      toast.success("Back online!", {
        description: "Your internet connection has been restored.",
        icon: <Wifi className="h-4 w-4" />,
      });
      clearWasOffline();
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, clearWasOffline]);

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] animate-in slide-in-from-top duration-300">
      <div className="bg-red-600 text-white px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-1.5 bg-red-500/50 rounded-full">
              <WifiOff className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium text-sm">You are offline</p>
              <p className="text-xs text-red-200">
                Please check your internet connection. Changes will sync when you're back online.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-xs font-medium transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineBanner;
