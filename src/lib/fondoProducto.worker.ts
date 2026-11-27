// U²-Net-p (Xuebin Qin et al., Apache-2.0); pesos ONNX de rembg.
// El runtime se carga bajo demanda en un worker, sin acceso al DOM ni al estado del catálogo.
const CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const MODELO = "https://huggingface.co/edgetools/u2netp/resolve/25dee37ab19c5b6ad64ba6578eba63f1ae07720c/u2netp.onnx";
self.onmessage = async (event: MessageEvent<Float32Array>) => {
  let session: any;
  try {
    self.postMessage({estado:"Cargando modelo de IA…"});
    const url=CDN+"ort.wasm.min.mjs";
    const ort=await import(/* @vite-ignore */ url);
    ort.env.wasm.numThreads=1;
    ort.env.wasm.wasmPaths=CDN;
    session=await ort.InferenceSession.create(MODELO,{executionProviders:["wasm"]});
    self.postMessage({estado:"Separando el producto del fondo…"});
    const tensor=new ort.Tensor("float32",event.data,[1,3,320,320]);
    const out=await session.run({[session.inputNames[0]]:tensor});
    const mask=new Float32Array(out[session.outputNames[0]].data);
    if(mask.length!==320*320)throw new Error("Máscara inesperada");
    self.postMessage({mask});
  } catch(e) { self.postMessage({error:e instanceof Error?e.message:"No se pudo ejecutar la IA"}); }
  finally { try {await session?.release();} catch {} }
};
