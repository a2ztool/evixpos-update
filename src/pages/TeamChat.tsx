import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { playNotificationSound } from "@/hooks/useChatFeatures";
import {
  MessageSquare, Plus, Send, Search, Users, ListTodo,
  CheckCircle2, Clock, AlertCircle, ChevronRight
} from "lucide-react";

// ══════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════
interface ChatGroup {
  id: string; store_id: string; created_by: string;
  name: string; icon: string; created_at: string;
}
interface ChatMessage {
  id: string; group_id: string; sender_id: string;
  message: string; type: "text" | "task" | "system"; created_at: string;
}
interface ChatTask {
  id: string; group_id: string; assigned_by: string; assigned_to: string;
  title: string; term: string | null; order_id: string | null; description: string | null;
  priority: "low" | "medium" | "high"; status: "pending" | "in_progress" | "completed";
  created_at: string;
}
interface Member { user_id: string; role: string; name?: string; email?: string; }

// Helper to bypass generated types for new tables
const db = supabase as any;

const TeamChat = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { isStaff } = useStaff();
  const storeId = activeStore?.id;
  const myId = user?.id;

  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [staffList, setStaffList] = useState<{ user_id: string; name: string; email: string }[]>([]);
  const [tasks, setTasks] = useState<ChatTask[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [searchGroup, setSearchGroup] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("💬");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [taskForm, setTaskForm] = useState({ title: "", term: "", order_id: "", description: "", assigned_to: "", priority: "medium" });
  const [unreadMap] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // ─── Fetch groups ───
  const fetchGroups = useCallback(async () => {
    if (!storeId) return;
    const { data } = await db.from("chat_groups").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    if (data) setGroups(data);
  }, [storeId]);

  const fetchStaff = useCallback(async () => {
    if (!storeId) return;
    const { data } = await db.from("staff_members").select("user_id, name, email").eq("store_id", storeId).eq("is_active", true);
    if (data) setStaffList(data);
  }, [storeId]);

  const fetchMessages = useCallback(async (groupId: string) => {
    const { data } = await db.from("chat_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(200);
    if (data) setMessages(data);
  }, []);

  const fetchMembers = useCallback(async (groupId: string) => {
    const { data } = await db.from("chat_group_members").select("user_id, role").eq("group_id", groupId);
    if (data) {
      const enriched = data.map((m: any) => {
        const staff = staffList.find((s: any) => s.user_id === m.user_id);
        return { ...m, name: staff?.name || "Owner", email: staff?.email || user?.email || "" };
      });
      setMembers(enriched);
    }
  }, [staffList, user]);

  const fetchTasks = useCallback(async (groupId: string) => {
    const { data } = await db.from("chat_tasks").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
    if (data) setTasks(data);
  }, []);

  useEffect(() => { fetchGroups(); fetchStaff(); }, [fetchGroups, fetchStaff]);

  useEffect(() => {
    if (!activeGroup) return;
    fetchMessages(activeGroup.id);
    fetchMembers(activeGroup.id);
    fetchTasks(activeGroup.id);
  }, [activeGroup, fetchMessages, fetchMembers, fetchTasks]);

  // ─── Realtime ───
  useEffect(() => {
    if (!activeGroup) return;
    const channel = supabase.channel(`chat-${activeGroup.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `group_id=eq.${activeGroup.id}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
          if (newMsg.sender_id !== myId) playNotificationSound();
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_tasks", filter: `group_id=eq.${activeGroup.id}` },
        () => fetchTasks(activeGroup.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeGroup, myId, fetchTasks]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ─── Actions ───
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !storeId || !myId) return;
    const { data: group, error } = await db.from("chat_groups").insert({ store_id: storeId, created_by: myId, name: newGroupName.trim(), icon: newGroupIcon }).select().single();
    if (error) { toast.error("Failed to create group"); return; }
    await db.from("chat_group_members").insert({ group_id: group.id, user_id: myId, role: "admin" });
    for (const uid of selectedMembers) {
      await db.from("chat_group_members").insert({ group_id: group.id, user_id: uid, role: "staff" });
    }
    await db.from("chat_messages").insert({ group_id: group.id, sender_id: myId, message: `Group "${newGroupName}" created`, type: "system" });
    setShowCreateGroup(false); setNewGroupName(""); setSelectedMembers([]);
    fetchGroups();
    toast.success("Group created!");
  };

  const handleSend = async () => {
    if (!msgInput.trim() || !activeGroup || !myId) return;
    const msg = msgInput.trim();
    setMsgInput("");
    await db.from("chat_messages").insert({ group_id: activeGroup.id, sender_id: myId, message: msg, type: "text" });
  };

  const handleAssignTask = async () => {
    if (!taskForm.title.trim() || !taskForm.assigned_to || !activeGroup || !myId) return;
    const { data: task, error } = await db.from("chat_tasks").insert({
      group_id: activeGroup.id, assigned_by: myId, assigned_to: taskForm.assigned_to,
      title: taskForm.title, term: taskForm.term || null, order_id: taskForm.order_id || null,
      description: taskForm.description || null, priority: taskForm.priority, status: "pending"
    }).select().single();
    if (error) { toast.error("Failed to assign task"); return; }
    const assigneeName = members.find(m => m.user_id === taskForm.assigned_to)?.name || "Staff";
    await db.from("chat_messages").insert({
      group_id: activeGroup.id, sender_id: myId,
      message: JSON.stringify({ taskId: task.id, title: taskForm.title, assignee: assigneeName, priority: taskForm.priority, status: "pending" }),
      type: "task"
    });
    setShowTaskModal(false);
    setTaskForm({ title: "", term: "", order_id: "", description: "", assigned_to: "", priority: "medium" });
    toast.success("Task assigned!");
    playNotificationSound();
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    await db.from("chat_tasks").update({ status: newStatus }).eq("id", taskId);
    fetchTasks(activeGroup!.id);
    toast.success(`Task ${newStatus}`);
  };

  const getSenderName = (senderId: string) => {
    if (senderId === myId) return "You";
    return members.find(m => m.user_id === senderId)?.name || "Unknown";
  };
  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();
  const priorityColor = (p: string) => p === "high" ? "text-destructive" : p === "medium" ? "text-yellow-500" : "text-green-500";
  const statusIcon = (s: string) => s === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : s === "in_progress" ? <Clock className="h-4 w-4 text-yellow-500" /> : <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(searchGroup.toLowerCase()));

  const ICONS = ["💬", "👥", "🚀", "📦", "🎯", "⚡", "🔥", "💼", "🏪", "🛒"];

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
        {/* LEFT: Group List */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-border/50 flex flex-col ${mobileShowChat ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" /> Team Chat
              </h2>
              {!isStaff && (
                <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> New Group</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div><Label>Group Name</Label><Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Sales Team" /></div>
                      <div>
                        <Label>Icon</Label>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {ICONS.map(ic => (
                            <button key={ic} onClick={() => setNewGroupIcon(ic)}
                              className={`text-2xl p-1.5 rounded-lg transition-all ${newGroupIcon === ic ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-accent"}`}>
                              {ic}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label>Add Members</Label>
                        <div className="space-y-2 mt-1 max-h-40 overflow-y-auto">
                          {staffList.map(s => (
                            <label key={s.user_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer">
                              <input type="checkbox" checked={selectedMembers.includes(s.user_id)}
                                onChange={e => setSelectedMembers(prev => e.target.checked ? [...prev, s.user_id] : prev.filter(id => id !== s.user_id))}
                                className="rounded" />
                              <span className="text-sm">{s.name}</span>
                              <span className="text-xs text-muted-foreground ml-auto">{s.email}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <Button onClick={handleCreateGroup} className="w-full">Create Group</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchGroup} onChange={e => setSearchGroup(e.target.value)} placeholder="Search groups..." className="pl-9" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No groups yet</p>
                <p className="text-xs">Create a group to start chatting</p>
              </div>
            ) : filteredGroups.map(g => (
              <button key={g.id} onClick={() => { setActiveGroup(g); setMobileShowChat(true); }}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-accent/50 transition-colors text-left ${activeGroup?.id === g.id ? "bg-accent" : ""}`}>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">{g.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{g.name}</p>
                    <span className="text-[10px] text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {unreadMap[g.id] > 0 && <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 min-w-[20px] h-5">{unreadMap[g.id]}</Badge>}
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* RIGHT: Chat Window */}
        <div className={`flex-1 flex flex-col ${!mobileShowChat ? "hidden md:flex" : "flex"}`}>
          {!activeGroup ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a group to start chatting</p>
              <p className="text-sm">Create or join a group from the left panel</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3">
                <button className="md:hidden mr-1" onClick={() => setMobileShowChat(false)}>
                  <ChevronRight className="h-5 w-5 rotate-180" />
                </button>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-lg">{activeGroup.icon}</div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{activeGroup.name}</p>
                  <p className="text-xs text-muted-foreground">{members.length} members</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8"><Users className="h-4 w-4" /></Button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => {
                  const isMe = msg.sender_id === myId;
                  if (msg.type === "system") {
                    return <div key={msg.id} className="flex justify-center"><span className="text-xs bg-muted px-3 py-1 rounded-full text-muted-foreground">{msg.message}</span></div>;
                  }
                  if (msg.type === "task") {
                    let taskData: any = {};
                    try { taskData = JSON.parse(msg.message); } catch { taskData = { title: msg.message }; }
                    const task = tasks.find(t => t.id === taskData.taskId);
                    return (
                      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-sm bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-primary" /><span className="text-xs font-medium text-primary">Task Assigned</span></div>
                          <p className="font-semibold text-sm">{taskData.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>→ {taskData.assignee}</span>
                            <span className={priorityColor(taskData.priority)}>{taskData.priority}</span>
                          </div>
                          {task && (
                            <div className="flex items-center gap-2 mt-1">
                              {statusIcon(task.status)}
                              <span className="text-xs capitalize">{task.status.replace("_", " ")}</span>
                              {task.status !== "completed" && (task.assigned_to === myId || task.assigned_by === myId) && (
                                <Select value={task.status} onValueChange={(v) => handleUpdateTaskStatus(task.id, v)}>
                                  <SelectTrigger className="h-6 text-xs w-28 ml-auto"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} gap-2`}>
                      {!isMe && <Avatar className="h-7 w-7 flex-shrink-0"><AvatarFallback className="text-[10px] bg-accent">{getInitials(getSenderName(msg.sender_id))}</AvatarFallback></Avatar>}
                      <div className={`max-w-[70%] ${isMe ? "bg-primary text-primary-foreground" : "bg-accent"} rounded-2xl px-3 py-2`}>
                        {!isMe && <p className="text-[10px] font-medium text-primary mb-0.5">{getSenderName(msg.sender_id)}</p>}
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-border/50 flex items-center gap-2">
                <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" title="Assign Task"><ListTodo className="h-4 w-4" /></Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-primary" /> Assign Task</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Task Title *</Label><Input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Pack order #123" /></div>
                      <div><Label>Assign To *</Label>
                        <Select value={taskForm.assigned_to} onValueChange={v => setTaskForm(p => ({ ...p, assigned_to: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                          <SelectContent>{members.filter(m => m.user_id !== myId).map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Term/Duration</Label><Input value={taskForm.term} onChange={e => setTaskForm(p => ({ ...p, term: e.target.value }))} placeholder="e.g. 2 hours" /></div>
                        <div><Label>Priority</Label>
                          <Select value={taskForm.priority} onValueChange={v => setTaskForm(p => ({ ...p, priority: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">🟢 Low</SelectItem>
                              <SelectItem value="medium">🟡 Medium</SelectItem>
                              <SelectItem value="high">🔴 High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div><Label>Link Order (optional)</Label><Input value={taskForm.order_id} onChange={e => setTaskForm(p => ({ ...p, order_id: e.target.value }))} placeholder="Order ID" /></div>
                      <div><Label>Notes</Label><Textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} placeholder="Additional details..." rows={2} /></div>
                      <Button onClick={handleAssignTask} className="w-full">Assign Task</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Input value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder="Type a message..." className="flex-1" />
                <Button size="icon" onClick={handleSend} disabled={!msgInput.trim()} className="h-9 w-9 flex-shrink-0"><Send className="h-4 w-4" /></Button>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TeamChat;
