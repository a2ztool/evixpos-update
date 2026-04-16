import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Crown, AlertTriangle } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "products" | "customers" | "stores";
  current: number;
  max: number;
}

const UpgradeModal = ({ open, onOpenChange, type, current, max }: UpgradeModalProps) => {
  const navigate = useNavigate();
  const labels = { products: "Products", customers: "Customers", stores: "Stores" };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg">
                {labels[type]} Limit Reached
              </AlertDialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {current} / {max} used
              </p>
            </div>
          </div>
          <AlertDialogDescription className="text-sm">
            You've reached your {labels[type].toLowerCase()} limit on your current plan.
            Upgrade to a higher plan to add more {labels[type].toLowerCase()}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { onOpenChange(false); navigate("/my-plan"); }}
            className="gap-2"
          >
            <Crown className="h-4 w-4" /> Upgrade Plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UpgradeModal;
