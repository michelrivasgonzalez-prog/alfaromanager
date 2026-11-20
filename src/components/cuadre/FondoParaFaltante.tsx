import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { consultarFondoParaCuadre, montoCaja, useSesionCaja } from "@/lib/cajaSobrantes";
import { usePinStore } from "@/store/pinStore";

type FondoParaFaltanteProps = {
  cuadreId: string;
  faltante: number;
  propuesto?: number;
  aplicado: number;
  onChange: (monto: number | undefined) => void;
};

const centavos = (monto: number) => Math.max(0, Math.round(monto * 100));
const mostrarMonto = (monto: number) => montoCaja(monto / 100);

export default function FondoParaFaltante({
  cuadreId, faltante, propuesto, aplicado, onChange,
}: FondoParaFaltanteProps) {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const usuario = usePinStore((s) => s.currentUserId);
  const autorizada = !!cuenta && cuenta === usuario;
  const fondo = useQuery({
    queryKey: ["caja-sobrantes", "cuadre", cuenta, cuadreId],
    queryFn: () => consultarFondoParaCuadre(cuadreId),
    enabled: autorizada && faltante > 0,
    retry: false,
  });
  const importeId = useId();
  const [importeManual, setImporteManual] = useState("");
  const balance = autorizada ? fondo.data : undefined;
  const faltanteBruto = centavos(faltante);
  const yaAplicado = centavos(aplicado);
  const reutilizable = centavos(balance?.montoAplicado ?? 0);
  const minimo = Math.max(yaAplicado, reutilizable);
  const saldoDisponible = centavos(balance?.saldoDisponible ?? 0);
  const maximo = Math.min(faltanteBruto, minimo + saldoDisponible);
  const montoPropuesto = propuesto === undefined ? undefined : centavos(propuesto);
  const cobertura = Math.max(yaAplicado, montoPropuesto ?? 0);
  const pendiente = Math.max(0, faltanteBruto - cobertura);
  const puedePreparar = autorizada && fondo.isSuccess && !balance?.requiereRevision && maximo >= minimo && maximo > yaAplicado;
  const propuestaInvalida = montoPropuesto !== undefined && autorizada && fondo.isSuccess
    && (montoPropuesto < minimo || montoPropuesto > maximo);
  const importe = importeManual.trim().replace(",", ".");
  const manual = /^\d+(\.\d{1,2})?$/.test(importe) ? centavos(Number(importe)) : null;
  const manualValido = manual !== null && manual >= minimo && manual <= maximo;
  const manualInvalido = !!importeManual && !manualValido;

  function preparar(monto: number) {
    setImporteManual("");
    onChange(monto === yaAplicado ? undefined : monto / 100);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <h3 className="text-sm font-semibold">Cubrir faltante con el Fondo de Sobrantes</h3>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Faltante del cuadre</dt>
          <dd className="font-mono tabular-nums">{mostrarMonto(faltanteBruto)}</dd>
        </div>
        {yaAplicado > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Fondo ya aplicado</dt>
            <dd className="font-mono tabular-nums">{mostrarMonto(yaAplicado)}</dd>
          </div>
        )}
        {reutilizable > yaAplicado && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Compensación previa reutilizable</dt>
            <dd className="font-mono tabular-nums">{mostrarMonto(reutilizable)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Cobertura total prevista</dt>
          <dd className="font-mono tabular-nums">{mostrarMonto(cobertura)}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
          <dt>Faltante restante</dt>
          <dd className="font-mono tabular-nums">{mostrarMonto(pendiente)}</dd>
        </div>
      </dl>

      {!autorizada && (
        <p className="text-sm text-muted-foreground">Para usar el fondo, entra con tu PIN autorizado de caja.</p>
      )}
      {autorizada && fondo.isPending && <p role="status" className="text-sm">Consultando el saldo del fondo…</p>}
      {autorizada && fondo.isError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">No se pudo consultar el saldo del fondo.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void fondo.refetch()}>Reintentar</Button>
        </div>
      )}
      {autorizada && fondo.isSuccess && (
        <p className="text-sm text-muted-foreground">Saldo confirmado disponible: {mostrarMonto(saldoDisponible)}.</p>
      )}
      {balance?.requiereRevision && <p role="alert" className="text-sm text-destructive">{balance.requiereRevision}</p>}
      {puedePreparar && (
        <div className="space-y-2">
          <Button type="button" variant="outline" onClick={() => preparar(maximo)}>
            Preparar máximo de {mostrarMonto(maximo)}
          </Button>
          <label htmlFor={importeId} className="block text-sm">Cobertura total (CUP)</label>
          <div className="flex flex-wrap gap-2">
            <Input id={importeId} className="min-w-28 flex-1" inputMode="decimal" value={importeManual}
              onChange={(event) => setImporteManual(event.target.value)} aria-invalid={manualInvalido}
              aria-describedby={manualInvalido ? `${importeId}-error` : undefined} />
            <Button type="button" variant="outline" disabled={!manualValido}
              onClick={() => { if (manual !== null && manualValido) preparar(manual); }}>
              Preparar importe
            </Button>
          </div>
          {manualInvalido && (
            <p id={`${importeId}-error`} className="text-xs text-destructive">
              Introduce un importe entre {mostrarMonto(minimo)} y {mostrarMonto(maximo)}, con hasta dos decimales.
            </p>
          )}
        </div>
      )}
      {propuestaInvalida && (
        <p role="alert" className="text-sm text-destructive">Ajusta la cobertura al saldo disponible o deshaz la selección antes de guardar.</p>
      )}
      {propuesto !== undefined && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">La cobertura nueva se aplica al guardar el cuadre.</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => {
            setImporteManual("");
            onChange(undefined);
          }}>
            Deshacer cobertura prevista
          </Button>
        </div>
      )}
    </section>
  );
}
