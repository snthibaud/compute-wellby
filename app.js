const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const replies = new Map();
let lastId = 0;
worker.onmessage = ({ data }) => {
  replies.get(data.id)(data);
  replies.delete(data.id);
};
const call = (request) => new Promise((resolve) => {
  const id = ++lastId;
  replies.set(id, resolve);
  worker.postMessage({ id, request });
});

const $ = (sel) => document.querySelector(sel);
const SVGNS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined) node.append(c);
  return node;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c) node.append(c);
  return node;
}

function tex(source, display = false) {
  const span = el("span");
  span.innerHTML = katex.renderToString(source, { displayMode: display, throwOnError: true, strict: "ignore" });
  return span;
}

const minus = "−";
const signed = (x, d = 2) => {
  const digits = Math.abs(x).toFixed(d);
  return Number(digits) === 0 ? digits : (x > 0 ? "+" : minus) + digits;
};
const plain = (x, d = 2) => {
  const digits = Math.abs(x).toFixed(d);
  return Number(digits) === 0 || x > 0 ? digits : minus + digits;
};
const pct = (x, d = 0) => (100 * x).toFixed(d) + "%";
const compact = (x) => {
  const a = Math.abs(x);
  if (a !== 0 && (a < 0.01 || a >= 10000)) return x.toExponential(1).replace("-", minus);
  return plain(x, a < 1 ? 3 : a < 10 ? 2 : a < 100 ? 1 : 0);
};

let D;
let state;
let result;

const status = (text, isError = false) => {
  const s = $("#status");
  s.textContent = text;
  s.classList.toggle("err", isError);
};

const errorText = (error) => `Rejected: ${error.field} ${error.problem}.`;

function request(kind, paths = state.settings.paths) {
  return {
    kind,
    settings: { ...state.settings, paths },
    scenarios: state.scenarios,
  };
}

let running = false;
let queued = false;
let debounce;
function schedule() {
  clearTimeout(debounce);
  debounce = setTimeout(simulate, 300);
}

async function simulate() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  status(`Running ${state.settings.paths} paths...`);
  const { reply, ms } = await call(request("simulate"));
  running = false;
  if (queued) {
    queued = false;
    simulate();
    return;
  }
  if (reply.error) {
    status(errorText(reply.error), true);
    return;
  }
  result = reply.ok;
  status(`${state.settings.paths} paths, both scenarios, in ${ms.toFixed(0)} ms, computed in your browser.`);
  $("#swing-sub").textContent = "Not run for the current settings yet.";
  $("#swing").replaceChildren();
  renderOutcomes();
  renderDrivers();
  renderCompare();
  refreshDetail();
}

// ---------- tooltips ----------

