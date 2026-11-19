import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CompensarDeudaFondo from "@/components/CompensarDeudaFondo";
import { SesionCaja } from "@/components/SesionCaja";
import { confirmarAjusteSobrante, confirmarSobrante, fechaCaja, listarCaja, montoCaja, retirarSobrante, useSesionCaja, type MovimientoFondo } from "@/lib/cajaSobrantes";
import { Link } from "react-router-dom";
import { pullCuadre } from "@/lib/sync";

export default function CajaSobrantes() {
  return (
    <section className="space-y-4 pb-8">
      <h1 className="text-2xl font-bold">Caja de Sobrantes</h1>
      <SesionCaja><Fondo /></SesionCaja>
    </section>
  );
}

function Fondo() {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const qc = useQueryClient();
  const fondo = useQuery({ queryKey: ["caja-sobrantes", cuenta], queryFn: listarCaja, retry: false });
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const idRetiro = useRef<string | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);

  const confirmar = useMutation({
    mutationFn: (movimiento: MovimientoFondo) => {
      const ajuste = movimiento.detalles?.ajuste_pendiente;
      return ajuste
        ? confirmarAjusteSobrante(movimiento.id, Number(ajuste.total))
        : confirmarSobrante(movimiento.id);
    },
    onSuccess: async (movimiento) => {
      setPorConfirmar(null);
      await qc.invalidateQueries({ queryKey: ["caja-sobrantes"] });
      if (movimiento.cuadre_id) void pullCuadre(movimiento.cuadre_id).catch(console.warn);
    },
  });
  const retirar = useMutation({
    mutationFn: ({ id, monto, motivo }: { id: string; monto: number; motivo: string }) =>
      retirarSobrante(id, monto, motivo),
    onSuccess: async () => {
      idRetiro.current = null;
      setImporte("");
      setMotivo("");
      await qc.invalidateQueries({ queryKey: ["caja-sobrantes"] });
    },
  });
  const monto = Number(importe);
  const saldo = fondo.data?.saldo;
  const valido = !!saldo && Number.isFinite(monto) && monto > 0 && monto <= saldo.saldo_disponible && !!motivo.trim();

  function enviarRetiro(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valido || retirar.isPending) return;
    idRetiro.current ??= crypto.randomUUID();
    retirar.mutate({ id: idRetiro.current, monto, motivo: motivo.trim() });
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => fondo.refetch()}>Actualizar</Button>
      {fondo.isPending && <p role="status">Cargando fondo…</p>}
      {fondo.error && <p role="alert" className="text-destructive">{fondo.error.message}</p>}
      {saldo && fondo.data && (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {([
              ["Saldo disponible", saldo.saldo_disponible],
              ["Pendiente de ingreso físico", saldo.pendiente_ingresar],
              ["Ingresos confirmados", saldo.ingresos_confirmados],
              ["Retiros confirmados", saldo.retiros_confirmados],
            ] as const).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="rounded-xl border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{montoCaja(valor)}</dd>
              </div>
            ))}
          </dl>
          <form onSubmit={enviarRetiro} className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Registrar retiro</h2>
            <label className="block space-y-1 text-sm">
              <span>Importe (CUP)</span>
              <Input type="number" min="0.01" max={saldo.saldo_disponible} step="0.01" value={importe}
                onChange={(e) => { setImporte(e.target.value); idRetiro.current = null; }} disabled={retirar.isPending} required />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Motivo</span>
              <Input value={motivo} onChange={(e) => { setMotivo(e.target.value); idRetiro.current = null; }} disabled={retirar.isPending} required />
            </label>
            {retirar.error && <p role="alert" className="text-sm text-destructive">{retirar.error.message}</p>}
            {retirar.isSuccess && <p role="status" className="text-sm">Retiro registrado.</p>}
            <Button disabled={!valido || retirar.isPending} type="submit">Registrar retiro</Button>
          </form>
          <CompensarDeudaFondo disponible={saldo.saldo_disponible} />
          <h2 className="font-semibold">Movimientos</h2>
          {!fondo.data.movimientos.length && <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>}
          {fondo.data.movimientos.map((m) => {
            const ajuste = m.detalles?.ajuste_pendiente;
            const montoIngreso = ajuste ? Number(ajuste.monto) : Number(m.monto);
            return (
              <article key={m.id} className="space-y-1 rounded-xl border bg-card p-3 text-sm">
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{m.detalles?.origen === "compensacion_deuda" ? "Compensación de deuda" : m.tipo === "ingreso" ? "Ingreso" : "Retiro"} · {m.estado}</span>
                  <span className="whitespace-nowrap">{montoCaja(m.monto)}</span>
                </div>
                <p>
                  {m.cuadre_id
                    ? <Link className="text-primary underline" to={`/historial?cuadreId=${m.cuadre_id}`}>{m.dependiente ?? m.punto_venta}</Link>
                    : m.punto_venta}
                  {m.periodo_desde && ` · ${m.periodo_desde} a ${m.periodo_hasta ?? m.periodo_desde}`}
                </p>
                <p className="text-muted-foreground">{m.realizado_por} · {fechaCaja(m.realizado_en)}</p>
                {m.confirmado_en && <p className="text-muted-foreground">Confirmó {m.confirmado_por} · {fechaCaja(m.confirmado_en)}</p>}
                <p className="break-words">{m.motivo}</p>
                {ajuste && <p className="font-medium">Ajuste pendiente de ingreso físico: {montoCaja(montoIngreso)}</p>}
                {m.tipo === "ingreso" && (m.estado === "pendiente" || ajuste) && (
                  porConfirmar === m.id ? (
                    <div className="space-y-2">
                      <p>Confirma solo si recibiste físicamente {montoCaja(montoIngreso)}.</p>
                      <Button size="sm" disabled={confirmar.isPending} onClick={() => confirmar.mutate(m)}>
                        {ajuste ? "Confirmar ingreso de la diferencia" : "Confirmar ingreso"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={confirmar.isPending} onClick={() => setPorConfirmar(null)}>Cancelar</Button>
                      {confirmar.error && <p role="alert" className="text-destructive">{confirmar.error.message}</p>}
                    </div>
                  ) : <Button size="sm" variant="outline" disabled={confirmar.isPending} onClick={() => { confirmar.reset(); setPorConfirmar(m.id); }}>{ajuste ? "Registrar ingreso de la diferencia" : "Registrar ingreso"}</Button>
                )}
              </article>
            );
          })}
        </>
      )}
    </div>
  );
}
