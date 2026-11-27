import {useState} from "react";
import {Sparkles,Package,Pencil} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {codigosDeProducto} from "@/lib/codigosBarras";
import {filtrarPendientes,fotoPendiente,codigoPendiente} from "@/lib/asistenteCatalogo";
import type {CatalogoItem} from "@/store/cuadreStore";
type Props={open:boolean;onClose:()=>void;items:CatalogoItem[];existencias:Map<string,number>;punto:string;onEditar:(id:string)=>void;onNuevo:()=>void;onEscanear:()=>void};
export default function AsistenteCatalogoDialog({open,onClose,items,existencias,punto,onEditar,onNuevo,onEscanear}:Props){
  const [solo,setSolo]=useState(true),[filtro,setFiltro]=useState("foto"),[q,setQ]=useState("");
  const base=filtrarPendientes(items,existencias,solo,"todos","");
  const completos=base.filter(p=>!fotoPendiente(p)&&!codigoPendiente(p)).length;
  const lista=filtrarPendientes(items,existencias,solo,filtro,q);
  return <Dialog open={open} onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl p-4"><DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/>Asistente inteligente</DialogTitle><p className="text-xs text-muted-foreground">{punto} · Existencia del último cuadre oficial</p></DialogHeader>
    <div className="rounded-xl border bg-card p-3"><div className="flex items-end justify-between"><p className="text-2xl font-bold">{base.length?Math.round(100*completos/base.length):0}%</p><p className="text-xs text-muted-foreground">{completos} de {base.length} fichas completas</p></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:(base.length?100*completos/base.length:0)+"%"}}/></div></div>
    <div className="grid grid-cols-3 gap-1">{[["foto","Sin foto",base.filter(fotoPendiente).length],["codigo","Sin código",base.filter(codigoPendiente).length],["todos","Todos",base.length]].map(([v,l,n])=><Button key={v} type="button" size="sm" variant={filtro===v?"default":"outline"} onClick={()=>setFiltro(String(v))} className="h-auto min-h-10 whitespace-normal text-xs">{l} ({n})</Button>)}</div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={solo} onChange={e=>setSolo(e.target.checked)}/>Solo productos disponibles</label>
    <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre o código" className="text-base"/>
    <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={onEscanear}>Escanear código</Button><Button type="button" variant="outline" onClick={onNuevo}>Nuevo producto</Button></div>
    <div className="space-y-2">{lista.map(p=><button type="button" key={p.id} onClick={()=>onEditar(p.id)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">{p.fotoUrl?<img src={p.fotoUrl} alt="" className="h-full w-full object-contain"/>:<Package className="h-6 w-6 text-muted-foreground"/>}</div><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{p.nombre}</p><p className="text-xs text-muted-foreground">{existencias.get(p.id)??0} disponibles · {codigosDeProducto(p)[0]||"Sin código"}</p><p className="text-xs text-muted-foreground">{[fotoPendiente(p)?"Falta fotografía":"",codigoPendiente(p)?"Falta código":""].filter(Boolean).join(" · ")||"Completo"}</p></div><Pencil className="h-4 w-4 shrink-0"/></button>)}{!lista.length&&<p className="py-6 text-center text-sm text-muted-foreground">No hay productos para este filtro.</p>}</div>
  </DialogContent></Dialog>;
}