const tip = $("#tip");
function showTip(target, content) {
  tip.replaceChildren(...(Array.isArray(content) ? content : [content]));
  tip.style.display = "block";
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
  const top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
function tipAt(x, y, content) {
  tip.replaceChildren(...(Array.isArray(content) ? content : [content]));
  tip.style.display = "block";
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${Math.min(x + 14, window.innerWidth - w - 8)}px`;
  tip.style.top = `${y + 14 + h > window.innerHeight ? y - h - 10 : y + 14}px`;
}
const hideTip = () => { tip.style.display = "none"; };

function helpFor(node) {
  if (node.dataset.helpLever) return D.leverById[node.dataset.helpLever].note;
  if (node.dataset.helpKey) {
    const r = D.rowByKey[node.dataset.helpKey];
    return `${r.label}. ${r.note}`;
  }
  return node.dataset.help;
}
for (const type of ["mouseover", "focusin"]) {
  document.addEventListener(type, (e) => {
    const target = e.target.closest?.("[data-help],[data-help-lever],[data-help-key]");
    if (target && D) showTip(target, document.createTextNode(helpFor(target)));
  });
}
for (const type of ["mouseout", "focusout"]) {
  document.addEventListener(type, (e) => {
    if (e.target.closest?.("[data-help],[data-help-lever],[data-help-key]")) hideTip();
  });
}

// ---------- theme ----------

function storedTheme() {
  try { return localStorage.getItem("theme"); } catch { return null; }
}
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
}
applyTheme(storedTheme());
$("#theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch { /* storage unavailable: the choice lasts this visit */ }
  if (result) { renderOutcomes(); renderDrivers(); }
});

// ---------- tabs ----------

for (const button of document.querySelectorAll(".tabs button")) {
  button.addEventListener("click", () => {
    for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b === button));
    for (const t of document.querySelectorAll(".tab")) t.hidden = t.id !== `tab-${button.dataset.tab}`;
    if (button.dataset.tab === "graph") renderGraph();
  });
}

// ---------- scenario editor ----------

function numberInput(lever, value, onChange, extra = {}) {
  const meta = D.leverById[lever];
  return el("input", {
    type: "number", min: meta.min, max: meta.max, step: meta.step, value,
    "aria-label": extra.label ?? meta.label,
    oninput: (e) => {
      const v = e.target.valueAsNumber;
      if (Number.isFinite(v)) onChange(v);
    },
  });
}

function renderScenarios() {
  const side = (key) => state.scenarios[key];
  const update = () => schedule();
  const head = el("tr", {}, el("th", {}), ...["a", "b"].map((k) => el("th", {}, el("span", { class: "key", style: `background: var(--series-${k})` }), k.toUpperCase())));
  const rows = [
    ...["a", "b"].map((k) => el("tr", {},
      el("td", { class: "lab" }, el("span", { class: "key", style: `background: var(--series-${k})` }), `Name of ${k.toUpperCase()}`),
      el("td", { colspan: 2 }, el("input", { type: "text", value: side(k).name, "aria-label": `Name of scenario ${k.toUpperCase()}`, oninput: (e) => { side(k).name = e.target.value; renderLegend(); update(); } })))),
    el("tr", { class: "group" }, el("td", { colspan: 3, text: "Compute" })),
    el("tr", {}, el("td", { class: "lab" }, el("span", { "data-help-lever": "cap", text: "Cap on growth of the largest training run, OOM/yr" })), ...["a", "b"].map((k) => {
      const box = el("input", { type: "checkbox", checked: side(k).cap !== null, "aria-label": `Cap compute growth in ${k.toUpperCase()}` });
      const value = numberInput("cap", side(k).cap ?? 0.3, (v) => { side(k).cap = v; update(); });
      value.disabled = side(k).cap === null;
      box.addEventListener("change", () => {
        side(k).cap = box.checked ? value.valueAsNumber : null;
        value.disabled = !box.checked;
        update();
      });
      return el("td", {}, el("label", { class: "opt" }, box, "Cap"), value);
    })),
    el("tr", {}, el("td", { class: "lab" }, el("span", { "data-help-lever": "shockstart", text: "Supply shock: start, years, share of new hardware lost" })), ...["a", "b"].map((k) => {
      const current = side(k).shock ?? { start: 2030, years: 3, severity: 0.8 };
      const box = el("input", { type: "checkbox", checked: side(k).shock !== null, "aria-label": `Supply shock in ${k.toUpperCase()}` });
      const fields = {
        start: numberInput("shockstart", current.start, (v) => { current.start = v; if (side(k).shock) update(); }, { label: "Shock start year" }),
        years: numberInput("shockyears", current.years, (v) => { current.years = v; if (side(k).shock) update(); }, { label: "Shock length in years" }),
        severity: numberInput("shockseverity", current.severity, (v) => { current.severity = v; if (side(k).shock) update(); }, { label: "Share of growth lost" }),
      };
      const sync = () => { for (const f of Object.values(fields)) f.disabled = !box.checked; };
      sync();
      box.addEventListener("change", () => {
        side(k).shock = box.checked ? current : null;
        sync();
        update();
      });
      if (side(k).shock) side(k).shock = current;
      return el("td", {}, el("label", { class: "opt" }, box, "Shock"), el("div", { class: "shock" },
        el("label", {}, "starts", fields.start), el("label", {}, "years", fields.years), el("label", {}, "lost", fields.severity)));
    })),
    el("tr", { class: "group" }, el("td", { colspan: 3, text: "Labor and income" })),
    ...[["dividend", "Dividend from capital income"], ["replacement", "Unemployment benefit, share of wage"], ["retraining", "Retraining, % of output"]].map(([lever, label]) =>
      el("tr", {}, el("td", { class: "lab" }, el("span", { "data-help-lever": lever, text: label })), ...["a", "b"].map((k) =>
        el("td", {}, numberInput(lever, side(k)[lever], (v) => { side(k)[lever] = v; update(); }, { label: `${label} in ${k.toUpperCase()}` }))))),
  ];
  $("#scenarios").replaceChildren(el("table", { class: "scen" }, el("thead", {}, head), el("tbody", {}, rows)));
  renderLegend();
}

function renderSettings() {
  const bind = (id, key) => {
    const input = $(id);
    input.value = state.settings[key];
    input.oninput = () => {
      const v = input.valueAsNumber;
      if (Number.isFinite(v)) { state.settings[key] = v; schedule(); }
    };
  };
  bind("#paths", "paths");
  bind("#seed", "seed");
  bind("#discount", "discount");
}

$("#copy-ab").addEventListener("click", () => {
  state.scenarios.b = structuredClone(state.scenarios.a);
  state.scenarios.b.name = `${state.scenarios.a.name} (copy)`;
  renderScenarios();
  schedule();
});
$("#swap-ab").addEventListener("click", () => {
  [state.scenarios.a, state.scenarios.b] = [state.scenarios.b, state.scenarios.a];
  renderScenarios();
  schedule();
});

function renderLegend() {
  $("#legend").replaceChildren(
    ...["a", "b"].map((k) => el("span", {}, el("i", { style: `background: var(--series-${k})` }), `${k.toUpperCase()}: ${state.scenarios[k].name}, median`)),
    el("span", {}, el("b", { style: "background: var(--ink-2)" }), "shaded: 10th to 90th percentile of paths"),
    el("span", {}, svg("svg", { viewBox: "0 0 14 14", width: 12, height: 12, style: "vertical-align: middle; margin-right: 6px", "aria-hidden": "true" }, svg("path", { d: "M7 1 L13 7 L7 13 L1 7 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.6 })), "published forecast, see Method"),
  );
}

// ---------- charts ----------

function niceTicks(lo, hi, count = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

const W = 520;
const H = 210;
const M = { l: 52, r: 14, t: 10, b: 26 };

// "growth" plots log(1 + v): a growth rate on a log scale, which keeps
// both a 2% year and a 500% year readable and still allows negative growth.
const SCALES = {
  linear: { to: (v) => v, from: (u) => u },
  log: { to: Math.log10, from: (u) => 10 ** u },
  growth: { to: (v) => Math.log10(1 + v), from: (u) => 10 ** u - 1 },
};

// Ticks for a log-like scale, from round values in order of priority (no
// growth, then powers of ten, then 5s, then 2s), each kept only if it is far
// enough on the axis from every tick already kept.
function scaleTicks(scale, lo, hi) {
  const s = SCALES[scale];
  const minGap = (hi - lo) / 6;
  const powers = [];
  for (let k = Math.floor(lo) - 2; k <= Math.ceil(hi) + 2; k += 1) powers.push(10 ** k);
  const growthFloor = scale === "growth" ? [-0.5, -0.2, -0.1, -0.05, -0.02] : [];
  const candidates = [
    ...(scale === "growth" ? [0] : []),
    ...powers,
    ...powers.map((p) => 5 * p),
    ...powers.map((p) => 2 * p),
    ...growthFloor,
  ];
  const kept = [];
  for (const v of candidates) {
    const u = s.to(v);
    if (Number.isFinite(u) && u >= lo && u <= hi && kept.every((k) => Math.abs(s.to(k) - u) >= minGap)) kept.push(v);
  }
  return kept.sort((p, q) => p - q);
}

function frame(xs, yLo, yHi, { scale = "linear", format = compact, zero = false } = {}) {
  const tf = SCALES[scale].to;
  const [lo, hi] = [tf(yLo), tf(yHi)];
  const pad = (hi - lo) * 0.05 || 1;
  const domain = [lo - pad, hi + pad];
  const x = (i) => M.l + (i / (xs.length - 1)) * (W - M.l - M.r);
  const y = (v) => H - M.b - ((tf(v) - domain[0]) / (domain[1] - domain[0])) * (H - M.t - M.b);
  const ticks = scale === "linear" ? niceTicks(domain[0], domain[1], 4) : scaleTicks(scale, domain[0], domain[1]);
  const grid = svg("g", { class: "grid" }, ticks.map((t) => svg("line", { x1: M.l, x2: W - M.r, y1: y(t), y2: y(t) })));
  const axis = svg("g", { class: "axis" },
    ticks.map((t) => svg("text", { x: M.l - 6, y: y(t) + 4, "text-anchor": "end" }, document.createTextNode(format(t)))),
    xs.map((yr, i) => (yr % 10 === 0 ? svg("text", { x: x(i), y: H - 8, "text-anchor": "middle" }, document.createTextNode(String(yr))) : null)),
    svg("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }),
    zero && tf(0) >= domain[0] && tf(0) <= domain[1] ? svg("line", { x1: M.l, x2: W - M.r, y1: y(0), y2: y(0), "stroke-width": 1.5 }) : null,
  );
  return { x, y, grid, axis };
}

// A positive series spanning more than two orders of magnitude reads better
// on a log scale.
const autoScale = (series) => {
  const all = series.flatMap((s) => [...s.fan.p10, ...s.fan.p90]);
  const lo = Math.min(...all);
  return lo > 0 && Math.max(...all) / lo > 100 ? "log" : "linear";
};

function fanChart({ title, sub, series, scale = "linear", format = compact, zero = false, refs = [] }) {
  const years = result.years;
  const all = series.flatMap((s) => [...s.fan.p10, ...s.fan.p90]).concat(refs.map((r) => r.value));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const f = frame(years, lo, hi, { scale, format, zero });
  const marks = series.map((s) => {
    const area = years.map((_, i) => `${f.x(i)},${f.y(s.fan.p90[i])}`).concat(years.map((_, i) => `${f.x(years.length - 1 - i)},${f.y(s.fan.p10[years.length - 1 - i])}`));
    return svg("g", {},
      svg("polygon", { points: area.join(" "), fill: `var(--series-${s.key})`, "fill-opacity": 0.12 }),
      svg("polyline", { points: years.map((_, i) => `${f.x(i)},${f.y(s.fan.p50[i])}`).join(" "), fill: "none", stroke: `var(--series-${s.key})`, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  });
  const cross = svg("line", { y1: M.t, y2: H - M.b, stroke: "var(--axis)", visibility: "hidden" });
  const dots = series.map((s) => svg("circle", { r: 4, fill: `var(--series-${s.key})`, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }));
  const hit = svg("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: "transparent" });
  const diamonds = refs.map((r) => {
    const cx = f.x(years.indexOf(r.year));
    const cy = f.y(r.value);
    const mark = svg("path", { d: `M${cx} ${cy - 6} L${cx + 6} ${cy} L${cx} ${cy + 6} L${cx - 6} ${cy} Z`, fill: "var(--surface)", stroke: "var(--ink)", "stroke-width": 1.6 });
    const target = svg("circle", { cx, cy, r: 12, fill: "transparent" });
    target.addEventListener("pointermove", (e) => tipAt(e.clientX, e.clientY, [
      el("div", { class: "row" }, el("strong", { text: format(r.value) }), el("span", { text: `${r.who}, ${r.year}` })),
      el("div", { text: r.source.title }),
    ]));
    target.addEventListener("pointerleave", hideTip);
    return svg("g", {}, mark, target);
  });
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, f.grid, f.axis, marks, cross, dots, hit, diamonds);
  const readout = el("div", { class: "readout" });
  const show = (i) => {
    cross.setAttribute("x1", f.x(i)); cross.setAttribute("x2", f.x(i)); cross.setAttribute("visibility", "visible");
    series.forEach((s, j) => { dots[j].setAttribute("cx", f.x(i)); dots[j].setAttribute("cy", f.y(s.fan.p50[i])); dots[j].setAttribute("visibility", "visible"); });
    readout.replaceChildren(el("strong", { text: String(years[i]) }), ...series.flatMap((s) => [
      "  ", el("span", { class: "lkey", style: `background: var(--series-${s.key})` }), `${s.name} ${format(s.fan.p50[i])} `,
      el("span", { style: "color: var(--muted)", text: `(${format(s.fan.p10[i])} to ${format(s.fan.p90[i])})` }),
    ]));
  };
  const hide = () => {
    cross.setAttribute("visibility", "hidden");
    for (const d of dots) d.setAttribute("visibility", "hidden");
    readout.replaceChildren(el("span", { style: "color: var(--muted)", text: `${years[years.length - 1]}: ` }), ...series.flatMap((s) => [el("span", { class: "lkey", style: `background: var(--series-${s.key})` }), `${s.name} ${format(s.fan.p50[years.length - 1])}  `]));
  };
  let at = years.length - 1;
  hit.addEventListener("pointermove", (e) => {
    const box = root.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    at = Math.max(0, Math.min(years.length - 1, Math.round(((px - M.l) / (W - M.l - M.r)) * (years.length - 1))));
    show(at);
  });
  hit.addEventListener("pointerleave", hide);
  const card = el("div", { class: "chart", tabindex: 0, "aria-label": `${title}. Use the arrow keys to step through years.` },
    el("h3", { text: title }), sub ? el("div", { class: "sub", text: sub }) : null, root, readout);
  card.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      at = Math.max(0, Math.min(years.length - 1, at + (e.key === "ArrowRight" ? 1 : -1)));
      show(at);
      e.preventDefault();
    }
  });
  card.addEventListener("blur", hide);
  hide();
  return card;
}

function histogram({ title, sub, edges, counts }) {
  const n = counts.length;
  const total = counts.reduce((a, b) => a + b, 0);
  const maxC = Math.max(...counts);
  const lo = edges[0];
  const hi = edges[edges.length - 1];
  const x = (v) => M.l + ((v - lo) / (hi - lo || 1)) * (W - M.l - M.r);
  const y = (c) => H - M.b - (c / maxC) * (H - M.t - M.b);
  const ticks = niceTicks(lo, hi, 5).filter((t) => t >= lo && t <= hi);
  const bars = counts.map((c, i) => {
    const x0 = x(edges[i]) + 1;
    const w = Math.max(1, Math.min(24, x(edges[i + 1]) - x(edges[i]) - 2));
    const h = H - M.b - y(c);
    const r = Math.min(4, w / 2, h);
    const top = y(c);
    const d = h <= 0 ? "" : `M${x0},${H - M.b} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + w - r} Q${x0 + w},${top} ${x0 + w},${top + r} V${H - M.b} Z`;
    const bar = svg("path", { d, fill: "var(--series-d)" });
    const target = svg("rect", { x: x(edges[i]), y: M.t, width: Math.max(2, x(edges[i + 1]) - x(edges[i])), height: H - M.t - M.b, fill: "transparent" });
    target.addEventListener("pointermove", (e) => tipAt(e.clientX, e.clientY, [
      el("div", { class: "row" }, el("strong", { text: `${c} paths` }), el("span", { text: `(${pct(c / total, 1)})` })),
      el("div", { text: `B ${minus} A between ${signed(edges[i])} and ${signed(edges[i + 1])} WELLBY` }),
    ]));
    target.addEventListener("pointerleave", hideTip);
    return svg("g", {}, bar, target);
  });
  const axis = svg("g", { class: "axis" },
    ticks.map((t) => svg("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, document.createTextNode(signed(t, Math.abs(hi - lo) < 1 ? 2 : 1)))),
    svg("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }),
    lo <= 0 && hi >= 0 ? svg("line", { x1: x(0), x2: x(0), y1: M.t, y2: H - M.b, "stroke-width": 1.5 }) : null,
    lo <= 0 && hi >= 0 ? svg("text", { x: x(0) + 4, y: M.t + 10 }, document.createTextNode("no difference")) : null,
  );
  return el("div", { class: "chart" }, el("h3", { text: title }), el("div", { class: "sub", text: sub }),
    svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, axis, bars));
}

function firstYearAtLeast(fan, threshold) {
  const i = fan.p50.findIndex((v) => v >= threshold);
  return i < 0 ? `after ${result.years[result.years.length - 1]}` : String(result.years[i]);
}

function tile(k, v, s) {
  return el("div", { class: "tile" }, el("div", { class: "k", text: k }), el("div", { class: "v", text: v }), el("div", { class: "s", text: s }));
}

const refsFor = (node) => D.references.filter((r) => r.kind === "atYear" && r.node === node);

function renderOutcomes() {
  const { fans, deltaFans, delta, finals } = result;
  const A = state.scenarios.a.name;
  const B = state.scenarios.b.name;
  const pair = (node) => [{ key: "a", name: "A", fan: fans.a[node] }, { key: "b", name: "B", fan: fans.b[node] }];
  const peak = (fan) => Math.max(...fan.p50);
  const equal = 1 - delta.shareAbove - delta.shareBelow;
  $("#tiles").replaceChildren(
    tile(`WELLBYs per person, B ${minus} A, 2026 to 2060`, signed(delta.mean), `mean; 90% of paths between ${signed(delta.p05)} and ${signed(delta.p95)}`),
    tile("Paths where B ends higher", pct(delta.shareAbove), `lower on ${pct(delta.shareBelow)}${equal > 0.0005 ? `, equal on ${pct(equal)}` : ""}`),
    tile("Automation passes 50%, median path", `${firstYearAtLeast(fans.a.automatedShare, 0.5)} / ${firstYearAtLeast(fans.b.automatedShare, 0.5)}`, "A / B"),
    tile("Peak unemployment, median path", `${pct(peak(fans.a.unemployment), 1)} / ${pct(peak(fans.b.unemployment), 1)}`, "A / B"),
  );
  $("#charts").replaceChildren(
    fanChart({ title: "Largest training run", sub: "Orders of magnitude above the largest run at the end of 2025", series: pair("frontierOoms"), format: (v) => plain(v, 1) }),
    fanChart({ title: "Share of tasks automated", sub: "Tasks AI can do that are worth handing to it", series: pair("automatedShare"), format: (v) => pct(v) }),
    fanChart({ title: "AI's share of investment", sub: "Compute hardware and hardware and software R&D", series: pair("aiInvestmentShare"), format: (v) => pct(v) }),
    fanChart({ title: "Unemployment rate", series: pair("unemployment"), format: (v) => pct(v, 1), refs: refsFor("unemployment") }),
    fanChart({ title: "Labor share of income", sub: "1 − α times the share of task value still produced by people", series: pair("laborShare"), format: (v) => pct(v, 1), refs: refsFor("laborShare") }),
    fanChart({ title: "Growth of output per person", sub: "Log scale of one plus the growth rate, so slow and explosive years both show", series: pair("growthRate"), scale: "growth", format: (v) => pct(v, Math.abs(v) < 0.1 ? 1 : 0), refs: refsFor("growthRate"), zero: true }),
    fanChart({ title: "Output per person", sub: "Multiple of 2025, log scale", series: pair("outputPc"), scale: "log", format: (v) => `${compact(v)}x` }),
    fanChart({ title: "Consumption of a displaced worker", sub: "Multiple of 2025 output per person, log scale", series: pair("consDisplaced"), scale: "log", format: (v) => `${compact(v)}x` }),
    fanChart({ title: "Mean life satisfaction", sub: "0-10 scale, relative to an arbitrary zero: compare the scenarios, not the level", series: pair("lifeSat"), format: (v) => plain(v, 2) }),
    fanChart({ title: `Life satisfaction, B ${minus} A`, sub: `Per year, on the same paths: ${B} minus ${A}`, series: [{ key: "d", name: `B ${minus} A`, fan: deltaFans.lifeSat }], format: (v) => signed(v, 3), zero: true }),
    fanChart({ title: `Cumulative WELLBYs per person, B ${minus} A`, sub: "Discounted life-satisfaction-years since 2026", series: [{ key: "d", name: `B ${minus} A`, fan: deltaFans.wellby }], format: (v) => signed(v, 2), zero: true }),
    histogram({ title: `Paths by final difference, B ${minus} A`, sub: `Cumulative WELLBYs per person by 2060; scenario means A ${plain(finals.a.mean)} and B ${plain(finals.b.mean)}`, edges: delta.edges, counts: delta.counts }),
  );
}

// ---------- published forecasts ----------

function modelValue(r) {
  const fan = result.fans.a[r.node];
  if (r.kind === "atYear") return fan.p50[result.years.indexOf(r.year)];
  const i = fan.p50.findIndex((v) => v >= r.threshold);
  return i < 0 ? null : result.years[i];
}

function verdict(r, model) {
  if (r.kind === "firstYear") {
    if (model === null) return `model: after ${result.years[result.years.length - 1]}`;
    return Math.abs(model - r.year) <= 2 ? "close" : model < r.year ? `model ${r.year - model} years earlier` : `model ${model - r.year} years later`;
  }
  const rel = (model - r.value) / Math.abs(r.value);
  return Math.abs(rel) <= 0.1 ? "close" : rel > 0 ? "model higher" : "model lower";
}

const showRef = (r) => (r.kind === "firstYear" ? String(r.year) : r.node === "growthRate" || r.node === "unemployment" || r.node === "laborShare" ? pct(r.value, 1) : compact(r.value));
const showModel = (r, v) => (v === null ? "not by 2060" : r.kind === "firstYear" ? String(v) : pct(v, 1));

function renderCompare() {
  $("#compare").replaceChildren(el("table", { class: "data" },
    el("thead", {}, el("tr", {}, ["Quantity", "Model", "Published", "Who", "Comparison", "Source and caveat"].map((h) => el("th", { text: h })))),
    el("tbody", {}, D.references.map((r) => {
      const v = modelValue(r);
      return el("tr", {},
        el("td", { text: r.kind === "firstYear" ? `${r.quantity} (automated share reaches ${pct(r.threshold)})` : r.quantity }),
        el("td", { class: "num", text: showModel(r, v) }),
        el("td", { class: "num", text: showRef(r) }),
        el("td", { text: r.who }),
        el("td", { text: verdict(r, v) }),
        el("td", {}, el("a", { href: r.source.url, target: "_blank", rel: "noopener", text: r.source.title }), el("div", { class: "note", style: "margin: 2px 0 0", text: r.note })));
    }))));
}

// ---------- drivers ----------

const BASIS_SHAPES = {
  measured: () => svg("circle", { cx: 4.5, cy: 4.5, r: 4, fill: "currentColor" }),
  literature: () => svg("path", { d: "M4.5 0.5 L8.5 4.5 L4.5 8.5 L0.5 4.5 Z", fill: "currentColor" }),
  judgment: () => svg("path", { d: "M4.5 1 L8.2 8 L0.8 8 Z", fill: "none", stroke: "currentColor", "stroke-width": 1.3 }),
};
const basisMark = (basis) => el("span", { class: "basis" }, svg("svg", { viewBox: "0 0 9 9", "aria-hidden": "true" }, BASIS_SHAPES[basis]()), basis);

function rhoBar(value, color) {
  const width = Math.abs(value) * 50;
  return el("div", { class: "rho", title: plain(value, 2) },
    el("div", { class: "mid" }),
    el("span", { style: `background: ${color}; width: ${width}%; ${value >= 0 ? "left: 50%" : `left: ${50 - width}%`}` }));
}

function renderDrivers() {
  const rows = [...result.drivers].sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
  $("#spearman").replaceChildren(el("div", { class: "scroll" }, el("table", { class: "data" },
    el("thead", {}, el("tr", {}, el("th", { text: "Assumption" }), el("th", { text: "Basis" }), el("th", { text: `B ${minus} A` }), el("th", { class: "num", text: "ρ" }), el("th", { text: "B alone" }), el("th", { class: "num", text: "ρ" }))),
    el("tbody", {}, rows.map((d) => {
      const r = D.rowByKey[d.key];
      return el("tr", {},
        el("td", { class: "who" }, tex(r.symbol), " ", el("span", { "data-help-key": d.key, text: r.label })),
        el("td", {}, basisMark(r.basis)),
        el("td", { class: "bar-cell" }, rhoBar(d.delta, "var(--series-d)")),
        el("td", { class: "num", text: signed(d.delta) }),
        el("td", { class: "bar-cell" }, rhoBar(d.b, "var(--series-b)")),
        el("td", { class: "num", text: signed(d.b) }));
    })))));
}

$("#run-swing").addEventListener("click", async () => {
  const button = $("#run-swing");
  button.disabled = true;
  $("#swing-sub").textContent = `Running ${D.defaults.swingPaths} paths for each end of each assumption...`;
  const { reply, ms } = await call(request("swing", D.defaults.swingPaths));
  button.disabled = false;
  if (reply.error) {
    $("#swing-sub").textContent = errorText(reply.error);
    return;
  }
  $("#swing-sub").textContent = `Mean B ${minus} A in cumulative WELLBYs with one assumption pinned, ${D.defaults.swingPaths} paths, ${(ms / 1000).toFixed(1)} s. The line marks the mean with nothing pinned; the circle is the 10th-percentile pin and the diamond the 90th. Pinned assumptions are left out.`;
  renderSwing(reply.ok);
});

function renderSwing(sw) {
  const rows = [...sw.swings].sort((p, q) => Math.abs(q.highDelta - q.lowDelta) - Math.abs(p.highDelta - p.lowDelta));
  const values = rows.flatMap((s) => [s.lowDelta, s.highDelta]).concat([sw.base.delta]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const Wd = 260;
  const pos = (v) => 6 + ((v - lo) / span) * (Wd - 12);
  $("#swing").replaceChildren(el("div", { class: "scroll" }, el("table", { class: "data" },
    el("thead", {}, el("tr", {}, el("th", { text: "Assumption" }), el("th", { class: "num", text: "p10 → p90" }), el("th", { text: `mean B ${minus} A` }), el("th", { class: "num", text: "swing" }))),
    el("tbody", {}, rows.map((s) => {
      const r = D.rowByKey[s.key];
      const line = svg("svg", { viewBox: `0 0 ${Wd} 16`, width: Wd, height: 16, role: "img", "aria-label": `${signed(s.lowDelta)} at p10, ${signed(s.highDelta)} at p90` },
        svg("line", { x1: pos(sw.base.delta), x2: pos(sw.base.delta), y1: 0, y2: 16, stroke: "var(--axis)" }),
        svg("line", { x1: pos(s.lowDelta), x2: pos(s.highDelta), y1: 8, y2: 8, stroke: "var(--series-d)", "stroke-width": 2, "stroke-linecap": "round" }),
        svg("circle", { cx: pos(s.lowDelta), cy: 8, r: 4, fill: "var(--series-d)", stroke: "var(--surface)", "stroke-width": 2 }),
        svg("path", { d: `M${pos(s.highDelta)} 3 L${pos(s.highDelta) + 5} 8 L${pos(s.highDelta)} 13 L${pos(s.highDelta) - 5} 8 Z`, fill: "var(--series-d)", stroke: "var(--surface)", "stroke-width": 2 }));
      return el("tr", {},
        el("td", { class: "who" }, tex(r.symbol), " ", el("span", { "data-help-key": s.key, text: r.label })),
        el("td", { class: "num", text: `${compact(s.lowValue)} → ${compact(s.highValue)}` }),
        el("td", {}, line),
        el("td", { class: "num", text: plain(Math.abs(s.highDelta - s.lowDelta), 3) }));
    })))));
}

// ---------- model graph ----------

const GROUPS = ["compute", "automation", "labor", "output", "investment", "income", "wellbeing"];
let graphBuilt = false;
let selectedNode = null;

const nextSymbol = (symbol) => {
  const i = symbol.lastIndexOf("t}");
  return `${symbol.slice(0, i)}t+1}${symbol.slice(i + 2)}`;
};

function inputsLine(n) {
  const parts = [...n.params.map((k) => D.rowByKey[k].symbol), ...n.levers.map((l) => D.leverById[l].symbol)];
  return parts.length ? el("div", { class: "gi" }, "reads ", tex(parts.join(",\\ "))) : null;
}

async function renderGraph() {
  if (graphBuilt) return;
  graphBuilt = true;
  const showInputs = $("#show-inputs").checked;
  const host = $("#graph");
  const ghosts = new Set(D.edges.filter((e) => e.lag === "nextYear").map((e) => e.to));
  const make = (n, ghost) => {
    const box = el("div", { class: `gnode${ghost ? " ghost" : ""}`, tabindex: 0, "data-node": n.id, "data-key": `${n.id}@${ghost ? 1 : 0}`, role: "button", "aria-label": `${n.label}${ghost ? ", next year" : ""}` },
      el("div", { class: "gl", text: ghost ? `${n.label}, next year` : n.label }),
      el("div", { class: "gf" }, tex(ghost ? nextSymbol(n.symbol) : n.formula)),
      !ghost && showInputs ? inputsLine(n) : null);
    box.addEventListener("mouseenter", () => focusNode(n.id));
    box.addEventListener("focus", () => focusNode(n.id));
    box.addEventListener("mouseleave", () => focusNode(null));
    box.addEventListener("blur", () => focusNode(null));
    box.addEventListener("click", () => selectNode(n.id));
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { selectNode(n.id); e.preventDefault(); } });
    return box;
  };
  const band = (title, nodes) => el("div", { class: "gband" }, el("div", { class: "gband-title", text: title }), el("div", { class: "gnodes" }, nodes));
  const ghostsOf = (g) => D.nodes.filter((n) => n.group === g && ghosts.has(n.id)).map((n, i) => {
    const box = make(n, true);
    if (i === 0) box.classList.add("first");
    return box;
  });
  host.replaceChildren(
    svg("svg", { class: "edges", "aria-hidden": "true" }),
    ...GROUPS.map((g) => band(g[0].toUpperCase() + g.slice(1), [...D.nodes.filter((n) => n.group === g).map((n) => make(n, false)), ...ghostsOf(g)])),
  );
  await document.fonts.ready;
  drawEdges();
}

const marker = (id, color) => svg("marker", { id, viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, svg("path", { d: "M0,0 L8,4 L0,8 Z", fill: color }));

// Positions come from the browser's own layout, so the edges are redrawn
// whenever the nodes re-wrap.
function drawEdges() {
  const host = $("#graph");
  if (!host.offsetWidth) return;
  const origin = host.getBoundingClientRect();
  const place = new Map([...host.querySelectorAll(".gnode")].map((b) => {
    const r = b.getBoundingClientRect();
    return [b.dataset.key, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }];
  }));
  const ends = D.edges.map((e) => {
    const lag = e.lag === "nextYear";
    return { e, lag, s: place.get(`${e.from}@0`), t: place.get(`${e.to}@${lag ? 1 : 0}`) };
  });
  const sameRow = ({ s, t }) => Math.abs(s.y - t.y) < 4;
  const adjacent = (end) => sameRow(end) && end.t.x > end.s.x && end.t.x - (end.s.x + end.s.w) < 48;
  const spread = (list, key, pick) => {
    const groups = new Map();
    for (const end of list) groups.set(key(end), [...(groups.get(key(end)) ?? []), end]);
    const at = new Map();
    for (const members of groups.values()) {
      const sorted = [...members].sort((p, q) => pick(p) - pick(q));
      sorted.forEach((end, i) => at.set(end, (i + 1) / (sorted.length + 1)));
    }
    return at;
  };
  const vertical = ends.filter((end) => !adjacent(end));
  const outAt = spread(vertical, (end) => end.e.from, (end) => end.t.x);
  const inAt = spread(vertical, (end) => `${end.e.to}@${end.lag ? 1 : 0}`, (end) => end.s.x);
  const paths = ends.map((end) => {
    const { e, lag, s, t } = end;
    let d;
    if (adjacent(end)) {
      const y1 = s.y + s.h / 2;
      const y2 = t.y + t.h / 2;
      d = `M${s.x + s.w},${y1} C${s.x + s.w + 18},${y1} ${t.x - 18},${y2} ${t.x - 2},${y2}`;
    } else {
      const x2 = t.x + t.w * (0.2 + 0.6 * inAt.get(end));
      if (lag && sameRow(end)) {
        const x1 = s.x + s.w * (0.2 + 0.6 * outAt.get(end));
        const lift = 18 + Math.min(8, Math.abs(x2 - x1) / 80);
        d = `M${x1},${s.y + s.h} C${x1},${s.y + s.h + lift} ${x2},${t.y + t.h + lift} ${x2},${t.y + t.h + 2}`;
      } else if (sameRow(end)) {
        const x1 = s.x + s.w * (0.2 + 0.6 * outAt.get(end));
        const lift = 22 + Math.min(10, Math.abs(x2 - x1) / 60);
        d = `M${x1},${s.y} C${x1},${s.y - lift} ${x2},${t.y - lift} ${x2},${t.y - 2}`;
      } else {
        const x1 = s.x + s.w * (0.2 + 0.6 * outAt.get(end));
        const y1 = s.y + s.h;
        const bend = Math.max(24, (t.y - y1) / 2.5);
        d = `M${x1},${y1} C${x1},${y1 + bend} ${x2},${t.y - bend} ${x2},${t.y - 2}`;
      }
    }
    return svg("path", { d, class: `edge${lag ? " lag" : ""}`, "data-from": e.from, "data-to": e.to, "marker-end": `url(#${lag ? "arrow-lag" : "arrow"})` });
  });
  const layer = host.querySelector("svg.edges");
  layer.setAttribute("width", host.offsetWidth);
  layer.setAttribute("height", host.offsetHeight);
  layer.replaceChildren(svg("defs", {}, marker("arrow", "var(--edge)"), marker("arrow-lag", "var(--edge-lag)"), marker("arrow-on", "var(--hi)")), ...paths);
}

let edgeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(edgeFrame);
  edgeFrame = requestAnimationFrame(() => { if (graphBuilt) drawEdges(); });
}).observe($("#graph"));

$("#show-inputs").addEventListener("change", () => { graphBuilt = false; renderGraph(); });

function focusNode(id) {
  const host = $("#graph");
  host.classList.toggle("focus", id !== null);
  const near = new Set();
  for (const p of host.querySelectorAll("path.edge")) {
    const on = id !== null && (p.dataset.from === id || p.dataset.to === id);
    p.classList.toggle("on", on);
    p.setAttribute("marker-end", `url(#${on ? "arrow-on" : p.classList.contains("lag") ? "arrow-lag" : "arrow"})`);
    if (on) { near.add(p.dataset.from); near.add(p.dataset.to); }
  }
  for (const b of host.querySelectorAll(".gnode")) {
    b.classList.toggle("on", b.dataset.node === id);
    b.classList.toggle("near", near.has(b.dataset.node));
  }
}

function selectNode(id) {
  selectedNode = id;
  refreshDetail();
  $("#node-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function detailChart(n) {
  const series = [{ key: "a", name: "A", fan: result.fans.a[n.id] }, { key: "b", name: "B", fan: result.fans.b[n.id] }];
  const scale = autoScale(series);
  const sub = [n.unit, scale === "log" ? "log scale" : ""].filter(Boolean).join(", ");
  return fanChart({ title: `${n.label} over time`, sub: sub || undefined, series, scale });
}

function refreshDetail() {
  if (!selectedNode) return;
  const n = D.nodeById[selectedNode];
  const panel = $("#node-detail");
  panel.hidden = false;
  const reads = [
    ...n.params.map((k) => {
      const r = D.rowByKey[k];
      return el("tr", {}, el("td", {}, tex(r.symbol)), el("td", { text: r.label }), el("td", { class: "num", text: `${compact(r.ci[0])} to ${compact(r.ci[1])} ${r.unit}` }), el("td", {}, basisMark(r.basis)));
    }),
    ...n.levers.map((l) => { const m = D.leverById[l]; return el("tr", {}, el("td", {}, tex(m.symbol)), el("td", { text: m.label }), el("td", { class: "num", text: "lever" }), el("td", { text: "you set it" })); }),
  ];
  panel.replaceChildren(...[
    el("h3", { text: n.label }),
    el("p", { class: "note", text: n.help }),
    tex(n.formula, true),
    n.initial ? el("div", {}, el("span", { class: "note", text: "At the end of 2025: " }), tex(n.initial)) : null,
    reads.length ? el("table", { class: "data" }, el("thead", {}, el("tr", {}, el("th", { text: "Reads" }), el("th", {}), el("th", { class: "num", text: "90% interval" }), el("th", { text: "Basis" }))), el("tbody", {}, reads)) : null,
    result ? el("div", { style: "margin-top: 10px; max-width: 620px" }, detailChart(n)) : null,
  ].filter(Boolean));
}

// ---------- method ----------

function renderMethod() {
  const pinInput = (key) => {
    const pinned = key in state.settings.pins;
    return el("input", {
      type: "number", class: "pin", step: "any", value: pinned ? state.settings.pins[key] : "", placeholder: "drawn",
      "aria-label": `Pin ${D.rowByKey[key].label}`,
      oninput: (e) => {
        if (e.target.value === "") delete state.settings.pins[key];
        else if (Number.isFinite(e.target.valueAsNumber)) state.settings.pins[key] = e.target.valueAsNumber;
        schedule();
      },
    });
  };
  const eqs = GROUPS.map((g) => [
    el("h3", { text: g[0].toUpperCase() + g.slice(1) }),
    D.nodes.filter((n) => n.group === g).map((n) => el("div", { class: "eq" }, el("div", { class: "lab", text: n.label }), tex(n.formula, true), n.initial ? tex(n.initial, true) : null)),
  ]);
  $("#method").replaceChildren(el("div", { class: "method" },
    el("h2", { text: "What this is" }),
    el("p", { text: "A scenario explorer, not a forecast and not an advocacy tool. It follows the world economy from 2026 to 2060 in yearly steps, on the structure of Epoch AI's GATE model: investment in hardware and in hardware and software R&D grows effective compute; the largest training run sets which tasks AI can do; AI takes over those tasks where that raises output; output comes from a CES aggregate of human and digital work and from capital; and part of output is reinvested, so automation feeds back into compute. On top of that, some newly automated work becomes job loss; incomes split between top-decile owners, employed workers and displaced workers; and life satisfaction follows log consumption, its relative part, and the non-pecuniary cost of unemployment." }),
    el("p", { text: "The engine follows the structure of GATE but does not fully adhere to it. For example, GATE chooses investment and the split of compute between training and inference with a forward-looking social planner; here both follow fixed rules, so investment in AI does not anticipate automation before it happens. The unemployment, income-distribution and wellbeing parts are additions GATE does not have." }),
    el("p", { text: "Every number the model is unsure of is a distribution over a 90% interval, tagged with how much evidence stands behind it. Each path draws all of them once. Both scenarios then run on that same path, so their difference comes from the levers alone. The page reports the spread of outcomes and which assumptions the spread tracks. The levers are inputs you set; nothing searches over them, and nothing here ranks them." }),
    el("h2", { text: "How the model compares with published forecasts" }),
    el("p", { text: "These forecasts are a cross-check, not an input: nothing in the model reads them. The model follows GATE, which automates far faster than surveyed economists and AI researchers expect, so growth during the transition is much higher than they forecast and the automation milestones come earlier. Where it departs from them is part of what the page is for. Model figures are scenario A's median path from the current run." }),
    el("div", { id: "compare", class: "scroll" }),
    el("h2", { text: "The model, node by node" }),
    el("p", { text: "These formulas are typeset by the engine from the same expressions it evaluates; the model graph is drawn from them too. The subscript t is the calendar year, and t−1 is the year before." }),
    eqs,
    el("h3", { text: "Functions in the automation choice" }),
    el("p", { class: "note", text: "The share of tasks automated, f*, is the task φ at which an expression changes sign, found numerically. That expression uses two functions of φ, shown by name in its formula and defined here: Z(φ) is the runtime cost aggregate Z with φ in place of f*, and R(φ) is the runtime requirement of task φ. The subscript 0 marks the 2025 state." }),
    D.functions.map((f) => el("div", { class: "eq" }, tex(`${f.name} = ${f.definition}`, true))),
    el("h3", { text: "Constants" }),
    el("div", {}, D.constants.map((c) => el("span", { style: "margin-right: 18px" }, tex(`${c.symbol} = ${compact(c.value)}`)))),
    el("p", { class: "note", text: "ω is the population share of top-decile owners. Y₀, L₀ and C_T,0 are GATE's gross world product and labor force and Epoch's largest training run at the end of 2025; the others are values GATE fixes rather than samples." }),
    el("h2", { text: "Assumptions" }),
    el("p", { text: "Pin any of them to a value of your own; both scenarios use the pin, and the swing test leaves pinned assumptions out." }),
    el("div", { class: "scroll" }, el("table", { class: "data" },
      el("thead", {}, el("tr", {}, ["", "Assumption", "90% interval", "Median", "Basis", "Why and where from", "Pin"].map((h) => el("th", { text: h })))),
      el("tbody", {}, D.registry.map((r) => el("tr", {},
        el("td", {}, tex(r.symbol)),
        el("td", { text: `${r.label}${r.unit ? ` (${r.unit})` : ""}` }),
        el("td", { class: "num", text: `${compact(r.ci[0])} to ${compact(r.ci[1])}` }),
        el("td", { class: "num", text: compact(r.median) }),
        el("td", {}, basisMark(r.basis), el("div", { class: "note", style: "margin: 2px 0 0", text: r.family })),
        el("td", {}, el("div", { text: r.note }), r.sources.map((s) => el("div", {}, el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.title })))),
        el("td", {}, pinInput(r.key))))))),
    el("h2", { text: "Levers" }),
    el("div", { class: "scroll" }, el("table", { class: "data" },
      el("thead", {}, el("tr", {}, ["", "Lever", "Range", "What it does"].map((h) => el("th", { text: h })))),
      el("tbody", {}, D.levers.map((l) => el("tr", {}, el("td", {}, tex(l.symbol)), el("td", { text: `${l.label}${l.unit ? ` (${l.unit})` : ""}` }), el("td", { class: "num", text: `${l.min} to ${l.max}` }), el("td", { text: l.note })))))),
    el("h2", { text: "How it runs" }),
    el("p", { text: "The engine is a small Haskell library. Each formula is written once against a type class: at Double it is the arithmetic a path runs, and at a symbolic expression type it is the LaTeX on this page and the edges of the model graph. Eighteen QuickCheck properties guard its invariants, among them: identical scenarios differ by exactly zero, the typeset formula evaluates to the number the path uses, same-year reads only look backwards, values without a year index stay constant along a path, each function shown by name has one definition, the automatable share never reverses, only automatable tasks are automated, output is exactly spent on consumption, investment and retraining, every value stays finite, unemployment stays a share, the largest training run never grows faster than the cap, the labor share stays a share, pinning one assumption leaves every other draw unchanged, and the input boundary rejects out-of-range levers by name. The library is compiled with GHC's WebAssembly backend and runs in a Web Worker in your browser; nothing is sent anywhere." }),
    el("h2", { text: "Limitations" }),
    el("ul", {}, [
      "One world economy: no countries, trade or export controls, so a supply shock or a cap applies to all compute at once.",
      "Effective compute is one number. Data and energy other than the heat limit are not modelled.",
      "The saving rate is fixed, and investment splits between capital and AI by their output elasticities as returns appear; a planner that foresees automation, as in GATE, would invest in AI earlier and more.",
      "New tasks that AI creates are not modelled, so job loss is likely overstated when automation is high.",
      "Once nearly every task is automated, output grows with compute alone and can grow explosively until the heat limit binds, as in GATE; growth rates in that phase say more about the model's structure than about any forecast.",
      "Owners are a fixed top decile who do not work; workers hold the rest of the capital. Real wealth distributions are smoother and shift over time.",
      "Life satisfaction is log-linear in consumption with a relative part, and the WELLBY sum counts each person-year equally after discounting. Population, mortality and AI's direct effects on health, meaning and safety are not modelled.",
    ].map((t) => el("li", { text: t }))),
  ));
}

// ---------- start ----------

async function start() {
  const { reply } = await call({ kind: "describe" });
  if (reply.error) throw new Error(`describe was rejected: ${JSON.stringify(reply.error)}`);
  D = reply.ok;
  D.leverById = Object.fromEntries(D.levers.map((l) => [l.id, l]));
  D.rowByKey = Object.fromEntries(D.registry.map((r) => [r.key, r]));
  D.nodeById = Object.fromEntries(D.nodes.map((n) => [n.id, n]));
  state = structuredClone(D.defaults);
  renderScenarios();
  renderSettings();
  renderMethod();
  await simulate();
}

start().catch((e) => status(`The engine failed to start: ${e.message}`, true));
