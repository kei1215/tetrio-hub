/* vA 外部AI: MisaMino (misakamm。TETR.IO 向けの MisaMinoNET / Zetris 版。ライセンス表記 "Copyleft by Misakamm")。
   vA-external-ai-misamino.js と misamino.wasm を一緒に読み込む。
   ルールは今の TETR.IO (SRS+・オールスピン)。1手ごとに時間を区切って最後まで読む方式なので、
   考えている間は画面が少し止まることがあります。
   「外部AIの強さ」= 1手に使う時間(ミリ秒、既定 60)。ソース: misamino-source.zip */
(() => {
var MisaMinoModule=(()=>{var _scriptName=globalThis.document?.currentScript?.src;return async function(moduleArg={}){var Module=moduleArg;var scriptDirectory="";function locateFile(path){return scriptDirectory+path}var readAsync;if(true){try{scriptDirectory=new URL(".",_scriptName).href}catch{}readAsync=async url=>{var response=await fetch(url,{credentials:"same-origin"});if(response.ok)return response.arrayBuffer();throw new Error(response.status+" : "+response.url)}}console.log.bind(console);var err=console.error.bind(console);var wasmBinary;var ABORT=false;function getMemoryBuffer(){return wasmMemory.buffer}function updateMemoryViews(){if(HEAP8?.buffer?.resizable)return;var b=getMemoryBuffer();HEAP8=new Int8Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU32=new Uint32Array(b)}function preRun(){}function initRuntime(){0;wasmExports["g"]()}function postRun(){}function abort(what){what=`Aborted(${what})`;err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";throw new WebAssembly.RuntimeError(what)}var wasmBinaryFile;function findWasmBinary(){return locateFile("misamino.wasm")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary)return new Uint8Array(wasmBinary);if(void 0)return(void 0)(file);throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary)try{return await readAsync(binaryFile)}catch{}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary)try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){var imports={a:wasmImports};return imports}var HEAP8;var HEAPU32;class ExceptionInfo{constructor(excPtr){this.excPtr=excPtr;this.ptr=excPtr-24}set_type(type){HEAPU32[this.ptr+4>>2]=type}get_type(){return HEAPU32[this.ptr+4>>2]}set_destructor(destructor){HEAPU32[this.ptr+8>>2]=destructor}get_destructor(){return HEAPU32[this.ptr+8>>2]}set_caught(caught){caught=caught?1:0;HEAP8[this.ptr+12]=caught}get_caught(){return HEAP8[this.ptr+12]!=0}set_rethrown(rethrown){rethrown=rethrown?1:0;HEAP8[this.ptr+13]=rethrown}get_rethrown(){return HEAP8[this.ptr+13]!=0}init(type,destructor){this.set_adjusted_ptr(0);this.set_type(type);this.set_destructor(destructor)}set_adjusted_ptr(adjustedPtr){HEAPU32[this.ptr+16>>2]=adjustedPtr}get_adjusted_ptr(){return HEAPU32[this.ptr+16>>2]}}var uncaughtExceptionCount=0;var __Unwind_RaiseException=()=>{abort()};var HEAPU8;var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var getHeapMax=()=>2147483648;var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){}};var initRandomFill=()=>view=>(crypto.getRandomValues(view),0);var randomFill=view=>(randomFill=initRandomFill())(view);if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];var wasmMemory;function assignWasmExports(wasmExports){Module["_mm_buf"]=wasmExports["h"];Module["_mm_think"]=wasmExports["i"];wasmMemory=wasmExports["f"];wasmExports["__indirect_function_table"]}var wasmImports={b:(ptr,type,destructor)=>{var info=new ExceptionInfo(ptr);info.init(type,destructor);uncaughtExceptionCount++;__Unwind_RaiseException()},d:()=>abort(""),a:()=>performance.now(),e:requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize)return false;for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement)return true}return false},c:(buffer,size)=>randomFill(HEAPU8.subarray(buffer,buffer+size))};var wasmExports;wasmExports=await async function(){function receiveInstance(instance){wasmExports=instance.exports;assignWasmExports(wasmExports);updateMemoryViews();return wasmExports}var info=getWasmImports();wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=function(result){return receiveInstance(result["instance"])}(result);return exports}();await async function(){preRun();if(ABORT)return;initRuntime();postRun()}();
;return Module}})();if(typeof exports==="object"&&typeof module==="object"){module.exports=MisaMinoModule;module.exports.default=MisaMinoModule}else if(typeof define==="function"&&define["amd"])define([],()=>MisaMinoModule);

  const ORDER = ['i', 'o', 't', 'l', 'j', 's', 'z'];
  LocalExternalAI.register({
    id: 'misamino', label: 'MisaMino',
    async create(files, { strength }) {
      const bin = files['misamino.wasm'];
      if (!bin) throw Error('misamino.wasm も一緒に選んでください');
      const m = await MisaMinoModule({ wasmBinary: new Uint8Array(bin) });
      const budget = strength ? Math.max(5, Math.round(strength)) : 60;
      return {
        begin(input) {
          const p = m._mm_buf(), b = m.HEAPU8.subarray(p, p + 1024); b.fill(0);
          for (let y = 0; y < 40; y++) for (let x = 0; x < 10; x++) if (input.board[y]?.[x]) b[y * 10 + x] = 1;
          const h = ORDER.indexOf(input.hold); b[400] = h < 0 ? 255 : h;
          b[401] = Math.min(255, input.b2b || 0); b[402] = Math.min(255, input.combo || 0);
          b[403] = Math.min(255, (input.incoming || []).reduce((a, n) => a + n, 0));
          const q = [input.current, ...(input.queue || [])].map((x) => ORDER.indexOf(x)).filter((x) => x >= 0).slice(0, 7);
          b[410] = q.length; q.forEach((x, i) => (b[411 + i] = x));
          let done = false, spent = 0, out = null;
          const run = () => {
            if (done) return; done = true;
            const t0 = performance.now(), ok = m._mm_think(budget, 100); spent = performance.now() - t0;
            if (!ok) return;
            const r = m.HEAPU8.subarray(p, p + 12), cells = [];
            for (let i = 0; i < 4; i++) cells.push([r[3 + i * 2], r[4 + i * 2]]);
            out = { piece: ORDER[r[2]], usedHold: !!r[1], cells };
          };
          return { get done() { return done; }, get spent() { return spent; }, step() { run(); return true; }, stop() { run(); }, result() { run(); return out; } };
        },
      };
    },
  });
})();
