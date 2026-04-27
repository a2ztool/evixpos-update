import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useStorePlan } from "@/hooks/useStorePlan";
import DashboardLayout from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { productSchema } from "@/lib/validations";
import { useFormValidation } from "@/hooks/useFormValidation";
import { Plus, Trash2, Pencil, Search, Package, Upload, Download, CloudUpload, X, Layers, HelpCircle, LayoutGrid, List as ListIcon, CheckSquare, ArrowUpDown, AlertTriangle, CheckCircle2, XCircle, Boxes, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import UsageWarningBanner from "@/components/UsageWarningBanner";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import ProductImageField from "@/components/ProductImageField";

interface Product {
  id: string;
  name: string;
  price: number;
  base_cost: number;
  type: "digital" | "physical";
  stock: number;
  sku: string;
  category: string;
  description: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  duration_days: number;
  stock: number;
  is_subscription: boolean;
  sort_order: number;
}

interface Variation {
  id?: string;
  name: string;
  days: string;
  price: string;
  stock: string;
  is_subscription: boolean;
  _deleted?: boolean;
}

const emptyForm = {
  name: "", sku: "", category: "", image_url: "", description: "",
  base_cost: "0", price: "0", stock: "", type: "physical" as "digital" | "physical",
  is_subscription: false, is_active: true,
};

const Products = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { limits } = useSubscription();
  const [products, setProducts] = useState<Product[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const formValidation = useFormValidation(productSchema);

  // Track which products have variations (for badge)
  const [variationCounts, setVariationCounts] = useState<Record<string, number>>({});

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New: bulk select, view mode, sort, advanced filters, guide drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState<"newest" | "name_asc" | "name_desc" | "price_asc" | "price_desc" | "stock_asc" | "stock_desc">("newest");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all");
  const [guideOpen, setGuideOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<null | "delete" | "activate" | "deactivate">(null);

  const fetchProducts = async () => {
    if (!activeStore) return;
    const { data } = await supabase.from("products").select("*").eq("store_id", activeStore.id).order("created_at", { ascending: false });
    if (data) {
      setProducts(data as unknown as Product[]);
      // Fetch variation counts
      const prodIds = data.map((p: any) => p.id);
      if (prodIds.length > 0) {
        (supabase.from("product_variations" as any).select("product_id").in("product_id", prodIds) as any).then(({ data: vars }: any) => {
          const counts: Record<string, number> = {};
          (vars ?? []).forEach((v: any) => {
            counts[v.product_id] = (counts[v.product_id] || 0) + 1;
          });
          setVariationCounts(counts);
        });
      }
    }
  };

  useEffect(() => {
    if (user && activeStore) fetchProducts();
  }, [user, activeStore]);

  // Real-time sync
  useRealtimeSync(
    `products-rt-${activeStore?.id}`,
    [
      { table: "products", filter: `store_id=eq.${activeStore?.id}` },
    ],
    fetchProducts,
    !!activeStore?.id && !!user
  );

  const openAdd = async () => {
    // Check GLOBAL product count (across all stores)
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", effectiveUserId!);
    if ((count ?? 0) >= limits.maxProducts) {
      toast.error(`Your plan allows up to ${limits.maxProducts} products across all stores. Please upgrade.`);
      return;
    }
    setEditId(null);
    setForm(emptyForm);
    setVariations([]);
    setSheetOpen(true);
  };

  const openEdit = async (p: Product) => {
    setEditId(p.id);
    setForm({
      name: p.name, sku: p.sku || "", category: p.category || "",
      image_url: p.image_url || "", description: p.description || "",
      base_cost: String(p.base_cost), price: String(p.price),
      stock: String(p.stock), type: p.type,
      is_subscription: false, is_active: p.is_active,
    });
    // Load existing variations from DB
    const { data: dbVars } = await (supabase.from("product_variations" as any).select("*").eq("product_id", p.id).order("sort_order") as any);
    if (dbVars && dbVars.length > 0) {
      setVariations(dbVars.map((v: ProductVariation) => ({
        id: v.id,
        name: v.name,
        days: String(v.duration_days),
        price: String(v.price),
        stock: String(v.stock),
        is_subscription: v.is_subscription,
      })));
    } else {
      setVariations([]);
    }
    setSheetOpen(true);
  };

  const handleSubmit = async () => {
    const ok = formValidation.validateAll({
      name: form.name, sku: form.sku, category: form.category,
      image_url: form.image_url, description: form.description,
      base_cost: form.base_cost, price: form.price, stock: form.stock,
    });
    if (!ok) { toast.error("Please fix the errors below"); return; }
    setSaving(true);
    const payload = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      description: form.description,
      image_url: form.image_url,
      base_cost: parseFloat(form.base_cost) || 0,
      price: parseFloat(form.price) || 0,
      stock: form.stock ? parseInt(form.stock) : 0,
      type: form.type,
      is_active: form.is_active,
    };

    let productId = editId;

    if (editId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("products").insert({ ...payload, user_id: effectiveUserId!, store_id: activeStore?.id }).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      productId = data.id;
    }

    // Save variations to product_variations table
    if (productId) {
      // Delete existing variations for this product, then re-insert
      await (supabase.from("product_variations" as any).delete().eq("product_id", productId) as any);

      const activeVariations = variations.filter(v => !v._deleted && v.name.trim());
      if (activeVariations.length > 0) {
        const variationPayloads = activeVariations.map((v, i) => ({
          product_id: productId,
          name: v.name,
          price: parseFloat(v.price) || 0,
          duration_days: parseInt(v.days) || 30,
          stock: parseInt(v.stock) || 0,
          is_subscription: v.is_subscription,
          sort_order: i,
        }));
        await (supabase.from("product_variations" as any).insert(variationPayloads) as any);
      }
    }

    toast.success(editId ? "Product updated" : "Product added");
    setSaving(false);
    setSheetOpen(false);
    fetchProducts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Product deleted"); fetchProducts(); }
  };

  const addVariation = () => {
    setVariations([...variations, { name: "1 Month", days: "30", price: "0", stock: "0", is_subscription: true }]);
  };

  const removeVariation = (index: number) => {
    setVariations(variations.filter((_, i) => i !== index));
  };

  const updateVariation = (index: number, field: keyof Variation, value: any) => {
    setVariations(variations.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  // Margin calculation
  const margin = useMemo(() => {
    const cost = parseFloat(form.base_cost) || 0;
    const sell = parseFloat(form.price) || 0;
    if (sell === 0) return 0;
    return ((sell - cost) / sell) * 100;
  }, [form.base_cost, form.price]);

  // Import CSV
  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });
      return row;
    });
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Only CSV files are supported"); return; }
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target?.result as string);
      setImportData(parsed);
      if (parsed.length > 0) toast.success(`${parsed.length} products found`);
      else toast.error("No valid records found");
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const downloadTemplate = () => {
    const csv = "name,sku,category,description,base_cost,price,stock,type\nSample Product,SKU001,Electronics,A sample product,50,100,20,physical";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "products_import_template.csv";
    a.click();
  };

  const handleBulkImport = async () => {
    if (!user || importData.length === 0) return;
    setImporting(true);
    let success = 0, fail = 0;
    for (const row of importData) {
      const { error } = await supabase.from("products").insert({
        user_id: effectiveUserId!,
        name: row.name || "Unnamed",
        sku: row.sku || "",
        category: row.category || "",
        description: row.description || "",
        base_cost: parseFloat(row.base_cost) || 0,
        price: parseFloat(row.price) || 0,
        stock: parseInt(row.stock) || 0,
        type: (row.type === "digital" ? "digital" : "physical") as "digital" | "physical",
      });
      if (error) fail++; else success++;
    }
    if (success) toast.success(`${success} products imported!`);
    if (fail) toast.error(`${fail} products failed`);
    setImportOpen(false); setImportFile(null); setImportData([]);
    setImporting(false);
    fetchProducts();
  };

  const filtered = useMemo(() => {
    const list = products.filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "active" && !p.is_active) return false;
        if (statusFilter === "inactive" && p.is_active) return false;
      }
      if (categoryFilter !== "all" && (p.category || "") !== categoryFilter) return false;
      if (stockFilter !== "all" && p.type !== "digital") {
        if (stockFilter === "out" && p.stock > 0) return false;
        if (stockFilter === "low" && (p.stock <= 0 || p.stock > 5)) return false;
        if (stockFilter === "in" && p.stock <= 0) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.sku || "").toLowerCase().includes(q) && !(p.category || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "price_asc": return Number(a.price) - Number(b.price);
        case "price_desc": return Number(b.price) - Number(a.price);
        case "stock_asc": return a.stock - b.stock;
        case "stock_desc": return b.stock - a.stock;
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [products, typeFilter, statusFilter, categoryFilter, stockFilter, search, sortBy]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.is_active).length;
    const lowStock = products.filter((p) => p.type !== "digital" && p.stock > 0 && p.stock <= 5).length;
    const outOfStock = products.filter((p) => p.type !== "digital" && p.stock <= 0).length;
    return { total, active, lowStock, outOfStock };
  }, [products]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const runBulk = async (action: "delete" | "activate" | "deactivate") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === "delete") {
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) toast.error(error.message);
      else toast.success(`${ids.length} products deleted`);
    } else {
      const { error } = await supabase.from("products").update({ is_active: action === "activate" }).in("id", ids);
      if (error) toast.error(error.message);
      else toast.success(`${ids.length} products ${action === "activate" ? "activated" : "deactivated"}`);
    }
    clearSelection();
    setBulkConfirm(null);
    fetchProducts();
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <DashboardLayout>
      <UsageWarningBanner type="products" />

      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-3 sm:p-6 mb-3 sm:mb-6">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 flex-shrink-0">
              <Package className="h-4 w-4 sm:h-6 sm:w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-2xl font-bold tracking-tight truncate">{t.products}</h1>
              <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 truncate">
                {stats.total} item{stats.total !== 1 ? "s" : ""} · {stats.active} active · {stats.outOfStock} out of stock
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="gap-1.5 h-8 sm:h-9 px-2 sm:px-3 hidden sm:inline-flex"
            >
              <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden md:inline">{t.import}</span>
            </Button>
            <Button size="sm" className="gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{t.addProduct}</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setGuideOpen(true)}
              className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
              aria-label="Open guide"
            >
              <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-4 mb-3 sm:mb-6">
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 text-primary border-primary/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <Boxes className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Total</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.total}</p>
        </div>
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-success/10 to-success/5 text-success border-success/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Active</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.active}</p>
        </div>
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-warning/10 to-warning/5 text-warning border-warning/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Low</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.lowStock}</p>
        </div>
        <div className="relative rounded-lg sm:rounded-2xl border bg-gradient-to-br from-destructive/10 to-destructive/5 text-destructive border-destructive/20 p-2 sm:p-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1.5">
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-background/80 flex items-center justify-center flex-shrink-0">
              <XCircle className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
            </div>
            <span className="text-[8px] sm:text-xs font-medium uppercase tracking-wider opacity-80 truncate">Out</span>
          </div>
          <p className="text-sm sm:text-2xl font-bold tracking-tight truncate">{stats.outOfStock}</p>
        </div>
      </div>

      {/* Toolbar: Search + Filters + View toggle */}
      <div className="premium-card p-2 sm:p-2.5 mb-3 sm:mb-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2 sm:flex-wrap">
        <div className="relative sm:flex-1 sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.searchProducts}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 border-0 bg-transparent shadow-none focus-visible:ring-1"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-1 px-1 pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 text-xs w-[110px] shrink-0"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-[95px] shrink-0"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="physical">Physical</SelectItem>
              <SelectItem value="digital">Digital</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
            <SelectTrigger className="h-8 text-xs w-[105px] shrink-0"><SelectValue placeholder="Stock" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="in">In Stock</SelectItem>
              <SelectItem value="low">Low (≤5)</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-[105px] shrink-0"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-8 text-xs w-[135px] shrink-0">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue placeholder={t.sort} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              <SelectItem value="price_asc">Price (low→high)</SelectItem>
              <SelectItem value="price_desc">Price (high→low)</SelectItem>
              <SelectItem value="stock_asc">Stock (low→high)</SelectItem>
              <SelectItem value="stock_desc">Stock (high→low)</SelectItem>
            </SelectContent>
          </Select>
          <div className="hidden md:flex bg-muted/50 p-0.5 rounded-md border shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="List view"
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="premium-card p-2.5 mb-4 flex items-center justify-between flex-wrap gap-2 border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selectedIds.size} selected</span>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 text-xs">Clear</Button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setBulkConfirm("activate")}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setBulkConfirm("deactivate")}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Deactivate
            </Button>
            <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setBulkConfirm("delete")}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* Product List or Empty State */}
      {filtered.length === 0 ? (
        <div className="premium-card flex flex-col items-center justify-center py-16 sm:py-20">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">{products.length === 0 ? t.noProductsYet : t.noProductsMatch}</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center px-4">
            {products.length === 0 ? "Add your first product with pricing and variations." : "Try adjusting your search or filters."}
          </p>
          {products.length === 0 && (
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* GRID VIEW (desktop optional) */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filtered.map((p) => {
                const isSel = selectedIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`premium-card p-3 sm:p-4 group relative transition-all hover:shadow-md ${isSel ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity data-[checked=true]:opacity-100" data-checked={isSel}>
                      <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(p.id)} className="h-5 w-5 rounded-full border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary [&_svg]:h-3 [&_svg]:w-3" />
                    </div>
                    <div className="aspect-square w-full rounded-lg bg-muted overflow-hidden mb-3 relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-muted-foreground/40" /></div>
                      )}
                      {(variationCounts[p.id] || 0) > 0 && (
                        <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] gap-0.5">
                          <Layers className="h-2.5 w-2.5" /> {variationCounts[p.id]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm truncate flex-1">{p.name}</p>
                      <Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">{p.is_active ? "Active" : "Off"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-2">{p.category || "Uncategorized"} · {p.sku || "No SKU"}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm tabular-nums">৳{Number(p.price).toFixed(0)}</span>
                      {p.type === "digital" ? (
                        <Badge variant="secondary" className="text-[10px]">∞</Badge>
                      ) : (
                        <span className={`text-xs font-medium ${p.stock <= 0 ? "text-destructive" : p.stock <= 5 ? "text-amber-600" : "text-muted-foreground"}`}>
                          Stock: {p.stock}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => openEdit(p)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* Mobile Card View (list mode) */}
              <div className="md:hidden space-y-3">
                {filtered.map((p) => {
                  const isSel = selectedIds.has(p.id);
                  return (
                    <div key={p.id} className={`mobile-card transition-all ${isSel ? "ring-2 ring-primary" : ""}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(p.id)} className="mt-1 h-5 w-5 rounded-full border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary [&_svg]:h-3 [&_svg]:w-3" />
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-semibold text-sm truncate">{p.name}</p>
                            {(variationCounts[p.id] || 0) > 0 && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5 flex-shrink-0">
                                <Layers className="h-2.5 w-2.5" /> {variationCounts[p.id]}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="capitalize">{p.type}</span>
                            {p.category && <><span>·</span><span>{p.category}</span></>}
                            {p.sku && <><span>·</span><span className="truncate">{p.sku}</span></>}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-sm">৳{Number(p.price).toFixed(0)}</span>
                              <span className="text-xs text-muted-foreground">Cost: ৳{Number(p.base_cost).toFixed(0)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.type === "digital" ? (
                                <Badge variant="secondary" className="text-[10px]">∞</Badge>
                              ) : (
                                <span className={`text-xs font-medium ${p.stock <= 0 ? "text-destructive" : p.stock <= 5 ? "text-amber-600" : ""}`}>Stock: {p.stock}</span>
                              )}
                              <Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px]">
                                {p.is_active ? "Active" : "Off"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                        <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => openEdit(p)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="premium-card overflow-hidden hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-10">
                        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                      </TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Product</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">SKU</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Category</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-right">Cost</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-right">Price</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-right">Stock</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const isSel = selectedIds.has(p.id);
                      return (
                        <TableRow key={p.id} className={`transition-colors ${isSel ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                          <TableCell>
                            <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(p.id)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="h-9 w-9 rounded-lg object-cover ring-1 ring-border/50" loading="lazy" />
                              ) : (
                                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-sm">{p.name}</p>
                                  {(variationCounts[p.id] || 0) > 0 && (
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                                      <Layers className="h-2.5 w-2.5" /> {variationCounts[p.id]}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground capitalize">{p.type}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{p.sku || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {p.category ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border">
                                {p.category}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-right text-muted-foreground">৳{Number(p.base_cost).toFixed(2)}</TableCell>
                          <TableCell className="font-semibold text-sm tabular-nums text-right">৳{Number(p.price).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            {p.type === "digital" ? (
                              <Badge variant="secondary" className="text-xs">∞</Badge>
                            ) : (
                              <span className={`text-sm font-medium tabular-nums ${p.stock <= 0 ? "text-destructive" : p.stock <= 5 ? "text-amber-600" : ""}`}>{p.stock}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${p.is_active ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border"}`}>
                              <span className={`size-1.5 rounded-full ${p.is_active ? "bg-primary" : "bg-muted-foreground"}`} />
                              {p.is_active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)} className="h-8 w-8">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="h-8 w-8">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}



      {/* Help / Guide Drawer */}
      <Sheet open={guideOpen} onOpenChange={setGuideOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Products Guide
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5 text-sm">
            <div className="premium-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Quick Start</p>
              <ol className="space-y-2 list-decimal list-inside text-foreground/90">
                <li>Click <span className="font-medium">+ Add Product</span> (FAB on mobile) to create.</li>
                <li>Fill name, SKU, category, price & stock.</li>
                <li>Add <span className="font-medium">Variations</span> (1 month / 6 months / etc.) for subscriptions.</li>
                <li>Toggle <span className="font-medium">Active</span> to publish to POS & order forms.</li>
              </ol>
            </div>
            <div className="premium-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Bulk Actions</p>
              <p className="text-foreground/90">Tick the checkboxes to select multiple products. Then activate, deactivate, or delete them in one click.</p>
            </div>
            <div className="premium-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Filters & Sort</p>
              <ul className="space-y-1.5 text-foreground/90 list-disc list-inside">
                <li><span className="font-medium">Category / Type / Stock / Status</span> — narrow down the list.</li>
                <li><span className="font-medium">Sort</span> by newest, name, price, or stock.</li>
                <li>Toggle between <span className="font-medium">List</span> and <span className="font-medium">Grid</span> view (desktop).</li>
              </ul>
            </div>
            <div className="premium-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Import via CSV</p>
              <p className="text-foreground/90">Use the <span className="font-medium">Import</span> button to bulk add from CSV. Download the template first to see the required columns.</p>
            </div>
            <div className="premium-card p-4 bg-primary/5 border-primary/20">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Pro Tip</p>
              <p className="text-foreground/90">Subscription variations auto-create entries in the <span className="font-medium">Subscriptions</span> page when sold via POS.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bulk Confirm */}
      <AlertDialog open={!!bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirm === "delete" && `Delete ${selectedIds.size} products?`}
              {bulkConfirm === "activate" && `Activate ${selectedIds.size} products?`}
              {bulkConfirm === "deactivate" && `Deactivate ${selectedIds.size} products?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirm === "delete"
                ? "This action cannot be undone. The selected products will be permanently removed."
                : "You can change this later from the products list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkConfirm && runBulk(bulkConfirm)}
              className={bulkConfirm === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Add/Edit Product Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto pb-safe">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Product" : "Add Product"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 mt-6">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t.productName} *</Label>
              <Input
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); formValidation.clearField("name"); }}
                error={!!formValidation.getError("name")}
                placeholder="Product name"
              />
              {formValidation.getError("name") && (
                <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("name")}</p>
              )}
            </div>

            {/* SKU & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.sku}</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => { setForm({ ...form, sku: e.target.value }); formValidation.clearField("sku"); }}
                  error={!!formValidation.getError("sku")}
                  placeholder=""
                />
                {formValidation.getError("sku") && (
                  <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("sku")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t.category}</Label>
                <Input
                  value={form.category}
                  onChange={(e) => { setForm({ ...form, category: e.target.value }); formValidation.clearField("category"); }}
                  error={!!formValidation.getError("category")}
                  placeholder=""
                />
                {formValidation.getError("category") && (
                  <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("category")}</p>
                )}
              </div>
            </div>

            {/* Product Image — plan-gated */}
            <ProductImageField
              value={form.image_url}
              onChange={(url) => { setForm({ ...form, image_url: url }); formValidation.clearField("image_url"); }}
              storeId={activeStore?.id}
            />
            {formValidation.getError("image_url") && (
              <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("image_url")}</p>
            )}


            {/* Description */}
            <div className="space-y-1.5">
              <Label>{t.description}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => { setForm({ ...form, description: e.target.value }); formValidation.clearField("description"); }}
                aria-invalid={!!formValidation.getError("description")}
                className={formValidation.getError("description") ? "border-destructive focus-visible:ring-destructive" : ""}
                rows={3}
              />
              {formValidation.getError("description") && (
                <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("description")}</p>
              )}
            </div>

            {/* Base Cost & Base Selling */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.baseCost} (৳)</Label>
                <Input
                  type="number" min="0"
                  value={form.base_cost}
                  onChange={(e) => { setForm({ ...form, base_cost: e.target.value }); formValidation.clearField("base_cost"); }}
                  error={!!formValidation.getError("base_cost")}
                />
                {formValidation.getError("base_cost") && (
                  <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("base_cost")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t.baseSelling} (৳)</Label>
                <Input
                  type="number" min="0"
                  value={form.price}
                  onChange={(e) => { setForm({ ...form, price: e.target.value }); formValidation.clearField("price"); }}
                  error={!!formValidation.getError("price")}
                />
                {formValidation.getError("price") && (
                  <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("price")}</p>
                )}
              </div>
            </div>

            {/* Margin */}
            <div className="text-right text-sm">
              <span className="text-muted-foreground">Margin: </span>
              <span className={`font-medium ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>{margin.toFixed(1)}%</span>
            </div>

            {/* Stock Quantity */}
            <div className="space-y-1.5">
              <Label>{t.stockQuantity}</Label>
              <Input
                type="number" min="0"
                value={form.stock}
                onChange={(e) => { setForm({ ...form, stock: e.target.value }); formValidation.clearField("stock"); }}
                error={!!formValidation.getError("stock")}
                placeholder="Leave empty for unlimited"
              />
              {formValidation.getError("stock") ? (
                <p className="text-xs text-destructive animate-fade-in">{formValidation.getError("stock")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Leave empty for unlimited stock</p>
              )}
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t.active}</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>

            {/* Variations Section */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <Label className="text-base font-semibold">Variations</Label>
                  {variations.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{variations.length}</Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-primary gap-1" onClick={addVariation}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {variations.length === 0 && (
                <div className="text-center py-4 border border-dashed rounded-lg">
                  <Layers className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">No variations yet. Add variations like "1 Month", "6 Months", etc.</p>
                </div>
              )}

              {variations.map((v, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Input
                      value={v.name}
                      onChange={(e) => updateVariation(i, "name", e.target.value)}
                      className="w-40 h-8 text-sm font-medium"
                      placeholder="Variation name"
                    />
                    <Button variant="ghost" size="sm" className="text-destructive text-xs h-7 px-2" onClick={() => removeVariation(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Duration (days)</Label>
                      <Input type="number" value={v.days} onChange={(e) => updateVariation(i, "days", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price (৳)</Label>
                      <Input type="number" value={v.price} onChange={(e) => updateVariation(i, "price", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Stock</Label>
                      <Input type="number" value={v.stock} onChange={(e) => updateVariation(i, "stock", e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={v.is_subscription}
                        onCheckedChange={(checked) => updateVariation(i, "is_subscription", checked)}
                        className="scale-90"
                      />
                      <span className="text-xs text-muted-foreground">Subscription</span>
                    </div>
                    {v.is_subscription && (
                      <Badge variant="secondary" className="text-[9px]">Auto-creates subscription on order</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save Product"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) { setImportFile(null); setImportData([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Products</DialogTitle>
            <p className="text-sm text-muted-foreground">Upload a CSV file to bulk import products. Download the template to see the required format.</p>
          </DialogHeader>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
          >
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            <CloudUpload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-sm">Click or drag file to upload</p>
            <p className="text-xs text-muted-foreground mt-1">Only CSV files are supported</p>
            {importFile && <p className="text-xs text-primary mt-2 font-medium">{importFile.name} ({importData.length} records)</p>}
          </div>
          <Button variant="outline" className="gap-2 w-fit mx-auto" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Download Template
          </Button>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); setImportData([]); }}>Cancel</Button>
            <Button onClick={handleBulkImport} disabled={importData.length === 0 || importing}>
              {importing ? "Importing..." : `Import ${importData.length} Records`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Products;
