import { useState, useRef, useEffect, useMemo } from "react";
import {
  PuntoVenta,
  useCuadreStore,
  emptyDen,
  DENOMINACIONES,
  Denominaciones,
  Cuadre,
} from "@/store/cuadreStore";
import { usePinStore, hashPin } from "@/store/pinStore";
import {
  PrecuadreData,
  enviarPrecuadre,
  GastoPrecuadre,
  RecogidaPrecuadre,
  TurnoDependiente,
} from "@/lib/turnos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lock,
  Unlock,
  Check,
  AlertCircle,
  PenLine,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Send,
  DollarSign,
  Wallet,
  ShieldCheck,
  Package,
} from "lucide-react";
import { toast } from "sonner";

interface PrecuadreDependienteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puntoInicial: PuntoVenta;
  dependienteActual: string;
  onCompletado?: () => void;
}

export function PrecuadreDependiente({
  open,
  onOpenChange,
  puntoInicial,
  dependienteActual,
  onCompletado,
}: PrecuadreDependienteProps) {
  const { history, dependientes, catalogo } = useCuadreStore();
  const { users } = usePinStore();

  const [paso, setPaso] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(1);
  const [turnoId] = useState(() => crypto.randomUUID());

  // Paso 1: Datos del Turno
  const [punto, setPunto] = useState<PuntoVenta>(puntoInicial);
  const [dependiente, setDependiente] = useState<string>(dependienteActual);
  const [diasTrabajados, setDiasTrabajados] = useState<number>(1);

  // Paso 2: Inicios bajo candado (traídos del último cuadre cerrado)
  const ultimoCuadre = useMemo(() => {
    return history
      .filter((c) => c.puntoVenta === punto)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  }, [history, punto]);

  const [inicios, setInicios] = useState<Record<string, number>>({});
  const [iniciosBloqueados, setIniciosBloqueados] = useState(true);
  const [motivoDesbloqueo, setMotivoDesbloqueo] = useState("");
  const [mostrarModalDesbloqueo, setMostrarModalDesbloqueo] = useState(false);

  // Paso 3 & 4: Entradas, Traslados y Conteo Final
  const [entradas, setEntradas] = useState<Record<string, number>>({});
  const [traslados, setTraslados] = useState<Record<string, number>>({});
  const [finales, setFinales] = useState<Record<string, number>>({});

  // Cargar productos del catálogo aplicables
  const productosBase = useMemo(() => {
    return catalogo
      .filter((p) => !p.punto || p.punto === punto)
      .map((c) => {
        const prodAnterior = ultimoCuadre?.productos?.find((p) => p.id === c.id || p.nombre === c.nombre);
        return {
          id: c.id,
          nombre: c.nombre,
          precio: c.precio,
          categoria: c.categoria,
          inicioDefecto: prodAnterior?.final ?? 0,
        };
      });
  }, [catalogo, punto, ultimoCuadre]);

  useEffect(() => {
    const objInicios: Record<string, number> = {};
    productosBase.forEach((p) => {
      objInicios[p.id] = p.inicioDefecto;
    });
    setInicios(objInicios);
  }, [productosBase]);

  // Paso 5: Relevo & Firma Digital
  const [tipoRelevo, setTipoRelevo] = useState<"dependiente" | "admin">("dependiente");
  const [entranteNombre, setEntranteNombre] = useState("");
  const [pinRelevo, setPinRelevo] = useState("");
  const [pinValidado, setPinValidado] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tieneFirma, setTieneFirma] = useState(false);

  // Paso 7: Gastos y Salidas
  const [gastos, setGastos] = useState<GastoPrecuadre[]>([]);
  const [gastoReceptor, setGastoReceptor] = useState("");
  const [gastoTipo, setGastoTipo] = useState<"efectivo" | "producto">("efectivo");
  const [gastoProductoId, setGastoProductoId] = useState("");
  const [gastoCantidadProd, setGastoCantidadProd] = useState("");
  const [gastoMontoEfectivo, setGastoMontoEfectivo] = useState("");

  // Paso 8: Recogidas y Arqueo de Efectivo
  const [recogidas, setRecogidas] = useState<RecogidaPrecuadre[]>([]);
  const [recogidaMonto, setRecogidaMonto] = useState("");
  const [recogidaNota, setRecogidaNota] = useState("");

  const [denoms, setDenoms] = useState<Denominaciones>(emptyDen());
  const [usdMonto, setUsdMonto] = useState<string>("");
  const [usdTasa, setUsdTasa] = useState<string>("320");

  const [enviando, setEnviando] = useState(false);

  // Cálculos del Paso 6 (Ventas)
  const resumenProductos = useMemo(() => {
    return productosBase.map((p) => {
      const ini = inicios[p.id] ?? 0;
      const ent = entradas[p.id] ?? 0;
      const tras = traslados[p.id] ?? 0;
      const fin = finales[p.id] ?? 0;
      const vendidas = Math.max(0, ini + ent - tras - fin);
      const importe = vendidas * p.precio;
      return {
        ...p,
        inicio: ini,
        entradas: ent,
        traslados: tras,
        final: fin,
        vendidas,
        importe,
      };
    });
  }, [productosBase, inicios, entradas, traslados, finales]);

  const totalVentas = useMemo(() => {
    return resumenProductos.reduce((acc, p) => acc + p.importe, 0);
  }, [resumenProductos]);

  const totalGastos = useMemo(() => {
    return gastos.reduce((acc, g) => acc + g.monto, 0);
  }, [gastos]);

  const totalRecogidas = useMemo(() => {
    return recogidas.reduce((acc, r) => acc + r.monto, 0);
  }, [recogidas]);

  const efectivoCUP = useMemo(() => {
    return Object.entries(denoms).reduce((acc, [billete, cant]) => {
      return acc + Number(billete) * (Number(cant) || 0);
    }, 0);
  }, [denoms]);

  const efectivoUSDEnCUP = (parseFloat(usdMonto) || 0) * (parseFloat(usdTasa) || 0);
  const totalEfectivoEntregado = efectivoCUP + efectivoUSDEnCUP;

  // Manejo del Canvas de Firma
  useEffect(() => {
    if (paso === 5 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#0f172a";
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

  // Validación de PIN en Relevo
  const validarPinRelevo = async () => {
    if (!pinRelevo.trim()) {
      toast.error("Ingresa el PIN de 4 dígitos");
      return;
    }

    if (tipoRelevo === "admin") {
      const adminUsers = users.filter((u) => u.role === "admin" || u.role === "duena");
      for (const u of adminUsers) {
        const h = await hashPin(pinRelevo, u.id);
        if (h === u.pinHash) {
          setPinValidado(true);
          toast.success("PIN de Administración verificado");
          return;
        }
      }
      toast.error("PIN de Administrador/Dueña incorrecto");
    } else {
      const depUser = users.find((u) => u.nombre.toLowerCase() === entranteNombre.toLowerCase());
      if (depUser) {
        const h = await hashPin(pinRelevo, depUser.id);
        if (h === depUser.pinHash) {
          setPinValidado(true);
          toast.success(`PIN de ${entranteNombre} verificado`);
          return;
        }
        toast.error("PIN incorrecto para la dependienta seleccionada");
      } else {
        // Si no está registrado en el sistema de PINs, se acepta con advertencia
        setPinValidado(true);
        toast.success("PIN registrado para el relevo");
      }
    }
  };

  const agregarGasto = () => {
    if (!gastoReceptor.trim()) {
      toast.error("Indica quién recibe o concepto");
      return;
    }

    if (gastoTipo === "efectivo") {
      const m = parseFloat(gastoMontoEfectivo);
      if (isNaN(m) || m <= 0) {
        toast.error("Ingresa un monto en efectivo válido");
        return;
      }
      setGastos([
        ...gastos,
        {
          id: crypto.randomUUID(),
          receptor: gastoReceptor.trim(),
          tipo: "efectivo",
          monto: m,
          sinClasificar: true,
        },
      ]);
      setGastoReceptor("");
      setGastoMontoEfectivo("");
    } else {
      const prod = productosBase.find((p) => p.id === gastoProductoId);
      const cant = parseFloat(gastoCantidadProd);
      if (!prod || isNaN(cant) || cant <= 0) {
        toast.error("Selecciona producto y cantidad válida");
        return;
      }
      const montoTotalProd = cant * prod.precio;
      setGastos([
        ...gastos,
        {
          id: crypto.randomUUID(),
          receptor: gastoReceptor.trim(),
          tipo: "producto",
          productoId: prod.id,
          productoNombre: prod.nombre,
          cantidadProducto: cant,
          monto: montoTotalProd,
          sinClasificar: true,
        },
      ]);
      setGastoReceptor("");
      setGastoProductoId("");
      setGastoCantidadProd("");
    }
  };

  const agregarRecogida = () => {
    const m = parseFloat(recogidaMonto);
    if (isNaN(m) || m <= 0) {
      toast.error("Ingresa un monto de recogida válido");
      return;
    }
    const ahora = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setRecogidas([
      ...recogidas,
      {
        id: crypto.randomUUID(),
        hora: ahora,
        monto: m,
        nota: recogidaNota.trim() || undefined,
      },
    ]);
    setRecogidaMonto("");
    setRecogidaNota("");
  };

  const handleEnviar = async () => {
    setEnviando(true);
    try {
      const canvas = canvasRef.current;
      const firmaDataUrl = canvas ? canvas.toDataURL() : undefined;

      const data: PrecuadreData = {
        diasTrabajados,
        iniciosDeTurnoAnterior: !iniciosBloqueados,
        iniciosModificados: !iniciosBloqueados,
        motivoModificacionInicios: motivoDesbloqueo || undefined,
        productos: resumenProductos,
        tipoRelevo,
        entranteNombre: tipoRelevo === "dependiente" ? entranteNombre : "Administración / Dueña",
        entranteFirma: firmaDataUrl,
        entranteValidado: pinValidado,
        totalVentas,
        gastos,
        totalGastos,
        recogidas,
        totalRecogidas,
        denominaciones: denoms,
        usdMonto: parseFloat(usdMonto) || 0,
        usdTasa: parseFloat(usdTasa) || 0,
        efectivoTotal: totalEfectivoEntregado,
      };

      const ok = await enviarPrecuadre(turnoId, punto, dependiente, data);
      if (ok) {
        toast.success("Pre-cuadre enviado exitosamente a la administración");
        onOpenChange(false);
        onCompletado?.();
      } else {
        toast.error("Error al enviar el pre-cuadre");
      }
    } catch {
      toast.error("Ocurrió un error inesperado al procesar el pre-cuadre");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto rounded-3xl p-5">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs font-bold px-2.5 py-0.5">
              Paso {paso} de 9
            </Badge>
            <span className="text-xs font-semibold text-primary">📍 {punto}</span>
          </div>
          <DialogTitle className="text-base font-bold mt-1">
            {paso === 1 && "Paso 1: Datos del Turno"}
            {paso === 2 && "Paso 2: Inventario Inicial (Bajo Candado)"}
            {paso === 3 && "Paso 3: Entradas y Traslados"}
            {paso === 4 && "Paso 4: Conteo Físico Final"}
            {paso === 5 && "Paso 5: Relevo y Firma Digital"}
            {paso === 6 && "Paso 6: Resultados de Ventas"}
            {paso === 7 && "Paso 7: Gastos y Salidas"}
            {paso === 8 && "Paso 8: Recogidas y Arqueo de Efectivo"}
            {paso === 9 && "Paso 9: Confirmación y Envío"}
          </DialogTitle>
        </DialogHeader>

        {/* PASO 1 */}
        {paso === 1 && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Punto de Venta
              </label>
              <Select value={punto} onValueChange={(val: PuntoVenta) => setPunto(val)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cafetería">Cafetería</SelectItem>
                  <SelectItem value="Mipyme">Mipyme</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Dependienta en Turno (Obligatorio)
              </label>
              <Select value={dependiente} onValueChange={setDependiente}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecciona dependienta" />
                </SelectTrigger>
                <SelectContent>
                  {dependientes.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Días Trabajados en este Cuadre
              </label>
              <Input
                type="number"
                min={1}
                max={15}
                value={diasTrabajados}
                onChange={(e) => setDiasTrabajados(Math.max(1, parseInt(e.target.value) || 1))}
                className="rounded-xl text-center font-bold text-base"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Indica los días reales cubiertos para evitar duplicidad de jornadas.
              </p>
            </div>

            <Button
              className="w-full rounded-2xl font-bold mt-2"
              disabled={!dependiente}
              onClick={() => setPaso(2)}
            >
              Continuar al Inventario <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* PASO 2 */}
        {paso === 2 && (
          <div className="space-y-3 pt-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold block text-primary">Inicios precargados automáticamente</span>
                Se importaron los finales del último turno cerrado. Están protegidos bajo candado.
              </div>
            </div>

            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-semibold text-muted-foreground">Existencia Inicial</span>
              {iniciosBloqueados ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarModalDesbloqueo(true)}
                  className="h-7 text-xs rounded-lg border-dashed"
                >
                  <Unlock className="h-3 w-3 mr-1" /> Desbloquear inicios
                </Button>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  Desbloqueado con Justificación
                </Badge>
              )}
            </div>

            <div className="max-h-[48vh] overflow-y-auto space-y-2 pr-1">
              {productosBase.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-card text-xs"
                >
                  <span className="font-medium truncate flex-1">{p.nombre}</span>
                  <Input
                    type="number"
                    disabled={iniciosBloqueados}
                    value={inicios[p.id] ?? 0}
                    onChange={(e) =>
                      setInicios({ ...inicios, [p.id]: parseFloat(e.target.value) || 0 })
                    }
                    className="w-20 text-right h-8 rounded-lg font-bold"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold" onClick={() => setPaso(3)}>
                Siguiente <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {/* Modal justificación desbloqueo */}
            {mostrarModalDesbloqueo && (
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-lg">
                  <h3 className="font-bold text-sm">Justificación de Desbloqueo</h3>
                  <p className="text-xs text-muted-foreground">
                    Modificar los inicios del turno anterior requiere una justificación que quedará auditada:
                  </p>
                  <Input
                    placeholder="Ej. Error de conteo en turno anterior comprobado..."
                    value={motivoDesbloqueo}
                    onChange={(e) => setMotivoDesbloqueo(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => setMostrarModalDesbloqueo(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!motivoDesbloqueo.trim()}
                      className="flex-1 rounded-xl font-bold"
                      onClick={() => {
                        setIniciosBloqueados(false);
                        setMostrarModalDesbloqueo(false);
                        toast.warning("Inicios desbloqueados bajo auditoría");
                      }}
                    >
                      Confirmar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 3 */}
        {paso === 3 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Registra entradas de almacén y traslados recibidos o enviados en tu turno:
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {productosBase.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl border border-border bg-card space-y-2 text-xs"
                >
                  <div className="font-medium truncate">{p.nombre}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">+ Entradas</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={entradas[p.id] ?? ""}
                        onChange={(e) =>
                          setEntradas({
                            ...entradas,
                            [p.id]: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-lg text-right font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">± Traslados</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={traslados[p.id] ?? ""}
                        onChange={(e) =>
                          setTraslados({
                            ...traslados,
                            [p.id]: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-lg text-right font-bold"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold" onClick={() => setPaso(4)}>
                Ir al Conteo Final <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 4 */}
        {paso === 4 && (
          <div className="space-y-3 pt-2">
            <div className="rounded-2xl border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              Ingresa el conteo físico exacto de lo que queda en mostrador al cerrar el turno:
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {productosBase.map((p) => {
                const disponible = (inicios[p.id] ?? 0) + (entradas[p.id] ?? 0) - (traslados[p.id] ?? 0);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{p.nombre}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Disponible teórico: <span className="font-bold">{disponible}</span>
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
                      className="w-20 text-right h-8 rounded-lg font-bold text-sm"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(3)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold" onClick={() => setPaso(5)}>
                Relevo y Firma <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 5 */}
        {paso === 5 && (
          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Button
                variant={tipoRelevo === "dependiente" ? "default" : "outline"}
                size="sm"
                className="flex-1 rounded-xl text-xs"
                onClick={() => {
                  setTipoRelevo("dependiente");
                  setPinValidado(false);
                }}
              >
                Relevo Dependiente
              </Button>
              <Button
                variant={tipoRelevo === "admin" ? "default" : "outline"}
                size="sm"
                className="flex-1 rounded-xl text-xs"
                onClick={() => {
                  setTipoRelevo("admin");
                  setPinValidado(false);
                }}
              >
                Relevo Admin / Dueña
              </Button>
            </div>

            {tipoRelevo === "dependiente" ? (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Dependienta Entrante
                </label>
                <Select value={entranteNombre} onValueChange={(val) => {
                  setEntranteNombre(val);
                  setPinValidado(false);
                }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecciona dependienta entrante" />
                  </SelectTrigger>
                  <SelectContent>
                    {dependientes
                      .filter((d) => d !== dependiente)
                      .map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="p-3 bg-muted/40 rounded-xl text-xs text-muted-foreground">
                Entrega de turno directamente a la Administración o Dueña.
              </div>
            )}

            {/* PIN de Validación */}
            <div className="p-3 bg-card border border-border rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">PIN del Relevo</span>
                {pinValidado && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">
                    <Check className="h-3 w-3 mr-1" /> Validado
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  maxLength={4}
                  placeholder="PIN 4 dígitos"
                  value={pinRelevo}
                  disabled={pinValidado}
                  onChange={(e) => setPinRelevo(e.target.value)}
                  className="rounded-xl tracking-widest text-center text-sm font-bold"
                />
                {!pinValidado && (
                  <Button size="sm" className="rounded-xl font-bold px-4" onClick={validarPinRelevo}>
                    Validar
                  </Button>
                )}
              </div>
            </div>

            {/* Canvas de Firma Digital */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold flex items-center gap-1.5">
                  <PenLine className="h-3.5 w-3.5 text-primary" /> Firma Digital del Relevo
                </label>
                {tieneFirma && (
                  <Button variant="ghost" size="sm" onClick={limpiarFirma} className="h-6 text-[11px]">
                    <RotateCcw className="h-3 w-3 mr-1" /> Borrar
                  </Button>
                )}
              </div>
              <div className="border border-border rounded-2xl overflow-hidden bg-background">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={130}
                  className="w-full touch-none cursor-crosshair bg-white dark:bg-card"
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
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(4)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button
                className="rounded-2xl flex-1 font-bold"
                disabled={!tieneFirma || !pinValidado || (tipoRelevo === "dependiente" && !entranteNombre)}
                onClick={() => setPaso(6)}
              >
                Ver Resultados <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 6 */}
        {paso === 6 && (
          <div className="space-y-3 pt-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 flex justify-between items-center">
              <div>
                <span className="text-[11px] text-muted-foreground block uppercase font-semibold">
                  Venta Total Calculada
                </span>
                <span className="text-xl font-extrabold text-primary">${Math.round(totalVentas)}</span>
              </div>
              <Badge className="bg-primary text-primary-foreground font-bold">
                {resumenProductos.reduce((acc, p) => acc + p.vendidas, 0)} u. vendidas
              </Badge>
            </div>

            <div className="max-h-[48vh] overflow-y-auto space-y-2 pr-1">
              {resumenProductos.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl border border-border bg-card flex justify-between items-center text-xs"
                >
                  <div>
                    <div className="font-semibold">{p.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.vendidas} u. × ${p.precio}
                    </div>
                  </div>
                  <div className="font-bold text-sm text-foreground">${p.importe}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(5)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold" onClick={() => setPaso(7)}>
                Declarar Gastos <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 7 */}
        {paso === 7 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Añade gastos, salidas o transferencias en líneas sueltas (sin clasificar):
            </p>

            <div className="p-3 bg-muted/40 rounded-2xl space-y-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={gastoTipo === "efectivo" ? "default" : "outline"}
                  className="flex-1 text-xs rounded-xl"
                  onClick={() => setGastoTipo("efectivo")}
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> En Efectivo
                </Button>
                <Button
                  size="sm"
                  variant={gastoTipo === "producto" ? "default" : "outline"}
                  className="flex-1 text-xs rounded-xl"
                  onClick={() => setGastoTipo("producto")}
                >
                  <Package className="h-3.5 w-3.5 mr-1" /> Salida Producto
                </Button>
              </div>

              <Input
                placeholder="Receptor o concepto (Ej. Juan, Compra hielo...)"
                value={gastoReceptor}
                onChange={(e) => setGastoReceptor(e.target.value)}
                className="rounded-xl text-xs"
              />

              {gastoTipo === "efectivo" ? (
                <Input
                  type="number"
                  placeholder="Monto en CUP"
                  value={gastoMontoEfectivo}
                  onChange={(e) => setGastoMontoEfectivo(e.target.value)}
                  className="rounded-xl text-xs font-bold"
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={gastoProductoId} onValueChange={setGastoProductoId}>
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue placeholder="Producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {productosBase.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Cantidad u."
                    value={gastoCantidadProd}
                    onChange={(e) => setGastoCantidadProd(e.target.value)}
                    className="rounded-xl text-xs font-bold"
                  />
                </div>
              )}

              <Button size="sm" className="w-full rounded-xl font-bold" onClick={agregarGasto}>
                + Añadir Línea de Salida
              </Button>
            </div>

            <div className="max-h-[30vh] overflow-y-auto space-y-1.5">
              {gastos.map((g) => (
                <div
                  key={g.id}
                  className="flex justify-between items-center p-2 rounded-xl border border-border bg-card text-xs"
                >
                  <div>
                    <span className="font-semibold">{g.receptor}</span>
                    <span className="text-[10px] text-muted-foreground block">
                      {g.tipo === "producto" ? `Producto: ${g.productoNombre} (${g.cantidadProducto} u.)` : "Efectivo"}
                    </span>
                  </div>
                  <span className="font-bold text-destructive">-${g.monto}</span>
                </div>
              ))}
              {gastos.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-2">No se han declarado salidas.</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(6)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold" onClick={() => setPaso(8)}>
                Arqueo de Efectivo <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 8 */}
        {paso === 8 && (
          <div className="space-y-3 pt-2">
            {/* Recogidas Parciales */}
            <div className="p-3 bg-muted/30 rounded-2xl space-y-2">
              <span className="text-xs font-semibold block">Recogidas Parciales a Dueña</span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Monto entregado"
                  value={recogidaMonto}
                  onChange={(e) => setRecogidaMonto(e.target.value)}
                  className="rounded-xl text-xs font-bold"
                />
                <Button size="sm" className="rounded-xl font-bold" onClick={agregarRecogida}>
                  + Recogida
                </Button>
              </div>
              {recogidas.map((r) => (
                <div key={r.id} className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span>Recogida a las {r.hora}</span>
                  <span className="font-bold">${r.monto}</span>
                </div>
              ))}
            </div>

            {/* Conteo de Billetes CUP */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold block">Billetes en Caja (CUP)</span>
              <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto pr-1">
                {DENOMINACIONES.map((d) => (
                  <div key={d} className="flex items-center justify-between p-2 rounded-xl border border-border bg-card">
                    <span className="text-xs font-bold">${d}</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={denoms[d] || ""}
                      onChange={(e) =>
                        setDenoms({ ...denoms, [d]: parseInt(e.target.value) || 0 })
                      }
                      className="w-16 h-7 text-right font-bold text-xs rounded-lg"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* USD */}
            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-2xl border border-border bg-card">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">USD en Caja</span>
                <Input
                  type="number"
                  placeholder="0 USD"
                  value={usdMonto}
                  onChange={(e) => setUsdMonto(e.target.value)}
                  className="rounded-xl h-8 text-xs font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">Tasa Cambio CUP</span>
                <Input
                  type="number"
                  value={usdTasa}
                  onChange={(e) => setUsdTasa(e.target.value)}
                  className="rounded-xl h-8 text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(7)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold" onClick={() => setPaso(9)}>
                Resumen y Envío <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 9 */}
        {paso === 9 && (
          <div className="space-y-4 pt-2">
            <div className="rounded-3xl border border-border bg-card p-4 space-y-2 shadow-soft">
              <div className="flex justify-between items-center pb-2 border-b border-border/40 text-xs">
                <span className="text-muted-foreground">Punto & Dependienta:</span>
                <span className="font-bold">{punto} • {dependiente}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Venta Total de Productos:</span>
                <span className="font-bold text-foreground">${Math.round(totalVentas)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Gastos declarados:</span>
                <span className="font-bold text-destructive">-${Math.round(totalGastos)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Recogidas declaradas:</span>
                <span className="font-bold text-primary">${Math.round(totalRecogidas)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border/40 text-sm">
                <span className="font-bold">Efectivo en Caja:</span>
                <span className="font-extrabold text-emerald-600">${Math.round(totalEfectivoEntregado)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" /> Relevo Confirmado
              </div>
              <p className="text-muted-foreground">
                Recibido por <strong>{tipoRelevo === "dependiente" ? entranteNombre : "Administración"}</strong> con PIN y firma digital validada.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1" onClick={() => setPaso(8)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button
                className="rounded-2xl flex-1 font-bold bg-primary text-primary-foreground shadow-md"
                disabled={enviando}
                onClick={handleEnviar}
              >
                {enviando ? (
                  "Enviando..."
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" /> Guardar Precuadre
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
