import React, { useState, useMemo, useRef, useEffect } from "react";
import { useCuadreStore, PuntoVenta, Cuadre, Denominaciones } from "@/store/cuadreStore";
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
  "1",
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
  "1": 0,
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
  const dependientesPorPunto = useCuadreStore(
    (s) => s.settings.dependientePunto
  );
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
  const dependientesPunto = useMemo(() => {
    return dependientes.filter((d) => {
      const p = dependientesPorPunto?.[d];
      return !p || p === punto;
    });
  }, [dependientes, dependientesPorPunto, punto]);

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

    return todos.map((p) => {
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
        categoria: p.categoria || "Varios",
        inicioDefecto,
      };
    });
  }, [catalogo, productosNuevosLocal, ultimoCuadrePunto]);

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
      ? dependientes
      : dependientesPunto;

    return fuente.filter((d) => d !== dependiente);
  }, [
    modoSuplencia,
    dependientes,
    dependientesPunto,
    dependiente,
  ]);

  // Paso 6: Precios mixtos
  const [preciosMixtos, setPreciosMixtos] = useState<
    Record<
      string,
      {
        activo: boolean;
        cantPrecioAnterior: number;
        precioAnterior: number;
      }
    >
  >({});

  // Paso 7: Gastos, salidas y transferencias
  const [gastos, setGastos] = useState<GastoPrecuadre[]>([]);

  const [gastoTipo, setGastoTipo] =
    useState<"efectivo" | "producto" | "transferencia">(
      "efectivo"
    );

  const [gastoReceptor, setGastoReceptor] = useState("");
  const [gastoMontoEfectivo, setGastoMontoEfectivo] =
    useState("");
  const [gastoComisionTransf, setGastoComisionTransf] =
    useState("");
  const [gastoProductoId, setGastoProductoId] = useState("");
  const [gastoCantidadProd, setGastoCantidadProd] =
    useState("");
  const [busquedaProdSalida, setBusquedaProdSalida] =
    useState("");
  const [gastoEditandoId, setGastoEditandoId] =
    useState<string | null>(null);

  // Paso 8: Recogidas y arqueo
  const [recogidas, setRecogidas] =
    useState<RecogidaPrecuadre[]>([]);

  const [recogidaMonto, setRecogidaMonto] = useState("");
  const [recogidaReceptor, setRecogidaReceptor] =
    useState("Dueña");
  const [recogidaNota, setRecogidaNota] = useState("");
  const [denoms, setDenoms] =
    useState<Denominaciones>(emptyDen());

  const [usdMonto, setUsdMonto] = useState<string>("");
  const [usdTasa, setUsdTasa] = useState<string>("320");

  const [enviando, setEnviando] = useState(false);

  // Inicializar inicios y precios
  useEffect(() => {
    const initInicios: Record<string, number> = {};
    const initPrecios: Record<string, number> = {};

    productosBase.forEach((p) => {
      initInicios[p.id] = p.inicioDefecto;
      initPrecios[p.id] = p.precioDefecto;
    });

    setInicios(initInicios);
    setPreciosEditados(initPrecios);
  }, [productosBase]);

  // Cálculos de ventas con soporte de precio mixto
  const resumenProductos = useMemo(() => {
    return productosBase.map((p) => {
      const ini = inicios[p.id] ?? 0;
      const ent = entradas[p.id] ?? 0;
      const tras = traslados[p.id] ?? 0;
      const fin = finales[p.id] ?? 0;
      const disponible = ini + ent - tras;
      const vendidasTotal = Math.max(0, disponible - fin);
      const precioActual =
        preciosEditados[p.id] ?? p.precioDefecto;

      const mixto = preciosMixtos[p.id];
      let importe = 0;

      if (
        mixto &&
        mixto.activo &&
        mixto.cantPrecioAnterior > 0
      ) {
        const cantAnt = Math.min(
          vendidasTotal,
          mixto.cantPrecioAnterior
        );

        const cantAct = Math.max(
          0,
          vendidasTotal - cantAnt
        );

        importe =
          cantAnt * mixto.precioAnterior +
          cantAct * precioActual;
      } else {
        importe = vendidasTotal * precioActual;
      }

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
        mixtoInfo: mixto?.activo ? mixto : null,
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

  // Paso 3: productos con disponibilidad arriba
  const productosOrdenadosPaso3 = useMemo(() => {
    const q = busquedaPaso3.toLowerCase().trim();
    let lista = productosBase;

    if (q) {
      lista = lista.filter((p) =>
        p.nombre.toLowerCase().includes(q)
      );
    }

    return [...lista].sort((a, b) => {
      const dispA =
        (inicios[a.id] ?? 0) +
        (entradas[a.id] ?? 0);

      const dispB =
        (inicios[b.id] ?? 0) +
        (entradas[b.id] ?? 0);

      if (dispA > 0 && dispB === 0) return -1;
      if (dispA === 0 && dispB > 0) return 1;

      return a.nombre.localeCompare(b.nombre);
    });
  }, [
    productosBase,
    busquedaPaso3,
    inicios,
    entradas,
  ]);

  // Paso 4: productos con disponibilidad
  const productosConStockPaso4 = useMemo(() => {
    return resumenProductos.filter(
      (p) => p.disponible > 0
    );
  }, [resumenProductos]);

  // Paso 7: productos disponibles para salida
  const productosDisponiblesSalida = useMemo(() => {
    const q = busquedaProdSalida.toLowerCase().trim();

    return resumenProductos
      .filter((p) => p.disponible > 0)
      .filter(
        (p) =>
          !q ||
          p.nombre.toLowerCase().includes(q)
      );
  }, [resumenProductos, busquedaProdSalida]);

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

  // Agregar o editar gasto en el paso 7
  const agregarOGuardarGasto = () => {
    const receptor = gastoReceptor.trim();

    if (
      !receptor &&
      gastoTipo !== "transferencia"
    ) {
      toast.error(
        "Indica a quién se entregó o el concepto"
      );
      return;
    }

    let monto = 0;
    let cantProd = 0;
    let prodNombre = "";

    if (gastoTipo === "efectivo") {
      monto = parseFloat(gastoMontoEfectivo);

      if (isNaN(monto) || monto <= 0) {
        toast.error(
          "Indica un monto en efectivo válido"
        );
        return;
      }
    } else if (gastoTipo === "transferencia") {
      monto = parseFloat(gastoMontoEfectivo);

      if (isNaN(monto) || monto <= 0) {
        toast.error(
          "Indica el monto transferido"
        );
        return;
      }
    } else {
      cantProd = parseFloat(gastoCantidadProd);

      const prod = resumenProductos.find(
        (p) => p.id === gastoProductoId
      );

      if (
        !prod ||
        isNaN(cantProd) ||
        cantProd <= 0
      ) {
        toast.error(
          "Selecciona un producto y cantidad válida"
        );
        return;
      }

      prodNombre = prod.nombre;
      monto = cantProd * prod.precioActual;
    }

    if (gastoEditandoId) {
      setGastos((prev) =>
        prev.map((g) =>
          g.id === gastoEditandoId
            ? {
                ...g,
                tipo:
                  gastoTipo === "producto"
                    ? "producto"
                    : "efectivo",
                receptor:
                  receptor || "Transferencia",
                monto,
                cantidadProducto:
                  cantProd || undefined,
                productoNombre:
                  prodNombre || undefined,
                sinClasificar: true,
              }
            : g
        )
      );

      toast.success("Línea actualizada");
      setGastoEditandoId(null);
    } else {
      const nuevoGasto: GastoPrecuadre = {
        id: `gasto_${Date.now()}`,
        tipo:
          gastoTipo === "producto"
            ? "producto"
            : "efectivo",
        receptor:
          receptor ||
          (gastoTipo === "transferencia"
            ? "Transferencia"
            : "Salida"),
        monto,
        cantidadProducto:
          cantProd || undefined,
        productoNombre:
          prodNombre || undefined,
        sinClasificar: true,
      };

      setGastos((prev) => [
        ...prev,
        nuevoGasto,
      ]);

      toast.success("Línea agregada");
    }

    setGastoReceptor("");
    setGastoMontoEfectivo("");
    setGastoCantidadProd("");
    setGastoProductoId("");
    setGastoComisionTransf("");
  };

  const eliminarGasto = (id: string) => {
    setGastos((prev) =>
      prev.filter((g) => g.id !== id)
    );

    toast.info("Línea eliminada");
  };

  const iniciarEdicionGasto = (
    g: GastoPrecuadre
  ) => {
    setGastoEditandoId(g.id);
    setGastoReceptor(g.receptor);

    if (g.tipo === "producto") {
      setGastoTipo("producto");

      setGastoCantidadProd(
        g.cantidadProducto?.toString() || ""
      );
    } else {
      setGastoTipo("efectivo");
      setGastoMontoEfectivo(
        g.monto.toString()
      );
    }
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

    const nueva: RecogidaPrecuadre = {
      id: `rec_${Date.now()}`,
      hora: new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      ),
      monto,
      nota: `${recogidaReceptor}${
        recogidaNota.trim()
          ? ` · ${recogidaNota.trim()}`
          : ""
      }`,
    };

    setRecogidas((prev) => [
      ...prev,
      nueva,
    ]);

    setRecogidaMonto("");
    setRecogidaNota("");

    toast.success(
      `Recogida de $${monto} CUP agregada`
    );
  };

  // Enviar pre-cuadre final
  const handleEnviar = async () => {
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

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      "Cafetería",
                      "Mipyme",
                    ] as PuntoVenta[]
                  ).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={
                        punto === p
                          ? "default"
                          : "outline"
                      }
                      className="rounded-xl h-10 font-bold text-xs"
                      onClick={() =>
                        setPunto(p)
                      }
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
                            ${p.precioDefecto}
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
                          value={inicios[p.id] ?? 0}
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
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

                <Input
                  placeholder="Buscar producto por letra..."
                  value={busquedaPaso3}
                  onChange={(e) =>
                    setBusquedaPaso3(
                      e.target.value
                    )
                  }
                  className="pl-9 pr-8 rounded-2xl h-10 text-xs"
                />

                {busquedaPaso3 && (
                  <button
                    onClick={() =>
                      setBusquedaPaso3("")
                    }
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
                onClick={() =>
                  setModalNuevoProd(true)
                }
              >
                <Plus className="mr-1.5 h-4 w-4 text-primary" />
                Agregar Producto Nuevo
              </Button>
            </div>

            <div className="space-y-2">
              {productosOrdenadosPaso3.map(
                (p) => {
                  const precio =
                    preciosEditados[p.id] ??
                    p.precioDefecto;

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-2xl border border-border bg-card space-y-2.5 shadow-soft"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm truncate flex-1">
                          {p.nombre}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            Precio CUP:
                          </span>

                          <Input
                            type="number"
                            value={precio}
                            onChange={(e) =>
                              setPreciosEditados({
                                ...preciosEditados,
                                [p.id]:
                                  parseFloat(
                                    e.target
                                      .value
                                  ) || 0,
                              })
                            }
                            className="h-8 w-20 rounded-lg text-right font-bold text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[11px] text-muted-foreground font-medium block mb-1">
                            + Entradas recibidas
                          </span>

                          <Input
                            type="number"
                            placeholder="0"
                            value={
                              entradas[p.id] ??
                              ""
                            }
                            onChange={(e) =>
                              setEntradas({
                                ...entradas,
                                [p.id]:
                                  parseFloat(
                                    e.target
                                      .value
                                  ) || 0,
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
                            value={
                              traslados[
                                p.id
                              ] ?? ""
                            }
                            onChange={(e) =>
                              setTraslados({
                                ...traslados,
                                [p.id]:
                                  parseFloat(
                                    e.target
                                      .value
                                  ) || 0,
                              })
                            }
                            className="h-9 rounded-xl text-right font-bold text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

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
                      Disponible teórico:{" "}
                      <span className="font-bold text-foreground">
                        {p.disponible}
                      </span>{" "}
                      • ${p.precioActual}
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
                    onClick={() =>
                      setModoSuplencia(
                        (prev) => !prev
                      )
                    }
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
                  ${Math.round(totalVentas)} CUP
                </span>
              </div>

              <Badge className="bg-primary text-primary-foreground font-bold text-xs py-1 px-3">
                {resumenProductos.reduce(
                  (acc, p) =>
                    acc + p.vendidas,
                  0
                )}{" "}
                u. vendidas
              </Badge>
            </div>

            <div className="space-y-2">
              {resumenProductos
                .filter(
                  (p) =>
                    p.vendidas > 0 ||
                    p.disponible > 0
                )
                .map((p) => {
                  const mixto =
                    preciosMixtos[p.id];

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-2xl border border-border bg-card space-y-2 text-xs shadow-soft"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-sm">
                            {p.nombre}
                          </div>

                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {p.vendidas} u. vendidas
                            (Disponible:{" "}
                            {p.disponible})
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-black text-sm text-foreground">
                            ${p.importe}
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2 text-primary"
                            onClick={() => {
                              setPreciosMixtos(
                                (prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    activo:
                                      !prev[
                                        p.id
                                      ]?.activo,

                                    cantPrecioAnterior:
                                      prev[p.id]
                                        ?.cantPrecioAnterior ||
                                      0,

                                    precioAnterior:
                                      prev[p.id]
                                        ?.precioAnterior ||
                                      p.precioActual,
                                  },
                                })
                              );
                            }}
                          >
                            {mixto?.activo
                              ? "Desactivar Mixto"
                              : "+ Precio Mixto"}
                          </Button>
                        </div>
                      </div>

                      {mixto?.activo && (
                        <div className="p-2.5 rounded-xl bg-muted/40 border border-border grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground block">
                              Cant. Precio Anterior
                            </label>

                            <Input
                              type="number"
                              placeholder="0"
                              value={
                                mixto.cantPrecioAnterior ||
                                ""
                              }
                              onChange={(e) =>
                                setPreciosMixtos(
                                  (prev) => ({
                                    ...prev,

                                    [p.id]: {
                                      ...prev[
                                        p.id
                                      ],

                                      cantPrecioAnterior:
                                        parseFloat(
                                          e.target
                                            .value
                                        ) || 0,
                                    },
                                  })
                                )
                              }
                              className="h-8 text-xs font-bold rounded-lg"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-muted-foreground block">
                              Precio Anterior (CUP)
                            </label>

                            <Input
                              type="number"
                              placeholder="0"
                              value={
                                mixto.precioAnterior ||
                                ""
                              }
                              onChange={(e) =>
                                setPreciosMixtos(
                                  (prev) => ({
                                    ...prev,

                                    [p.id]: {
                                      ...prev[
                                        p.id
                                      ],

                                      precioAnterior:
                                        parseFloat(
                                          e.target
                                            .value
                                        ) || 0,
                                    },
                                  })
                                )
                              }
                              className="h-8 text-xs font-bold rounded-lg"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                onClick={() => setPaso(7)}
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
            <p className="text-xs text-muted-foreground">
              Añade gastos, transferencias o salidas en líneas sueltas:
            </p>

            <div className="p-4 bg-muted/40 rounded-2xl space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  size="sm"
                  variant={gastoTipo === "efectivo" ? "default" : "outline"}
                  className="text-xs rounded-xl h-8 px-1"
                  onClick={() => setGastoTipo("efectivo")}
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Efectivo
                </Button>

                <Button
                  size="sm"
                  variant={gastoTipo === "transferencia" ? "default" : "outline"}
                  className="text-xs rounded-xl h-8 px-1"
                  onClick={() => setGastoTipo("transferencia")}
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1" /> Transfer.
                </Button>

                <Button
                  size="sm"
                  variant={gastoTipo === "producto" ? "default" : "outline"}
                  className="text-xs rounded-xl h-8 px-1"
                  onClick={() => setGastoTipo("producto")}
                >
                  <Package className="h-3.5 w-3.5 mr-1" /> Producto
                </Button>
              </div>

              <Input
                placeholder={
                  gastoTipo === "transferencia"
                    ? "Receptor o Banco (Ej. Transferencia Pedro)"
                    : "Receptor o concepto (Ej. Juan, Compra hielo...)"
                }
                value={gastoReceptor}
                onChange={(e) => setGastoReceptor(e.target.value)}
                className="rounded-xl text-xs font-medium"
              />

              {gastoTipo !== "producto" ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    placeholder="Monto en CUP"
                    value={gastoMontoEfectivo}
                    onChange={(e) => setGastoMontoEfectivo(e.target.value)}
                    className="rounded-xl text-xs font-bold"
                  />

                  {gastoTipo === "transferencia" && (
                    <Input
                      type="number"
                      placeholder="% Comisión de transferencia (opcional)"
                      value={gastoComisionTransf}
                      onChange={(e) => setGastoComisionTransf(e.target.value)}
                      className="rounded-xl text-xs"
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />

                    <Input
                      placeholder="Buscar producto con disponible..."
                      value={busquedaProdSalida}
                      onChange={(e) => setBusquedaProdSalida(e.target.value)}
                      className="pl-8 text-xs rounded-xl h-8"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={gastoProductoId}
                      onValueChange={setGastoProductoId}
                    >
                      <SelectTrigger className="rounded-xl text-xs">
                        <SelectValue placeholder="Elegir producto..." />
                      </SelectTrigger>

                      <SelectContent>
                        {productosDisponiblesSalida.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre} (Disp: {p.disponible})
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
                </div>
              )}

              <Button
                size="sm"
                className="w-full rounded-xl font-bold h-10"
                onClick={agregarOGuardarGasto}
              >
                {gastoEditandoId
                  ? "Actualizar Línea"
                  : "+ Añadir Línea de Salida"}
              </Button>
            </div>

            <div className="space-y-2">
              {gastos.map((g) => (
                <div
                  key={g.id}
                  className="flex justify-between items-center p-3 rounded-2xl border border-border bg-card text-xs shadow-soft"
                >
                  <div className="flex-1 pr-2">
                    <span className="font-semibold text-sm">
                      {g.receptor}
                    </span>

                    <span className="text-[10px] text-muted-foreground block">
                      {g.tipo === "producto"
                        ? `Producto: ${g.productoNombre} (${g.cantidadProducto} u.)`
                        : "Efectivo / Transferencia"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-destructive">
                      -${g.monto}
                    </span>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => iniciarEdicionGasto(g)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => eliminarGasto(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              {gastos.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-2">
                  No se han declarado salidas.
                </p>
              )}
            </div>

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

                  <Select
                    value={recogidaReceptor}
                    onValueChange={setRecogidaReceptor}
                  >
                    <SelectTrigger className="rounded-xl text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="Dueña">Dueña</SelectItem>
                      <SelectItem value="Administrador">
                        Administrador
                      </SelectItem>
                      <SelectItem value="Yanitza">Yanitza</SelectItem>
                      <SelectItem value="Geuris">Geuris</SelectItem>
                    </SelectContent>
                  </Select>
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
                  placeholder="Nota u hora opcional..."
                  value={recogidaNota}
                  onChange={(e) => setRecogidaNota(e.target.value)}
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
                      {r.nota || "Recogida"}
                    </span>

                    <span className="text-[10px] text-muted-foreground block">
                      {r.hora}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold">${r.monto}</span>

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

              <div className="grid grid-cols-2 gap-2">
                {DENOMINACIONES.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-between p-2.5 rounded-2xl border border-border bg-card"
                  >
                    <span className="text-xs font-bold">${d}</span>

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
                      className="w-20 h-8 text-right font-bold text-xs rounded-lg"
                    />
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
                    ${Math.round(totalVentas)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Gastos declarados:
                  </span>

                  <span className="font-bold text-destructive">
                    -${totalGastos}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Recogidas a Dueña:
                  </span>

                  <span className="font-bold text-amber-600">
                    -${totalRecogidas}
                  </span>
                </div>

                <div className="flex justify-between border-t border-border/60 pt-2 text-sm">
                  <span className="font-bold">
                    Efectivo en Caja Arqueado:
                  </span>

                  <span className="font-black text-foreground">
                    ${totalEfectivoCUP} CUP
                  </span>
                </div>
              </div>
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
  ) => void;
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

    onCargarAlCuadre({
      puntoVenta: turno.punto_venta,
      dependiente: turno.dependiente,
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
          categoria: p.categoria,
        })
      ),

      gastos: d.gastos?.map((g) => ({
        id: g.id,
        categoria: "Local",

        tipo:
          g.tipo === "producto"
            ? "Producto"
            : "Efectivo",

        nombre:
          g.receptor ||
          turno.dependiente,

        descripcion:
          g.tipo === "producto"
            ? `${g.cantidadProducto}x ${
                g.productoNombre ||
                "Producto"
              } (${g.receptor})`
            : g.receptor,

        monto: g.monto,
        sinClasificar: true,
      })),

      recogidas: d.recogidas?.map(
        (r) => ({
          id: r.id,

          fecha:
            diasArray[
              diasArray.length - 1
            ],

          quien: r.nota,
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

    onOpenChange(false);
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
                $
                {Math.round(
                  d.totalVentas || 0
                )}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Efectivo declarado:
              </span>

              <span className="font-bold">
                ${d.efectivoTotal ?? 0} CUP
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

          <Button
            className="w-full rounded-2xl font-bold mt-2"
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