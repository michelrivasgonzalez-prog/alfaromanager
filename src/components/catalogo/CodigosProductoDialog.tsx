import { useEffect, useState } from "react";
import { Barcode, Package, ScanBarcode, Save } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CodigosAsociados from "@/components/catalogo/CodigosAsociados";
import type { CatalogoItem } from "@/store/cuadreStore";

type Props = {
  producto: CatalogoItem | null;
  onClose: () => void;
  onGuardarPrincipal: (id: string, codigo: string) => Promise<boolean>;
  onEscanearPrincipal: (id: string) => void;
  onAgregar: (id: string) => void;
  onEscanearAdicional: (id: string) => void;
  onEditar: (id: string, indice: number) => void;
  onEliminar: (item: CatalogoItem, indice: number) => void;
};

/** Solo se muestra al pulsar el icono de barras, nunca dentro de cada tarjeta. */
export default function CodigosProductoDialog({
  producto, onClose, onGuardarPrincipal, onEscanearPrincipal,
  onAgregar, onEscanearAdicional, onEditar, onEliminar,
}: Props) {
  const [codigo, setCodigo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setCodigo(producto?.codigoBarras ?? "");
  }, [producto?.id, producto?.codigoBarras]);

  if (!producto) return null;
  const principal = producto.codigoBarras ?? "";
  const cambioPendiente = codigo.replace(/[\s-]/g, "") !== principal;

  return (
    <Dialog open={!!producto} onOpenChange={(open) => { if (!open && !guardando) onClose(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5 text-primary" /> Códigos de Barras
          </DialogTitle>
          <p className="text-sm font-medium">{producto.nombre}</p>
          <p className="text-xs text-muted-foreground">
            Todos los códigos de esta ficha comparten precio y existencia.
          </p>
        </DialogHeader>
        <section className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold">Código principal</span>
          </div>
          <div className="flex gap-2">
            <Input value={codigo} inputMode="numeric" placeholder="Sin código principal"
              className="min-w-0 flex-1 font-mono text-sm rounded-xl"
              disabled={guardando}
              onChange={(e) => setCodigo(e.target.value)} />
            <Button type="button" size="icon" variant="outline" className="shrink-0 rounded-xl"
              aria-label="Escanear código principal"
              disabled={guardando} onClick={() => onEscanearPrincipal(producto.id)}>
              <ScanBarcode className="h-4 w-4" />
            </Button>
          </div>
          {cambioPendiente && (
            <Button size="sm" disabled={guardando} className="w-full rounded-lg"
              onClick={async () => {
                setGuardando(true);
                try {
                  await onGuardarPrincipal(producto.id, codigo);
                } finally {
                  setGuardando(false);
                }
              }}>
              <Save className="mr-1.5 h-3.5 w-3.5" /> Guardar código principal
            </Button>
          )}
        </section>
        <CodigosAsociados
          producto={producto}
          onAgregar={() => onAgregar(producto.id)}
          onEscanear={() => onEscanearAdicional(producto.id)}
          onEditar={(indice) => onEditar(producto.id, indice)}
          onEliminar={(indice) => onEliminar(producto, indice)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
