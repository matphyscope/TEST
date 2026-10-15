import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SKILL = "/root/.claude/skills/anatomy";
const k = await import(`${SKILL}/kit/iso-kit.mjs`);
const G = await import(`${SKILL}/kit/lathe.mjs`);
const { kitScript } = await import(`${SKILL}/scripts/inline-kit.mjs`);
const M = await import("./model.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 980, HEIGHT = 840;
const { Z } = M;
const AZ = 42;

// ---- screen-aligned floor frame: e1 runs across the screen, e2 toward the viewer
const VA = (AZ * Math.PI) / 180;
const E2 = [Math.cos(VA), Math.sin(VA)];
const probe = k.fitProjection([[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]], 200, 200, { azimuth: AZ });
const E1 = k.iso([E2[1] * -1, E2[0], 0], probe)[0] > k.iso([0, 0, 0], probe)[0] ? [-E2[1], E2[0]] : [E2[1], -E2[0]];
const W = (u, v, z = 0) => [E1[0] * u + E2[0] * v, E1[1] * u + E2[1] * v, z];

// ---- layout of everything standing on the base
const PS = 1.4;
const PANEL_W = 104 * PS, PANEL_D = 62 * PS, PANEL_H = 14;
const PANEL_AT = { L: [-78, 78], R: [78, 78] };
const PUMP_AT = [-100, -38], DEWAR_AT = [34, -52];
const floorPts = [];
for (const [cu, cv] of Object.values(PANEL_AT)) for (const du of [-1, 1]) for (const dv of [-1, 1]) floorPts.push(W(cu + (du * PANEL_W) / 2, cv + (dv * PANEL_D) / 2));
for (const du of [-1, 1]) for (const dv of [-1, 1]) floorPts.push(W(PUMP_AT[0] + du * 22, PUMP_AT[1] + dv * 24), W(DEWAR_AT[0] + du * 17, DEWAR_AT[1] + dv * 17), W(du * 50, dv * 50));
const dotE = (p, e) => p[0] * e[0] + p[1] * e[1];
const M2 = 14;
const BU = [Math.min(...floorPts.map((p) => dotE(p, E1))) - M2, Math.max(...floorPts.map((p) => dotE(p, E1))) + M2];
const BV = [Math.min(...floorPts.map((p) => dotE(p, E2))) - M2, Math.max(...floorPts.map((p) => dotE(p, E2))) + M2];
const BASE_RING = [[BU[0], BV[0]], [BU[1], BV[0]], [BU[1], BV[1]], [BU[0], BV[1]]].map(([u, v]) => { const p = W(u, v); return [p[0], p[1]]; });
const PLATE = { x: Math.min(...BASE_RING.map((r) => r[0])), y: Math.min(...BASE_RING.map((r) => r[1])), w: 0, d: 0, r: 12 };
PLATE.w = Math.max(...BASE_RING.map((r) => r[0])) - PLATE.x; PLATE.d = Math.max(...BASE_RING.map((r) => r[1])) - PLATE.y;
const PLATE_H = 10, FOOT_H = 5, TOP = 394;
const P = k.fitProjection([...BASE_RING.flatMap(([x, y]) => [[x, y, -PLATE_H - FOOT_H], [x, y, 0]]), [0, 0, TOP], ...floorPts.map(([x, y]) => [x, y, 60])], WIDTH, HEIGHT, { pad: 26, azimuth: AZ });
const SC = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const [VX, VY] = k.towardViewer(P);

// ---- cut-away shells (annulus open toward the viewer)
const HALF = (72 * Math.PI) / 180;
function shell(rIn, rOut, z, h, { half = HALF, bevel = 0 } = {}) {
  const n = Math.max(14, Math.round(rOut / 1.2)), ring = [];
  for (let i = 0; i <= n; i++) { const a = VA + half + ((2 * Math.PI - 2 * half) * i) / n; ring.push([Math.cos(a) * rOut, Math.sin(a) * rOut]); }
  for (let i = n; i >= 0; i--) { const a = VA + half + ((2 * Math.PI - 2 * half) * i) / n; ring.push([Math.cos(a) * rIn, Math.sin(a) * rIn]); }
  return k.extrude(ring, z, h, P, { convex: false, bevel });
}
const cutPt = (r, z, sign) => { const a = VA + sign * HALF; return [Math.cos(a) * r, Math.sin(a) * r, z]; };
const windings = (rIn, rOut, z0, h, rows) => {
  let d = "";
  for (let i = 1; i <= rows; i++) { const z = z0 + (h * i) / (rows + 1); for (const sg of [-1, 1]) d += k.segment(cutPt(rIn, z, sg), cutPt(rOut, z, sg), P); }
  return d;
};
const part = (id, svg) => (id ? `<g class="tem-part" data-p="${id}">${svg}</g>` : svg);
function lens(z0, h, bore, { big = false, ro: roIn, id } = {}) {
  const out = [], ro = roIn ?? (big ? 40 : 30), plate = 3.4;
  out.push(S(shell(bore, ro, z0, plate, { bevel: 0.5 }), { tone: "mid" }));
  out.push(S(shell(ro - 3.2, ro, z0 + plate, h - 2 * plate), { tone: "mid", crease: "none" }));
  out.push(S(shell(bore + 5, ro - 3.2, z0 + plate, h - 2 * plate), { tone: "hi", crease: "lo" }));
  out.push(L(windings(bore + 5, ro - 3.2, z0 + plate, h - 2 * plate, 3), { tone: "lo" }));
  out.push(S(shell(bore, ro, z0 + h - plate, plate, { bevel: 0.5 }), { tone: "mid" }));
  out.push(S(shell(bore, bore + 3.4, z0 + h, 1.8, { bevel: 0.3 }), { tone: "lo" }));
  out.push(S(shell(bore, bore + 3.4, z0 - 1.8, 1.8), { tone: "lo" }));
  return part(id, out.join(""));
}
// a deflection or stigmator coil ring on the column
function coil(id, z0, h, rIn, rOut) {
  return part(id, S(shell(rIn, rOut, z0, h, { bevel: 0.3 }), { tone: "hi", crease: "lo" }));
}
const column = (rIn, rOut, z, h, tone = "mid") => S(shell(rIn, rOut, z, h), { tone, crease: "none" });
const flange = (r0, r1, z, tone = "mid") => S(shell(r0, r1, z, 2.6, { bevel: 0.4 }), { tone });

// ---- base, pump, chamber
function base() {
  const out = [];
  const foot = ([u, v]) => W(u, v);
  const feet = [[BU[0] + 20, BV[0] + 20], [BU[1] - 20, BV[0] + 20], [BU[1] - 20, BV[1] - 20], [BU[0] + 20, BV[1] - 20]].map(foot).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28), { tone: "mid" }));
  }
  out.push(S(k.extrude(BASE_RING, -PLATE_H, PLATE_H, P, { bevel: 1.6 }), { tone: "mid" }));
  const inset = [[BU[0] + 5, BV[0] + 5], [BU[1] - 5, BV[0] + 5], [BU[1] - 5, BV[1] - 5], [BU[0] + 5, BV[1] - 5]].map(([u, v]) => { const p = W(u, v); return [p[0], p[1]]; });
  out.push(L(k.onTop(inset, 0, P, true), { tone: "lo" }));
  const screws = [[BU[0] + 10, BV[0] + 10], [BU[1] - 10, BV[0] + 10], [BU[1] - 10, BV[1] - 10], [BU[0] + 10, BV[1] - 10]].map(foot);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}
