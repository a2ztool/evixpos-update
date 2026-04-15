import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Search, Truck, Phone, Mail, Edit2, Trash2, FileDown, MessageCircle,
  Receipt, Eye, DollarSign, Users, ShoppingBag, TrendingUp, Package, Filter,
  ChevronRight, BarChart3
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreQuery } from "@/hooks/useStoreQuery";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";

const Inventory = () => {
  const { storeId, userId, ready } = useStoreQuery();
  const { format } = useCurrency();
  const qc = useQueryClient();

  // --- State ---
  const [activeTab, setActiveTab] = useState("suppliers");
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Supplier form
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);
  const [sForm, setSForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });

  // Purchase form
  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const [pForm, setPForm] = useState({ supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "" });
  const [purchaseItems, setPurchaseItems] = useState<{ product_name: string; quantity: string; unit_cost: string }[]>([
    { product_name: "", quantity: "1", unit_cost: "" }
  ]);

  // Pay dialog
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<"supplier" | "purchase">("supplier");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  // Detail dialog
  const [detailDialog, setDetailDialog] = useState<any>(null);

  // --- Queries ---
  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*")
        .eq("store_id", storeId!).eq("is_active", true).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["purchases", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("*, suppliers(name)")
        .eq("store_id", storeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-list", storeId],
    enabled: ready,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, stock")
        .eq("store_id", storeId!).order("name");
      return data || [];
    },
  });

  // Realtime
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase
      .channel(`inventory-rt-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["suppliers", storeId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["purchases", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId, qc]);

  // --- Mutations ---
  const saveSupplier = useMutation({
    mutationFn: async () => {
      if (editSupplierId) {
        const { error } = await supabase.from("suppliers").update({
          name: sForm.name, phone: sForm.phone, email: sForm.email,
          address: sForm.address, notes: sForm.notes,
        }).eq("id", editSupplierId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          store_id: storeId!, user_id: userId!, name: sForm.name,
          phone: sForm.phone, email: sForm.email, address: sForm.address, notes: sForm.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setSupplierDialog(false);
      resetSupplierForm();
      toast.success(editSupplierId ? "Supplier updated" : "Supplier added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (selectedSupplier) setSelectedSupplier(null);
      toast.success("Supplier removed");
    },
  });

  const createPurchase = useMutation({
    mutationFn: async () => {
      // Calculate total from items
      const itemsWithCalc = purchaseItems.filter(i => i.product_name && Number(i.unit_cost) > 0);
      const calcTotal = itemsWithCalc.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);
      const total = Number(pForm.total_amount) || calcTotal;
      const paid = Number(pForm.paid_amount) || 0;
      const status = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";

      const { data: purchase, error } = await supabase.from("purchases").insert({
        store_id: storeId!, user_id: userId!,
        supplier_id: pForm.supplier_id || null,
        total_amount: total, paid_amount: paid,
        payment_status: status, payment_method: pForm.payment_method,
        notes: pForm.notes || itemsWithCalc.map(i => `${i.product_name} x${i.quantity}`).join(", "),
      }).select().single();
      if (error) throw error;

      // Update supplier due
      if (pForm.supplier_id && total > paid) {
        const due = total - paid;
        const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", pForm.supplier_id).single();
        if (sup) {
          await supabase.from("suppliers").update({ balance_due: Number(sup.balance_due) + due }).eq("id", pForm.supplier_id);
        }
      }

      // Auto-sync stock: increase product quantities
      for (const item of itemsWithCalc) {
        const matchedProduct = products.find((p: any) => p.name.toLowerCase() === item.product_name.toLowerCase());
        if (matchedProduct) {
          const newQty = Number(matchedProduct.stock || 0) + Number(item.quantity);
          await supabase.from("products").update({ stock: newQty }).eq("id", matchedProduct.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["products-list"] });
      setPurchaseDialog(false);
      resetPurchaseForm();
      toast.success("Purchase recorded & stock updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = Number(payAmount);
      if (amount <= 0) throw new Error("Invalid amount");

      if (payTarget === "supplier") {
        const newDue = Math.max(0, Number(payDialog.balance_due) - amount);
        await supabase.from("suppliers").update({ balance_due: newDue }).eq("id", payDialog.id);
        await supabase.from("purchases").insert({
          store_id: storeId!, user_id: userId!,
          supplier_id: payDialog.id, total_amount: 0, paid_amount: amount,
          payment_status: "paid", payment_method: payMethod,
          notes: `Due payment to ${payDialog.name}`,
        });
      } else {
        const due = Number(payDialog.total_amount) - Number(payDialog.paid_amount);
        const newPaid = Number(payDialog.paid_amount) + Math.min(amount, due);
        const newStatus = newPaid >= Number(payDialog.total_amount) ? "paid" : "partial";
        await supabase.from("purchases").update({ paid_amount: newPaid, payment_status: newStatus, payment_method: payMethod }).eq("id", payDialog.id);
        if (payDialog.supplier_id) {
          const { data: sup } = await supabase.from("suppliers").select("balance_due").eq("id", payDialog.supplier_id).single();
          if (sup) {
            await supabase.from("suppliers").update({ balance_due: Math.max(0, Number(sup.balance_due) - Math.min(amount, due)) }).eq("id", payDialog.supplier_id);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setPayDialog(null);
      setPayAmount("");
      toast.success("Payment recorded!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // --- Helpers ---
  const resetSupplierForm = () => { setSForm({ name: "", phone: "", email: "", address: "", notes: "" }); setEditSupplierId(null); };
  const resetPurchaseForm = () => {
    setPForm({ supplier_id: "", total_amount: "", paid_amount: "", payment_method: "cash", notes: "" });
    setPurchaseItems([{ product_name: "", quantity: "1", unit_cost: "" }]);
  };

  const openEditSupplier = (s: any) => {
    setSForm({ name: s.name, phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "" });
    setEditSupplierId(s.id);
    setSupplierDialog(true);
  };

  const addPurchaseItem = () => setPurchaseItems(prev => [...prev, { product_name: "", quantity: "1", unit_cost: "" }]);
  const removePurchaseItem = (idx: number) => setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  const updatePurchaseItem = (idx: number, field: string, value: string) => {
    setPurchaseItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // Auto-calc total from items
  const itemsTotal = useMemo(() =>
    purchaseItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0),
    [purchaseItems]
  );

  useEffect(() => {
    if (itemsTotal > 0) setPForm(p => ({ ...p, total_amount: String(itemsTotal) }));
  }, [itemsTotal]);

  // --- Filtered data ---
  const filteredSuppliers = suppliers.filter((s: any) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || s.phone?.includes(supplierSearch)
  );

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p: any) => {
      const matchSearch = p.suppliers?.name?.toLowerCase().includes(purchaseSearch.toLowerCase()) || p.notes?.toLowerCase().includes(purchaseSearch.toLowerCase());
      const matchStatus = statusFilter === "all" || p.payment_status === statusFilter;
      const matchSupplier = !selectedSupplier || p.supplier_id === selectedSupplier.id;
      return matchSearch && matchStatus && matchSupplier;
    });
  }, [purchases, purchaseSearch, statusFilter, selectedSupplier]);

  // --- Analytics ---
  const totalDue = suppliers.reduce((s: number, sup: any) => s + Number(sup.balance_due || 0), 0);
  const totalPurchases = purchases.reduce((s: number, p: any) => s + Number(p.total_amount), 0);
  const totalPaid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount), 0);
  const topSuppliers = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    purchases.forEach((p: any) => {
      if (p.supplier_id && p.suppliers?.name) {
        if (!map[p.supplier_id]) map[p.supplier_id] = { name: p.suppliers.name, total: 0 };
        map[p.supplier_id].total += Number(p.total_amount);
      }
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [purchases]);

  const exportCSV = () => {
    const header = "Date,Supplier,Total,Paid,Due,Status,Method,Notes\n";
    const rows = filteredPurchases.map((p: any) =>
      `"${formatDate(new Date(p.purchase_date), "dd MMM yyyy")}","${p.suppliers?.name || ""}",${p.total_amount},${p.paid_amount},${Math.max(0, p.total_amount - p.paid_amount)},"${p.payment_status}","${p.payment_method}","${p.notes || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "inventory-purchases.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="hidden sm:block">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> Inventory Management
            </h1>
            <p className="text-xs text-muted-foreground">Suppliers, purchases & stock sync</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-3.5 w-3.5 mr-1" /> Export</Button>
            <Button size="sm" onClick={() => { resetSupplierForm(); setSupplierDialog(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Supplier
            </Button>
            <Button size="sm" onClick={() => { resetPurchaseForm(); setPurchaseDialog(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Purchase
            </Button>
          </div>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="border-border/50"><CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Suppliers</p><p className="text-lg font-bold">{suppliers.length}</p></div>
          </CardContent></Card>
          <Card className="border-border/50"><CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><ShoppingBag className="h-4 w-4 text-blue-500" /></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Total Purchase</p><p className="text-lg font-bold">{format(totalPurchases)}</p></div>
          </CardContent></Card>
          <Card className="border-border/50"><CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-green-500" /></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Total Paid</p><p className="text-lg font-bold text-green-600">{format(totalPaid)}</p></div>
          </CardContent></Card>
          <Card className="border-border/50"><CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center"><DollarSign className="h-4 w-4 text-destructive" /></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Total Due</p><p className="text-lg font-bold text-destructive">{format(totalDue)}</p></div>
          </CardContent></Card>
          <Card className="border-border/50 hidden lg:block"><CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><BarChart3 className="h-4 w-4 text-amber-500" /></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Top Supplier</p><p className="text-sm font-bold truncate">{topSuppliers[0]?.name || "—"}</p></div>
          </CardContent></Card>
        </div>

        {/* Main Split Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Suppliers List */}
          <Card className="lg:col-span-4 border-border/50">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-primary" /> Suppliers
                  <Badge variant="secondary" className="text-[10px] ml-1">{suppliers.length}</Badge>
                </CardTitle>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} placeholder="Search..." className="pl-8 h-8 text-xs" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)] min-h-[300px]">
                <div className="space-y-0.5 p-2">
                  {/* All suppliers button */}
                  <button
                    onClick={() => setSelectedSupplier(null)}
                    className={`w-full text-left rounded-lg p-2.5 transition-all text-xs ${!selectedSupplier ? "bg-primary/10 border border-primary/20" : "hover:bg-accent"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">All Suppliers</span>
                      <Badge variant="outline" className="text-[10px]">{purchases.length} orders</Badge>
                    </div>
                  </button>

                  {loadingSuppliers ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">Loading...</p>
                  ) : filteredSuppliers.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">No suppliers</p>
                  ) : filteredSuppliers.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSupplier(s)}
                      className={`w-full text-left rounded-lg p-2.5 transition-all group ${
                        selectedSupplier?.id === s.id ? "bg-primary/10 border border-primary/20" : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Truck className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium truncate">{s.name}</p>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            {s.phone && <p className="text-[10px] text-muted-foreground">{s.phone}</p>}
                            <Badge variant={Number(s.balance_due) > 0 ? "destructive" : "secondary"} className="text-[10px] h-4">
                              {format(Number(s.balance_due || 0))}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {/* Quick actions on hover */}
                      <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); openEditSupplier(s); }}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        {Number(s.balance_due) > 0 && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); setPayTarget("supplier"); setPayDialog(s); setPayAmount(""); }}>
                            <Receipt className="h-3 w-3" /> Pay
                          </Button>
                        )}
                        {s.phone && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => {
                            e.stopPropagation();
                            const phone = s.phone?.replace(/[^0-9]/g, "") || "";
                            const text = `Hello ${s.name}, your outstanding balance is ${format(Number(s.balance_due))}. Please confirm the payment schedule.`;
                            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
                          }}>
                            <MessageCircle className="h-3 w-3 text-green-600" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={(e) => { e.stopPropagation(); deleteSupplier.mutate(s.id); }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right: Purchases */}
          <div className="lg:col-span-8 space-y-3">
            {/* Selected supplier info banner */}
            {selectedSupplier && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{selectedSupplier.name}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {selectedSupplier.phone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{selectedSupplier.phone}</span>}
                        {selectedSupplier.email && <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" />{selectedSupplier.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={Number(selectedSupplier.balance_due) > 0 ? "destructive" : "default"} className="text-xs">
                      Due: {format(Number(selectedSupplier.balance_due || 0))}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedSupplier(null)}>✕</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={purchaseSearch} onChange={e => setPurchaseSearch(e.target.value)} placeholder="Search purchases..." className="pl-8 h-8 text-xs" />
              </div>
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs h-6 px-2">All</TabsTrigger>
                  <TabsTrigger value="paid" className="text-xs h-6 px-2">Paid</TabsTrigger>
                  <TabsTrigger value="partial" className="text-xs h-6 px-2">Partial</TabsTrigger>
                  <TabsTrigger value="unpaid" className="text-xs h-6 px-2">Unpaid</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Purchases Table */}
            <Card className="border-border/50">
              <CardContent className="p-0">
                {/* Mobile */}
                <div className="md:hidden space-y-2 p-3">
                  {loadingPurchases ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">Loading...</p>
                  ) : filteredPurchases.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground">No purchases found</p>
                  ) : filteredPurchases.map((p: any) => {
                    const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                    return (
                      <div key={p.id} className="border rounded-lg p-2.5 space-y-1.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-xs">{p.suppliers?.name || "Unknown"}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</p>
                          </div>
                          <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"} className="text-[10px]">
                            {p.payment_status}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Total: <strong>{format(Number(p.total_amount))}</strong></span>
                          <span>Paid: <strong className="text-green-600">{format(Number(p.paid_amount))}</strong></span>
                          {due > 0 && <span>Due: <strong className="text-destructive">{format(due)}</strong></span>}
                        </div>
                        {due > 0 && (
                          <Button size="sm" variant="outline" className="w-full h-6 text-[10px]" onClick={() => { setPayTarget("purchase"); setPayDialog(p); setPayAmount(""); }}>
                            <Receipt className="h-3 w-3 mr-1" /> Pay ({format(due)})
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Paid</TableHead>
                        <TableHead className="text-xs">Due</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingPurchases ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">Loading...</TableCell></TableRow>
                      ) : filteredPurchases.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">No purchases found</TableCell></TableRow>
                      ) : filteredPurchases.map((p: any) => {
                        const due = Math.max(0, Number(p.total_amount) - Number(p.paid_amount));
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs">{formatDate(new Date(p.purchase_date), "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-xs font-medium">{p.suppliers?.name || "—"}</TableCell>
                            <TableCell className="text-xs">{format(Number(p.total_amount))}</TableCell>
                            <TableCell className="text-xs text-green-600">{format(Number(p.paid_amount))}</TableCell>
                            <TableCell className="text-xs">{due > 0 ? <span className="text-destructive font-medium">{format(due)}</span> : "—"}</TableCell>
                            <TableCell>
                              <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "destructive"} className="text-[10px]">
                                {p.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              {due > 0 && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPayTarget("purchase"); setPayDialog(p); setPayAmount(""); }}>
                                  <Receipt className="h-3 w-3 mr-1" /> Pay
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailDialog(p)}><Eye className="h-3 w-3" /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ─── Supplier Dialog ─── */}
      <Dialog open={supplierDialog} onOpenChange={(v) => { setSupplierDialog(v); if (!v) resetSupplierForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editSupplierId ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name *</Label><Input value={sForm.name} onChange={e => setSForm(p => ({ ...p, name: e.target.value }))} placeholder="Supplier name" className="h-8 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Phone</Label><Input value={sForm.phone} onChange={e => setSForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Email</Label><Input value={sForm.email} onChange={e => setSForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="h-8 text-sm" /></div>
            </div>
            <div><Label className="text-xs">Address</Label><Input value={sForm.address} onChange={e => setSForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Notes</Label><Textarea value={sForm.notes} onChange={e => setSForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} className="text-sm" /></div>
            <Button onClick={() => saveSupplier.mutate()} disabled={!sForm.name || saveSupplier.isPending} className="w-full h-8 text-sm">
              {saveSupplier.isPending ? "Saving..." : editSupplierId ? "Update" : "Add Supplier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Purchase Dialog ─── */}
      <Dialog open={purchaseDialog} onOpenChange={(v) => { setPurchaseDialog(v); if (!v) resetPurchaseForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={pForm.supplier_id} onValueChange={v => setPForm(p => ({ ...p, supplier_id: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Multi-item purchase */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Items</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={addPurchaseItem}><Plus className="h-3 w-3 mr-0.5" /> Add Item</Button>
              </div>
              {purchaseItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-5">
                    {idx === 0 && <Label className="text-[10px]">Product</Label>}
                    <Input value={item.product_name} onChange={e => updatePurchaseItem(idx, "product_name", e.target.value)}
                      placeholder="Product name" className="h-7 text-xs" list="product-suggestions" />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-[10px]">Qty</Label>}
                    <Input type="number" value={item.quantity} onChange={e => updatePurchaseItem(idx, "quantity", e.target.value)}
                      className="h-7 text-xs" />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-[10px]">Unit Cost</Label>}
                    <Input type="number" value={item.unit_cost} onChange={e => updatePurchaseItem(idx, "unit_cost", e.target.value)}
                      placeholder="Cost" className="h-7 text-xs" />
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-[10px] font-medium">{format(Number(item.quantity || 0) * Number(item.unit_cost || 0))}</span>
                    {purchaseItems.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removePurchaseItem(idx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <datalist id="product-suggestions">
                {products.map((p: any) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Total Amount *</Label><Input type="number" value={pForm.total_amount} onChange={e => setPForm(p => ({ ...p, total_amount: e.target.value }))} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Paid Amount</Label><Input type="number" value={pForm.paid_amount} onChange={e => setPForm(p => ({ ...p, paid_amount: e.target.value }))} className="h-8 text-sm" /></div>
            </div>
            {pForm.total_amount && (
              <div className="rounded-lg bg-muted/50 p-2 text-xs">
                Due: <span className="font-bold text-destructive">{format(Math.max(0, Number(pForm.total_amount) - Number(pForm.paid_amount)))}</span>
              </div>
            )}
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={pForm.payment_method} onValueChange={v => setPForm(p => ({ ...p, payment_method: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Notes</Label><Input value={pForm.notes} onChange={e => setPForm(p => ({ ...p, notes: e.target.value }))} placeholder="Purchase description" className="h-8 text-sm" /></div>
            <Button onClick={() => createPurchase.mutate()} disabled={!pForm.total_amount || createPurchase.isPending} className="w-full h-8 text-sm">
              {createPurchase.isPending ? "Saving..." : "Record Purchase"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Pay Dialog ─── */}
      <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment — {payTarget === "supplier" ? payDialog?.name : payDialog?.suppliers?.name || "Unknown"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
              {payTarget === "supplier" ? (
                <div className="flex justify-between text-xs"><span>Outstanding Due</span><span className="font-bold text-destructive">{format(Number(payDialog?.balance_due || 0))}</span></div>
              ) : (
                <>
                  <div className="flex justify-between text-xs"><span>Total</span><span className="font-bold">{format(Number(payDialog?.total_amount || 0))}</span></div>
                  <div className="flex justify-between text-xs"><span>Already Paid</span><span className="text-green-600">{format(Number(payDialog?.paid_amount || 0))}</span></div>
                  <div className="flex justify-between text-xs"><span>Remaining</span><span className="font-bold text-destructive">{format(Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0)))}</span></div>
                </>
              )}
            </div>
            <div><Label className="text-xs">Amount</Label><Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" className="h-8 text-sm" /></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                const max = payTarget === "supplier" ? Number(payDialog?.balance_due || 0) : Math.max(0, Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0));
                setPayAmount(String(max));
              }}>Full Amount</Button>
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => payMutation.mutate()} disabled={!payAmount || payMutation.isPending} className="w-full h-8 text-sm">
              {payMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={!!detailDialog} onOpenChange={v => { if (!v) setDetailDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {detailDialog && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{detailDialog.suppliers?.name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(new Date(detailDialog.purchase_date), "dd MMM yyyy")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{format(Number(detailDialog.total_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-green-600">{format(Number(detailDialog.paid_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className="text-destructive">{format(Math.max(0, Number(detailDialog.total_amount) - Number(detailDialog.paid_amount)))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={detailDialog.payment_status === "paid" ? "default" : "destructive"} className="text-[10px]">{detailDialog.payment_status}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{detailDialog.payment_method}</span></div>
              {detailDialog.notes && <div><span className="text-muted-foreground">Notes: </span>{detailDialog.notes}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Inventory;
