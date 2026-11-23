import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompensarDeudaFondo from "@/components/CompensarDeudaFondo";
import { SesionCaja } from "@/components/SesionCaja";
import { deudaPorFaltante, listarCaja, montoCaja, useSesionCaja } from "@/lib/cajaSobrantes";
import { formatDiasTrabajados } from "@/lib/dias";
import { pullCuadre } from "@/lib/sync";
import { calcCuadre, type Cuadre } from "@/store/cuadreStore";

export default function SalarioHistorico() {
  const { cuadreId } = useParams();
  const consulta = useQuery({
    queryKey: ["cuadre-historico", cuadreId],
    queryFn: () => pullCuadre(cuadreId!),
    enabled: !!cuadreId,
    retry: false,
  });
  const cuadre = consulta.data;
  const liquidacion = cuadre?.finalizado ? calcCuadre(cuadre) : null;

  return (
    <section className="space-y-4 pb-8">
      <header className="alfaro-page-header space-y-3">
        <Link className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-secondary hover:underline"
          to={"/historial?cuadreId=" + encodeURIComponent(cuadreId ?? "")}>
          <ArrowLeft className="h-4 w-4"/> Volver al Historial
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
            <ClipboardCheck className="h-5 w-5"/>
          </span>
          <div>
            <h1 className="text-xl font-extrabold">Salario · Cuadre cerrado</h1>
            <p className="mt-1 text-xs text-muted-foreground">Liquidación histórica y gestión de faltantes</p>
          </div>
        </div>
      </header>

      {consulta.isPending && (
        <div role="status" className="alfaro-surface space-y-2 p-5">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-muted"/>
          <p className="text-sm text-muted-foreground">Consultando el cuadre oficial…</p>
        </div>
      )}
      {consulta.error && (
        <div role="alert" className="alfaro-surface space-y-3 p-4">
          <p className="text-sm font-semibold text-destructive">No se pudo cargar el cuadre desde la nube.</p>
          <Button type="button" size="sm" variant="outline" className="rounded-xl"
            onClick={() => { void consulta.refetch(); }}>Reintentar</Button>
        </div>
      )}
      {cuadre && !liquidacion && (
        <div role="status" className="alfaro-surface p-4 text-sm text-muted-foreground">
          El cuadre todavía no está finalizado; no se puede mostrar una liquidación histórica.
        </div>
      )}
      {cuadre && liquidacion && (
        <>
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-soft">
              <p className="flex items-center gap-2 text-sm font-medium text-white/85">
                <Wallet className="h-4 w-4"/> Salario calculado del turno
              </p>
              <p className="mt-2 break-words text-3xl font-extrabold tabular-nums">
                {montoCaja(liquidacion.salarioReal)}
              </p>
              <p className="mt-2 text-xs text-white/85">
                {cuadre.dependiente || "Dependiente no registrado"} · {cuadre.puntoVenta}
              </p>
              <p className="mt-1 text-xs text-white/75">
                {formatDiasTrabajados(cuadre.diasTrabajados)}
              </p>
            </div>
            <section className="alfaro-surface space-y-3 p-4" aria-label="Desglose de liquidación">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="h-4 w-4 text-secondary"/> Detalles de la liquidación
              </h2>
              <dl className="grid grid-cols-2 gap-2.5">
                {([
                  ["Faltante original", Math.max(0, -liquidacion.diferencia)],
                  ["Salario aplicado al faltante", liquidacion.descuentoFalta],
                  ["Deuda generada", deudaPorFaltante(liquidacion.faltanteNeto, liquidacion.descuentoFalta)],
                  ["Salario calculado", liquidacion.salarioReal],
                  ["Salario pagado", liquidacion.salarioPagado],
                  ...(liquidacion.cubiertoConFondo > 0 ? [
                    ["Cubierto con el fondo", liquidacion.cubiertoConFondo],
                    ["Faltante neto", liquidacion.faltanteNeto],
                    ["Salario pendiente de entregar", Math.max(0, liquidacion.salarioReal - (liquidacion.salarioPagado ?? 0))],
                  ] as const : []),
                ] as const).map(([label, importe]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-border/60 bg-muted/15 p-3">
                    <dt className="text-[11px] leading-snug text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-bold tabular-nums">
                      {importe === null ? "Sin desglose" : montoCaja(importe)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
          {(liquidacion.deudaDependiente > 0 || (cuadre.deudaDependienteId && !cuadre.fondoFaltante)) && (
            <SesionCaja><FondoDelTurno cuadre={cuadre}/></SesionCaja>
          )}
        </>
      )}
    </section>
  );
}

function FondoDelTurno({ cuadre }: { cuadre: Cuadre }) {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const fondo = useQuery({ queryKey: ["caja-sobrantes", cuenta], queryFn: listarCaja, retry: false });

  if (fondo.error) return <p role="alert" className="text-destructive">{fondo.error.message}</p>;
  if (!fondo.data) return <p role="status">Consultando el fondo…</p>;

  const disponible = fondo.data.saldo.saldo_disponible;
  return (
    <div className="alfaro-surface space-y-3 p-4">
      <p className="text-sm text-muted-foreground">Saldo confirmado del fondo: <strong className="text-foreground">{montoCaja(disponible)}</strong></p>
      <CompensarDeudaFondo disponible={disponible} cuadre={cuadre} />
    </div>
  );
}