const PC = W(...PUMP_AT);
const PUMP = { x: PC[0] - 20, y: PC[1] - 23, w: 40, d: 46, r: 4 };
function pump() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PUMP, 0, 4, P)}" style="filter:blur(4px)"/>`];
  const seams = [12, 22, 32, 42, 52, 62].map((z) => k.sideSeam(PUMP, z, P, 4)).join("");
  out.push(S(k.slabOf(PUMP, 0, 70, P, 4, 0.8), { tone: "mid", inner: L(seams, { tone: "faint" }) }));
  out.push(S(k.slabOf(k.insetPlan(PUMP, 3), 70, 5, P, 4, 0.5), { tone: "hi", crease: "lo" }));
  out.push(D(k.corners(PUMP, 5).map(([x, y]) => at([x, y, 75])), { size: 0.45 }));
  for (const dx of [12, 28]) { out.push(S(k.cylinder(PUMP.x + dx, PUMP.y + 23, 7, 75, 4, P, 24), { tone: "mid" })); out.push(L(k.knurl(PUMP.x + dx, PUMP.y + 23, 7, 75, 79, 24, P), { tone: "lo" })); }
  const c = [PUMP.x + PUMP.w / 2, PUMP.y + PUMP.d / 2], dx = -c[0], dy = -c[1], n = Math.hypot(dx, dy), dir = [dx / n, dy / n, 0], len = n - 46 - 22;
  const F = G.frameAlong([c[0] + dir[0] * 22, c[1] + dir[1] * 22, 36], dir);
  out.push(S(G.disc(0, len, 5.4, F, P), { tone: "mid" }), S(G.disc(len - 3, len, 8, F, P), { tone: "mid" }), S(G.disc(0, 3, 8, F, P), { tone: "mid" }));
  return out.join("");
}
// liquid-nitrogen dewar for the anti-contamination device, with a cold finger into the specimen area
function dewar() {
  const [cx, cy] = W(...DEWAR_AT), out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: cx - 15, y: cy - 15, w: 30, d: 30, r: 15 }, 0, 4, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.cylinder(cx, cy, 14, 0, 6, P, 40, 0.5), { tone: "lo" }));
  out.push(S(k.cylinder(cx, cy, 12.4, 6, 118, P, 48, 0.6), { tone: "mid" }));
  for (const z of [30, 60, 90]) out.push(L(k.sideArc(cx, cy, 12.4, z, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(cx, cy, 9, 124, 3, P, 32), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(cx, cy, 3.4, 127, 5, P, 20), { tone: "mid" }));
  const F = G.frameAlong([cx, cy, 150], [-E2[0], -E2[1], 0]);
  return out.join("");
}

