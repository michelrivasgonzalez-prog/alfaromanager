import { puntoHabitual, sortProductos, catLabel, type GastoCategoria } from "@/store/cuadreStore";
import React, { useState, useMemo, useRef, useEffect } from "react";
import type { PrecioTramo } from "@/store/cuadreStore";
import { useCuadreStore, PuntoVenta, Cuadre, Denominaciones, PUNTOS } from "@/store/cuadreStore";
import { usePinStore, hashPin } from "@/store/pinStore";
import { 
  enviarPrecuadre, 
  TurnoDependiente, 
  PrecuadreData, 
  GastoPrecuadre, 
  RecogidaPrecuadre 
} from "@/lib/turnos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Package,
  Trash2,
  WifiOff,
  Search,
  Plus,
  X,
  CreditCard,
  Edit2,
  Users
} from "lucide-react";

const enteroCUP = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dineroCUP = (monto: number) => enteroCUP.format(monto).replace(/,/g, ".");
type TramoVenta = Pick<PrecioTramo, "id" | "cantidad" | "precio">;

const DENOMINACIONES: (keyof Denominaciones)[] = [
  "20000",
  "10000",
  "5000",
  "2000",
  "1000",
  "500",
  "200",
  "100",
  "50",
  "20",
  "10",
  "5",
];

const emptyDen = (): Denominaciones => ({
  "20000": 0,
  "10000": 0,
  "5000": 0,
  "2000": 0,
  "1000": 0,
  "500": 0,
  "200": 0,
  "100": 0,
  "50": 0,
  "20": 0,
  "10": 0,
  "5": 0,
});

interface PrecuadreDependienteProps {
  puntoInicial?: PuntoVenta;
  dependienteInicial?: string;
  onFinalizado: () => void;
  onCancelar: () => void;
}

