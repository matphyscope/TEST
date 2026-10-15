// JEOL 2100-style TEM control model. Pure: state in, rays and screen description out.
// Control semantics follow the "JEOL 2100 TEM Operation Manual" (globalsino.com/EM/page30.html).
export const KV = [100, 120, 160, 200];
export const lambdaPm = (kV) => { const V = kV * 1e3; return (12.2643 / Math.sqrt(V * (1 + 0.97845e-6 * V))) * 100; };

export const Z = { source: 304, c1: 268, clAp: 238, c2: 224, cm: 206, spec: 180, obj: 172, int: 106, proj: 70, screen: 16, img1: 134 };
export const SCREEN_R = 27;
export const EXAG = 20;
export const RINGS = [{ hkl: "111", d: 235.5 }, { hkl: "200", d: 203.9 }, { hkl: "220", d: 144.2 }];
export const CL_AP = [{ name: "OPEN", r: 3.0 }, { name: "150 µm", r: 2.6 }, { name: "70 µm", r: 1.8 }, { name: "50 µm", r: 1.3 }, { name: "10 µm", r: 0.45 }];
export const OL_AP = [{ name: "OPEN", r: 99 }, { name: "120 µm", r: 1.7 }, { name: "60 µm", r: 1.1 }, { name: "40 µm", r: 0.7 }, { name: "20 µm", r: 0.4 }];
export const SPOT_V = [22, 18, 14, 10, 6];            // crossover distance below C1: spot 1 is the biggest probe
export const PRESET = { TEM: { spot: 3, alpha: 0.35, bright: 0.15 }, EDS: { spot: 1, alpha: 0.7, bright: 0.5 }, NBD: { spot: 2, alpha: 0.12, bright: 0.5 }, CBD: { spot: 3, alpha: 1, bright: 0.5 } };
export const STIG_IDEAL = [0.32, -0.22];
export const GUN_SHIFT_IDEAL = [-0.3, 0.2];             // gun alignment starts slightly off, as it does on a real instrument
export const GUN_TILT_IDEAL = [0.25, -0.2];                // the condenser starts astigmatic, as in the manual

