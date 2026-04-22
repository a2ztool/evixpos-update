import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useStaff } from "@/contexts/StaffContext";
import { Navigate } from "react-router-dom";
import SuspensionGuard from "@/components/SuspensionGuard";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const { stores, loading: storeLoading } = useStore();
  const { isStaff, loading: staffLoading } = useStaff();

  if (loading || storeLoading || staffLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  // Staff users skip onboarding — they use their assigned store
  if (isStaff) return <SuspensionGuard>{children}</SuspensionGuard>;

  // First-time owner with no stores → onboarding
  if (stores.length === 0) return <Navigate to="/onboarding" replace />;

  return <SuspensionGuard>{children}</SuspensionGuard>;
};

export default ProtectedRoute;
