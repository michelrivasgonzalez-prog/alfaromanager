import {describe,it,expect} from "vitest";
import {candidatoExterno,candidatosLocales,filtrarPendientes} from "./asistenteCatalogo";
import {limitesMascara} from "./fondoProducto";
import type {CatalogoItem} from "@/store/cuadreStore";
const p={id:"a",nombre:"Galletas",precio:100,costo:60,punto:"Cafetería",codigoBarras:"8692806056033"} as CatalogoItem;
describe("asistente catálogo",()=>{
 it("filtra por disponibilidad y foto",()=>{expect(filtrarPendientes([p],new Map([["a",0]]),true,"foto","")).toEqual([]);expect(filtrarPendientes([p],new Map([["a",2]]),true,"foto","galletas")).toEqual([p]);});
 it("encuentra alias sin duplicar datos financieros",()=>{expect(candidatosLocales([{...p,codigosAdicionales:[{codigo:"8906152260885"}]}],"8906152260885","")[0]?.nombre).toBe("Galletas");});
 it("rechaza una respuesta de otro código",()=>{expect(candidatoExterno({code:"8906152260885",product_name:"otro"},"8692806056033",{nombre:"Open Food Facts",host:"world.openfoodfacts.org"})).toBeNull();});
 it("mantiene nombre, código y fuente de coincidencia",()=>{expect(candidatoExterno({code:"8692806056033",product_name:"Biskiato",image_front_url:"https://evil.example/x"},"8692806056033",{nombre:"Open Food Facts",host:"world.openfoodfacts.org"})).toMatchObject({nombre:"Biskiato",codigo:"8692806056033",foto:undefined});});
 it("rechaza máscaras sin contraste y calcula el encuadre",()=>{expect(()=>limitesMascara(new Float32Array(16),4,4)).toThrow();expect(limitesMascara(new Float32Array([0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0]),4,4)).toMatchObject({x0:1,y0:1,x1:2,y1:2});});
});
