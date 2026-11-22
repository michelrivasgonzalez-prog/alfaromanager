import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, ScanBarcode, Flashlight, FlashlightOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { detectarEANEnVideo } from "@/lib/decoderEAN";
import { limpiarCodigoBarras } from "@/lib/codigosBarras";

type Dispositivo = { deviceId: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
  titulo?: string;
};

/**
 * Escáner EAN con BarcodeDetector nativo cuando existe, y decodificador EAN
 * offline basado en canvas en Safari/iPhone. No carga imágenes en servidores.
 */
export default function BarcodeScanner({
  open, onOpenChange, onScan, titulo = "Escanear código de barras",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  const detectadoRef = useRef(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [deviceId, setDeviceId] = useState("");
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [torchDisponible, setTorchDisponible] = useState(false);
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState("");
  const [activo, setActivo] = useState(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    let cancelado = false;
    let fotograma = 0;
    let procesando = false;
    let ultimaLectura = 0;
    detectadoRef.current = false;
    canvasRef.current = document.createElement("canvas");
    setError("");
    setActivo(false);
    setTorch(false);
    setTorchDisponible(false);

    const detener = () => {
      cancelAnimationFrame(fotograma);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.srcObject = null;
      }
    };

    const iniciar = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite usar la cámara. Introduce el código manualmente.");
        return;
      }
      if (!window.isSecureContext) {
        setError("Para abrir la cámara se necesita HTTPS. Usa el código manual.");
        return;
      }
      try {
        const restricciones: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(restricciones);
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        detener();
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute("playsinline", "true");
        await video.play();
        if (cancelado) return;
        setActivo(true);
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as any;
        setTorchDisponible(Boolean(caps?.torch));
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelado) {
          setDispositivos(devices.filter((d) => d.kind === "videoinput").map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || "Cámara " + (i + 1),
          })));
        }

        let detector: { detect: (video: HTMLVideoElement) => Promise<{ rawValue?: string }[]> } | null = null;
        try {
          const ClaseDetector = (window as any).BarcodeDetector;
          if (ClaseDetector) {
            detector = new ClaseDetector({ formats: ["ean_13", "ean_8", "upc_a", "code_128"] });
          }
        } catch { detector = null; }

        const leer = async (ahora: number) => {
          if (cancelado || detectadoRef.current) return;
          fotograma = requestAnimationFrame(leer);
          if (!videoRef.current || videoRef.current.readyState < 2 || procesando || ahora - ultimaLectura < 180) return;
          ultimaLectura = ahora;
          procesando = true;
          try {
            let codigo: string | null = null;
            if (detector) {
              try {
                const encontrados = await detector.detect(videoRef.current);
                codigo = encontrados[0]?.rawValue ?? null;
              } catch {
                detector = null;
              }
            }
            if (!codigo && canvasRef.current && videoRef.current) {
              codigo = detectarEANEnVideo(videoRef.current, canvasRef.current);
            }
            if (codigo && !cancelado && !detectadoRef.current) {
              detectadoRef.current = true;
              onScanRef.current(limpiarCodigoBarras(codigo));
              onOpenChange(false);
            }
          } catch (e) {
            console.warn("Lectura de código de barras:", e);
          } finally {
            procesando = false;
          }
        };
        fotograma = requestAnimationFrame(leer);
      } catch (err: any) {
        if (cancelado) return;
        const permiso = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        const sinCamara = err?.name === "NotFoundError" || err?.name === "OverconstrainedError";
        setError(permiso
          ? "Permite el uso de la cámara en los ajustes del navegador. También puedes introducir el código manualmente."
          : sinCamara
            ? "No se encontró esa cámara. Prueba a cambiarla o introduce el código manualmente."
            : "No se pudo iniciar la cámara: " + (err?.message || "error desconocido"));
      }
    };

    void iniciar();
    return () => { cancelado = true; detener(); };
  }, [open, facing, deviceId, onOpenChange]);

  const cambiarCamara = () => {
    setDeviceId("");
    setFacing((f) => f === "environment" ? "user" : "environment");
  };

  const cambiarFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchDisponible) return;
    try {
      const encender = !torch;
      await track.applyConstraints({ advanced: [{ torch: encender } as any] });
      setTorch(encender);
    } catch {
      setTorchDisponible(false);
      setError("El flash no está disponible en esta cámara o navegador.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-1rem)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <ScanBarcode className="h-5 w-5" /> {titulo}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Acerca el código al recuadro. Se reconoce automáticamente, sin tomar una foto.
        </p>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} autoPlay muted playsInline
            className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[22%_8%] rounded-lg border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.08)]" />
          {!activo && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-sm">
              <Camera className="h-7 w-7 animate-pulse" /> Iniciando cámara…
            </div>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={cambiarCamara}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Frontal / Trasera
          </Button>
          <Button type="button" variant="outline" disabled={!torchDisponible || !activo}
            onClick={() => void cambiarFlash()}>
            {torch ? <FlashlightOff className="h-4 w-4 mr-1.5" /> : <Flashlight className="h-4 w-4 mr-1.5" />}
            {torch ? "Apagar flash" : "Flash"}
          </Button>
        </div>
        {dispositivos.length > 1 && (
          <label className="text-xs text-muted-foreground">
            Cámara disponible
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
              <option value="">Automática ({facing === "environment" ? "trasera" : "frontal"})</option>
              {dispositivos.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
        )}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          <CameraOff className="h-4 w-4 mr-1.5" /> Cerrar cámara / Usar código manual
        </Button>
      </DialogContent>
    </Dialog>
  );
}
