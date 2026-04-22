import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/hooks/useAdmin";
import { ShieldCheck, UserPlus, Trash2, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface AdminRow {
  id: string;
  user_id: string;
  role: string;
  email?: string;
  name?: string;
}

const ROLE_TIERS = [
  { value: "super_admin", label: "Super Admin", desc: "Full control over everything", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  { value: "admin", label: "Admin", desc: "Standard admin access", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "finance_admin", label: "Finance Admin", desc: "Payments, gateways, finance dashboard", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "support_admin", label: "Support Admin", desc: "Users, stores, support tickets", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
];

const AdminRoles = () => {
  const { adminCall, loading } = useAdmin();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await adminCall("list_admin_roles", {}, { silent: true });
    if (data) setAdmins(data);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!email.trim()) return toast.error("Enter user email");
    setBusy(true);
    const users = await adminCall("get_users", { search: email.trim() }, { silent: true });
    setBusy(false);
    const match = (users || []).find((u: any) => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (!match) return toast.error("User not found. They must sign up first.");
    const ok = await adminCall("set_user_role", { user_id: match.id, role });
    if (ok) {
      toast.success(`${role.replace("_", " ")} role granted to ${email}`);
      setEmail("");
      load();
    }
  };

  const handleRemove = async (row: AdminRow) => {
    if (!confirm(`Revoke ${row.role} from ${row.email || row.user_id}?`)) return;
    const ok = await adminCall("remove_user_role", { user_id: row.user_id, role: row.role });
    if (ok) { toast.success("Role removed"); load(); }
  };

  const grouped = ROLE_TIERS.map(tier => ({
    ...tier,
    members: admins.filter(a => a.role === tier.value),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-emerald-400" /> Admin Roles
        </h1>
        <p className="text-sm text-slate-400 mt-1">Multi-tier role-based access for your admin team</p>
      </div>

      <Card className="bg-slate-800 border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Grant Admin Role
        </h2>
        <div className="grid md:grid-cols-[1fr_220px_auto] gap-3">
          <Input
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-slate-900 border-slate-700 text-white"
          />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {ROLE_TIERS.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={busy || loading} className="bg-emerald-600 hover:bg-emerald-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant"}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">User must already have signed up.</p>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {grouped.map(tier => (
          <Card key={tier.value} className="bg-slate-800 border-slate-700 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <Badge className={`${tier.color} border`}>
                  <ShieldCheck className="h-3 w-3 mr-1" />{tier.label}
                </Badge>
                <p className="text-xs text-slate-500 mt-1.5">{tier.desc}</p>
              </div>
              <span className="text-xs text-slate-400">{tier.members.length}</span>
            </div>
            <div className="space-y-2">
              {tier.members.length === 0 && (
                <p className="text-xs text-slate-500 italic">No members</p>
              )}
              {tier.members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{m.name || "—"}</p>
                    <p className="text-xs text-slate-400 truncate">{m.email}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleRemove(m)} className="h-7 w-7 text-rose-400 hover:bg-rose-500/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminRoles;
