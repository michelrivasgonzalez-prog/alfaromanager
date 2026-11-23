import { useState, useMemo, useEffect } from "react";
import { useCuadreStore, calcCuadre, sortProductos, puntoHabitual, PuntoVenta, PUNTOS } from "@/store/cuadreStore";
import { useQuery } from "@tanstack/react-query";
import { normalizarDependiente } from "@/lib/cobrar";
import { listarPrecuadresEnviados } from "@/lib/turnos";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Clock, Send, Wallet, Store, ClipboardCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDiasTrabajados } from "@/lib/dias";
import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrecuadreDependiente } from "@/components/cuadre/Precuadre";

const monto = (valor: number) => `${valor.toLocaleString("es", { maximumFractionDigits: 2 })} CUP`;

export default function PortalDependiente() {
  const { nombre } = useAuth();
  const { history, currents, activePunto, catalogo, settings } = useCuadreStore();

  // 1. Inicia directamente en "historial" (Mis Liquidaciones)
  const [tab, setTab] = useState<"historial" | "turno" | "enviados">("historial");

  // 2. Control de página completa para el pre-cuadre (sin modal flotante)
  const [entregandoTurno, setEntregandoTurno] = useState(false);

  const enviados = useQuery({
    queryKey: ["precuadres-enviados", nombre],
    queryFn: () => listarPrecuadresEnviados(nombre!),
    enabled: Boolean(nombre) && tab === "enviados",
    refetchOnMount: "always",
  });

    // 1. Determinar el punto asignado/habitual de la dependienta conectada (ej. Cafetería para Kamila)
  const puntoHabitualDep = useMemo<PuntoVenta>(() => {
    if (nombre) {
      const habitual = puntoHabitual(nombre, settings, history);
      if (habitual) return habitual;
    }
    return (activePunto as PuntoVenta) || "Cafetería";
  }, [nombre, settings, history, activePunto]);

  // 2. Estado local del punto para este portal (inicia en su punto habitual)
  const [puntoSeleccionado, setPuntoSeleccionado] = useState<PuntoVenta>(puntoHabitualDep);

  useEffect(() => {
    setPuntoSeleccionado(puntoHabitualDep);
  }, [puntoHabitualDep]);

  const cuadreActual = currents[puntoSeleccionado];

  // 3. Último cuadre cerrado del punto correspondiente
  const ultimoCuadre = useMemo(() => {
    return history
      .filter((c) => c.puntoVenta === puntoSeleccionado)
      .sort(
        (a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      )[0];
  }, [history, puntoSeleccionado]);

  // Cuadres trabajados históricamente por la dependienta
  const misCuadres = useMemo(() => {
    if (!nombre) return [];

    return history.filter(
      (c) => normalizarDependiente(c.dependiente) === normalizarDependiente(nombre)
    );
  }, [history, nombre]);

  // Solo mostramos los pagos efectivamente registrados; el salario calculado
  // no representa un saldo pendiente de pago para la dependienta.
  const totalCobrado = useMemo(() => misCuadres.reduce((total, cuadre) => {
    const pagado = calcCuadre(cuadre).salarioPagado;
    return total + (pagado ?? 0);
  }, 0), [misCuadres]);

  // Productos del turno: existencias iniciales tomadas del último turno del punto de venta correcto
  const productosTurno = useMemo(() => {
    let prods: {
      id: string;
      nombre: string;
      inicio: number;
      entradas: number;
      traslados: number;
      precio: number;
      categoria?: string;
    }[] = [];

    if (cuadreActual?.productos && cuadreActual.productos.length > 0) {
      prods = cuadreActual.productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        inicio: p.inicio || 0,
        entradas: p.entradas || 0,
        traslados: p.traslados || 0,
        precio: p.precio || 0,
        categoria: p.categoria,
      }));
    } else {
      prods = catalogo
        .filter((c) => !c.punto || c.punto === puntoSeleccionado)
        .map((c) => {
          const anterior = ultimoCuadre?.productos?.find(
            (p) => p.id === c.id || p.nombre === c.nombre
          );

          return {
            id: c.id,
            nombre: c.nombre,
            inicio: anterior?.final ?? 0,
            entradas: 0,
            traslados: 0,
            precio: c.precio,
            categoria: c.categoria,
          };
        });
    }

    // Solo los productos con existencias al inicio del turno
    return sortProductos(prods.filter((p) => p.inicio > 0), settings.categorias);
  }, [cuadreActual, catalogo, puntoSeleccionado, ultimoCuadre, settings.categorias]);

  // Página completa de entrega del turno
  if (entregandoTurno) {
    return (
      <PrecuadreDependiente
        puntoInicial={puntoSeleccionado}
        dependienteInicial={nombre || ""}
        onCancelar={() => {
          if (
            window.confirm(
              "¿Segura que deseas volver al portal? Los cambios no guardados se perderán."
            )
          ) {
            setEntregandoTurno(false);
          }
        }}
        onFinalizado={() => {
          setEntregandoTurno(false);
          setTab("enviados");
          void enviados.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="alfaro-page-header space-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nombre={nombre || "Dependiente"} size={64} className="shrink-0 rounded-2xl"/>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-secondary">Portal de Dependientes</p>
            <h1 className="truncate text-xl font-extrabold">{nombre || "Dependiente"}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Mis turnos, liquidaciones y entregas</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Punto de venta del portal">
          {PUNTOS.map((p) => {
            const activo = puntoSeleccionado === p;
            return (
              <button type="button" key={p} aria-pressed={activo}
                onClick={() => setPuntoSeleccionado(p)}
                title={activo ? "Punto seleccionado" : "Cambiar punto de venta (suplencia)"}
                className={"inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition-colors " +
                  (activo ? "border-secondary bg-secondary text-secondary-foreground" :
                    "border-border bg-card text-muted-foreground")}>
                <Store className="h-4 w-4"/> {p === "Mipyme" ? "MiPyME" : p}
              </button>
            );
          })}
        </div>
      </header>

      <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-border/70 bg-card p-1 shadow-soft"
        aria-label="Secciones del portal">
        {([
          ["historial", "Liquidaciones", Calendar],
          ["turno", "Mi turno", Clock],
          ["enviados", "Entregas", Send],
        ] as const).map(([value, label, Icon]) => (
          <button type="button" key={value} aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
            className={"flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors sm:flex-row sm:text-sm " +
              (tab === value ? "bg-secondary/10 text-secondary shadow-sm" : "text-muted-foreground hover:bg-muted/40")}>
            <Icon className="h-4 w-4"/> {label}
          </button>
        ))}
      </nav>

      {tab === "enviados" && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ClipboardCheck className="h-5 w-5 text-secondary"/> Precuadres enviados
          </h2>
          {enviados.isLoading && (
            <div role="status" className="alfaro-surface p-5 text-sm text-muted-foreground">
              Consultando entregas anteriores…
            </div>
          )}
          {enviados.isError && (
            <div role="alert" className="alfaro-surface space-y-2 p-4">
              <p className="text-sm text-destructive">No fue posible consultar las entregas.</p>
              <Button type="button" variant="outline" size="sm" className="rounded-xl"
                onClick={() => { void enviados.refetch(); }}>Reintentar</Button>
            </div>
          )}
          {enviados.isSuccess && !enviados.data.length && (
            <div className="alfaro-surface p-6 text-center text-sm text-muted-foreground">
              Todavía no has enviado precuadres.
            </div>
          )}
          {enviados.data?.map((turno) => {
            const conciliado = turno.estado === "conciliado";
            const descartado = turno.estado === "descartado";
            const estado = conciliado ? "Conciliado" : descartado
              ? turno.data?.descartadoComo === "eliminado" ? "Eliminado" : "Cancelado"
              : "En espera";
            return (
              <div key={turno.id} className="alfaro-surface flex items-center gap-3 p-3.5">
                <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                  (conciliado ? "bg-secondary/10 text-secondary" :
                    descartado ? "bg-destructive/10 text-destructive" :
                      "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                  {conciliado ? <CheckCircle2 className="h-5 w-5"/> :
                    descartado ? <AlertTriangle className="h-5 w-5"/> :
                      <Clock className="h-5 w-5"/>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{turno.punto_venta === "Mipyme" ? "MiPyME" : turno.punto_venta}</p>
                  <p className="text-xs text-muted-foreground">
                    {turno.enviado_en ? new Date(turno.enviado_en).toLocaleDateString("es-CU") : "Fecha no disponible"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[11px]">{estado}</Badge>
              </div>
            );
          })}
        </section>
      )}

      {/* Historial y liquidaciones */}
      {tab === "historial" && (
        <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Calendar className="h-4 w-4 text-primary" />
                Turnos
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">
                {misCuadres.length}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                completados
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Wallet className="h-4 w-4 text-emerald-500" />
                Salarios cobrados
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">
                {monto(totalCobrado)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Pagos registrados en los cuadres
              </div>
            </div>

          </div>

          <div className="space-y-2">
            {misCuadres.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Todavía no tienes liquidaciones registradas.
              </div>
            )}
            {misCuadres.map((c) => {
              const res = calcCuadre(c);
              return (
                <article key={c.id} className="rounded-2xl border border-border bg-card p-3.5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">
                        {c.puntoVenta === "Mipyme" ? "MiPyME" : c.puntoVenta}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDiasTrabajados(c.diasTrabajados) || "Fecha no especificada"}
                      </p>
                    </div>
                    <Badge variant={res.diferencia < 0 ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                      {res.diferencia < 0 ? "Faltante" : "Cuadrado"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Ventas</p>
                      <p className="text-sm font-semibold">{monto(res.totalVenta)}</p>
                    </div>
                    <div className="rounded-xl bg-secondary/10 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Salario cobrado</p>
                      <p className="text-sm font-bold text-secondary">
                        {res.salarioPagado === null ? "Sin registrar" : monto(res.salarioPagado)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Turno en curso */}
      {tab === "turno" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Inventario con Inicio ({productosTurno.length} productos)
              </h2>

              <p className="text-xs text-muted-foreground">
                Productos activos en mostrador
              </p>
            </div>

            <Button
              className="rounded-2xl font-bold text-xs"
              onClick={() => setEntregandoTurno(true)}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Entregar Turno
            </Button>
          </div>

          <div className="space-y-2">
            {productosTurno.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-border text-muted-foreground text-xs">
                No hay productos con existencias iniciales mayores a 0
                en este turno.
              </div>
            ) : (
              productosTurno.map((p, i) => {
                return (
                  <div key={p.id}>
                    {(i === 0 || productosTurno[i - 1].categoria !== p.categoria) && (
                      <h3 className="pb-2 pt-1 text-xs font-bold text-muted-foreground">{p.categoria || "Sin categoría"}</h3>
                    )}
                  <div
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card shadow-soft"
                  >
                    <div>
                      <div className="font-semibold text-sm">
                        {p.nombre}
                      </div>

                      <div className="text-xs text-muted-foreground mt-0.5">
                        Inicio:{" "}
                        <span className="font-semibold text-foreground">
                          {p.inicio ?? 0} und
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">
                        Precio de venta
                      </span>

                      <span className="text-base font-bold text-primary">
                        ${p.precio}
                      </span>
                    </div>
                  </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}