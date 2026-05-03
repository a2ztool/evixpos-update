import { useStore } from "@/contexts/StoreContext";
import type { StoreMode } from "@/contexts/StoreContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, ChevronDown, Plus, Check, Crown, Globe, MapPin, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const StoreSwitcher = () => {
  const { stores, activeStore, switchStore, createStore, canCreateStore, storeLimit, isStaffStore, lockedStoreIds } = useStore();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newStoreMode, setNewStoreMode] = useState<StoreMode>("online");

  // Staff users: show store name only, no switching
  if (isStaffStore) {
    return (
      <Button variant="ghost" size="sm" className="h-8 gap-2 px-2.5 text-muted-foreground max-w-[180px] cursor-default pointer-events-none">
        <Store className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium">{activeStore?.name || "Store"}</span>
      </Button>
    );
  }

  const { user } = useAuth();

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const store = await createStore(newName.trim(), "", "", newStoreMode);
    if (store && user) {
      // Auto-create business_settings for the new store
      await supabase.from("business_settings").insert({
        user_id: user.id,
        store_id: store.id,
        store_slug: newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        business_name: newName.trim(),
        default_currency: "BDT",
        currencies: [
          { code: "INR", symbol: "₹", rate: 1 },
          { code: "BDT", symbol: "৳", rate: 0.98 },
          { code: "USD", symbol: "$", rate: 0.012 },
        ],
      });
      toast.success(`Store "${newName}" created!`);
      setShowCreate(false);
      setNewName("");
      setNewStoreMode("online");
    } else {
      toast.error("Failed to create store");
    }
    setCreating(false);
  };

  const handleNewStore = () => {
    if (!canCreateStore) {
      toast.error(`Your plan allows up to ${storeLimit} store(s). Upgrade to add more.`);
      navigate("/my-plan");
      return;
    }
    setShowCreate(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-2 px-2.5 text-muted-foreground hover:text-foreground max-w-[180px]">
            <Store className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate text-xs font-medium">{activeStore?.name || "Select Store"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs">
            Your Stores ({stores.length}/{isFinite(storeLimit) ? storeLimit : "∞"})
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {stores.map(store => (
            <DropdownMenuItem
              key={store.id}
              onClick={(e) => {
                if (lockedStoreIds.has(store.id)) {
                  e.preventDefault();
                  toast.error(`Locked on your current plan. Upgrade to access more stores.`);
                  navigate("/my-plan");
                  return;
                }
                switchStore(store.id);
              }}
              className={`gap-2 ${lockedStoreIds.has(store.id) ? "opacity-60" : ""}`}
            >
              <Store className="h-3.5 w-3.5" />
              <span className="flex-1 truncate text-sm">{store.name}</span>
              {store.store_mode === "offline" ? (
                <MapPin className="h-3 w-3 text-orange-500" />
              ) : (
                <Globe className="h-3 w-3 text-green-500" />
              )}
              {lockedStoreIds.has(store.id) ? (
                <Lock className="h-3 w-3 text-amber-500" />
              ) : store.id === activeStore?.id ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleNewStore} className="gap-2">
            {canCreateStore ? (
              <><Plus className="h-3.5 w-3.5" /> Create New Store</>
            ) : (
              <><Crown className="h-3.5 w-3.5 text-warning" /> Upgrade for More</>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Store</DialogTitle>
            <DialogDescription>Each store operates as a separate business with its own data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Store Name</Label>
              <Input
                placeholder="Enter store name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label>Store Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewStoreMode("online")}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-sm ${
                    newStoreMode === "online" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <Globe className="h-4 w-4" /> Online
                </button>
                <button
                  type="button"
                  onClick={() => setNewStoreMode("offline")}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-sm ${
                    newStoreMode === "offline" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <MapPin className="h-4 w-4" /> Offline
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create Store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StoreSwitcher;
