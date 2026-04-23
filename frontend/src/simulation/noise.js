// OpenSimplex noise — ported from KdotJPG's Java implementation
export function createNoise(seed) {
  const PERM_SIZE = 256;
  const perm = new Uint8Array(PERM_SIZE);
  const source = new Uint8Array(PERM_SIZE);
  for (let i = 0; i < PERM_SIZE; i++) source[i] = i;

  seed = (seed ^ 0x7f4a7c15) >>> 0;
  for (let i = PERM_SIZE - 1; i >= 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    let r = ((seed >>> 0) % (i + 1) + (i + 1)) % (i + 1);
    perm[i] = source[r];
    source[r] = source[i];
  }

  const STRETCH = -1.0 / 6.0;
  const SQUISH  =  1.0 / 3.0;
  const NORM    =  1.0 / 103.0;

  const GRAD = [
     1,  1,  0, -1,  1,  0,  1, -1,  0, -1, -1,  0,
     1,  0,  1, -1,  0,  1,  1,  0, -1, -1,  0, -1,
     0,  1,  1,  0, -1,  1,  0,  1, -1,  0, -1, -1,
  ];

  function grad(hash, dx, dy, dz) {
    const i = (hash & 0x0f) * 3;
    return GRAD[i] * dx + GRAD[i + 1] * dy + GRAD[i + 2] * dz;
  }

  function contribute(attn, dx, dy, dz, hash) {
    const a = attn - dx * dx - dy * dy - dz * dz;
    if (a <= 0) return 0;
    const a2 = a * a;
    return a2 * a2 * grad(perm[hash & 0xff], dx, dy, dz);
  }

  function noise3D(x, y, z) {
    const stretchOffset = (x + y + z) * STRETCH;
    const xs = x + stretchOffset;
    const ys = y + stretchOffset;
    const zs = z + stretchOffset;

    const xsb = Math.floor(xs);
    const ysb = Math.floor(ys);
    const zsb = Math.floor(zs);

    const squishOffset = (xsb + ysb + zsb) * SQUISH;
    const dx0 = x - (xsb + squishOffset);
    const dy0 = y - (ysb + squishOffset);
    const dz0 = z - (zsb + squishOffset);

    const xins = xs - xsb;
    const yins = ys - ysb;
    const zins = zs - zsb;
    const inSum = xins + yins + zins;

    const h000 = perm[(perm[(perm[xsb & 0xff] + ysb) & 0xff] + zsb) & 0xff];
    const h100 = perm[(perm[(perm[(xsb + 1) & 0xff] + ysb) & 0xff] + zsb) & 0xff];
    const h010 = perm[(perm[(perm[xsb & 0xff] + ysb + 1) & 0xff] + zsb) & 0xff];
    const h001 = perm[(perm[(perm[xsb & 0xff] + ysb) & 0xff] + zsb + 1) & 0xff];
    const h110 = perm[(perm[(perm[(xsb + 1) & 0xff] + ysb + 1) & 0xff] + zsb) & 0xff];
    const h101 = perm[(perm[(perm[(xsb + 1) & 0xff] + ysb) & 0xff] + zsb + 1) & 0xff];
    const h011 = perm[(perm[(perm[xsb & 0xff] + ysb + 1) & 0xff] + zsb + 1) & 0xff];
    const h111 = perm[(perm[(perm[(xsb + 1) & 0xff] + ysb + 1) & 0xff] + zsb + 1) & 0xff];

    let value = 0;

    // Vertex (0,0,0)
    value += contribute(2, dx0, dy0, dz0, h000);

    if (inSum <= 1) {
      // Inside tetrahedron at origin
      const aScore = 1 - inSum - xins; const bScore = 1 - inSum - yins; const cScore = 1 - inSum - zins;
      if (aScore >= bScore && aScore >= cScore) {
        value += contribute(2, dx0 + 1, dy0, dz0, h100);
      } else if (bScore >= aScore && bScore >= cScore) {
        value += contribute(2, dx0, dy0 + 1, dz0, h010);
      } else {
        value += contribute(2, dx0, dy0, dz0 + 1, h001);
      }
      // Two extra vertices
      const s1 = SQUISH;
      value += contribute(2, dx0 - s1, dy0 - s1 + 1, dz0 - s1 + 1, h011);
      value += contribute(2, dx0 - s1 + 1, dy0 - s1, dz0 - s1 + 1, h101);
      value += contribute(2, dx0 - s1 + 1, dy0 - s1 + 1, dz0 - s1, h110);
    } else if (inSum >= 2) {
      // Inside tetrahedron at (1,1,1)
      const s2 = 2 * SQUISH;
      value += contribute(2, dx0 - 1 - s2, dy0 - s2, dz0 - s2, h100);
      value += contribute(2, dx0 - s2, dy0 - 1 - s2, dz0 - s2, h010);
      value += contribute(2, dx0 - s2, dy0 - s2, dz0 - 1 - s2, h001);
      const aScore = xins - 1; const bScore = yins - 1; const cScore = zins - 1;
      if (aScore <= bScore && aScore <= cScore) {
        value += contribute(2, dx0 - 1 - s2, dy0 - 1 - s2, dz0 - 1 - s2, h011);
      } else if (bScore <= aScore && bScore <= cScore) {
        value += contribute(2, dx0 - 1 - s2, dy0 - 1 - s2, dz0 - 1 - s2, h101);
      } else {
        value += contribute(2, dx0 - 1 - s2, dy0 - 1 - s2, dz0 - 1 - s2, h110);
      }
      value += contribute(2, dx0 - 1 - 3 * SQUISH, dy0 - 1 - 3 * SQUISH, dz0 - 1 - 3 * SQUISH, h111);
    } else {
      // Middle two vertices
      const s1 = SQUISH;
      value += contribute(2, dx0 - s1 - 1, dy0 - s1, dz0 - s1, h100);
      value += contribute(2, dx0 - s1, dy0 - s1 - 1, dz0 - s1, h010);
      value += contribute(2, dx0 - s1, dy0 - s1, dz0 - s1 - 1, h001);
      value += contribute(2, dx0 - s1 - 1, dy0 - s1 - 1, dz0 - s1, h110);
      value += contribute(2, dx0 - s1 - 1, dy0 - s1, dz0 - s1 - 1, h101);
      value += contribute(2, dx0 - s1, dy0 - s1 - 1, dz0 - s1 - 1, h011);
    }

    return value * NORM;
  }

  return { noise3D };
}
