import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useNotifications } from "@/hooks/useNotifications";
import { TYPE_EMOJI, TYPE_LABEL, SOUND_CATEGORY } from "@/lib/notificationTriggers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow, format, subDays, isAfter } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, BellOff, CheckCheck, Trash2, Search, Filter,
  AlertCircle, CheckCircle, AlertTriangle, Info, ShoppingCart, CreditCard,
} from "lucide-react";
import { toast } from "sonner";

const getCfg = (type: string) => {
  const cat = SOUND_CATEGORY[type] || "info";
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    order: { icon: <ShoppingCart className="h-4 w-4 text-blue-500" />, color: "bg-blue-500/10 text-blue-700 border-blue-200" },
    payment: { icon: <CreditCard className="h-4 w-4 text-emerald-500" />, color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    alert: { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, color: "bg-amber-500/10 text-amber-700 border-amber-200" },
    success: { icon: <CheckCircle className="h-4 w-4 text-emerald-500" />, color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    error: { icon: <AlertCircle className="h-4 w-4 text-destructive" />, color: "bg-destructive/10 text-destructive border-destructive/20" },
    info: { icon: <Info className="h-4 w-4 text-blue-500" />, color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  };
  return { icon: map[cat]?.icon || map.info.icon, label: TYPE_LABEL[type] || type, color: map[cat]?.color || map.info.color };
};

const NotificationCenter = () => {
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
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((n) => n.id)));
    }
  };

  const markSelectedRead = async () => {
    for (const id of selected) {
      await markAsRead(id);
    }
    setSelected(new Set());
    toast.success(`${selected.size} notifications marked as read`);
  };

  const handleClearAll = async () => {
    await clearAll();
    setSelected(new Set());
    toast.success("All notifications cleared");
  };

  const cfg = (type: string) => getCfg(type);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Bell className="h-7 w-7 text-primary" />
              Notification Center
            </h1>
            <p className="text-muted-foreground mt-1">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up! ✨"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllRead}>
                <CheckCheck className="h-4 w-4 mr-1" /> Mark All Read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleClearAll} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: notifications.length, icon: <Bell className="h-4 w-4" /> },
            { label: "Unread", value: unreadCount, icon: <BellOff className="h-4 w-4" /> },
            { label: "Success", value: notifications.filter((n) => n.type === "success").length, icon: <CheckCircle className="h-4 w-4 text-emerald-500" /> },
            { label: "Errors", value: notifications.filter((n) => n.type === "error").length, icon: <AlertCircle className="h-4 w-4 text-destructive" /> },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                {stat.icon}
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notifications..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[130px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
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
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20"
          >
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={markSelectedRead}>
              <CheckCheck className="h-3 w-3 mr-1" /> Mark Read
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Cancel
            </Button>
          </motion.div>
        )}

        {/* Notification List */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Notifications ({filtered.length})
              </CardTitle>
              {filtered.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={selectAll}>
                  {selected.size === filtered.length ? "Deselect All" : "Select All"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[60vh]">
              {filtered.length === 0 ? (
                <div className="text-center py-16">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground font-medium">No notifications found</p>
                  <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <AnimatePresence>
                  {filtered.map((n, i) => {
                    const c = cfg(n.type);
                    return (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className={`flex items-start gap-3 p-4 border-b last:border-b-0 transition-colors hover:bg-muted/40 ${!n.is_read ? "bg-primary/[0.03]" : ""}`}
                      >
                        <Checkbox
                          checked={selected.has(n.id)}
                          onCheckedChange={() => toggleSelect(n.id)}
                          className="mt-1"
                        />
                        <div className="flex-shrink-0 mt-0.5">{c.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.color}`}>
                              {c.label}
                            </Badge>
                            {!n.is_read && (
                              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          <p className={`text-sm ${!n.is_read ? "font-medium" : "text-muted-foreground"}`}>
                            {n.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(n.created_at), "MMM dd, yyyy 'at' HH:mm")} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!n.is_read && (
                          <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => markAsRead(n.id)}>
                            Mark read
                          </Button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default NotificationCenter;
