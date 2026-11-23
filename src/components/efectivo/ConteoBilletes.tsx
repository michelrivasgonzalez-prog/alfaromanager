import { DENOMINACIONES, type Denominaciones } from "@/store/cuadreStore";
import { formatoDinero, totalDenominaciones } from "@/lib/entregasEfectivo";
import { Input } from "@/components/ui/input";

type Props = {
  value: Denominaciones;
  onChange: (next: Denominaciones) => void;
  disabled?: boolean;
  idPrefix: string;
};

export function ConteoBilletes({ value, onChange, disabled, idPrefix }: Props) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)_6rem] gap-2 border-b border-border pb-2 text-[11px] text-muted-foreground">
        <span>Billete</span><span>Cantidad</span><span className="text-right">Subtotal</span>
      </div>
      {DENOMINACIONES.map((d) => {
        const cantidad = value[String(d)] || 0;
        return (
          <div key={d} className="grid grid-cols-[5rem_minmax(0,1fr)_6rem] items-center gap-2 border-b border-border/50 py-1">
            <label htmlFor={`${idPrefix}-${d}`} className="text-xs font-bold tabular-nums">
              ${d.toLocaleString("es-ES")}
            </label>
            <Input id={`${idPrefix}-${d}`} type="number" min={0} step={1} inputMode="numeric"
              disabled={disabled} value={cantidad || ""}
              placeholder="0" className="h-9 min-w-0 rounded-lg text-right text-sm"
              onChange={(event) => {
                const texto = event.target.value.trim();
                const numero = texto === "" ? 0 : Number(texto);
                onChange({ ...value, [String(d)]: numero });
              }}
            />
            <span className="text-right text-xs font-semibold tabular-nums">
              {(d * cantidad).toLocaleString("es-ES")}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-bold text-sm">Total del fajo</span>
        <strong className="text-base tabular-nums text-secondary">
          {formatoDinero(totalDenominaciones(value))}
        </strong>
      </div>
    </div>
  );
}
