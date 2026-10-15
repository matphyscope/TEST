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
const WIDTH = 640, HEIGHT = 760;
const { Z } = M;

const PLATE = { x: -100, y: -84, w: 204, d: 168, r: 10 };
const PLATE_H = 10, FOOT_H = 5;
const TOP = 392;
const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, TOP], [-40, -40, TOP - 20], [40, 40, 8]],
  WIDTH, HEIGHT, { pad: 30, azimuth: 42 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const [VX, VY] = k.towardViewer(P);
const VA = Math.atan2(VY, VX);
const SIDE = [-Math.sin(VA), Math.cos(VA)]; // horizontal on screen
const RIGHT = at([SIDE[0], SIDE[1], 0])[0] > at([0, 0, 0])[0] ? SIDE : [-SIDE[0], -SIDE[1]];

// ---- cut-away shells: an annulus open toward the viewer, so the axis and its beam stay in view
const HALF = (72 * Math.PI) / 180;
function shell(rIn, rOut, z, h, { half = HALF, bevel = 0 } = {}) {
  const n = Math.max(14, Math.round(rOut / 1.2));
  const ring = [];
  for (let i = 0; i <= n; i++) { const a = VA + half + ((2 * Math.PI - 2 * half) * i) / n; ring.push([Math.cos(a) * rOut, Math.sin(a) * rOut]); }
  for (let i = n; i >= 0; i--) { const a = VA + half + ((2 * Math.PI - 2 * half) * i) / n; ring.push([Math.cos(a) * rIn, Math.sin(a) * rIn]); }
  return k.extrude(ring, z, h, P, { convex: false, bevel });
}
const cutPts = (r, z, sign, half = HALF) => { const a = VA + sign * half; return [Math.cos(a) * r, Math.sin(a) * r, z]; };
// winding lines drawn on the two cut faces of a coil (they end on the face's own edges)
function windings(rIn, rOut, z0, h, rows) {
  let d = "";
  for (let i = 1; i <= rows; i++) {
    const z = z0 + (h * i) / (rows + 1);
    for (const sg of [-1, 1]) d += k.segment(cutPts(rIn, z, sg), cutPts(rOut, z, sg), P);
  }
  return d;
}

// ---- one electromagnetic lens (yoke, coil, pole pieces), cut away at the front
function lens(z0, h, bore, { name, big = false } = {}) {
  const out = [];
  const ro = big ? 36 : 30, plate = 3.4;
  out.push(S(shell(bore, ro, z0, plate, { bevel: 0.5 }), { tone: "mid" }));
  out.push(S(shell(ro - 3.2, ro, z0 + plate, h - 2 * plate), { tone: "mid", crease: "none" }));
  out.push(S(shell(bore + 5, ro - 3.2, z0 + plate, h - 2 * plate), { tone: "hi", crease: "lo" }));
  out.push(L(windings(bore + 5, ro - 3.2, z0 + plate, h - 2 * plate, 3), { tone: "lo" }));
  out.push(S(shell(bore, ro, z0 + h - plate, plate, { bevel: 0.5 }), { tone: "mid" }));
  out.push(S(shell(bore, bore + 3.4, z0 + h, 1.8, { bevel: 0.3 }), { tone: "lo" })); // pole-piece nose
  out.push(S(shell(bore, bore + 3.4, z0 - 1.8, 1.8), { tone: "lo" }));
  return out.join("");
}
const column = (rIn, rOut, z, h, tone = "mid") => S(shell(rIn, rOut, z, h), { tone, crease: "none" });
const flange = (r0, r1, z, tone = "mid") => S(shell(r0, r1, z, 2.6, { bevel: 0.4 }), { tone });

// ---- parts
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = k.corners(PLATE, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

const PC = [-RIGHT[0] * 80 - VX * 14, -RIGHT[1] * 80 - VY * 14];
const PUMP = { x: PC[0] - 20, y: PC[1] - 23, w: 40, d: 46, r: 4 };
function pump() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(PUMP, 0, 4, P)}" style="filter:blur(4px)"/>`);
  const seams = [12, 22, 32, 42, 52, 62].map((z) => k.sideSeam(PUMP, z, P, 4)).join("");
  out.push(S(k.slabOf(PUMP, 0, 70, P, 4, 0.8), { tone: "mid", inner: L(seams, { tone: "faint" }) }));
  out.push(S(k.slabOf(k.insetPlan(PUMP, 3), 70, 5, P, 4, 0.5), { tone: "hi", crease: "lo" }));
  // cooling fins as grooves on the top and the faces
  out.push(D(k.corners(PUMP, 5).map(([x, y]) => at([x, y, 75])), { size: 0.45 }));
  // magnet pole caps
  out.push(S(k.cylinder(PUMP.x + 12, PUMP.y + 23, 7, 75, 4, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(PUMP.x + 28, PUMP.y + 23, 7, 75, 4, P, 24), { tone: "mid" }));
  out.push(L(k.knurl(PUMP.x + 12, PUMP.y + 23, 7, 75, 79, 24, P), { tone: "lo" }));
  out.push(L(k.knurl(PUMP.x + 28, PUMP.y + 23, 7, 75, 79, 24, P), { tone: "lo" }));
  return out.join("");
}
function pumpPipe() {
  const c = [PUMP.x + PUMP.w / 2, PUMP.y + PUMP.d / 2], dx = -c[0], dy = -c[1], n = Math.hypot(dx, dy);
  const dir = [dx / n, dy / n, 0], from = n - 0 - 22, len = n - 43.5 - 22;
  const F = G.frameAlong([c[0] + dir[0] * 22, c[1] + dir[1] * 22, 36], dir);
  return S(G.disc(0, len, 5.4, F, P), { tone: "mid" }) + S(G.disc(len - 3, len, 8, F, P), { tone: "mid" }) + S(G.disc(0, 3, 8, F, P), { tone: "mid" });
}

function chamber() {
  const out = [];
  // floor, wall (cut away), top plate
  out.push(S(k.cylinder(0, 0, 44, 0.2, 6, P, 72, 0.6), { tone: "mid" }));
  out.push(L(k.ring(0, 0, 41, 6.2, P, 72), { tone: "lo" }));
  out.push(S(k.cylinder(0, 0, 31, 6.2, 1.2, P, 56), { tone: "lo", crease: "none" })); // screen seat
  out.push(S(k.cylinder(0, 0, 29.5, 7.4, 0.8, P, 56), { tone: "hi", crease: "lo", lit: false })); // phosphor disc
  out.push(L(k.ring(0, 0, 28, 8.2, P, 56), { tone: "faint" }));
  return out.join("");
}
function chamberWall() {
  const out = [];
  out.push(S(shell(40.5, 44, 6.2, 46, { half: (66 * Math.PI) / 180 }), { tone: "mid", crease: "none" }));
  // top plate with its bolt circle
  out.push(S(shell(15, 46, 52.2, 3.6, { half: (66 * Math.PI) / 180, bevel: 0.6 }), { tone: "mid" }));
  const bolts = Array.from({ length: 16 }, (_, i) => { const a = VA + (70 * Math.PI) / 180 + ((2 * Math.PI - (140 * Math.PI) / 180) * i) / 15; return at([Math.cos(a) * 40, Math.sin(a) * 40, 55.8]); });
  out.push(D(bolts, { size: 0.45 }));
  return out.join("");
}
// viewing-window frame sits on the cut edge, a phosphor-green lit rim

function holder() {
  const z = Z.spec;
  const ax = [RIGHT[0], RIGHT[1], 0];
  const at0 = (s, r = 0, up = 0) => [ax[0] * s, ax[1] * s, z + up];
  const out = [];
  // tip (inside the column) to handle (outside): drawn in s from the axis out to s = 110
  const F = G.frameAlong([0, 0, z], ax);
  out.push(S(G.disc(0, 4, 2.6, F, P), { tone: "hi" }));                   // specimen cup
  out.push(S(G.disc(4, 40, 2.1, F, P), { tone: "mid", crease: "none" })); // rod
  out.push(S(G.disc(40, 44, 5.4, F, P), { tone: "mid" }), S(G.disc(44, 46, 5.9, F, P), { tone: "lo" }), S(G.disc(46, 60, 5.4, F, P), { tone: "mid" }), S(G.disc(60, 62, 5.9, F, P), { tone: "lo" }), S(G.disc(62, 66, 5.4, F, P), { tone: "mid" }));
  out.push(S(G.disc(66, 74, 7.4, F, P), { tone: "hi", crease: "lo" }));   // knob
  out.push(k.fadedSvg(G.ribsOf(F, 66, 74, 7.4, 24, P, { seams: true, fade: [0.04, 0.42] }), { tone: "lo" }));
  return out.join("");
}
function holderBoss() {
  const z = Z.spec, ax = [RIGHT[0], RIGHT[1], 0];
  const F = G.frameAlong([RIGHT[0] * 12, RIGHT[1] * 12, z], ax);
  return S(G.disc(0, 11, 8.6, F, P), { tone: "mid" }) + S(G.disc(11, 14, 10.4, F, P), { tone: "lo" });
}
function apertureBoss() {
  const z = M.Z_BFP, ax = [-RIGHT[0], -RIGHT[1], 0];
  const F = G.frameAlong([ax[0] * 12, ax[1] * 12, z], ax);
  return S(G.disc(0, 10, 7.6, F, P), { tone: "mid" }) + S(G.disc(10, 13, 9.4, F, P), { tone: "lo" });
}
function apertureRod() {
  const z = M.Z_BFP, ax = [-RIGHT[0], -RIGHT[1], 0];
  const F = G.frameAlong([0, 0, z], ax);
  const out = [];
  out.push(S(G.disc(-2, 4, 3.4, F, P), { tone: "hi" }));                 // aperture strip with its hole
  out.push(S(G.disc(4, 60, 1.9, F, P), { tone: "mid", crease: "none" }));
  out.push(S(G.disc(60, 78, 5.2, F, P), { tone: "mid" }));
  out.push(S(G.disc(78, 80, 6.6, F, P), { tone: "hi", crease: "lo" }), S(G.disc(80, 82, 7.0, F, P), { tone: "mid" }), S(G.disc(82, 84, 6.6, F, P), { tone: "hi", crease: "lo" }));
  return out.join("");
}

// ---- gun
function gun() {
  const out = [];
  const z0 = 282;
  out.push(column(9, 13, Z.c1 + 11, z0 - (Z.c1 + 11) + 6));
  out.push(flange(9, 24, z0 + 4));
  // anode plate and Wehnelt cylinder
  out.push(S(shell(4, 22, z0 + 8, 4, { bevel: 0.4 }), { tone: "hi", crease: "lo" }));
  out.push(S(shell(0.1, 17, z0 + 14, 14, { bevel: 0.5 }), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 11, z0 + 28, 2, P, 40, 0.4), { tone: "lo" }));
  // insulator stack: ceramic discs
  for (let i = 0; i < 6; i++) out.push(S(k.cylinder(0, 0, 13, z0 + 30 + i * 8, 6, P, 40, 0.3), { tone: i % 2 ? "hi" : "mid", crease: "lo" }));
  for (let i = 0; i < 6; i++) out.push(S(k.cylinder(0, 0, 9, z0 + 36 + i * 8, 2, P, 32), { tone: "lo", crease: "none" }));
  // HV tank
  out.push(S(k.cylinder(0, 0, 22, z0 + 78, 28, P, 56, 0.8), { tone: "mid" }));
  out.push(L(k.sideArc(0, 0, 22, z0 + 86, P, 28), { tone: "faint" }));
  out.push(L(k.sideArc(0, 0, 22, z0 + 98, P, 28), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 18, z0 + 106, 4, P, 48, 0.5), { tone: "hi", crease: "lo" }));
  out.push(D(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * 2 * Math.PI; return at([Math.cos(a) * 14, Math.sin(a) * 14, z0 + 110]); }), { size: 0.45 }));
  out.push(S(k.cylinder(0, 0, 4.6, z0 + 110, 6, P, 20), { tone: "mid" })); // HV socket
  return out.join("");
}
function filament() {
  // hairpin tungsten filament inside the Wehnelt: drawn in the cut so the tip is visible
  const z = M.Z.source;
  const tip = at([0, 0, z]);
  const a = at([RIGHT[0] * 4, RIGHT[1] * 4, z + 9]), b = at([-RIGHT[0] * 4, -RIGHT[1] * 4, z + 9]);
  return L(`M${a[0]} ${a[1]}L${tip[0]} ${tip[1]}L${b[0]} ${b[1]}`, { tone: "hi" });
}

