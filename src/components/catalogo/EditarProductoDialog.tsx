import { useEffect, useRef, useState } from "react";
import { Camera, ImageOff, Package, ScanBarcode, Trash2, Upload, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import type { CatalogoItem } from "@/store/cuadreStore";
import BuscarIdentidadProducto from "@/components/catalogo/BuscarIdentidadProducto";
import { codigosDeProducto } from "@/lib/codigosBarras";
import { importarFotoCandidata, copiarFuenteFoto, fuenteFoto } from "@/lib/fotoCatalogo";

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
  const [procesando,setProcesando]=useState("");
  const [original,setOriginal]=useState<File|null>(null);
  const [recortada,setRecortada]=useState(false);
  const [identificar,setIdentificar]=useState(false);
  const operacion=useRef(0);

  useEffect(() => {
    if (!producto) return;
    setDatos({
      nombre: producto.nombre,
      precio: producto.precio,
      costo: producto.costo,
      categoria: producto.categoria,
    });
    operacion.current++;
    setFoto(null);
    setOriginal(null);
    setRecortada(false);
    setProcesando("");
    setIdentificar(false);
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
  const ocupado=guardando||!!procesando;
  const mejorar=async()=>{
    const token=++operacion.current;setProcesando("Preparando fotografía…");
    try{
      const base=foto??await importarFotoCandidata({nombre:producto.nombre,codigo:"",fuente:"AlFaroCafé",interno:true,foto:producto.fotoUrl});
      const {quitarFondoProducto}=await import("@/lib/fondoProducto");
      const salida=await quitarFondoProducto(base,s=>{if(operacion.current===token)setProcesando(s);});
      if(operacion.current!==token)return;
      copiarFuenteFoto(base,salida);setOriginal(base);setFoto(salida);setRecortada(true);setQuitarFoto(false);
    }catch(err){if(operacion.current===token)toast.error(err instanceof Error?err.message:"No se pudo mejorar la foto");}
    finally{if(operacion.current===token)setProcesando("");}
  };

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
    <Dialog open={!!producto} onOpenChange={(open) => { if (!open && !ocupado) onClose(); }}>
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
                  className="sr-only" disabled={ocupado}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) {
                      setFoto(file);
                      setOriginal(null);setRecortada(false);
                      setQuitarFoto(false);
                    }
                  }} />
              </label>
              {imagen && (
                <button type="button" disabled={ocupado} onClick={() => { setFoto(null);setOriginal(null);setRecortada(false); setQuitarFoto(true); }}
                  className="flex items-center gap-1 text-xs text-destructive">
                  <ImageOff className="h-3.5 w-3.5" /> Quitar foto
                </button>
              )}
              <p className="text-[10px] leading-snug text-muted-foreground">
                JPG, PNG o WEBP. Se comprimirá a un máximo de 320 px.
              </p>
            </div>
          </div>

          {imagen&&<div className="space-y-2 rounded-xl border p-3"><Button type="button" variant="outline" className="w-full" disabled={ocupado||recortada} onClick={()=>void mejorar()}><Sparkles className="mr-2 h-4 w-4"/>{procesando||"Quitar fondo y recortar con IA"}</Button>{recortada&&<Button type="button" variant="ghost" className="w-full" disabled={ocupado} onClick={()=>{setFoto(original);setOriginal(null);setRecortada(false);}}><Undo2 className="mr-2 h-4 w-4"/>Volver a la original</Button>}<p className="text-xs text-muted-foreground">IA local U²-Net-p. La primera vez descarga el modelo y el motor. Revisa el recorte antes de guardar; el fondo final será blanco.</p></div>}
          {producto.fotoUrl&&fuenteFoto(producto.fotoUrl)&&<a className="text-xs underline" href={fuenteFoto(producto.fotoUrl)} target="_blank" rel="noreferrer">Foto: colaboradores de Open Facts · CC BY-SA · adaptada</a>}
          <Button type="button" variant="outline" className="w-full" disabled={ocupado} onClick={()=>setIdentificar(v=>!v)}><Sparkles className="mr-2 h-4 w-4"/>Identificar / buscar fotografía</Button>
          {identificar&&<BuscarIdentidadProducto codigo={codigosDeProducto(producto)[0]||""} nombre={producto.nombre} excluir={producto.id} onElegir={c=>{if(ocupado)return;if(c.nombre!==datos.nombre&&!window.confirm("¿Usar el nombre sugerido? Cambiar un nombre puede separar el historial si no comparte código. Si es otra mercancía, crea otra ficha."))return;setDatos(v=>({...v,nombre:c.nombre,categoria:c.categoria||v.categoria}));}} onFoto={async c=>{if(ocupado)return;setProcesando("Importando fotografía…");try{const file=await importarFotoCandidata(c);setFoto(file);setOriginal(null);setRecortada(false);setQuitarFoto(false);}finally{setProcesando("");}}}/>}
          <label className="block space-y-1.5 text-xs font-medium">
            Nombre del producto
            <Input value={datos.nombre} disabled={ocupado} autoFocus={false}
              onChange={(e) => setDatos((prev) => ({ ...prev, nombre: e.target.value }))}
              className="h-11 rounded-xl text-base" maxLength={160} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-xs font-medium">
              Precio de venta (CUP)
              <NumberInput value={datos.precio} disabled={ocupado}
                onChange={(precio) => setDatos((prev) => ({ ...prev, precio }))}
                className="h-11 rounded-xl" />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Costo (CUP)
              <NumberInput value={datos.costo} disabled={ocupado}
                onChange={(costo) => setDatos((prev) => ({ ...prev, costo }))}
                className="h-11 rounded-xl" />
            </label>
          </div>

          <label className="block space-y-1.5 text-xs font-medium">
            Categoría
            {categorias.length
              ? <select value={datos.categoria ?? ""} disabled={ocupado}
                  onChange={(e) => setDatos((prev) => ({ ...prev, categoria: e.target.value || undefined }))}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="">Sin categoría</option>
                  {datos.categoria && !categorias.includes(datos.categoria) && (
                    <option value={datos.categoria}>{datos.categoria}</option>
                  )}
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              : <Input value={datos.categoria ?? ""} disabled={ocupado}
                  onChange={(e) => setDatos((prev) => ({ ...prev, categoria: e.target.value }))}
                  placeholder="Sin categoría" className="h-11 rounded-xl" />}
          </label>

          <Button type="button" variant="outline" className="w-full rounded-xl"
            disabled={ocupado}
            onClick={() => onCodigos(producto.id)}>
            <ScanBarcode className="mr-2 h-4 w-4" /> Administrar códigos de barras
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
          <Button type="button" variant="outline" className="text-destructive"
            disabled={ocupado} onClick={() => onEliminar(producto)}>
            <Trash2 className="mr-1 h-4 w-4" /> Eliminar
          </Button>
          <div className="flex flex-1 justify-end gap-2">
            <Button type="button" variant="outline" disabled={ocupado} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" disabled={ocupado} onClick={() => void guardar()}>
              <Upload className="mr-1.5 h-4 w-4" />
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
