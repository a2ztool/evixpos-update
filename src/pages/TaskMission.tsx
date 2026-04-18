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
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, search]);

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="hidden sm:block">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              Task & Mission
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage tasks, track progress & earn achievements
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Task
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card className="hover:shadow-md transition-all duration-300">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Completion</p>
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold">{stats.completionRate.toFixed(0)}%</p>
              <Progress value={stats.completionRate} className="h-1.5 mt-2" />
              <p className="text-[10px] text-muted-foreground mt-1">{stats.done}/{stats.total} tasks</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all duration-300 border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">To Do</p>
                <CircleDot className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats.todo}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{stats.dueSoon} due soon</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all duration-300 border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">In Progress</p>
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-600">{stats.inProgress}</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all duration-300 border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Completed</p>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.done}</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all duration-300 border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Streak</p>
                <Flame className="h-4 w-4 text-orange-500" />
              </div>
              <p className="text-2xl font-bold text-orange-600">{stats.streak} <span className="text-sm font-normal">days</span></p>
              {stats.overdue > 0 && (
                <p className="text-[10px] text-destructive mt-1">{stats.overdue} overdue</p>
              )}
            </CardContent>
          </Card>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {missions.map((m) => {
                const MIcon = m.icon;
                const progress = Math.min((m.current / m.target) * 100, 100);
                const completed = m.current >= m.target;
                return (
                  <Card key={m.id} className={`transition-all duration-300 hover:shadow-md ${completed ? "border-primary/50 bg-primary/5" : ""}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${completed ? "bg-primary/20" : "bg-muted"}`}>
                          <MIcon className={`h-5 w-5 ${completed ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <span className="text-2xl">{completed ? m.reward : "🔒"}</span>
                      </div>
                      <h3 className="font-semibold text-sm">{m.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{m.current}/{m.target}</span>
                          <span>{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                      {completed && (
                        <Badge className="mt-3 bg-primary/10 text-primary border-primary/20">
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
