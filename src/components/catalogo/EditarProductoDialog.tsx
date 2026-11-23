import { useEffect, useState } from "react";
import { Camera, ImageOff, Package, ScanBarcode, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import type { CatalogoItem } from "@/store/cuadreStore";

export type EdicionCatalogo = Pick<CatalogoItem, "nombre" | "precio" | "costo" | "categoria">;

type Props = {
  producto: CatalogoItem | null;
  categorias: string[];
  onClose: () => void;
  onGuardar: (id: string, datos: EdicionCatalogo, foto: File | null, quitarFoto: boolean) => Promise<boolean>;
  onCodigos: (id: string) => void;
  onEliminar: (item: CatalogoItem) => void;
};

export default function EditarProductoDialog({
  producto, categorias, onClose, onGuardar, onCodigos, onEliminar,
}: Props) {
  const [datos, setDatos] = useState<EdicionCatalogo>({
    nombre: "", precio: 0, costo: 0, categoria: undefined,
  });
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!producto) return;
    setDatos({
      nombre: producto.nombre,
      precio: producto.precio,
      costo: producto.costo,
      categoria: producto.categoria,
    });
    setFoto(null);
    setQuitarFoto(false);
  }, [producto?.id, producto?.nombre, producto?.precio, producto?.costo, producto?.categoria]);

  useEffect(() => {
    if (!foto) {
      setPreview(null);
      return;
    }
    const src = URL.createObjectURL(foto);
    setPreview(src);
    return () => URL.revokeObjectURL(src);
  }, [foto]);

  if (!producto) return null;
  const imagen = quitarFoto ? null : preview || producto.fotoUrl;

  const guardar = async () => {
    const nombre = datos.nombre.trim();
    if (!nombre) { toast.error("Escribe el nombre del producto."); return; }
    if (!Number.isFinite(datos.precio) || datos.precio < 0 ||
      !Number.isFinite(datos.costo) || datos.costo < 0) {
      toast.error("El precio y el costo deben ser números positivos o cero.");
      return;
    }
    setGuardando(true);
    try {
      const guardado = await onGuardar(
        producto.id,
        { nombre, precio: datos.precio, costo: datos.costo,
          categoria: datos.categoria?.trim() || undefined },
        foto,
        quitarFoto,
      );
      if (guardado) onClose();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudieron guardar los cambios.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!producto} onOpenChange={(open) => { if (!open && !guardando) onClose(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Editar producto</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Los cambios se guardan juntos y no modifican los cuadres anteriores.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {imagen
                ? <img src={imagen} alt={"Fotografía de " + producto.nombre}
                    className="h-full w-full object-contain" />
                : <Package className="h-9 w-9 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold">Fotografía (opcional)</p>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 text-xs font-medium">
                <Camera className="h-4 w-4" />
                {imagen ? "Cambiar foto" : "Subir foto"}
                <input type="file" accept="image/jpeg,image/png,image/webp" capture={undefined}
                  className="sr-only" disabled={guardando}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) {
                      setFoto(file);
                      setQuitarFoto(false);
                    }
                  }} />
              </label>
              {imagen && (
                <button type="button" onClick={() => { setFoto(null); setQuitarFoto(true); }}
                  className="flex items-center gap-1 text-xs text-destructive">
                  <ImageOff className="h-3.5 w-3.5" /> Quitar foto
                </button>
              )}
              <p className="text-[10px] leading-snug text-muted-foreground">
                JPG, PNG o WEBP. Se comprimirá a un máximo de 320 px.
              </p>
            </div>
          </div>

          <label className="block space-y-1.5 text-xs font-medium">
            Nombre del producto
            <Input value={datos.nombre} disabled={guardando} autoFocus={false}
              onChange={(e) => setDatos((prev) => ({ ...prev, nombre: e.target.value }))}
              className="h-11 rounded-xl" maxLength={160} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-xs font-medium">
              Precio de venta (CUP)
              <NumberInput value={datos.precio} disabled={guardando}
                onChange={(precio) => setDatos((prev) => ({ ...prev, precio }))}
                className="h-11 rounded-xl" />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Costo (CUP)
              <NumberInput value={datos.costo} disabled={guardando}
                onChange={(costo) => setDatos((prev) => ({ ...prev, costo }))}
                className="h-11 rounded-xl" />
            </label>
          </div>

          <label className="block space-y-1.5 text-xs font-medium">
            Categoría
            {categorias.length
              ? <select value={datos.categoria ?? ""} disabled={guardando}
                  onChange={(e) => setDatos((prev) => ({ ...prev, categoria: e.target.value || undefined }))}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="">Sin categoría</option>
                  {datos.categoria && !categorias.includes(datos.categoria) && (
                    <option value={datos.categoria}>{datos.categoria}</option>
                  )}
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              : <Input value={datos.categoria ?? ""} disabled={guardando}
                  onChange={(e) => setDatos((prev) => ({ ...prev, categoria: e.target.value }))}
                  placeholder="Sin categoría" className="h-11 rounded-xl" />}
          </label>

          <Button type="button" variant="outline" className="w-full rounded-xl"
            disabled={guardando}
            onClick={() => onCodigos(producto.id)}>
            <ScanBarcode className="mr-2 h-4 w-4" /> Administrar códigos de barras
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
          <Button type="button" variant="outline" className="text-destructive"
            disabled={guardando} onClick={() => onEliminar(producto)}>
            <Trash2 className="mr-1 h-4 w-4" /> Eliminar
          </Button>
          <div className="flex flex-1 justify-end gap-2">
            <Button type="button" variant="outline" disabled={guardando} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" disabled={guardando} onClick={() => void guardar()}>
              <Upload className="mr-1.5 h-4 w-4" />
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
