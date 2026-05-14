export const velocityShader = /* glsl */`
  uniform float u_time;
  uniform float u_speed;
  uniform float u_turbulence;
  uniform float u_noiseScale;
  uniform float u_seedOffset;
  uniform sampler2D tPerm;   // table de permutation du bruit de Perlin, passée en texture GPU

  // Courbe de lissage de Ken Perlin (2002) : 6t⁵ - 15t⁴ + 10t³
  // Dérivée nulle en 0 et 1 → raccord parfaitement lisse entre cellules, sans arêtes visibles
  float fade(float t) { return t*t*t*(t*(t*6.0 - 15.0) + 10.0); }

  // Lit la valeur perm[i] depuis la texture 16x32.
  // GLSL n'a pas de tableaux dynamiques, donc on encode la table dans une texture
  // et on calcule l'UV correspondant à l'index i.
  // +0.5 pour centrer l'UV au milieu du texel (évite les erreurs d'arrondi)
  // *255 pour reconstruire l'entier depuis la valeur normalisée [0,1] du canal R
  float permLookup(float i) {
    float col = mod(i, 16.0);
    float row = floor(i / 16.0);
    vec2 uv = (vec2(col, row) + 0.5) / vec2(16.0, 32.0);
    return floor(texture2D(tPerm, uv).r * 255.0 + 0.5);
  }

  // Calcule le produit scalaire entre un vecteur gradient (parmi 12 possibles)
  // et le vecteur distance au coin du cube.
  // Les 12 gradients sont les arêtes d'un cube : (±1,±1,0), (±1,0,±1), (0,±1,±1)
  // Encodés sans if/else flottant pour éviter les branchements coûteux sur GPU
  float gradF(float hash, float x, float y, float z) {
    float h = mod(hash, 16.0);
    float u = h < 8.0 ? x : y;
    float v = (h < 4.0) ? y : ((abs(h - 12.0) < 0.5 || abs(h - 14.0) < 0.5) ? x : z);
    return (mod(h, 2.0) < 1.0 ? u : -u) + (mod(floor(h / 2.0), 2.0) < 1.0 ? v : -v);
  }

  // Bruit de Perlin 3D classique.
  // Principe : pour un point (x,y,z), on trouve la cellule de grille qui le contient,
  // on évalue un gradient aux 8 coins du cube, et on interpole trilinéairement.
  float noise3D(float x, float y, float z) {
    // Coordonnées de la cellule (modulo 256 pour boucler sur la table de permutation)
    float X = mod(floor(x), 256.0);
    float Y = mod(floor(y), 256.0);
    float Z = mod(floor(z), 256.0);
    // Position locale dans la cellule [0, 1]
    x -= floor(x); y -= floor(y); z -= floor(z);
    // Courbes de lissage sur chaque axe
    float u = fade(x), v = fade(y), w = fade(z);
    // Calcul des hash pour les 8 coins du cube via la table de permutation
    float A  = permLookup(X)       + Y;
    float AA = permLookup(A)       + Z;
    float AB = permLookup(A + 1.0) + Z;
    float B  = permLookup(X + 1.0) + Y;
    float BA = permLookup(B)       + Z;
    float BB = permLookup(B + 1.0) + Z;
    // Interpolation trilinéaire des contributions des 8 coins → valeur dans [-1, 1]
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
    // Chaque pixel de la texture = une particule. UV = identifiant unique de la particule.
    vec2 uv  = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;   // position actuelle de cette particule
    vec3 vel = texture2D(textureVelocity, uv).xyz;   // vélocité actuelle

    float s = u_noiseScale;   // densité du champ (slider) : plus grand = tourbillons serrés
    float o = u_seedOffset;   // décalage lié au seed : change la "forme" du champ
    float t = u_time;         // temps en secondes : fait évoluer le champ au fil du temps

    // On évalue 3 bruits indépendants pour obtenir un vecteur 3D.
    // Les décalages +100 et +200 sur Y et Z assurent que les 3 composantes sont
    // décorrélées (sinon vx=vy=vz → mouvement sur la diagonale uniquement).
    // Les coefficients de temps différents (0.031, 0.050, 0.041) évitent que
    // le champ évolue de façon synchrone sur les 3 axes.
    float vx = noise3D(pos.x*s + o,         pos.y*s + o,         pos.z*s + t*0.031 + o        );
    float vy = noise3D(pos.x*s + o + 100.0,  pos.y*s + o + 100.0, pos.z*s + t*0.050 + o + 100.0);
    float vz = noise3D(pos.x*s + o + 200.0,  pos.y*s + o + 200.0, pos.z*s + t*0.041 + o + 200.0);

    // Normalisation : on veut une direction, pas une amplitude.
    // Sans ça, les zones où le bruit est faible donneraient des particules lentes
    // et les zones fortes des particules rapides — effet visuel inégal.
    float len = length(vec3(vx, vy, vz));
    len = max(len, 0.0001);              // évite la division par zéro
    vec3 dir = vec3(vx, vy, vz) / len;  // vecteur unitaire : la direction du champ

    // Lissage exponentiel (filtre IIR) : la vélocité se rapproche progressivement
    // de la cible plutôt que d'y sauter instantanément.
    // turbulence=1.0 → réactif/saccadé | turbulence=0.01 → inertiel/fluide
    vec3 target = dir * u_speed;
    vel += (target - vel) * u_turbulence;

    gl_FragColor = vec4(vel, 1.0);   // on écrit la nouvelle vélocité dans la texture
  }
`;