export const initial = () => ({
  fil: 1, kV: 200, probe: "TEM", spot: 3, alpha: 0.35, bright: 0.15, shiftX: 0, shiftY: 0,
  clAp: 1, olAp: 3, olX: 0, fn: "mag1", mag: 0.4, objFocus: 0.35, diffFocus: 0.3, dz: 0.2,
  stig: [0.0, 0.0], defMode: "", tilt: 0, wobImg: 0, wobHT: 0, gunShift: [0.1, 0], gunTilt: [0.12, 0],
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lens = (z, f) => ({ z, f });
const vOf = (spot) => { const i = clamp(spot - 1, 0, 4), i0 = Math.floor(i), i1 = Math.min(4, i0 + 1); return SPOT_V[i0] + (SPOT_V[i1] - SPOT_V[i0]) * (i - i0); };
export function trace(ray, lenses, zEnd) {
  const pts = [[ray.z, ray.y]];
  let { z, y, s } = ray;
  for (const l of [...lenses].sort((a, b) => b.z - a.z)) {
    if (l.z >= z || l.z <= zEnd) continue;
    y += s * (z - l.z); z = l.z; pts.push([z, y]);
    s -= y / l.f;
  }
  y += s * (z - zEnd); pts.push([zEnd, y]);
  return pts;
}
const lensChain = (zObj, v2) => {
  const u2 = zObj - Z.int, up = Z.int - v2 - Z.proj, vp = Z.proj - Z.screen;
  return { v2, u2, M: (v2 / u2) * (vp / up), fi: (u2 * v2) / (u2 + v2), fp: (up * vp) / (up + vp) };
};

// fixed geometry of the imaging chain
const U0 = Z.spec - Z.obj, V0 = Z.obj - Z.img1;
export const F_OBJ = (U0 * V0) / (U0 + V0);
export const Z_BFP = Z.obj - F_OBJ;

// beam offset that a double-deflection system adds: shift between the two coils, tilt pivoting about the specimen
function deflect(pts, shiftX, tilt, zSpec) {
  return pts.map(([z, y]) => {
    const w = clamp((252 - z) / 42, 0, 1);
    return [z, y + w * (shiftX + tilt * (z - zSpec))];
  });
}

export function optics(st, time = 0) {
  const kV = st.kV * (1 + (st.wobHT ? 0.012 * Math.sin(time * 9) : 0));
  const lam = lambdaPm(kV);
  const zSpec = Z.spec + 0.07 * st.dz;
  const out = { lam, kV: st.kV, on: st.fil > 0.5, fil: st.fil };

  // ---- illumination: gun -> C1 (spot size) -> CL aperture -> C2 (brightness) -> specimen
  const V1 = vOf(st.spot), zx = Z.c1 - V1;
  const rAp = (st.clR ?? CL_AP[st.clAp].r) * (0.3 + 0.7 * st.alpha);       // alpha selector scales the convergence angle (CM minilens)
  const zf = Z.spec + 44 * (0.5 - st.bright);                  // where C2 focuses the crossover (BRIGHTNESS)
  const a = rAp / (zx - Z.clAp);                               // |dy/dz| of the marginal ray through the crossover
  const f1 = (36 * V1) / (36 + V1), u2 = zx - Z.c2, v2 = Z.c2 - zf, f2 = (u2 * v2) / (u2 + v2);
  const bendLenses = [lens(Z.c1, f1), lens(Z.c2, f2)];
  // gun shift / gun tilt misalignment moves the whole bundle: follow the chief ray through the same two lenses
  const chiefOf = (axis) => trace({ z: Z.source, y: (st.gunShift[axis] - GUN_SHIFT_IDEAL[axis]) * 0.5, s: (st.gunTilt[axis] - GUN_TILT_IDEAL[axis]) * 0.03 }, bendLenses, zSpec);
  const chiefAt = (pts, z) => { for (let i = 0; i < pts.length - 1; i++) { const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]; if (z <= z0 + 1e-9 && z >= z1 - 1e-9) return y0 + ((y1 - y0) * (z0 - z)) / (z0 - z1 || 1); } return pts.at(-1)[1]; };
  const chief0 = chiefOf(0), chief1 = chiefOf(1);
  const chiefSlope = (chief0.at(-2)[1] - chief0.at(-1)[1]) / (chief0.at(-2)[0] - chief0.at(-1)[0]) * -1;
  const rays = [];
  for (const sg of [-1, 1]) {
    const yC1 = sg * a * (Z.c1 - zx), yAp = -sg * rAp, yC2 = -sg * a * (zx - Z.c2);
    const slopeAfter = -yC2 / (Z.c2 - zf);                     // C2 bends the fan so it converges on zf
    const yS = yC2 + slopeAfter * (Z.c2 - zSpec);
    const pts = [[Z.source, 0], [Z.c1, yC1], [zx, 0], [Z.clAp, yAp], [Z.c2, yC2]];
    if (zf > zSpec) pts.push([zf, 0]);
    pts.push([zSpec, yS]);
    rays.push(deflect(pts.map(([z, y]) => [z, y + chiefAt(chief0, z)]), st.shiftX * 1.6, st.tilt * 0.3, zSpec));
  }
  const theta = Math.abs(a * (zx - Z.c2)) / Math.abs(Z.c2 - zf);
  const waistOf = (spot) => 0.5 * (vOf(spot) / 36) * (Math.abs(Z.c2 - zf) / (Z.c1 - vOf(spot) - Z.c2));
  const waist = waistOf(st.spot);
  const halfW = Math.max(waist, Math.abs(zf - Z.spec) * theta);
  out.illum = rays;
  out.theta = theta;
  out.beamHalf = halfW;
  out.spotRel = waist / waistOf(1);
  // beam current: electrons accepted by the CL aperture (angle seen from the crossover), times how well the gun is aligned
  const aRef = (CL_AP[1].r * 1) / (Z.c1 - SPOT_V[0] - Z.clAp);
  const gunErr = Math.hypot(st.gunTilt[0] - GUN_TILT_IDEAL[0], st.gunTilt[1] - GUN_TILT_IDEAL[1]);
  const shiftErr = Math.hypot(st.gunShift[0] - GUN_SHIFT_IDEAL[0], st.gunShift[1] - GUN_SHIFT_IDEAL[1]);
  out.gunTrans = Math.exp(-((gunErr / 0.55) ** 2)) * Math.exp(-((shiftErr / 1.4) ** 2));
  out.current = (a / aRef) ** 2 * out.gunTrans;
  out.gunErr = gunErr; out.shiftErr = shiftErr;
  out.ratio = (out.current * 9) / Math.max(halfW * halfW, 0.04);
  out.density = clamp(0.14 + 0.09 * out.ratio, 0.14, 1);
  out.shift = [chiefAt(chief0, zSpec) + st.shiftX * 1.6, chiefAt(chief1, zSpec) + st.shiftY * 1.6];
  out.chiefSlope = chiefSlope * 0.25;
  out.lensK = { c1: 1 / f1, c2: 1 / f2 };

  // ---- imaging chain
  const lowmag = st.fn === "lowmag";
  out.lowmag = lowmag;
  // objective: in LOW MAG it is (nearly) off, so the specimen plane itself is the object of the intermediate lens
  const uSpec = Z.spec + 0.07 * st.dz - Z.obj;
  const fObj = lowmag ? 1e5 : F_OBJ * (1 + 0.007 * st.objFocus) * (kV / st.kV);
  const vImg = lowmag ? -uSpec : (uSpec * fObj) / (uSpec - fObj);
  const zImg1 = lowmag ? zSpec : Z.obj - vImg;
  out.defocus = lowmag ? 0 : zImg1 - Z.img1;                 // signed image-plane error, drawn units
  const objL = lens(Z.obj, fObj);
  const im = lensChain(lowmag ? Z.spec : Z.img1, lowmag ? 10 + 14 * st.mag : 14 + 16 * st.mag);   // lens currents are set for the in-focus plane
  const imageLenses = [objL, lens(Z.int, im.fi), lens(Z.proj, im.fp)];
  out.Mimg = lowmag ? im.M : (vImg / uSpec) * im.M;

  const df = lensChain(Z_BFP, 28 + 6 * st.mag);
  const diffLenses = [objL, lens(Z.int, df.fi * (1 + 0.02 * st.diffFocus)), lens(Z.proj, df.fp)];
  out.camScale = df.M;
  out.lensK.int = 1 / (st.fn === "sadiff" ? df.fi * (1 + 0.02 * st.diffFocus) : im.fi);
  out.lensK.proj = 1 / (st.fn === "sadiff" ? df.fp : im.fp);

  // ---- which beams pass the objective aperture
  const s1 = (EXAG * lam) / RINGS[0].d;
  const sT = st.tilt * 0.3 + chiefSlope * 0.25;
  const olOut = st.fn === "sadiff" || lowmag;
  const ol = olOut ? { r: 99 } : { r: st.olR ?? OL_AP[st.olAp].r };
  const yAp = st.olX * 2.2;
  out.olOut = olOut;
  out.beams = [-1, 0, 1].map((k) => {
    const slope = sT + k * s1;
    const yB = slope * fObj;
    return { k, slope, yB, pass: st.fil < 0.5 ? false : Math.abs(yB - yAp) < Math.min(ol.r, 2.6) };
  });
  const passing = out.beams.filter((b) => b.pass);
  out.field = !passing.length ? "dark" : passing.some((b) => b.k === 0) ? (passing.length === 1 ? "bf" : "open") : "df";
  out.dfBeam = passing.find((b) => b.k !== 0)?.k ?? 0;
  out.contrast = ol.r > 50 ? 0.45 : clamp(1.15 - ol.r * 0.5, 0.35, 1);

  const alphaA = 0.1, imageRays = [], blocked = [];
  const rim = Math.min(ol.r, 2.6);
  out.beams.forEach((b) => {
    if (st.fil < 0.5) return;
    if (b.pass) {
      const half = Math.max(0.01, (rim - Math.abs(b.yB - yAp)) / fObj * 0.85);
      for (const h of [0, 0.5]) for (const sg of [-1, 1]) imageRays.push(trace({ z: zSpec, y: h, s: b.slope + sg * Math.min(half, alphaA) }, imageLenses, Z.screen));
    } else if (b.k !== 0 || st.fn === "mag1" || st.fn === "samag") {
      blocked.push(trace({ z: zSpec, y: 0, s: b.slope }, imageLenses, Z_BFP));
    }
  });
  out.imageRays = imageRays; out.blocked = blocked;

  // ---- diffraction beams: parallel (wide) or convergent (small spot / large alpha)
  const wDraw = clamp(halfW, 0.3, 1.8), tDraw = clamp(theta * 6, 0.0, 0.18);
  const diffRays = [];
  const shown = [-1, 0, 1].filter((k) => (k === 0 ? true : k === 1 || k === -1));
  for (const k of shown) {
    const slope = sT + k * s1;
    diffRays.push(trace({ z: zSpec, y: wDraw, s: slope - tDraw }, diffLenses, Z.screen));
    diffRays.push(trace({ z: zSpec, y: -wDraw, s: slope + tDraw }, diffLenses, Z.screen));
  }
  out.diffRays = diffRays;
  const at = (s) => trace({ z: zSpec, y: 0, s }, diffLenses, Z.screen).at(-1)[1];
  out.center = at(sT);
  out.ringR = RINGS.map((r) => Math.abs(at(sT + (EXAG * lam) / r.d) - out.center));
  out.discR = Math.max(0.8, Math.abs(at(sT + clamp(theta * 6, 0.0, 0.18)) - out.center));
  const sepOf = () => {
    const A = trace({ z: zSpec, y: 1.4, s: 0 }, diffLenses, Z.screen).at(-1)[1], B = trace({ z: zSpec, y: -1.4, s: 0 }, diffLenses, Z.screen).at(-1)[1];
    return Math.abs(A - B) / 2;
  };
  out.diffBlur = sepOf();
  const imgBlur = () => {
    const A = imageRays.slice(0, 2);
    return A.length === 2 ? Math.abs(A[0].at(-1)[1] - A[1].at(-1)[1]) / 2 : 0;
  };
  out.imgBlur = imgBlur();
  out.imgShift = st.wobImg ? Math.sin(time * 7) * out.defocus * 2.2 : 0;

  // condenser astigmatism: the illuminated spot stretches until both stigmator knobs cancel the built-in error
  const err = [STIG_IDEAL[0] - st.stig[0], STIG_IDEAL[1] - st.stig[1]];
  out.astig = Math.hypot(err[0], err[1]);
  out.astigAngle = Math.atan2(err[1], err[0]) / 2;
  out.defocusFactor = clamp(Math.abs(zf - Z.spec) / 25, 0.2, 1);
  out.sT = sT;
  out.s1 = s1;
  out.twoTheta = lam / RINGS[0].d;
  out.tiltDark = -s1 / 0.3;
  out.zf = zf;
  return out;
}

export const PARTICLES = [
  [-0.9, 0.7, 0.28, 0.4], [0.2, 1.1, 0.18, 1.2], [1.2, 0.5, 0.3, 2.1], [-1.2, -0.3, 0.2, 0.9], [0.1, 0.1, 0.34, 1.7],
  [0.9, -0.9, 0.22, 0.2], [-0.4, -1.1, 0.26, 2.6], [1.5, -0.1, 0.14, 1.4], [-1.6, 1.2, 0.16, 0.6], [0.6, 1.6, 0.15, 2.9],
  [-0.1, -0.5, 0.12, 1.0], [1.1, 1.4, 0.13, 0.3], [-1.0, -1.5, 0.17, 1.9], [1.7, -1.4, 0.12, 2.4],
];
export const GRAINS = RINGS.map((_, i) => [0.3 + i * 0.9, 1.9 + i * 0.7, 3.6 + i * 1.3, 5.0 + i * 0.4]);
