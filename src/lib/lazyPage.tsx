import { Suspense, lazy, ComponentType } from "react";
import PageSkeleton from "@/components/PageSkeleton";

/**
 * Lazy-load a page component with a skeleton fallback (instant layout render).
 */
export function lazyPage<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const LazyComponent = lazy(factory);
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={<PageSkeleton />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}
