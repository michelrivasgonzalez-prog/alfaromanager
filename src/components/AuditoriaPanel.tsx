import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ShieldCheck, RefreshCw, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { paginaAuditoria, type AuditoriaRow } from "@/lib/auditoria";

const POR_PAGINA = 50;

const ACCIONES: Record<string, string> = {
  registrar_abono: "Abono registrado",
  revertir_abono: "Abono revertido",
  vincular_faltante: "Faltante vinculado",
  cerrar_cuadre_con_fondo: "Cuadre cerrado con fondo",
};

function etiquetaAccion(accion: string): string {
  return ACCIONES[accion] ??
    accion.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function fechaLegible(raw: string): string {
  const fecha = new Date(raw);
  if (Number.isNaN(fecha.getTime())) return "Fecha desconocida";
  return format(fecha, "dd MMM yyyy · HH:mm", { locale: es });
}

function dinero(monto: number): string {
  return monto.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + " CUP";
}

export default function AuditoriaPanel() {
  const [registros, setRegistros] = useState<AuditoriaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("");
  const [usuarioAplicado, setUsuarioAplicado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [fechasAplicadas, setFechasAplicadas] = useState({ desde: "", hasta: "" });
  const [accion, setAccion] = useState("todas");
  const [clientes, setClientes] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await paginaAuditoria({
        usuario: usuarioAplicado || undefined,
        accion: accion === "todas" ? undefined : accion,
        desde: fechasAplicadas.desde || undefined,
        hasta: fechasAplicadas.hasta || undefined,
        pagina,
        porPagina: POR_PAGINA,
      });
      setRegistros(respuesta.registros);
      setTotal(respuesta.total);

      const { data, error: errorClientes } = await supabase
        .from("clientes")
        .select("id,nombre");
      if (!errorClientes) {
        const mapa: Record<string, string> = {};
        (data ?? []).forEach((c) => { mapa[c.id] = c.nombre; });
        setClientes(mapa);
      }
    } catch (err: any) {
      const mensaje = err?.message || "No se pudo consultar la auditoría";
      setError(mensaje);
      setRegistros([]);
      setTotal(0);
      toast.error("Error al cargar auditoría: " + mensaje);
    } finally {
      setCargando(false);
    }
  }, [usuarioAplicado, accion, fechasAplicadas, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const buscar = () => {
    if (desde && hasta && desde > hasta) {
      toast.error("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    setPagina(1);
    setUsuarioAplicado(usuario.trim());
    setFechasAplicadas({ desde, hasta });
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Trazabilidad y Auditoría</h3>
            <p className="text-xs text-muted-foreground">
              Historial de movimientos registrados en la nube
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold whitespace-nowrap">
          {cargando ? "Cargando…" : total + " evento(s)"}
        </span>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="Buscar por operador…"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
          className="h-9 rounded-xl text-xs"
        />

        <Select
          value={accion}
          onValueChange={(valor) => {
            setAccion(valor);
            setPagina(1);
          }}
        >
          <SelectTrigger className="h-9 rounded-xl text-xs">
            <SelectValue placeholder="Tipo de movimiento" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="todas">Todos los movimientos</SelectItem>
            <SelectItem value="registrar_abono">Abonos recibidos</SelectItem>
            <SelectItem value="revertir_abono">Abonos revertidos</SelectItem>
            <SelectItem value="vincular_faltante">Faltantes vinculados</SelectItem>
            <SelectItem value="cerrar_cuadre_con_fondo">Cierres con fondo</SelectItem>
          </SelectContent>
        </Select>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Desde</span>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="h-9 rounded-xl text-xs" />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Hasta</span>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="h-9 rounded-xl text-xs" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={buscar} disabled={cargando} variant="outline" className="h-9 rounded-xl text-xs">
            <Search className="mr-1.5 h-3.5 w-3.5" /> Buscar
          </Button>
          <Button onClick={() => void cargar()} disabled={cargando} className="h-9 rounded-xl text-xs gradient-primary">
            <RefreshCw className={cargando ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} />
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/50 p-3 text-xs text-destructive">
          Error al cargar auditoría: {error}
        </div>
      )}

      <div className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
        {!cargando && !error && registros.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No hay movimientos para los filtros seleccionados.
          </p>
        )}

        {registros.map((r) => {
          const d = r.detalle ?? {};
          const esReversion = r.accion.toLowerCase().includes("revertir");
          const clienteId = typeof d.cliente_id === "string" ? d.cliente_id : "";
          const cliente = clienteId ? (clientes[clienteId] ?? "Cliente registrado") : null;
          const rawMonto = d.monto ?? d.importe;
          const tieneMonto = rawMonto !== null && rawMonto !== undefined &&
            rawMonto !== "" && Number.isFinite(Number(rawMonto));
          const monto = Number(rawMonto);
          const detalles = Object.keys(d).length > 0;

          return (
            <article key={r.id} className="rounded-xl border border-border bg-muted/20 p-3 text-xs space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1 min-w-0">
                  <p className={esReversion ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
                    {etiquetaAccion(r.accion)}
                  </p>
                  {cliente && <p className="text-foreground font-medium">{cliente}</p>}
                  <p className="text-muted-foreground">Operador: {r.usuario_nombre || "Sistema"}</p>
                  <p className="text-muted-foreground">Entidad: {r.entidad}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                  {fechaLegible(r.fecha)}
                </span>
              </div>

              {tieneMonto && (
                <div className="rounded-lg border border-border/60 bg-card p-2 flex justify-between">
                  <span className="text-muted-foreground">Monto</span>
                  <strong>{esReversion ? "−" : ""}{dinero(monto)}</strong>
                </div>
              )}

              {detalles && (
                <details className="rounded-lg border border-border/60 p-2">
                  <summary className="cursor-pointer font-medium text-foreground">
                    Ver detalles de la operación
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                    {JSON.stringify(d, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          );
        })}
      </div>

      {!error && total > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" disabled={cargando || pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {pagina} de {totalPaginas}
          </span>
          <Button size="sm" variant="outline" disabled={cargando || pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}>
            Siguiente <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
  );
}
