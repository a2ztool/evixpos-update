import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Debounce a value — delays updating until input stops for `delay` ms.
 * Use for search inputs, filters, etc.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounce a callback function.
 * Returns a stable function that delays execution.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay = 400
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    }) as T,
    [delay]
  );
}

/**
 * Throttle a callback — executes at most once per `interval` ms.
 * Use for scroll handlers, resize events, etc.
 */
export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  interval = 300
): T {
  const lastRunRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    ((...args: any[]) => {
      const now = Date.now();
      const remaining = interval - (now - lastRunRef.current);

      if (remaining <= 0) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      } else if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          lastRunRef.current = Date.now();
          timeoutRef.current = undefined;
          callbackRef.current(...args);
        }, remaining);
      }
    }) as T,
    [interval]
  );
}
