import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useState, useCallback } from "react";
import SplashScreen from "@/components/SplashScreen";

/**
 * /app entry point — PWA start_url.
 * Shows splash screen, then routes to dashboard or auth.
 */
const AppEntry = () => {
  const { session, loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  // Show splash while loading OR splash hasn't finished
  if (!splashDone || loading) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (session) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/auth" replace />;
};

export default AppEntry;