// ---- console on the base: a magnification knob, lamp and plate
const CONSOLE = { x: 44, y: -70, w: 52, d: 40, r: 5 };
function consoleBox() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(CONSOLE, 0, 3, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(CONSOLE, 0, 14, P, 5, 1), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(CONSOLE, 3), 14, P, 5), { tone: "faint" }));
  out.push(D(k.corners(CONSOLE, 4.5).map(([x, y]) => at([x, y, 14])), { size: 0.45 }));
  const c = [CONSOLE.x + 17, CONSOLE.y + 21];
  out.push(S(k.cylinder(c[0], c[1], 11.5, 14, 2, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(c[0], c[1], 9, 16, 7, P, 40, 0.5), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(c[0], c[1], 9, 16, 23, 44, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(c[0], c[1], 7.2, 23, P, 40), { tone: "faint" }));
  const ticks = k.radialTicks(c[0], c[1], 12.2, 24, 6, 16, [1.4, 3], P, (-135 * Math.PI) / 180, (270 * Math.PI) / 180);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // mode lamps
  const lamps = [[CONSOLE.x + 40, CONSOLE.y + 12], [CONSOLE.x + 40, CONSOLE.y + 28]];
  for (const [x, y] of lamps) { out.push(S(k.cylinder(x, y, 3.2, 14, 1.6, P, 20), { tone: "lo" })); }
  // label plate with three rule lines
  const lab = { x: CONSOLE.x + 33, y: CONSOLE.y + 33, w: 16, d: 4.6, r: 1 };
  out.push(S(k.slabOf(lab, 14, 0.6, P, 2), { tone: "lo", crease: "none" }));
  out.push(L([0, 1, 2].map((i) => k.lineOnTop([lab.x + 2, lab.y + 1.2 + i * 1.1], [lab.x + lab.w - 2 - (i === 2 ? 4 : 0), lab.y + 1.2 + i * 1.1], 14.6, P)).join(""), { tone: "lo", free: true }));
  return { svg: out.join(""), knob: c, lamps };
}

// ---- frame
const CON = consoleBox();
const KNOB_Z = 23;
const knobAt = (m) => {
  const angle = (-135 + 270 * m) * Math.PI / 180;
  const [x, y] = CON.knob;
  return k.lineOnTop([x + Math.sin(angle) * 2, y - Math.cos(angle) * 2], [x + Math.sin(angle) * 8, y - Math.cos(angle) * 8], KNOB_Z + 0.1, P);
};

const column1 = [
  column(15, 19, 56, 4),
  lens(58, 22, 15, { big: true }),                // projector
  column(15, 19, 80, 16),
  lens(96, 20, 15),                              // intermediate
  column(15, 19, 116, 28),
  flange(15, 24, 144),
  lens(146, 12, 9),                              // objective, lower pole
].join("");
const column2 = [
  column(9, 13, 158, 30),                        // stage + aperture section
  flange(9, 22, 160),
  flange(9, 22, 186),
  lens(188, 18, 9),                              // objective, upper pole
  column(9, 13, 206, 16),
  lens(222, 20, 9),                              // condenser 2
  column(9, 13, 242, 16),
  lens(258, 20, 9),                              // condenser 1
  column(9, 13, 278, 4),
].join("");

const specimenGrid = () => {
  const z = Z.spec + 2.4;
  return S(k.cylinder(0, 0, 3.4, z - 1, 1.2, P, 32), { tone: "hi", lit: true }) + L(k.ring(0, 0, 1.9, z + 0.3, P, 24), { tone: "lo" });
};

const label =
  "A transmission electron microscope shown as a cut-away column. A tungsten electron gun at the top fires electrons down through two condenser lenses onto a thin specimen on a side-entry holder. Below the specimen the objective, intermediate and projector lenses turn the electrons into either an image or a diffraction pattern on a phosphor screen.";

const body = [
  base(),
  pump(), pumpPipe(),
  chamber(),
  chamberWall(),
  column1,
  column2,
  holderBoss(),
  apertureBoss(),
  `<g data-part="holder">${holder()}</g>`,
  gun(),
  specimenGrid(),
  `<g data-part="aperture" transform="${k.translateAlong(P, [0, 0, 0])}">${apertureRod()}</g>`,
  CON.svg,
  `<path data-part="knob" class="iso-line" data-tone="hi" data-free="start" d="${knobAt(0.5)}" style="stroke-width:1.2"/>`,
  `<g data-part="lamps"></g>`,
  `<g data-part="screen"></g>`,
  `<g data-part="rays"></g>`,
  `<g data-part="filament">${filament()}</g>`,
];

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label, body });

