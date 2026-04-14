import { Suspense, lazy, ComponentType } from "react";

/**
 * Lazy-load a page component with a loading fallback.
 */
export function lazyPage<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const LazyComponent = lazy(factory);
  return (props: React.ComponentProps<T>) => (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  );
}
