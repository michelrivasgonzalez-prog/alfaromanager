import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { newCuadre, useCuadreStore, type CatalogoItem } from "@/store/cuadreStore";
import Productos from "./Productos";

vi.mock("@/lib/sync",()=>({pushCatalogItem:vi.fn(),deleteCatalogItem:vi.fn()}));
vi.mock("@/lib/fotoCatalogo",()=>({subirFotoProducto:vi.fn(),borrarFotoProducto:vi.fn(),importarFotoCandidata:vi.fn(),copiarFuenteFoto:vi.fn(),fuenteFoto:()=>undefined}));
vi.mock("@/components/KardexDialog",()=>({KardexDialog:()=>null}));
vi.mock("@/components/BarcodeScanner",()=>({default:()=>null}));

describe("Catálogo con asistente inteligente",()=>{
  beforeEach(()=>{
    const catalogo:CatalogoItem[]=[
      {id:"a",nombre:"Galletas de prueba",precio:100,costo:60,punto:"Cafetería",categoria:"Confituras"},
      {id:"b",nombre:"Caramelos de prueba",precio:100,costo:60,punto:"Cafetería",categoria:"Confituras",codigoBarras:"8692806056033"},
    ];
    const cuadre=newCuadre("Cafetería",catalogo);
    useCuadreStore.setState({role:"admin",catalogo,history:[{...cuadre,finalizado:true,productos:cuadre.productos.map(p=>({...p,final:2}))}]});
  });
  it("abre con productos disponibles sin confundir el código pendiente del escáner con el filtro",()=>{
    render(<Productos/>);
    const acceso=screen.getByRole("button",{name:/Asistente inteligente del catálogo/});
    expect(acceso.textContent).toContain("2 sin foto");
    expect(acceso.textContent).toContain("1 sin código");
    fireEvent.click(acceso);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button",{name:/Sin código \(1\)/})).toBeTruthy();
  });
});
