import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { validateWithToast, customerSchema } from "@/lib/validations";
import { Plus, Trash2, Pencil, Eye, Search, Upload, Users, Phone, CloudUpload, FileDown, Dna, Star, CreditCard, ShoppingBag } from "lucide-react";
import UsageWarningBanner from "@/components/UsageWarningBanner";
import CustomerDNAProfile from "@/components/CustomerDNAProfile";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  tags: string;
  notes: string;
  created_at: string;
}

interface CustomerEnriched extends Customer {
  total_due: number;
  total_points: number;
  order_count: number;
}

interface OrderHistory {
  id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
}

const emptyForm = { name: "", phone: "", email: "", address: "", tags: "", notes: "" };

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const Customers = () => {
  const { user } = useAuth();
  const { activeStore } = useStore();
  const { effectiveUserId } = useStaff();
  const { limits } = useSubscription();
  const { format } = useCurrency();
  const [customers, setCustomers] = useState<CustomerEnriched[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState("");
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [dnaOpen, setDnaOpen] = useState(false);
  const [dnaCustomer, setDnaCustomer] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCustomers = async () => {
    if (!activeStore) return;
    const { data } = await supabase.from("customers").select("*").eq("store_id", activeStore.id).order("created_at", { ascending: false });
    if (!data) return;

    // Fetch enrichment data in parallel
    const customerIds = data.map(c => c.id);
    
    const [creditsRes, loyaltyRes, ordersRes] = await Promise.all([
      supabase.from("customer_credits").select("customer_id, total_due").eq("store_id", activeStore.id).in("customer_id", customerIds),
      supabase.from("loyalty_points").select("customer_id, total_points, redeemed_points").eq("store_id", activeStore.id).in("customer_id", customerIds),
      supabase.from("orders").select("customer_id").eq("store_id", activeStore.id).in("customer_id", customerIds),
    ]);

    const dueMap = new Map<string, number>();
    (creditsRes.data || []).forEach((c: any) => dueMap.set(c.customer_id, Number(c.total_due)));
    
    const pointsMap = new Map<string, number>();
    (loyaltyRes.data || []).forEach((l: any) => pointsMap.set(l.customer_id, Number(l.total_points) - Number(l.redeemed_points)));
    
    const orderCountMap = new Map<string, number>();
    (ordersRes.data || []).forEach((o: any) => orderCountMap.set(o.customer_id, (orderCountMap.get(o.customer_id) || 0) + 1));

    const enriched: CustomerEnriched[] = (data as Customer[]).map(c => ({
      ...c,
      total_due: dueMap.get(c.id) || 0,
      total_points: pointsMap.get(c.id) || 0,
      order_count: orderCountMap.get(c.id) || 0,
    }));
    setCustomers(enriched);
  };

  useEffect(() => {
    if (user && activeStore) fetchCustomers();
  }, [user, activeStore]);

  // Real-time sync
  useRealtimeSync(
    `customers-rt-${activeStore?.id}`,
    [
      { table: "customers", filter: `store_id=eq.${activeStore?.id}` },
      { table: "customer_credits", filter: `store_id=eq.${activeStore?.id}` },
      { table: "loyalty_points", filter: `store_id=eq.${activeStore?.id}` },
    ],
    fetchCustomers,
    !!activeStore?.id && !!user
  );

  const filtered = customers.filter((c) =>
    [c.name, c.phone, c.email, c.tags].some((f) => (f || "").toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = async () => {
    const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId!);
    if ((count ?? 0) >= limits.maxCustomers) {
      toast.error(`Your plan allows up to ${limits.maxCustomers} customers across all stores. Please upgrade.`);
      return;
    }
    setEditId(null);
    setForm(emptyForm);
    setSheetOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", tags: c.tags || "", notes: c.notes || "" });
    setSheetOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateWithToast(customerSchema, form, toast.error);
    if (!parsed) return;
    if (editId) {
      const { error } = await supabase.from("customers").update(form).eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Customer updated");
    } else {
      const { error } = await supabase.from("customers").insert({ ...form, user_id: effectiveUserId!, store_id: activeStore?.id });
      if (error) toast.error(error.message);
      else toast.success("Customer added");
    }
    setSheetOpen(false);
    fetchCustomers();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Customer deleted"); fetchCustomers(); }
  };

  const viewHistory = async (customer: Customer) => {
    setHistoryCustomer(customer.name);
    const { data } = await supabase.from("orders").select("id, total_amount, status, payment_status, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setOrders((data ?? []) as OrderHistory[]);
    setHistoryOpen(true);
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter(Boolean);
    if (lines.length < 2) { toast.error("CSV must have a header and at least one row"); return; }
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    });
    setImportRows(rows);
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => parseCSV(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv")) handleFileSelect(file);
    else toast.error("Only CSV files are supported");
  }, []);

  const handleImportSubmit = async () => {
    if (importRows.length === 0) return;
    const rows = importRows.map((row) => ({
      name: row["name"] || row["full name"] || "Unknown",
      email: row["email"] || "",
      phone: row["phone"] || "",
      address: row["address"] || "",
      tags: row["tags"] || "",
      notes: row["notes"] || "",
      user_id: effectiveUserId!,
    }));
    const { error } = await supabase.from("customers").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`${rows.length} customers imported`); fetchCustomers(); }
    setImportRows([]);
    setImportOpen(false);
  };

  const downloadTemplate = () => {
    const csv = "name,email,phone,address,tags,notes\nJohn Doe,john@example.com,+8801700000000,Dhaka,vip,Important customer";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "customers_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const header = "Name,Email,Phone,Tags,Total Due,Total Points,Order Count\n";
    const rows = customers.map(c => `"${c.name}","${c.email}","${c.phone}","${c.tags}",${c.total_due},${c.total_points},${c.order_count}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers_${activeStore?.name || "store"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const totalCustomers = customers.length;
  const totalDue = customers.reduce((s, c) => s + c.total_due, 0);
  const totalOrders = customers.reduce((s, c) => s + c.order_count, 0);

  return (
    <DashboardLayout>
      <UsageWarningBanner type="customers" />
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Customers</span>
          </div>
          <p className="text-xl font-bold mt-1">{totalCustomers}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-green-600" />
            <span className="text-xs text-muted-foreground">Total Orders</span>
          </div>
          <p className="text-xl font-bold mt-1">{totalOrders}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Total Due</span>
          </div>
          <p className="text-xl font-bold mt-1 text-destructive">{format(totalDue)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground">Avg Points</span>
          </div>
          <p className="text-xl font-bold mt-1">{totalCustomers > 0 ? Math.round(customers.reduce((s, c) => s + c.total_points, 0) / totalCustomers) : 0}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Customers</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="hidden sm:inline-flex">
            <FileDown className="mr-2 h-4 w-4" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setImportRows([]); setImportOpen(true); }} className="hidden sm:inline-flex">
            <Upload className="mr-2 h-4 w-4" />Import
          </Button>
          <Button size="sm" className="h-9" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /><span className="hidden sm:inline">Add Customer</span><span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border rounded-lg bg-card">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No customers yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Add your first customer to get started.</p>
          <Button onClick={openAdd}>Add Customer</Button>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filtered.map((c) => (
              <div key={c.id} className="mobile-card" onClick={() => openEdit(c)}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || c.phone || "No contact"}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); viewHistory(c); }} title="Order History">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setDnaCustomer(c); setDnaOpen(true); }} title="DNA Profile">
                      <Dna className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mt-2 text-[10px]">
                  {c.order_count > 0 && <Badge variant="secondary">{c.order_count} orders</Badge>}
                  {c.total_due > 0 && <Badge variant="destructive">{format(c.total_due)} due</Badge>}
                  {c.total_points > 0 && <Badge variant="outline" className="gap-0.5"><Star className="h-2.5 w-2.5" />{c.total_points} pts</Badge>}
                </div>
                {(c.tags || "").split(",").filter(Boolean).length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {(c.tags || "").split(",").filter(Boolean).map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{t.trim()}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="rounded-md border hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-center">Points</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.email}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{c.order_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.total_due > 0 ? <Badge variant="destructive">{format(c.total_due)}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.total_points > 0 ? (
                        <Badge variant="outline" className="gap-0.5"><Star className="h-3 w-3 text-yellow-500" />{c.total_points}</Badge>
                      ) : <span className="text-muted-foreground text-xs">0</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(c.tags || "").split(",").filter(Boolean).map((t, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => viewHistory(c)} title="Order History">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDnaCustomer(c); setDnaOpen(true); }} title="DNA Profile">
                        <Dna className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
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

      {/* Add/Edit Customer Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Customer" : "Add Customer"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Customer name" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number..." className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, reseller" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={3} />
            </div>
            <Button type="submit" className="w-full">{editId ? "Update Customer" : "Save Customer"}</Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Purchase History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Purchase History — {historyCustomer}</DialogTitle>
          </DialogHeader>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No orders found for this customer.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{format(Number(o.total_amount))}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[o.status] ?? ""}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{o.payment_status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Customers Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Customers</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file with customer data. Download the template to see the required format.
          </p>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleImportFile} />
            <CloudUpload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm">Click or drag file to this area to upload</p>
            <p className="text-xs text-muted-foreground mt-1">Only CSV files are supported</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}>
              <FileDown className="mr-2 h-4 w-4" />Download Template
            </Button>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImportSubmit} disabled={importRows.length === 0}>
              Import {importRows.length} Records
            </Button>
          </div>
          {importRows.length > 0 && (
            <p className="text-sm text-green-600 font-medium">{importRows.length} records ready to import</p>
          )}
        </DialogContent>
      </Dialog>

      {/* DNA Profile */}
      {dnaCustomer && (
        <CustomerDNAProfile open={dnaOpen} onOpenChange={setDnaOpen} customerId={dnaCustomer.id} customerName={dnaCustomer.name} storeId={activeStore?.id || ""} />
      )}
    </DashboardLayout>
  );
};

export default Customers;
