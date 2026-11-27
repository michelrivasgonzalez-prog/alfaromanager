import {useEffect,useRef,useState} from "react";
import {ExternalLink,Image as ImageIcon,Search,ScanBarcode} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {buscarCodigoAbierto,candidatosLocales,enlaceGoogle,type Candidato} from "@/lib/asistenteCatalogo";
import {esCodigoBarrasValido,limpiarCodigoBarras} from "@/lib/codigosBarras";
import {useCuadreStore} from "@/store/cuadreStore";
import {toast} from "sonner";
export type CampoSugerido="nombre"|"categoria"|"codigo"|"todos";
type Props={codigo?:string;nombre?:string;excluir?:string;onElegir?:(c:Candidato,campo:CampoSugerido)=>void;onEscanear?:()=>void;onFoto?:(c:Candidato)=>Promise<void>;seleccionIndividual?:boolean;permitirCodigo?:boolean};
export default function BuscarIdentidadProducto({codigo="",nombre="",excluir,onElegir,onEscanear,onFoto,seleccionIndividual=false,permitirCodigo=false}:Props){
  const catalogo=useCuadreStore(s=>s.catalogo);
  const [texto,setTexto]=useState(codigo||nombre);
  const [resultados,setResultados]=useState<Candidato[]>([]);
  const [estado,setEstado]=useState("");
  const [ocupado,setOcupado]=useState(false);
  const [fotoOcupada,setFotoOcupada]=useState(false);
  const control=useRef<AbortController|null>(null);
  useEffect(()=>{setTexto(codigo||nombre);setResultados([]);setEstado("");setOcupado(false);return ()=>control.current?.abort();},[codigo,nombre,excluir]);
  const buscar=async()=>{
    const q=texto.trim();if(!q)return;
    control.current?.abort();
    const ac=new AbortController();control.current=ac;setResultados([]);setEstado("");setOcupado(true);
    const gtin=limpiarCodigoBarras(q), esCodigo=esCodigoBarrasValido(gtin);
    const locales=candidatosLocales(catalogo,esCodigo?gtin:"",esCodigo?"":q,excluir);
    setResultados(locales);
    if(!esCodigo){setEstado("Búsqueda por nombre: coincidencias locales; usa Google para buscar fuera del catálogo.");setOcupado(false);return;}
    const timer=setTimeout(()=>ac.abort(),15000);
    try {
      const resp=await buscarCodigoAbierto(gtin,ac.signal);
      if(control.current!==ac)return;
      setResultados([...locales,...resp.resultados]);
      setEstado(resp.fallos?"Una o más fuentes no respondieron. Puedes usar Google o reintentar.":locales.length+resp.resultados.length?"Compara el envase antes de elegir.":"No se encontró el código en las bases abiertas.");
    }catch{if(control.current===ac)setEstado("No se pudo consultar internet. Puedes identificarlo manualmente.");}
    finally{clearTimeout(timer);if(control.current===ac)setOcupado(false);}
  };
  return <section className="space-y-2 rounded-xl border bg-muted/20 p-3">
    <p className="text-sm font-semibold">Identificar producto</p>
    <div className="flex gap-2"><Input className="min-w-0 text-base" value={texto} placeholder="Código o nombre" onChange={e=>{control.current?.abort();control.current=null;setOcupado(false);setTexto(e.target.value);setResultados([]);setEstado("");}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void buscar();}}}/>{onEscanear&&<Button type="button" variant="outline" size="icon" onClick={onEscanear} aria-label="Escanear código"><ScanBarcode className="h-4 w-4"/></Button>}<Button type="button" size="icon" onClick={()=>void buscar()} disabled={ocupado||!texto.trim()} aria-label="Consultar producto"><Search className="h-4 w-4"/></Button></div>
    <div className="flex flex-wrap gap-2"><a className="inline-flex items-center gap-1 text-xs text-primary underline" href={enlaceGoogle(texto)} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3"/>Google</a><a className="inline-flex items-center gap-1 text-xs text-primary underline" href={enlaceGoogle(texto,true)} target="_blank" rel="noreferrer"><ImageIcon className="h-3 w-3"/>Imágenes</a></div>
    {ocupado&&<p role="status" className="text-xs text-muted-foreground">Consultando bases abiertas…</p>}{estado&&<p className="text-xs text-muted-foreground">{estado}</p>}
    {resultados.map((c,i)=><div key={c.fuente+c.codigo+i} className="space-y-2 rounded-lg border bg-card p-2">
      <div className="flex gap-3">{c.foto&&<img src={c.foto} alt="Referencia del producto" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg object-contain"/>}<div className="min-w-0"><p className="break-words text-sm font-semibold">{c.nombre}</p><p className="text-xs text-muted-foreground">{[c.marca,c.cantidad,c.codigo].filter(Boolean).join(" · ")}</p><p className="text-xs text-muted-foreground">{c.fuente} · {esCodigoBarrasValido(limpiarCodigoBarras(texto))?"Código coincidente":"Referencia por nombre"}</p>{c.enlace&&<a href={c.enlace} target="_blank" rel="noreferrer" className="text-xs underline text-primary">Fuente original · ODbL / fotos CC BY-SA</a>}</div></div>
      <div className="flex flex-wrap gap-2">{onElegir&&(seleccionIndividual?<><Button type="button" size="sm" variant="outline" onClick={()=>onElegir(c,"nombre")}>Usar nombre</Button>{c.categoria&&<Button type="button" size="sm" variant="outline" onClick={()=>onElegir(c,"categoria")}>Usar categoría: {c.categoria}</Button>}{permitirCodigo&&c.codigo&&<Button type="button" size="sm" variant="outline" onClick={()=>onElegir(c,"codigo")}>Usar código</Button>}</>:<Button type="button" size="sm" variant="outline" onClick={()=>onElegir(c,"todos")}>Usar datos sugeridos</Button>)}{onFoto&&c.foto&&<Button type="button" size="sm" variant="outline" disabled={fotoOcupada} onClick={async()=>{setFotoOcupada(true);try{await onFoto(c);}catch(e){toast.error(e instanceof Error?e.message:"No se pudo importar la foto");}finally{setFotoOcupada(false);}}}>Seleccionar foto</Button>}</div>
    </div>)}
  </section>;
}