function chamber() {
  const out = [];
  out.push(S(k.cylinder(0, 0, 46, 0.2, 6, P, 72, 0.6), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 43, 6.2, P, 72), { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 31, 6.2, 1.2, P, 56), { tone: "lo", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 29.5, 7.4, 0.8, P, 56), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(0, 0, 28, 8.2, P, 56), { tone: "faint" }));
  return out.join("");
}
function chamberWall() {
  const out = [], half = (66 * Math.PI) / 180;
  out.push(S(shell(42.5, 46, 6.2, 46, { half }), { tone: "mid", crease: "none" }));
  out.push(S(shell(18, 48, 52.2, 3.6, { half, bevel: 0.6 }), { tone: "mid" }));
  const bolts = Array.from({ length: 16 }, (_, i) => { const a = VA + (70 * Math.PI) / 180 + ((2 * Math.PI - (140 * Math.PI) / 180) * i) / 15; return at([Math.cos(a) * 42, Math.sin(a) * 42, 55.8]); });
  out.push(D(bolts, { size: 0.45 }));
  return out.join("");
}

// ---- side-entry rods
const horizontal = (u) => [E1[0] * u, E1[1] * u];
function rodFrame(zv, sign) { return G.frameAlong([0, 0, zv], [E1[0] * sign, E1[1] * sign, 0]); }
function holder() {
  const F = rodFrame(Z.spec, 1), out = [];
  out.push(S(G.disc(0, 4, 2.6, F, P), { tone: "hi" }), S(G.disc(4, 40, 2.1, F, P), { tone: "mid", crease: "none" }));
  out.push(S(G.disc(40, 44, 5.4, F, P), { tone: "mid" }), S(G.disc(44, 46, 5.9, F, P), { tone: "lo" }), S(G.disc(46, 60, 5.4, F, P), { tone: "mid" }), S(G.disc(60, 62, 5.9, F, P), { tone: "lo" }), S(G.disc(62, 66, 5.4, F, P), { tone: "mid" }));
  out.push(S(G.disc(66, 74, 7.4, F, P), { tone: "hi", crease: "lo" }), k.fadedSvg(G.ribsOf(F, 66, 74, 7.4, 24, P, { seams: true, fade: [0.04, 0.42] }), { tone: "lo" }));
  return out.join("");
}
function boss(zv, sign, r) {
  const F = G.frameAlong([E1[0] * sign * 12, E1[1] * sign * 12, zv], [E1[0] * sign, E1[1] * sign, 0]);
  return S(G.disc(0, 11, r, F, P), { tone: "mid" }) + S(G.disc(11, 14, r + 1.8, F, P), { tone: "lo" });
}
function apertureRod(zv, sign, r0, r1) {
  const F = rodFrame(zv, sign), out = [];
  out.push(S(G.disc(-2, 4, 3.4, F, P), { tone: "hi" }), S(G.disc(4, 60, 1.9, F, P), { tone: "mid", crease: "none" }));
  out.push(S(G.disc(60, 78, 5.2, F, P), { tone: "mid" }));
  out.push(S(G.disc(78, 80, 6.6, F, P), { tone: "hi", crease: "lo" }), S(G.disc(80, 82, 7.0, F, P), { tone: "mid" }), S(G.disc(82, 84, 6.6, F, P), { tone: "hi", crease: "lo" }));
  return out.join("");
}

