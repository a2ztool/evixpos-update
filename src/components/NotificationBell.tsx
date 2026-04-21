import { Bell, CheckCheck, Volume2, VolumeX, MessageSquare, BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useNotifications } from "@/hooks/useNotifications";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import { useWebPush } from "@/hooks/useWebPush";
import { TYPE_EMOJI, TYPE_LABEL } from "@/lib/notificationTriggers";
import { getNotificationPrefs, setNotificationPrefs, playNotificationSound } from "@/lib/notificationSound";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const NotificationBell = () => {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const { unreadCount: msgUnread } = useMessageUnread();
  const { status: pushStatus, subscribe: enablePush, unsubscribe: disablePush } = useWebPush();
  const navigate = useNavigate();
  const [soundEnabled, setSoundEnabled] = useState(() => getNotificationPrefs().soundEnabled !== false);
  const [volume, setVolume] = useState<number[]>(() => getNotificationPrefs().volume ?? [70]);

  // Sync with changes from Settings page (or other tabs)
  useEffect(() => {
    const sync = () => {
      const p = getNotificationPrefs();
      setSoundEnabled(p.soundEnabled !== false);
      setVolume(p.volume ?? [70]);
    };
    window.addEventListener("notification-prefs-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("notification-prefs-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setNotificationPrefs({ soundEnabled: next });
    if (next) playNotificationSound("info"); // preview
  };

  const handleVolume = (v: number[]) => {
    setVolume(v);
    setNotificationPrefs({ volume: v });
  };

  const totalBadge = unreadCount + msgUnread;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <AnimatePresence>
            {totalBadge > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1"
              >
                <Badge className="h-5 w-5 flex items-center justify-center p-0 text-xs animate-pulse">
                  {totalBadge > 99 ? "99+" : totalBadge}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm flex items-center gap-1.5">
            <Bell className="h-4 w-4 text-primary" />
            Notifications
            {totalBadge > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalBadge}</Badge>
            )}
          </h4>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSound} title={soundEnabled ? "Mute sounds" : "Enable sounds"}>
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={markAllRead}>
                <CheckCheck className="h-3 w-3 mr-1" /> Read all
              </Button>
            )}
          </div>
        </div>

        {/* Compact volume slider */}
        {soundEnabled && (
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
            <VolumeX className="h-3 w-3 text-muted-foreground shrink-0" />
            <Slider
              value={volume}
              onValueChange={handleVolume}
              max={100}
              step={5}
              className="flex-1"
              aria-label="Notification volume"
            />
            <Volume2 className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground w-7 text-right tabular-nums">{volume[0]}%</span>
          </div>
        )}

        {/* Web Push enable/status row */}
        {pushStatus !== "unsupported" && pushStatus !== "preview-blocked" && (
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            {pushStatus === "subscribed" ? (
              <>
                <BellRing className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs flex-1">Background push enabled</span>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={disablePush}>
                  Disable
                </Button>
              </>
            ) : pushStatus === "denied" ? (
              <>
                <BellOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs flex-1 text-muted-foreground">Push blocked in browser settings</span>
              </>
            ) : (
              <>
                <BellOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs flex-1">Get alerts when app is closed</span>
                <Button size="sm" className="h-6 text-[11px] px-2" onClick={enablePush}>
                  Enable
                </Button>
              </>
            )}
          </div>
        )}

        {/* Unread messages shortcut */}
        {msgUnread > 0 && (
          <div
            className="p-3 border-b bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
            onClick={() => navigate("/staff-inbox")}
          >
            <div className="flex items-center gap-2.5">
              <MessageSquare className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{msgUnread} unread message{msgUnread > 1 ? "s" : ""}</p>
                <p className="text-[11px] text-muted-foreground">Tap to view messages</p>
              </div>
              <Badge className="bg-primary text-primary-foreground text-[10px]">{msgUnread}</Badge>
            </div>
          </div>
        )}

        {/* Notification List */}
        <ScrollArea className="max-h-[350px]">
          {notifications.length === 0 ? (
            <div className="text-center py-10">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-muted-foreground text-sm">No notifications yet</p>
            </div>
          ) : (
            notifications.slice(0, 10).map((n) => {
              const emoji = TYPE_EMOJI[n.type] || "🔔";
              const label = TYPE_LABEL[n.type] || n.type;
              return (
                <div
                  key={n.id}
                  className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/[0.04]" : ""}`}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5 shrink-0">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                        {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className={`text-sm leading-snug ${!n.is_read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {n.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary hover:text-primary"
              onClick={() => navigate("/notification-center")}
            >
              View All Notifications →
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
