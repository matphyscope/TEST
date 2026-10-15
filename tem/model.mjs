// Pure TEM model: electron wavelength + a thin-lens ray chain. Distances are drawn units (z up).
export const KV = [80, 120, 200, 300];
export const lambdaPm = (kV) => { const V = kV * 1e3; return (12.2643 / Math.sqrt(V * (1 + 0.97845e-6 * V))) * 100; };

export const Z = { source: 304, c1: 268, c2: 232, spec: 180, obj: 172, int: 106, proj: 70, screen: 16, img1: 134 };
export const SCREEN_R = 27;
export const APERTURE_R = 1.0;
export const ALPHA = 0.13;      // half-angle accepted from each specimen point
export const FIELD = 0.5;       // point B sits this far off axis
export const EXAG = 20;         // diffraction angles are drawn this many times larger than real
// Au rings: d in pm for (111) (200) (220)
export const RINGS = [{ hkl: "111", d: 235.5 }, { hkl: "200", d: 203.9 }, { hkl: "220", d: 144.2 }];

const U = Z.spec - Z.obj, V1 = Z.obj - Z.img1;
export const F_OBJ = (U * V1) / (U + V1);
export const Z_BFP = Z.obj - F_OBJ;
const F_C1 = (Z.source - Z.c1) * 20 / (Z.source - Z.c1 + 20);
const F_C2 = Z.c1 - 20 - Z.c2;

const lens = (z, f) => ({ z, f });
// trace a ray {z, y, s} (s = dy per unit travelled downward) through lenses to zEnd -> [[z, y], ...]
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

const unitMag = (zObj, v2) => {
  const u2 = zObj - Z.int, up = Z.int - v2 - Z.proj, vp = Z.proj - Z.screen;
  return { v2, u2, up, vp, M: (v2 / u2) * (vp / up), fi: (u2 * v2) / (u2 + v2), fp: (up * vp) / (up + vp) };
};

// mag in 0..1, kV from KV. Returns every polyline and the screen content for both modes.
export function optics(mag, kV) {
  const lam = lambdaPm(kV);
  const illum = [];
  for (const s of [-0.12, 0.12]) illum.push(trace({ z: Z.source, y: 0, s }, [lens(Z.c1, F_C1), lens(Z.c2, F_C2)], Z.spec));
  const base = [lens(Z.obj, F_OBJ)];

  const im = unitMag(Z.img1, 14 + 16 * mag);
  const imageLenses = [...base, lens(Z.int, im.fi), lens(Z.proj, im.fp)];
  const imageRays = [];
  for (const h of [0, FIELD]) for (const s of [-ALPHA, ALPHA]) imageRays.push(trace({ z: Z.spec, y: h, s }, imageLenses, Z.screen));
  const Mobj = V1 / U, Mimg = Mobj * im.M;

  const df = unitMag(Z_BFP, 28 + 6 * mag);
  const diffLenses = [...base, lens(Z.int, df.fi), lens(Z.proj, df.fp)];
  const diffRays = [], blocked = [], ringR = [];
  for (const y0 of [-1.4, 1.4]) diffRays.push(trace({ z: Z.spec, y: y0, s: 0 }, diffLenses, Z.screen));
  RINGS.forEach((r, i) => {
    const s = (EXAG * lam) / r.d;
    const rr = Math.abs(trace({ z: Z.spec, y: 0, s }, diffLenses, Z.screen).at(-1)[1]);
    ringR.push(rr);
    if (i === 0) for (const sg of [-1, 1]) for (const y0 of [-1.4, 1.4]) diffRays.push(trace({ z: Z.spec, y: y0, s: sg * s }, diffLenses, Z.screen));
    // in image mode the aperture stops this beam at the back focal plane
    if (i === 0) for (const sg of [-1, 1]) blocked.push(trace({ z: Z.spec, y: 0, s: sg * s }, imageLenses, Z_BFP));
  });
  return { lam, illum, imageRays, diffRays, blocked, ringR, Mimg, Mdiff: df.M, twoTheta: lam / RINGS[0].d };
}

export const PARTICLES = [
  [-0.9, 0.7, 0.28, 0.4], [0.2, 1.1, 0.18, 1.2], [1.2, 0.5, 0.3, 2.1], [-1.2, -0.3, 0.2, 0.9], [0.1, 0.1, 0.34, 1.7],
  [0.9, -0.9, 0.22, 0.2], [-0.4, -1.1, 0.26, 2.6], [1.5, -0.1, 0.14, 1.4], [-1.6, 1.2, 0.16, 0.6], [0.6, 1.6, 0.15, 2.9],
  [-0.1, -0.5, 0.12, 1.0], [1.1, 1.4, 0.13, 0.3], [-1.0, -1.5, 0.17, 1.9], [1.7, -1.4, 0.12, 2.4],
];
export const GRAINS = RINGS.map((_, i) => [0.3 + i * 0.9, 1.9 + i * 0.7, 3.6 + i * 1.3, 5.0 + i * 0.4]);
