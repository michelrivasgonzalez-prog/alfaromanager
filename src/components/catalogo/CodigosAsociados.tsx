import { Pencil, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogoItem } from "@/store/cuadreStore";

type Props = {
  producto: CatalogoItem;
  onAgregar: () => void;
  onEscanear: () => void;
  onEditar: (indice: number) => void;
  onEliminar: (indice: number) => void;
};

/** Códigos de variantes que comparten una sola ficha y una sola existencia. */
export default function CodigosAsociados({
  producto, onAgregar, onEscanear, onEditar, onEliminar,
}: Props) {
  const adicionales = producto.codigosAdicionales ?? [];
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-dashed border-border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Códigos asociados ({adicionales.length + Number(Boolean(producto.codigoBarras))})
        </p>
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs"
            onClick={onAgregar}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Añadir
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg"
            onClick={onEscanear} aria-label={"Escanear otra variante de " + producto.nombre}>
            <ScanBarcode className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {adicionales.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Puedes asociar otros sabores o presentaciones del mismo artículo, sin separar el inventario.
        </p>
      )}

      {adicionales.map((adicional, indice) => (
        <div key={adicional.codigo} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {adicional.etiqueta?.trim() || "Variante sin descripción"}
            </p>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{adicional.codigo}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => onEditar(indice)} aria-label="Editar nombre de la variante">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive"
            onClick={() => onEliminar(indice)} aria-label="Quitar código asociado">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
