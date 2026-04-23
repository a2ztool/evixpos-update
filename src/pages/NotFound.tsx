import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutDashboard, LifeBuoy, ShoppingCart, Package, Compass } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const helpfulLinks = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/pos", label: "POS Terminal", icon: ShoppingCart },
    { to: "/orders", label: "Orders", icon: Package },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Soft gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl opacity-60" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl opacity-60" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-xl">
          {/* Card */}
          <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.25)] p-8 sm:p-12 text-center animate-in fade-in zoom-in-95 duration-500">
            {/* Abstract floating shape */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-primary/60 blur-xl opacity-40" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30 rotate-6 hover:rotate-0 transition-transform duration-500">
                  <Compass className="h-10 w-10 text-primary-foreground" strokeWidth={2.2} />
                </div>
              </div>
            </div>

            {/* Tag */}
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Error 404
            </div>

            {/* Heading */}
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              Page not found
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm sm:text-base text-muted-foreground leading-relaxed">
              Looks like you took a wrong turn. The page you're looking for doesn't exist or has moved somewhere else. Let's get you back on track.
            </p>

            {/* Path display */}
            {location.pathname && location.pathname !== "/" && (
              <div className="mt-4 inline-block max-w-full truncate rounded-md bg-muted/60 px-3 py-1.5 font-mono text-xs text-muted-foreground">
                {location.pathname}
              </div>
            )}

            {/* Buttons */}
            <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
              <Button
                size="lg"
                onClick={() => navigate("/dashboard")}
                className="gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
              >
                <LayoutDashboard className="h-4 w-4" />
                Go to Dashboard
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate(-1)}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => navigate("/support")}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <LifeBuoy className="h-4 w-4" />
                Contact Support
              </Button>
            </div>

            {/* Helpful links */}
            <div className="mt-8 pt-6 border-t border-border/50">
              <p className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-3 font-semibold">
                Or jump to
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {helpfulLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
                  >
                    <l.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            If you think this is a mistake, please let our team know.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
