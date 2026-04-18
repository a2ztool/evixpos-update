import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Search, ListTodo, CheckCircle2, Clock, AlertCircle,
  Target, Trophy, Flame, Star, TrendingUp, Calendar, Filter,
  BarChart3, Zap, Award, ArrowUp, ArrowRight, ArrowDown, Download,
  Sparkles, Flag, CircleDot, HelpCircle, ChevronDown, ChevronUp,
  Activity, Rocket, Brain, Crown, CheckSquare, X, Gauge
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { differenceInDays, format as fnsFormat, subDays, startOfWeek, startOfMonth } from "date-fns";
import { BarChart, Bar, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

const PRIORITY_CONFIG: Record<string, { color: string; icon: typeof ArrowUp; label: string; bg: string }> = {
  high: { color: "text-red-600", icon: ArrowUp, label: "High", bg: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  medium: { color: "text-amber-600", icon: ArrowRight, label: "Medium", bg: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  low: { color: "text-green-600", icon: ArrowDown, label: "Low", bg: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
};

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  todo: { icon: CircleDot, color: "text-muted-foreground", label: "To Do", bg: "bg-muted text-muted-foreground" },
  "in-progress": { icon: Zap, color: "text-amber-600", label: "In Progress", bg: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  done: { icon: CheckCircle2, color: "text-green-600", label: "Done", bg: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--success))", "hsl(var(--destructive))"];

// Missions / achievements
const getMissions = (stats: { total: number; done: number; streak: number; highDone: number }) => [
  { id: "first", title: "First Step", desc: "Create your first task", icon: Star, target: 1, current: stats.total, reward: "🌟" },
  { id: "five", title: "Getting Started", desc: "Complete 5 tasks", icon: Target, target: 5, current: stats.done, reward: "🎯" },
  { id: "twenty", title: "Task Master", desc: "Complete 20 tasks", icon: Trophy, target: 20, current: stats.done, reward: "🏆" },
  { id: "fifty", title: "Legend", desc: "Complete 50 tasks", icon: Award, target: 50, current: stats.done, reward: "👑" },
  { id: "urgent", title: "Fire Fighter", desc: "Complete 10 high-priority tasks", icon: Flame, target: 10, current: stats.highDone, reward: "🔥" },
];

const TaskMission = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "todo", due_date: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("board");
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusMode, setFocusMode] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!activeStore || !user) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
    setLoading(false);
  }, [activeStore, user]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Realtime
  useEffect(() => {
    if (!activeStore) return;
    const channel = supabase
      .channel(`tasks-${activeStore.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `store_id=eq.${activeStore.id}` }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStore, fetchTasks]);

  // Filtered tasks
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (focusMode && (t.status === "done" || t.priority === "low")) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, search, focusMode]);

  // Stats
  const stats = useMemo(() => {
    const todo = tasks.filter((t) => t.status === "todo").length;
    const inProgress = tasks.filter((t) => t.status === "in-progress").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const total = tasks.length;
    const completionRate = total > 0 ? (done / total) * 100 : 0;
    const overdue = tasks.filter((t) => t.status !== "done" && t.due_date && differenceInDays(new Date(t.due_date), new Date()) < 0).length;
    const highDone = tasks.filter((t) => t.status === "done" && t.priority === "high").length;
    const dueSoon = tasks.filter((t) => {
      if (t.status === "done" || !t.due_date) return false;
      const d = differenceInDays(new Date(t.due_date), new Date());
      return d >= 0 && d <= 3;
    }).length;

    // Streak: consecutive days with at least one completed task (simplified)
    let streak = 0;
    const completedDates = new Set(
      tasks.filter((t) => t.completed_at).map((t) => t.completed_at!.split("T")[0])
    );
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = fnsFormat(subDays(today, i), "yyyy-MM-dd");
      if (completedDates.has(d)) streak++;
      else if (i > 0) break; // allow today to be incomplete
    }

    return { total, todo, inProgress, done, completionRate, overdue, highDone, streak, dueSoon };
  }, [tasks]);

  // Period comparison: this week vs last week
  const weekComparison = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const lastWeekStart = subDays(weekStart, 7);
    const thisWeekDone = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= weekStart).length;
    const lastWeekDone = tasks.filter((t) => {
      if (!t.completed_at) return false;
      const d = new Date(t.completed_at);
      return d >= lastWeekStart && d < weekStart;
    }).length;
    const change = lastWeekDone > 0 ? ((thisWeekDone - lastWeekDone) / lastWeekDone) * 100 : (thisWeekDone > 0 ? 100 : 0);
    return { thisWeekDone, lastWeekDone, change };
  }, [tasks]);

  // Productivity score (0-100): completion rate + streak bonus - overdue penalty
  const productivityScore = useMemo(() => {
    const base = stats.completionRate * 0.6;
    const streakBonus = Math.min(stats.streak * 2, 30);
    const overduePenalty = Math.min(stats.overdue * 5, 20);
    return Math.max(0, Math.min(100, Math.round(base + streakBonus + 10 - overduePenalty)));
  }, [stats]);

  const scoreLabel = productivityScore >= 80 ? { text: "Excellent", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" }
    : productivityScore >= 60 ? { text: "Good", color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" }
    : productivityScore >= 40 ? { text: "Fair", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" }
    : { text: "Needs Focus", color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" };

  // Smart insights
  const insights = useMemo(() => {
    const list: { type: "good" | "warn" | "info"; text: string }[] = [];
    if (stats.overdue > 0) list.push({ type: "warn", text: `${stats.overdue} task${stats.overdue > 1 ? "s" : ""} overdue — review your priorities.` });
    if (stats.streak >= 7) list.push({ type: "good", text: `🔥 ${stats.streak}-day streak! You're on fire — keep it going.` });
    if (stats.dueSoon > 0) list.push({ type: "info", text: `${stats.dueSoon} task${stats.dueSoon > 1 ? "s" : ""} due in the next 3 days.` });
    if (stats.completionRate >= 80 && stats.total >= 5) list.push({ type: "good", text: "Outstanding completion rate — excellent execution!" });
    if (stats.inProgress > 5) list.push({ type: "warn", text: "Too many tasks in progress — focus on finishing before starting new." });
    if (weekComparison.change > 20) list.push({ type: "good", text: `Productivity up ${weekComparison.change.toFixed(0)}% vs last week!` });
    if (weekComparison.change < -20 && weekComparison.lastWeekDone > 0) list.push({ type: "warn", text: `Completed ${Math.abs(weekComparison.change).toFixed(0)}% fewer tasks than last week.` });
    if (list.length === 0) list.push({ type: "info", text: "Add tasks and complete them daily to unlock insights." });
    return list.slice(0, 4);
  }, [stats, weekComparison]);

  // Charts data
  const priorityDistribution = useMemo(() => [
    { name: "High", value: tasks.filter((t) => t.priority === "high" && t.status !== "done").length, color: "hsl(var(--destructive))" },
    { name: "Medium", value: tasks.filter((t) => t.priority === "medium" && t.status !== "done").length, color: "hsl(var(--warning))" },
    { name: "Low", value: tasks.filter((t) => t.priority === "low" && t.status !== "done").length, color: "hsl(var(--success))" },
  ].filter((d) => d.value > 0), [tasks]);

  const weeklyActivity = useMemo(() => {
    const days: { day: string; created: number; completed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = fnsFormat(d, "yyyy-MM-dd");
      const label = fnsFormat(d, "EEE");
      days.push({
        day: label,
        created: tasks.filter((t) => t.created_at.startsWith(dateStr)).length,
        completed: tasks.filter((t) => t.completed_at?.startsWith(dateStr)).length,
      });
    }
    return days;
  }, [tasks]);

  const missions = useMemo(() => getMissions(stats), [stats]);

  // Kanban groups
  const kanbanColumns = useMemo(() => ({
    todo: filtered.filter((t) => t.status === "todo"),
    "in-progress": filtered.filter((t) => t.status === "in-progress"),
    done: filtered.filter((t) => t.status === "done"),
  }), [filtered]);

  // Handlers
  const openAdd = () => {
    setEditId(null);
    setForm({ title: "", description: "", priority: "medium", status: "todo", due_date: "" });
    setSheetOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditId(t.id);
    setForm({ title: t.title, description: t.description || "", priority: t.priority, status: t.status, due_date: t.due_date || "" });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      completed_at: form.status === "done" ? new Date().toISOString() : null,
    };
    if (editId) {
      const { error } = await supabase.from("tasks").update(payload).eq("id", editId);
      if (error) toast.error(error.message); else toast.success("Task updated ✓");
    } else {
      const { error } = await supabase.from("tasks").insert({ ...payload, user_id: effectiveUserId!, store_id: activeStore?.id });
      if (error) toast.error(error.message); else toast.success("Task created! 🎉");
    }
    setSheetOpen(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const completed_at = status === "done" ? new Date().toISOString() : null;
    await supabase.from("tasks").update({ status, completed_at }).eq("id", id);
  };

  const toggleDone = async (t: Task) => {
    const newStatus = t.status === "done" ? "todo" : "done";
    await updateStatus(t.id, newStatus);
    if (newStatus === "done") toast.success("Task completed! 🎉");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Deleted");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkComplete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).in("id", ids);
    toast.success(`✓ Completed ${ids.length} tasks`);
    setSelectedIds(new Set());
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await supabase.from("tasks").delete().in("id", ids);
    toast.success(`Deleted ${ids.length} tasks`);
    setSelectedIds(new Set());
  };

  const exportCSV = () => {
    const headers = ["Title", "Description", "Priority", "Status", "Due Date", "Completed At", "Created"];
    const rows = filtered.map((t) => [
      t.title, (t.description || "").replace(/,/g, ";"), t.priority, t.status,
      t.due_date || "", t.completed_at || "", t.created_at,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${fnsFormat(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported!");
  };

  const getDueInfo = (t: Task) => {
    if (t.status === "done") return null;
    if (!t.due_date) return null;
    const days = differenceInDays(new Date(t.due_date), new Date());
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, variant: "destructive" as const };
    if (days === 0) return { label: "Due today", variant: "destructive" as const };
    if (days <= 3) return { label: `${days}d left`, variant: "secondary" as const };
    return { label: fnsFormat(new Date(t.due_date), "dd MMM"), variant: "outline" as const };
  };

  // Loading
  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-9 w-28" /></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  const TaskCard = ({ t }: { t: Task }) => {
    const pri = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
    const PriIcon = pri.icon;
    const dueInfo = getDueInfo(t);

    return (
      <Card className={`group transition-all duration-200 hover:shadow-md ${t.status === "done" ? "opacity-70" : ""}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={t.status === "done"}
              onCheckedChange={() => toggleDone(t)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm leading-snug ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                {t.title}
              </p>
              {t.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={pri.bg}>
                <PriIcon className="h-3 w-3 mr-1" />{pri.label}
              </Badge>
              {dueInfo && <Badge variant={dueInfo.variant}>{dueInfo.label}</Badge>}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Premium Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-6">
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Task & Mission</h1>
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1 text-[10px]">
                    <Crown className="h-2.5 w-2.5" /> PRO
                  </Badge>
                  <Badge variant="outline" className={`${scoreLabel.bg} ${scoreLabel.color} border-0 gap-1`}>
                    <Gauge className="h-3 w-3" /> Score {productivityScore}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Plan, track and gamify your daily productivity workflow
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={focusMode ? "default" : "outline"}
                size="sm"
                onClick={() => setFocusMode(!focusMode)}
                className="gap-1.5"
              >
                <Brain className="h-4 w-4" /> {focusMode ? "Focus On" : "Focus Mode"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setGuideOpen(!guideOpen)} className="gap-1.5">
                <HelpCircle className="h-4 w-4" /> Guide
                {guideOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
                <Download className="h-4 w-4" /> Export
              </Button>
              <Button size="sm" onClick={openAdd} className="gap-1.5 shadow-md">
                <Plus className="h-4 w-4" /> New Task
              </Button>
            </div>
          </div>

          {/* Snapshot strip */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border/40">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">This Week Done</p>
              <p className="text-lg font-bold mt-0.5 flex items-center gap-1.5">
                {weekComparison.thisWeekDone}
                {weekComparison.change !== 0 && (
                  <span className={`text-[10px] font-medium ${weekComparison.change > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {weekComparison.change > 0 ? "▲" : "▼"} {Math.abs(weekComparison.change).toFixed(0)}%
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Active</p>
              <p className="text-lg font-bold mt-0.5">{stats.todo + stats.inProgress}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Overdue</p>
              <p className={`text-lg font-bold mt-0.5 ${stats.overdue > 0 ? "text-destructive" : ""}`}>{stats.overdue}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Streak</p>
              <p className="text-lg font-bold mt-0.5 flex items-center gap-1">
                <Flame className="h-4 w-4 text-orange-500" /> {stats.streak}d
              </p>
            </div>
          </div>
        </div>

        {/* Quick Guide */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <CollapsibleContent>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Quick Guide — Master Your Productivity
                  </h3>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setGuideOpen(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { icon: Plus, title: "1. Create Tasks", desc: "Click 'New Task' — set title, priority (High/Med/Low), and due date." },
                    { icon: ListTodo, title: "2. Use the Board", desc: "Switch tabs across Board, List, Missions & Analytics. Tick to complete." },
                    { icon: Brain, title: "3. Focus Mode", desc: "Hides completed & low-priority tasks so you only see what matters today." },
                    { icon: Trophy, title: "4. Earn Missions", desc: "Complete streaks & milestones to unlock achievements and grow your score." },
                  ].map((s, i) => (
                    <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-card border border-border/40">
                      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <s.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground bg-background/60 rounded-lg p-2.5 border border-border/40">
                  💡 <strong>Productivity Score</strong> = completion rate + streak bonus − overdue penalty. Aim for 80+!
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Smart Insights */}
        {insights.length > 0 && (
          <Card className="border-border/40">
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Smart Insights</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2.5 rounded-lg text-xs border ${
                      ins.type === "good"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-900/10 dark:border-emerald-900/30 dark:text-emerald-300"
                        : ins.type === "warn"
                        ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/10 dark:border-amber-900/30 dark:text-amber-300"
                        : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/10 dark:border-blue-900/30 dark:text-blue-300"
                    }`}
                  >
                    <span className="mt-0.5">
                      {ins.type === "good" ? "✨" : ins.type === "warn" ? "⚠️" : "ℹ️"}
                    </span>
                    <span className="leading-relaxed">{ins.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <Card className="border-primary/40 bg-primary/5 sticky top-2 z-20">
            <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckSquare className="h-4 w-4 text-primary" />
                {selectedIds.size} selected
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={bulkComplete}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                </Button>
                <Button size="sm" variant="destructive" className="gap-1.5" onClick={bulkDelete}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Productivity Score Card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Productivity Score</h3>
              </div>
              <Badge className={`${scoreLabel.bg} ${scoreLabel.color} border-0`}>{scoreLabel.text}</Badge>
            </div>
            <div className="flex items-end gap-3 mb-2">
              <p className="text-3xl sm:text-4xl font-bold">{productivityScore}</p>
              <p className="text-sm text-muted-foreground mb-1">/ 100</p>
            </div>
            <Progress value={productivityScore} className="h-2" />
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Completion</p>
                <p className="text-sm font-bold mt-0.5">{stats.completionRate.toFixed(0)}%</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Streak Bonus</p>
                <p className="text-sm font-bold mt-0.5">+{Math.min(stats.streak * 2, 30)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overdue Penalty</p>
                <p className="text-sm font-bold mt-0.5 text-destructive">−{Math.min(stats.overdue * 5, 20)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {[
            { label: "Completion", value: `${stats.completionRate.toFixed(0)}%`, sub: `${stats.done}/${stats.total} tasks`, Icon: TrendingUp, color: "primary", accent: "border-l-primary", iconBg: "bg-primary/10", iconColor: "text-primary", valueColor: "text-foreground", showProgress: true },
            { label: "To Do", value: stats.todo, sub: `${stats.dueSoon} due soon`, Icon: CircleDot, color: "blue", accent: "border-l-blue-500", iconBg: "bg-blue-500/10", iconColor: "text-blue-500", valueColor: "text-blue-600 dark:text-blue-400" },
            { label: "In Progress", value: stats.inProgress, sub: "Active now", Icon: Zap, color: "amber", accent: "border-l-amber-500", iconBg: "bg-amber-500/10", iconColor: "text-amber-500", valueColor: "text-amber-600 dark:text-amber-400" },
            { label: "Completed", value: stats.done, sub: "Total achieved", Icon: CheckCircle2, color: "green", accent: "border-l-green-500", iconBg: "bg-green-500/10", iconColor: "text-green-500", valueColor: "text-green-600 dark:text-green-400" },
            { label: "Streak", value: stats.streak, suffix: "days", sub: stats.overdue > 0 ? `${stats.overdue} overdue` : "On track 🔥", subColor: stats.overdue > 0 ? "text-destructive" : "text-muted-foreground", Icon: Flame, color: "orange", accent: "border-l-orange-500", iconBg: "bg-orange-500/10", iconColor: "text-orange-500", valueColor: "text-orange-600 dark:text-orange-400" },
          ].map((k, i) => {
            const KIcon = k.Icon;
            return (
              <Card key={i} className={`hover:shadow-md transition-all duration-300 border-l-4 ${k.accent}`}>
                <CardContent className="p-4 sm:p-5 !pt-4 sm:!pt-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold uppercase tracking-wider leading-tight">{k.label}</p>
                    <div className={`p-1.5 rounded-lg ${k.iconBg} shrink-0`}>
                      <KIcon className={`h-3.5 w-3.5 ${k.iconColor}`} />
                    </div>
                  </div>
                  <p className={`text-2xl sm:text-3xl font-bold leading-none ${k.valueColor}`}>
                    {k.value}
                    {k.suffix && <span className="text-xs font-medium ml-1 text-muted-foreground">{k.suffix}</span>}
                  </p>
                  {k.showProgress && <Progress value={stats.completionRate} className="h-1.5 mt-3" />}
                  <p className={`text-[11px] mt-2 ${k.subColor || "text-muted-foreground"}`}>{k.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="board" className="gap-1.5 text-xs sm:text-sm">
              <ListTodo className="h-3.5 w-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5" /> List
            </TabsTrigger>
            <TabsTrigger value="missions" className="gap-1.5 text-xs sm:text-sm">
              <Trophy className="h-3.5 w-3.5" /> Missions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm">
              <TrendingUp className="h-3.5 w-3.5" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* Board Tab (Kanban-style) */}
          <TabsContent value="board" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Kanban columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["todo", "in-progress", "done"] as const).map((status) => {
                const config = STATUS_CONFIG[status];
                const StatusIcon = config.icon;
                const columnTasks = kanbanColumns[status];
                return (
                  <div key={status} className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${config.color}`} />
                        <h3 className="font-semibold text-sm">{config.label}</h3>
                        <Badge variant="secondary" className="text-xs h-5 px-1.5">{columnTasks.length}</Badge>
                      </div>
                      {status === "todo" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openAdd}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-muted/30 border border-dashed">
                      {columnTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                          <StatusIcon className="h-8 w-8 opacity-20 mb-2" />
                          <p className="text-xs">No tasks</p>
                        </div>
                      ) : (
                        columnTasks.map((t) => <TaskCard key={t.id} t={t} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* List Tab */}
          <TabsContent value="list" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm text-muted-foreground">{filtered.length} tasks found</p>

            <div className="space-y-2">
              {filtered.map((t) => {
                const pri = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                const sta = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                const PriIcon = pri.icon;
                const StaIcon = sta.icon;
                const dueInfo = getDueInfo(t);

                return (
                  <Card key={t.id} className={`group transition-all duration-200 hover:shadow-md ${t.status === "done" ? "opacity-60" : ""}`}>
                    <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                      <Checkbox checked={t.status === "done"} onCheckedChange={() => toggleDone(t)} />
                      <StaIcon className={`h-4 w-4 flex-shrink-0 ${sta.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {t.title}
                        </p>
                        {t.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>}
                      </div>
                      <div className="hidden sm:flex items-center gap-2">
                        <Badge className={pri.bg}>
                          <PriIcon className="h-3 w-3 mr-1" />{pri.label}
                        </Badge>
                        {dueInfo && <Badge variant={dueInfo.variant}>{dueInfo.label}</Badge>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {t.status !== "done" && t.status !== "in-progress" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" onClick={() => updateStatus(t.id, "in-progress")} title="Start">
                            <Zap className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filtered.length === 0 && (
                <Card className="flex flex-col items-center justify-center py-16">
                  <ListTodo className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground text-sm">No tasks found</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-1" /> Create Task
                  </Button>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Missions Tab */}
          <TabsContent value="missions" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {missions.map((m) => {
                const MIcon = m.icon;
                const progress = Math.min((m.current / m.target) * 100, 100);
                const completed = m.current >= m.target;
                return (
                  <Card key={m.id} className={`transition-all duration-300 hover:shadow-md ${completed ? "border-primary/50 bg-primary/5" : "border-border/40"}`}>
                    <CardContent className="p-5 !pt-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`p-3 rounded-xl shrink-0 ${completed ? "bg-primary/20" : "bg-muted"}`}>
                          <MIcon className={`h-5 w-5 ${completed ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <span className="text-2xl leading-none">{completed ? m.reward : "🔒"}</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-sm leading-tight">{m.title}</h3>
                        <p className="text-xs text-muted-foreground leading-snug">{m.desc}</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{m.current}/{m.target}</span>
                          <span className="text-muted-foreground">{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                      {completed && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 w-fit">
                          <Sparkles className="h-3 w-3 mr-1" /> Achieved!
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Streak card */}
            <Card className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800/30">
              <CardContent className="p-6 flex items-center gap-6">
                <div className="p-4 rounded-2xl bg-orange-100 dark:bg-orange-900/40">
                  <Flame className="h-8 w-8 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">🔥 {stats.streak} Day Streak</h3>
                  <p className="text-sm text-muted-foreground">
                    {stats.streak > 0
                      ? "Keep going! Complete a task daily to maintain your streak."
                      : "Complete a task today to start your streak!"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Weekly Activity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Weekly Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {weeklyActivity.some((d) => d.created + d.completed > 0) ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={weeklyActivity}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                        <Bar dataKey="created" name="Created" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="completed" name="Completed" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                      No activity this week
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Priority Distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Flag className="h-4 w-4 text-primary" /> Active by Priority
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {priorityDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <RePieChart>
                        <Pie data={priorityDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                          {priorityDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </RePieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                      No active tasks
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Summary Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Performance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Total Created</p>
                    <p className="text-xl font-bold">{stats.total}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10">
                    <p className="text-xs text-green-600">Completed</p>
                    <p className="text-xl font-bold text-green-700">{stats.done}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10">
                    <p className="text-xs text-destructive">Overdue</p>
                    <p className="text-xl font-bold text-destructive">{stats.overdue}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10">
                    <p className="text-xs text-orange-600">Streak</p>
                    <p className="text-xl font-bold text-orange-600">{stats.streak} days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add/Edit Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {editId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editId ? "Edit Task" : "Create New Task"}
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-5 mt-6">
              {/* Live Preview */}
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={STATUS_CONFIG[form.status]?.bg || ""}>{STATUS_CONFIG[form.status]?.label || form.status}</Badge>
                    <Badge className={PRIORITY_CONFIG[form.priority]?.bg || ""}>{PRIORITY_CONFIG[form.priority]?.label || form.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium mt-2">{form.title || "Task title..."}</p>
                  {form.due_date && <p className="text-xs text-muted-foreground mt-1">📅 {fnsFormat(new Date(form.due_date), "dd MMM yyyy")}</p>}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" required />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Add details..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low"><span className="flex items-center gap-2"><ArrowDown className="h-3.5 w-3.5 text-green-600" /> Low</span></SelectItem>
                      <SelectItem value="medium"><span className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5 text-amber-600" /> Medium</span></SelectItem>
                      <SelectItem value="high"><span className="flex items-center gap-2"><ArrowUp className="h-3.5 w-3.5 text-red-600" /> High</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo"><span className="flex items-center gap-2"><CircleDot className="h-3.5 w-3.5" /> To Do</span></SelectItem>
                      <SelectItem value="in-progress"><span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-amber-600" /> In Progress</span></SelectItem>
                      <SelectItem value="done"><span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Done</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>

              <Button type="submit" className="w-full gap-2">
                {editId ? <Pencil className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {editId ? "Update Task" : "Create Task"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
};

export default TaskMission;
