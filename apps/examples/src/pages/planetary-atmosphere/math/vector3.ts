export type Vec3 = readonly [x: number, y: number, z: number]

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(vector: Vec3, scalar: number): Vec3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2])
}

export function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector)

  if (!Number.isFinite(magnitude) || magnitude <= 1e-12) {
    throw new Error('无法归一化零向量或非有限向量。')
  }

  return scale(vector, 1 / magnitude)
}

export function projectOntoPlane(vector: Vec3, planeNormal: Vec3): Vec3 {
  return subtract(vector, scale(planeNormal, dot(vector, planeNormal)))
}

export function lerp(a: Vec3, b: Vec3, amount: number): Vec3 {
  return add(scale(a, 1 - amount), scale(b, amount))
}

export function isFiniteVector(vector: Vec3): boolean {
  return vector.every(Number.isFinite)
}
