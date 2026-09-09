// The four shader programs the 3D map needs, and the little helper that
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

/** Lambert-lit spheres, lit from the Sun at the origin. */
const LIT_VS = `
attribute vec3 a_pos;
attribute vec3 a_nrm;
uniform mat4 u_model;
uniform mat4 u_vp;
varying vec3 v_world;
varying vec3 v_nrm;
void main() {
  vec4 w = u_model * vec4(a_pos, 1.0);
  v_world = w.xyz;
  v_nrm = a_nrm;
  gl_Position = u_vp * w;
}`;
const LIT_FS = `
precision mediump float;
uniform vec3 u_color;
varying vec3 v_world;
varying vec3 v_nrm;
void main() {
  vec3 toSun = normalize(-v_world);
  float d = max(dot(normalize(v_nrm), toSun), 0.0);
  vec3 c = u_color * (0.22 + 0.85 * d);
  gl_FragColor = vec4(c, 1.0);
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
  float core = 1.0 - smoothstep(0.30, 0.36, r);
  float halo = (1.0 - smoothstep(0.30, 1.0, r)) * 0.32;
  float a = max(core, halo);
  gl_FragColor = vec4(u_color, a);
}`;

export interface Programs {
  points: Program;
  lines: Program;
  lit: Program;
  glow: Program;
}

export function buildPrograms(gl: WebGLRenderingContext): Programs {
  return {
    points: build(gl, POINTS_VS, POINTS_FS, ['a_pos', 'a_size', 'a_alpha'], ['u_mvp', 'u_dpr', 'u_color']),
    lines: build(gl, LINES_VS, LINES_FS, ['a_pos'], ['u_mvp', 'u_color']),
    lit: build(gl, LIT_VS, LIT_FS, ['a_pos', 'a_nrm'], ['u_model', 'u_vp', 'u_color']),
    glow: build(gl, GLOW_VS, GLOW_FS, ['a_corner'], ['u_center', 'u_size', 'u_view', 'u_proj', 'u_color']),
  };
}
