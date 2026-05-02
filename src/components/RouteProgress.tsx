import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * YouTube-style top progress bar that animates on every route change.
 * Provides instant visual feedback so navigation never feels like a
 * full page reload — even if a lazy chunk takes a moment to load.
 */
const RouteProgress = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<number[]>([]);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Reset any pending timers
    timers.current.forEach(clearTimeout);
    timers.current = [];

    setVisible(true);
    setProgress(15);
    timers.current.push(window.setTimeout(() => setProgress(45), 80));
    timers.current.push(window.setTimeout(() => setProgress(75), 220));
    timers.current.push(window.setTimeout(() => setProgress(92), 480));
    // Complete shortly after — most chunks are already prefetched
    timers.current.push(
      window.setTimeout(() => {
        setProgress(100);
        timers.current.push(
          window.setTimeout(() => {
            setVisible(false);
            setProgress(0);
          }, 200)
        );
      }, 650)
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navType]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[3px] z-[200] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease-out" }}
    >
      <div
        className="h-full bg-gradient-to-r from-primary via-primary to-primary/70 shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
        style={{
          width: `${progress}%`,
          transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
};

export default RouteProgress;