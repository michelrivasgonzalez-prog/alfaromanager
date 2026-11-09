import { useEffect, useMemo, useRef, useState } from "react";
import { useCuadreStore, PUNTOS, SALARIO_MODOS, SalarioModo } from "@/store/cuadreStore";
import { usePinStore } from "@/store/pinStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Coffee,
  Store as StoreIcon,
  Percent,
  Cloud,
  RefreshCw,
  Trash2,
  Wifi,
  Upload,
  ShieldCheck,
  FileDown,
  ClipboardList,
  Warehouse,
  Plus,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/NumberInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fullSync, pushSettings } from "@/lib/sync";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import { importFromAppsheet, type ImportResult } from "@/lib/appsheetImport";
import {
  importCuadresFromFile,
  downloadPlantillaCuadres,
  type CuadresImportResult,
} from "@/lib/cuadresImport";
import { pushCuadre } from "@/lib/sync";
import { listAuditoria, AuditoriaRow } from "@/lib/auditoria";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Ajustes() {
  const { history, settings, setSalarioBasePunto, updateSettings, importCuadresBulk } =
    useCuadreStore();
  const { role } = useAuth();
  const { logout } = usePinStore();
  const isAdmin = role === "admin";
  const [cloudOk, setCloudOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importingCuadres, setImportingCuadres] = useState(false);
  const [cuadresResult, setCuadresResult] = useState<CuadresImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileCuadresRef = useRef<HTMLInputElement>(null);

  // Formulario local para nueva excepción de salario
  const [nuevoProdExcepcion, setNuevoProdExcepcion] = useState({
    nombre: "",
    tarifa: 10,
  });

  // Auto conectar a la nube al abrir Ajustes
  useEffect(() => {
    (async () => {
      const ok = await ensureCloudSession();
      setCloudOk(ok);
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

  const saveSettings = () =>
    pushSettings().catch((err) =>
      toast.error("No se guardó en la nube: " + err.message)
    );

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

  const onImportCuadres = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingCuadres(true);
    setCuadresResult(null);
    try {
      const { cuadres, result } = await importCuadresFromFile(file);
      if (cuadres.length === 0) throw new Error("No se encontraron cuadres válidos");
      importCuadresBulk(cuadres);
      for (const c of cuadres) {
        pushCuadre(c).catch(console.warn);
      }
      setCuadresResult(result);
      toast.success(`${result.creados} cuadre(s) importado(s)`);
    } catch (err: any) {
      toast.error("Error al importar: " + (err.message || ""));
    } finally {
      setImportingCuadres(false);
      if (fileCuadresRef.current) fileCuadresRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      {/* Estado de conexión */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Wifi
            className={`h-4 w-4 ${
              navigator.onLine ? "text-secondary" : "text-muted-foreground"
            }`}
          />
          <span className="font-semibold">
            {navigator.onLine ? "En línea" : "Sin conexión"}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Offline siempre activo
          </span>
        </div>
      </div>

      {/* Preferencias de navegación */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <div className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Navegación</div>
            <div className="text-xs text-muted-foreground">
              Personaliza las secciones visibles del menú.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="ocultar-almacen" className="text-sm">
              Ocultar Almacén del menú
            </Label>
            <p className="text-xs text-muted-foreground">
              Oculta la pestaña Almacén de la barra inferior.
            </p>
          </div>

          <Switch
            id="ocultar-almacen"
            checked={settings.ocultarAlmacen ?? false}
            onCheckedChange={(val) => {
              updateSettings({ ocultarAlmacen: val });
              pushSettings().catch((err) =>
                toast.error("No se guardó en la nube: " + err.message)
              );
            }}
          />
        </div>
      </div>

      {/* Sincronización Nube */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex items-center gap-2">
            <Cloud
              className={`h-4 w-4 ${
                cloudOk ? "text-secondary" : "text-muted-foreground"
              }`}
            />
            <div className="text-sm font-semibold">Sincronización con la nube</div>
          </div>
          <p className="text-xs text-muted-foreground">
            La sincronización es <strong>automática</strong> al abrir la app. Todos tus
            dispositivos comparten los mismos datos. Puedes forzar una sincronización
            manual aquí.
          </p>
          <Button
            onClick={sync}
            disabled={busy}
            className="w-full rounded-xl gradient-emerald"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{" "}
            Sincronizar ahora
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
            <strong>Deudas</strong> y <strong>Abonos</strong>. Los clientes se enlazan
            por nombre y los datos se cargan directamente a la nube.
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
              <div>
                Clientes creados: <strong>{importResult.clientes.creados}</strong> (ya
                existían: {importResult.clientes.existentes})
              </div>
              <div>
                Deudas creadas: <strong>{importResult.deudas.creadas}</strong> (omitidas:{" "}
                {importResult.deudas.omitidas})
              </div>
              <div>
                Abonos creados: <strong>{importResult.abonos.creados}</strong> (omitidos:{" "}
                {importResult.abonos.omitidos})
              </div>
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

      {/* Importar cuadres desde plantilla */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">
              Importar cuadres desde plantilla
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Descarga la plantilla, complétala con tus cuadres (hojas{" "}
            <strong>Cuadres</strong>, <strong>Productos</strong> y <strong>Gastos</strong>)
            y súbela aquí. Los cuadres se añaden al historial y se envían a la nube.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={downloadPlantillaCuadres}
              className="rounded-xl"
            >
              <FileDown className="mr-1 h-4 w-4" /> Plantilla
            </Button>
            <input
              ref={fileCuadresRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onImportCuadres}
              className="hidden"
            />
            <Button
              onClick={() => fileCuadresRef.current?.click()}
              disabled={importingCuadres}
              className="rounded-xl gradient-primary"
            >
              <Upload
                className={`mr-1 h-4 w-4 ${importingCuadres ? "animate-pulse" : ""}`}
              />
              {importingCuadres ? "Importando…" : "Subir"}
            </Button>
          </div>
          {cuadresResult && (
            <div className="rounded-xl bg-muted/60 p-3 text-xs space-y-1">
              <div>
                Cuadres importados: <strong>{cuadresResult.creados}</strong>
              </div>
              {cuadresResult.errores.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-destructive">
                    {cuadresResult.errores.length} advertencia(s)
                  </summary>
                  <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5">
                    {cuadresResult.errores.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {(isAdmin || role === "duena") && <RespaldoPanel />}

      {isAdmin && <CategoriasPanel />}

      {(isAdmin || role === "duena") && <AuditoriaPanel />}

      {/* Salario de dependientes */}
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
                <div
                  key={p}
                  className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2"
                >
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {p}
                  </div>
                  <div>
                    <Label className="text-xs">Modo de cálculo</Label>
                    <Select
                      value={modo}
                      onValueChange={(v) => {
                        updateSettings({
                          salarioModo: { ...settings.salarioModo, [p]: v as SalarioModo },
                        });
                        saveSettings();
                      }}
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
                        onChange={(v) => {
                          setSalarioBasePunto(p, v);
                          saveSettings();
                        }}
                        className="mt-1 h-11 rounded-xl"
                        disabled={modo === "porcentaje"}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">% de venta</Label>
                      <NumberInput
                        value={settings.porcentajeVenta?.[p] ?? 3}
                        onChange={(v) => {
                          updateSettings({
                            porcentajeVenta: { ...settings.porcentajeVenta, [p]: v },
                          });
                          saveSettings();
                        }}
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
              onChange={(v) => {
                updateSettings({ porcentajeTransferencia: v });
                saveSettings();
              }}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
        </div>
      )}

      {/* TARIFAS FIJAS POR PRODUCTO EN SALARIO */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Tarifas por Producto en Salario (% de venta)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Productos con pago fijo por unidad vendida. Su venta no entra al 2.5% general y paga directamente su tarifa en CUP.
            </p>
          </div>

          <div className="space-y-2">
            {(settings.salarioExcepcionesProductos ?? []).map((exc) => (
              <div
                key={exc.id}
                className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-muted/20 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">{exc.productoNombre}</span>
                  <span className="text-muted-foreground ml-2">
                    (${exc.tarifaPorUnidad} CUP / unidad vendida)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    const nuevas = (settings.salarioExcepcionesProductos ?? []).filter(
                      (e) => e.id !== exc.id
                    );
                    updateSettings({ salarioExcepcionesProductos: nuevas });
                    saveSettings();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {(settings.salarioExcepcionesProductos ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2">
                No hay productos excepcionales configurados.
              </p>
            )}
          </div>

          {/* Formulario para agregar producto */}
          <div className="pt-2 border-t border-border/50 flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nombre del producto (ej: Cerveza Mayabe)"
              value={nuevoProdExcepcion.nombre}
              onChange={(e) =>
                setNuevoProdExcepcion((prev) => ({ ...prev, nombre: e.target.value }))
              }
              className="h-10 text-xs rounded-xl flex-1"
            />
            <div className="flex items-center gap-1.5 w-full sm:w-44">
              <Input
                type="number"
                placeholder="Tarifa CUP"
                value={nuevoProdExcepcion.tarifa}
                onChange={(e) =>
                  setNuevoProdExcepcion((prev) => ({
                    ...prev,
                    tarifa: Number(e.target.value),
                  }))
                }
                className="h-10 text-xs rounded-xl"
              />
              <Button
                size="sm"
                className="h-10 px-3 rounded-xl shrink-0 gap-1 text-xs"
                onClick={() => {
                  if (!nuevoProdExcepcion.nombre.trim()) return;
                  const nuevas = [
                    ...(settings.salarioExcepcionesProductos ?? []),
                    {
                      id: Date.now().toString(),
                      productoNombre: nuevoProdExcepcion.nombre.trim(),
                      tarifaPorUnidad: Number(nuevoProdExcepcion.tarifa || 0),
                    },
                  ];
                  updateSettings({ salarioExcepcionesProductos: nuevas });
                  saveSettings();
                  setNuevoProdExcepcion({ nombre: "", tarifa: 10 });
                  toast.success("Producto añadido a excepciones de salario");
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Añadir
              </Button>
            </div>
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
            if (
              confirm(
                "¿Borrar TODOS los datos locales (cuadres, productos, usuarios PIN)? Esta acción no se puede deshacer."
              )
            ) {
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

const RESPALDO_TABLAS = [
  "clientes",
  "deudas",
  "abonos",
  "abono_aplicaciones",
  "cuadres",
  "catalogo",
  "dependientes",
  "almacen_productos",
  "almacen_movimientos",
  "app_settings",
] as const;

async function fetchAll(tabla: string) {
  const rows: any[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await (supabase as any)
      .from(tabla)
      .select("*")
      .range(from, from + page - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return rows;
}

function RespaldoPanel() {
  const [busy, setBusy] = useState(false);

  const descargar = async () => {
    setBusy(true);
    try {
      const nube: Record<string, any[]> = {};
      const avisos: string[] = [];
      const ok = navigator.onLine ? await ensureCloudSession() : false;
      if (ok) {
        for (const t of RESPALDO_TABLAS) {
          try {
            nube[t] = await fetchAll(t);
          } catch (e: any) {
            avisos.push(e.message);
          }
        }
      } else {
        avisos.push(
          "Sin conexión: solo se incluyen los datos guardados en este dispositivo"
        );
      }
      let local: any = null;
      try {
        local = JSON.parse(localStorage.getItem("alfarocafe-store") || "null");
      } catch {
        local = null;
      }
      const respaldo = {
        app: "AlfaroCafe",
        generado: new Date().toISOString(),
        nube,
        local,
        avisos,
      };
      const blob = new Blob([JSON.stringify(respaldo, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `alfarocafe-respaldo-${format(new Date(), "yyyy-MM-dd")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (avisos.length)
        toast.warning(`Respaldo descargado con ${avisos.length} aviso(s)`);
      else toast.success("Copia de seguridad descargada");
    } catch (e: any) {
      toast.error("Error al crear el respaldo: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center gap-2">
        <FileDown className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Copia de seguridad</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Descarga un archivo con clientes, deudas, abonos, cuadres, catálogo y almacén.
        Guárdalo en tu PC, memoria USB o Google Drive.
      </p>
      <Button
        onClick={descargar}
        disabled={busy}
        className="w-full rounded-xl gradient-primary"
      >
        <FileDown className={`mr-1 h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
        {busy ? "Preparando…" : "Descargar respaldo completo"}
      </Button>
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

function CategoriasPanel() {
  const { settings, updateSettings } = useCuadreStore();
  const cats = settings.categorias ?? [];
  const [nueva, setNueva] = useState("");

  const save = (next: string[]) => {
    updateSettings({ categorias: next });
    pushSettings().catch((err) =>
      toast.error("No se guardó en la nube: " + err.message)
    );
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...cats];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
      <div>
        <div className="text-sm font-semibold">Categorías de productos</div>
        <div className="text-xs text-muted-foreground">
          El catálogo se ordena por categoría (en este orden) y luego alfabéticamente.
        </div>
      </div>

      <div className="space-y-2">
        {cats.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Sin categorías aún
          </div>
        )}
        {cats.map((c, i) => (
          <div key={`${c}-${i}`} className="flex items-center gap-2">
            <Input
              value={c}
              onChange={(e) => {
                const next = [...cats];
                next[i] = e.target.value;
                updateSettings({ categorias: next });
              }}
              onBlur={() => save(cats.map((x) => x.trim()).filter(Boolean))}
              className="h-10 flex-1 rounded-xl"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={i === cats.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => save(cats.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Nueva categoría (ej. Bebidas)"
          className="h-10 rounded-xl"
        />
        <Button
          className="h-10 rounded-xl gradient-primary"
          onClick={() => {
            const v = nueva.trim();
            if (!v) return;
            if (cats.some((c) => c.toLowerCase() === v.toLowerCase())) {
              toast.error("Ya existe esa categoría");
              return;
            }
            save([...cats, v]);
            setNueva("");
            toast.success("Categoría agregada");
          }}
        >
          Añadir
        </Button>
      </div>
    </div>
  );
}

function AuditoriaPanel() {
  const [logs, setLogs] = useState<AuditoriaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [accionFiltro, setAccionFiltro] = useState<string>("todas");
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data: clis } = await supabase.from("clientes").select("id, nombre");
      const map: Record<string, string> = {};
      (clis ?? []).forEach((c) => {
        map[c.id] = c.nombre;
      });
      setClientesMap(map);

      const data = await listAuditoria({
        usuario: usuario || undefined,
        limit: 100,
      });
      setLogs(data ?? []);
    } catch (e: any) {
      toast.error("Error al cargar auditoría: " + (e?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const logsFiltrados = useMemo(() => {
    if (!logs) return [];
    if (accionFiltro === "todas") return logs;
    return logs.filter((l) =>
      (l.accion || "").toLowerCase().includes(accionFiltro.toLowerCase())
    );
  }, [logs, accionFiltro]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Trazabilidad y Auditoría</div>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {logsFiltrados.length} evento(s)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          placeholder="Buscar por usuario…"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="h-9 rounded-xl text-xs"
        />
        <Select value={accionFiltro} onValueChange={setAccionFiltro}>
          <SelectTrigger className="h-9 rounded-xl text-xs">
            <SelectValue placeholder="Tipo de acción" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="todas">Todos los movimientos</SelectItem>
            <SelectItem value="registrar_abono">Abonos recibidos</SelectItem>
            <SelectItem value="revertir_abono">Abonos cancelados / revertidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={load}
        disabled={loading}
        className="w-full rounded-xl gradient-primary h-9 text-xs"
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Cargando…" : "Actualizar eventos"}
      </Button>

      <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
        {logsFiltrados.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Sin registros de auditoría encontrados.
          </div>
        )}

        {logsFiltrados.map((l) => {
          const rawFecha =
            (l as any).fecha || (l as any).creado_en || (l as any).created_at;
          let fechaStr = "—";
          if (rawFecha) {
            try {
              fechaStr = format(new Date(rawFecha), "dd MMM · HH:mm", { locale: es });
            } catch {
              fechaStr = "—";
            }
          }

          const d = l.detalle ?? {};
          const esReversion = l.accion.includes("revertir");
          const clienteNombre = d.cliente_id
            ? clientesMap[d.cliente_id] || "Cliente registrado"
            : null;
          const monto = Number(d.monto || 0);
          const credito = Number(d.credito_generado || 0);
          const aplicaciones = Array.isArray(d.aplicaciones) ? d.aplicaciones : [];

          return (
            <div
              key={l.id}
              className="rounded-xl border border-border bg-muted/20 p-3 text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                        esReversion
                          ? "bg-destructive/10 text-destructive"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {esReversion ? "Abono Revertido" : "Abono Registrado"}
                    </span>
                    {clienteNombre && (
                      <span className="font-semibold text-foreground text-[11px]">
                        {clienteNombre}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Operador:{" "}
                    <strong className="text-foreground">
                      {l.usuario_nombre ?? "Sistema"}
                    </strong>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                  {fechaStr}
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-card p-2.5 text-[11px] space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Monto:</span>
                  <span
                    className={`font-mono font-bold ${
                      esReversion
                        ? "text-destructive"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {esReversion ? "-" : "+"}${monto.toLocaleString("es-ES")} CUP
                  </span>
                </div>
                {credito > 0 && (
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Crédito a favor generado:</span>
                    <span className="font-mono font-semibold text-foreground">
                      +${credito.toLocaleString("es-ES")} CUP
                    </span>
                  </div>
                )}
                {aplicaciones.length > 0 && (
                  <div className="flex justify-between items-center text-muted-foreground border-t border-border/30 pt-1">
                    <span>Impacto en cuentas:</span>
                    <span className="text-foreground font-medium">
                      {aplicaciones.length} deuda(s) cubierta(s)
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
