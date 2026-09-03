import { useEffect, useState } from "react";
import { Download, X, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "alfarocafe-install-dismissed";

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      setPrompt(e);
    };
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (offline) {
    return (
      <div className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-center gap-2 bg-destructive/90 py-1 text-[11px] font-semibold text-destructive-foreground">
        <WifiOff className="h-3 w-3" /> Sin internet — puedes seguir trabajando, se subirá al volver
      </div>
    );
  }

  if (!prompt) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="gradient-primary rounded-xl p-2 text-primary-foreground">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Instalar AlFaroCafé</p>
          <p className="text-xs text-muted-foreground">
            Guárdala en tu teléfono y úsala aunque se caiga el internet.
          </p>
          <Button
            size="sm"
            className="mt-2 h-8"
            onClick={async () => {
              await prompt.prompt();
              setPrompt(null);
            }}
          >
            Instalar
          </Button>
        </div>
        <button
          aria-label="Cerrar"
          className="text-muted-foreground"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setPrompt(null);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
