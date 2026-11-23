/**
 * Beep breve de confirmación para el lector de códigos.
 *
 * iOS Safari exige desbloquear Web Audio durante un gesto del usuario
 * (tocar el botón de abrir escáner, por ejemplo); no puede desbloquearse
 * por primera vez en el callback automático de la cámara.
 *
 * Se genera localmente, sin ficheros de audio ni conexión a Internet.
 */
let contexto: AudioContext | null = null;

export function prepararSonidoEscaner(): void {
  if (typeof window === "undefined") return;
  try {
    const webkitWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtor = webkitWindow.AudioContext ?? webkitWindow.webkitAudioContext;
    if (!AudioCtor) return;

    if (!contexto || contexto.state === "closed") {
      contexto = new AudioCtor();
    }
    if (contexto.state === "suspended") {
      void contexto.resume().catch(() => {
        // Safari puede rechazar resume() fuera de una interacción directa.
      });
    }
  } catch (error) {
    console.warn("Audio no disponible para escáner:", error);
  }
}

/**
 * Reproduce una señal de unos 135 ms.
 * Devuelve false si el navegador mantiene el audio suspendido.
 */
export function reproducirBeepEscaner(): boolean {
  if (typeof window === "undefined") return false;
  const audio = contexto;
  if (!audio || audio.state !== "running") return false;

  try {
    const t = audio.currentTime + 0.004;
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();

    oscilador.type = "sine";
    oscilador.frequency.setValueAtTime(1050, t);
    oscilador.frequency.setValueAtTime(1320, t + 0.065);

    volumen.gain.setValueAtTime(0.0001, t);
    volumen.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    volumen.gain.setValueAtTime(0.16, t + 0.045);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + 0.135);

    oscilador.connect(volumen);
    volumen.connect(audio.destination);
    oscilador.onended = () => {
      oscilador.disconnect();
      volumen.disconnect();
    };
    oscilador.start(t);
    oscilador.stop(t + 0.14);
    return true;
  } catch (error) {
    console.warn("No se pudo reproducir el beep:", error);
    return false;
  }
}
