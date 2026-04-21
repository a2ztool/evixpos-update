import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TYPE_EMOJI, TYPE_LABEL, SOUND_CATEGORY } from "@/lib/notificationTriggers";
import {
  loadPrefsFromDB,
  savePrefsToDB,
  setNotificationPrefs,
  getNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notificationSound";
import { useWebPush } from "@/hooks/useWebPush";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, BellOff, BellRing, Volume2, VolumeX, Settings2, History,
  CheckCheck, Trash2, Search, Filter, AlertCircle, CheckCircle,
  AlertTriangle, Info, Star, StarOff, Zap, ShoppingCart, Users,
  CreditCard, Package, RefreshCw, Clock, Smartphone, MessageSquare, Moon, Loader2, X,
} from "lucide-react";
import { format, formatDistanceToNow, subDays, isAfter } from "date-fns";
import { useNotifications } from "@/hooks/useNotifications";

// ═══════════════════════════════════════════
// Notification event definitions
// ═══════════════════════════════════════════
const NOTIFICATION_EVENTS = [
  { key: "new_order", label: "New Order", icon: <ShoppingCart className="h-4 w-4" />, description: "When a new order is placed via POS or Order Form" },
  { key: "order_completed", label: "Order Completed", icon: <CheckCircle className="h-4 w-4" />, description: "When an order is marked as completed" },
  { key: "new_customer", label: "New Customer", icon: <Users className="h-4 w-4" />, description: "When a new customer is added to your store" },
  { key: "payment_received", label: "Payment Received", icon: <CreditCard className="h-4 w-4" />, description: "When a payment is received or marked as paid" },
  { key: "low_stock", label: "Low Stock Alert", icon: <Package className="h-4 w-4" />, description: "When a product stock falls below threshold" },
  { key: "subscription_expiring", label: "Subscription Expiring", icon: <Clock className="h-4 w-4" />, description: "When a customer subscription is about to expire" },
  { key: "woocommerce_order", label: "WooCommerce Order", icon: <Zap className="h-4 w-4" />, description: "When a new WooCommerce order syncs" },
  { key: "new_message", label: "New Message", icon: <MessageSquare className="h-4 w-4" />, description: "When you receive a chat message" },
  { key: "campaign_sent", label: "Campaign Sent", icon: <Bell className="h-4 w-4" />, description: "When a marketing campaign email is sent" },
];

const SOUND_OPTIONS = [
  { value: "default", label: "Default Chime" },
  { value: "bell", label: "Bell Ring" },
  { value: "pop", label: "Pop" },
  { value: "ding", label: "Ding" },
  { value: "none", label: "No Sound" },
];

// Play preview sound
const playPreviewSound = (type: string, volume: number) => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freqMap: Record<string, number> = { default: 800, bell: 1200, pop: 600, ding: 1000, none: 0 };
    if (type === "none") return;
    osc.frequency.value = freqMap[type] || 800;
    osc.type = type === "bell" ? "triangle" : type === "pop" ? "square" : "sine";
    gain.gain.value = volume / 100 * 0.4;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

