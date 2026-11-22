import { esCodigoBarrasValido } from "./codigosBarras";

const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1010000","1000100","1001000","1110100"];
const PARIDAD = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function indicePatron(patron: string, patrones: string[]) {
  return patrones.indexOf(patron);
}

export function interpretarEAN(bits: string): string | null {
  if (bits.startsWith("101") && bits.endsWith("101")) {
    if (bits.length === 95 && bits.slice(45, 50) === "01010") {
      let izquierdos = "", paridad = "", derechos = "";
      for (let i = 0; i < 6; i++) {
        const parte = bits.slice(3 + 7 * i, 10 + 7 * i);
        let d = indicePatron(parte, L);
        if (d >= 0) paridad += "L";
        else {
          d = indicePatron(parte, G);
          if (d < 0) return null;
          paridad += "G";
        }
        izquierdos += d;
        const r = indicePatron(bits.slice(50 + 7 * i, 57 + 7 * i), R);
        if (r < 0) return null;
        derechos += r;
      }
      const primero = PARIDAD.indexOf(paridad);
      if (primero < 0) return null;
      const codigo = String(primero) + izquierdos + derechos;
      return esCodigoBarrasValido(codigo) ? codigo : null;
    }
    if (bits.length === 67 && bits.slice(31, 36) === "01010") {
      let codigo = "";
      for (let i = 0; i < 4; i++) {
        const li = indicePatron(bits.slice(3 + i * 7, 10 + i * 7), L);
        const de = indicePatron(bits.slice(36 + i * 7, 43 + i * 7), R);
        if (li < 0 || de < 0) return null;
        codigo += String(li) + String(de); // Se reajusta al orden EAN-8 debajo
      }
      const ordenado = codigo.slice(0, 8).split("");
      const ean8 = ordenado.filter((_, i) => i % 2 === 0).join("") +
        ordenado.filter((_, i) => i % 2 === 1).join("");
      return esCodigoBarrasValido(ean8) ? ean8 : null;
    }
  }
  return null;
}

/** Lee EAN-13 / EAN-8 directamente del lienzo, sin librerías ni conexión. */
export function detectarEANEnVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const ancho = Math.min(1000, video.videoWidth);
  const alto = Math.max(1, Math.round(video.videoHeight * ancho / video.videoWidth));
  if (canvas.width !== ancho || canvas.height !== alto) {
    canvas.width = ancho;
    canvas.height = alto;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, ancho, alto);
  const pixeles = ctx.getImageData(0, 0, ancho, alto).data;

  for (const factor of [0.32,0.38,0.44,0.5,0.56,0.62,0.68]) {
    const y = Math.min(alto - 1, Math.max(0, Math.round(alto * factor)));
    const grises = new Uint8Array(ancho);
    let minimo = 255, maximo = 0;
    for (let x = 0; x < ancho; x++) {
      const offset = (y * ancho + x) * 4;
      const gris = Math.round(
        pixeles[offset] * .299 + pixeles[offset + 1] * .587 + pixeles[offset + 2] * .114
      );
      grises[x] = gris;
      if (gris < minimo) minimo = gris;
      if (gris > maximo) maximo = gris;
    }
    if (maximo - minimo < 55) continue;
    const umbral = (minimo + maximo) / 2;
    const linea = new Uint8Array(ancho);
    for (let x = 1; x < ancho - 1; x++) {
      linea[x] = (Number(grises[x - 1] < umbral) +
        Number(grises[x] < umbral) + Number(grises[x + 1] < umbral)) >= 2 ? 1 : 0;
    }

    const pruebas = [linea, linea.slice().reverse()];
    for (const datos of pruebas) {
      const runs: { inicio: number; longitud: number; negro: number }[] = [];
      let inicio = 0;
      for (let x = 1; x <= ancho; x++) {
        if (x === ancho || datos[x] !== datos[inicio]) {
          runs.push({ inicio, longitud: x - inicio, negro: datos[inicio] });
          inicio = x;
        }
      }
      for (let r = 1; r < runs.length - 4; r++) {
        const primero = runs[r], segundo = runs[r + 1], tercero = runs[r + 2];
        if (primero.negro !== 1 || segundo.negro !== 0 || tercero.negro !== 1) continue;
        const unidad = (primero.longitud + segundo.longitud + tercero.longitud) / 3;
        if (unidad < 1.4 || unidad > 14) continue;
        if (Math.abs(primero.longitud - unidad) > unidad * .4 ||
            Math.abs(segundo.longitud - unidad) > unidad * .4 ||
            Math.abs(tercero.longitud - unidad) > unidad * .4) continue;
        // Antes del guardia debe quedar una zona clara (quiet zone).
        const anterior = runs[r - 1];
        if (anterior.negro !== 0 || anterior.longitud < unidad * 3) continue;
        for (const escala of [.97, 1, 1.03]) {
          const anchoModulo = unidad * escala;
          for (const longitud of [95, 67]) {
            const final = primero.inicio + longitud * anchoModulo;
            if (final >= ancho) continue;
            let bits = "";
            for (let bit = 0; bit < longitud; bit++) {
              const x = Math.floor(primero.inicio + (bit + .5) * anchoModulo);
              bits += datos[x] ? "1" : "0";
            }
            const codigo = interpretarEAN(bits);
            if (codigo) return codigo;
          }
        }
      }
    }
  }
  return null;
}
