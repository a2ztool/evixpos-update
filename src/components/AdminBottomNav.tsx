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
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pointer-events-none">
      <div className="pointer-events-auto mx-2 mb-[max(env(safe-area-inset-bottom),4px)]">
        <div className="rounded-[24px] border border-slate-600/40 shadow-[0_8px_32px_rgba(0,0,0,0.3)]" style={{
          background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.92) 100%)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
        }}>
          <div className="flex items-center justify-around px-2 pt-2 pb-2.5">
            {mainItems.map((item) => {
              const active = location.pathname === item.path;
              const badge = item.path === "/admin/payments" ? pendingPayments : item.path === "/admin/inbox" ? unreadChats : 0;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all min-w-[52px] active:scale-90 ${
                    active ? "text-emerald-400" : "text-slate-400"
                  }`}
                >
                  <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    active ? "bg-emerald-500/15" : "bg-transparent"
                  }`}>
                    <item.icon className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`} />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1.5 bg-amber-500 text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${active ? "font-semibold" : ""}`}>{item.label}</span>
                </button>
              );
            })}

            {/* More button with sheet */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all min-w-[52px] active:scale-90 ${
                  isMoreActive ? "text-emerald-400" : "text-slate-400"
                }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isMoreActive ? "bg-emerald-500/15" : ""}`}>
                    <MoreHorizontal className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-medium">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-slate-800 border-slate-700 rounded-t-3xl pb-safe">
                <div className="w-10 h-1 rounded-full bg-slate-600 mx-auto mb-4" />
                <SheetTitle className="text-white text-sm font-bold tracking-wide uppercase mb-4">More Options</SheetTitle>
                <div className="grid grid-cols-3 gap-3 pb-4">
                  {moreItems.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => { navigate(item.path); setOpen(false); }}
                        className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl transition-all active:scale-95 ${
                          active ? "bg-emerald-600/20 text-emerald-400" : "text-slate-300 hover:bg-slate-700/50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          active ? "bg-emerald-500/15" : "bg-slate-700/50"
                        }`}>
                          <item.icon className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={async () => { await supabase.auth.signOut(); navigate("/admin"); }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-red-400 hover:bg-red-500/10 transition-colors mt-2 active:scale-97"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBottomNav;
