import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, Infinity as InfinityIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";

interface OverrideRow {
  manual_override: boolean;
  is_unlimited_store: boolean;
  is_unlimited_customer: boolean;
  is_unlimited_product: boolean;
  override_volume: number | null;
  override_max_stores: number | null;
  override_max_products: number | null;
  override_max_customers: number | null;
  notes: string | null;
}

const empty: OverrideRow = {
  manual_override: false,
  is_unlimited_store: false,
  is_unlimited_customer: false,
  is_unlimited_product: false,
  override_volume: null,
  override_max_stores: null,
  override_max_products: null,
  override_max_customers: null,
  notes: null,
};

export default function AdminOverrideCard({ userId }: { userId: string }) {
  const { adminCall } = useAdmin();
  const [row, setRow] = useState<OverrideRow>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await adminCall("get_user_override", { user_id: userId });
    setRow(data ? { ...empty, ...data } : empty);
    setLoading(false);
  };

  useEffect(() => { if (userId) load(); /* eslint-disable-next-line */ }, [userId]);

  // Realtime: reflect changes instantly if anything updates this row
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`override-${userId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "admin_plan_overrides", filter: `user_id=eq.${userId}` },
        () => load(),
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [userId]);

  const update = (patch: Partial<OverrideRow>) => setRow((r) => ({ ...r, ...patch }));

  const apply = async () => {
    setSaving(true);
    try {
      await adminCall("admin_set_overrides", { user_id: userId, ...row });
      toast.success("Override applied. User limits updated instantly.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply override");
    } finally { setSaving(false); }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await adminCall("admin_clear_overrides", { user_id: userId });
      setRow(empty);
      toast.success("Override cleared. User reverted to plan limits.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to clear override");
    } finally { setSaving(false); }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Admin Override
            {row.manual_override && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">ACTIVE</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={clear} disabled={saving || loading}
            className="text-slate-300 hover:text-white hover:bg-slate-700 h-7 px-2 text-xs gap-1">
            <RotateCcw className="h-3 w-3" /> Reset to plan
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          When enabled, these settings override the user's plan limits in real-time.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading override…
          </div>
        ) : (
          <>
            {/* Master toggle */}
            <div className="flex items-center justify-between rounded-lg bg-slate-900/50 border border-slate-700 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-white">Manual override</p>
                <p className="text-xs text-slate-400">Master switch — when off, plan limits apply.</p>
              </div>
              <Switch checked={row.manual_override} onCheckedChange={(v) => update({ manual_override: v })} />
            </div>

            {/* Unlimited toggles */}
            <div className="grid sm:grid-cols-3 gap-2">
              {([
                ["is_unlimited_store", "Stores"],
                ["is_unlimited_customer", "Customers"],
                ["is_unlimited_product", "Products"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 cursor-pointer">
                  <span className="text-sm text-slate-200 flex items-center gap-1.5">
                    <InfinityIcon className="h-3.5 w-3.5 text-emerald-400" /> Unlimited {label}
                  </span>
                  <Switch
                    checked={(row as any)[key]}
                    disabled={!row.manual_override}
                    onCheckedChange={(v) => update({ [key]: v } as any)}
                  />
                </label>
              ))}
            </div>

            {/* Numeric overrides */}
            <div className="grid sm:grid-cols-2 gap-3">
              <NumField label="Volume capacity (customers)" value={row.override_volume}
                disabled={!row.manual_override || row.is_unlimited_customer}
                onChange={(v) => update({ override_volume: v })} placeholder="Plan default" />
              <NumField label="Max stores" value={row.override_max_stores}
                disabled={!row.manual_override || row.is_unlimited_store}
                onChange={(v) => update({ override_max_stores: v })} placeholder="Plan default" />
              <NumField label="Max products" value={row.override_max_products}
                disabled={!row.manual_override || row.is_unlimited_product}
                onChange={(v) => update({ override_max_products: v })} placeholder="Plan default" />
              <NumField label="Max customers (hard cap)" value={row.override_max_customers}
                disabled={!row.manual_override || row.is_unlimited_customer}
                onChange={(v) => update({ override_max_customers: v })} placeholder="Use volume" />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes (internal)</label>
              <Input
                value={row.notes || ""}
                onChange={(e) => update({ notes: e.target.value })}
                placeholder="e.g. Enterprise pilot — unlimited until 2027"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>

            <Button onClick={apply} disabled={saving} className="w-full gap-2">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</> : <>Apply override instantly</>}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NumField({
  label, value, onChange, disabled, placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <Input
        type="number"
        min={0}
        value={value ?? ""}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Math.max(0, Number(v)));
        }}
        className="bg-slate-900 border-slate-700 text-white disabled:opacity-50"
      />
    </div>
  );
}