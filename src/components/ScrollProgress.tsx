import { useEffect, useRef } from "react";

/**
 * Thin top progress bar (desktop only). Replaces native side scrollbar.
 * Listens to window + common scroll containers and updates width via rAF.
 */
const ScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const compute = () => {
      rafRef.current = null;
      // Pick whichever container is actually scrolling
      const candidates: Array<HTMLElement | Document> = [
        document.documentElement,
        ...(Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-sidebar="content"], main.flex-1, main'
          )
        )),
      ];

      let pct = 0;
      for (const el of candidates) {
        const node = el === document ? document.documentElement : (el as HTMLElement);
        const scrollTop = node.scrollTop;
        const max = node.scrollHeight - node.clientHeight;
        if (max > 4 && scrollTop > 0) {
          pct = Math.min(100, Math.max(0, (scrollTop / max) * 100));
          break;
        }
      }
      bar.style.width = `${pct}%`;
    };

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(compute);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Capture catches scroll events from inner containers
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    compute();

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="hidden md:block fixed top-0 left-0 right-0 h-[2px] z-[100] pointer-events-none bg-transparent"
    >
      <div
        ref={barRef}
        className="h-full bg-primary transition-[width] duration-75 ease-out"
        style={{ width: "0%" }}
      />
    </div>
  );
};

export default ScrollProgress;
