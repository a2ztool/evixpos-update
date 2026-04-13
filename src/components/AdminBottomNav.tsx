import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wallet, Inbox, MoreHorizontal, Ticket, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Store, CreditCard, Tag, BarChart3, Settings, Globe, LogOut } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const mainItems = [
  { icon: LayoutDashboard, path: "/admin/dashboard", label: "Home" },
  { icon: Users, path: "/admin/users", label: "Users" },
  { icon: Wallet, path: "/admin/payments", label: "Payments" },
  { icon: Inbox, path: "/admin/inbox", label: "Inbox" },
];

const moreItems = [
  { icon: Store, path: "/admin/stores", label: "Stores" },
  { icon: CreditCard, path: "/admin/gateways", label: "Gateways" },
  { icon: Zap, path: "/admin/auto-payments", label: "Auto Pay" },
  { icon: Tag, path: "/admin/coupons", label: "Coupons" },
  { icon: BarChart3, path: "/admin/reports", label: "Reports" },
  { icon: Settings, path: "/admin/settings", label: "Settings" },
  { icon: Globe, path: "/admin/landing", label: "Landing Page" },
  { icon: Ticket, path: "/admin/support", label: "Support" },
];

interface AdminBottomNavProps {
  pendingPayments: number;
  unreadChats: number;
}

const AdminBottomNav = ({ pendingPayments, unreadChats }: AdminBottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isMoreActive = moreItems.some(i => location.pathname === i.path);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-800/95 backdrop-blur-xl border-t border-slate-700/50 md:hidden">
      <div className="flex items-center justify-around py-1.5 pb-[max(env(safe-area-inset-bottom),4px)]">
        {mainItems.map((item) => {
          const active = location.pathname === item.path;
          const badge = item.path === "/admin/payments" ? pendingPayments : item.path === "/admin/inbox" ? unreadChats : 0;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
                active ? "text-emerald-400" : "text-slate-400 active:text-white active:scale-95"
              }`}
            >
              <div className="relative">
                <item.icon className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                    {badge}
                  </span>
                )}
                {active && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />}
              </div>
              <span className={`text-[10px] font-medium ${active ? "font-semibold" : ""}`}>{item.label}</span>
            </button>
          );
        })}

        {/* More button with sheet */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
              isMoreActive ? "text-emerald-400" : "text-slate-400 active:text-white active:scale-95"
            }`}>
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-slate-800 border-slate-700 rounded-t-2xl pb-safe">
            <SheetTitle className="text-white text-base mb-4">More Options</SheetTitle>
            <div className="grid grid-cols-3 gap-3 pb-4">
              {moreItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setOpen(false); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
                      active ? "bg-emerald-600/20 text-emerald-400" : "text-slate-300 hover:bg-slate-700/50"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={async () => { await supabase.auth.signOut(); navigate("/admin"); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors mt-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default AdminBottomNav;
