import { useEffect, useRef, useState } from "react";
import {
  Camera, CameraOff, RefreshCw, ScanBarcode, Flashlight, FlashlightOff,
  Volume2, VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { esCodigoBarrasValido, limpiarCodigoBarras } from "@/lib/codigosBarras";
import { prepararSonidoEscaner, reproducirBeepEscaner } from "@/lib/sonidoEscaner";

type Dispositivo = { deviceId: string; label: string };
type ControlesEscaner = {
  stop: () => void;
  switchTorch?: (on: boolean) => Promise<void>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
  titulo?: string;
};

/**
 * Escáner real de códigos de barras 1D con ZXing.
 * Safari y Chrome en iOS comparten WebKit: no dependen de BarcodeDetector.
 * El navegador procesa el vídeo localmente y el escáner funciona sin Internet
 * después de que la aplicación y sus recursos estén disponibles.
 */
export default function BarcodeScanner({
  open,
  onOpenChange,
  onScan,
  titulo = "Escanear código de barras",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlesRef = useRef<ControlesEscaner | null>(null);
  const onScanRef = useRef(onScan);
  const onOpenChangeRef = useRef(onOpenChange);
  const detectadoRef = useRef(false);
  const sonidoRef = useRef(true);
  const [sonidoHabilitado, setSonidoHabilitado] = useState(true);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [deviceId, setDeviceId] = useState("");
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [torchDisponible, setTorchDisponible] = useState(false);
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [activo, setActivo] = useState(false);

  // Los callbacks de Productos y Precuadre cambian en cada render.
  // Guardarlos en refs evita que eso reinicie la cámara continuamente.
  useEffect(() => {
    onScanRef.current = onScan;
    onOpenChangeRef.current = onOpenChange;
  }, [onScan, onOpenChange]);

  // Safari en iPhone necesita activar Web Audio durante un toque real.
  // Este listener captura también el toque del botón que ABRE el escáner.
  useEffect(() => {
    const prepararDuranteGesto = () => {
      if (sonidoRef.current) prepararSonidoEscaner();
    };
    document.addEventListener("pointerdown", prepararDuranteGesto, true);
    document.addEventListener("touchstart", prepararDuranteGesto, true);
    document.addEventListener("keydown", prepararDuranteGesto, true);
    return () => {
      document.removeEventListener("pointerdown", prepararDuranteGesto, true);
      document.removeEventListener("touchstart", prepararDuranteGesto, true);
      document.removeEventListener("keydown", prepararDuranteGesto, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelado = false;
    let controles: ControlesEscaner | null = null;
    let ultimaAdvertencia = 0;
    detectadoRef.current = false;
    setError("");
    setEstado("Abriendo cámara y preparando lector…");
    setActivo(false);
    setTorch(false);
    setTorchDisponible(false);

    const liberarVideo = () => {
      try { controles?.stop(); } catch (e) { console.warn("Deteniendo ZXing:", e); }
      const video = videoRef.current;
      const stream = video?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      controles = null;
      controlesRef.current = null;
    };

    const iniciar = async () => {
      if (!window.isSecureContext) {
        setError("Se necesita HTTPS para utilizar la cámara. Escribe el código manualmente.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite acceder a la cámara.");
        return;
      }

      try {
        const { BrowserMultiFormatOneDReader, BrowserCodeReader } =
          await import("@zxing/browser");
        if (cancelado) return;

        const video = videoRef.current;
        if (!video) throw new Error("No se pudo crear la vista de la cámara.");
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");

        // ZXing controla la cámara Y analiza las imágenes. Evita abrirla
        // dos veces: Safari puede bloquear una segunda captura simultánea.
        const reader = new BrowserMultiFormatOneDReader(
          undefined,
          { delayBetweenScanAttempts: 160, delayBetweenScanSuccess: 300 }
        );
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        const iniciados = await reader.decodeFromConstraints(
          constraints,
          video,
          (resultado, _error, controlesActuales) => {
            if (cancelado || detectadoRef.current || !resultado) return;

            const codigo = limpiarCodigoBarras(resultado.getText());
            // Solo asociamos GTIN validados, no textos arbitrarios Code128.
            if (!esCodigoBarrasValido(codigo)) {
              if (Date.now() - ultimaAdvertencia > 2500) {
                ultimaAdvertencia = Date.now();
                setEstado("Se detectó un código, pero no es un EAN/UPC/GTIN válido.");
              }
              return;
            }

            detectadoRef.current = true;
            setEstado("Código reconocido: " + codigo);
            // El beep confirma la lectura válida, no que exista en el catálogo.
            // La llamada no bloquea el procesamiento del producto.
            if (sonidoRef.current) reproducirBeepEscaner();
            try {
              onScanRef.current(codigo);
              controlesActuales.stop();
              onOpenChangeRef.current(false);
            } catch (e) {
              console.error("Error al procesar código:", e);
              onOpenChangeRef.current(false);
            }
          }
        );

        if (cancelado || detectadoRef.current) {
          iniciados.stop();
          return;
        }

        controles = iniciados;
        controlesRef.current = iniciados;
        setActivo(true);
        setEstado("Lector activo. Coloca las barras completas dentro del recuadro.");

        const stream = video.srcObject;
        const track = stream instanceof MediaStream
          ? stream.getVideoTracks()[0]
          : undefined;
        try {
          setTorchDisponible(Boolean((track?.getCapabilities?.() as any)?.torch));
        } catch {
          setTorchDisponible(false);
        }

        try {
          const lista = await BrowserCodeReader.listVideoInputDevices();
          if (!cancelado) {
            setDispositivos(lista.map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || "Cámara " + (i + 1),
            })));
          }
        } catch {
          // Algunos navegadores no revelan la lista de cámaras.
          if (!cancelado) setDispositivos([]);
        }
      } catch (e: any) {
        if (cancelado || detectadoRef.current) return;
        console.error("No se pudo iniciar el lector ZXing:", e);
        const nombre = e?.name ?? "";
        const mensaje = String(e?.message ?? "");
        const sinPermiso = nombre === "NotAllowedError" || nombre === "PermissionDeniedError";
        const sinCamara = nombre === "NotFoundError" || nombre === "OverconstrainedError";
        setError(
          sinPermiso
            ? "El navegador no tiene permiso para usar la cámara. Revísalo en los ajustes del sitio."
            : sinCamara
              ? "No se encontró esa cámara. Prueba con Frontal/Trasera."
              : "No se pudo iniciar el lector: " + mensaje
        );
        setEstado("");
        liberarVideo();
      }
    };

    void iniciar();
    return () => {
      cancelado = true;
      liberarVideo();
    };
  }, [open, facing, deviceId]);

  const cambiarCamara = () => {
    setDeviceId("");
    setFacing((actual) => actual === "environment" ? "user" : "environment");
  };

  const cambiarFlash = async () => {
    const stream = videoRef.current?.srcObject;
    const track = stream instanceof MediaStream
      ? stream.getVideoTracks()[0]
      : undefined;
    if (!track || !torchDisponible) return;
    try {
      const encender = !torch;
      await track.applyConstraints({ advanced: [{ torch: encender } as any] });
      setTorch(encender);
    } catch {
      setTorchDisponible(false);
      setError("Este navegador no permite activar el flash en esa cámara.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-1rem)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5" /> {titulo}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Se escanea automáticamente: no necesitas pulsar ni tomar fotografías.
        </p>

        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain"
          />
          <div className="pointer-events-none absolute inset-x-[7%] top-[32%] h-[36%] rounded-lg border-2 border-white/90" />
          {!activo && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white text-sm">
              <Camera className="h-7 w-7 animate-pulse" /> Iniciando lector…
            </div>
          )}
        </div>

        {estado && !error && (
          <p role="status" className="text-xs text-muted-foreground">{estado}</p>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

        <p className="text-[11px] text-muted-foreground">
          Consejo: usa la cámara trasera, buena luz, sin reflejos y a unos 10–20 cm del código.
          Deja visible el código completo, incluidos sus bordes blancos.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={cambiarCamara}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Frontal / Trasera
          </Button>
          <Button type="button" variant="outline"
            disabled={!torchDisponible || !activo}
            onClick={() => void cambiarFlash()}>
            {torch ? <FlashlightOff className="mr-1.5 h-4 w-4" /> :
              <Flashlight className="mr-1.5 h-4 w-4" />}
            {torch ? "Apagar flash" : "Flash"}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost"
            aria-label={sonidoHabilitado ? "Silenciar confirmación de escaneo" : "Activar confirmación sonora"}
            onClick={() => {
              const activar = !sonidoRef.current;
              sonidoRef.current = activar;
              setSonidoHabilitado(activar);
              if (activar) {
                // Esta pulsación también desbloquea audio si Safari lo bloqueó.
                prepararSonidoEscaner();
                reproducirBeepEscaner();
              }
            }}>
            {sonidoHabilitado ? <Volume2 className="mr-1.5 h-4 w-4" /> :
              <VolumeX className="mr-1.5 h-4 w-4" />}
            {sonidoHabilitado ? "Sonido activado" : "Sonido desactivado"}
          </Button>
        </div>

        {dispositivos.length > 1 && (
          <label className="text-xs text-muted-foreground">
            Seleccionar cámara
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              <option value="">Automática ({facing === "environment" ? "trasera" : "frontal"})</option>
              {dispositivos.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
        )}

        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          <CameraOff className="mr-1.5 h-4 w-4" /> Cerrar cámara / Introducir código manual
        </Button>
      </DialogContent>
    </Dialog>
  );
}
