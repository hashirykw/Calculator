// Triangle solver: any valid three of sides a, b, c and angles A, B, C
// (degrees; side a is opposite angle A). Handles SSS, SAS, ASA, AAS and the
// ambiguous SSA case, which can give two triangles.

const D = Math.PI / 180;
const sin = (d) => Math.sin(d * D), cos = (d) => Math.cos(d * D);
const asinD = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / D;
const acosD = (x) => Math.acos(Math.max(-1, Math.min(1, x))) / D;

function finish(t, rule) {
  const s = (t.a + t.b + t.c) / 2;
  return { ...t, perimeter: t.a + t.b + t.c, area: 0.5 * t.a * t.b * sin(t.C), rule, s };
}
function valid(t) {
  return ['a', 'b', 'c', 'A', 'B', 'C'].every((k) => Number.isFinite(t[k]) && t[k] > 1e-12) &&
    Math.abs(t.A + t.B + t.C - 180) < 1e-6;
}

export function solveTriangle(input) {
  const g = { ...input };
  const sides = ['a', 'b', 'c'].filter((k) => g[k] > 0);
  const angles = ['A', 'B', 'C'].filter((k) => g[k] > 0);
  if (sides.length + angles.length !== 3) return { error: 'three' };
  if (!sides.length) return { error: 'needside' };
  if (angles.reduce((s, k) => s + g[k], 0) >= 180) return { error: 'anglesum' };
  const opp = { a: 'A', b: 'B', c: 'C', A: 'a', B: 'b', C: 'c' };
  const out = [];

  if (sides.length === 3) {
    const { a, b, c } = g;
    if (a + b <= c || a + c <= b || b + c <= a) return { error: 'inequality' };
    const A = acosD((b * b + c * c - a * a) / (2 * b * c));
    const B = acosD((a * a + c * c - b * b) / (2 * a * c));
    out.push(finish({ a, b, c, A, B, C: 180 - A - B }, 'sss'));
  } else if (sides.length === 2) {
    const [s1, s2] = sides;
    const third = ['a', 'b', 'c'].find((k) => !sides.includes(k));
    const ang = angles[0];
    if (ang === opp[third]) {
      // SAS: the known angle is between the two known sides
      const x = g[s1], y = g[s2], th = g[ang];
      const z = Math.sqrt(x * x + y * y - 2 * x * y * cos(th));
      const t = { ...g, [third]: z };
      t.A = acosD((t.b * t.b + t.c * t.c - t.a * t.a) / (2 * t.b * t.c));
      t.B = acosD((t.a * t.a + t.c * t.c - t.b * t.b) / (2 * t.a * t.c));
      t.C = 180 - t.A - t.B;
      out.push(finish(t, 'sas'));
    } else {
      // SSA (ambiguous): known angle opposite one of the known sides
      const sideOpp = opp[ang];                 // side opposite the known angle
      const other = sides.find((k) => k !== sideOpp);
      const sinO = (g[other] * sin(g[ang])) / g[sideOpp];
      if (sinO > 1 + 1e-12) return { error: 'nosolution' };
      const O1 = asinD(sinO);
      for (const O of sinO >= 1 - 1e-12 ? [90] : [O1, 180 - O1]) {
        const rest = 180 - g[ang] - O;
        if (rest <= 1e-9) continue;
        const t = { ...g, [opp[other]]: O, [opp[third]]: rest };
        t[third] = (g[sideOpp] * sin(rest)) / sin(g[ang]);
        if (valid(t)) out.push(finish(t, 'ssa'));
      }
      if (!out.length) return { error: 'nosolution' };
    }
  } else {
    // ASA / AAS: two angles and one side
    const t = { ...g };
    const missing = ['A', 'B', 'C'].find((k) => !angles.includes(k));
    t[missing] = 180 - angles.reduce((s2, k) => s2 + g[k], 0);
    const known = sides[0];
    const k = g[known] / sin(t[opp[known]]);
    for (const s of ['a', 'b', 'c']) if (s !== known) t[s] = k * sin(t[opp[s]]);
    out.push(finish(t, angles.includes(opp[known]) ? 'aas' : 'asa'));
  }
  return { triangles: out.filter(valid) };
}
