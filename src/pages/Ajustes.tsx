import { useEffect, useRef, useState } from "react";
import { useCuadreStore, PUNTOS, SALARIO_MODOS, SalarioModo } from "@/store/cuadreStore";
import { usePinStore } from "@/store/pinStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Coffee, Store as StoreIcon, Percent, Cloud, RefreshCw, Trash2, Wifi, Upload, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fullSync } from "@/lib/sync";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import { importFromAppsheet, type ImportResult } from "@/lib/appsheetImport";
import { listAuditoria, AuditoriaRow } from "@/lib/auditoria";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Ajustes() {
  const { history, settings, setSalarioBasePunto, updateSettings } = useCuadreStore();
  const { role } = useAuth();
  const { logout } = usePinStore();
  const isAdmin = role === "admin";
  const [cloudOk, setCloudOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto conectar a la nube al abrir Ajustes
  useEffect(() => {
    (async () => {
      const ok = await ensureCloudSession();
      setCloudOk(ok);
      // Auto-sync silencioso al abrir
      if (ok) fullSync("admin").catch(console.warn);
    })();
  }, []);

  const sync = async () => {
    if (!navigator.onLine) return toast.error("Sin conexión a internet");
    setBusy(true);
    try {
      const ok = await ensureCloudSession();
      setCloudOk(ok);
      if (!ok) throw new Error("No se pudo conectar a la nube");
      await fullSync("admin");
      toast.success("Sincronización completa");
    } catch (err: any) {
      toast.error("Error de sync: " + (err.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await importFromAppsheet(file);
      setImportResult(res);
      toast.success(
        `Importación completa: ${res.clientes.creados} clientes, ${res.deudas.creadas} deudas, ${res.abonos.creados} abonos`
      );
    } catch (err: any) {
      toast.error("Error al importar: " + (err.message || ""));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      {/* Estado de conexión */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Wifi className={`h-4 w-4 ${navigator.onLine ? "text-secondary" : "text-muted-foreground"}`} />
          <span className="font-semibold">{navigator.onLine ? "En línea" : "Sin conexión"}</span>
          <span className="ml-auto text-xs text-muted-foreground">Offline siempre activo</span>
        </div>
      </div>

      {/* Nube (auto, sin correo) */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className={`h-4 w-4 ${cloudOk ? "text-secondary" : "text-muted-foreground"}`} />
            <div className="text-sm font-semibold">Sincronización con la nube</div>
          </div>
          <p className="text-xs text-muted-foreground">
            La sincronización es <strong>automática</strong> al abrir la app. Todos tus dispositivos
            comparten los mismos datos. Puedes forzar una sincronización manual aquí.
          </p>
          <Button onClick={sync} disabled={busy} className="w-full rounded-xl gradient-emerald">
            <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Sincronizar ahora
          </Button>
        </div>
      )}

      {/* Importación desde AppSheet */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Importar desde AppSheet</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sube un archivo <code>.xlsx</code> con las hojas <strong>Clientes</strong>,{" "}
            <strong>Deudas</strong> y <strong>Abonos</strong>. Los clientes se enlazan por nombre y
            los datos se cargan directamente a la nube.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onImportFile}
            className="hidden"
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="w-full rounded-xl gradient-primary"
          >
            <Upload className={`mr-1 h-4 w-4 ${importing ? "animate-pulse" : ""}`} />
            {importing ? "Importando…" : "Elegir archivo .xlsx"}
          </Button>
          {importResult && (
            <div className="rounded-xl bg-muted/60 p-3 text-xs space-y-1">
              <div>Clientes creados: <strong>{importResult.clientes.creados}</strong> (ya existían: {importResult.clientes.existentes})</div>
              <div>Deudas creadas: <strong>{importResult.deudas.creadas}</strong> (omitidas: {importResult.deudas.omitidas})</div>
              <div>Abonos creados: <strong>{importResult.abonos.creados}</strong> (omitidos: {importResult.abonos.omitidos})</div>
              {importResult.errores.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-destructive">
                    {importResult.errores.length} advertencia(s)
                  </summary>
                  <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5">
                    {importResult.errores.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && <AuditoriaPanel />}

      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div>
            <div className="text-sm font-semibold">Salario de dependientes</div>
            <div className="text-xs text-muted-foreground">
              Configura modo, base por día y % de venta por punto.
            </div>
          </div>
          <div className="space-y-4">
            {PUNTOS.map((p) => {
              const Icon = p === "Cafetería" ? Coffee : StoreIcon;
              const modo = settings.salarioModo?.[p] ?? "base";
              return (
                <div key={p} className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {p}
                  </div>
                  <div>
                    <Label className="text-xs">Modo de cálculo</Label>
                    <Select
                      value={modo}
                      onValueChange={(v) =>
                        updateSettings({
                          salarioModo: { ...settings.salarioModo, [p]: v as SalarioModo },
                        })
                      }
                    >
                      <SelectTrigger className="mt-1 h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {SALARIO_MODOS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SALARIO_MODOS.find((m) => m.value === modo)?.desc}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Base/día</Label>
                      <NumberInput
                        value={settings.salarioBase[p]}
                        onChange={(v) => setSalarioBasePunto(p, v)}
                        className="mt-1 h-11 rounded-xl"
                        disabled={modo === "porcentaje"}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">% de venta</Label>
                      <NumberInput
                        value={settings.porcentajeVenta?.[p] ?? 3}
                        onChange={(v) =>
                          updateSettings({
                            porcentajeVenta: { ...settings.porcentajeVenta, [p]: v },
                          })
                        }
                        className="mt-1 h-11 rounded-xl"
                        disabled={modo === "base"}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <Label className="flex items-center gap-1 text-xs">
              <Percent className="h-3.5 w-3.5" /> Cargo por transferencia (%)
            </Label>
            <NumberInput
              value={settings.porcentajeTransferencia}
              onChange={(v) => updateSettings({ porcentajeTransferencia: v })}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <Row label="Cuadres en historial" value={String(history.length)} />
        <Row label="Versión" value="1.1.0" />
      </div>

      {isAdmin && (
        <Button
          variant="destructive"
          className="w-full rounded-xl"
          onClick={() => {
            if (confirm("¿Borrar TODOS los datos locales (cuadres, productos, usuarios PIN)? Esta acción no se puede deshacer.")) {
              localStorage.removeItem("alfarocafe-store");
              localStorage.removeItem("alfarocafe-pin");
              logout();
              toast.success("Datos borrados");
              setTimeout(() => location.reload(), 600);
            }
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Borrar todos los datos locales
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function AuditoriaPanel() {
  const [logs, setLogs] = useState<AuditoriaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [entidad, setEntidad] = useState("");
  const [usuario, setUsuario] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await listAuditoria({
        entidad: entidad || undefined,
        usuario: usuario || undefined,
        limit: 100,
      });
      setLogs(data);
    } catch (e: any) {
      toast.error("Error al cargar auditoría: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Auditoría</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Entidad (ej. abonos)"
          value={entidad}
          onChange={(e) => setEntidad(e.target.value)}
          className="h-9 rounded-xl text-xs"
        />
        <Input
          placeholder="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="h-9 rounded-xl text-xs"
        />
      </div>
      <Button onClick={load} disabled={loading} className="w-full rounded-xl gradient-primary">
        <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Cargar registros
      </Button>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {logs.length === 0 && (
          <div className="text-center text-xs text-muted-foreground">Sin registros</div>
        )}
        {logs.map((l) => (
          <div key={l.id} className="rounded-xl border border-border bg-muted/30 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{l.accion}</span>
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(l.fecha), "dd MMM yyyy HH:mm", { locale: es })}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {l.usuario_nombre ?? "Sistema"} · {l.entidad} {l.entidad_id ? `· ${l.entidad_id.slice(0, 8)}` : ""}
            </div>
            {l.detalle && Object.keys(l.detalle).length > 0 && (
              <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-muted/60 p-1.5 text-[10px]">
                {JSON.stringify(l.detalle, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
