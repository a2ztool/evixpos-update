import { useEffect } from "react";
import confetti from "canvas-confetti";

const CONFETTI_KEY = "evixpos_welcome_confetti_at_v1";
const VOICE_KEY = "evixpos_welcome_voice_at_v1";
const REPLAY_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CTA_LABELS = [
  "get started free",
  "start free today",
  "start free",
  "see how it works",
];

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

  window.setTimeout(() => {
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors,
    });
  }, 400);
};

const speakWelcomeNow = () => {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
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
    synth.cancel();
    synth.speak(utter);
  } catch {
    // Silently skip if blocked or unsupported.
  }
};

const within24h = (key: string) => {
  try {
    const last = localStorage.getItem(key);
    if (!last) return false;
    return Date.now() - Number(last) < REPLAY_INTERVAL_MS;
  } catch {
    return false;
  }
};

const stamp = (key: string) => {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
};

const WelcomeExperience = () => {
  useEffect(() => {
    if (!within24h(CONFETTI_KEY)) {
      fireConfetti();
      stamp(CONFETTI_KEY);
    }

    if (within24h(VOICE_KEY)) return;

    let played = false;
    const handleClick = (e: MouseEvent) => {
      if (played) return;
      const target = (e.target as HTMLElement | null)?.closest(
        "button, a, [role='button']"
      ) as HTMLElement | null;
      if (!target) return;
      const label = (target.textContent || "").trim().toLowerCase();
      if (!label) return;
      if (!CTA_LABELS.some((l) => label.includes(l))) return;
      played = true;
      speakWelcomeNow();
      stamp(VOICE_KEY);
      document.removeEventListener("click", handleClick, true);
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
};

export default WelcomeExperience;
