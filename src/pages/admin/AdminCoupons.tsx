import { useEffect, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFormValidation } from "@/hooks/useFormValidation";
import { adminCouponSchema } from "@/lib/validations";

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  expires_at: string | null;
  is_active: boolean;
  max_uses: number;
  used_count: number;
  created_at: string;
}

const AdminCoupons = () => {
  const { adminCall, loading } = useAdmin();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: "",
    expires_at: "",
    max_uses: "",
    is_active: true,
  });
  const v = useFormValidation(adminCouponSchema);

  const fetchCoupons = async () => {
    const data = await adminCall("get_coupons");
    if (data) setCoupons(data);
  };

  useEffect(() => { fetchCoupons(); }, [adminCall]);

  const handleCreate = async () => {
    if (!v.validateAll(form)) return;
    await adminCall("create_coupon", {
      code: form.code.toUpperCase().trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      expires_at: form.expires_at || null,
      max_uses: form.max_uses ? Number(form.max_uses) : 0,
      is_active: form.is_active,
    });
    toast.success("Coupon created");
    setDialogOpen(false);
    setForm({ code: "", discount_type: "percentage", discount_value: "", expires_at: "", max_uses: "", is_active: true });
    v.clearErrors();
    fetchCoupons();
  };

  const toggleActive = async (coupon: Coupon) => {
    await adminCall("update_coupon", { coupon_id: coupon.id, is_active: !coupon.is_active });
    toast.success(coupon.is_active ? "Coupon deactivated" : "Coupon activated");
    fetchCoupons();
  };

  const deleteCoupon = async (id: string) => {
    await adminCall("delete_coupon", { coupon_id: id });
    toast.success("Coupon deleted");
    fetchCoupons();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Coupons</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Create Coupon</Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>Create Coupon</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400">Coupon Code</label>
                <Input
                  value={form.code}
                  onChange={(e) => { setForm({ ...form, code: e.target.value }); v.clearField("code"); }}
                  error={!!v.getError("code")}
                  placeholder="e.g. SAVE20"
                  className="uppercase font-mono bg-slate-700 border-slate-600"
                />
                {v.getError("code") && <p className="text-xs text-destructive mt-1">{v.getError("code")}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-400">Discount Type</label>
                  <Select value={form.discount_type} onValueChange={(val) => { setForm({ ...form, discount_type: val }); v.clearField("discount_value"); }}>
                    <SelectTrigger className="bg-slate-700 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-slate-400">Discount Value</label>
                  <Input
                    type="number"
                    value={form.discount_value}
                    onChange={(e) => { setForm({ ...form, discount_value: e.target.value }); v.clearField("discount_value"); }}
                    error={!!v.getError("discount_value")}
                    placeholder={form.discount_type === "percentage" ? "e.g. 20" : "e.g. 100"}
                    className="bg-slate-700 border-slate-600"
                  />
                  {v.getError("discount_value") && <p className="text-xs text-destructive mt-1">{v.getError("discount_value")}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-400">Expiry Date</label>
                  <Input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400">Max Uses (0 = unlimited)</label>
                  <Input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) => { setForm({ ...form, max_uses: e.target.value }); v.clearField("max_uses"); }}
                    error={!!v.getError("max_uses")}
                    placeholder="0"
                    className="bg-slate-700 border-slate-600"
                  />
                  {v.getError("max_uses") && <p className="text-xs text-destructive mt-1">{v.getError("max_uses")}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={(val) => setForm({ ...form, is_active: val })} />
                <span className="text-sm">Active</span>
              </div>
              <Button onClick={handleCreate} className="w-full">Create Coupon</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading && coupons.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
        </div>
      ) : coupons.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="py-12 text-center">
            <Tag className="h-10 w-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">No coupons created yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {coupons.map((c) => (
            <Card key={c.id} className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Tag className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-white font-bold font-mono">{c.code}</code>
                      <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400">
                      {c.discount_type === "percentage" ? `${c.discount_value}% OFF` : `$${c.discount_value} OFF`}
                      {c.expires_at && ` · Expires ${c.expires_at}`}
                      {c.max_uses > 0 && ` · ${c.used_count}/${c.max_uses} used`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                  <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300" onClick={() => deleteCoupon(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCoupons;
