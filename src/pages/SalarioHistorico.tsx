import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
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
      <Link className="text-sm text-primary underline" to={`/historial?cuadreId=${cuadreId}`}>Volver a Historial</Link>
      <h1 className="text-2xl font-bold">Salario · Cuadre cerrado</h1>
      {consulta.isPending && <p role="status">Consultando el turno…</p>}
      {consulta.error && <p role="alert" className="text-destructive">No se pudo cargar el cuadre de Supabase.</p>}
      {cuadre && liquidacion && (
        <>
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p>{cuadre.dependiente} · {formatDiasTrabajados(cuadre.diasTrabajados)} · {cuadre.puntoVenta}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
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
              ] as const).map(([label, monto]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold">{monto === null ? "Sin desglose" : montoCaja(monto)}</dd>
                </div>
              ))}
            </dl>
          </div>
          {(liquidacion.deudaDependiente > 0 || (cuadre.deudaDependienteId && !cuadre.fondoFaltante)) && (
            <SesionCaja><FondoDelTurno cuadre={cuadre} /></SesionCaja>
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
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Saldo confirmado del fondo: <strong>{montoCaja(disponible)}</strong></p>
      <CompensarDeudaFondo disponible={disponible} cuadre={cuadre} />
    </div>
  );
}