// ---- live page
const modelSrc = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${modelSrc}
const P = ${JSON.stringify(P)};
const RIGHT = ${JSON.stringify(RIGHT)};
const KNOB = ${JSON.stringify(CON.knob)}, KNOB_Z = ${KNOB_Z}, LAMPS = ${JSON.stringify(CON.lamps)};
const SCREEN_Z = 8.2, APERTURE_OUT = 46;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (n) => svg.querySelector('[data-part="' + n + '"]');
const rays = q("rays"), screen = q("screen"), aperture = q("aperture"), knob = q("knob"), lamps = q("lamps"), holder = q("holder");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const AX = [-RIGHT[0], -RIGHT[1]];                         // aperture direction
const plane = (zy) => iso([0, 0, 0].map((_, i) => i < 2 ? RIGHT[i] * zy[1] : zy[0]), P); // (z, y) -> screen, y along screen-right
const poly = (pts) => "M" + pts.map((p) => plane(p).join(" ")).join("L");

let s = { mag: 0.35, mode: 0, kV: 200 };           // mode: 0 image, 1 diffraction (eased)
let t = { mag: 0.35, mode: 0, kV: 200 };
let optical = optics(s.mag, s.kV);
let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0, lastKey = "";

function drawRays(o, m) {
  const a = 1 - m, b = m;
  const lit = (list, tone) => list.map((r) => '<path class="iso-line" data-free data-tone="' + tone + '" d="' + poly(r) + '"/>').join("");
  rays.innerHTML =
    '<g>' + lit(o.illum, "lit") + '</g>' +
    '<g opacity="' + a.toFixed(3) + '">' + lit(o.imageRays, "lit") + lit(o.blocked, "faint") + '</g>' +
    '<g opacity="' + b.toFixed(3) + '">' + lit(o.diffRays.slice(0, 2), "lit") + lit(o.diffRays.slice(2), "hi") + '</g>';
}
function ringPts(r, z, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) { const ang = (i / steps) * Math.PI * 2; pts.push(iso([Math.cos(ang) * r, Math.sin(ang) * r, z], P)); }
  return "M" + pts.map((p) => p.join(" ")).join("L") + "Z";
}
function drawScreen(o, m) {
  const R = SCREEN_R, a = 1 - m, b = m, z = SCREEN_Z, out = [];
  // image mode: gold nanoparticles, enlarged by the chain (field of view shrinks as M rises)
  let img = "";
  for (const [x, y, r, ang] of PARTICLES) {
    const px = x * o.Mimg, py = y * o.Mimg, pr = r * o.Mimg, dist = Math.hypot(px, py);
    const f = 1 - smooth(R - 4, R - 0.5, dist + pr);
    if (f <= 0.02) continue;
    let g = '<path class="iso-line" data-tone="hi" d="' + ringPts2(px, py, pr, z, 28) + '"/>';
    const fr = smooth(16, 30, o.Mimg);
    if (fr > 0.02) {
      const step = Math.max(1.3, 0.1 * o.Mimg * 0.9), ca = Math.cos(ang), sa = Math.sin(ang);
      let d = "";
      for (let c = -pr + step * 0.6; c < pr - step * 0.3; c += step) {
        const hw = Math.sqrt(pr * pr - c * c) * 0.97;
        const p0 = [px + ca * c - sa * hw, py + sa * c + ca * hw], p1 = [px + ca * c + sa * hw, py + sa * c - ca * hw];
        d += lineOnTop(p0, p1, z, P);
      }
      g += '<g opacity="' + fr.toFixed(2) + '"><path class="iso-line" data-tone="lo" d="' + d + '"/></g>';
    }
    img += '<g opacity="' + f.toFixed(2) + '">' + g + '</g>';
  }
  out.push('<g opacity="' + a.toFixed(3) + '">' + img + '</g>');
  // diffraction mode: bright central beam and Debye-Scherrer rings with a few bright grains
  let dif = '<circle class="iso-wire-end" cx="' + iso([0, 0, z], P)[0].toFixed(1) + '" cy="' + iso([0, 0, z], P)[1].toFixed(1) + '" r="2.2"/>';
  o.ringR.forEach((r, i) => {
    const f = 1 - smooth(R - 3, R + 3, r);
    if (f <= 0.02) return;
    let spots = "";
    for (const ang of GRAINS[i]) { const p = iso([Math.cos(ang) * r, Math.sin(ang) * r, z], P); spots += '<circle class="iso-wire-end" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.5"/>'; }
    dif += '<g opacity="' + f.toFixed(2) + '"><path class="iso-line" data-tone="mid" d="' + ringPts(r, z, 72) + '"/>' + spots + '</g>';
  });
  out.push('<g opacity="' + b.toFixed(3) + '">' + dif + '</g>');
  screen.innerHTML = out.join("");
}
function ringPts2(cx, cy, r, z, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) { const ang = (i / steps) * Math.PI * 2; pts.push(iso([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, z], P)); }
  return "M" + pts.map((p) => p.join(" ")).join("L") + "Z";
}
function draw() {
  const m = s.mode;
  drawRays(optical, m);
  drawScreen(optical, m);
  aperture.setAttribute("transform", translateAlong(P, [AX[0] * APERTURE_OUT * m, AX[1] * APERTURE_OUT * m, 0]));
  const angle = (-135 + 270 * s.mag) * Math.PI / 180;
  knob.setAttribute("d", lineOnTop([KNOB[0] + Math.sin(angle) * 2, KNOB[1] - Math.cos(angle) * 2], [KNOB[0] + Math.sin(angle) * 8, KNOB[1] - Math.cos(angle) * 8], KNOB_Z + 0.1, P));
  const on = (i) => (i === 0 ? 1 - m : m);
  lamps.innerHTML = LAMPS.map((l, i) => '<circle class="iso-wire-end" opacity="' + (0.15 + 0.85 * on(i)).toFixed(2) + '" cx="' + iso([l[0], l[1], 15.6], P)[0].toFixed(1) + '" cy="' + iso([l[0], l[1], 15.6], P)[1].toFixed(1) + '" r="1.6"/>').join("");
  const o = optical;
  const text = m < 0.5
    ? "image · ×" + o.Mimg.toFixed(1) + " · " + s.kV.toFixed(0) + " kV · λ " + o.lam.toFixed(2) + " pm"
    : "diffraction · 2θ(111) " + (o.twoTheta * 1000).toFixed(1) + " mrad · " + s.kV.toFixed(0) + " kV · λ " + o.lam.toFixed(2) + " pm";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(s.mag * 100)));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) {
    clock += dt;
    const k2 = (clock % 14);
    t.mode = k2 > 8 ? 1 : 0;
    t.mag = 0.5 + 0.5 * Math.sin(clock * 0.5 - 1.2);
    t.kV = 200;
  }
  const f = calm ? 1 : 1 - Math.exp(-dt / 0.22);
  s.mag += (t.mag - s.mag) * f; s.mode += (t.mode - s.mode) * (calm ? 1 : 1 - Math.exp(-dt / 0.35)); s.kV += (t.kV - s.kV) * f;
  if (Math.abs(t.mag - s.mag) < 0.0005) s.mag = t.mag;
  if (Math.abs(t.mode - s.mode) < 0.002) s.mode = t.mode;
  if (Math.abs(t.kV - s.kV) < 0.05) s.kV = t.kV;
  optical = optics(s.mag, s.kV);
  draw();
  const settled = !touring && s.mag === t.mag && s.mode === t.mode && s.kV === t.kV;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 6000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
