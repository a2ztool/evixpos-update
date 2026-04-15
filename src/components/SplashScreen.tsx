import { useState, useEffect } from "react";

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    // Enter animation ~400ms, hold ~1.5s, exit ~400ms
    const holdTimer = setTimeout(() => setPhase("hold"), 50);
    const exitTimer = setTimeout(() => setPhase("exit"), 2000);
    const doneTimer = setTimeout(() => onFinish(), 2500);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-500"
      style={{ opacity: phase === "exit" ? 0 : 1 }}
    >
      <div
        className="flex flex-col items-center gap-5 transition-all duration-700 ease-out"
        style={{
          opacity: phase === "enter" ? 0 : phase === "exit" ? 0 : 1,
          transform:
            phase === "enter"
              ? "scale(0.7) translateY(20px)"
              : phase === "exit"
              ? "scale(1.1) translateY(-10px)"
              : "scale(1) translateY(0)",
        }}
      >
        <img
          src="/pwa-icon-192.png"
          alt="EvixPOS"
          className="w-24 h-24 rounded-3xl shadow-2xl"
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            EvixPOS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Smart Business Management
          </p>
        </div>
        <div className="mt-4 w-8 h-8">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