const getCategoryColor = (type: string) => {
  const cat = SOUND_CATEGORY[type] || "info";
  const map: Record<string, { icon: React.ReactNode; badgeClass: string }> = {
    order: { icon: <ShoppingCart className="h-4 w-4 text-blue-500" />, badgeClass: "bg-blue-500/10 text-blue-700 border-blue-200" },
    payment: { icon: <CreditCard className="h-4 w-4 text-emerald-500" />, badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    alert: { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, badgeClass: "bg-amber-500/10 text-amber-700 border-amber-200" },
    success: { icon: <CheckCircle className="h-4 w-4 text-emerald-500" />, badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    error: { icon: <AlertCircle className="h-4 w-4 text-destructive" />, badgeClass: "bg-destructive/10 text-destructive border-destructive/20" },
    info: { icon: <Info className="h-4 w-4 text-blue-500" />, badgeClass: "bg-blue-500/10 text-blue-700 border-blue-200" },
  };
  return { icon: map[cat]?.icon || map.info.icon, label: TYPE_LABEL[type] || type, badgeClass: map[cat]?.badgeClass || map.info.badgeClass };
};

const typeConfig: Record<string, { icon: React.ReactNode; label: string; badgeClass: string }> = {
  success: { icon: <CheckCircle className="h-4 w-4 text-emerald-500" />, label: "Success", badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  error: { icon: <AlertCircle className="h-4 w-4 text-destructive" />, label: "Error", badgeClass: "bg-destructive/10 text-destructive border-destructive/20" },
  warning: { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, label: "Warning", badgeClass: "bg-amber-500/10 text-amber-700 border-amber-200" },
  info: { icon: <Info className="h-4 w-4 text-blue-500" />, label: "Info", badgeClass: "bg-blue-500/10 text-blue-700 border-blue-200" },
};

// ═══════════════════════════════════════════
// Tab 1: Notification Preferences
// ═══════════════════════════════════════════
const NotificationPreferencesTab = () => {
  const { user } = useAuth();
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundType, setSoundType] = useState("default");
  const [volume, setVolume] = useState([70]);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [eventPrefs, setEventPrefs] = useState<Record<string, { enabled: boolean; sound: boolean; priority: boolean }>>(
    Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, { enabled: true, sound: true, priority: false }]))
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Web Push state
  const { status: pushStatus, subscribe: enablePush, unsubscribe: disablePush, isBlocked: pushBlocked } = useWebPush();
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const applyPrefs = useCallback((p: NotificationPrefs) => {
    if (p.masterEnabled !== undefined) setMasterEnabled(p.masterEnabled);
    if (p.soundEnabled !== undefined) setSoundEnabled(p.soundEnabled);
    if (p.soundType) setSoundType(p.soundType);
    if (p.volume) setVolume(p.volume);
    if (p.desktopNotifications !== undefined) setDesktopNotifications(p.desktopNotifications);
    if (p.eventPrefs) {
      // Merge defaults so newly added events don't disappear
      const merged: Record<string, { enabled: boolean; sound: boolean; priority: boolean }> = {};
      NOTIFICATION_EVENTS.forEach((e) => {
        const ex: any = (p.eventPrefs as any)[e.key];
        merged[e.key] = {
          enabled: ex?.enabled !== undefined ? ex.enabled : true,
          sound: ex?.sound !== undefined ? ex.sound : true,
          priority: ex?.priority ?? false,
        };
      });
      setEventPrefs(merged);
    }
    if (p.quietHours) {
      setQuietEnabled(!!p.quietHours.enabled);
      if (p.quietHours.start) setQuietStart(p.quietHours.start);
      if (p.quietHours.end) setQuietEnd(p.quietHours.end);
    }
  }, []);

  // Load: try DB first, fall back to localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getNotificationPrefs();
      applyPrefs(local);
      const fromDB = await loadPrefsFromDB();
      if (!cancelled && fromDB) applyPrefs(fromDB);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [applyPrefs]);

  // Load device list
  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setDevicesLoading(true);
    const { data } = await (supabase as any)
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, created_at, last_used_at, device_label")
      .eq("user_id", user.id)
      .order("last_used_at", { ascending: false });
    setDevices(data || []);
    setDevicesLoading(false);
  }, [user]);

  useEffect(() => { fetchDevices(); }, [fetchDevices, pushStatus]);

  const removeDevice = async (id: string) => {
    await (supabase as any).from("push_subscriptions").delete().eq("id", id);
    toast.success("Device removed");
    fetchDevices();
  };

  const savePrefs = async () => {
    setSaving(true);
    const prefs: NotificationPrefs = {
      masterEnabled, soundEnabled, soundType, volume, desktopNotifications,
      eventPrefs, quietHours: { enabled: quietEnabled, start: quietStart, end: quietEnd },
    };
    setNotificationPrefs(prefs);
    const ok = await savePrefsToDB(prefs);
    setSaving(false);
    toast.success(ok ? "Preferences saved & synced" : "Saved locally (sync failed)");
  };

  const toggleEvent = (key: string, field: "enabled" | "sound" | "priority") => {
    setEventPrefs((prev) => ({ ...prev, [key]: { ...prev[key], [field]: !prev[key][field] } }));
  };

  const enableAll = () => {
    setEventPrefs(Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, { enabled: true, sound: true, priority: false }])));
  };

  const disableAll = () => {
    setEventPrefs(Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, { enabled: false, sound: false, priority: false }])));
  };

  const requestDesktopPermission = async () => {
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      setDesktopNotifications(perm === "granted");
      if (perm === "granted") toast.success("Desktop notifications enabled!");
      else toast.error("Permission denied");
    }
  };

  const friendlyDevice = (ua?: string) => {
    if (!ua) return "Unknown device";
    if (/iPhone|iPad/.test(ua)) return "iOS device";
    if (/Android/.test(ua)) return "Android device";
    if (/Macintosh/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "Windows PC";
    if (/Linux/.test(ua)) return "Linux";
    return "Browser";
  };

  return (
    <div className="space-y-6">
      {/* Master Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            General Settings
          </CardTitle>
          <CardDescription>Control how you receive notifications across the app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              {masterEnabled ? <BellRing className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium">Master Notifications</p>
                <p className="text-sm text-muted-foreground">Enable or disable all notifications globally</p>
              </div>
            </div>
            <Switch checked={masterEnabled} onCheckedChange={setMasterEnabled} />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5" />
              <div>
                <p className="font-medium">Desktop Notifications</p>
                <p className="text-sm text-muted-foreground">Show browser push notifications</p>
              </div>
            </div>
            <Button variant={desktopNotifications ? "default" : "outline"} size="sm" onClick={requestDesktopPermission}>
              {desktopNotifications ? "Enabled" : "Enable"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sound Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-primary" />
            Sound Settings
          </CardTitle>
          <CardDescription>Configure notification alert sounds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium">Sound Alerts</p>
                <p className="text-sm text-muted-foreground">Play sound when notifications arrive</p>
              </div>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          </div>

          {soundEnabled && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4 pl-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Alert Sound</Label>
                  <Select value={soundType} onValueChange={setSoundType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOUND_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Volume ({volume[0]}%)</Label>
                  <div className="flex items-center gap-3">
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                    <Slider value={volume} onValueChange={setVolume} max={100} step={5} className="flex-1" />
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => playPreviewSound(soundType, volume[0])}>
                🔊 Preview Sound
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Event-Based Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Event Notifications
              </CardTitle>
              <CardDescription>Choose which events trigger notifications</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={enableAll}>Enable All</Button>
              <Button variant="outline" size="sm" onClick={disableAll}>Disable All</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {NOTIFICATION_EVENTS.map((event) => {
              const pref = eventPrefs[event.key];
              return (
                <motion.div
                  key={event.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${pref?.enabled ? "bg-background" : "bg-muted/30 opacity-60"}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-muted-foreground">{event.icon}</div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{event.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <button
                      className={`p-1 rounded transition-colors ${pref?.priority ? "text-amber-500" : "text-muted-foreground/30 hover:text-muted-foreground"}`}
                      onClick={() => toggleEvent(event.key, "priority")}
                      title="Mark as priority"
                    >
                      {pref?.priority ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                    </button>
                    <button
                      className={`p-1 rounded transition-colors ${pref?.sound ? "text-primary" : "text-muted-foreground/30 hover:text-muted-foreground"}`}
                      onClick={() => toggleEvent(event.key, "sound")}
                      title="Toggle sound"
                    >
                      {pref?.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </button>
                    <Switch
                      checked={pref?.enabled ?? true}
                      onCheckedChange={() => toggleEvent(event.key, "enabled")}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Button onClick={savePrefs} className="w-full sm:w-auto">
        Save All Preferences
      </Button>
    </div>
  );
};

// ═══════════════════════════════════════════
// Tab 2: Real-time Notification Center
// ═══════════════════════════════════════════
const NotificationCenterTab = () => {
  const { notifications, unreadCount, markAsRead, markAllRead, clearAll } = useNotifications();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (search && !n.message.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      if (statusFilter === "unread" && n.is_read) return false;
      if (statusFilter === "read" && !n.is_read) return false;
      if (dateFilter !== "all") {
        const days = dateFilter === "24h" ? 1 : dateFilter === "7d" ? 7 : 30;
        if (!isAfter(new Date(n.created_at), subDays(new Date(), days))) return false;
      }
      return true;
    });
  }, [notifications, search, typeFilter, statusFilter, dateFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const markSelectedRead = async () => {
    for (const id of selected) await markAsRead(id);
    setSelected(new Set());
    toast.success(`${selected.size} marked as read`);
  };

  const cfg = (type: string) => getCategoryColor(type);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: notifications.length, icon: <Bell className="h-4 w-4 text-primary" /> },
          { label: "Unread", value: unreadCount, icon: <BellRing className="h-4 w-4 text-amber-500" /> },
          { label: "Success", value: notifications.filter((n) => n.type === "success").length, icon: <CheckCircle className="h-4 w-4 text-emerald-500" /> },
          { label: "Errors", value: notifications.filter((n) => n.type === "error").length, icon: <AlertCircle className="h-4 w-4 text-destructive" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 flex items-center gap-3">
              {s.icon}
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark All Read
          </Button>
        )}
        {notifications.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { clearAll(); toast.success("All cleared"); }} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Clear All
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="24h">24h</SelectItem>
            <SelectItem value="7d">7 Days</SelectItem>
            <SelectItem value="30d">30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-sm"
          >
            <span className="font-medium">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={markSelectedRead}><CheckCheck className="h-3 w-3 mr-1" /> Mark Read</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Cancel</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[55vh]">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No notifications</p>
              </div>
            ) : (
              filtered.map((n, i) => {
                const c = cfg(n.type);
                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className={`flex items-start gap-3 p-4 border-b last:border-b-0 hover:bg-muted/40 transition-colors ${!n.is_read ? "bg-primary/[0.03]" : ""}`}
                  >
                    <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} className="mt-1" />
                    <div className="shrink-0 mt-0.5">{c.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.badgeClass}`}>{c.label}</Badge>
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <p className={`text-sm ${!n.is_read ? "font-medium" : "text-muted-foreground"}`}>{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(n.created_at), "MMM dd, HH:mm")} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => markAsRead(n.id)}>Read</Button>
                    )}
                  </motion.div>
                );
              })
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════
// Tab 3: Notification History / Logs
// ═══════════════════════════════════════════
const NotificationLogsTab = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("notification_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
    if (data) setLogs(data);
  }, [user]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (search && !l.message.toLowerCase().includes(search.toLowerCase()) && !l.recipient.toLowerCase().includes(search.toLowerCase())) return false;
      if (channelFilter !== "all" && l.channel !== channelFilter) return false;
      if (dateFilter !== "all") {
        const days = dateFilter === "24h" ? 1 : dateFilter === "7d" ? 7 : 30;
        if (!isAfter(new Date(l.created_at), subDays(new Date(), days))) return false;
      }
      return true;
    });
  }, [logs, search, channelFilter, dateFilter]);

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    sent: "default", delivered: "default", failed: "destructive", pending: "secondary", bounced: "destructive",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Notification Delivery Logs</h3>
          <p className="text-sm text-muted-foreground">Track all sent notifications across channels</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="push">Push</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(log.created_at), "MMM dd, HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline">{log.channel}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{log.recipient}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{log.subject || log.message}</TableCell>
                      <TableCell><Badge variant={statusColors[log.status] || "secondary"}>{log.status}</Badge></TableCell>
                      <TableCell className="text-xs text-destructive max-w-[120px] truncate">{log.error_message || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground text-center py-2">Showing 100 of {filtered.length}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════
const NotificationsPage = () => {
  const { unreadCount } = useNotifications();

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-2xl sm:text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground text-sm">Manage notification preferences, view alerts & delivery logs</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="center" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="center" className="gap-2">
            <BellRing className="h-4 w-4" />
            Notification Center
            {unreadCount > 0 && (
              <Badge className="h-5 min-w-5 flex items-center justify-center p-0 px-1 text-[10px] ml-1">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="h-4 w-4" />
            Delivery Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="center"><NotificationCenterTab /></TabsContent>
        <TabsContent value="preferences"><NotificationPreferencesTab /></TabsContent>
        <TabsContent value="logs"><NotificationLogsTab /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default NotificationsPage;
