// The five shader programs the 3D map needs, and the little helper that
// builds them. WebGL 1, so fragment shaders declare their precision.

export interface Program {
  prog: WebGLProgram;
  attr: Record<string, number>;
  uni: Record<string, WebGLUniformLocation | null>;
}

function build(gl: WebGLRenderingContext, vs: string, fs: string, attrs: string[], unis: string[]): Program {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`shader: ${gl.getShaderInfoLog(sh) ?? 'compile failed'}`);
    }
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(prog) ?? 'link failed'}`);
  }
  const attr: Record<string, number> = {};
  for (const a of attrs) attr[a] = gl.getAttribLocation(prog, a);
  const uni: Record<string, WebGLUniformLocation | null> = {};
  for (const u of unis) uni[u] = gl.getUniformLocation(prog, u);
  return { prog, attr, uni };
}

/** Soft round points: stars, Kuiper speckle, signal pulses. */
const POINTS_VS = `
attribute vec3 a_pos;
attribute float a_size;
attribute float a_alpha;
uniform mat4 u_mvp;
uniform float u_dpr;
varying float v_alpha;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  gl_PointSize = a_size * u_dpr;
  v_alpha = a_alpha;
}`;
const POINTS_FS = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.55, r) * v_alpha;
  gl_FragColor = vec4(u_color, a);
}`;

/** Plain lines: orbit rings, stems, the signal path. */
const LINES_VS = `
attribute vec3 a_pos;
uniform mat4 u_mvp;
void main() { gl_Position = u_mvp * vec4(a_pos, 1.0); }`;
const LINES_FS = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

/**
 * Lambert-lit bodies, lit from the Sun at the origin: a colour map where the
 * planet has one, a flat tint otherwise. Normals go through the model's
 * rotation (uniform scale, so the upper 3x3 serves). `u_ring` lights both
 * faces, for a disc seen from either side, and takes `u_alpha`.
 */
const LIT_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
attribute vec2 a_uv;
uniform mat4 u_model;
uniform mat4 u_vp;
varying vec3 v_world;
varying vec3 v_nrm;
varying vec2 v_uv;
void main() {
  vec4 w = u_model * vec4(a_pos, 1.0);
  v_world = w.xyz;
  v_nrm = mat3(u_model) * a_nrm;
  v_uv = a_uv;
  gl_Position = u_vp * w;
}`;
const LIT_FS = `
precision mediump float;
uniform vec3 u_color;
uniform sampler2D u_tex;
uniform float u_useTex;
uniform float u_ring;
uniform float u_alpha;
varying vec3 v_world;
varying vec3 v_nrm;
varying vec2 v_uv;
void main() {
  vec3 toSun = normalize(-v_world);
  float nd = dot(normalize(v_nrm), toSun);
  float d = u_ring > 0.5 ? abs(nd) : max(nd, 0.0);
  vec3 base = u_useTex > 0.5 ? texture2D(u_tex, v_uv).rgb : u_color;
  // Rings are bright at every Sun elevation (they scatter as much as they
  // reflect), so the flat disc keeps a high floor; the spheres keep a night.
  float amb = u_ring > 0.5 ? 0.55 : 0.16;
  vec3 c = base * (amb + (1.05 - amb) * d);
  gl_FragColor = vec4(c, u_alpha);
}`;

/** A camera-facing quad with a radial glow: the Sun. */
const GLOW_VS = `
attribute vec2 a_corner;
uniform vec3 u_center;
uniform float u_size;
uniform mat4 u_view;
uniform mat4 u_proj;
varying vec2 v_uv;
void main() {
  vec4 c = u_view * vec4(u_center, 1.0);
  c.xy += a_corner * u_size;
  gl_Position = u_proj * c;
  v_uv = a_corner;
}`;
const GLOW_FS = `
precision mediump float;
uniform vec3 u_color;
varying vec2 v_uv;
void main() {
  float r = length(v_uv);
  float core = 1.0 - smoothstep(0.62, 0.65, r);
  float halo = (1.0 - smoothstep(0.60, 1.0, r)) * 0.32;
  float a = max(core, halo);
  gl_FragColor = vec4(u_color, a);
}`;

/**
 * The sky: NASA's Deep Star Maps 2020 wrapped on the celestial sphere at
 * infinity. One full-screen quad; each fragment turns its view ray into a
 * world direction, then into right ascension and declination, and samples the
 * map there. So the Milky Way sits where it really is relative to the planets,
 * in the scene's frame (x = -map x, up = ecliptic north, z = map y). Map layout: RA 0h at the centre, increasing leftward,
 * north up (verified against the Magellanic Clouds).
 */
const SKY_VS = `
attribute vec2 a_corner;
varying vec2 v_ndc;
void main() { v_ndc = a_corner; gl_Position = vec4(a_corner, 0.9999, 1.0); }`;
const SKY_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform vec3 u_ax;
uniform vec3 u_ay;
uniform vec3 u_az;
uniform vec2 u_tan;
uniform float u_shift;
uniform float u_gain;
varying vec2 v_ndc;
const float PI = 3.14159265358979;
const float EPS = 0.40909280422;
void main() {
  vec3 rv = vec3((v_ndc.x + u_shift) * u_tan.x, v_ndc.y * u_tan.y, -1.0);
  vec3 d = normalize(u_ax * rv.x + u_ay * rv.y + u_az * rv.z);
  float lon = atan(d.z, -d.x) + PI * 0.5;
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float cl = cos(lat);
  vec3 e = vec3(cos(lon) * cl, sin(lon) * cl, sin(lat));
  float ce = cos(EPS), se = sin(EPS);
  vec3 q = vec3(e.x, e.y * ce - e.z * se, e.y * se + e.z * ce);
  float ra = atan(q.y, q.x);
  float dec = asin(clamp(q.z, -1.0, 1.0));
  vec2 uv = vec2(0.5 - ra / (2.0 * PI), 0.5 - dec / PI);
  gl_FragColor = vec4(texture2D(u_tex, uv).rgb * u_gain, 1.0);
}`;

export interface Programs {
  points: Program;
  lines: Program;
  lit: Program;
  glow: Program;
  sky: Program;
}

export function buildPrograms(gl: WebGLRenderingContext): Programs {
  return {
    points: build(gl, POINTS_VS, POINTS_FS, ['a_pos', 'a_size', 'a_alpha'], ['u_mvp', 'u_dpr', 'u_color']),
    lines: build(gl, LINES_VS, LINES_FS, ['a_pos'], ['u_mvp', 'u_color']),
    lit: build(gl, LIT_VS, LIT_FS, ['a_pos', 'a_nrm', 'a_uv'], ['u_model', 'u_vp', 'u_color', 'u_tex', 'u_useTex', 'u_ring', 'u_alpha']),
    glow: build(gl, GLOW_VS, GLOW_FS, ['a_corner'], ['u_center', 'u_size', 'u_view', 'u_proj', 'u_color']),
    sky: build(gl, SKY_VS, SKY_FS, ['a_corner'], ['u_tex', 'u_ax', 'u_ay', 'u_az', 'u_tan', 'u_shift', 'u_gain']),
  };
}
