import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useControlTurnos } from "@/hooks/useControlTurnos";
import { useCuadreStore, puntoHabitual } from "@/store/cuadreStore";
import { usePinStore } from "@/store/pinStore";
import { asignarDesdeCuadre } from "@/lib/turnosOperativos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
export default function AsignarTrasCierre({cuadreId,onClose}:{cuadreId:string;onClose:()=>void}) {
  const {role,user}=useAuth();
  const {history,settings}=useCuadreStore();
  const usuarios=usePinStore(s=>s.users);
  const {verificado,verificar,recargar}=useControlTurnos(user?.id);
  const [id,setId]=useState("");
  const [pin,setPin]=useState("");
  const [ocupado,setOcupado]=useState(false);
  const cuadre=history.find(c=>c.id===cuadreId && c.finalizado);
  if(role!=="admin" || !cuadre) return null;
  const opciones=usuarios.filter(u=>u.role==="dependiente" && !settings.dependientesInactivos?.includes(u.nombre) &&
    (settings.dependientesAmbosPuntos?.includes(u.nombre) || puntoHabitual(u.nombre,settings,history)===cuadre.puntoVenta))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
  const confirmar=async()=>{
    if(!user?.id || !id || !opciones.some(u=>u.id===id)) return;
    setOcupado(true);
    try{
      if(!verificado) {if(!/^\d{6}$/.test(pin)) throw Error("Confirma tu PIN de 6 dígitos."); await verificar(pin);}
      await asignarDesdeCuadre(user.id,cuadre.id,id);
      toast.success("Turno entrante asignado."); onClose(); void recargar();
    }catch(e){toast.error(e instanceof Error?e.message:"No se pudo asignar el turno.");}
    finally{setOcupado(false);setPin("");}
  };
  return <Dialog open onOpenChange={v=>{if(!v&&!ocupado)onClose();}}>
    <DialogContent className="rounded-2xl">
      <DialogHeader><DialogTitle>Cuadre finalizado · ¿Asignar el próximo turno?</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{cuadre.puntoVenta} · {cuadre.dependiente}. Las existencias finales del cuadre guardado se usarán como inventario de apertura.</p>
      <Select value={id} onValueChange={setId}><SelectTrigger><SelectValue placeholder="Selecciona dependiente entrante"/></SelectTrigger>
        <SelectContent>{opciones.map(u=><SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}</SelectContent></Select>
      {!opciones.length&&<p className="text-xs text-muted-foreground">No hay dependientes activos con PIN y punto autorizado.</p>}
      {!verificado&&<Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} placeholder="PIN de administrador"/>}
      <p className="text-xs text-muted-foreground">Si ya hay un relevo posterior, no se reemplazará. Si el cuadre está pendiente de sincronizar, podrás asignar después.</p>
      <DialogFooter><Button variant="outline" disabled={ocupado} onClick={onClose}>Asignar más adelante</Button>
        <Button disabled={!id||ocupado||(!verificado&&pin.length!==6)} onClick={()=>void confirmar()}>{ocupado?"Asignando…":"Asignar turno"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