// ---- gun
function gun() {
  const out = [], z0 = 282;
  out.push(column(9, 13, 278, 8), coil("gdef", 278.6, 3, 12.6, 19), coil("gdef", 282.4, 3, 12.6, 19));
  out.push(flange(9, 24, z0 + 4));
  out.push(S(shell(4, 22, z0 + 8, 4, { bevel: 0.4 }), { tone: "hi", crease: "lo" }));
  out.push(S(shell(0.1, 17, z0 + 14, 14, { bevel: 0.5 }), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 11, z0 + 28, 2, P, 40, 0.4), { tone: "lo" }));
  for (let i = 0; i < 6; i++) out.push(S(k.cylinder(0, 0, 13, z0 + 30 + i * 8, 6, P, 40, 0.3), { tone: i % 2 ? "hi" : "mid", crease: "lo" }));
  for (let i = 0; i < 6; i++) out.push(S(k.cylinder(0, 0, 9, z0 + 36 + i * 8, 2, P, 32), { tone: "lo", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 22, z0 + 78, 28, P, 56, 0.8), { tone: "mid" }));
  out.push(L(k.sideArc(0, 0, 22, z0 + 86, P, 28), { tone: "faint" }), L(k.sideArc(0, 0, 22, z0 + 98, P, 28), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 18, z0 + 106, 4, P, 48, 0.5), { tone: "hi", crease: "lo" }));
  out.push(D(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * 2 * Math.PI; return at([Math.cos(a) * 14, Math.sin(a) * 14, z0 + 110]); }), { size: 0.45 }));
  out.push(S(k.cylinder(0, 0, 4.6, z0 + 110, 6, P, 20), { tone: "mid" }));
  return part("gun hv", out.join(""));
}
const filament = () => {
  const z = Z.source, tip = at([0, 0, z]);
  const a = at(W(4, 0, z + 9)), b = at(W(-4, 0, z + 9));
  return L(`M${a[0]} ${a[1]}L${tip[0]} ${tip[1]}L${b[0]} ${b[1]}`, { tone: "hi" });
};

// ---- the column (z layout matches model.mjs)
const column1 = [
  column(18, 22, 56, 4), lens(58, 22, 18, { big: true, id: "proj" }), column(18, 22, 80, 16), lens(96, 20, 18, { ro: 34, id: "int" }),
  column(18, 22, 116, 28), flange(9, 26, 144), lens(146, 12, 9, { id: "obj" }),
].join("");
const column2 = [
  column(9, 13, 158, 30), flange(9, 22, 160), flange(9, 22, 186), lens(188, 18, 9, { id: "obj" }),
  column(9, 13, 206, 8), coil("cla cm", 206.2, 7.6, 12.6, 21),
  lens(214, 20, 9, { id: "c2" }), column(9, 13, 234, 24), flange(9, 20, 236), flange(9, 20, 242), coil("cla", 250, 5, 12.6, 21), lens(258, 20, 9, { id: "c1" }),
].join("");
const specimenGrid = () => part("spec", S(k.cylinder(0, 0, 3.4, Z.spec + 1.4, 1.2, P, 32), { tone: "hi", lit: true }) + L(k.ring(0, 0, 1.9, Z.spec + 2.9, P, 24), { tone: "lo" }));

