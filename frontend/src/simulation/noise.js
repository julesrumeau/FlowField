// Ken Perlin's Improved Noise (2002) — correct 3D gradient noise, output ≈ [-0.7, 0.7]
export function createNoise(seed) {
  const perm = new Uint8Array(512);
  const src  = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;

  // Fisher-Yates shuffle seeded with LCG
  let s = (seed ^ 0x45FA91C3) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = src[i]; src[i] = src[j]; src[j] = tmp;
  }
  for (let i = 0; i < 256; i++) perm[i] = perm[i + 256] = src[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  function noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = fade(x), v = fade(y), w = fade(z);

    const A  = perm[X]     + Y;
    const AA = perm[A]     + Z,  AB = perm[A + 1] + Z;
    const B  = perm[X + 1] + Y;
    const BA = perm[B]     + Z,  BB = perm[B + 1] + Z;

    const x1 = x - 1, y1 = y - 1, z1 = z - 1;

    return lerp(
      lerp(
        lerp(grad(perm[AA],     x,  y,  z ), grad(perm[BA],     x1, y,  z ), u),
        lerp(grad(perm[AB],     x,  y1, z ), grad(perm[BB],     x1, y1, z ), u),
        v
      ),
      lerp(
        lerp(grad(perm[AA + 1], x,  y,  z1), grad(perm[BA + 1], x1, y,  z1), u),
        lerp(grad(perm[AB + 1], x,  y1, z1), grad(perm[BB + 1], x1, y1, z1), u),
        v
      ),
      w
    );
  }

  return { noise3D };
}
