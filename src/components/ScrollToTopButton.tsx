import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";

const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 20, mass: 0.4 });

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // SVG progress ring config
  const R = 22;
  const C = 2 * Math.PI * R;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleClick}
          aria-label="Scroll to top"
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.94 }}
          className="group fixed left-5 sm:left-7 bottom-6 sm:bottom-8 z-50 h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center"
        >
          {/* outer glow */}
          <span className="absolute inset-0 rounded-full bg-primary/30 blur-xl opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden />
          {/* gradient border ring */}
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/40 p-[1.5px]" aria-hidden>
            <span className="block h-full w-full rounded-full bg-background/95 backdrop-blur-xl" />
          </span>

          {/* progress ring */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 50 50" aria-hidden>
            <circle cx="25" cy="25" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.4" />
            <motion.circle
              cx="25"
              cy="25"
              r={R}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={C}
              style={{ pathLength: progress }}
            />
          </svg>

          {/* icon */}
          <span className="relative flex items-center justify-center h-full w-full">
            <ArrowUp className="h-5 w-5 text-primary transition-transform group-hover:-translate-y-0.5" strokeWidth={2.5} />
          </span>

          {/* subtle shine */}
          <span className="pointer-events-none absolute inset-[2px] rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default ScrollToTopButton;