// ---- control panels ------------------------------------------------------------------------
const PW = (panel, u, v, z) => { const [cu, cv] = PANEL_AT[panel]; return W(cu + u * PS, cv + v * PS, z); };
const TOPZ = PANEL_H;
const CONTROLS = []; // everything the live script has to know about
const KNOBS = [], LAMPS = [];
function panelBox(panel) {
  const [cu, cv] = PANEL_AT[panel], hw = PANEL_W / 2, hd = PANEL_D / 2;
  const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => { const p = W(cu + u, cv + v); return [p[0], p[1]]; });
  const out = [];
  const plan = { x: Math.min(...ring.map((r) => r[0])), y: Math.min(...ring.map((r) => r[1])), w: 0, d: 0, r: 0 };
  out.push(S(k.extrude(ring, 0, TOPZ, P, { bevel: 1 }), { tone: "mid" }));
  const inner = [[-hw + 4, -hd + 4], [hw - 4, -hd + 4], [hw - 4, hd - 4], [-hw + 4, hd - 4]].map(([u, v]) => { const p = W(cu + u, cv + v); return [p[0], p[1]]; });
  out.push(L(k.onTop(inner, TOPZ, P, true), { tone: "faint" }));
  out.push(D([[-hw + 2, -hd + 2], [hw - 2, -hd + 2], [hw - 2, hd - 2], [-hw + 2, hd - 2]].map(([u, v]) => at(PW(panel, u, v, TOPZ))), { size: 0.45 }));
  return out.join("");
}
const label = (panel, u, v, text, size0 = 2.6, anchor = "middle") => {
  const size = size0 * PS * 0.82;
  const [sx, sy] = at(PW(panel, u, v, TOPZ));
  return `<text class="iso-face-text" data-tone="mid" transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) scale(1 ${Math.sin((30 * Math.PI) / 180).toFixed(2)})" font-size="${(size * SC).toFixed(1)}" text-anchor="${anchor}">${text}</text>`;
};
const hit = (panel, u, v, r) => { const [sx, sy] = at(PW(panel, u, v, TOPZ + 2)); return `<ellipse class="tem-hit" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${(r * PS * SC).toFixed(1)}" ry="${(r * PS * SC * 0.8).toFixed(1)}"/>`; };
const rect = (panel, u, v, hw, hd) => [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => { const p = PW(panel, u + a, v + b, 0); return [p[0], p[1]]; });

