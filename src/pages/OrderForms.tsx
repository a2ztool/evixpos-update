import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus, FileText, Search, Trash2, Pencil, Link as LinkIcon, Copy, X,
  HelpCircle, ExternalLink, QrCode, Share2, LayoutGrid, List as ListIcon,
  Power, PowerOff, ShoppingBag, Sparkles, TrendingUp, Eye,
} from "lucide-react";
import { buildOrderFormUrl } from "@/lib/publicUrl";
import { orderFormSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";

interface OrderForm {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  fields: string[];
  selected_products: string[];
  take_payment: boolean;
  show_coupon: boolean;
  custom_fields: CustomField[];
  created_at: string;
}

interface CustomField {
  id: string;
  type: "text" | "number" | "textarea" | "select" | "radio" | "checkbox";
  label: string;
  required: boolean;
  options?: string[];
}

interface Product {
  id: string;
  name: string;
  price: number;
}

const generateSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const OrderForms = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const [forms, setForms] = useState<OrderForm[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [takePayment, setTakePayment] = useState(true);
  const [showCoupon, setShowCoupon] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const formValidation = useFormValidation(orderFormSchema);

  const fetchForms = async () => {
    if (!user || !activeStore) return;
    const { data } = await supabase
      .from("order_forms")
      .select("*")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    if (data) {
      const list = data.map((f: any) => ({
        ...f,
        fields: (f.fields as any) || [],
        selected_products: (f.selected_products as any) || [],
        custom_fields: (f.custom_fields as any) || [],
      })) as OrderForm[];
      setForms(list);

      // Fetch order counts per form (source = order_form, notes contains form name)
      const { data: ords } = await supabase
        .from("orders")
        .select("notes")
        .eq("user_id", user.id)
        .eq("store_id", activeStore.id)
        .eq("source", "order_form");
      const counts: Record<string, number> = {};
      (ords || []).forEach((o: any) => {
        const m = (o.notes || "").match(/Order Form:\s*([^|]+?)(\s\||$)/);
        const name = m?.[1]?.trim();
        if (name) counts[name] = (counts[name] || 0) + 1;
      });
      const byFormId: Record<string, number> = {};
      list.forEach((f) => { byFormId[f.id] = counts[f.name] || 0; });
      setOrderCounts(byFormId);
    }
  };

  const fetchProducts = async () => {
    if (!user || !activeStore) return;
    const { data } = await supabase
      .from("products")
      .select("id, name, price")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .eq("is_active", true)
      .order("name");
    if (data) setProducts(data);
  };

  useEffect(() => {
    fetchForms();
    fetchProducts();
  }, [user, activeStore]);

  const handleSave = async () => {
    if (!user || !activeStore) return;
    if (!formValidation.validateAll({ name: formName, slug: formSlug, description: formDesc })) {
      toast.error("Please fix the errors below");
      return;
    }

    const slug = formSlug || generateSlug(formName);

    const payload = {
      name: formName,
      description: formDesc,
      slug,
      selected_products: selectedProducts as any,
      take_payment: takePayment,
      show_coupon: showCoupon,
      custom_fields: customFields as any,
      status: "active",
    };

    if (editId) {
      const { error } = await supabase.from("order_forms").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); } else { toast.success("Form updated"); }
    } else {
      const { error } = await supabase.from("order_forms").insert({
        user_id: effectiveUserId!,
        store_id: activeStore.id,
        ...payload,
      });
      if (error) { toast.error(error.message); } else { toast.success("Order form created"); }
    }
    setSheetOpen(false);
    resetForm();
    fetchForms();
  };

  const resetForm = () => {
    setFormName("");
    setFormSlug("");
    setFormDesc("");
    setTakePayment(true);
    setShowCoupon(false);
    setSelectedProducts([]);
    setCustomFields([]);
    setEditId(null);
    formValidation.clearErrors();
  };

  const openEdit = (f: OrderForm) => {
    setEditId(f.id);
    setFormName(f.name);
    setFormSlug(f.slug);
    setFormDesc(f.description);
    setTakePayment(f.take_payment);
    setShowCoupon(f.show_coupon);
    setSelectedProducts(f.selected_products || []);
    setCustomFields(f.custom_fields || []);
    setSheetOpen(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("order_forms").delete().eq("id", id);
    toast.success("Form deleted");
    setDeleteId(null);
    fetchForms();
  };

  const toggleStatus = async (f: OrderForm) => {
    const next = f.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("order_forms").update({ status: next }).eq("id", f.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Form ${next === "active" ? "activated" : "deactivated"}`);
      fetchForms();
    }
  };

  const addCustomField = (type: CustomField["type"]) => {
    setCustomFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type,
        label: "",
        required: false,
        options: type === "select" || type === "radio" ? ["Option 1"] : undefined,
      },
    ]);
  };

  const updateCustomField = (id: string, updates: Partial<CustomField>) => {
    setCustomFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeCustomField = (id: string) => {
    setCustomFields((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((p) => p !== productId) : [...prev, productId]
    );
  };

  const filtered = useMemo(() => {
    return forms.filter((f) => {
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      return true;
    });
  }, [forms, search, statusFilter]);

  const stats = useMemo(() => ({
    total: forms.length,
    active: forms.filter((f) => f.status === "active").length,
    inactive: forms.filter((f) => f.status !== "active").length,
    orders: Object.values(orderCounts).reduce((a, b) => a + b, 0),
  }), [forms, orderCounts]);

  const formLink = (f: OrderForm) => buildOrderFormUrl(f.slug || f.id);

  const copyLink = (f: OrderForm) => {
    navigator.clipboard.writeText(formLink(f));
    toast.success("Link copied to clipboard");
  };

  const shareLink = async (f: OrderForm) => {
    const url = formLink(f);
    if (navigator.share) {
      try { await navigator.share({ title: f.name, url }); } catch {}
    } else {
      copyLink(f);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  // ---- Stat card ----
  const StatCard = ({ icon: Icon, label, value, tint = "primary" }: any) => (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm p-2.5 sm:p-3.5 shadow-sm">
      <div className={`absolute -top-6 -right-6 h-16 w-16 rounded-full bg-${tint}/10 blur-2xl`} />
      <div className="relative flex items-center gap-2.5">
        <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-${tint}/10 ring-1 ring-${tint}/20 flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-${tint}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium truncate">{label}</p>
          <p className="text-base sm:text-lg font-bold truncate">{value}</p>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      {/* HEADER — premium, mobile-first */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 sm:pb-5 mb-3 sm:mb-5 border-b border-border/60">
        <div className="hidden sm:flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Order Forms</h1>
            <p className="text-xs text-muted-foreground">Hosted checkout pages for your products</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGuideOpen(true)}>
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Guide</span>
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-initial gap-1.5"
            onClick={() => { resetForm(); setSheetOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            Create Form
          </Button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-5">
        <StatCard icon={FileText} label="Total Forms" value={stats.total} tint="primary" />
        <StatCard icon={Sparkles} label="Active" value={stats.active} tint="emerald-500" />
        <StatCard icon={PowerOff} label="Inactive" value={stats.inactive} tint="muted-foreground" />
        <StatCard icon={ShoppingBag} label="Orders Received" value={stats.orders} tint="primary" />
      </div>

      {/* TOOLBAR — glass */}
      <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 sm:p-2.5 mb-3 sm:mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search forms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 bg-background/60"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="h-9 w-[120px] flex-shrink-0 bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="hidden sm:flex items-center rounded-md border border-border bg-background/60 p-0.5">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon" className="h-8 w-8"
              onClick={() => setViewMode("list")}
            ><ListIcon className="h-4 w-4" /></Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon" className="h-8 w-8"
              onClick={() => setViewMode("grid")}
            ><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 backdrop-blur-sm flex flex-col items-center justify-center py-14 sm:py-20 px-4">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center mb-4">
            <LinkIcon className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-1">No order forms yet</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
            Create a hosted checkout link, share it on social or WhatsApp, and start collecting orders instantly.
          </p>
          <Button onClick={() => { resetForm(); setSheetOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Create your first form
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        // GRID
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((f) => (
            <div key={f.id} className="group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/40 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all">
              <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-primary/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{f.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">/f/{f.slug || f.id.slice(0, 8)}</p>
                  </div>
                  <Badge variant={f.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    {f.status === "active" ? "Live" : "Off"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3" />{(f.selected_products || []).length} items</span>
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{orderCounts[f.id] || 0} orders</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8" onClick={() => copyLink(f)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8" onClick={() => window.open(formLink(f), "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8" onClick={() => shareLink(f)}>
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8" onClick={() => openEdit(f)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((f) => (
              <div key={f.id} className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 space-y-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">/f/{f.slug || f.id.slice(0, 8)}</p>
                  </div>
                  <Badge variant={f.status === "active" ? "default" : "secondary"} className="text-[10px] flex-shrink-0">
                    {f.status === "active" ? "Live" : "Off"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{(f.selected_products || []).length} items · {orderCounts[f.id] || 0} orders</span>
                  <span>{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-8" onClick={() => copyLink(f)}>
                    <Copy className="h-3.5 w-3.5" /> Copy Link
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8" onClick={() => shareLink(f)}>
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8" onClick={() => openEdit(f)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Form Name</TableHead>
                  <TableHead>Public Link</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded truncate max-w-[200px]">/f/{f.slug || f.id.slice(0, 12)}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(f)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(formLink(f), "_blank")}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-sm">{(f.selected_products || []).length}</span></TableCell>
                    <TableCell><span className="text-sm font-medium">{orderCounts[f.id] || 0}</span></TableCell>
                    <TableCell>
                      <button onClick={() => toggleStatus(f)} className="inline-flex">
                        <Badge variant={f.status === "active" ? "default" : "secondary"} className="cursor-pointer">
                          {f.status === "active" ? "Live" : "Off"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => shareLink(f)} title="Share">
                        <Share2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(f.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this form?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the order form. The public link will stop working immediately. Existing orders will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GUIDE DRAWER */}
      <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" /> Order Forms Guide
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5 mt-6 text-sm">
            {[
              { n: 1, title: "Create a form", body: "Click Create Form, name it, and pick the products or services you want to sell." },
              { n: 2, title: "Customize fields", body: "Add custom fields like address, notes, size — anything you need from the customer." },
              { n: 3, title: "Choose payment", body: "Take Payment uses your configured gateways. Show Coupon mode lets buyers redeem a code instead." },
              { n: 4, title: "Share the link", body: "Copy the public /f/your-slug link and share on WhatsApp, Facebook, Instagram bio, or email." },
              { n: 5, title: "Track orders", body: "Orders received via this form appear in Orders with source = order_form, plus the Orders count here." },
            ].map((s) => (
              <div key={s.n} className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">{s.n}</div>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{s.body}</p>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              <p className="font-medium flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Pro tip</p>
              <p className="text-muted-foreground mt-1">Use a short, branded slug like <code>/f/special</code> for higher click-through rates.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* CREATE / EDIT SHEET */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Order Form" : "Create Order Form"}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Build a hosted checkout page and share the link with your customers.
            </p>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Name + Slug */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Form name *</Label>
                <Input
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    formValidation.clearField("name");
                    if (!editId) setFormSlug(generateSlug(e.target.value));
                  }}
                  placeholder="e.g. Summer Sale"
                  error={!!formValidation.getError("name")}
                />
                {formValidation.getError("name") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("name")}</p>}
              </div>
              <div className="space-y-2">
                <Label>Link / Slug</Label>
                <Input
                  value={formSlug}
                  onChange={(e) => { setFormSlug(generateSlug(e.target.value)); formValidation.clearField("slug"); }}
                  placeholder="auto-generated"
                  error={!!formValidation.getError("slug")}
                />
                {formValidation.getError("slug") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("slug")}</p>}
                <p className="text-[11px] text-muted-foreground truncate">{buildOrderFormUrl(formSlug || "your-slug")}</p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Form Information</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => { setFormDesc(e.target.value); formValidation.clearField("description"); }}
                placeholder="Write a short description shown to customers..."
                rows={3}
                className={formValidation.getError("description") ? "border-destructive" : ""}
              />
              {formValidation.getError("description") && <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("description")}</p>}
            </div>

            {/* Services toggles */}
            <div>
              <Label className="mb-3 block">Mode</Label>
              <RadioGroup value={takePayment ? "payment" : "coupon"} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="payment" id="take-payment" onClick={() => { setTakePayment(true); setShowCoupon(false); }} />
                  <Label htmlFor="take-payment" className="cursor-pointer">Take Payment</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="coupon" id="show-coupon" onClick={() => { setShowCoupon(true); setTakePayment(false); }} />
                  <Label htmlFor="show-coupon" className="cursor-pointer">Show Coupon</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Product selection */}
            <div className="space-y-2">
              <Label>Add Service or Product</Label>
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    Search and select an option...
                    <span className="text-xs text-muted-foreground">⌄</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search services..." value={productSearch} onValueChange={setProductSearch} />
                    <CommandList>
                      <CommandEmpty>No products found.</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map((p) => (
                          <CommandItem key={p.id} onSelect={() => { toggleProduct(p.id); setProductSearchOpen(false); }} className="flex flex-col items-start">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground">৳{p.price.toFixed(2)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {selectedProducts.length > 0 ? (
                <div className="space-y-1 mt-2">
                  {selectedProducts.map((pid) => {
                    const p = products.find((pr) => pr.id === pid);
                    if (!p) return null;
                    return (
                      <div key={pid} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5 text-sm">
                        <span>{p.name} — ৳{p.price.toFixed(2)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleProduct(pid)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No services selected. Customers won't be able to buy anything.
                </p>
              )}
            </div>

            {/* Custom Fields */}
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-base">Custom Form Fields</h4>
                <p className="text-xs text-muted-foreground">
                  Build your own form by adding extra fields like Text, Numbers, Radios, and Dropdowns.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["text", "number", "textarea", "select", "radio", "checkbox"] as const).map((type) => (
                  <Button key={type} variant="outline" size="sm" className="gap-1" onClick={() => addCustomField(type)}>
                    <Plus className="h-3.5 w-3.5" />
                    {type === "text" ? "Text" : type === "number" ? "Number" : type === "textarea" ? "Text Area" : type === "select" ? "Dropdown" : type === "radio" ? "Radio" : "Checkbox"}
                  </Button>
                ))}
              </div>

              {customFields.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No custom fields added yet.</p>
              ) : (
                <div className="space-y-3">
                  {customFields.map((cf) => (
                    <div key={cf.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs capitalize">{cf.type}</Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCustomField(cf.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <Input value={cf.label} onChange={(e) => updateCustomField(cf.id, { label: e.target.value })} placeholder="Field label..." />
                      <div className="flex items-center gap-2">
                        <Switch checked={cf.required} onCheckedChange={(v) => updateCustomField(cf.id, { required: v })} />
                        <span className="text-xs text-muted-foreground">Required</span>
                      </div>
                      {(cf.type === "select" || cf.type === "radio") && (
                        <div className="space-y-1">
                          {(cf.options || []).map((opt, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={opt}
                                onChange={(e) => {
                                  const newOpts = [...(cf.options || [])];
                                  newOpts[i] = e.target.value;
                                  updateCustomField(cf.id, { options: newOpts });
                                }}
                                placeholder={`Option ${i + 1}`}
                                className="text-sm"
                              />
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                const newOpts = (cf.options || []).filter((_, idx) => idx !== i);
                                updateCustomField(cf.id, { options: newOpts });
                              }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() =>
                            updateCustomField(cf.id, { options: [...(cf.options || []), ""] })
                          }>
                            <Plus className="h-3 w-3 mr-1" /> Add Option
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full h-11" onClick={handleSave}>
              {editId ? "Update Form" : "Create Form"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default OrderForms;