let down = null;
stage.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, mag: t.mag, moved: false }; stage.setPointerCapture?.(e.pointerId); steer(); });
stage.addEventListener("pointermove", (e) => {
  if (!down) return;
  const box = svg.getBoundingClientRect();
  const dx = e.clientX - down.x;
  if (Math.abs(dx) > 4) down.moved = true;
  t.mag = clamp(down.mag + dx / (box.width * 0.5), 0, 1);
  steer();
});
stage.addEventListener("pointerup", () => { if (down && !down.moved) { t.mode = t.mode ? 0 : 1; steer(); } down = null; });
stage.addEventListener("keydown", (e) => {
  let used = true;
  if (e.key === "ArrowRight") t.mag = clamp(t.mag + 0.08, 0, 1);
  else if (e.key === "ArrowLeft") t.mag = clamp(t.mag - 0.08, 0, 1);
  else if (e.key === "ArrowUp") t.kV = KV[Math.min(KV.length - 1, KV.indexOf(t.kV) + 1)];
  else if (e.key === "ArrowDown") t.kV = KV[Math.max(0, KV.indexOf(t.kV) - 1)];
  else if (e.key === " " || e.key === "Enter") t.mode = t.mode ? 0 : 1;
  else used = false;
  if (!used) return;
  e.preventDefault(); steer();
});
draw();
`;

const html = k.plateHtml({
  fig: "Fig 1",
  title: "투과전자현미경 (TEM)",
  hint: "드래그: 배율 · 클릭/스페이스: 상 ↔ 회절 · ↑↓: 가속전압",
  readout: "image · ×14 · 200 kV · λ 2.51 pm",
  keys: [
    { mark: "lit", label: "전자 빔 (광선)" },
    { mark: "raised", label: "전자기 렌즈 (코일 + 요크, 앞쪽을 잘라낸 단면)" },
    { mark: "dim", label: "대물 조리개에 막힌 회절빔" },
  ],
  caption:
    "위에서 아래로: 전자총 → 집속렌즈 2개 → 시료(옆에서 삽입) → 대물렌즈(뒷초점면에 조리개) → 중간렌즈 → 투사렌즈 → 형광 스크린. 중간렌즈가 시료의 상을 보느냐 뒷초점면을 보느냐에 따라 상 모드와 회절 모드가 바뀝니다. 렌즈 간격은 압축해 그렸고 회절각은 20배 과장했습니다. λ와 배율은 같은 모델에서 계산한 값입니다.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="투과전자현미경: 좌우 화살표로 배율, 위아래 화살표로 가속전압, 스페이스로 상/회절 모드 전환" aria-valuemin="0" aria-valuemax="100" aria-valuenow="35">${svg}</div>`,
});
const out = theme === "light" ? "tem-light.html" : "tem.html";
writeFileSync(join(HERE, out), k.pageHtml({ title: "투과전자현미경 TEM", theme, body: html, script: kitScript() + live }));
console.log("wrote", out);
