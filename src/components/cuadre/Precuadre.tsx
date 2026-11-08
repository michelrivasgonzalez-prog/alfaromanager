import { useState, useRef, useEffect } from "react";
import { PuntoVenta, useCuadreStore, Cuadre, emptyDen, DENOMINACIONES } from "@/store/cuadreStore";
import { PrecuadreData, TurnoDependiente, enviarPrecuadre } from "@/lib/turnos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, AlertCircle, PenLine, RotateCcw, ArrowRight, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

interface PrecuadreDependienteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  punto: PuntoVenta;
  dependiente: string;
  productosIniciales: {
    id: string;
    nombre: string;
    inicio: number;
    entradas: number;
    traslados: number;
    precio: number;
    categoria?: string;
  }[];
  onCompletado?: () => void;
}

export function PrecuadreDependiente({
  open,
  onOpenChange,
  punto,
  dependiente,
  productosIniciales,
  onCompletado,
}: PrecuadreDependienteProps) {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [turnoId] = useState(() => crypto.randomUUID());

  // Paso 1: Finales
  const [finales, setFinales] = useState<Record<string, number>>({});

  // Paso 2: Relevo & Firma
  const [tipoRelevo, setTipoRelevo] = useState<"dependiente" | "admin">("dependiente");
  const [entranteNombre, setEntranteNombre] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tieneFirma, setTieneFirma] = useState(false);

  // Paso 3: Gastos
  const [gastos, setGastos] = useState<{ id: string; descripcion: string; monto: number }[]>([]);
  const [nuevoGastoDesc, setNuevoGastoDesc] = useState("");
  const [nuevoGastoMonto, setNuevoGastoMonto] = useState("");

  // Paso 4: Efectivo
  const [denoms, setDenoms] = useState<Record<string, number>>(emptyDen());
  const efectivoTotal = Object.entries(denoms).reduce(
    (acc, [b, c]) => acc + Number(b) * (Number(c) || 0),
    0
  );

  const [enviando, setEnviando] = useState(false);

  // Inicializar canvas de firma
  useEffect(() => {
    if (paso === 2 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
      }
    }
  }, [paso]);

  const limpiarFirma = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setTieneFirma(false);
    }
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setTieneFirma(true);
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const agregarGasto = () => {
    const m = parseFloat(nuevoGastoMonto);
    if (!nuevoGastoDesc.trim() || isNaN(m) || m <= 0) {
      toast.error("Indica una descripción y un monto válido");
      return;
    }
    setGastos([...gastos, { id: crypto.randomUUID(), descripcion: nuevoGastoDesc.trim(), monto: m }]);
    setNuevoGastoDesc("");
    setNuevoGastoMonto("");
  };

  const handleEnviar = async () => {
    setEnviando(true);
    try {
      const canvas = canvasRef.current;
      const firmaDataUrl = canvas ? canvas.toDataURL() : undefined;

      const data: PrecuadreData = {
        productos: productosIniciales.map((p) => ({
          ...p,
          final: finales[p.id] ?? 0,
        })),
        gastos,
        denominaciones: denoms,
        efectivoTotal,
        tipoRelevo,
        entranteNombre: tipoRelevo === "dependiente" ? entranteNombre : "Administración",
        entranteFirma: firmaDataUrl,
      };

      const ok = await enviarPrecuadre(turnoId, punto, dependiente, data);
      if (ok) {
        toast.success("Pre-cuadre enviado a la administración exitosamente");
        onOpenChange(false);
        onCompletado?.();
      } else {
        toast.error("Error al enviar el pre-cuadre");
      }
    } catch {
      toast.error("Ocurrió un error inesperado");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              Paso {paso} de 5
            </Badge>
            <span className="text-xs font-semibold text-primary">{punto}</span>
          </div>
          <DialogTitle className="text-lg font-bold">
            {paso === 1 && "1. Conteo de Inventario Final"}
            {paso === 2 && "2. Firma y Relevo Entrante"}
            {paso === 3 && "3. Gastos del Turno"}
            {paso === 4 && "4. Conteo de Efectivo"}
            {paso === 5 && "5. Resumen y Confirmación"}
          </DialogTitle>
        </DialogHeader>

        {/* Paso 1 */}
        {paso === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ingresa la existencia física actual de cada producto al cerrar tu turno:
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {productosIniciales.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Inicio: {p.inicio + p.entradas - p.traslados}
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={finales[p.id] ?? ""}
                    onChange={(e) =>
                      setFinales({
                        ...finales,
                        [p.id]: e.target.value === "" ? 0 : parseFloat(e.target.value),
                      })
                    }
                    className="w-20 text-right h-9 rounded-xl font-bold"
                  />
                </div>
              ))}
            </div>
            <Button className="w-full rounded-2xl" onClick={() => setPaso(2)}>
              Siguiente <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Paso 2 */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={tipoRelevo === "dependiente" ? "default" : "outline"}
                size="sm"
                className="flex-1 rounded-xl text-xs"
                onClick={() => setTipoRelevo("dependiente")}
              >
                Relevo Dependiente
              </Button>
              <Button
                variant={tipoRelevo === "admin" ? "default" : "outline"}
                size="sm"
                className="flex-1 rounded-xl text-xs"
                onClick={() => setTipoRelevo("admin")}
              >
                Relevo Dueña/Admin
              </Button>
            </div>

            {tipoRelevo === "dependiente" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Nombre de la dependienta que entra:
                </label>
                <Input
                  placeholder="Ej. Dania Avila"
                  value={entranteNombre}
                  onChange={(e) => setEntranteNombre(e.target.value)}
                  className="mt-1 rounded-xl"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <PenLine className="h-3.5 w-3.5" /> Firma del relevo receptor:
                </label>
                {tieneFirma && (
                  <button
                    onClick={limpiarFirma}
                    className="text-[11px] text-destructive flex items-center gap-0.5 hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" /> Limpiar
                  </button>
                )}
              </div>
              <div className="border border-border rounded-2xl overflow-hidden bg-white touch-none">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={150}
                  className="w-full h-[150px] cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="w-1/3 rounded-2xl" onClick={() => setPaso(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button
                className="w-2/3 rounded-2xl"
                onClick={() => {
                  if (tipoRelevo === "dependiente" && !entranteNombre.trim()) {
                    toast.error("Por favor ingresa el nombre de la dependienta entrante");
                    return;
                  }
                  setPaso(3);
                }}
              >
                Siguiente <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Paso 3 */}
        {paso === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Anota salidas de dinero o pagos realizados durante el turno:
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="Descripción (ej. Compra de Pan)"
                value={nuevoGastoDesc}
                onChange={(e) => setNuevoGastoDesc(e.target.value)}
                className="flex-1 rounded-xl text-xs"
              />
              <Input
                type="number"
                placeholder="$ Monto"
                value={nuevoGastoMonto}
                onChange={(e) => setNuevoGastoMonto(e.target.value)}
                className="w-24 text-right rounded-xl text-xs font-bold"
              />
              <Button size="sm" className="rounded-xl px-3" onClick={agregarGasto}>
                +
              </Button>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {gastos.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  Sin gastos reportados.
                </div>
              ) : (
                gastos.map((g, idx) => (
                  <div
                    key={g.id}
                    className="flex justify-between items-center p-2 rounded-xl bg-muted/40 text-xs"
                  >
                    <span>{g.descripcion}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">${g.monto}</span>
                      <button
                        onClick={() => setGastos(gastos.filter((_, i) => i !== idx))}
                        className="text-destructive font-bold text-sm px-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="w-1/3 rounded-2xl" onClick={() => setPaso(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="w-2/3 rounded-2xl" onClick={() => setPaso(4)}>
                Siguiente <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Paso 4 */}
        {paso === 4 && (
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-primary/10 p-3 rounded-2xl">
              <span className="text-xs font-semibold text-primary">Total Efectivo Declarado:</span>
              <span className="text-lg font-bold text-primary">${efectivoTotal}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto pr-1">
              {DENOMINACIONES.map((billete) => (
                <div
                  key={billete}
                  className="flex items-center justify-between p-2 rounded-xl border border-border bg-card"
                >
                  <span className="text-xs font-semibold">${billete}</span>
                  <Input
                    type="number"
                    placeholder="0"
                    value={denoms[billete] || ""}
                    onChange={(e) =>
                      setDenoms({
                        ...denoms,
                        [billete]: e.target.value === "" ? 0 : parseInt(e.target.value, 10),
                      })
                    }
                    className="w-16 h-8 text-right font-bold text-xs rounded-lg"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="w-1/3 rounded-2xl" onClick={() => setPaso(3)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="w-2/3 rounded-2xl" onClick={() => setPaso(5)}>
                Revisar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Paso 5 */}
        {paso === 5 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Punto de Venta:</span>
                <span className="font-bold">{punto}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dependiente Saliente:</span>
                <span className="font-bold">{dependiente}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Relevo Receptor:</span>
                <span className="font-bold">
                  {tipoRelevo === "admin" ? "Administración" : entranteNombre || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gastos declarados:</span>
                <span className="font-bold">
                  ${gastos.reduce((s, g) => s + g.monto, 0)} ({gastos.length})
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-1.5 text-sm">
                <span className="font-semibold text-foreground">Efectivo en Caja:</span>
                <span className="font-bold text-primary">${efectivoTotal}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="w-1/3 rounded-2xl" onClick={() => setPaso(4)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button
                className="w-2/3 rounded-2xl font-bold"
                onClick={handleEnviar}
                disabled={enviando}
              >
                {enviando ? "Enviando..." : "Confirmar y Enviar"} <Send className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Modal para que el Administrador revise el pre-cuadre y lo traslade al Cuadre oficial
interface PrecuadreAdminReviewProps {
  turno: TurnoDependiente | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCargarAlCuadre: (cuadre: Partial<Cuadre>) => void;
}

export function PrecuadreAdminReview({
  turno,
  open,
  onOpenChange,
  onCargarAlCuadre,
}: PrecuadreAdminReviewProps) {
  if (!turno || !turno.data) return null;
  const d = turno.data as PrecuadreData;

  const handleAplicar = () => {
    // Traslada los datos al formato del Cuadre oficial
    onCargarAlCuadre({
      puntoVenta: turno.punto_venta,
      dependiente: turno.dependiente,
      denominaciones: d.denominaciones || emptyDen(),
      productos: d.productos?.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        inicio: p.inicio,
        entradas: p.entradas,
        traslados: p.traslados,
        final: p.final,
        precio: p.precio,
        costo: 0,
        categoria: p.categoria,
      })),
      gastos: d.gastos?.map((g) => ({
        id: g.id,
        categoria: "Local",
        tipo: "Efectivo",
        nombre: g.nombre || turno.dependiente,
        descripcion: g.descripcion,
        monto: g.monto,
        sinClasificar: true,
      })),
      precuadre: {
        turnoId: turno.id,
        tipoRelevo: d.tipoRelevo,
        entrante: d.entranteNombre,
        firma: d.entranteFirma,
        firmadoEn: turno.enviado_en,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              {turno.punto_venta}
            </Badge>
            <span className="text-xs text-muted-foreground">{turno.enviado_en?.slice(0, 10)}</span>
          </div>
          <DialogTitle className="text-lg font-bold">
            Revisión de Pre-cuadre: {turno.dependiente}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Relevo entrante:</span>
              <span className="font-semibold">{d.entranteNombre || "Administración"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efectivo declarado:</span>
              <span className="font-bold text-primary text-sm">${d.efectivoTotal}</span>
            </div>
          </div>

          {d.entranteFirma && (
            <div>
              <span className="text-muted-foreground block mb-1">Firma digital recibida:</span>
              <div className="p-2 border border-border rounded-xl bg-white max-w-[200px]">
                <img src={d.entranteFirma} alt="Firma" className="max-h-16 object-contain" />
              </div>
            </div>
          )}

          <div>
            <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block mb-1">
              Gastos declarados ({d.gastos?.length || 0})
            </span>
            <div className="space-y-1">
              {d.gastos?.map((g) => (
                <div key={g.id} className="flex justify-between p-2 rounded-xl bg-card border border-border">
                  <span>{g.descripcion}</span>
                  <span className="font-bold">${g.monto}</span>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full rounded-2xl font-bold" onClick={handleAplicar}>
            Cargar al Cuadre Oficial <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
