import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import type { Candidato } from "@/lib/asistenteCatalogo";
const fuentesFoto = new WeakMap<File,string>();
export function fuenteFoto(url?:string){try{const raw=new URLSearchParams(new URL(url||"").hash.slice(1)).get("fuente");if(!raw)return undefined;const u=new URL(raw);return u.protocol==="https:"&&["world.openfoodfacts.org","world.openbeautyfacts.org"].includes(u.hostname)?u.href:undefined;}catch{return undefined;}}
export function copiarFuenteFoto(origen:File,destino:File){const fuente=fuentesFoto.get(origen);if(fuente)fuentesFoto.set(destino,fuente);}
export async function importarFotoCandidata(c:Candidato):Promise<File>{
  if(!c.foto)throw new Error("No hay fotografía disponible.");
  const u=new URL(c.foto), base=new URL(import.meta.env.VITE_SUPABASE_URL);
  const local=u.origin===base.origin&&u.pathname.startsWith("/storage/v1/object/public/catalogo-fotos/");
  const externo=u.protocol==="https:"&&["images.openfoodfacts.org","images.openbeautyfacts.org","static.openfoodfacts.org","static.openbeautyfacts.org"].includes(u.hostname);
  if(!local&&!externo)throw new Error("Fotografía externa no autorizada. Descárgala con permiso y súbela manualmente.");
  if(externo&&!window.confirm("¿Usar esta foto de Open Facts? Se conservará el crédito y licencia CC BY-SA en la ficha."))throw new Error("Importación cancelada.");
  const res=await fetch(u.href,{credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error("No se pudo descargar la fotografía.");
  const blob=await res.blob();if(blob.size>8*1024*1024||!["image/jpeg","image/png","image/webp"].includes(blob.type))throw new Error("Formato o tamaño de foto no compatible.");
  const file=new File([blob],"foto-producto",{type:blob.type});
  const fuente=local?fuenteFoto(c.foto):c.enlace;if(fuente)fuentesFoto.set(file,fuente);return file;
}

const BUCKET = "catalogo-fotos";
const MAX_ORIGEN = 8 * 1024 * 1024;
const MAX_SUBIDA = 150_000;

function cargarImagen(blob: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la fotografía."));
    };
    image.src = url;
  });
}

function convertirJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen.")),
      "image/jpeg", quality
    );
  });
}

/** Miniatura de JPEG reducida, sin subir la imagen original ni sus metadatos EXIF. */
export async function comprimirFotoProducto(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_ORIGEN) {
    throw new Error("Elige una imagen JPG, PNG o WEBP de hasta 8 MB.");
  }
  const image = await cargarImagen(file);
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no permite preparar la fotografía.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.76, 0.64, 0.52, 0.40]) {
    const compressed = await convertirJpeg(canvas, quality);
    if (compressed.size <= MAX_SUBIDA) return compressed;
  }
  throw new Error("La fotografía no pudo reducirse a 150 KB.");
}

export async function subirFotoProducto(productoId: string, file: File): Promise<string> {
  await ensureCloudSession();
  const jpeg = await comprimirFotoProducto(file);
  const path = productoId + "/" + crypto.randomUUID() + ".jpg";
  const { error } = await supabase.storage.from(BUCKET).upload(path, jpeg, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error("No se pudo subir la fotografía: " + error.message);
  const url=supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const fuente=fuentesFoto.get(file);
  return fuente?url+"#"+new URLSearchParams({fuente}).toString():url;
}

/** Solo borra imágenes creadas dentro de nuestro bucket, nunca URLs externas. */
export async function borrarFotoProducto(url?: string): Promise<void> {
  if (!url) return;
  const folder = "/storage/v1/object/public/" + BUCKET + "/";
  try {
    const parsed = new URL(url);
    const base = new URL(import.meta.env.VITE_SUPABASE_URL);
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith(folder)) return;
    const path = decodeURIComponent(parsed.pathname.slice(folder.length));
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path)) return;
    await ensureCloudSession();
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) console.warn("No se pudo retirar la miniatura anterior:", error.message);
  } catch (e) {
    console.warn("No se pudo retirar la miniatura anterior:", e);
  }
}
