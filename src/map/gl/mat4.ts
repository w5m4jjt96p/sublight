// Just enough 4x4 matrix maths for a perspective camera. Column-major, the way
// WebGL wants it. No library: the whole thing is forty lines.

export type Mat4 = Float32Array;

export function perspective(fovyRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function lookAt(eye: number[], target: number[], up: number[]): Mat4 {
  let zx = eye[0]! - target[0]!, zy = eye[1]! - target[1]!, zz = eye[2]! - target[2]!;
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1]! * zz - up[2]! * zy, xy = up[2]! * zx - up[0]! * zz, xz = up[0]! * zy - up[1]! * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0]! + xy * eye[1]! + xz * eye[2]!);
  m[13] = -(yx * eye[0]! + yy * eye[1]! + yz * eye[2]!);
  m[14] = -(zx * eye[0]! + zy * eye[1]! + zz * eye[2]!);
  m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** Model matrix: uniform scale then translate. */
export function translateScale(x: number, y: number, z: number, s: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = s; m[5] = s; m[10] = s;
  m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
  return m;
}

/** Clip-space transform of a world point; `out` receives [x, y, z, w]. */
export function transform(m: Mat4, x: number, y: number, z: number, out: number[]): number[] {
  out[0] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  out[1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  out[2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  out[3] = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  return out;
}

/** Model matrix from an orthonormal basis (columns), a uniform scale and a translation. */
export function basisScale(xa: number[], ya: number[], za: number[], x: number, y: number, z: number, s: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = xa[0]! * s; m[1] = xa[1]! * s; m[2] = xa[2]! * s;
  m[4] = ya[0]! * s; m[5] = ya[1]! * s; m[6] = ya[2]! * s;
  m[8] = za[0]! * s; m[9] = za[1]! * s; m[10] = za[2]! * s;
  m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
  return m;
}
