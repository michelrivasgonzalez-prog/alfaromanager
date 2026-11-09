import { useState, useRef, useEffect, useMemo } from "react";
import {
  PuntoVenta,
  useCuadreStore,
  emptyDen,
  DENOMINACIONES,
  Denominaciones,
  Cuadre,
  puntoHabitual,
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
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Send,
  DollarSign,
  Package,
  Plus,
  Minus,
  Search,
  Users,
  ShieldCheck,
  PenLine,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface PrecuadreDependienteProps {
  puntoInicial: PuntoVenta;
  dependienteActual: string;
  onSalir: () => void;
  onCompletado?: () => void;
}

export function PrecuadreDependiente({
  puntoInicial,
  dependienteActual,
  onSalir,
  onCompletado,
}: PrecuadreDependienteProps) {
  const { history, dependientes, catalogo, settings } = useCuadreStore();
  const { users } = usePinStore();

  const [paso, setPaso] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(1);
  const [turnoId] = useState(() => crypto.randomUUID());

  // Paso 1: Datos del Turno (Preseleccionados)
  const [punto, setPunto] = useState<PuntoVenta>(puntoInicial);
  const [dependiente, setDependiente] = useState<string>(dependienteActual);
  const [diasTrabajados, setDiasTrabajados] = useState<number>(1);

  // Filtro de dependientes del punto de venta seleccionado
  const dependientesPunto = useMemo(() => {
    return dependientes.filter(
      (d) => puntoHabitual(d, settings, history) === punto
    );
  }, [dependientes, punto, settings, history]);

  // Si cambia el punto y la dependienta no pertenece a ese punto, se ajusta
  useEffect(() => {
    if (dependientesPunto.length > 0 && !dependientesPunto.includes(dependiente)) {
      setDependiente(dependientesPunto[0]);
    }
  }, [punto, dependientesPunto, dependiente]);

  // Último cuadre cerrado del punto
  const ultimoCuadre = useMemo(() => {
    return history
      .filter((c) => c.puntoVenta === punto)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  }, [history, punto]);

  // Productos agregados manualmente durante el turno
  const [productosExtra, setProductosExtra] = useState<
    Array<{ id: string; nombre: string; precio: number; categoria?: string; inicioDefecto: number }>
  >([]);
  const [nuevoProdNombre, setNuevoProdNombre] = useState("");
  const [nuevoProdPrecio, setNuevoProdPrecio] = useState("");
  const [modalNuevoProd, setModalNuevoProd] = useState(false);

  // Lista base unificada de productos
  const productosBase = useMemo(() => {
    const listado = catalogo
      .filter((p) => !p.punto || p.punto === punto)
      .map((c) => {
        const prodAnterior = ultimoCuadre?.productos?.find(
          (p) => p.id === c.id || p.nombre.toLowerCase().trim() === c.nombre.toLowerCase().trim()
        );
        return {
          id: c.id,
          nombre: c.nombre,
          precio: c.precio,
          categoria: c.categoria,
          inicioDefecto: prodAnterior?.final ?? 0,
        };
      });

    return [...listado, ...productosExtra];
  }, [catalogo, punto, ultimoCuadre, productosExtra]);

  // Inicios por producto
  const [inicios, setInicios] = useState<Record<string, number>>({});
  useEffect(() => {
    const objInicios: Record<string, number> = {};
    productosBase.forEach((p) => {
      objInicios[p.id] = p.inicioDefecto;
    });
    setInicios(objInicios);
  }, [productosBase]);

  // Candado individual por producto
  const [desbloqueados, setDesbloqueados] = useState<Record<string, boolean>>({});
  const [motivosPorProducto, setMotivosPorProducto] = useState<Record<string, string>>({});
  const [prodSeleccionadoDesbloqueo, setProdSeleccionadoDesbloqueo] = useState<{ id: string; nombre: string } | null>(null);
  const [motivoTemp, setMotivoTemp] = useState("");

  // Paso 3 & 4: Entradas, Traslados y Conteo Final
  const [entradas, setEntradas] = useState<Record<string, number>>({});
  const [traslados, setTraslados] = useState<Record<string, number>>({});
  const [finales, setFinales] = useState<Record<string, number>>({});
  const [busquedaPaso3, setBusquedaPaso3] = useState("");

  // Paso 5: Relevo & Firma Digital
  const [tipoRelevo, setTipoRelevo] = useState<"dependiente" | "admin">("dependiente");
  const [modoSuplencia, setModoSuplencia] = useState(false);
  const [entranteNombre, setEntranteNombre] = useState("");
  const [pinRelevo, setPinRelevo] = useState("");
  const [pinValidado, setPinValidado] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tieneFirma, setTieneFirma] = useState(false);

  // Dependientes seleccionables para el relevo
  const dependientesRelevo = useMemo(() => {
    const fuente = modoSuplencia ? dependientes : dependientesPunto;
    return fuente.filter((d) => d !== dependiente);
  }, [modoSuplencia, dependientes, dependientesPunto, dependiente]);

  // Paso 7: Gastos y Salidas
  const [gastos, setGastos] = useState<GastoPrecuadre[]>([]);
  const [gastoReceptor, setGastoReceptor] = useState("");
  const [gastoTipo, setGastoTipo] = useState<"efectivo" | "producto">("efectivo");
  const [gastoProductoId, setGastoProductoId] = useState("");
  const [gastoCantidadProd, setGastoCantidadProd] = useState("");
  const [gastoMontoEfectivo, setGastoMontoEfectivo] = useState("");

  // Paso 8: Recogidas y Arqueo
  const [recogidas, setRecogidas] = useState<RecogidaPrecuadre[]>([]);
  const [recogidaMonto, setRecogidaMonto] = useState("");
  const [recogidaNota, setRecogidaNota] = useState("");
  const [denoms, setDenoms] = useState<Denominaciones>(emptyDen());
  const [usdMonto, setUsdMonto] = useState<string>("");
  const [usdTasa, setUsdTasa] = useState<string>("320");

  const [enviando, setEnviando] = useState(false);

  // Cálculos Paso 6 (Ventas)
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

  // Validación de PIN de Relevo (Estrictamente 6 dígitos numéricos)
  const validarPinRelevo = async () => {
    const pinLimpio = pinRelevo.trim();
    if (!/^\d{6}$/.test(pinLimpio)) {
      toast.error("El PIN debe tener exactamente 6 dígitos numéricos");
      return;
    }

    if (tipoRelevo === "admin") {
      const adminUsers = users.filter((u) => u.role === "admin" || u.role === "duena");
      for (const u of adminUsers) {
        const h = await hashPin(pinLimpio, u.id);
        if (h === u.pinHash) {
          setPinValidado(true);
          toast.success("PIN de Administración verificado");
          return;
        }
      }
      toast.error("PIN de Administrador/Dueña incorrecto");
    } else {
      const depUser = users.find((u) => u.nombre.toLowerCase().trim() === entranteNombre.toLowerCase().trim());
      if (depUser) {
        const h = await hashPin(pinLimpio, depUser.id);
        if (h === depUser.pinHash) {
          setPinValidado(true);
          toast.success(`PIN de ${entranteNombre} verificado`);
          return;
        }
        toast.error("PIN incorrecto para la dependienta seleccionada");
      } else {
        // En caso de que la dependienta no tenga aún usuario en pinStore
        setPinValidado(true);
        toast.success("PIN registrado para el relevo");
      }
    }
  };

  // Agregar nuevo producto en el paso 3
  const handleGuardarNuevoProducto = () => {
    if (!nuevoProdNombre.trim()) {
      toast.error("Ingresa el nombre del producto");
      return;
    }
    const precio = parseFloat(nuevoProdPrecio);
    if (isNaN(precio) || precio <= 0) {
      toast.error("Ingresa un precio de venta válido");
      return;
    }
    const nuevo = {
      id: `manual_${Date.now()}`,
      nombre: nuevoProdNombre.trim(),
      precio,
      categoria: "Varios",
      inicioDefecto: 0,
    };
    setProductosExtra((prev) => [...prev, nuevo]);
    setNuevoProdNombre("");
    setNuevoProdPrecio("");
    setModalNuevoProd(false);
    toast.success(`Producto "${nuevo.nombre}" añadido al turno`);
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
      setGastos([
        ...gastos,
        {
          id: crypto.randomUUID(),
          receptor: gastoReceptor.trim(),
          tipo: "producto",
          productoId: prod.id,
          productoNombre: prod.nombre,
          cantidadProducto: cant,
          monto: cant * prod.precio,
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

      const algunInicoModificado = Object.values(desbloqueados).some(Boolean);
      const justificaciones = Object.entries(motivosPorProducto)
        .map(([id, motivo]) => {
          const prod = productosBase.find((p) => p.id === id);
          return `${prod?.nombre || id}: ${motivo}`;
        })
        .join(" | ");

      const data: PrecuadreData = {
        diasTrabajados,
        iniciosDeTurnoAnterior: !algunInicoModificado,
        iniciosModificados: algunInicoModificado,
        motivoModificacionInicios: justificaciones || undefined,
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
        toast.success("Pre-cuadre guardado y enviado exitosamente");
        onCompletado?.();
      } else {
        toast.error("Error al procesar el pre-cuadre");
      }
    } catch {
      toast.error("Ocurrió un error inesperado al enviar el pre-cuadre");
    } finally {
      setEnviando(false);
    }
  };

  // Productos con inicio > 0 para el Paso 2
  const productosPaso2 = useMemo(() => {
    return productosBase.filter((p) => p.inicioDefecto > 0);
  }, [productosBase]);

  // Filtro de búsqueda en Paso 3
  const productosFiltradosPaso3 = useMemo(() => {
    const q = busquedaPaso3.toLowerCase().trim();
    if (!q) return productosBase;
    return productosBase.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [productosBase, busquedaPaso3]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* Barra superior fija con navegación segura */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border p-4 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onSalir} className="h-8 px-2 rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-1" /> Salir
            </Button>
            <Badge variant="outline" className="text-xs font-bold px-2 py-0.5">
              Paso {paso} de 9
            </Badge>
          </div>
          <span className="text-xs font-bold text-primary">📍 {punto}</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Título del paso */}
        <div className="border-b border-border/60 pb-2">
          <h1 className="text-lg font-extrabold text-foreground">
            {paso === 1 && "Paso 1: Datos del Turno"}
            {paso === 2 && "Paso 2: Inventario Inicial (Bajo Candado)"}
            {paso === 3 && "Paso 3: Entradas y Traslados"}
            {paso === 4 && "Paso 4: Conteo Físico Final"}
            {paso === 5 && "Paso 5: Relevo y Firma Digital"}
            {paso === 6 && "Paso 6: Resultados de Ventas"}
            {paso === 7 && "Paso 7: Gastos y Salidas"}
            {paso === 8 && "Paso 8: Recogidas y Arqueo de Efectivo"}
            {paso === 9 && "Paso 9: Confirmación y Envío"}
          </h1>
        </div>

        {/* PASO 1 */}
        {paso === 1 && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-soft">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Punto de Venta
                </label>
                <Select value={punto} onValueChange={(val: PuntoVenta) => setPunto(val)}>
                  <SelectTrigger className="rounded-xl font-bold">
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
                  Dependienta en Turno ({punto})
                </label>
                <Select value={dependiente} onValueChange={setDependiente}>
                  <SelectTrigger className="rounded-xl font-bold">
                    <SelectValue placeholder="Selecciona dependienta" />
                  </SelectTrigger>
                  <SelectContent>
                    {dependientesPunto.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Solo se muestran las dependientas asignadas a {punto}.
                </p>
              </div>

              {/* Selector de días con botones - y + */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Días Trabajados en este Cuadre
                </label>
                <div className="flex items-center justify-between border border-border rounded-2xl bg-background p-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    disabled={diasTrabajados <= 1}
                    onClick={() => setDiasTrabajados((prev) => Math.max(1, prev - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="text-center">
                    <span className="text-xl font-black text-foreground">{diasTrabajados}</span>
                    <span className="text-[11px] text-muted-foreground block font-medium">
                      {diasTrabajados === 1 ? "día trabajado" : "días trabajados"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    disabled={diasTrabajados >= 15}
                    onClick={() => setDiasTrabajados((prev) => Math.min(15, prev + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Button
              className="w-full rounded-2xl font-bold h-12"
              disabled={!dependiente}
              onClick={() => setPaso(2)}
            >
              Continuar al Inventario Inicial <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* PASO 2 */}
        {paso === 2 && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold block text-primary">Inicios automáticos protegidos</span>
                Se importaron los finales del último turno cerrado. Solo aparecen productos con inicio mayor a 0. Desbloquea individualmente si detectas un error.
              </div>
            </div>

            <div className="space-y-2">
              {productosPaso2.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-border text-muted-foreground text-xs">
                  No se encontraron productos con existencias iniciales mayores a 0 en el turno anterior.
                </div>
              ) : (
                productosPaso2.map((p) => {
                  const estaDesbloqueado = !!desbloqueados[p.id];
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border bg-card transition-all ${
                        estaDesbloqueado ? "border-amber-500/50 bg-amber-500/5" : "border-border"
                      }`}
                    >
                      <div className="flex-1 pr-2">
                        <div className="font-semibold text-sm">{p.nombre}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Precio venta: <span className="font-semibold text-primary">${p.precio}</span>
                          {estaDesbloqueado && (
                            <span className="text-amber-600 dark:text-amber-400 block font-medium">
                              Desbloqueado: {motivosPorProducto[p.id] || "Justificado"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          disabled={!estaDesbloqueado}
                          value={inicios[p.id] ?? 0}
                          onChange={(e) =>
                            setInicios({ ...inicios, [p.id]: parseFloat(e.target.value) || 0 })
                          }
                          className="w-20 text-right h-9 rounded-xl font-bold text-sm"
                        />
                        <Button
                          type="button"
                          variant={estaDesbloqueado ? "destructive" : "outline"}
                          size="icon"
                          className="h-9 w-9 rounded-xl shrink-0"
                          onClick={() => {
                            if (estaDesbloqueado) {
                              // Volver a bloquear
                              setDesbloqueados((prev) => ({ ...prev, [p.id]: false }));
                            } else {
                              // Abrir modal de desbloqueo para este producto específico
                              setProdSeleccionadoDesbloqueo({ id: p.id, nombre: p.nombre });
                              setMotivoTemp("");
                            }
                          }}
                        >
                          {estaDesbloqueado ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold h-12" onClick={() => setPaso(3)}>
                Siguiente <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {/* Modal justificación para producto individual */}
            {prodSeleccionadoDesbloqueo && (
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-xl">
                  <h3 className="font-bold text-sm text-foreground">
                    Desbloquear inicio de {prodSeleccionadoDesbloqueo.nombre}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Indica el motivo por el cual la existencia inicial importada de este producto es incorrecta:
                  </p>
                  <Input
                    placeholder="Ej. Error de conteo verificado en el turno previo"
                    value={motivoTemp}
                    onChange={(e) => setMotivoTemp(e.target.value)}
                    className="rounded-xl text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => setProdSeleccionadoDesbloqueo(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!motivoTemp.trim()}
                      className="flex-1 rounded-xl font-bold"
                      onClick={() => {
                        const id = prodSeleccionadoDesbloqueo.id;
                        setDesbloqueados((prev) => ({ ...prev, [id]: true }));
                        setMotivosPorProducto((prev) => ({ ...prev, [id]: motivoTemp.trim() }));
                        setProdSeleccionadoDesbloqueo(null);
                        toast.warning(`Inicio de ${prodSeleccionadoDesbloqueo.nombre} desbloqueado`);
                      }}
                    >
                      Desbloquear
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 3 */}
        {paso === 3 && (
          <div className="space-y-4 pt-1">
            {/* Buscador y Botón Agregar Producto Nuevo */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto por letra..."
                  value={busquedaPaso3}
                  onChange={(e) => setBusquedaPaso3(e.target.value)}
                  className="pl-9 pr-8 rounded-2xl h-10 text-xs"
                />
                {busquedaPaso3 && (
                  <button
                    onClick={() => setBusquedaPaso3("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl text-xs font-bold border-dashed"
                onClick={() => setModalNuevoProd(true)}
              >
                <Plus className="mr-1.5 h-4 w-4 text-primary" /> Agregar Producto Nuevo
              </Button>
            </div>

            <div className="space-y-2">
              {productosFiltradosPaso3.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-2xl border border-border bg-card space-y-2.5 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm truncate flex-1">{p.nombre}</span>
                    <Badge variant="secondary" className="font-bold text-xs text-primary">
                      ${p.precio} CUP
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] text-muted-foreground font-medium block mb-1">
                        + Entradas recibidas
                      </span>
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
                        className="h-9 rounded-xl text-right font-bold text-sm"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground font-medium block mb-1">
                        ± Traslados
                      </span>
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
                        className="h-9 rounded-xl text-right font-bold text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold h-12" onClick={() => setPaso(4)}>
                Conteo Final <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {/* Modal para agregar producto nuevo */}
            {modalNuevoProd && (
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-xl">
                  <h3 className="font-bold text-sm">Registrar Producto Nuevo</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">Nombre</label>
                      <Input
                        placeholder="Ej. Galletas Dulces"
                        value={nuevoProdNombre}
                        onChange={(e) => setNuevoProdNombre(e.target.value)}
                        className="rounded-xl text-xs font-semibold"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">Precio de Venta (CUP)</label>
                      <Input
                        type="number"
                        placeholder="Ej. 250"
                        value={nuevoProdPrecio}
                        onChange={(e) => setNuevoProdPrecio(e.target.value)}
                        className="rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => setModalNuevoProd(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl font-bold"
                      onClick={handleGuardarNuevoProducto}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 4 */}
        {paso === 4 && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Ingresa el conteo físico de lo que queda en mostrador al cerrar el turno:
            </div>

            <div className="space-y-2">
              {productosBase.map((p) => {
                const disponible = (inicios[p.id] ?? 0) + (entradas[p.id] ?? 0) - (traslados[p.id] ?? 0);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-border bg-card shadow-soft"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{p.nombre}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Disponible teórico: <span className="font-bold text-foreground">{disponible}</span> • ${p.precio}
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
                      className="w-24 text-right h-9 rounded-xl font-bold text-sm"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(3)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold h-12" onClick={() => setPaso(5)}>
                Relevo y Firma <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 5 */}
        {paso === 5 && (
          <div className="space-y-4 pt-1">
            <div className="flex gap-2">
              <Button
                variant={tipoRelevo === "dependiente" ? "default" : "outline"}
                className="flex-1 rounded-2xl text-xs h-10 font-bold"
                onClick={() => {
                  setTipoRelevo("dependiente");
                  setPinValidado(false);
                }}
              >
                Relevo Dependiente
              </Button>
              <Button
                variant={tipoRelevo === "admin" ? "default" : "outline"}
                className="flex-1 rounded-2xl text-xs h-10 font-bold"
                onClick={() => {
                  setTipoRelevo("admin");
                  setPinValidado(false);
                }}
              >
                Relevo Admin / Dueña
              </Button>
            </div>

            {tipoRelevo === "dependiente" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    Dependienta Entrante {modoSuplencia ? "(Todos los puntos)" : `(${punto})`}
                  </label>
                  <Button
                    type="button"
                    variant={modoSuplencia ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 text-[11px] px-2 rounded-lg"
                    onClick={() => setModoSuplencia((prev) => !prev)}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    {modoSuplencia ? "Solo este punto" : "Suplencia"}
                  </Button>
                </div>

                <Select
                  value={entranteNombre}
                  onValueChange={(val) => {
                    setEntranteNombre(val);
                    setPinValidado(false);
                  }}
                >
                  <SelectTrigger className="rounded-xl font-bold">
                    <SelectValue placeholder="Selecciona dependienta entrante" />
                  </SelectTrigger>
                  <SelectContent>
                    {dependientesRelevo.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="p-3 bg-muted/40 rounded-2xl text-xs text-muted-foreground">
                Entrega de turno a la Administración o Dueña con su PIN maestro.
              </div>
            )}

            {/* PIN de Validación - 6 DÍGITOS ESTRICTO */}
            <div className="p-4 bg-card border border-border rounded-2xl space-y-2 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">PIN del Relevo (6 dígitos numéricos)</span>
                {pinValidado && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">
                    <Check className="h-3 w-3 mr-1" /> Validado
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="PIN 6 dígitos"
                  value={pinRelevo}
                  disabled={pinValidado}
                  onChange={(e) => {
                    const soloNumeros = e.target.value.replace(/\D/g, "");
                    setPinRelevo(soloNumeros);
                  }}
                  className="rounded-xl tracking-widest text-center text-base font-black h-11"
                />
                {!pinValidado && (
                  <Button
                    size="sm"
                    className="rounded-xl font-bold px-4 h-11"
                    disabled={pinRelevo.length !== 6}
                    onClick={validarPinRelevo}
                  >
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
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(4)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button
                className="rounded-2xl flex-1 font-bold h-12"
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
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex justify-between items-center">
              <div>
                <span className="text-[11px] text-muted-foreground block uppercase font-semibold">
                  Venta Total Calculada
                </span>
                <span className="text-2xl font-black text-primary">${Math.round(totalVentas)}</span>
              </div>
              <Badge className="bg-primary text-primary-foreground font-bold text-xs py-1 px-3">
                {resumenProductos.reduce((acc, p) => acc + p.vendidas, 0)} u. vendidas
              </Badge>
            </div>

            <div className="space-y-2">
              {resumenProductos.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl border border-border bg-card flex justify-between items-center text-xs shadow-soft"
                >
                  <div>
                    <div className="font-semibold text-sm">{p.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.vendidas} u. × ${p.precio}
                    </div>
                  </div>
                  <div className="font-black text-sm text-foreground">${p.importe}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(5)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold h-12" onClick={() => setPaso(7)}>
                Declarar Gastos <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 7 */}
        {paso === 7 && (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground">
              Añade gastos, salidas o transferencias en líneas sueltas (sin clasificar):
            </p>

            <div className="p-4 bg-muted/40 rounded-2xl space-y-3">
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
                className="rounded-xl text-xs font-medium"
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

              <Button size="sm" className="w-full rounded-xl font-bold h-10" onClick={agregarGasto}>
                + Añadir Línea de Salida
              </Button>
            </div>

            <div className="space-y-1.5">
              {gastos.map((g) => (
                <div
                  key={g.id}
                  className="flex justify-between items-center p-3 rounded-2xl border border-border bg-card text-xs shadow-soft"
                >
                  <div>
                    <span className="font-semibold text-sm">{g.receptor}</span>
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
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(6)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold h-12" onClick={() => setPaso(8)}>
                Arqueo de Efectivo <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 8 */}
        {paso === 8 && (
          <div className="space-y-4 pt-1">
            {/* Recogidas Parciales */}
            <div className="p-4 bg-muted/30 rounded-2xl space-y-2">
              <span className="text-xs font-semibold block">Recogidas Parciales a Dueña</span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Monto entregado"
                  value={recogidaMonto}
                  onChange={(e) => setRecogidaMonto(e.target.value)}
                  className="rounded-xl text-xs font-bold"
                />
                <Button size="sm" className="rounded-xl font-bold px-4" onClick={agregarRecogida}>
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
            <div className="space-y-2">
              <span className="text-xs font-semibold block">Billetes en Caja (CUP)</span>
              <div className="grid grid-cols-2 gap-2">
                {DENOMINACIONES.map((d) => (
                  <div key={d} className="flex items-center justify-between p-2.5 rounded-2xl border border-border bg-card">
                    <span className="text-xs font-bold">${d}</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={denoms[d] || ""}
                      onChange={(e) =>
                        setDenoms({ ...denoms, [d]: parseInt(e.target.value) || 0 })
                      }
                      className="w-20 h-8 text-right font-bold text-xs rounded-lg"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* USD */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl border border-border bg-card">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">USD en Caja</span>
                <Input
                  type="number"
                  placeholder="0 USD"
                  value={usdMonto}
                  onChange={(e) => setUsdMonto(e.target.value)}
                  className="rounded-xl h-9 text-xs font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">Tasa Cambio CUP</span>
                <Input
                  type="number"
                  value={usdTasa}
                  onChange={(e) => setUsdTasa(e.target.value)}
                  className="rounded-xl h-9 text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(7)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button className="rounded-2xl flex-1 font-bold h-12" onClick={() => setPaso(9)}>
                Resumen y Envío <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 9 */}
        {paso === 9 && (
          <div className="space-y-4 pt-1">
            <div className="rounded-3xl border border-border bg-card p-5 space-y-3 shadow-soft">
              <div className="flex justify-between items-center pb-2.5 border-b border-border/40 text-xs">
                <span className="text-muted-foreground">Punto & Dependienta:</span>
                <span className="font-bold">{punto} • {dependiente}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Días trabajados:</span>
                <span className="font-bold">{diasTrabajados} día(s)</span>
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
              <div className="flex justify-between items-center pt-2.5 border-t border-border/40 text-sm">
                <span className="font-bold">Efectivo Total Entregado:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  ${Math.round(totalEfectivoEntregado)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-3.5 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" /> Relevo Confirmado
              </div>
              <p className="text-muted-foreground">
                Recibido por <strong>{tipoRelevo === "dependiente" ? entranteNombre : "Administración / Dueña"}</strong> con PIN de 6 dígitos y firma digital validada.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-2xl flex-1 h-12" onClick={() => setPaso(8)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>
              <Button
                className="rounded-2xl flex-1 font-bold h-12 bg-primary text-primary-foreground shadow-md"
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
      </div>
    </div>
  );
}

// Modal para que el Administrador revise el pre-cuadre de 9 pasos y lo traslade al Cuadre oficial
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
    onCargarAlCuadre({
      puntoVenta: turno.punto_venta,
      dependiente: turno.dependiente,
      diasTrabajados: d.diasTrabajados || 1,
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
        tipo: g.tipo === "producto" ? "Producto" : "Efectivo",
        nombre: g.receptor || turno.dependiente,
        descripcion:
          g.tipo === "producto"
            ? `${g.cantidadProducto}x ${g.productoNombre || "Producto"} (${g.receptor})`
            : g.receptor,
        monto: g.monto,
        sinClasificar: true,
      })),
      recogidas: d.recogidas?.map((r) => ({
        id: r.id,
        hora: r.hora,
        monto: r.monto,
        pendiente: true,
        nota: r.nota,
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
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto rounded-3xl p-5">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs font-bold">
              {turno.punto_venta}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {turno.enviado_en ? new Date(turno.enviado_en).toLocaleDateString() : ""}
            </span>
          </div>
          <DialogTitle className="text-base font-bold mt-1">
            Revisión Pre-cuadre: {turno.dependiente}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 text-xs pt-2">
          {d.iniciosModificados && (
            <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
              <span className="font-bold block">⚠️ Inicios modificados manualmente</span>
              Motivo: {d.motivoModificacionInicios || "Sin justificación"}
            </div>
          )}

          <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Días trabajados:</span>
              <span className="font-semibold">{d.diasTrabajados || 1} día(s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Relevo entrante:</span>
              <span className="font-semibold">{d.entranteNombre || "Administración / Dueña"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Venta total reportada:</span>
              <span className="font-bold text-primary">${Math.round(d.totalVentas || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efectivo entregado (CUP + USD):</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                ${Math.round(d.efectivoTotal || 0)}
              </span>
            </div>
          </div>

          {d.entranteFirma && (
            <div>
              <span className="text-muted-foreground block mb-1 text-[11px] font-semibold">
                Firma del Relevo:
              </span>
              <div className="p-2 border border-border rounded-xl bg-white max-w-[220px]">
                <img src={d.entranteFirma} alt="Firma relevo" className="max-h-16 object-contain mx-auto" />
              </div>
            </div>
          )}

          {d.gastos && d.gastos.length > 0 && (
            <div>
              <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block mb-1">
                Gastos y Salidas ({d.gastos.length})
              </span>
              <div className="space-y-1">
                {d.gastos.map((g) => (
                  <div
                    key={g.id}
                    className="flex justify-between items-center p-2 rounded-xl bg-card border border-border"
                  >
                    <div>
                      <span className="font-medium block">{g.receptor}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {g.tipo === "producto"
                          ? `${g.cantidadProducto}x ${g.productoNombre}`
                          : "Efectivo"}
                      </span>
                    </div>
                    <span className="font-bold">${g.monto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full rounded-2xl font-bold mt-2" onClick={handleAplicar}>
            Cargar al Cuadre Oficial <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
