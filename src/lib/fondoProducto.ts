const SIZE=320;
function canvas(w:number,h:number){const c=document.createElement("canvas");c.width=w;c.height=h;return c;}
function contexto(c:HTMLCanvasElement){const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("Canvas no disponible");return ctx;}
async function cargar(file:Blob):Promise<HTMLImageElement>{
  if(file.size>8*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Elige una foto JPG, PNG o WebP de hasta 8 MB.");
  const url=URL.createObjectURL(file);
  try{return await new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(new Error("Imagen inválida"));img.src=url;});}finally{URL.revokeObjectURL(url);}
}
export function limitesMascara(mask:Float32Array,w:number,h:number){
  let min=Infinity,max=-Infinity;
  for(const n of mask){if(!Number.isFinite(n))throw new Error("Máscara inválida");min=Math.min(min,n);max=Math.max(max,n);}
  if(max-min<0.05)throw new Error("No se distinguió el producto del fondo.");
  const alfa=new Uint8ClampedArray(w*h);
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let i=0;i<mask.length;i++){const v=(mask[i]-min)/(max-min);alfa[i]=Math.round(255*Math.max(0,Math.min(1,(v-0.08)/0.84)));if(v>0.35){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
  if(x1<x0 || y1<y0 || (x1-x0+1)*(y1-y0+1)<w*h*0.002)throw new Error("No se distinguió el producto del fondo.");
  return {alfa,x0,y0,x1,y1};
}
function inferir(input:Float32Array, progreso:(s:string)=>void):Promise<Float32Array>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./fondoProducto.worker.ts",import.meta.url),{type:"module"});
    const cerrar=()=>{clearTimeout(timer);worker.terminate();};
    const timer=setTimeout(()=>{cerrar();reject(new Error("La IA tardó demasiado. Conserva la original o vuelve a intentarlo con Wi-Fi."));},120000);
    worker.onerror=()=>{cerrar();reject(new Error("La IA no está disponible en este navegador o conexión."));};
    worker.onmessage=({data})=>{if(data.estado)progreso(data.estado);else if(data.mask){cerrar();resolve(data.mask);}else if(data.error){cerrar();reject(new Error("No se pudo quitar el fondo. "+data.error));}};
    worker.postMessage(input,[input.buffer]);
  });
}
/** Segmenta sin redibujar; encuadra el sujeto y entrega PNG para previsualizar. */
export async function quitarFondoProducto(file:Blob,progreso:(s:string)=>void):Promise<File>{
  const img=await cargar(file), original=canvas(SIZE,SIZE), ctx=contexto(original);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,SIZE,SIZE);ctx.drawImage(img,0,0,SIZE,SIZE);
  const pixels=ctx.getImageData(0,0,SIZE,SIZE).data, n=SIZE*SIZE, input=new Float32Array(n*3);
  let max=1;for(let i=0;i<pixels.length;i+=4)max=Math.max(max,pixels[i],pixels[i+1],pixels[i+2]);
  const means=[.485,.456,.406], std=[.229,.224,.225];
  for(let i=0;i<n;i++)for(let k=0;k<3;k++)input[k*n+i]=(pixels[4*i+k]/max-means[k])/std[k];
  const mask=await inferir(input,progreso), bounds=limitesMascara(mask,SIZE,SIZE);
  const m=canvas(SIZE,SIZE),mc=contexto(m), im=mc.createImageData(SIZE,SIZE);
  for(let i=0;i<n;i++){im.data[4*i]=255;im.data[4*i+1]=255;im.data[4*i+2]=255;im.data[4*i+3]=bounds.alfa[i];}mc.putImageData(im,0,0);
  const scale=Math.min(1,640/Math.max(img.naturalWidth,img.naturalHeight)), w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const sujeto=canvas(w,h),sc=contexto(sujeto);sc.drawImage(img,0,0,w,h);sc.globalCompositeOperation="destination-in";sc.drawImage(m,0,0,w,h);
  const x=Math.max(0,Math.floor((bounds.x0-3)*w/SIZE)),y=Math.max(0,Math.floor((bounds.y0-3)*h/SIZE)),right=Math.min(w,Math.ceil((bounds.x1+4)*w/SIZE)),bottom=Math.min(h,Math.ceil((bounds.y1+4)*h/SIZE));
  const cw=Math.max(1,right-x),ch=Math.max(1,bottom-y),out=canvas(320,320),oc=contexto(out),s=288/Math.max(cw,ch),dw=cw*s,dh=ch*s;
  oc.drawImage(sujeto,x,y,cw,ch,(320-dw)/2,(320-dh)/2,dw,dh);
  const blob=await new Promise<Blob>((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error("No se pudo generar el recorte")),"image/png"));
  return new File([blob],"producto-sin-fondo.png",{type:"image/png"});
}
