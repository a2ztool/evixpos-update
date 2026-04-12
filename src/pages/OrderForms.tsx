import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
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
import { toast } from "sonner";
import { Plus, FileText, Search, Trash2, Pencil, Link as LinkIcon, Copy, X } from "lucide-react";

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
  const [forms, setForms] = useState<OrderForm[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  const fetchForms = async () => {
    if (!user || !activeStore) return;
    const { data } = await supabase
      .from("order_forms")
      .select("*")
      .eq("user_id", user.id)
      .eq("store_id", activeStore.id)
      .order("created_at", { ascending: false });
    if (data)
      setForms(
        data.map((f: any) => ({
          ...f,
          fields: (f.fields as any) || [],
          selected_products: (f.selected_products as any) || [],
          custom_fields: (f.custom_fields as any) || [],
        }))
      );
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
    if (!formName.trim()) {
      toast.error("Form name is required");
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
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Form updated");
      }
    } else {
      const { error } = await supabase.from("order_forms").insert({
        user_id: user.id,
        store_id: activeStore.id,
        ...payload,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Order form created");
      }
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
    fetchForms();
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

  const filtered = forms.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  const formLink = (f: OrderForm) => `${window.location.origin}/f/${f.slug || f.id}`;

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Order Forms</h1>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            resetForm();
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create Form</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="premium-card flex flex-col items-center justify-center py-16 sm:py-20">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <LinkIcon className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold mb-1">No order forms yet</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center px-4">
            Create customizable payment links to easily collect orders.
          </p>
          <Button
            onClick={() => {
              resetForm();
              setSheetOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Form
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3 pb-safe">
            {filtered.map((f) => (
              <div key={f.id} className="mobile-card space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      /f/{f.slug || f.id}
                    </p>
                  </div>
                  <Badge className="text-[10px] ml-2 flex-shrink-0">
                    {(f.selected_products || []).length} selected
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(formLink(f));
                      toast.success("Link copied!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Link
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(f)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive gap-1.5"
                    onClick={() => handleDelete(f.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block premium-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[180px]">/f/{f.slug || f.id.slice(0, 12)}...</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            navigator.clipboard.writeText(formLink(f));
                            toast.success("Link copied!");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{(f.selected_products || []).length} selected</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}>
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

      {/* CREATE / EDIT SHEET */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Order Form" : "Add Order Form"}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Create a hosted payment page link to share with your customers.
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
                    if (!editId) setFormSlug(generateSlug(e.target.value));
                  }}
                  placeholder="e.g. Get 1 Free"
                />
              </div>
              <div className="space-y-2">
                <Label>Link/Slug</Label>
                <div className="flex items-center">
                  <span className="text-xs text-muted-foreground mr-1 hidden sm:inline whitespace-nowrap">
                    {window.location.origin}/f/
                  </span>
                  <Input
                    value={formSlug}
                    onChange={(e) => setFormSlug(generateSlug(e.target.value))}
                    placeholder="auto-generated"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Form Information</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Write Description here..."
                rows={3}
              />
            </div>

            {/* Services toggles */}
            <div>
              <Label className="mb-3 block">Select Services</Label>
              <RadioGroup
                value={takePayment ? "payment" : "coupon"}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="payment"
                    id="take-payment"
                    onClick={() => { setTakePayment(true); setShowCoupon(false); }}
                  />
                  <Label htmlFor="take-payment" className="cursor-pointer">Take Payment</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="coupon"
                    id="show-coupon"
                    onClick={() => { setShowCoupon(true); setTakePayment(false); }}
                  />
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
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search services..."
                      value={productSearch}
                      onValueChange={setProductSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No products found.</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map((p) => (
                          <CommandItem
                            key={p.id}
                            onSelect={() => {
                              toggleProduct(p.id);
                              setProductSearchOpen(false);
                            }}
                            className="flex flex-col items-start"
                          >
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
                  No services selected. Form will be valid, but customers won't be able to buy anything.
                </p>
              )}
            </div>

            {/* Custom Fields */}
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-base">Custom Form Fields</h4>
                <p className="text-xs text-muted-foreground">
                  Build your own custom form by adding extra fields like Text, Numbers, Radios, and Dropdowns.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["text", "number", "textarea", "select", "radio", "checkbox"] as const).map((type) => (
                  <Button key={type} variant="outline" size="sm" className="gap-1" onClick={() => addCustomField(type)}>
                    <Plus className="h-3.5 w-3.5" />
                    {type === "text" ? "Text Field" : type === "number" ? "Number" : type === "textarea" ? "Text Area" : type === "select" ? "Select Dropdown" : type === "radio" ? "Radio Group" : "Checkbox"}
                  </Button>
                ))}
              </div>

              {customFields.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No custom fields added yet. Add one above to collect more info from customers.
                </p>
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
                      <Input
                        value={cf.label}
                        onChange={(e) => updateCustomField(cf.id, { label: e.target.value })}
                        placeholder="Field label..."
                      />
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cf.required}
                          onCheckedChange={(v) => updateCustomField(cf.id, { required: v })}
                        />
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  const newOpts = (cf.options || []).filter((_, idx) => idx !== i);
                                  updateCustomField(cf.id, { options: newOpts });
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateCustomField(cf.id, { options: [...(cf.options || []), ""] })
                            }
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Option
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full" onClick={handleSave}>
              {editId ? "Update Form" : "Create Form"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default OrderForms;