function button(panel, id, value, u, v, name) {
  const out = [];
  out.push(S(k.extrude(rect(panel, u, v, 3.3, 2.4), TOPZ, 1.8, P, { bevel: 0.3 }), { tone: "hi", crease: "lo" }));
  const lamp = at(PW(panel, u, v, TOPZ + 1.9));
  LAMPS.push({ id, value, at: PW(panel, u, v, TOPZ + 1.9) });
  out.push(`<circle class="iso-wire-end tem-lamp" data-lamp="${id}:${value}" cx="${lamp[0].toFixed(1)}" cy="${lamp[1].toFixed(1)}" r="1.6" opacity="0.18"/>`);
  return `<g class="tem-c" data-c="${id}" data-v="${value}" tabindex="-1" aria-hidden="true">${out.join("")}${hit(panel, u, v, 4.6)}</g>`;
}
function knob(panel, id, u, v, r, name, ticks = 11) {
  const out = [], zc = TOPZ;
  const [cx, cy] = PW(panel, u, v), R = r * PS;
  out.push(S(k.cylinder(cx, cy, R + 2.4, zc, 1.4, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(cx, cy, R, zc + 1.4, 5, P, 40, 0.5), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(cx, cy, R, zc + 1.4, zc + 6.4, Math.round(R * 7), P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(cx, cy, R * 0.72, zc + 6.4, P, 36), { tone: "faint" }));
  // tick scale, 270 degrees, drawn flat on the panel
  let minor = "", major = "";
  for (let i = 0; i < ticks; i++) {
    const t = i / (ticks - 1), a = ((-135 + 270 * t) * Math.PI) / 180, s0 = r + 2.0, s1 = r + (i % 5 === 0 || i === ticks - 1 ? 4.2 : 3.2);
    const p0 = PW(panel, u + Math.sin(a) * s0, v - Math.cos(a) * s0, zc + 1.4), p1 = PW(panel, u + Math.sin(a) * s1, v - Math.cos(a) * s1, zc + 1.4);
    const seg = k.segment(p0, p1, P);
    if (i % 5 === 0 || i === ticks - 1) major += seg; else minor += seg;
  }
  out.push(L(minor, { tone: "lo" }), L(major, { tone: "mid" }));
  out.push(`<path class="iso-line tem-needle" data-needle="${id}" data-tone="lit" data-free="start" style="stroke-width:1.2" d=""/>`);
  KNOBS.push({ id, panel, u, v, r, z: zc + 6.4 });
  out.push(label(panel, u, v + r + 5.8, name, 2.7));
  return `<g class="tem-c" data-c="${id}" tabindex="-1" aria-hidden="true">${out.join("")}${hit(panel, u, v, r + 4)}</g>`;
}
const caption = (panel, u, v, text) => label(panel, u, v, text, 2.3, "start");

const R1V = -24, R2V = -8, R3V = 12;   // local rows: top buttons, aperture buttons, knobs
function panelL() {
  const out = [panelBox("L")];
  out.push(button("L", "beam", 1, -45, R1V), label("L", -45, R1V + 5.6, "BEAM", 2.1));
  ["TEM", "EDS", "NBD", "CBD"].forEach((n, i) => out.push(button("L", "probe", n, -32 + i * 9, R1V), label("L", -32 + i * 9, R1V + 5.6, n, 2.1)));
  [["stig", "C-STIG"], ["dark", "DK.TILT"], ["bright", "BR.TILT"], ["gunshift", "G-SHIFT"], ["guntilt", "G-TILT"]].forEach(([id, n], i) => out.push(button("L", "dmode", id, 7 + i * 10, R1V), label("L", 7 + i * 10, R1V + 5.6, n, 1.9)));
  out.push(caption("L", -44, R2V - 5.6, "CL AP"), caption("L", 1, R2V - 5.6, "OL AP"));
  ["O", "1", "2", "3", "4"].forEach((n, i) => out.push(button("L", "cl", i, -40 + i * 8, R2V), label("L", -40 + i * 8, R2V + 5.6, n, 2.2)));
  ["O", "1", "2", "3", "4"].forEach((n, i) => out.push(button("L", "ol", i, 5 + i * 8, R2V), label("L", 5 + i * 8, R2V + 5.6, n, 2.2)));
  out.push(knob("L", "olx", 46.5, R2V, 2.4, "", 5));
  out.push(knob("L", "alpha", -38, R3V, 4.2, "α"), knob("L", "spot", -19, R3V, 4.2, "SPOT", 5), knob("L", "bright", 3, R3V, 6.4, "BRIGHTNESS"), knob("L", "shx", 26, R3V, 4.2, "SHIFT X"), knob("L", "defx", 42, R3V, 4.2, "DEF/STIG X"));
  return out.join("");
}
function panelR() {
  const out = [panelBox("R")];
  out.push(button("R", "wobi", 1, -42, R1V), label("R", -42, R1V + 5.6, "IMG WOBB", 2.0), button("R", "wobht", 1, -31, R1V), label("R", -31, R1V + 5.6, "HT WOBB", 2.0));
  out.push(button("R", "htup", 1, -17, R1V), label("R", -17, R1V + 5.6, "HT ▲", 2.2), button("R", "htdn", 1, -7, R1V), label("R", -7, R1V + 5.6, "HT ▼", 2.2));
  [["mag1", "MAG1"], ["lowmag", "LOW"], ["samag", "SA MAG"], ["sadiff", "SA DIFF"]].forEach(([id, n], i) => out.push(button("R", "fn", id, 8 + i * 11, R1V), label("R", 8 + i * 11, R1V + 5.6, n, 2.0)));
  out.push(button("R", "std", 1, -42, R2V), label("R", -42, R2V + 5.6, "STD FOCUS", 2.0), button("R", "zup", 1, -28, R2V), label("R", -28, R2V + 5.6, "Z ▲", 2.2), button("R", "zdn", 1, -18, R2V), label("R", -18, R2V + 5.6, "Z ▼", 2.2));
  out.push(knob("R", "shy", -40, R3V, 4, "SHIFT Y"), knob("R", "defy", -23, R3V, 4, "DEF/STIG Y"), knob("R", "mag", -1, R3V, 6.4, "MAG / CAM L"), knob("R", "obj", 23, R3V, 5.4, "OBJ FOCUS"), knob("R", "diff", 41, R3V, 4.6, "DIFF FOCUS"));
  return out.join("");
}

// ---- name tags that appear next to the parts a control touches
const tag = (ids, text, u, z, anchor = "start") => { const [sx, sy] = at(W(u, 0, z)); return `<text class="tem-tag" data-for="${ids}" x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" text-anchor="${anchor}">${text}</text>`; };
const TAGS = [
  tag("gun", "전자총 (HT·필라멘트)", 28, 372), tag("gdef", "건 편향코일 (GUN SHIFT/TILT)", 26, 288),
  tag("c1", "C1 응집렌즈 (SPOT SIZE)", 46, 268), tag("cm", "CM 미니렌즈 (α)", 36, 210), tag("cla", "빔 편향코일 (SHIFT·TILT)", 30, 253), tag("c2", "C2 응집렌즈 (BRIGHTNESS)", 44, 224),
  tag("apCL", "CL 조리개", -34, 250, "end"), tag("obj", "대물렌즈 (OBJ FOCUS)", 44, 197), tag("spec", "시료 · 홀더 (Z)", 80, 192),
  tag("apOL", "OL 조리개", -34, 178, "end"), tag("int", "중간렌즈", 44, 106), tag("proj", "투사렌즈", 52, 69), tag("screen", "형광 스크린", 58, 26),
];

// ---- assembly (painter's order, bottom to top, back to front)
const body = [
  base(),
  pump(), dewar(),
  part("screen", chamber()), chamberWall(),
  column1, column2,
  boss(Z.spec, 1, 8.6), boss(M.Z_BFP, -1, 7.6), boss(238, -1, 7.6),
  `<g class="tem-part" data-p="spec" data-part="holder">${holder()}</g>`,
  gun(), specimenGrid(),
  `<g class="tem-part" data-p="apCL" data-part="apCL">${apertureRod(238, -1)}</g>`,
  `<g class="tem-part" data-p="apOL" data-part="apOL">${apertureRod(M.Z_BFP, -1)}</g>`,
  `<g data-part="filament">${filament()}</g>`,
  `<g data-part="screen"></g>`,
  `<g data-part="rays"></g>`,
  panelL(), panelR(),
  ...TAGS,
];
const label_ = "A JEOL 2100 style transmission electron microscope as a cut-away column with its left and right control panels. Each knob and button on the panels changes the lenses, apertures or deflection coils, and the electron beam drawn down the column and the image or diffraction pattern on the phosphor screen change with it.";
const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: label_, body });

