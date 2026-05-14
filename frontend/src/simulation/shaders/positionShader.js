export const positionShader = /* glsl */`
  uniform float u_dt;      // delta time en secondes (temps écoulé depuis la dernière frame)
  uniform float u_bounds;  // demi-taille de l'espace de simulation (ex: 50 → cube de -50 à +50)

  void main() {
    // Chaque pixel = une particule. On lit ses données depuis les deux textures GPU.
    vec2 uv  = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    // Intégration d'Euler : nouvelle position = ancienne position + vélocité × dt
    // Méthode la plus simple, suffisante ici car on ne cherche pas une précision physique
    // mais juste un mouvement fluide visuellement à 60fps
    pos += vel * u_dt;

    // Wrap toroïdal : une particule qui sort d'un côté réapparaît de l'autre.
    // Évite les conditions aux limites (rebond, destruction) qui briseraient le flux.
    // On utilise des if explicites et pas mod() car mod() en GLSL gère mal les négatifs.
    if (pos.x >  u_bounds) pos.x = -u_bounds;
    if (pos.x < -u_bounds) pos.x =  u_bounds;
    if (pos.y >  u_bounds) pos.y = -u_bounds;
    if (pos.y < -u_bounds) pos.y =  u_bounds;
    if (pos.z >  u_bounds) pos.z = -u_bounds;
    if (pos.z < -u_bounds) pos.z =  u_bounds;

    gl_FragColor = vec4(pos, 1.0);   // on écrit la nouvelle position dans la texture
  }
`;
