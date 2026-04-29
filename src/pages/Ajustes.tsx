import { useCuadreStore } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Ajustes() {
  const { history } = useCuadreStore();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <Row label="Cuadres en historial" value={String(history.length)} />
        <Row label="Versión" value="1.0.0" />
      </div>
      <Button
        variant="destructive"
        className="w-full rounded-xl"
        onClick={() => {
          if (confirm("¿Borrar todos los datos locales?")) {
            localStorage.removeItem("alfarocafe-store");
            toast.success("Datos borrados");
            setTimeout(() => location.reload(), 600);
          }
        }}
      >
        Borrar datos locales
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
