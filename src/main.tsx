import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensureCloudSession } from "@/lib/cloudBootstrap";

// Bootstrap sesión compartida en la nube (anónima). No bloquea el render.
ensureCloudSession();

createRoot(document.getElementById("root")!).render(<App />);
