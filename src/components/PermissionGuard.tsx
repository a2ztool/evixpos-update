import { useStaff } from "@/contexts/StaffContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";

interface Props {
  children: React.ReactNode;
  /** Required permission(s). If any one matches, access is granted. */
  requiredPermission?: string | string[];
  /** If true, only owners (non-staff) can access */
  ownerOnly?: boolean;
}

const PermissionGuard = ({ children, requiredPermission, ownerOnly }: Props) => {
  const { isStaff, hasPermission, hasAnyPermission } = useStaff();
  const { lang } = useLanguage();

  // Owner-only pages
  if (ownerOnly && isStaff) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <ShieldAlert className="h-16 w-16 text-destructive/50 mb-4" />
          <h2 className="text-xl font-bold mb-2">
            {lang === "bn" ? "অ্যাক্সেস নিষিদ্ধ" : "Access Denied"}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            {lang === "bn"
              ? "এই পেজটি শুধুমাত্র স্টোর মালিকের জন্য। আপনার অ্যাডমিনের সাথে যোগাযোগ করুন।"
              : "This page is only accessible to the store owner. Please contact your admin."}
          </p>
          <Button variant="outline" onClick={() => window.history.back()}>
            {lang === "bn" ? "ফিরে যান" : "Go Back"}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Permission-based check
  if (requiredPermission && isStaff) {
    const perms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
    if (!hasAnyPermission(...perms)) {
      return (
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <ShieldAlert className="h-16 w-16 text-destructive/50 mb-4" />
            <h2 className="text-xl font-bold mb-2">
              {lang === "bn" ? "অনুমতি নেই" : "Permission Required"}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              {lang === "bn"
                ? "এই পেজ দেখার অনুমতি আপনার নেই। আপনার অ্যাডমিনের সাথে যোগাযোগ করুন।"
                : "You don't have permission to access this page. Please contact your admin."}
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              {lang === "bn" ? "ফিরে যান" : "Go Back"}
            </Button>
          </div>
        </DashboardLayout>
      );
    }
  }

  return <>{children}</>;
};

export default PermissionGuard;
