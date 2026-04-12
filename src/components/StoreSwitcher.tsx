import { useStore } from "@/contexts/StoreContext";
import { useNavigate } from "react-router-dom";
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
import { Store, ChevronDown, Plus, Check, Crown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const StoreSwitcher = () => {
  const { stores, activeStore, switchStore, createStore, canCreateStore, storeLimit, isStaffStore } = useStore();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Staff users: show store name only, no switching
  if (isStaffStore) {
    return (
      <Button variant="ghost" size="sm" className="h-8 gap-2 px-2.5 text-muted-foreground max-w-[180px] cursor-default pointer-events-none">
        <Store className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium">{activeStore?.name || "Store"}</span>
      </Button>
    );
  }

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const store = await createStore(newName.trim());
    if (store) {
      toast.success(`Store "${newName}" created!`);
      setShowCreate(false);
      setNewName("");
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
            Your Stores ({stores.length}/{storeLimit})
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {stores.map(store => (
            <DropdownMenuItem
              key={store.id}
              onClick={() => switchStore(store.id)}
              className="gap-2"
            >
              <Store className="h-3.5 w-3.5" />
              <span className="flex-1 truncate text-sm">{store.name}</span>
              {store.id === activeStore?.id && <Check className="h-3.5 w-3.5 text-primary" />}
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
