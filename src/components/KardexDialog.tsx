import { useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumberInput } from "@/components/NumberInput";
import { useCuadreStore, PuntoVenta } from "@/store/cuadreStore";
import { kardexProducto, stockKey } from "@/lib/kardex";
import { pushSettings } from "@/lib/sync";
import { cn } from "@/lib/utils";

const n = (v: number) => Number(v.toFixed(2)).toLocaleString("es");

export function KardexDialog({
  nombre,
  punto,
  onClose,
}: {
  nombre: string | null;
  punto: PuntoVenta;
  onClose: () => void;
}) {
  const history = useCuadreStore((s) => s.history);
  const settings = useCuadreStore((s) => s.settings);
  const updateSettings = useCuadreStore((s) => s.updateSettings);
  
  // Filtramos para conservar únicamente los turnos con ventas mayores a 0
  const filas = useMemo(
    () => (nombre ? kardexProducto(history, punto, nombre).filter((f) => f.vendido > 0) : []),
    [history, punto, nombre]
  );
  
  const key = nombre ? stockKey(punto, nombre) : "";
  const minimo = settings.stockMinimo?.[key] ?? 0;
  const totalVendido = filas.reduce((s, f) => s + f.vendido, 0);

  const setMinimo = (v: number) => {
    const stockMinimo = { ...(settings.stockMinimo ?? {}), [key]: v };
    updateSettings({ stockMinimo });
    pushSettings({ ...useCuadreStore.getState().settings }).catch(console.warn);
  };

  return (
    <Dialog open={!!nombre} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de {nombre}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="text-xs">
            <span className="text-muted-foreground">Existencia mínima (alerta en Inicio)</span>
            <NumberInput value={minimo} onChange={(v) => setMinimo(v || 0)} className="mt-0.5 h-9 w-32 rounded-lg" />
          </label>
          <div>
            <div className="text-xs text-muted-foreground">Turnos con venta</div>
            <div className="font-semibold">{filas.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total vendido</div>
            <div className="font-semibold">{n(totalVendido)}</div>
          </div>
        </div>
        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos de venta en cuadres anteriores.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border text-right">
                  <th className="py-1 text-left">Fecha</th>
                  <th className="text-left">Dependiente</th>
                  <th>Vendido</th>
                  <th>Precio</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.cuadreId} className="border-b border-border/50 text-right">
                    <td className="py-1 text-left">{format(new Date(f.fecha), "d MMM yy", { locale: es })}</td>
                    <td className="text-left">{f.dependiente || "—"}</td>
                    <td className="font-semibold">{n(f.vendido)}</td>
                    <td className={cn(f.cambioPrecio && "font-bold text-primary")}>{n(f.precio)}</td>
                    <td className={cn(f.cambioPrecio && "font-bold text-primary")}>{n(f.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">En negrita: cambio de precio o costo respecto al turno anterior.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
