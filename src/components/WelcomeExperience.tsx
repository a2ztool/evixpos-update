import { Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

const STORAGE_KEY = "evixpos_welcome_shown_at";
const REPLAY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const fireConfetti = () => {
  const duration = 2500;
  const end = Date.now() + duration;
  const colors = ["#10b981", "#059669", "#34d399", "#a7f3d0", "#fbbf24"];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      startVelocity: 55,
      origin: { x: 0, y: 0.7 },
      colors,
      scalar: 0.9,
      ticks: 200,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      startVelocity: 55,
      origin: { x: 1, y: 0.7 },
      colors,
      scalar: 0.9,
      ticks: 200,
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();

  // Final celebratory burst from center
  window.setTimeout(() => {
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors,
    });
  }, 400);
};

type SpeakWelcomeOptions = {
  onStarted?: () => void;
  onBlocked?: (retry: () => void) => void;
};

const speakWelcome = ({ onStarted, onBlocked }: SpeakWelcomeOptions = {}) => {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return () => undefined;

    const buildUtterance = () => {
      const utter = new SpeechSynthesisUtterance(
        "Welcome to EvixPOS, your all-in-one business management platform."
      );
      utter.rate = 0.95;
      utter.pitch = 1.1;
      utter.volume = 0.7;
      utter.lang = "en-US";

      const voices = synth.getVoices();
      const female =
        voices.find((v) =>
          /female|samantha|victoria|karen|zira|google us english|jenny|aria/i.test(v.name)
        ) || voices.find((v) => v.lang?.startsWith("en"));
      if (female) utter.voice = female;
      return utter;
    };

    let spoken = false;
    let blockedNotified = false;
    const gestureEvents = ["pointerdown", "keydown", "touchstart"] as const;

    const cleanupGesture = () => {
      gestureEvents.forEach((ev) =>
        window.removeEventListener(ev, onGesture, { capture: true } as EventListenerOptions)
      );
    };

    function onGesture() {
      if (spoken) return;
      const utter = buildUtterance();
      utter.onstart = () => {
        spoken = true;
        onStarted?.();
        cleanupGesture();
      };
      synth.cancel();
      synth.speak(utter);
    }

    const trySpeakNow = () => {
      const utter = buildUtterance();
      // If the browser actually starts speaking, mark spoken and remove fallbacks.
      utter.onstart = () => {
        spoken = true;
        onStarted?.();
        cleanupGesture();
      };
      synth.cancel();
      synth.speak(utter);

      // Autoplay policy check: if nothing started within 400ms, wait for a user gesture.
      window.setTimeout(() => {
        if (!spoken) {
          synth.cancel();
          if (!blockedNotified) {
            blockedNotified = true;
            onBlocked?.(onGesture);
          }
          gestureEvents.forEach((ev) =>
            window.addEventListener(ev, onGesture, { once: false, passive: true, capture: true })
          );
        }
      }, 400);
    };

    if (synth.getVoices().length > 0) {
      trySpeakNow();
    } else {
      synth.onvoiceschanged = () => {
        trySpeakNow();
        synth.onvoiceschanged = null;
      };
      // Safety: some browsers never fire voiceschanged — try anyway after 300ms.
      window.setTimeout(() => {
        if (!spoken) trySpeakNow();
      }, 300);
    }
    return cleanupGesture;
  } catch {
    return () => undefined;
  }
};

const WelcomeExperience = () => {
  const [showSoundPrompt, setShowSoundPrompt] = useState(false);
  const retrySpeakRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      const now = Date.now();
      if (last && now - Number(last) < REPLAY_INTERVAL_MS) return;

      fireConfetti();
      const cleanup = speakWelcome({
        onStarted: () => {
          localStorage.setItem(STORAGE_KEY, String(Date.now()));
          setShowSoundPrompt(false);
        },
        onBlocked: (retry) => {
          retrySpeakRef.current = retry;
          setShowSoundPrompt(true);
        },
      });
      return cleanup;
    } catch {
      // localStorage unavailable — skip
    }
  }, []);

  if (!showSoundPrompt) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-border bg-background/95 p-3 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:bottom-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Play EvixPOS welcome voice"
          onClick={() => retrySpeakRef.current?.()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
        >
          <Volume2 className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Play welcome voice</p>
          <p className="text-xs text-muted-foreground">Browser needs one tap to enable sound.</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss welcome voice"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
            setShowSoundPrompt(false);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default WelcomeExperience;