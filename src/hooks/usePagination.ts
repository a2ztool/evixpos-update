import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isExternalActionActive } from "@/lib/pageState";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

type Options = {
  /** Stable key used to persist page+size in sessionStorage. Include store id when relevant. */
  storageKey: string;
  /** When this string changes the page resets to 1 (unless an external action is active). */
  filterSignature?: string;
  defaultPageSize?: number;
};

type State = { page: number; pageSize: number };

const read = (key: string, fallback: State): State => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const page = Number(parsed?.page);
    const pageSize = Number(parsed?.pageSize);
    return {
      page: Number.isFinite(page) && page > 0 ? page : fallback.page,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback.pageSize,
    };
  } catch {
    return fallback;
  }
};

const write = (key: string, value: State) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

/**
 * Shared pagination state. Persists page + pageSize per `storageKey`,
 * auto-resets to page 1 when `filterSignature` changes (skipping external-action returns).
 */
export function usePagination(total: number, { storageKey, filterSignature = "", defaultPageSize = DEFAULT_PAGE_SIZE }: Options) {
  const fallback = useMemo<State>(() => ({ page: 1, pageSize: defaultPageSize }), [defaultPageSize]);
  const [state, setState] = useState<State>(() => read(storageKey, fallback));
  const sigRef = useRef<string | null>(null);

  // persist
  useEffect(() => {
    write(storageKey, state);
  }, [storageKey, state]);

  // reset on filter change
  useEffect(() => {
    if (sigRef.current === null) {
      sigRef.current = filterSignature;
      return;
    }
    if (sigRef.current === filterSignature) return;
    sigRef.current = filterSignature;
    if (isExternalActionActive()) return;
    setState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
  }, [filterSignature]);

  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / state.pageSize));
  const safePage = Math.min(Math.max(1, state.page), totalPages);

  // Clamp if total shrinks below current page
  useEffect(() => {
    if (safePage !== state.page) setState((s) => ({ ...s, page: safePage }));
  }, [safePage, state.page]);

  const setPage = useCallback((p: number) => {
    setState((s) => ({ ...s, page: Math.max(1, Math.floor(p)) }));
  }, []);
  const setPageSize = useCallback((size: number) => {
    setState({ page: 1, pageSize: Math.max(1, Math.floor(size)) });
  }, []);

  const pageStart = total === 0 ? 0 : (safePage - 1) * state.pageSize;
  const pageEnd = Math.min(total, safePage * state.pageSize);

  return {
    page: safePage,
    pageSize: state.pageSize,
    totalPages,
    pageStart,
    pageEnd,
    range: [pageStart, Math.max(pageStart, pageEnd - 1)] as [number, number],
    setPage,
    setPageSize,
  };
}

/** Slice helper for client-side pagination. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}