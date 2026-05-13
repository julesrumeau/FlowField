export const velocityShader = /* glsl */`
  uniform float u_time;
  uniform float u_speed;
  uniform float u_turbulence;
  uniform float u_noiseScale;
  uniform float u_seedOffset;
  uniform sampler2D tPerm;

  float fade(float t) { return t*t*t*(t*(t*6.0 - 15.0) + 10.0); }

  // Read perm[i] from a 16×32 RGBA8 texture (R channel = uint8 value / 255)
  float permLookup(float i) {
    float col = mod(i, 16.0);
    float row = floor(i / 16.0);
    vec2 uv = (vec2(col, row) + 0.5) / vec2(16.0, 32.0);
    return floor(texture2D(tPerm, uv).r * 255.0 + 0.5);
  }

  float gradF(float hash, float x, float y, float z) {
    float h = mod(hash, 16.0);
    float u = h < 8.0 ? x : y;
    float v = (h < 4.0) ? y : ((abs(h - 12.0) < 0.5 || abs(h - 14.0) < 0.5) ? x : z);
    return (mod(h, 2.0) < 1.0 ? u : -u) + (mod(floor(h / 2.0), 2.0) < 1.0 ? v : -v);
  }

  float noise3D(float x, float y, float z) {
    float X = mod(floor(x), 256.0);
    float Y = mod(floor(y), 256.0);
    float Z = mod(floor(z), 256.0);
    x -= floor(x); y -= floor(y); z -= floor(z);
    float u = fade(x), v = fade(y), w = fade(z);
    float A  = permLookup(X)       + Y;
    float AA = permLookup(A)       + Z;
    float AB = permLookup(A + 1.0) + Z;
    float B  = permLookup(X + 1.0) + Y;
    float BA = permLookup(B)       + Z;
    float BB = permLookup(B + 1.0) + Z;
    return mix(
      mix(
        mix(gradF(permLookup(AA),       x,      y,      z      ),
            gradF(permLookup(BA),       x-1.0,  y,      z      ), u),
        mix(gradF(permLookup(AB),       x,      y-1.0,  z      ),
            gradF(permLookup(BB),       x-1.0,  y-1.0,  z      ), u), v),
      mix(
        mix(gradF(permLookup(AA + 1.0), x,      y,      z-1.0  ),
            gradF(permLookup(BA + 1.0), x-1.0,  y,      z-1.0  ), u),
        mix(gradF(permLookup(AB + 1.0), x,      y-1.0,  z-1.0  ),
            gradF(permLookup(BB + 1.0), x-1.0,  y-1.0,  z-1.0  ), u), v), w);
  }

  void main() {
    vec2 uv  = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    float s = u_noiseScale;
    float o = u_seedOffset;
    float t = u_time;

    float vx = noise3D(pos.x*s + o,         pos.y*s + o,         pos.z*s + t*0.031 + o        );
    float vy = noise3D(pos.x*s + o + 100.0,  pos.y*s + o + 100.0, pos.z*s + t*0.050 + o + 100.0);
    float vz = noise3D(pos.x*s + o + 200.0,  pos.y*s + o + 200.0, pos.z*s + t*0.041 + o + 200.0);

    float len = length(vec3(vx, vy, vz));
    len = max(len, 0.0001);
    vec3 dir = vec3(vx, vy, vz) / len;

    vec3 target = dir * u_speed;
    vel += (target - vel) * u_turbulence;

    gl_FragColor = vec4(vel, 1.0);
  }
`;