export function PrecuadreDependiente({
  puntoInicial = "Cafetería",
  dependienteInicial = "",
  onFinalizado,
  onCancelar,
}: PrecuadreDependienteProps) {
  const catalogo = useCuadreStore((s) => s.catalogo);
  const history = useCuadreStore((s) => s.history);
  const dependientes = useCuadreStore((s) => s.dependientes);
  const settings = useCuadreStore((s) => s.settings);
  const [turnoId] = useState(() => crypto.randomUUID());

  const [paso, setPaso] = useState<number>(1);

  // Paso 1: Turno
  const [punto, setPunto] = useState<PuntoVenta>(puntoInicial);
  const [dependiente, setDependiente] =
    useState<string>(dependienteInicial);
  const [diasTrabajados, setDiasTrabajados] = useState<number>(1);
  const [fechaTurno] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  // Filtrado de dependientes por punto
  const dependientesActivos = useMemo(() => dependientes.filter(
    (nombre) => !settings.dependientesInactivos?.includes(nombre)
  ), [dependientes, settings.dependientesInactivos]);
  const dependientesPunto = useMemo(() => dependientesActivos.filter(
    (nombre) => puntoHabitual(nombre, settings, history) === punto
  ), [dependientesActivos, settings, history, punto]);

  // Último cuadre cerrado
  const ultimoCuadrePunto = useMemo(() => {
    const ordenados = [...history]
      .filter((c) => c.puntoVenta === punto)
      .sort(
        (a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      );

    return ordenados[0] || null;
  }, [history, punto]);

  // Lista base de productos
  const [productosNuevosLocal, setProductosNuevosLocal] = useState<
    {
      id: string;
      nombre: string;
      precio: number;
      categoria: string;
    }[]
  >([]);

  const productosBase = useMemo(() => {
    const todos = [
      ...catalogo.filter((c) => !c.punto || c.punto === punto),
      ...productosNuevosLocal,
    ];

    return sortProductos(todos, settings.categorias).map((p) => {
      const pAnterior = ultimoCuadrePunto?.productos?.find(
        (ap) =>
          ap.nombre.toLowerCase().trim() ===
          p.nombre.toLowerCase().trim()
      );

      const inicioDefecto = pAnterior
        ? pAnterior.final ?? 0
        : 0;

      return {
        id: p.id,
        nombre: p.nombre,
        precioDefecto: p.precio ?? 0,
        categoria: p.categoria || "Sin categoría",
        inicioDefecto,
      };
    });
  }, [catalogo, productosNuevosLocal, ultimoCuadrePunto, punto, settings.categorias]);

  // Paso 2: Inicios
  const [inicios, setInicios] =
    useState<Record<string, number>>({});

  const [desbloqueados, setDesbloqueados] =
    useState<Record<string, boolean>>({});

  const [motivosPorProducto, setMotivosPorProducto] =
    useState<Record<string, string>>({});

  const [
    prodSeleccionadoDesbloqueo,
    setProdSeleccionadoDesbloqueo,
  ] = useState<{
    id: string;
    nombre: string;
  } | null>(null);

  const [motivoTemp, setMotivoTemp] = useState("");

  // Paso 3 y 4: Entradas, traslados y precios editables
  const [preciosEditados, setPreciosEditados] =
    useState<Record<string, number>>({});

  const [entradas, setEntradas] =
    useState<Record<string, number>>({});

  const [traslados, setTraslados] =
    useState<Record<string, number>>({});

  const [finales, setFinales] =
    useState<Record<string, number>>({});

  const [busquedaPaso3, setBusquedaPaso3] = useState("");
  const [modalNuevoProd, setModalNuevoProd] = useState(false);
  const [nuevoProdNombre, setNuevoProdNombre] = useState("");
  const [nuevoProdPrecio, setNuevoProdPrecio] = useState("");

  // Paso 5: Relevo y firma
  const [tipoRelevo, setTipoRelevo] =
    useState<"dependiente" | "admin">("dependiente");

  const [modoSuplencia, setModoSuplencia] = useState(false);
  const [entranteNombre, setEntranteNombre] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinValidado, setPinValidado] = useState(false);
  const [tieneFirma, setTieneFirma] = useState(false);
  const [firmaDataUrl, setFirmaDataUrl] = useState<string>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const dependientesRelevo = useMemo(() => {
    const fuente = modoSuplencia
      ? dependientesActivos
      : dependientesPunto;

    return fuente.filter((d) => d !== dependiente);
  }, [
    modoSuplencia,
    dependientesActivos,
    dependientesPunto,
    dependiente,
  ]);

  // Paso 6: Precios mixtos
  const [preciosMixtos, setPreciosMixtos] = useState<Record<string, TramoVenta[]>>({});

  const cambiarTramos = (id: string, cambiar: (tramos: TramoVenta[]) => TramoVenta[]) =>
    setPreciosMixtos((prev) => ({ ...prev, [id]: cambiar(prev[id] ?? []) }));

  // Paso 7: Gastos, salidas y transferencias
  const [gastos, setGastos] = useState<GastoPrecuadre[]>([]);

  const [gastoCat, setGastoCat] = useState<GastoCategoria>("Local");
  const [gastoTipo, setGastoTipo] = useState<"Efectivo" | "Producto">("Efectivo");
  const [gastoNombre, setGastoNombre] = useState("");
  const [gastoDesc, setGastoDesc] = useState("");
  const [gastoFecha, setGastoFecha] = useState(fechaTurno);
  const [gastoTransaccion, setGastoTransaccion] = useState("");
  const [gastoMontoEfectivo, setGastoMontoEfectivo] = useState("");
  const porcentajeTransferencia = settings.porcentajeTransferencia;
  const cargoTransferencia = Math.round((Number(gastoMontoEfectivo) || 0) * porcentajeTransferencia) / 100;
    const [gastoItems, setGastoItems] = useState<{ productoId: string; productoNombre: string; cantidad: number; precio: number }[]>([]);
  const [gastoProdSelId, setGastoProdSelId] = useState("");
  const [gastoProdCant, setGastoProdCant] = useState("");
  const [gastoProdPrecio, setGastoProdPrecio] = useState("");
  const [gastoProdOpen, setGastoProdOpen] = useState(false);
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null);

  // Paso 8: Recogidas y arqueo
  const [recogidas, setRecogidas] =
    useState<RecogidaPrecuadre[]>([]);

  const [recogidaMonto, setRecogidaMonto] = useState("");
  const [recogidaReceptor, setRecogidaReceptor] =
    useState("Yanitza");
  const [recogidaFecha, setRecogidaFecha] = useState(fechaTurno);
  const [denoms, setDenoms] =
    useState<Denominaciones>(emptyDen());

  const [usdMonto, setUsdMonto] = useState<string>("");
  const [usdTasa, setUsdTasa] = useState<string>("320");

  const [enviando, setEnviando] = useState(false);

  // Cálculos de ventas con soporte de precio mixto
  const resumenProductos = useMemo(() => {
    return productosBase.map((p) => {
      const ini = inicios[p.id] ?? p.inicioDefecto;
      const ent = entradas[p.id] ?? 0;
      const tras = traslados[p.id] ?? 0;
      const fin = finales[p.id] ?? 0;
      const disponible = ini + ent - tras;
      const vendidasTotal = Math.max(0, disponible - fin);
      const precioActual =
        preciosEditados[p.id] ?? p.precioDefecto;

      const tramos = preciosMixtos[p.id] ?? [];
      const cantidadTramos = tramos.reduce((total, tramo) => total + tramo.cantidad, 0);
      const cantidadBase = Math.max(0, vendidasTotal - cantidadTramos);
      const importe = cantidadBase * precioActual +
        tramos.reduce((total, tramo) => total + tramo.cantidad * tramo.precio, 0);

      return {
        ...p,
        precioActual,
        inicio: ini,
        entradas: ent,
        traslados: tras,
        final: fin,
        disponible,
        vendidas: vendidasTotal,
        importe,
        tramos,
        cantidadTramos,
        cantidadBase,
      };
    });
  }, [
    productosBase,
    inicios,
    entradas,
    traslados,
    finales,
    preciosEditados,
    preciosMixtos,
  ]);

  const totalVentas = useMemo(() => {
    return resumenProductos.reduce(
      (acc, p) => acc + p.importe,
      0
    );
  }, [resumenProductos]);

  const totalGastos = useMemo(() => {
    return gastos.reduce(
      (acc, g) => acc + g.monto,
      0
    );
  }, [gastos]);

  const totalRecogidas = useMemo(() => {
    return recogidas.reduce(
      (acc, r) => acc + r.monto,
      0
    );
  }, [recogidas]);

  const totalEfectivoCUP = useMemo(() => {
    return DENOMINACIONES.reduce(
      (sum, d) =>
        sum + parseInt(d) * (denoms[d] || 0),
      0
    );
  }, [denoms]);
  const efectivoArqueado =
    totalEfectivoCUP +
    (parseFloat(usdMonto) || 0) * (parseFloat(usdTasa) || 0);

  const diferencia =
    Math.round((efectivoArqueado + totalRecogidas - (totalVentas - totalGastos)) * 100) / 100;

  const validarPrecios = () => {
    const producto = resumenProductos.find((p) =>
      (
        (p.vendidas > 0 && (!Number.isFinite(p.precioActual) || p.precioActual <= 0)) ||
        Math.round((p.cantidadTramos - p.vendidas) * 1e8) > 0 ||
        p.tramos.some((tramo) =>
          !Number.isFinite(tramo.cantidad) || tramo.cantidad <= 0 ||
          !Number.isFinite(tramo.precio) || tramo.precio <= 0
        )
      )
    );

    if (!producto) return true;
    toast.error(`Revisa los precios y las cantidades vendidas de ${producto.nombre}.`);
    setPaso(6);
    return false;
  };
    // Paso 3: con inicio arriba y sin inicio debajo, ambos ordenados por categoría
  const productosOrdenadosPaso3 = useMemo(() => {
    const q = busquedaPaso3.toLowerCase().trim();
    const filtrados = q
      ? productosBase.filter((p) => p.nombre.toLowerCase().includes(q) || (p.categoria ?? "").toLowerCase().includes(q))
      : productosBase;

    const conInicio = filtrados.filter((p) => (inicios[p.id] ?? p.inicioDefecto) > 0);
    const sinInicio = filtrados.filter((p) => (inicios[p.id] ?? p.inicioDefecto) <= 0);

    return { conInicio, sinInicio };
  }, [productosBase, busquedaPaso3, inicios]);

  // Paso 4: productos con disponibilidad
  const productosConStockPaso4 = useMemo(() => {
    return resumenProductos.filter(
      (p) => p.disponible > 0
    );
  }, [resumenProductos]);

  // Manejo de canvas de firma
  const startDraw = (
    e: React.MouseEvent | React.TouchEvent
  ) => {
    setIsDrawing(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();

    const x =
      "touches" in e
        ? e.touches[0].clientX - rect.left
        : e.clientX - rect.left;

    const y =
      "touches" in e
        ? e.touches[0].clientY - rect.top
        : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (
    e: React.MouseEvent | React.TouchEvent
  ) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();

    const x =
      "touches" in e
        ? e.touches[0].clientX - rect.left
        : e.clientX - rect.left;

    const y =
      "touches" in e
        ? e.touches[0].clientY - rect.top
        : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setTieneFirma(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneFirma(false);
  };

  // Validar PIN de 6 dígitos
  const handleValidarPin = async (pin: string) => {
    if (!/^\d{6}$/.test(pin)) return;

    if (
      tipoRelevo === "dependiente" &&
      !entranteNombre
    ) {
      toast.error(
        "Selecciona primero la dependienta entrante"
      );
      return;
    }

    const usuarios = usePinStore
      .getState()
      .users.filter((usuario) =>
        tipoRelevo === "admin"
          ? usuario.role === "admin" ||
            usuario.role === "duena"
          : usuario.nombre.trim().toLowerCase() ===
            entranteNombre.trim().toLowerCase()
      );

    for (const usuario of usuarios) {
      if (
        (await hashPin(pin, usuario.id)) ===
        usuario.pinHash
      ) {
        setPinValidado(true);
        toast.success("PIN de relevo validado");
        return;
      }
    }

    toast.error(
      "PIN incorrecto para el relevo seleccionado"
    );
    setPinInput("");
  };

  // Agregar producto nuevo en el paso 3
  const handleGuardarNuevoProducto = () => {
    const nombre = nuevoProdNombre.trim();
    const precio = parseFloat(nuevoProdPrecio);

    if (
      !nombre ||
      isNaN(precio) ||
      precio <= 0
    ) {
      toast.error(
        "Indica un nombre válido y precio mayor a 0"
      );
      return;
    }

    const nuevoId = crypto.randomUUID();

    setProductosNuevosLocal((prev) => [
      ...prev,
      {
        id: nuevoId,
        nombre,
        precio,
        categoria: "Varios",
      },
    ]);

    setInicios((prev) => ({
      ...prev,
      [nuevoId]: 0,
    }));

    setPreciosEditados((prev) => ({
      ...prev,
      [nuevoId]: precio,
    }));

    setNuevoProdNombre("");
    setNuevoProdPrecio("");
    setModalNuevoProd(false);

    toast.success(
      `Producto "${nombre}" registrado`
    );
  };

  const iniciarEdicionGasto = (gasto: GastoPrecuadre) => {
    setEditingGastoId(gasto.id);
    setGastoCat(gasto.categoriaSugerida ?? (gasto.tipo === "transferencia" ? "Transferencia" : "Local"));
    setGastoTipo(gasto.tipo === "producto" ? "Producto" : "Efectivo");
    setGastoNombre(gasto.receptor);
    setGastoDesc(gasto.descripcion ?? "");
    setGastoMontoEfectivo(gasto.tipo === "producto" ? "" : String(gasto.monto));
    setGastoFecha(gasto.fecha ?? fechaTurno);
    setGastoTransaccion(gasto.transaccion ?? "");
    setGastoItems(gasto.items ?? (gasto.productoId && gasto.productoNombre && gasto.cantidadProducto
      ? [{
          productoId: gasto.productoId,
          productoNombre: gasto.productoNombre,
          cantidad: gasto.cantidadProducto,
          precio: gasto.precioProducto ?? gasto.monto / gasto.cantidadProducto,
        }]
      : []));
    setGastoProdSelId("");
    setGastoProdCant("");
    setGastoProdPrecio("");
  };

  // Agregar recogida en el paso 8
  const agregarRecogida = () => {
    const monto = parseFloat(recogidaMonto);

    if (isNaN(monto) || monto <= 0) {
      toast.error(
        "Indica un monto de recogida válido"
      );
      return;
    }

    if (!recogidaFecha || !recogidaReceptor.trim()) {
      toast.error("Indica la fecha y quién recogió el efectivo.");
      return;
    }
    setRecogidas((prev) => [...prev, {
      id: crypto.randomUUID(),
      fecha: recogidaFecha,
      quien: recogidaReceptor.trim(),
      monto,
    }]);
    setRecogidaMonto("");

    toast.success(
      `Recogida de $${dineroCUP(monto)} CUP agregada`
    );
  };

  // Enviar pre-cuadre final
    const handleEnviar = async () => {
    if (!validarPrecios()) return;
    setEnviando(true);

    try {
      const payload: PrecuadreData = {
        diasTrabajados,
        iniciosDeTurnoAnterior: true,


        iniciosModificados:
          Object.values(desbloqueados).some(
            Boolean
          ),

        motivoModificacionInicios:
          Object.entries(motivosPorProducto)
            .map(
              ([id, m]) =>
                `${
                  catalogo.find(
                    (p) => p.id === id
                  )?.nombre
                }: ${m}`
            )
            .join(" | "),

        productos: resumenProductos.map(
          (p) => ({
            id: p.id,
            nombre: p.nombre,
            inicio: p.inicio,
            entradas: p.entradas,
            traslados: p.traslados,
            final: p.final,
            precio: p.precioActual,
            categoria: p.categoria,
            vendidas: p.vendidas,
            importe: p.importe,
            tramos: p.tramos,
          })
        ),

        tipoRelevo,

        entranteNombre:
          tipoRelevo === "admin"
            ? "Admin / Dueña"
            : entranteNombre,

        entranteFirma: firmaDataUrl,
        entranteValidado: pinValidado,
        totalVentas,
        gastos,
        totalGastos,
        recogidas,
        totalRecogidas,
        denominaciones: denoms,

        efectivoTotal:
          totalEfectivoCUP +
          (parseFloat(usdMonto) || 0) *
            (parseFloat(usdTasa) || 0),

        usdMonto:
          parseFloat(usdMonto) || 0,

        usdTasa:
          parseFloat(usdTasa) || 0,
      };

      const guardado =
        await enviarPrecuadre(
          turnoId,
          punto,
          dependiente,
          payload
        );

      if (!guardado) {
        toast.error(
          "Error al guardar el pre-cuadre"
        );
        return;
      }

      toast.success("Pre-cuadre guardado");
      onFinalizado();
    } catch (e: any) {
      toast.error(
        e?.message ||
          "Error al procesar el pre-cuadre"
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Barra superior con navegación */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onCancelar}
          >
            <X className="h-4 w-4 mr-1" />
            Salir
          </Button>

          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Pre-cuadre Dependiente
            </span>

            <div className="text-[11px] text-muted-foreground">
              Paso {paso} de 9
            </div>
          </div>

          <Badge
            variant="outline"
            className="text-[10px] font-bold"
          >
            {punto}
          </Badge>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Título de cada paso */}
        <div className="border-b border-border/60 pb-2">
          <h1 className="text-lg font-extrabold text-foreground">
            {paso === 1 &&
              "Paso 1: Datos del Turno"}

            {paso === 2 &&
              "Paso 2: Inventario Inicial (Bajo Candado)"}

            {paso === 3 &&
              "Paso 3: Entradas y Traslados"}

            {paso === 4 &&
              "Paso 4: Conteo Físico Final"}

            {paso === 5 &&
              "Paso 5: Relevo y Firma Digital"}

            {paso === 6 &&
              "Paso 6: Resultados y Precios"}

            {paso === 7 &&
              "Paso 7: Gastos, Transferencias y Salidas"}

            {paso === 8 &&
              "Paso 8: Recogidas y Arqueo de Efectivo"}

            {paso === 9 &&
              "Paso 9: Resumen y Confirmación"}
          </h1>
        </div>

        {/* PASO 1 */}
        {paso === 1 && (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl border border-border bg-card space-y-3 shadow-soft">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Punto de Venta
                </label>

                                <div className="flex gap-2">
                  {PUNTOS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={
                        punto === p
                          ? "default"
                          : "outline"
                      }
                      className="rounded-xl h-10 font-bold text-xs"
                      onClick={() => {
                        setPunto(p);
                        setInicios({});
                        setDesbloqueados({});
                        setMotivosPorProducto({});
                      }}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Dependienta en Turno
                </label>

                <Select
                  value={dependiente}
                  onValueChange={setDependiente}
                >
                  <SelectTrigger className="rounded-xl h-10 font-medium">
                    <SelectValue placeholder="Selecciona tu nombre..." />
                  </SelectTrigger>

                  <SelectContent>
                    {dependientesPunto.map((d) => (
                      <SelectItem
                        key={d}
                        value={d}
                      >
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Días Trabajados en este Turno
                </label>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 rounded-xl font-bold text-lg"
                    disabled={diasTrabajados <= 1}
                    onClick={() =>
                      setDiasTrabajados((prev) =>
                        Math.max(1, prev - 1)
                      )
                    }
                  >
                    -
                  </Button>

                  <div className="flex-1 text-center py-2 bg-muted/40 rounded-xl">
                    <span className="text-xl font-black text-foreground">
                      {diasTrabajados}
                    </span>

                    <span className="text-xs text-muted-foreground block">
                      {diasTrabajados === 1
                        ? "día trabajado"
                        : "días trabajados"}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 rounded-xl font-bold text-lg"
                    disabled={diasTrabajados >= 15}
                    onClick={() =>
                      setDiasTrabajados(
                        (prev) => prev + 1
                      )
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            <Button
              className="w-full rounded-2xl font-bold h-12"
              disabled={!dependiente}
              onClick={() => setPaso(2)}
            >
              Continuar al Inventario Inicial
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* PASO 2 */}
        {paso === 2 && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <Lock className="h-4 w-4" />
                Inicios Protegidos con Candado
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Importados de los finales del último
                turno cerrado. Si necesitas corregir
                alguno, pulsa el candado e indica el
                motivo.
              </p>
            </div>

            <div className="space-y-2">
              {productosBase
                .filter(
                  (p) => p.inicioDefecto > 0
                )
                .map((p) => {
                  const estaDesbloqueado =
                    !!desbloqueados[p.id];

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border bg-card transition-all ${
                        estaDesbloqueado
                          ? "border-amber-500/50 bg-amber-500/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex-1 pr-2">
                        <div className="font-semibold text-sm">
                          {p.nombre}
                        </div>

                        <div className="text-[11px] text-muted-foreground">
                          Precio venta:{" "}
                          <span className="font-semibold text-primary">
                            ${dineroCUP(preciosEditados[p.id] ?? p.precioDefecto)}
                          </span>

                          {estaDesbloqueado && (
                            <span className="text-amber-600 dark:text-amber-400 block font-medium">
                              Desbloqueado:{" "}
                              {motivosPorProducto[
                                p.id
                              ] || "Justificado"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          disabled={
                            !estaDesbloqueado
                          }
                          value={inicios[p.id] ?? p.inicioDefecto}
                          onChange={(e) =>
                            setInicios({
                              ...inicios,
                              [p.id]:
                                parseFloat(
                                  e.target.value
                                ) || 0,
                            })
                          }
                          className="w-20 text-right h-9 rounded-xl font-bold text-sm"
                        />

                        <Button
                          type="button"
                          variant={
                            estaDesbloqueado
                              ? "destructive"
                              : "outline"
                          }
                          size="icon"
                          className="h-9 w-9 rounded-xl shrink-0"
                          onClick={() => {
                            if (
                              estaDesbloqueado
                            ) {
                              setDesbloqueados(
                                (prev) => ({
                                  ...prev,
                                  [p.id]: false,
                                })
                              );
                            } else {
                              setProdSeleccionadoDesbloqueo(
                                {
                                  id: p.id,
                                  nombre: p.nombre,
                                }
                              );

                              setMotivoTemp("");
                            }
                          }}
                        >
                          {estaDesbloqueado ? (
                            <Unlock className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(1)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                onClick={() => setPaso(3)}
              >
                Siguiente
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {prodSeleccionadoDesbloqueo && (
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-xl">
                  <h3 className="font-bold text-sm text-foreground">
                    Desbloquear inicio de{" "}
                    {
                      prodSeleccionadoDesbloqueo.nombre
                    }
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    Indica el motivo por el cual la
                    existencia inicial importada es
                    incorrecta:
                  </p>

                  <Input
                    placeholder="Ej. Error de conteo verificado en el turno previo"
                    value={motivoTemp}
                    onChange={(e) =>
                      setMotivoTemp(
                        e.target.value
                      )
                    }
                    className="rounded-xl text-xs"
                    autoFocus
                  />

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() =>
                        setProdSeleccionadoDesbloqueo(
                          null
                        )
                      }
                    >
                      Cancelar
                    </Button>

                    <Button
                      size="sm"
                      disabled={
                        !motivoTemp.trim()
                      }
                      className="flex-1 rounded-xl font-bold"
                      onClick={() => {
                        const id =
                          prodSeleccionadoDesbloqueo.id;

                        setDesbloqueados(
                          (prev) => ({
                            ...prev,
                            [id]: true,
                          })
                        );

                        setMotivosPorProducto(
                          (prev) => ({
                            ...prev,
                            [id]:
                              motivoTemp.trim(),
                          })
                        );

                        setProdSeleccionadoDesbloqueo(
                          null
                        );

                        toast.warning(
                          `Inicio de ${prodSeleccionadoDesbloqueo.nombre} desbloqueado`
                        );
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
            {/* Nota informativa requerida */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-primary mb-1">
                Debe declarar las entradas y traslados concebidos en el turno.
              </p>
              <p className="text-[11px]">
                Al igual que debe declarar algún cambio de precio y ponerlo en la casilla <strong>"Precio CUP"</strong>. Además, si hay dos precios en algún producto, se debe poner el precio nuevo aquí y más adelante, en el paso de resultados, se debe declarar cuántas unidades se vendieron al precio anterior.
              </p>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto por letra o categoría..."
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
                <Plus className="mr-1.5 h-4 w-4 text-primary" />
                Agregar Producto Nuevo
              </Button>
            </div>

            {/* SECCIÓN 1: PRODUCTOS CON INICIO */}
            {productosOrdenadosPaso3.conInicio.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Productos con Inicio ({productosOrdenadosPaso3.conInicio.length})
                  </span>
                </div>
                {productosOrdenadosPaso3.conInicio.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {(i === 0 || productosOrdenadosPaso3.conInicio[i - 1].categoria !== p.categoria) && (
                      <h3 className="pt-1 text-xs font-bold text-muted-foreground">{p.categoria || "Varios"}</h3>
                    )}
                    <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-bold truncate">{p.nombre}</p>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          Inicio: {inicios[p.id] ?? p.inicioDefecto}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {([
                          ["Entradas", entradas[p.id] ?? "", setEntradas],
                          ["Traslados", traslados[p.id] ?? "", setTraslados],
                          ["Precio CUP", preciosEditados[p.id] ?? p.precioDefecto, setPreciosEditados],
                        ] as const).map(([etiqueta, valor, guardar]) => (
                          <label key={etiqueta} className="min-w-0">
                            <span className="text-[10px] text-muted-foreground block truncate">{etiqueta}</span>
                            <Input
                              type="number"
                              step="any"
                              value={valor}
                              placeholder="0"
                              onChange={(e) => {
                                const numero = Number(e.target.value);
                                guardar((prev) => ({ ...prev, [p.id]: numero }));
                              }}
                              className="mt-0.5 h-9 px-2 text-right font-medium"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* SECCIÓN 2: PRODUCTOS SIN INICIO */}
            {productosOrdenadosPaso3.sinInicio.length > 0 && (
              <div className="space-y-3 pt-3">
                <div className="flex items-center gap-2 border-b border-border pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Productos sin Inicio ({productosOrdenadosPaso3.sinInicio.length})
                  </span>
                </div>
                {productosOrdenadosPaso3.sinInicio.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {(i === 0 || productosOrdenadosPaso3.sinInicio[i - 1].categoria !== p.categoria) && (
                      <h3 className="pt-1 text-xs font-bold text-muted-foreground">{p.categoria || "Varios"}</h3>
                    )}
                    <div className="space-y-2 rounded-2xl border border-dashed border-border bg-card/60 p-3">
                      <p className="text-sm font-semibold truncate text-muted-foreground">{p.nombre}</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {([
                          ["Entradas", entradas[p.id] ?? "", setEntradas],
                          ["Traslados", traslados[p.id] ?? "", setTraslados],
                          ["Precio CUP", preciosEditados[p.id] ?? p.precioDefecto, setPreciosEditados],
                        ] as const).map(([etiqueta, valor, guardar]) => (
                          <label key={etiqueta} className="min-w-0">
                            <span className="text-[10px] text-muted-foreground block truncate">{etiqueta}</span>
                            <Input
                              type="number"
                              step="any"
                              value={valor}
                              placeholder="0"
                              onChange={(e) => {
                                const numero = Number(e.target.value);
                                guardar((prev) => ({ ...prev, [p.id]: numero }));
                              }}
                              className="mt-0.5 h-9 px-2 text-right"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(2)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                onClick={() => setPaso(4)}
              >
                Conteo Final
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {modalNuevoProd && (
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-xl">
                  <h3 className="font-bold text-sm">
                    Registrar Producto Nuevo
                  </h3>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        Nombre con mililitros o
                        formato (Ej. Cerveza
                        Parranda 1500 ml)
                      </label>

                      <Input
                        placeholder="Ej. Cerveza Mayabe 355 ml"
                        value={nuevoProdNombre}
                        onChange={(e) =>
                          setNuevoProdNombre(
                            e.target.value
                          )
                        }
                        className="rounded-xl text-xs font-semibold"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">
                        Precio de Venta (CUP)
                      </label>

                      <Input
                        type="number"
                        placeholder="Ej. 250"
                        value={nuevoProdPrecio}
                        onChange={(e) =>
                          setNuevoProdPrecio(
                            e.target.value
                          )
                        }
                        className="rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() =>
                        setModalNuevoProd(false)
                      }
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
              Ingresa el conteo físico final de los productos con disponibilidad en el turno:
            </div>

            <div className="space-y-2">
              {productosConStockPaso4.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-border bg-card shadow-soft"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {p.nombre}
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      Existencia previa:{" "}
                      <span className="font-bold text-foreground">
                        {p.disponible}
                      </span>{" "}
                      • ${dineroCUP(p.precioActual)}
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
                        [p.id]:
                          e.target.value === ""
                            ? 0
                            : parseFloat(e.target.value),
                      })
                    }
                    className="w-24 text-right h-9 rounded-xl font-bold text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(3)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                onClick={() => setPaso(5)}
              >
                Relevo y Firma
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 5 */}
        {paso === 5 && (
          <div className="space-y-4 pt-1">
            <div className="flex gap-2">
              <Button
                variant={
                  tipoRelevo === "dependiente"
                    ? "default"
                    : "outline"
                }
                className="flex-1 rounded-2xl text-xs h-10 font-bold"
                onClick={() => {
                  setTipoRelevo("dependiente");
                  setPinValidado(false);
                }}
              >
                Relevo Dependiente
              </Button>

              <Button
                variant={
                  tipoRelevo === "admin"
                    ? "default"
                    : "outline"
                }
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
                    Dependienta Entrante{" "}
                    {modoSuplencia
                      ? "(Todos los puntos)"
                      : `(${punto})`}
                  </label>

                  <Button
                    type="button"
                    variant={
                      modoSuplencia
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="h-6 text-[11px] px-2 rounded-lg"
                    onClick={() => {
                      setModoSuplencia((prev) => !prev);
                      setEntranteNombre("");
                      setPinValidado(false);
                      setPinInput("");
                    }}
                  >
                    <Users className="h-3 w-3 mr-1" />

                    {modoSuplencia
                      ? "Solo este punto"
                      : "Suplencia"}
                  </Button>
                </div>

                <Select
                  value={entranteNombre}
                  onValueChange={(val) => {
                    setEntranteNombre(val);
                    setPinValidado(false);
                    setPinInput("");
                  }}
                >
                  <SelectTrigger className="rounded-xl h-10 font-medium">
                    <SelectValue placeholder="Selecciona quién recibe..." />
                  </SelectTrigger>

                  <SelectContent>
                    {dependientesRelevo.map((d) => (
                      <SelectItem
                        key={d}
                        value={d}
                      >
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="p-3 bg-muted/40 rounded-2xl text-xs text-muted-foreground">
                Cierre administrativo: Se validará con el PIN de 6 dígitos del Administrador o Dueña.
              </div>
            )}

            <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  PIN de Confirmación (6 dígitos)
                </span>

                {pinValidado && (
                  <Badge
                    variant="default"
                    className="bg-emerald-600 text-white text-[10px] font-bold"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Validado
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={pinInput}
                  disabled={pinValidado}
                  onChange={(e) => {
                    const val =
                      e.target.value.replace(
                        /\D/g,
                        ""
                      );

                    setPinInput(val);

                    if (val.length === 6) {
                      handleValidarPin(val);
                    }
                  }}
                  className="rounded-xl tracking-widest text-center font-bold text-base h-11"
                />

                {!pinValidado && (
                  <Button
                    type="button"
                    className="rounded-xl font-bold px-4"
                    disabled={
                      pinInput.length !== 6
                    }
                    onClick={() =>
                      handleValidarPin(pinInput)
                    }
                  >
                    Validar
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Firma Táctil del Relevo Entrante
                </label>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={clearCanvas}
                >
                  Limpiar
                </Button>
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
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(4)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                disabled={
                  !tieneFirma ||
                  !pinValidado ||
                  (tipoRelevo === "dependiente" &&
                    !entranteNombre)
                }
                onClick={() => {
                  const firma =
                    canvasRef.current?.toDataURL(
                      "image/png"
                    );

                  if (firma && tieneFirma) {
                    setFirmaDataUrl(firma);
                  }

                  setTieneFirma(false);
                  setPaso(6);
                }}
              >
                Ver Resultados
                <ArrowRight className="ml-1 h-4 w-4" />
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

                <span className="text-2xl font-black text-primary">
                  ${dineroCUP(totalVentas)} CUP
                </span>
              </div>

              
            </div>

            <div className="space-y-2">
              {resumenProductos
                .filter(
                  (p) =>
                    p.vendidas > 0 ||
                    p.disponible > 0
                )
                .map((p) => (
                  <div key={p.id} className="space-y-2 rounded-2xl border border-border bg-card p-3.5 text-xs shadow-soft">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-sm">{p.nombre}</span>
                      <strong className="shrink-0">${dineroCUP(p.importe)} CUP</strong>
                    </div>
                    <p className="text-muted-foreground">
                      Inicio {p.inicio} · Entrada {p.entradas} · Traslado {p.traslados} · Final {p.final} · Venta {p.vendidas}
                    </p>
                    <label className="block text-muted-foreground">
                      Precio base (CUP)
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={p.precioActual || ""}
                        onChange={(e) => {
                          const precio = Number(e.target.value);
                          setPreciosEditados((prev) => ({ ...prev, [p.id]: precio }));
                        }}
                        className="mt-1 h-8 rounded-lg"
                      />
                    </label>

                                                            {/* Precios Mixtos bajo demanda */}
                    {p.tramos.length === 0 ? (
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={p.vendidas <= 0}
                          onClick={() => {
                            const tramo = { id: crypto.randomUUID(), cantidad: 0, precio: p.precioActual };
                            cambiarTramos(p.id, () => [tramo]);
                          }}
                          className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-primary rounded-lg border-dashed gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Precio mixto</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/80 bg-muted/20 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">Desglose de precios mixtos</span>
                          <span className="text-[10px] text-muted-foreground">Oficial: ${dineroCUP(p.precioActual)} CUP</span>
                        </div>

                        {/* Unidades vendidas al precio base */}
                        <div className="p-2 bg-card rounded-lg border border-border/50 text-xs flex justify-between items-center font-medium">
                          <span>Al precio base (${dineroCUP(p.precioActual)} CUP):</span>
                          <strong className="text-primary">{p.cantidadBase} u. = ${dineroCUP(p.cantidadBase * p.precioActual)} CUP</strong>
                        </div>

                        {/* Tramos al precio mixto */}
                        {p.tramos.map((tramo) => (
                          <div key={tramo.id} className="p-2 bg-card rounded-lg border border-border/50 space-y-1.5 text-xs">
                            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                              <label className="min-w-0">
                                <span className="text-[10px] text-muted-foreground">Cant. a otro precio</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={tramo.cantidad || ""}
                                  onChange={(e) => {
                                    const valor = Number(e.target.value);
                                    cambiarTramos(p.id, (actuales) =>
                                      actuales.map((t) => (t.id === tramo.id ? { ...t, cantidad: valor } : t))
                                    );
                                  }}
                                  className="h-8 text-right"
                                />
                              </label>

                              <label className="min-w-0">
                                <span className="text-[10px] text-muted-foreground">Precio mixto (CUP)</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={tramo.precio || ""}
                                  onChange={(e) => {
                                    const valor = Number(e.target.value);
                                    cambiarTramos(p.id, (actuales) =>
                                      actuales.map((t) => (t.id === tramo.id ? { ...t, precio: valor } : t))
                                    );
                                  }}
                                  className="h-8 text-right font-bold"
                                />
                              </label>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => cambiarTramos(p.id, (actuales) => actuales.filter((t) => t.id !== tramo.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="text-right text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {tramo.cantidad} × ${dineroCUP(tramo.precio)} = ${dineroCUP(tramo.cantidad * tramo.precio)} CUP
                            </div>
                          </div>
                        ))}

                        {Math.round((p.cantidadTramos - p.vendidas) * 1e8) > 0 && (
                          <p className="text-[11px] font-semibold text-destructive">
                            ⚠️ Los tramos ({p.cantidadTramos}) superan las unidades vendidas ({p.vendidas}).
                          </p>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const tramo = { id: crypto.randomUUID(), cantidad: 0, precio: p.precioActual };
                              cambiarTramos(p.id, (actuales) => [...actuales, tramo]);
                            }}
                            className="text-xs h-7 rounded-lg"
                          >
                            + Otro tramo
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => cambiarTramos(p.id, () => [])}
                            className="text-xs h-7 text-muted-foreground hover:text-destructive"
                          >
                            Eliminar precios mixtos
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(5)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                                onClick={() => {
                  if (validarPrecios()) setPaso(7);
                }}
              >
                Declarar Gastos
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

                {/* PASO 7 */}
        {paso === 7 && (
          <div className="space-y-4 pt-1">
            <div className="p-4 bg-card rounded-2xl border border-border shadow-soft space-y-3">
              {/* Categoría */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Categoría</label>
                <Select value={gastoCat} onValueChange={(v) => {
                  setGastoCat(v as GastoCategoria);
                  if (v === "Transferencia") setGastoTipo("Efectivo");
                }}>
                  <SelectTrigger className="h-10 rounded-xl text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Local">Local</SelectItem>
                    <SelectItem value="Yanitza">Yanitza</SelectItem>
                    <SelectItem value="Salida de efectivo">Salida de efectivo</SelectItem>
                    <SelectItem value="Cuentas por Cobrar">Cuentas por Cobrar</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo: Efectivo o Producto */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={gastoTipo === "Efectivo" ? "default" : "outline"}
                  onClick={() => setGastoTipo("Efectivo")}
                  className="h-9 rounded-xl text-xs font-bold"
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Efectivo
                </Button>
                <Button
                  type="button"
                  variant={gastoTipo === "Producto" ? "default" : "outline"}
                  onClick={() => setGastoTipo("Producto")}
                  disabled={gastoCat === "Transferencia"}
                  className="h-9 rounded-xl text-xs font-bold"
                >
                  <Package className="h-3.5 w-3.5 mr-1" /> Producto
                </Button>
              </div>

              {/* Nombre (quién recibe) - Texto libre */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Nombre (quién recibe)
                </label>
                <Input
                  placeholder={gastoCat === "Cuentas por Cobrar" ? "Nombre del cliente" : "Nombre de quien recibe"}
                  value={gastoNombre}
                  onChange={(e) => setGastoNombre(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>

              {/* Descripción opcional */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Descripción (opcional)
                </label>
                <Input
                  placeholder="Detalle o motivo"
                  value={gastoDesc}
                  onChange={(e) => setGastoDesc(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>

              {gastoCat === "Transferencia" && (
                <div className="space-y-2 text-xs">
                  <label className="block">
                    Fecha de transferencia
                    <Input type="date" value={gastoFecha} onChange={(e) => setGastoFecha(e.target.value)} />
                  </label>
                  <label className="block">
                    Número de transacción (opcional)
                    <Input value={gastoTransaccion} onChange={(e) => setGastoTransaccion(e.target.value)} />
                  </label>
                  <p>Cargo ({porcentajeTransferencia} %): ${dineroCUP(cargoTransferencia)} CUP</p>
                  <p>Monto recibido: ${dineroCUP(Number(gastoMontoEfectivo) + cargoTransferencia)} CUP</p>
                </div>
              )}

              {/* Si es Efectivo: Monto */}
              {gastoTipo === "Efectivo" ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Monto en CUP</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={gastoMontoEfectivo}
                    onChange={(e) => setGastoMontoEfectivo(e.target.value)}
                    className="h-10 rounded-xl text-xs font-bold text-right"
                  />
                </div>
              ) : (
                /* Canasta de Productos (igual que el admin) */
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-primary">Cesta de productos de esta salida</div>
                  {gastoItems.length > 0 && (
                    <div className="space-y-1">
                      {gastoItems.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-card p-2 rounded-lg text-xs border">
                          <span className="truncate flex-1 font-medium">{it.productoNombre}</span>
                          <span className="text-muted-foreground mx-2">{it.cantidad} × ${dineroCUP(it.precio)}</span>
                          <strong className="mr-2">${dineroCUP(it.cantidad * it.precio)}</strong>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => setGastoItems((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                                    {/* Selector y buscador integrado en el mismo campo */}
                  <div className="space-y-2 pt-1">
                    <Popover open={gastoProdOpen} onOpenChange={setGastoProdOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="h-10 w-full justify-between rounded-xl font-normal text-xs bg-background"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Search className="h-3.5 w-3.5 opacity-60 shrink-0" />
                            {gastoProdSelId ? (
                              <span className="truncate font-medium">
                                {resumenProductos.find((x) => x.id === gastoProdSelId)?.nombre} · disp:{" "}
                                {resumenProductos.find((x) => x.id === gastoProdSelId)?.disponible} · $
                                {dineroCUP(resumenProductos.find((x) => x.id === gastoProdSelId)?.precioActual ?? 0)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Buscar producto con existencia…</span>
                            )}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Escribe para buscar…" className="h-9 text-xs" />
                          <CommandList>
                            <CommandEmpty className="p-2 text-xs text-muted-foreground text-center">
                              Sin productos con existencia
                            </CommandEmpty>
                            <CommandGroup className="max-h-56 overflow-y-auto">
                              {resumenProductos
                                .filter((p) => p.disponible > 0)
                                .map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.nombre}
                                    onSelect={() => {
                                      setGastoProdSelId(p.id);
                                      setGastoProdPrecio(String(p.precioActual));
                                      if (!gastoProdCant) setGastoProdCant("1");
                                      setGastoProdOpen(false);
                                    }}
                                    className="text-xs cursor-pointer flex justify-between"
                                  >
                                    <span className="truncate font-medium">{p.nombre}</span>
                                    <span className="text-muted-foreground shrink-0 ml-2">
                                      disp: {p.disponible} · ${dineroCUP(p.precioActual)}
                                    </span>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="Cantidad"
                        value={gastoProdCant}
                        onChange={(e) => setGastoProdCant(e.target.value)}
                        className="h-9 rounded-xl text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Precio unitario"
                        value={gastoProdPrecio}
                        onChange={(e) => setGastoProdPrecio(e.target.value)}
                        className="h-9 rounded-xl text-xs font-semibold"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full h-8 rounded-xl text-xs font-bold"
                      onClick={() => {
                        const cant = Number(gastoProdCant);
                        const prec = Number(gastoProdPrecio);
                        const p = resumenProductos.find((x) => x.id === gastoProdSelId);
                        if (!p || cant <= 0 || prec <= 0) {
                          return toast.error("Selecciona producto, cantidad y precio");
                        }
                        setGastoItems((prev) => [
                          ...prev,
                          { productoId: p.id, productoNombre: p.nombre, cantidad: cant, precio: prec },
                        ]);
                        setGastoProdSelId("");
                        setGastoProdCant("");
                        setGastoProdPrecio("");
                      }}
                    >
                      + Agregar producto a la cesta
                    </Button>
                  </div>
                </div>
              )}

              {/* Botón Guardar Gasto */}
              <Button
                type="button"
                className="w-full h-10 rounded-xl font-bold"
                onClick={() => {
                  const esTransferencia = gastoCat === "Transferencia";
                  if (esTransferencia && !gastoFecha) return toast.error("Indica la fecha de transferencia");
                  if (!gastoNombre.trim() && !esTransferencia) {
                    return toast.error("Indica el nombre de quien recibe o cliente");
                  }
                  if (gastoTipo === "Efectivo") {
                    const m = Number(gastoMontoEfectivo);
                    if (!Number.isFinite(m) || m <= 0) return toast.error("Indica un monto válido");
                    const nuevo: GastoPrecuadre = {
                      id: editingGastoId || crypto.randomUUID(),
                      tipo: esTransferencia ? "transferencia" : "efectivo",
                      receptor: gastoNombre.trim() || "Transferencia",
                      categoriaSugerida: gastoCat,
                      sinClasificar: true,
                      descripcion: gastoDesc.trim(),
                      monto: m,
                      fecha: esTransferencia ? gastoFecha : fechaTurno,
                      ...(esTransferencia && {
                        transaccion: gastoTransaccion.trim() || undefined,
                        porcentaje: porcentajeTransferencia,
                        montoRecibido: m + cargoTransferencia,
                      }),
                    };
                    setGastos((prev) => (editingGastoId ? prev.map((g) => (g.id === editingGastoId ? nuevo : g)) : [...prev, nuevo]));
                  } else {
                    if (gastoItems.length === 0) return toast.error("Añade al menos un producto a la cesta");
                    const montoTotal = gastoItems.reduce((acc, it) => acc + it.cantidad * it.precio, 0);
                    const primer = gastoItems[0];
                    const nuevo: GastoPrecuadre = {
                      id: editingGastoId || crypto.randomUUID(),
                      tipo: "producto",
                      receptor: gastoNombre.trim(),
                      categoriaSugerida: gastoCat,
                      sinClasificar: true,
                      items: gastoItems,
                      descripcion: gastoDesc.trim(),
                      monto: montoTotal,
                      productoId: primer.productoId,
                      productoNombre: gastoItems.length === 1 ? primer.productoNombre : gastoItems.map((i) => i.productoNombre).join(", "),
                      cantidadProducto: primer.cantidad,
                      precioProducto: primer.precio,
                      fecha: fechaTurno,
                    };
                    setGastos((prev) => (editingGastoId ? prev.map((g) => (g.id === editingGastoId ? nuevo : g)) : [...prev, nuevo]));
                  }
                  // Resetear formulario
                  setEditingGastoId(null);
                  setGastoNombre("");
                  setGastoDesc("");
                  setGastoMontoEfectivo("");
                  setGastoItems([]);
                  setGastoProdSelId("");
                  setGastoProdCant("");
                  setGastoProdPrecio("");
                  setGastoFecha(fechaTurno);
                  setGastoTransaccion("");
                  toast.success("Salida registrada");
                }}
              >
                {editingGastoId ? "Actualizar Salida" : "+ Registrar Salida"}
              </Button>
            </div>

            {/* Lista de gastos registrados con Editar y Eliminar */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Salidas registradas ({gastos.length})
              </span>
              {gastos.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-2xl bg-card">
                  No hay salidas ni gastos registrados en este turno.
                </div>
              ) : (
                gastos.map((g) => (
                  <div key={g.id} className="p-3 bg-card border rounded-2xl flex justify-between items-center text-xs shadow-soft">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold truncate text-foreground">{g.receptor}</div>
                      <div className="text-muted-foreground text-[11px] truncate">
                        {g.tipo === "producto" ? (g.productoNombre || "Producto") : g.tipo === "transferencia" ? "Transferencia" : "Efectivo"}
                        {g.descripcion ? ` · ${g.descripcion}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-destructive font-mono">-${dineroCUP(g.monto)}</span>
                      <Button type="button" variant="ghost" size="icon" aria-label="Editar salida" onClick={() => iniciarEdicionGasto(g)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setGastos((prev) => prev.filter((x) => x.id !== g.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                                        </div>
                  </div>
                ))
              )}
            </div>

            {/* BOTONES DE NAVEGACIÓN PASO 7 */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(6)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                onClick={() => setPaso(8)}
              >
                Arqueo de Efectivo
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 8 */}
        {paso === 8 && (
          <div className="space-y-4 pt-1">
            {/* Recogidas Parciales */}
            <div className="p-4 bg-muted/30 rounded-2xl space-y-3">
              <span className="text-xs font-bold block text-foreground">
                Recogidas Parciales de Efectivo
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Quién recogió
                  </label>

                  <Input value={recogidaReceptor} onChange={(e) => setRecogidaReceptor(e.target.value)}
                    aria-label="Quién recogió" />

                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Monto entregado
                  </label>

                  <Input
                    type="number"
                    placeholder="Monto CUP"
                    value={recogidaMonto}
                    onChange={(e) => setRecogidaMonto(e.target.value)}
                    className="rounded-xl text-xs font-bold h-9"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  type="date"
                  aria-label="Fecha de recogida"
                  value={recogidaFecha}
                  onChange={(e) => setRecogidaFecha(e.target.value)}
                  className="rounded-xl text-xs h-9 flex-1"
                />

                <Button
                  size="sm"
                  className="rounded-xl font-bold px-4 h-9"
                  onClick={agregarRecogida}
                >
                  + Recogida
                </Button>
              </div>

              {recogidas.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between items-center text-xs py-1.5 border-b border-border/40"
                >
                  <div>
                    <span className="font-semibold">
                      {r.quien || r.nota || "Recogida"}
                    </span>

                    <span className="text-[10px] text-muted-foreground block">
                      {r.fecha ?? r.hora}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold">${dineroCUP(r.monto)}</span>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() =>
                        setRecogidas((prev) =>
                          prev.filter((item) => item.id !== r.id)
                        )
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Billetes CUP */}
            <div className="space-y-2">
              <span className="text-xs font-semibold block">
                Billetes en Caja (CUP)
              </span>

              <div className="space-y-2">
                {DENOMINACIONES.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-between p-2.5 rounded-2xl border border-border bg-card"
                  >
                    <span className="text-xs font-bold">${dineroCUP(Number(d))}</span>

                    <Input
                      type="number"
                      placeholder="0"
                      value={denoms[d] || ""}
                      onChange={(e) =>
                        setDenoms({
                          ...denoms,
                          [d]: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-16 h-8 text-right font-bold text-xs rounded-lg"
                    />
                    <span className="w-24 text-right text-xs font-bold">${dineroCUP(Number(d) * (denoms[d] || 0))} CUP</span>
                  </div>
                ))}
              </div>
            </div>

            {/* USD */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl border border-border bg-card">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">
                  USD en Caja
                </span>

                <Input
                  type="number"
                  placeholder="0 USD"
                  value={usdMonto}
                  onChange={(e) => setUsdMonto(e.target.value)}
                  className="rounded-xl h-9 text-xs font-bold"
                />
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">
                  Tasa Cambio CUP
                </span>

                <Input
                  type="number"
                  value={usdTasa}
                  onChange={(e) => setUsdTasa(e.target.value)}
                  className="rounded-xl h-9 text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl flex-1 h-12"
                onClick={() => setPaso(7)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
              </Button>

              <Button
                className="rounded-2xl flex-1 font-bold h-12"
                onClick={() => setPaso(9)}
              >
                Resumen y Envío
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 9 */}
        {paso === 9 && (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-3xl border border-border bg-card space-y-3 shadow-soft">
              <h3 className="font-extrabold text-sm text-foreground border-b border-border/50 pb-2">
                Resumen General del Turno
              </h3>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Punto & Dependienta:
                  </span>

                  <span className="font-bold">
                    {punto} · {dependiente}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Días trabajados:
                  </span>

                  <span className="font-bold">
                    {diasTrabajados} día(s)
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Relevo firmado por:
                  </span>

                  <span className="font-bold">
                    {tipoRelevo === "admin"
                      ? "Admin / Dueña"
                      : entranteNombre}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Venta Bruta Total:
                  </span>

                  <span className="font-black text-primary">
                    ${dineroCUP(totalVentas)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Gastos declarados:
                  </span>

                  <span className="font-bold text-destructive">
                    -${dineroCUP(totalGastos)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Recogidas a Dueña:
                  </span>

                  <span className="font-bold text-amber-600">
                    -${dineroCUP(totalRecogidas)}
                  </span>
                </div>

                <div className="flex justify-between border-t border-border/60 pt-2 text-sm">
                  <span className="font-bold">
                    Efectivo en Caja Arqueado:
                  </span>

                  <span className="font-black text-foreground">
                    ${dineroCUP(totalEfectivoCUP)} CUP
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              {diferencia < 0 ? (
                <p className="font-bold text-destructive">
                  Faltante de {dineroCUP(Math.abs(diferencia))} CUP
                </p>
              ) : diferencia > 0 ? (
                <>
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">
                    Sobrante de {dineroCUP(diferencia)} CUP
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    El sobrante se agrega a tu salario al conciliar el cuadre.
                  </p>
                </>
              ) : (
                <p className="font-bold">Cuadrado · 0 CUP de diferencia</p>
              )}
            </div>
            <Button
              className="w-full rounded-2xl font-bold h-14 text-base shadow-lg"
              disabled={enviando}
              onClick={handleEnviar}
            >
              {enviando
                ? "Guardando Pre-cuadre..."
                : "Guardar y Enviar Pre-cuadre"}
            </Button>

            <Button
              variant="outline"
              className="w-full rounded-2xl h-10 text-xs"
              onClick={() => setPaso(8)}
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              Regresar al Arqueo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Modal para que el Administrador revise el pre-cuadre
// de 9 pasos y lo traslade al Cuadre oficial
interface PrecuadreAdminReviewProps {
  turno: TurnoDependiente | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCargarAlCuadre: (
    cuadre: Partial<Cuadre>
  ) => boolean;
}

export function PrecuadreAdminReview({
  turno,
  open,
  onOpenChange,
  onCargarAlCuadre,
}: PrecuadreAdminReviewProps) {
  const history = useCuadreStore((state) => state.history);
  const [anteriorId, setAnteriorId] = useState("");
  const [categorias, setCategorias] = useState<Record<string, GastoCategoria>>({});
  if (!turno || !turno.data) return null;

  const d = turno.data as PrecuadreData;

  // Precargar las categorías declaradas por la dependienta al abrir la revisión
  useEffect(() => {
    if (d.gastos?.length) {
      setCategorias((prev) => {
        const next = { ...prev };
        d.gastos.forEach((g) => {
          if (!next[g.id]) {
            if (g.categoriaSugerida) {
              next[g.id] = g.categoriaSugerida;
            } else if (g.tipo === "transferencia") {
              next[g.id] = "Transferencia";
            }
          }
        });
        return next;
      });
    }
  }, [d.gastos]);

  const anteriores = history.filter((cuadre) =>
    cuadre.finalizado && cuadre.puntoVenta === turno.punto_venta &&
    (!turno.enviado_en || new Date(cuadre.fecha) <= new Date(turno.enviado_en))
  ).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const anterior = anteriores.find((cuadre) => cuadre.id === anteriorId);
  const categoriasDisponibles: GastoCategoria[] = [
    "Local", "Yanitza", "Salida de efectivo", "Cuentas por Cobrar", "Transferencia",
  ];
  const sinClasificar = d.gastos?.some((gasto) => !categorias[gasto.id]);
  const handleAplicar = () => {
    // diasTrabajados debe convertirse en un arreglo
    // de fechas ISO para el cuadre oficial
    const numDias =
      typeof d.diasTrabajados === "number" &&
      d.diasTrabajados > 0
        ? d.diasTrabajados
        : 1;

    const fechaBase = turno.enviado_en
      ? new Date(turno.enviado_en)
      : new Date();

    const diasArray: string[] =
      Array.from(
        { length: numDias },
        (_, i) => {
          const dt = new Date(fechaBase);

          dt.setDate(
            dt.getDate() -
              (numDias - 1 - i)
          );

          return dt
            .toISOString()
            .slice(0, 10);
        }
      );

        if (sinClasificar) return;
    const cargado = onCargarAlCuadre({
      puntoVenta: turno.punto_venta,
      dependiente: turno.dependiente,
      importadoDe: anteriorId || undefined,
      fecha:
        diasArray[
          diasArray.length - 1
        ],
      diasTrabajados: diasArray,

      denominaciones:
        d.denominaciones || emptyDen(),

      productos: d.productos?.map(
        (p) => ({
          id: p.id,
          nombre: p.nombre,
          inicio: p.inicio,
          entradas: p.entradas,
          traslados: p.traslados,
          final: p.final,
          precio: p.precio,
          costo: 0,
          tramos: p.tramos?.map((tramo) => ({ ...tramo, costo: 0 })),
          categoria: p.categoria,
        })
      ),

      divisas: d.usdMonto && d.usdTasa ? [{
        id: turno.id, moneda: "USD", denominacion: 1, cantidad: d.usdMonto, tasa: d.usdTasa,
      }] : [],
      gastos: d.gastos?.map((g) => ({
        id: g.id,
        categoria: categorias[g.id],

        tipo:
          g.tipo === "producto"
            ? "Producto"
            : "Efectivo",

        nombre:
          g.receptor ||
          turno.dependiente,

             // Dejar limpia la descripción original para que gastoLineas() no duplique el detalle
        descripcion: g.descripcion || "",
        items: g.items,

        monto: g.monto,
        productoId: g.productoId,
        productoNombre: g.productoNombre,
        cantidad: g.cantidadProducto,
        precio: g.precioProducto,
        fecha: g.fecha,
        transaccion: g.transaccion,
        importe: g.tipo === "transferencia" ? g.monto : undefined,
        porcentaje: g.porcentaje,
        montoRecibido: g.montoRecibido,
        sinClasificar: false,
      })),

      recogidas: d.recogidas?.map(
        (r) => ({
          id: r.id,

          fecha: r.fecha ?? diasArray[diasArray.length - 1],
          quien: r.quien ?? r.nota,
          denominaciones: emptyDen(),
          monto: r.monto,
        })
      ),

      precuadre: {
        turnoId: turno.id,
        tipoRelevo: d.tipoRelevo,
        entrante: d.entranteNombre,
        firma: d.entranteFirma,
        firmadoEn: turno.enviado_en,
      },
    });

    if (cargado) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold flex items-center justify-between">
            <span>
              Pre-cuadre de{" "}
              {turno.dependiente}
            </span>

            <Badge variant="outline">
              {turno.punto_venta}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-xs pt-2">
          <div className="p-3 bg-muted/40 rounded-2xl space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Días trabajados:
              </span>

              <span className="font-semibold">
                {d.diasTrabajados || 1}{" "}
                día(s)
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Relevo entrante:
              </span>

              <span className="font-semibold">
                {d.entranteNombre || "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Venta calculada:
              </span>

              <span className="font-bold text-primary">
                ${dineroCUP(d.totalVentas ?? 0)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Efectivo declarado:
              </span>

              <span className="font-bold">
                ${dineroCUP(d.efectivoTotal ?? 0)} CUP
              </span>
            </div>
          </div>

          {d.entranteFirma && (
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">
                Firma del Relevo:
              </span>

              <div className="border border-border rounded-xl p-2 bg-white flex justify-center">
                <img
                  src={d.entranteFirma}
                  alt="Firma del relevo"
                  className="max-h-20 object-contain"
                />
              </div>
            </div>
          )}

          <section className="space-y-2 rounded-2xl border p-3">
            <h3 className="font-bold">Comparar inicios con un turno anterior</h3>
            <select className="w-full rounded-lg border bg-background p-2" aria-label="Turno anterior"
              value={anteriorId} onChange={(e) => setAnteriorId(e.target.value)}>
              <option value="">Seleccionar turno anterior</option>
              {anteriores.map((c) => (
                <option key={c.id} value={c.id}>{c.fecha.slice(0, 10)} · {c.dependiente}</option>
              ))}
            </select>
                     {anterior && (d.productos ?? [])
           .filter((p) => {
             const previo = anterior.productos.find(
               (item) => item.id === p.id || item.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase()
             );
             // Mostrar únicamente productos que tienen existencias de inicio o final anterior
             return (p.inicio ?? 0) > 0 || (previo?.final ?? 0) > 0;
           })
           .map((p) => {
             const previo = anterior.productos.find(
               (item) => item.id === p.id || item.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase()
             );
             const coincide = previo && previo.final === p.inicio;
             return (
               <div
                 key={p.id}
                 className={`p-2 rounded-xl border text-xs flex justify-between items-center ${
                   coincide ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                 }`}
               >
                 <div>
                   <span className="font-bold">{p.nombre}</span>
                   <span className="block text-[11px] opacity-80">
                     Inicio reportado: {p.inicio} · Final turno anterior: {previo?.final ?? "0"}
                   </span>
                 </div>
                 <Badge variant={coincide ? "default" : "outline"} className={coincide ? "bg-emerald-600 text-white text-[10px]" : "border-amber-500 text-amber-600 text-[10px]"}>
                   {coincide ? "Coincide" : "Diferencia"}
                 </Badge>
               </div>
             );
           })}
          </section>
                    {!!d.gastos?.length && (
            <section className="space-y-2.5 rounded-2xl border p-3 bg-card">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Gastos y transferencias declarados ({d.gastos.length})
                </h3>
                {sinClasificar && (
                  <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                    Pendientes de clasificar
                  </Badge>
                )}
              </div>

              {d.gastos.map((g) => (
                <div key={g.id} className="p-2.5 rounded-xl border border-border/80 bg-muted/20 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-semibold uppercase px-1.5 py-0"
                        >
                          {g.tipo === "transferencia"
                            ? "Transferencia"
                            : g.tipo === "producto"
                            ? "Salida Producto"
                            : "Efectivo"}
                        </Badge>
                        {g.categoriaSugerida && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                            Declaró: {g.categoriaSugerida}
                          </Badge>
                        )}
                      </div>
                      <p className="font-bold text-sm text-foreground mt-1">
                        {g.receptor || "—"}
                      </p>
                    </div>

                    <strong className="text-sm font-black text-foreground shrink-0">
                      ${dineroCUP(g.monto)} CUP
                    </strong>
                  </div>

                  {/* Descripción / nota si existe */}
                  {g.descripcion && (
                    <p className="text-[11px] text-muted-foreground italic bg-background/60 p-1.5 rounded-lg border border-border/40">
                      "{g.descripcion}"
                    </p>
                  )}

                  {/* Detalles de productos si es salida de producto */}
                  {g.tipo === "producto" && (
                    <div className="space-y-1 text-[11px] bg-background/80 p-2 rounded-lg border border-border/50">
                      {g.items && g.items.length > 0 ? (
                        g.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between items-center text-muted-foreground">
                            <span>• {it.productoNombre}</span>
                            <span>
                              {it.cantidad} × ${dineroCUP(it.precio)} ={" "}
                              <strong className="text-foreground">${dineroCUP(it.cantidad * it.precio)}</strong>
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>• {g.productoNombre}</span>
                          <span>
                            {g.cantidadProducto} × ${dineroCUP(g.precioProducto ?? (g.cantidadProducto ? g.monto / g.cantidadProducto : 0))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detalles si es transferencia */}
                  {g.tipo === "transferencia" && (
                    <div className="grid grid-cols-2 gap-1 text-[11px] bg-background/80 p-2 rounded-lg border border-border/50 text-muted-foreground">
                      <div>
                        Fecha: <span className="font-semibold text-foreground">{g.fecha || "—"}</span>
                      </div>
                      <div>
                        Ref: <span className="font-semibold text-foreground">{g.transaccion || "Sin referencia"}</span>
                      </div>
                      <div>
                        Comisión: <span className="font-semibold text-foreground">{g.porcentaje ?? 0}%</span>
                      </div>
                      <div>
                        Recibido:{" "}
                        <span className="font-bold text-primary">
                          ${dineroCUP(g.montoRecibido ?? g.monto)} CUP
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Selector para confirmar o reasignar categoría */}
                  <div className="pt-1">
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                      Categoría para el cuadre oficial:
                    </label>
                    <select
                      className="w-full rounded-lg border bg-background p-1.5 text-xs font-medium"
                      aria-label={`Asignar categoría a ${g.receptor}`}
                      value={categorias[g.id] ?? ""}
                      onChange={(e) => {
                        const categoria = e.target.value as GastoCategoria;
                        setCategorias((prev) => ({ ...prev, [g.id]: categoria }));
                      }}
                    >
                      <option value="">⚠️ Sin categoría · Selecciona una categoría</option>
                      {categoriasDisponibles.map((c) => (
                        <option key={c} value={c}>
                          {catLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </section>
          )}
          <Button
            className="w-full rounded-2xl font-bold mt-2"
            disabled={sinClasificar}
            onClick={handleAplicar}
          >
            Cargar al Cuadre Oficial
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
