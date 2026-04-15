import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

/**
 * /app entry point — PWA start_url.
 * Logged in → dashboard, otherwise → auth.
 */
const AppEntry = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
            <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="18" rx="3" />
              <path d="M8 21V7m8 0v14" />
            </svg>
          </div>
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground font-medium">Loading EvixPOS...</p>
        </div>
      </div>
    );
  }

  if (session) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/auth" replace />;
};

export default AppEntry;