// ---- live page ----------------------------------------------------------------------------
const modelSrc = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.js"), "utf8")
  .replace("/*MODEL*/", modelSrc)
  .replace("/*DATA*/", `const P = ${JSON.stringify(P)}; const E1 = ${JSON.stringify(E1)}, E2 = ${JSON.stringify(E2)}; const KNOBS = ${JSON.stringify(KNOBS)}; const PANEL_AT = ${JSON.stringify(PANEL_AT)}; const SC = ${SC}; const TOPZ = ${TOPZ}; const PS = ${PS};`);

const html = k.plateHtml({
  fig: "Fig 2",
  title: "JEOL 2100형 TEM · 컨트롤 패널",
  hint: "패널의 노브를 위아래로 드래그하거나 버튼을 누르세요",
  readout: "",
  keys: [
    { mark: "lit", label: "전자 빔 (광선)" },
    { mark: "edge", label: "조리개 판 (빔을 가림)" },
    { mark: "dim", label: "조리개에 막힌 회절빔" },
  ],
  caption: "L1(왼쪽)·R1(오른쪽) 패널의 컨트롤 이름과 동작은 JEOL 2100 TEM Operation Manual(globalsino.com/EM/page30.html)을 따릅니다. 렌즈 간격은 압축해 그렸고, 회절각·초점 흐림은 보이도록 과장했습니다. 조리개 크기, 격자·빔 파장, 렌즈 세기, 빔 전류 관계는 같은 모델에서 계산됩니다. 컨트롤을 만지면 영향을 받는 부분이 빛나고 이름표가 나타납니다.",
  body: `<div class="iso-stage tem-stage" role="application" aria-label="JEOL 2100형 투과전자현미경. 아래 컨트롤 목록의 슬라이더와 버튼으로도 조작할 수 있습니다.">${svg}</div>`,
});
const ui = `<section class="tem-ui" aria-label="컨트롤 패널 목록"><div class="tem-top"><div class="tem-info" data-info aria-live="polite"></div><div class="tem-board" data-status></div></div><div class="tem-grid" data-grid></div><p class="tem-try">해 보기 ① BRIGHTNESS로 빔을 가장 작게 모으고 SPOT SIZE를 바꿔 빔 전류(밝기)가 줄어드는 것 보기 ② COND STIG를 켜고 DEF/STIG X·Y로 빔 스팟을 둥글게 ③ G-SHIFT·G-TILT로 건을 정렬(빔 이동이 사라지고 전류가 최대가 되는 지점) ④ OBJ FOCUS·Z로 상을 선명하게 ⑤ DARK TILT로 암시야 상 ⑥ SA DIFF로 회절 패턴, 전압(HT)을 바꿔 λ 효과 보기</p></section>`;
const css = `
.tem-stage{touch-action:none}
.tem-c{cursor:pointer}.tem-hit{fill:transparent;stroke:none}
.tem-c:hover .tem-hit,.tem-c[data-on] .tem-hit{stroke:var(--anatomy-lit);stroke-width:.8;stroke-opacity:.55;fill:var(--anatomy-lit);fill-opacity:.06}
.tem-ui{margin-top:18px;display:grid;gap:14px;font-size:13px;line-height:1.5;color:var(--anatomy-text)}
.tem-info{min-height:5.4em;padding:12px 14px;border-radius:10px;background:var(--anatomy-card);box-shadow:var(--anatomy-lift)}
.tem-info b{color:var(--anatomy-strong)}.tem-info .num{font-family:var(--anatomy-mono);color:var(--anatomy-strong)}
.tem-grid{align-items:start;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.tem-panel{padding:12px 14px;border-radius:10px;background:var(--anatomy-card);box-shadow:var(--anatomy-lift);display:grid;gap:9px}
.tem-panel h3{margin:0;font:600 12px var(--anatomy-mono);letter-spacing:.04em;color:var(--anatomy-muted)}
.tem-row{display:grid;grid-template-columns:minmax(92px,.9fr) 2fr minmax(48px,.6fr);gap:8px;align-items:center}
.tem-row span{font:12px var(--anatomy-mono);color:var(--anatomy-strong)}.tem-row output{font:12px var(--anatomy-mono);text-align:right;color:var(--anatomy-muted)}
.tem-row input{width:100%;accent-color:var(--anatomy-lit)}
.tem-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.tem-group>span{font:12px var(--anatomy-mono);color:var(--anatomy-strong);margin-right:4px;min-width:92px}
.tem-btn{font:12px var(--anatomy-mono);padding:4px 9px;border-radius:6px;border:1px solid var(--anatomy-faint);background:transparent;color:var(--anatomy-text);cursor:pointer}
.tem-btn:hover{border-color:var(--anatomy-mid)}.tem-btn[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper);border-color:var(--anatomy-lit)}
.tem-try{margin:0;color:var(--anatomy-muted)}
.tem-top{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;align-items:start}
.tem-info .aff{color:var(--anatomy-strong)}
.tem-board{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;padding:12px 14px;border-radius:10px;background:var(--anatomy-card);box-shadow:var(--anatomy-lift)}
.tem-sec h4{margin:0 0 4px;font:600 11px var(--anatomy-mono);letter-spacing:.04em;color:var(--anatomy-muted)}
.tem-stat{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(40px,1fr) 52px;gap:6px;align-items:center;padding:1px 4px;border-radius:5px;font:11px var(--anatomy-mono);transition:background .25s}
.tem-stat span{color:var(--anatomy-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tem-stat i{display:block;height:5px;border-radius:3px;background:var(--anatomy-faint);overflow:hidden}.tem-stat b{display:block;height:100%;width:0;background:var(--anatomy-mid);transition:width .12s}
.tem-stat em{font-style:normal;text-align:right;color:var(--anatomy-strong)}
.tem-stat[data-hl]{background:color-mix(in srgb,var(--anatomy-green) 16%,transparent)}.tem-stat[data-hl] b{background:var(--anatomy-green)}
.tem-stat[data-hot] b{background:var(--anatomy-lit)}
.tem-stat[data-text]{grid-template-columns:36px minmax(0,1fr)}.tem-stat[data-text] em{text-align:left}
.tem-stage .tem-part,.tem-stage .tem-tag{transition:opacity .25s,filter .25s}
.tem-stage[data-focus] .tem-part:not([data-hl]){opacity:.34}
.tem-stage .tem-part[data-hl]{filter:drop-shadow(0 0 2.6px var(--anatomy-green))}
.tem-tag{font:600 10px var(--anatomy-mono);fill:var(--anatomy-strong);opacity:0;pointer-events:none;paint-order:stroke;stroke:var(--anatomy-paper);stroke-width:3px;stroke-linejoin:round}
.tem-tag[data-hl]{opacity:1}
@media (max-width:860px){.tem-top{grid-template-columns:1fr}.tem-board{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.tem-board{grid-template-columns:1fr}}
@media (max-width:560px){.tem-row{grid-template-columns:90px 1fr 44px}}
`;
const out = theme === "light" ? "jeol-tem-light.html" : "jeol-tem.html";
const page = k.pageHtml({ title: "JEOL TEM 컨트롤 패널", theme, body: html + ui, script: kitScript() + live, width: 980 }).replace("</style>", css + "</style>");
writeFileSync(join(HERE, out), page);
console.log("wrote", out, "plate", PLATE.w.toFixed(0), "x", PLATE.d.toFixed(0));
