import { claveGTIN, codigosDeProducto, esCodigoBarrasValido, limpiarCodigoBarras, normalizarNombreProducto } from "@/lib/codigosBarras";
import type { CatalogoItem } from "@/store/cuadreStore";

export type Candidato = { nombre: string; marca?: string; cantidad?: string; codigo: string; fuente: string; enlace?: string; foto?: string; categoria?: string; interno?: boolean };
const fuentes = [
  { nombre: "Open Food Facts", host: "world.openfoodfacts.org" },
  { nombre: "Open Beauty Facts", host: "world.openbeautyfacts.org" },
];
export const fotoPendiente = (p: CatalogoItem) => !p.fotoUrl;
export const codigoPendiente = (p: CatalogoItem) => !codigosDeProducto(p).length;
export function filtrarPendientes(items: CatalogoItem[], existencias: Map<string,number>, soloDisponibles: boolean, filtro: string, busqueda: string) {
  const q = normalizarNombreProducto(busqueda);
  return items.filter(p => (!soloDisponibles || (existencias.get(p.id) ?? 0)>0) &&
    (filtro === "todos" || (filtro === "foto" && fotoPendiente(p)) || (filtro === "codigo" && codigoPendiente(p))) &&
    (!q || normalizarNombreProducto(p.nombre).includes(q) || codigosDeProducto(p).some(c=>c.includes(busqueda.trim()))));
}
export function candidatosLocales(catalogo: CatalogoItem[], codigo: string, nombre: string, excluir?: string): Candidato[] {
  const q = normalizarNombreProducto(nombre);
  return catalogo.filter(p=>p.id!==excluir && (codigo ? codigosDeProducto(p).some(c=>claveGTIN(c)===claveGTIN(codigo)) : q.length>0 && normalizarNombreProducto(p.nombre).includes(q))).slice(0,12).map(p=>({nombre:p.nombre,codigo:codigo || codigosDeProducto(p)[0] || "",fuente:"AlFaroCafé · "+(p.punto ?? "Cafetería"),foto:p.fotoUrl,categoria:p.categoria,interno:true}));
}
export function categoriaPorEtiquetas(etiquetas: unknown, belleza: boolean): string | undefined {
  const texto=Array.isArray(etiquetas)?etiquetas.join(" ").toLowerCase():"";
  if(belleza){
    if(/perfume|fragrance|eau-de-toilette|eau-de-parfum/.test(texto))return "Perfumería";
    if(/shampoo|soap|deodorant|body-wash|toothpaste|cosmetics|skin-care/.test(texto))return "Limpieza y aseo";
    return undefined;
  }
  if(/\b(beers?|lager|ales)\b/.test(texto))return "Cervezas";
  if(/\b(rums?|ron)\b/.test(texto))return "Rones";
  if(/candies|confectionery|sweets|biscuits|cookies|chocolates|crisps|chips|cakes|chewing-gum|snacks/.test(texto))return "Confituras";
  if(/soft-drinks|energy-drinks|juices|waters|non-alcoholic-beverages|nectars/.test(texto))return "Bebidas";
  if(/rice|vegetable-oils|sugars|coffees|pasta|flours|cereals/.test(texto))return "Alimentos/Cocina";
  return undefined;
}
export function candidatoExterno(raw: any, codigo: string, fuente: typeof fuentes[number]): Candidato | null {
  if (!raw || typeof raw.code !== "string" || !esCodigoBarrasValido(raw.code) || claveGTIN(raw.code)!==claveGTIN(codigo)) return null;
  const nombre=String(raw.product_name_es || raw.product_name || raw.generic_name || "").trim().slice(0,160);
  if(!nombre) return null;
  let foto: string | undefined;
  try { const u=new URL(raw.image_front_small_url || raw.image_front_url || ""); if(u.protocol==="https:" && ["images.openfoodfacts.org","images.openbeautyfacts.org","static.openfoodfacts.org","static.openbeautyfacts.org"].includes(u.hostname)) foto=u.href; } catch {}
  return {nombre,marca:String(raw.brands || "").slice(0,100),cantidad:String(raw.quantity || "").slice(0,50),codigo,fuente:fuente.nombre,enlace:"https://"+fuente.host+"/product/"+raw.code,foto,categoria:categoriaPorEtiquetas(raw.categories_tags,fuente.host.includes("beauty"))};
}
export async function buscarCodigoAbierto(raw: string, signal: AbortSignal): Promise<{resultados:Candidato[]; fallos:number}> {
  const codigo=limpiarCodigoBarras(raw);
  if(!esCodigoBarrasValido(codigo)) throw new Error("Introduce un EAN / UPC / GTIN válido.");
  const respuestas=await Promise.allSettled(fuentes.map(async f=>{
    const resp=await fetch("https://"+f.host+"/api/v2/product/"+codigo+".json?fields=code,product_name,product_name_es,generic_name,brands,quantity,image_front_small_url,image_front_url,categories_tags",{signal,credentials:"omit"});
    if(resp.status===404)return null;
    if(!resp.ok)throw new Error("Fuente no disponible");
    const json=await resp.json();
    return json.status===1?candidatoExterno(json.product,codigo,f):null;
  }));
  return {resultados:respuestas.flatMap(x=>x.status==="fulfilled"&&x.value?[x.value]:[]),fallos:respuestas.filter(x=>x.status==="rejected").length};
}
export function enlaceGoogle(texto:string, imagenes=false) {
  return "https://www.google.com/search?"+(imagenes?"tbm=isch&":"")+"q="+encodeURIComponent(texto);
}
