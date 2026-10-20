import { ConsoleStdout, File, OpenFile, WASI } from "../vendor/browser_wasi_shim/index.js";
import jsffi from "./ghc_wasm_jsffi.js";

export async function loadEngine(wasm) {
  const wasi = new WASI([], [], [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((line) => console.log(line)),
    ConsoleStdout.lineBuffered((line) => console.warn(line)),
  ]);
  const exports = {};
  const imports = { wasi_snapshot_preview1: wasi.wasiImport, ghc_wasm_jsffi: jsffi(exports) };
  const { instance } = wasm instanceof Response || wasm instanceof Promise
    ? await WebAssembly.instantiateStreaming(wasm, imports)
    : await WebAssembly.instantiate(wasm, imports);
  Object.assign(exports, instance.exports);
  wasi.initialize(instance);
  return async (request) => JSON.parse(await instance.exports.run(JSON.stringify(request)));
}
