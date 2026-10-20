import { loadEngine } from "./engine/load.js";

const engine = loadEngine(fetch(new URL("./engine/engine.wasm", import.meta.url)));

self.onmessage = async ({ data: { id, request } }) => {
  const run = await engine;
  const t0 = performance.now();
  const reply = await run(request);
  self.postMessage({ id, reply, ms: performance.now() - t0 });
};
