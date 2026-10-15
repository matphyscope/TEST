/*MODEL*/
/*DATA*/
const stage = document.querySelector(".tem-stage");
const svg = stage.querySelector("svg");
const q = (n) => svg.querySelector('[data-part="' + n + '"]');
const raysG = q("rays"), screenG = q("screen"), apCL = q("apCL"), apOL = q("apOL"), filG = q("filament");
const readout = document.querySelector("[data-readout]");
const infoEl = document.querySelector("[data-info]");
const gridEl = document.querySelector("[data-grid]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const num = (v, d = 2) => Number(v).toFixed(d);
const WJ = (u, v, z = 0) => [E1[0] * u + E2[0] * v, E1[1] * u + E2[1] * v, z];
const PW = (panel, u, v, z) => { const [cu, cv] = PANEL_AT[panel]; return WJ(cu + u * PS, cv + v * PS, z); };
const rayPt = (z, y) => iso([E1[0] * y, E1[1] * y, z], P);
const fix = (p) => p[0].toFixed(1) + " " + p[1].toFixed(1);
const rayPath = (pts) => "M" + pts.map(([z, y]) => fix(rayPt(z, y))).join("L");

// ---------------------------------------------------------------- state
const T = { ...initial(), stig: [0, 0] };       // what the controls ask for
const V = { ...initial(), stig: [0, 0], clR: CL_AP[T.clAp].r, olR: OL_AP[T.olAp].r, mix: 0, clIn: 1, olIn: 1 };
const EASE = { bright: 0.2, alpha: 0.2, spot: 0.25, shiftX: 0.2, shiftY: 0.2, olX: 0.2, mag: 0.3, objFocus: 0.25, diffFocus: 0.25, dz: 0.25, tilt: 0.25, kV: 0.3, fil: 0.25, clR: 0.2, olR: 0.2 };
let O = optics(V, 0);
let selected = "bright", touring = !still.matches, clock = 0, frame = 0, last = 0, visible = false, t0 = performance.now();

const PART_NAME = { gun: "전자총", hv: "고전압 탱크", gdef: "건 편향코일", c1: "C1 렌즈", c2: "C2 렌즈", cm: "CM 미니렌즈", cla: "빔 편향코일", apCL: "CL 조리개", apOL: "OL 조리개", obj: "대물렌즈", spec: "시료·홀더", int: "중간렌즈", proj: "투사렌즈", screen: "형광 스크린" };
const HEAD = { bf: "명시야(BF)", df: "암시야(DF)", open: "조리개 열림", dark: "빔 없음" };
const FN = { mag1: "MAG1", lowmag: "LOW MAG", samag: "SA MAG", sadiff: "SA DIFF" };
const tiltDark = () => optics({ ...T, tilt: 0 }, 0).tiltDark;

// ---------------------------------------------------------------- the controls
const knob = (key, min, max, extra = {}) => ({ kind: "knob", min, max, step: 0.01, get: () => T[key], set: (v) => { T[key] = clamp(v, min, max); }, ...extra });
const defKnob = (i) => ({
  kind: "knob", min: -1, max: 1, step: 0.01,
  get: () => (T.defMode === "stig" ? T.stig[i] : T.defMode === "guntilt" ? T.gunTilt[i] : i === 0 && (T.defMode === "dark" || T.defMode === "bright") ? T.tilt : 0),
  set: (v) => { v = clamp(v, -1, 1); if (T.defMode === "stig") T.stig[i] = v; else if (T.defMode === "guntilt") T.gunTilt[i] = v; else if (i === 0 && (T.defMode === "dark" || T.defMode === "bright")) T.tilt = v; },
});
const CTL = {
  beam: { panel: "L1", label: "BEAM (필라멘트)", kind: "sw", get: () => T.fil, set: (v) => { T.fil = v ? 1 : 0; }, text: "필라멘트를 켜고 끕니다. 켜면 전자총에서 전자가 나와 컬럼을 따라 내려가고, 끄면 빔과 스크린 신호가 모두 사라집니다.", detail: () => (T.fil ? "빔 ON · " + T.kV + " kV" : "빔 OFF") },
  probe: { panel: "L1", label: "조명 모드", kind: "radio", opts: ["TEM", "EDS", "NBD", "CBD"], get: () => T.probe, set: (v) => { T.probe = v; Object.assign(T, PRESET[v]); }, text: "TEM(넓은 평행빔) · EDS(고전류밀도 미소영역) · NBD(작은 수렴각 미소영역) · CBD(수렴각 가변). 모드를 고르면 그 모드에 저장된 SPOT·α·BRIGHTNESS가 불러와집니다.", detail: () => "수렴 반각 " + num(O.theta * 1000, 0) + " mrad · 프로브 크기(상대) " + num(O.spotRel) },
  cl: { panel: "L1", label: "CL 조리개", kind: "radio", opts: [0, 1, 2, 3, 4], optLabel: (i) => CL_AP[i].name, get: () => T.clAp, set: (v) => { T.clAp = +v; }, text: "응집렌즈 조리개. 구멍이 작을수록 빔의 수렴각과 전류가 줄어 그림의 빔이 가늘고 어두워집니다. OPEN은 조리개를 뺀 상태입니다.", detail: () => "CL " + CL_AP[T.clAp].name + " · 수렴 반각 " + num(O.theta * 1000, 0) + " mrad · 빔 전류 " + num(O.current * 100, 1) + "%" },
  ol: { panel: "L1", label: "OL 조리개", kind: "radio", opts: [0, 1, 2, 3, 4], optLabel: (i) => OL_AP[i].name, get: () => T.olAp, set: (v) => { T.olAp = +v; }, text: "대물렌즈 뒷초점면의 조리개. 직접빔만 통과시키면 명시야, 회절빔만 통과시키면 암시야 상이 됩니다. 구멍이 작을수록 대비는 높아집니다. LOW MAG·SA DIFF에서는 자동으로 빠집니다.", detail: () => (O.olOut ? "조리개가 빠져 있음" : "OL " + OL_AP[T.olAp].name) + " · " + HEAD[O.field] },
  olx: { panel: "L1", label: "OL 조리개 X", kind: "knob", min: -1, max: 1, step: 0.01, get: () => T.olX, set: (v) => { T.olX = clamp(v, -1, 1); }, text: "OL 조리개를 X 방향으로 움직입니다. 조리개 구멍에 회절 스팟이 들어오게 하면 그 회절빔으로 만든 암시야 상이 됩니다.", detail: () => "구멍 위치 " + num(T.olX * 2.2) + " · 통과 빔 " + O.beams.filter((b) => b.pass).map((b) => (b.k === 0 ? "직접" : b.k > 0 ? "+1" : "−1")).join(" ") },
  alpha: { panel: "L1", label: "α SELECTOR", kind: "knob", min: 0, max: 1, step: 0.01, get: () => T.alpha, set: (v) => { T.alpha = clamp(v, 0, 1); }, text: "SPOT 크기를 바꾸지 않고 수렴각만 조절합니다(CM 미니렌즈). 시계 방향 = 수렴각 증가.", detail: () => "수렴 반각 " + num(O.theta * 1000, 0) + " mrad · 프로브 크기(상대) " + num(O.spotRel) + " (불변)" },
  spot: { panel: "L1", label: "SPOT SIZE", kind: "knob", min: 1, max: 5, step: 1, get: () => T.spot, set: (v) => { T.spot = clamp(Math.round(v), 1, 5); }, text: "C1 렌즈 세기. 숫자가 클수록 C1이 강해져 전자원의 크로스오버 상이 작아지고 CL 조리개를 통과하는 각도가 줄어, 프로브가 작아지는 대신 빔 전류가 크게 줄어 어두워집니다. 그림에서 빔 선이 가늘고 어두워지는 것이 보입니다.", detail: () => "SPOT " + T.spot + " · 프로브 크기(상대) " + num(O.spotRel) + " (SPOT 1 = 1.00) · 빔 전류 " + num(O.current * 100, 1) + "% (SPOT 1·150µm·α최대 = 100%)" },
  bright: { panel: "L1", label: "BRIGHTNESS", kind: "knob", min: 0, max: 1, step: 0.01, get: () => T.bright, set: (v) => { T.bright = clamp(v, 0, 1); }, text: "C2 렌즈 전류로 빔을 모으거나 퍼뜨립니다. 크로스오버가 시료 위에 맺히면 가장 작고 밝은 빔, 위나 아래로 벗어날수록 빔이 퍼지고 어두워집니다.", detail: () => "크로스오버 " + (Math.abs(O.zf - Z.spec) < 1 ? "시료 위(집속)" : O.zf > Z.spec ? "시료 아래 " + num(O.zf - Z.spec, 0) : "시료 위쪽 " + num(Z.spec - O.zf, 0)) + " · 시료 위 빔 반경 " + num(O.beamHalf) + " · 전류밀도 " + num(O.density * 100, 0) + "%" },
  shx: { panel: "L1", label: "SHIFT X", labelNow: () => (T.defMode === "gunshift" ? "GUN SHIFT X" : "SHIFT X"), kind: "knob", min: -1, max: 1, step: 0.01, get: () => (T.defMode === "gunshift" ? T.gunShift[0] : T.shiftX), set: (v) => { v = clamp(v, -1, 1); if (T.defMode === "gunshift") T.gunShift[0] = v; else T.shiftX = v; }, text: "빔 편향코일 두 개의 전류 비율을 바꿔 빔을 평행이동합니다. 그림에서 빔이 코일 위치에서 꺾였다가 시료에 평행하게 도착하는 것이 보입니다. DEF/STIG 기능에서 G-SHIFT를 켜면 이 노브가 전자총 편향코일(GUN SHIFT)을 조절합니다.", textNow: () => (T.defMode === "gunshift" ? "GUN SHIFT: 전자총 편향코일로 전자원의 위치를 옮깁니다. 정렬이 틀어져 있으면 SPOT SIZE를 바꿀 때마다 빔이 이동하고 빔 전류가 줄어듭니다. 빔 이동이 사라지는 지점이 정렬된 위치입니다." : null), detail: () => (T.defMode === "gunshift" ? "건 위치 오차 " + num(O.shiftErr) + " (0이면 정렬) · 시료 위 빔 이동 " + num(O.shift[0]) + " · 빔 전류 " + num(O.current * 100, 1) + "%" : "빔 이동 " + num(O.shift[0]) + " · 스크린 위 이동 " + num(O.shift[0] * O.Mimg, 1)) },
  shy: { panel: "R1", label: "SHIFT Y", labelNow: () => (T.defMode === "gunshift" ? "GUN SHIFT Y" : "SHIFT Y"), kind: "knob", min: -1, max: 1, step: 0.01, get: () => (T.defMode === "gunshift" ? T.gunShift[1] : T.shiftY), set: (v) => { v = clamp(v, -1, 1); if (T.defMode === "gunshift") T.gunShift[1] = v; else T.shiftY = v; }, text: "SHIFT X와 같지만 앞뒤(Y) 방향입니다. 광선도에서는 보이지 않고 스크린의 빔 위치만 움직입니다. G-SHIFT를 켜면 GUN SHIFT Y가 됩니다.", detail: () => "빔 이동(Y) " + num(O.shift[1]) + (T.defMode === "gunshift" ? " · 건 위치 오차 " + num(O.shiftErr) : "") },
  dmode: { panel: "L1", label: "DEF/STIG 기능", kind: "radio", opts: ["stig", "dark", "bright", "gunshift", "guntilt"], optLabel: (v) => ({ stig: "COND STIG", dark: "DARK TILT", bright: "BRIGHT TILT", gunshift: "GUN SHIFT", guntilt: "GUN TILT" })[v], toggle: true, get: () => T.defMode, set: (v) => { if (T.defMode === v) { T.defMode = ""; return; } T.defMode = v; if (v === "dark") T.tilt = clamp(tiltDark(), -1, 1); if (v === "bright") T.tilt = 0; }, text: "DEF/STIG 노브와 SHIFT 노브가 맡을 기능을 고릅니다. COND STIG = 응집렌즈 비점수차 보정, DARK TILT = 암시야용 빔 기울기를 메모리에서 호출, BRIGHT TILT = 기울기 0(명시야), GUN SHIFT = SHIFT 노브가 건 편향코일 조절, GUN TILT = DEF/STIG 노브가 건 기울기 조절. 같은 버튼을 다시 누르면 해제됩니다.", detail: () => (T.defMode ? ({ stig: "COND STIG: 빔 스팟 비점 오차 " + num(O.astig) + " (0이면 둥글다)", dark: "DARK TILT: 빔 기울기 " + num(T.tilt) + " (회절빔이 축 위로 오는 값 " + num(tiltDark()) + ")", bright: "BRIGHT TILT: 빔 기울기 " + num(T.tilt), gunshift: "GUN SHIFT: SHIFT 노브 = 건 위치 · 오차 " + num(O.shiftErr), guntilt: "GUN TILT: DEF/STIG 노브 = 건 기울기 · 오차 " + num(O.gunErr) })[T.defMode] : "선택된 기능 없음 — DEF/STIG 노브는 아무것도 바꾸지 않습니다") },
  defx: { panel: "L1", label: "DEF/STIG X", ...defKnob(0), text: "선택한 기능의 X 전류. COND STIG에서는 빔 스팟이 둥글어질 때까지, DARK TILT에서는 빔 기울기를, GUN TILT에서는 전자총 빔 기울기를 조절합니다.", textNow: () => (T.defMode === "guntilt" ? "GUN TILT: 전자총 편향코일 2로 빔을 기울여 CL 조리개 중심으로 보냅니다. 맞으면 빔 전류(밝기)가 최대가 되고, 틀어지면 빔이 급격히 어두워집니다." : null), detail: () => (T.defMode === "stig" ? "비점 오차 " + num(O.astig) : T.defMode === "guntilt" ? "건 기울기 오차 " + num(O.gunErr) + " (0이면 정렬) · 빔 전류 " + num(O.current * 100, 1) + "%" : T.defMode ? "기울기 " + num(T.tilt) : "먼저 DEF/STIG 기능을 선택하세요") },
  defy: { panel: "R1", label: "DEF/STIG Y", ...defKnob(1), text: "선택한 기능의 Y 전류. COND STIG에서 X와 함께 써서 빔 스팟을 둥글게, GUN TILT에서는 건 기울기 Y를 조절합니다.", detail: () => (T.defMode === "stig" ? "비점 오차 " + num(O.astig) : T.defMode === "guntilt" ? "건 기울기 오차 " + num(O.gunErr) + " · 빔 전류 " + num(O.current * 100, 1) + "%" : "COND STIG·GUN TILT에서만 동작합니다") },
  htup: { panel: "L1", label: "HT ▲", kind: "mom", press: () => { const i = KV.indexOf(T.kV); T.kV = KV[Math.min(KV.length - 1, i + 1)]; }, text: "가속전압을 한 단계 올립니다(100·120·160·200 kV). 전압이 높을수록 전자 파장 λ가 짧아지고 회절 고리 반경이 줄어듭니다.", detail: () => T.kV + " kV · λ " + num(O.lam, 3) + " pm · 2θ(111) " + num(O.twoTheta * 1000, 1) + " mrad" },
  htdn: { panel: "L1", label: "HT ▼", kind: "mom", press: () => { const i = KV.indexOf(T.kV); T.kV = KV[Math.max(0, i - 1)]; }, text: "가속전압을 한 단계 내립니다.", detail: () => T.kV + " kV · λ " + num(O.lam, 3) + " pm" },
  wobi: { panel: "R1", label: "IMAGE WOBB X", kind: "sw", get: () => T.wobImg, set: (v) => { T.wobImg = v ? 1 : 0; }, text: "초점 맞추기용. 빔을 주기적으로 기울이면 초점이 어긋난 상은 좌우로 흔들리고, 초점이 맞으면 흔들림이 멈춥니다.", detail: () => "상면 어긋남 " + num(O.defocus) + " → 흔들림 폭 " + num(Math.abs(O.defocus) * 2.2) },
  wobht: { panel: "R1", label: "HT WOBB", kind: "sw", get: () => T.wobHT, set: (v) => { T.wobHT = v ? 1 : 0; }, text: "가속전압이 주기적으로 흔들리면 렌즈 초점(색수차)이 맥동하고 λ도 변합니다. 전압축 정렬에 쓰입니다.", detail: () => "ΔV/V ≈ ±1.2% → λ " + num(O.lam, 3) + " pm" },
  fn: { panel: "R1", label: "기능 스위치", kind: "radio", opts: ["mag1", "lowmag", "samag", "sadiff"], optLabel: (v) => FN[v], get: () => T.fn, set: (v) => { T.fn = v; }, text: "MAG1 = 일반 배율 · LOW MAG = 대물렌즈를 약하게 해 저배율 · SA MAG = 제한시야(SA) 조리개를 넣은 배율 · SA DIFF = 중간렌즈가 뒷초점면을 보게 해 회절 패턴을 스크린에 투영.", detail: () => (T.fn === "sadiff" ? "회절 모드 · 고리 반경(111) " + num(O.ringR[0], 1) : "상 모드 · ×" + num(O.Mimg, 1)) + " · " + HEAD[O.field] },
  mag: { panel: "R1", label: "MAG / CAM L", kind: "knob", min: 0, max: 1, step: 0.01, get: () => T.mag, set: (v) => { T.mag = clamp(v, 0, 1); }, text: "MAG 모드에서는 배율, SA DIFF에서는 카메라 길이를 바꿉니다(중간·투사렌즈 세기). 시계 방향 = 배율·카메라 길이 증가.", detail: () => (T.fn === "sadiff" ? "카메라 길이 배율 ×" + num(O.camScale, 1) + " · (111) 고리 반경 " + num(O.ringR[0], 1) : "배율 ×" + num(O.Mimg, 1)) },
  obj: { panel: "R1", label: "OBJ FOCUS", kind: "knob", min: -1, max: 1, step: 0.01, get: () => T.objFocus, set: (v) => { T.objFocus = clamp(v, -1, 1); }, text: "대물렌즈 전류. 상이 맺히는 위치가 중간렌즈의 물체면과 어긋나면 스크린 상이 흐려집니다. 초점이 맞는 지점(0)을 찾으세요.", detail: () => "상면 어긋남 δ = " + num(O.defocus) + (Math.abs(O.defocus) < 0.06 ? " · 초점 맞음" : " · 흐림") },
  diff: { panel: "R1", label: "DIFF FOCUS", kind: "knob", min: -1, max: 1, step: 0.01, get: () => T.diffFocus, set: (v) => { T.diffFocus = clamp(v, -1, 1); }, text: "회절 모드에서 회절 스팟의 초점. 어긋나면 스팟과 고리가 번집니다. SA DIFF에서 돌려 보세요.", detail: () => "스팟 번짐 반경 " + num(O.diffBlur) + (O.diffBlur < 0.1 ? " · 초점 맞음" : "") },
  std: { panel: "R1", label: "STD FOCUS", kind: "mom", press: () => { T.objFocus = 0; }, text: "대물렌즈 전류를 기준값으로 되돌립니다. 먼저 Z 높이로 대략 초점을 맞춘 뒤 누르는 순서입니다.", detail: () => "OBJ FOCUS = 0 · 상면 어긋남 δ = " + num(O.defocus) },
  zup: { panel: "R1", label: "Z ▲", kind: "mom", press: () => { T.dz = clamp(T.dz + 0.1, -1, 1); }, text: "시료를 위로 올립니다. 시료가 대물렌즈 물체면에서 벗어나면 초점이 어긋나므로 Z로 거친 초점, OBJ FOCUS로 미세 초점을 맞춥니다.", detail: () => "시료 높이 " + num(T.dz) + " · δ = " + num(O.defocus) },
  zdn: { panel: "R1", label: "Z ▼", kind: "mom", press: () => { T.dz = clamp(T.dz - 0.1, -1, 1); }, text: "시료를 아래로 내립니다.", detail: () => "시료 높이 " + num(T.dz) + " · δ = " + num(O.defocus) },
};
const AFFECT = {
  beam: ["gun"], probe: ["c1", "c2", "cm", "apCL"], cl: ["apCL"], ol: ["apOL"], olx: ["apOL"], alpha: ["cm", "apCL"], spot: ["c1"], bright: ["c2"],
  htup: ["gun", "hv"], htdn: ["gun", "hv"], wobi: ["cla"], wobht: ["gun", "hv", "obj"], fn: ["int", "proj", "obj", "apOL", "screen"], mag: ["int", "proj"],
  obj: ["obj", "spec"], diff: ["int"], std: ["obj"], zup: ["spec", "obj"], zdn: ["spec", "obj"],
};
const affected = (id) => {
  if (id === "shx" || id === "shy") return T.defMode === "gunshift" ? ["gdef"] : ["cla"];
  if (id === "defx" || id === "defy") return { stig: ["c2"], dark: ["cla"], bright: ["cla"], guntilt: ["gdef"] }[T.defMode] || [];
  if (id === "dmode") return { stig: ["c2"], dark: ["cla", "apOL"], bright: ["cla"], gunshift: ["gdef"], guntilt: ["gdef"] }[T.defMode] || [];
  return AFFECT[id] || [];
};
const ORDER = {
  L1: ["beam", "probe", "cl", "ol", "olx", "alpha", "spot", "bright", "shx", ["dmode"], "defx", "defy", "htup", "htdn"],
  R1: ["fn", "mag", "obj", "diff", "shy", "wobi", "wobht", "std", "zup", "zdn"],
};
const isOn = (id, v) => { const c = CTL[id]; if (c.kind === "radio") return String(c.get()) === String(v); if (c.kind === "sw") return !!c.get(); return false; };
const norm = (id) => { const c = CTL[id]; return (c.get() - c.min) / (c.max - c.min); };

// ---------------------------------------------------------------- DOM mirror of the panels
const doms = [];
let focusUntil = 0, focusTimer = 0, focusKey = "";
function choose(id) {
  selected = id; focusUntil = performance.now() + 4500;
  clearTimeout(focusTimer); focusTimer = setTimeout(() => { focusUntil = 0; run(); }, 4600);
}
function build() {
  for (const panel of ["L1", "R1"]) {
    const sec = document.createElement("div");
    sec.className = "tem-panel";
    sec.innerHTML = '<h3>' + (panel === "L1" ? "L1 패널 · 빔·조리개" : "R1 패널 · 상·초점·모드") + "</h3>";
    const buttons = [];
    for (const id of ORDER[panel].flat()) {
      const c = CTL[id];
      if (c.kind === "knob") {
        const row = document.createElement("label");
        row.className = "tem-row";
        row.innerHTML = "<span>" + c.label + '</span><input type="range" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" data-c="' + id + '"><output></output>';
        sec.appendChild(row);
        doms.push({ id, input: row.querySelector("input"), out: row.querySelector("output"), el: row });
      } else if (c.kind === "radio") {
        const row = document.createElement("div");
        row.className = "tem-group";
        row.innerHTML = "<span>" + c.label + "</span>" + c.opts.map((v) => '<button type="button" class="tem-btn" data-c="' + id + '" data-v="' + v + '">' + (c.optLabel ? c.optLabel(v) : v) + "</button>").join("");
        sec.appendChild(row);
        row.querySelectorAll("button").forEach((b) => doms.push({ id, v: b.dataset.v, btn: b, el: b }));
      } else {
        buttons.push(id);
      }
    }
    if (buttons.length) {
      const row = document.createElement("div");
      row.className = "tem-group";
      row.innerHTML = "<span>스위치</span>" + buttons.map((id) => '<button type="button" class="tem-btn" data-c="' + id + '">' + CTL[id].label + "</button>").join("");
      sec.appendChild(row);
      row.querySelectorAll("button").forEach((b) => doms.push({ id: b.dataset.c, btn: b, el: b }));
    }
    gridEl.appendChild(sec);
  }
}
build();

function userTouched() { touring = false; }
function press(id, v) {
  const c = CTL[id];
  userTouched();
  if (c.kind === "mom") c.press();
  else if (c.kind === "sw") c.set(!c.get());
  else if (c.kind === "radio") c.set(c.opts.find((o) => String(o) === String(v)) ?? v);
  choose(id); run();
}
function setKnob(id, value) { CTL[id].set(value); userTouched(); choose(id); run(); }
for (const d of doms) {
  if (d.input) d.input.addEventListener("input", () => setKnob(d.id, +d.input.value));
  if (d.btn) d.btn.addEventListener("click", () => press(d.id, d.v));
  const el = d.el;
  el.addEventListener("pointerenter", () => { choose(d.id); run(); });
  el.addEventListener("focusin", () => { choose(d.id); run(); });
}

// ---------------------------------------------------------------- pointer control on the drawn panels
let drag = null;
svg.addEventListener("pointerdown", (e) => {
  const g = e.target.closest(".tem-c");
  if (!g) return;
  const id = g.dataset.c, c = CTL[id];
  if (c.kind === "knob") {
    drag = { id, y: e.clientY, x: e.clientX, v: c.get(), range: c.max - c.min, step: c.step };
    svg.setPointerCapture?.(e.pointerId);
    choose(id); userTouched(); run();
  } else press(id, g.dataset.v);
  e.preventDefault();
});
svg.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dy = drag.y - e.clientY + (e.clientX - drag.x) * 0.5;
  const raw = drag.v + (dy / 160) * drag.range;
  setKnob(drag.id, drag.step >= 1 ? Math.round(raw) : raw);
});
svg.addEventListener("pointerup", () => { drag = null; });
svg.addEventListener("pointercancel", () => { drag = null; });
svg.addEventListener("pointerover", (e) => { const g = e.target.closest(".tem-c"); if (g) { choose(g.dataset.c); run(); } });
svg.addEventListener("wheel", (e) => {
  const g = e.target.closest(".tem-c");
  if (!g || CTL[g.dataset.c].kind !== "knob") return;
  e.preventDefault();
  const c = CTL[g.dataset.c];
  setKnob(g.dataset.c, c.get() + (e.deltaY < 0 ? 1 : -1) * (c.step >= 1 ? 1 : c.range ? (c.max - c.min) / 30 : 0.03));
}, { passive: false });

