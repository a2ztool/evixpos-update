import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, Users, Store, BarChart3, LogOut, ShieldCheck, Settings, Tag, CreditCard, Wallet, Globe, Inbox, Ticket, Zap, Gift, DollarSign, Network, ScrollText, Megaphone, Wrench, Flag, Mail, TrendingUp, KeyRound, Database, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/hooks/useAdmin";
import { useNotifications } from "@/hooks/useNotifications";
import AdminBottomNav from "@/components/AdminBottomNav";
import BackButton from "@/components/BackButton";
import AdminHeader from "@/components/admin/AdminHeader";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Hierarchy", path: "/admin/hierarchy", icon: Network },
  { label: "Stores", path: "/admin/stores", icon: Store },
  { label: "Payments", path: "/admin/payments", icon: Wallet, badgeKey: "payments" as const },
  { label: "Gateways", path: "/admin/gateways", icon: CreditCard },
  { label: "Auto Payments", path: "/admin/auto-payments", icon: Zap },
  { label: "Coupons", path: "/admin/coupons", icon: Tag },
  { label: "Inbox", path: "/admin/inbox", icon: Inbox, badgeKey: "inbox" as const },
  { label: "Support", path: "/admin/support", icon: Ticket },
  { label: "Referrals", path: "/admin/referrals", icon: Gift },
  { label: "Reports", path: "/admin/reports", icon: BarChart3 },
  { label: "Broadcasts", path: "/admin/broadcasts", icon: Megaphone },
  { label: "Audit Logs", path: "/admin/audit-logs", icon: ScrollText },
  { label: "Maintenance", path: "/admin/maintenance", icon: Wrench },
  { label: "Feature Flags", path: "/admin/feature-flags", icon: Flag },
  { label: "Templates", path: "/admin/templates", icon: Mail },
  { label: "Finance", path: "/admin/finance", icon: TrendingUp },
  { label: "Roles", path: "/admin/roles", icon: KeyRound },
  { label: "Data Export", path: "/admin/export", icon: Database },
  { label: "Live Activity", path: "/admin/activity", icon: Activity },
  { label: "Settings", path: "/admin/settings", icon: Settings },
  { label: "Plans & Pricing", path: "/admin/plans-pricing", icon: DollarSign },
  { label: "Landing Page", path: "/admin/landing", icon: Globe },
];

const AdminLayout = () => {
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const { adminCall } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  // Mount realtime notifications + sound for admin (only when authenticated as admin)
  useNotifications();

  useEffect(() => {
    const checkAdmin = async () => {
      if (!session?.user) { setIsAdmin(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    if (!authLoading) checkAdmin();
  }, [session, authLoading]);

  // Fetch pending payment count & unread chats
  useEffect(() => {
    if (!isAdmin) return;
    const fetchPending = async () => {
      try {
        const data = await adminCall("get_plan_payments");
        const count = (data || []).filter((p: any) => p.status === "pending").length;
        setPendingPayments(count);
      } catch {}
    };
    const fetchUnread = async () => {
      try {
        const { count } = await supabase.from("chat_sessions").select("*", { count: "exact", head: true }).eq("is_read", false);
        setUnreadChats(count || 0);
      } catch {}
    };
    fetchPending();
    fetchUnread();
    const interval = setInterval(() => { fetchPending(); fetchUnread(); }, 15000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-[100dvh] md:min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  if (!session || !isAdmin) return <Navigate to="/sanjoy" replace />;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/sanjoy");
  };

  return (
    <div className="min-h-[100dvh] md:min-h-screen flex bg-slate-900">
      {/* Sidebar - hidden on mobile */}
      <aside className="hidden md:flex w-64 bg-slate-800 border-r border-slate-700 flex-col">
        <div className="p-4 border-b border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-bold text-white text-sm">Super Admin</h2>
            <p className="text-xs text-slate-400">Control Panel</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-emerald-600/20 text-emerald-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {"badgeKey" in item && item.badgeKey === "payments" && pendingPayments > 0 && (
                <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center">
                  {pendingPayments}
                </Badge>
              )}
              {"badgeKey" in item && item.badgeKey === "inbox" && unreadChats > 0 && (
                <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center">
                  {unreadChats}
                </Badge>
              )}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile top bar — compact app-style */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-slate-800/95 backdrop-blur-xl border-b border-slate-700/50" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/20 flex items-center justify-center">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <span className="font-semibold text-white text-sm">Admin</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BackButton className="text-slate-400 hover:text-white" />
            <span className="text-xs text-slate-400 font-medium">
              {NAV_ITEMS.find(n => n.path === location.pathname)?.label || "Dashboard"}
            </span>
          </div>
        </div>
      </div>

      {/* Main — page-level scroll on mobile, container scroll on desktop */}
      <main className="flex-1 overflow-visible md:overflow-auto">
        <div className="px-3 py-3 md:p-6 pt-16 md:pt-6 pb-24 md:pb-6">
          <AdminHeader navItems={NAV_ITEMS} pendingPayments={pendingPayments} unreadChats={unreadChats} />
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <AdminBottomNav pendingPayments={pendingPayments} unreadChats={unreadChats} />
    </div>
  );
};

export default AdminLayout;
