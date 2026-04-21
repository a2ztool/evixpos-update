import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPwaUpdate } from "./lib/pwaUpdate";

// PWA: detect new deploys, show "Update available" toast, auto-reload on activate
initPwaUpdate();

createRoot(document.getElementById("root")!).render(<App />);
