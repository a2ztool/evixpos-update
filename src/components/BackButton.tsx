import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Root pages where back button should NOT appear
const ROOT_PAGES = new Set([
  "/dashboard",
  "/admin/dashboard",
]);

const BackButton = ({ className = "" }: { className?: string }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide on root pages
  if (ROOT_PAGES.has(location.pathname)) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate(-1)}
      className={`h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground ${className}`}
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
};

export default BackButton;
