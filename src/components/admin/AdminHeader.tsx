import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Clock, LogOut, RefreshCw, Search, ShieldCheck, Wallet, Inbox as InboxIcon, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type NavItem = { label: string; path: string; icon: React.ComponentType<{ className?: string }> };

interface AdminHeaderProps {
  navItems: NavItem[];
  pendingPayments: number;
  unreadChats: number;
}

const AdminHeader = ({ navItems, pendingPayments, unreadChats }: AdminHeaderProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [now, setNow] = useState(new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentItem = useMemo(
    () => navItems.find((n) => n.path === location.pathname),
    [navItems, location.pathname],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cmd/Ctrl + K to open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/sanjoy");
  };

  const totalAlerts = pendingPayments + unreadChats;
  const adminEmail = session?.user?.email ?? "admin";
  const initials = adminEmail.slice(0, 2).toUpperCase();

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <>
      <header className="mb-4 md:mb-6 rounded-2xl border border-slate-700/60 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-800/70 backdrop-blur-xl shadow-lg">
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:gap-4 md:p-4">
          {/* Left: Title + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 ring-1 ring-emerald-500/30">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                <span>Super Admin</span>
                <span className="text-slate-600">/</span>
                <span className="text-emerald-400">{currentItem?.label ?? "Dashboard"}</span>
              </div>
              <h1 className="truncate text-lg font-bold text-white md:text-xl">
                {currentItem?.label ?? "Admin Dashboard"}
              </h1>
            </div>
          </div>

          {/* Center: Search (desktop only) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden lg:flex flex-1 max-w-md items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-left text-sm text-slate-400 transition hover:border-emerald-500/40 hover:text-white"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Search pages, actions...</span>
            <kbd className="rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
              ⌘K
            </kbd>
          </button>

          {/* Right: Actions */}
          <div className="flex items-center justify-between gap-2 md:justify-end">
            {/* Live clock */}
            <div className="hidden md:flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-1.5 ring-1 ring-slate-700">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <div className="leading-tight">
                <p className="text-[10px] text-slate-400">{dateLabel}</p>
                <p className="text-xs font-mono font-semibold text-white">{timeLabel}</p>
              </div>
            </div>

            {/* Mobile search */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="lg:hidden h-9 w-9 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <Search className="h-4 w-4" />
            </Button>

            {/* Refresh */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="h-9 w-9 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="hidden md:inline-flex h-9 w-9 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            {/* Alerts dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-9 w-9 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                  {totalAlerts > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {totalAlerts > 99 ? "99+" : totalAlerts}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 bg-slate-800 border-slate-700 text-white"
              >
                <DropdownMenuLabel className="text-slate-300">Quick Alerts</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem
                  onClick={() => navigate("/admin/payments")}
                  className="cursor-pointer focus:bg-slate-700"
                >
                  <Wallet className="h-4 w-4 mr-2 text-amber-400" />
                  <span className="flex-1">Pending Payments</span>
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                    {pendingPayments}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/admin/inbox")}
                  className="cursor-pointer focus:bg-slate-700"
                >
                  <InboxIcon className="h-4 w-4 mr-2 text-emerald-400" />
                  <span className="flex-1">Unread Chats</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                    {unreadChats}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem
                  onClick={() => navigate("/admin/activity")}
                  className="cursor-pointer focus:bg-slate-700 text-slate-300"
                >
                  View Live Activity →
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 transition hover:border-emerald-500/40">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold text-white">
                    {initials}
                  </div>
                  <div className="hidden md:block leading-tight text-left">
                    <p className="text-[11px] font-semibold text-white truncate max-w-[120px]">
                      {adminEmail}
                    </p>
                    <p className="text-[9px] text-emerald-400">● Online</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-slate-800 border-slate-700 text-white"
              >
                <DropdownMenuLabel className="text-slate-300">
                  <p className="text-xs font-normal text-slate-400">Signed in as</p>
                  <p className="text-sm truncate">{adminEmail}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem
                  onClick={() => navigate("/admin/settings")}
                  className="cursor-pointer focus:bg-slate-700"
                >
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/admin/audit-logs")}
                  className="cursor-pointer focus:bg-slate-700"
                >
                  Audit Logs
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-300"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Command palette */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search admin pages..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {navItems.map((item) => (
              <CommandItem
                key={item.path}
                value={item.label}
                onSelect={() => {
                  navigate(item.path);
                  setSearchOpen(false);
                }}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default AdminHeader;