// ---------------------------------------------------------------- drawing
const spPt = (u, v, z) => iso([E1[0] * u + E2[0] * v, E1[1] * u + E2[1] * v, z], P);
const blob = (cu, cv, ru, rv, rot, z, steps = 40) => {
  const pts = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI * 2, x = Math.cos(a) * ru, y = Math.sin(a) * rv; pts.push(fix(spPt(cu + x * c - y * s, cv + x * s + y * c, z))); }
  return "M" + pts.join("L") + "Z";
};
const SCREEN_Z = 8.2;
function drawPlates(o) {
  let out = "";
  const seg = (a, b, z, tone) => '<path class="iso-line" data-free data-tone="' + tone + '" style="stroke-width:1.8" d="' + rayPath([[z, a], [z, b]]) + '"/>';
  if (V.clIn > 0.5 && T.clAp > 0) { const r = V.clR * (0.3 + 0.7 * V.alpha) * 0 + V.clR; out += seg(-9, -r, Z.clAp, "hi") + seg(r, 9, Z.clAp, "hi"); }
  if (!o.olOut && V.olIn > 0.5 && T.olAp > 0) { const y = V.olX * 2.2, r = V.olR; out += seg(-9, y - r, Z_BFP, "hi") + seg(y + r, 9, Z_BFP, "hi"); }
  return out;
}
function drawRays(o, mix) {
  const f = o.fil, st = clamp(Math.pow(o.current, 0.3), 0.22, 1), w = (0.55 + 0.9 * st).toFixed(2);
  const lit = (list, tone, op) => (list.length ? '<g opacity="' + (op * f * (0.4 + 0.6 * st)).toFixed(3) + '" style="stroke-width:' + w + '">' + list.map((r) => '<path class="iso-line" data-free data-tone="' + tone + '" style="stroke-width:' + w + '" d="' + rayPath(r) + '"/>').join("") + "</g>" : "");
  raysG.innerHTML = drawPlates(o) + lit(o.illum, "lit", 1) + lit(o.imageRays, "lit", 1 - mix) + lit(o.blocked, "faint", 1 - mix) + lit(o.diffRays.slice(2, 4), "lit", mix) + lit([...o.diffRays.slice(0, 2), ...o.diffRays.slice(4)], "hi", mix);
}
const smoothstep = smooth;
function drawScreen(o, mix) {
  const R = SCREEN_R, z = SCREEN_Z, f = o.fil;
  let img = "", dif = "";
  if (mix < 0.999 && o.field !== "dark") {
    const Mi = o.Mimg, cu = o.shift[0] * Mi + o.imgShift, cv = o.shift[1] * Mi;
    const Rill = Math.max(1.6, o.beamHalf * Mi);
    const ka = 0.95 * o.astig * (0.3 + 0.7 * o.defocusFactor), A = Rill * (1 + ka), B = Rill / (1 + ka);
    const cs = Math.cos(o.astigAngle), sn = Math.sin(o.astigAngle);
    const dens = o.density;
    const df = o.field === "df";
    img += '<path style="fill:var(--anatomy-green);fill-opacity:' + (df ? 0.03 : 0.05 + 0.2 * dens).toFixed(3) + ';stroke:none" d="' + blob(cu, cv, A, B, o.astigAngle, z) + '"/>';
    img += '<path class="iso-line" data-tone="green" data-free style="opacity:' + (0.35 + 0.65 * dens).toFixed(2) + '" d="' + blob(cu, cv, A, B, o.astigAngle, z) + '"/>';
    const fr = smoothstep(16, 30, Mi) * (df ? 0 : 1);
    PARTICLES.forEach(([x, y, r, ang], i) => {
      const px = x * Mi + o.imgShift, py = y * Mi, pr = r * Mi;
      const dx = px - cu, dy = py - cv, ex = (dx * cs + dy * sn) / A, ey = (-dx * sn + dy * cs) / B;
      const inside = 1 - smoothstep(0.82, 1.0, Math.hypot(ex, ey) + pr / Math.max(A, B) * 0.9);
      const edge = 1 - smoothstep(R - 4, R - 0.5, Math.hypot(px, py) + pr);
      const w = Math.min(inside, edge);
      if (w <= 0.02) return;
      let g = "";
      const lit = (df && ((i % 2 === 0) === (o.dfBeam > 0))) ? 1 : 0;
      if (df) {
        if (lit) g += '<path style="fill:var(--anatomy-green);fill-opacity:0.55;stroke:none" d="' + blob(px, py, pr, pr, 0, z, 28) + '"/><path class="iso-line" data-tone="hi" d="' + blob(px, py, pr, pr, 0, z, 28) + '"/>';
      } else {
        const c = o.field === "open" ? 0.35 : 0.5 + 0.5 * o.contrast;
        g += '<g opacity="' + c.toFixed(2) + '"><path class="iso-line" data-tone="hi" d="' + blob(px, py, pr, pr, 0, z, 28) + '"/></g>';
        if (fr > 0.02) {
          const step = Math.max(1.3, 0.09 * Mi), ca = Math.cos(ang), sa = Math.sin(ang);
          let d = "";
          for (let c2 = -pr + step * 0.6; c2 < pr - step * 0.3; c2 += step) {
            const hw = Math.sqrt(pr * pr - c2 * c2) * 0.97;
            d += "M" + fix(spPt(px + ca * c2 - sa * hw, py + sa * c2 + ca * hw, z)) + "L" + fix(spPt(px + ca * c2 + sa * hw, py + sa * c2 - ca * hw, z));
          }
          g += '<g opacity="' + (fr * c).toFixed(2) + '"><path class="iso-line" data-tone="lo" d="' + d + '"/></g>';
        }
      }
      if (g) img += '<g opacity="' + w.toFixed(2) + '">' + g + "</g>";
    });
    if (T.fn === "samag") img += '<path class="iso-line" data-tone="mid" data-free d="' + blob(0, 0, 9, 9, 0, z) + '"/>';
    const b = Math.min(7, o.imgBlur * 60);
    img = '<g style="filter:blur(' + b.toFixed(2) + 'px)">' + img + "</g>";
  }
  if (mix > 0.001) {
    const c = o.center, rd = Math.max(1.1, o.discR * 0.45);
    dif += '<path style="fill:var(--anatomy-green);fill-opacity:0.8;stroke:none" d="' + blob(c, 0, rd, rd, 0, z, 20) + '"/>';
    o.ringR.forEach((r, i) => {
      const fa = 1 - smoothstep(R - 3, R + 3, Math.abs(c) + r);
      if (fa <= 0.02) return;
      let spots = "";
      for (const ang of GRAINS[i]) { const p = [c + Math.cos(ang) * r, Math.sin(ang) * r]; spots += '<path style="fill:var(--anatomy-green);fill-opacity:0.75;stroke:none" d="' + blob(p[0], p[1], Math.max(0.9, o.discR * 0.3), Math.max(0.9, o.discR * 0.3), 0, z, 12) + '"/>'; }
      dif += '<g opacity="' + fa.toFixed(2) + '"><path class="iso-line" data-tone="mid" d="' + blob(c, 0, r, r, 0, z, 72) + '"/>' + spots + "</g>";
    });
    const b = Math.min(6, o.diffBlur * 1.1);
    dif = '<g style="filter:blur(' + b.toFixed(2) + 'px)">' + dif + "</g>";
  }
  screenG.innerHTML = '<g opacity="' + ((1 - mix) * f).toFixed(3) + '">' + img + "</g><g opacity=\"" + (mix * f).toFixed(3) + '">' + dif + "</g>";
}
function drawPanels() {
  for (const kb of KNOBS) {
    const c = CTL[kb.id], t = clamp(norm(kb.id), 0, 1), a = ((-135 + 270 * t) * Math.PI) / 180;
    const p0 = PW(kb.panel, kb.u + Math.sin(a) * 1.4, kb.v - Math.cos(a) * 1.4, kb.z), p1 = PW(kb.panel, kb.u + Math.sin(a) * kb.r * 0.86, kb.v - Math.cos(a) * kb.r * 0.86, kb.z);
    const el = svg.querySelector('[data-needle="' + kb.id + '"]');
    if (el) el.setAttribute("d", "M" + fix(iso(p0, P)) + "L" + fix(iso(p1, P)));
  }
  svg.querySelectorAll("[data-lamp]").forEach((el) => {
    const [id, v] = el.dataset.lamp.split(":");
    const on = CTL[id].kind === "radio" ? isOn(id, v) : CTL[id].kind === "sw" ? !!CTL[id].get() : id === "std" ? Math.abs(T.objFocus) < 0.001 : false;
    el.setAttribute("opacity", on ? "1" : "0.18");
  });
  svg.querySelectorAll(".tem-c").forEach((g) => {
    const on = selected === g.dataset.c;
    if (on) g.setAttribute("data-on", ""); else g.removeAttribute("data-on");
  });
  for (const d of doms) {
    if (d.input) { if (document.activeElement !== d.input) d.input.value = CTL[d.id].get(); d.out.textContent = CTL[d.id].step >= 1 ? String(CTL[d.id].get()) : num(CTL[d.id].get()); }
    if (d.btn) d.btn.setAttribute("aria-pressed", isOn(d.id, d.v) || (CTL[d.id].kind === "sw" && CTL[d.id].get()) ? "true" : "false");
    if (d.el && d.el.classList) d.el.style.opacity = d.id === selected ? "1" : "";
  }
}
const rod = (el, tipShift) => el.setAttribute("transform", translateAlong(P, [E1[0] * tipShift, E1[1] * tipShift, 0]));
function applyFocus(ids) {
  const key = ids.join(",");
  if (key === focusKey) return;
  focusKey = key;
  stage.toggleAttribute("data-focus", ids.length > 0);
  svg.querySelectorAll("[data-p],[data-for]").forEach((el) => el.toggleAttribute("data-hl", (el.dataset.p || el.dataset.for).split(" ").some((t) => ids.includes(t))));
}
// ---- the right-hand status board: lens excitation, coils, apertures, beam
const bar = (p) => clamp(p, 0, 1);
const logp = (k, lo, hi) => (Math.log(Math.max(k, 1e-6)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
const STATUS = [
  { sec: "빔", rows: [
    { id: "cur", label: "빔 전류", parts: ["gun", "c1", "apCL", "gdef"], v: () => ({ p: Math.pow(O.current, 0.35), t: num(O.current * 100, 1) + "%" }) },
    { id: "den", label: "시료 밝기", parts: ["c2"], v: () => ({ p: O.density, t: num(O.density * 100, 0) + "%" }) },
    { id: "spr", label: "프로브 크기", parts: ["c1"], v: () => ({ p: O.spotRel, t: num(O.spotRel, 2) }) },
  ] },
  { sec: "렌즈 전류(여자)", rows: [
    { id: "c1", label: "C1", parts: ["c1"], v: () => ({ p: (O.lensK.c1 - 0.07) / 0.13, t: num(O.lensK.c1 * 100, 1) }) },
    { id: "c2", label: "C2", parts: ["c2"], v: () => ({ p: (O.lensK.c2 - 0.045) / 0.035, t: num(O.lensK.c2 * 100, 1) }) },
    { id: "cm", label: "CM (α)", parts: ["cm"], v: () => ({ p: V.alpha, t: num(V.alpha * 100, 0) + "%" }) },
    { id: "obj", label: "OBJ", parts: ["obj"], v: () => ({ p: 0.5 + 0.5 * V.objFocus, t: (V.objFocus >= 0 ? "+" : "") + num(V.objFocus * 0.7, 2) + "%" }) },
    { id: "int", label: "INT", parts: ["int"], v: () => ({ p: (O.lensK.int - 0.04) / 0.075, t: num(O.lensK.int * 100, 1) }) },
    { id: "proj", label: "PROJ", parts: ["proj"], v: () => ({ p: logp(O.lensK.proj, 0.05, 0.55), t: num(O.lensK.proj * 100, 1) }) },
  ] },
  { sec: "코일·보정 (오차 0 = 정렬)", rows: [
    { id: "gs", label: "건 위치", parts: ["gdef"], v: () => ({ p: O.shiftErr / 1.5, t: num(O.shiftErr) }) },
    { id: "gt", label: "건 기울기", parts: ["gdef"], v: () => ({ p: O.gunErr / 1.2, t: num(O.gunErr) }) },
    { id: "bs", label: "빔 이동", parts: ["cla"], v: () => ({ p: Math.hypot(O.shift[0], O.shift[1]) / 3, t: num(Math.hypot(O.shift[0], O.shift[1])) }) },
    { id: "bt", label: "빔 기울기", parts: ["cla"], v: () => ({ p: Math.abs(V.tilt), t: num(V.tilt) }) },
    { id: "cs", label: "COND STIG", parts: ["c2"], v: () => ({ p: O.astig / 1.2, t: num(O.astig) }) },
  ] },
  { sec: "조리개", text: true, rows: [
    { id: "acl", label: "CL", parts: ["apCL"], t: () => (T.clAp ? CL_AP[T.clAp].name + " 삽입" : "빠짐 (OPEN)") },
    { id: "aol", label: "OL", parts: ["apOL"], t: () => (O.olOut ? "자동으로 빠짐" : T.olAp ? OL_AP[T.olAp].name + " 삽입" : "빠짐 (OPEN)") },
    { id: "asa", label: "SA", parts: ["screen"], t: () => (T.fn === "samag" ? "삽입 (제한시야)" : "빠짐") },
  ] },
];
const statusEl = document.querySelector("[data-status]");
const statusRows = {};
for (const sec of STATUS) {
  const box = document.createElement("div");
  box.className = "tem-sec";
  box.innerHTML = "<h4>" + sec.sec + "</h4>";
  for (const r of sec.rows) {
    const row = document.createElement("div");
    row.className = "tem-stat";
    row.innerHTML = r.t ? "<span>" + r.label + "</span><em></em>" : "<span>" + r.label + '</span><i><b></b></i><em></em>';
    if (r.t) row.setAttribute("data-text", "");
    box.appendChild(row);
    statusRows[r.id] = { row, fill: row.querySelector("b"), val: row.querySelector("em"), def: r, last: null, hot: 0 };
  }
  statusEl.appendChild(box);
}
function drawStatus(now, aff) {
  for (const id in statusRows) {
    const r = statusRows[id], d = r.def;
    const hl = d.parts.some((p) => aff.includes(p));
    r.row.toggleAttribute("data-hl", hl);
    if (d.t) { const t = d.t(); if (r.val.textContent !== t) r.val.textContent = t; continue; }
    const v = d.v(), p = bar(v.p);
    if (r.last !== null && Math.abs(p - r.last) > 0.004) r.hot = now + 700;
    r.last = p;
    r.fill.style.width = (p * 100).toFixed(1) + "%";
    if (r.val.textContent !== v.t) r.val.textContent = v.t;
    r.row.toggleAttribute("data-hot", now < r.hot);
  }
}
function draw(time) {
  O = optics(V, time);
  drawRays(O, V.mix);
  drawScreen(O, V.mix);
  rod(apCL, -46 * (1 - V.clIn));
  rod(apOL, -46 * (1 - V.olIn) + V.olX * 2.2);
  filG.setAttribute("opacity", (0.25 + 0.75 * V.fil).toFixed(2));
  drawPanels();
  const c = CTL[selected];
  const now = performance.now(), on = now < focusUntil;
  const aff = affected(selected);
  applyFocus(on ? aff : []);
  drawStatus(now, on ? aff : []);
  const html = "<b>" + (c.labelNow ? c.labelNow() : c.label) + '</b> <span class="num">' + (c.detail ? c.detail() : "") + "</span><br>" + ((c.textNow && c.textNow()) || c.text) + (aff.length ? '<br><span class="aff">바뀌는 부분 → ' + aff.map((p) => PART_NAME[p] || p).join(" · ") + "</span>" : "");
  if (infoEl.dataset.k !== html) { infoEl.innerHTML = html; infoEl.dataset.k = html; }
  const mode = T.fn === "sadiff" ? "SA DIFF · 카메라 길이 ×" + num(O.camScale, 1) : FN[T.fn] + " · ×" + num(O.Mimg, 1);
  const text = (O.on ? mode + (T.fn === "sadiff" ? " · 회절 패턴" : " · " + HEAD[O.field]) : "빔 OFF") + " · " + T.kV + " kV · λ " + num(O.lam, 2) + " pm";
  if (readout.textContent !== text) readout.textContent = text;
}
function stepState(dt) {
  const calm = still.matches;
  if (touring) { clock += dt; T.bright = 0.5 + 0.45 * Math.sin(clock * 0.7 - 1.0); }
  for (const key of Object.keys(EASE)) {
    const goal = key === "clR" ? CL_AP[T.clAp].r : key === "olR" ? OL_AP[T.olAp].r : T[key];
    V[key] += (goal - V[key]) * (calm ? 1 : 1 - Math.exp(-dt / EASE[key]));
    if (Math.abs(goal - V[key]) < 0.0008) V[key] = goal;
  }
  for (const i of [0, 1]) { V.stig[i] += (T.stig[i] - V.stig[i]) * (calm ? 1 : 1 - Math.exp(-dt / 0.2)); }
  const mixGoal = T.fn === "sadiff" ? 1 : 0;
  V.mix += (mixGoal - V.mix) * (calm ? 1 : 1 - Math.exp(-dt / 0.35));
  if (Math.abs(mixGoal - V.mix) < 0.002) V.mix = mixGoal;
  const olOutGoal = T.fn === "sadiff" || T.fn === "lowmag" || T.olAp === 0 ? 0 : 1;
  V.olIn += (olOutGoal - V.olIn) * (calm ? 1 : 1 - Math.exp(-dt / 0.3));
  V.clIn += ((T.clAp > 0 ? 1 : 0) - V.clIn) * (calm ? 1 : 1 - Math.exp(-dt / 0.3));
  for (const key of ["clAp", "olAp", "fn", "probe", "wobImg", "wobHT", "defMode"]) V[key] = T[key];
}
const settled = () => !touring && !T.wobImg && !T.wobHT && Object.keys(EASE).every((key) => { const goal = key === "clR" ? CL_AP[T.clAp].r : key === "olR" ? OL_AP[T.olAp].r : T[key]; return V[key] === goal; }) && V.mix === (T.fn === "sadiff" ? 1 : 0) && V.stig[0] === T.stig[0] && V.stig[1] === T.stig[1] && V.olIn === (T.fn === "sadiff" || T.fn === "lowmag" || T.olAp === 0 ? 0 : 1) && V.clIn === (T.clAp > 0 ? 1 : 0);
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  stepState(dt);
  draw((now - t0) / 1000);
  frame = visible && !settled() ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "160px 0px" }).observe(stage);
V.clR = CL_AP[T.clAp].r; V.olR = OL_AP[T.olAp].r;
stepState(0); draw(0);
