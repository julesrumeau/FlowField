export const positionShader = /* glsl */`
  uniform float u_dt;
  uniform float u_bounds;

  void main() {
    vec2 uv  = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    pos += vel * u_dt;

    if (pos.x >  u_bounds) pos.x = -u_bounds;
    if (pos.x < -u_bounds) pos.x =  u_bounds;
    if (pos.y >  u_bounds) pos.y = -u_bounds;
    if (pos.y < -u_bounds) pos.y =  u_bounds;
    if (pos.z >  u_bounds) pos.z = -u_bounds;
    if (pos.z < -u_bounds) pos.z =  u_bounds;

    gl_FragColor = vec4(pos, 1.0);
  }
`;
