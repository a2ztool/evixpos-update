import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Ticket, Search, Filter, Clock, CheckCircle2, AlertCircle, XCircle,
  MessageCircle, Send, Loader2, Trash2, User, RefreshCw
} from "lucide-react";

interface SupportTicket {
  id: string;
  user_id: string;
  store_id: string | null;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  sender_type: string;
  attachment_url: string | null;
  created_at: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-slate-400" },
  medium: { label: "Medium", color: "text-blue-400" },
  high: { label: "High", color: "text-orange-400" },
  urgent: { label: "Urgent", color: "text-red-400" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bgClass: string }> = {
  open: { label: "Open", icon: AlertCircle, color: "text-blue-400", bgClass: "bg-blue-500/20" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-orange-400", bgClass: "bg-orange-500/20" },
  waiting_for_user: { label: "Waiting", icon: AlertCircle, color: "text-purple-400", bgClass: "bg-purple-500/20" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "text-emerald-400", bgClass: "bg-emerald-500/20" },
  closed: { label: "Closed", icon: XCircle, color: "text-slate-400", bgClass: "bg-slate-500/20" },
};

const AdminSupportTickets = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});

  const fetchTickets = async () => {
    setLoading(true);
    const { data } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
    const ticketData = (data as any[]) || [];
    setTickets(ticketData);

    // Fetch user profiles for ticket owners
    const userIds = [...new Set(ticketData.map(t => t.user_id))];
    if (userIds.length > 0) {
      const { data: profileData } = await supabase.from("profiles").select("id, name, email").in("id", userIds);
      const profileMap: Record<string, string> = {};
      (profileData || []).forEach((p: any) => { profileMap[p.id] = p.name || p.email || "Unknown"; });
      setProfiles(profileMap);
    }
    // Fetch store names
    const storeIds = [...new Set(ticketData.filter(t => t.store_id).map(t => t.store_id!))];
    if (storeIds.length > 0) {
      const { data: storeData } = await supabase.from("stores").select("id, name, store_mode").in("id", storeIds);
      const storeMap: Record<string, string> = {};
      (storeData || []).forEach((s: any) => { storeMap[s.id] = `${s.name} (${s.store_mode || "online"})`; });
      setStoreNames(storeMap);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, []);

  // Real-time
  useEffect(() => {
    const channel = supabase.channel("admin-support-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMessages = async (ticketId: string) => {
    const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    setMessages((data as any[]) || []);
  };

  const openTicketDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setDetailOpen(true);
    fetchMessages(ticket.id);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    setSendingMsg(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket.id,
      user_id: userData.user?.id || "",
      message: newMessage.trim(),
      sender_type: "admin",
    } as any);
    if (!error) {
      setNewMessage("");
      fetchMessages(selectedTicket.id);
      toast.success("Reply sent");
    } else toast.error("Failed to send");
    setSendingMsg(false);
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const { error } = await supabase.from("support_tickets").update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq("id", ticketId);
    if (!error) {
      toast.success(`Ticket ${newStatus.replace("_", " ")}`);
      fetchTickets();
      if (selectedTicket?.id === ticketId) setSelectedTicket(prev => prev ? { ...prev, status: newStatus } : null);
    } else toast.error("Update failed");
  };

  const handleDeleteTicket = async (id: string) => {
    const { error } = await supabase.from("support_tickets").delete().eq("id", id);
    if (!error) { toast.success("Ticket deleted"); fetchTickets(); setDetailOpen(false); } else toast.error("Delete failed");
  };

  // Stats
  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => t.status === "open").length;
    const inProgress = tickets.filter(t => t.status === "in_progress").length;
    const resolved = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;
    const urgent = tickets.filter(t => t.priority === "urgent" || t.priority === "high").length;
    return { total, open, inProgress, resolved, urgent };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const userName = profiles[t.user_id]?.toLowerCase() || "";
        if (!t.subject.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q) && !userName.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, searchQuery, profiles]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Ticket className="h-5 w-5 text-emerald-400" /> Support Tickets
          </h1>
          <p className="text-sm text-slate-400">Manage all user support requests</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-white" },
          { label: "Open", value: stats.open, color: "text-blue-400" },
          { label: "In Progress", value: stats.inProgress, color: "text-orange-400" },
          { label: "Resolved", value: stats.resolved, color: "text-emerald-400" },
          { label: "High/Urgent", value: stats.urgent, color: "text-red-400" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-slate-400">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by subject, description, or user..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-slate-800 border-slate-700 text-white">
            <Filter className="h-3.5 w-3.5 mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filteredTickets.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700 border-dashed">
          <CardContent className="py-16 text-center">
            <Ticket className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No tickets found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map(ticket => {
            const statusConf = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const priorityConf = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
            const StatusIcon = statusConf.icon;
            return (
              <Card key={ticket.id} className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-all cursor-pointer group" onClick={() => openTicketDetail(ticket)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className={`h-4 w-4 flex-shrink-0 ${statusConf.color}`} />
                        <h4 className="font-semibold text-sm text-white truncate">{ticket.subject}</h4>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1 ml-6">{ticket.description}</p>
                      <div className="flex items-center gap-2 mt-2 ml-6 flex-wrap">
                        <Badge className={`text-[10px] ${statusConf.bgClass} ${statusConf.color} border-0`}>{statusConf.label}</Badge>
                        <Badge variant="outline" className={`text-[10px] border-slate-600 ${priorityConf.color}`}>{priorityConf.label}</Badge>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <User className="h-3 w-3" />{profiles[ticket.user_id] || "Unknown"}
                        </span>
                        <span className="text-[10px] text-slate-500">{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-500/10" onClick={() => handleDeleteTicket(ticket.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ticket Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg bg-slate-800 border-slate-700 text-white">
          {selectedTicket && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left text-white">{selectedTicket.subject}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {/* Info */}
                <div className="flex flex-wrap gap-2">
                  <Badge className={`${STATUS_CONFIG[selectedTicket.status]?.bgClass} ${STATUS_CONFIG[selectedTicket.status]?.color} border-0`}>
                    {STATUS_CONFIG[selectedTicket.status]?.label}
                  </Badge>
                  <Badge variant="outline" className={`border-slate-600 ${PRIORITY_CONFIG[selectedTicket.priority]?.color}`}>
                    {PRIORITY_CONFIG[selectedTicket.priority]?.label}
                  </Badge>
                  <Badge variant="outline" className="border-slate-600 text-slate-300">{selectedTicket.category}</Badge>
                </div>
                <p className="text-sm text-slate-300">{selectedTicket.description}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <User className="h-3 w-3" />{profiles[selectedTicket.user_id] || "Unknown"} • {format(new Date(selectedTicket.created_at), "PPp")}
                </div>

                {/* Status Change */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Change Status</label>
                  <Select value={selectedTicket.status} onValueChange={v => handleStatusChange(selectedTicket.id, v)}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="bg-slate-700" />

                {/* Messages */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4" />Conversation</h4>
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                    {messages.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">No messages yet</p>
                    ) : messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                          msg.sender_type === "admin" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200"
                        }`}>
                          <p className="text-[10px] font-medium mb-1 opacity-70">{msg.sender_type === "admin" ? "Admin" : "User"}</p>
                          <p>{msg.message}</p>
                          <p className="text-[10px] mt-1 opacity-60">{format(new Date(msg.created_at), "p")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reply */}
                <div className="flex gap-2">
                  <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Reply as admin..." className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" onKeyDown={e => e.key === "Enter" && handleSendMessage()} />
                  <Button size="icon" onClick={handleSendMessage} disabled={sendingMsg || !newMessage.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                    {sendingMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminSupportTickets;
