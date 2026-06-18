import { useEffect } from "react";
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

const speakWelcome = () => {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const speak = () => {
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
    };

    if (synth.getVoices().length > 0) {
      speak();
    } else {
      synth.onvoiceschanged = () => {
        speak();
        synth.onvoiceschanged = null;
      };
    }
  } catch {
    // Silently ignore browsers that block autoplay
  }
};

const WelcomeExperience = () => {
  useEffect(() => {
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      const now = Date.now();
      if (last && now - Number(last) < REPLAY_INTERVAL_MS) return;

      fireConfetti();
      speakWelcome();
      localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      // localStorage unavailable — skip
    }
  }, []);

  return null;
};

export default WelcomeExperience;