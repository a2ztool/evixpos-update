import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutDashboard, LifeBuoy, ShoppingCart, Package } from "lucide-react";
import logo from "@/assets/evixpos-logo.png";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const helpfulLinks = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/pos", label: "POS", icon: ShoppingCart },
    { to: "/orders", label: "Orders", icon: Package },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background flex items-center justify-center px-4 py-10">
      {/* Soft background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-background to-background" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl opacity-70" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={logo} alt="EvixPOS" className="h-8 w-auto select-none" draggable={false} />
        </div>

        {/* Card */}
        <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-[0_12px_40px_-16px_hsl(var(--primary)/0.25)] px-6 py-8 sm:px-8 sm:py-10 text-center animate-in fade-in zoom-in-95 duration-500">
          {/* 404 mark */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Error 404
            </span>
          </div>

          {/* Big 404 with gradient */}
          <div className="relative">
            <h1 className="text-6xl sm:text-7xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent leading-none">
              404
            </h1>
          </div>

          {/* Heading */}
          <h2 className="mt-4 text-lg sm:text-xl font-semibold text-foreground">
            Page not found
          </h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground leading-relaxed">
            The page you're looking for doesn't exist or has moved.
          </p>

          {/* Path */}
          {location.pathname && location.pathname !== "/" && (
            <div className="mt-3 inline-block max-w-full truncate rounded-md bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
              {location.pathname}
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row items-stretch justify-center gap-2">
            <Button
              onClick={() => navigate("/dashboard")}
              className="gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
            >
              <LayoutDashboard className="h-4 w-4" />
              Go to Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>

          {/* Helpful links */}
          <div className="mt-6 pt-5 border-t border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-2.5 font-semibold">
              Quick links
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {helpfulLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs font-medium text-foreground/80 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <l.icon className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Need help?{" "}
          <button
            onClick={() => navigate("/support")}
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            <LifeBuoy className="h-3 w-3" /> Contact support
          </button>
        </p>
      </div>
    </div>
  );
};

export default NotFound;
