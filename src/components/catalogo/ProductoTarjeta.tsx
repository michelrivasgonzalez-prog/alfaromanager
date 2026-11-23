import { useEffect, useState } from "react";
import { History, Package, Pencil, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogoItem } from "@/store/cuadreStore";

const dinero = (n: number) => Number(n || 0).toLocaleString("es-ES", {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

type Props = {
  producto: CatalogoItem;
  numero: number;
  existencia: number;
  onEditar: () => void;
  onCodigos: () => void;
  onHistorial: () => void;
};

/** Vista exclusivamente informativa: la ficha se edita al pulsar el lápiz. */
export default function ProductoTarjeta({
  producto, numero, existencia, onEditar, onCodigos, onHistorial,
}: Props) {
  const [fotoFallida, setFotoFallida] = useState(false);
  useEffect(() => setFotoFallida(false), [producto.fotoUrl]);
  const tieneExistencia = existencia > 0;

  return (
    <article
      id={"producto-" + producto.id}
      className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-card p-3 shadow-soft transition-colors hover:border-primary/30"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40">
          {producto.fotoUrl && !fotoFallida
            ? <img src={producto.fotoUrl} alt={producto.nombre} loading="lazy"
                className="h-full w-full object-contain"
                onError={() => setFotoFallida(true)} />
            : <Package className="h-7 w-7 text-muted-foreground/70" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold leading-snug">{producto.nombre}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{producto.categoria || "Sin categoría"}</p>
          <div className={"mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium " +
            (tieneExistencia ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
              "bg-muted text-muted-foreground")}>
            <Package className="h-3 w-3" />
            {tieneExistencia ? "Disponible" : "Sin existencia"} · {dinero(existencia)}
          </div>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">#{numero}</span>
      </div>
      <div className="flex items-end justify-between gap-2 border-t border-border/60 pt-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1">
          <div>
            <p className="text-[10px] text-muted-foreground">Venta</p>
            <p className="text-sm font-semibold tabular-nums">{dinero(producto.precio)} <span className="text-[10px] font-normal text-muted-foreground">CUP</span></p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Costo</p>
            <p className="text-sm font-semibold tabular-nums">{dinero(producto.costo)} <span className="text-[10px] font-normal text-muted-foreground">CUP</span></p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-xl"
            title="Códigos de barras" aria-label={"Códigos de barras de " + producto.nombre}
            onClick={onCodigos}><ScanBarcode className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-xl"
            title="Historial de movimientos" aria-label={"Historial de " + producto.nombre}
            onClick={onHistorial}><History className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-xl"
            title="Editar producto" aria-label={"Editar " + producto.nombre}
            onClick={onEditar}><Pencil className="h-4 w-4" /></Button>
        </div>
      </div>
    </article>
  );
}
