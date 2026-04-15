import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MobileCardListProps<T> {
  data: T[];
  /** Render each item as a card on mobile */
  renderCard: (item: T, index: number) => React.ReactNode;
  /** Render the desktop table view */
  renderTable: () => React.ReactNode;
  className?: string;
  emptyMessage?: string;
}

/**
 * Renders data as cards on mobile (<768px) and as a table on desktop.
 * Handles empty states and consistent spacing.
 */
export function MobileCardList<T>({
  data,
  renderCard,
  renderTable,
  className,
  emptyMessage = "No data found",
}: MobileCardListProps<T>) {
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        {data.map((item, index) => (
          <React.Fragment key={index}>
            {renderCard(item, index)}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return <>{renderTable()}</>;
}

/** A reusable mobile card row for key-value display */
export const MobileCardRow = ({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex items-center justify-between py-1", className)}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

/** A standard mobile data card wrapper */
export const MobileDataCard = ({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={cn(
      "bg-card rounded-2xl border border-border/40 p-4 transition-all active:scale-[0.98]",
      onClick && "cursor-pointer",
      className,
    )}
    style={{ boxShadow: "var(--shadow-card)" }}
  >
    {children}
  </div>
);
