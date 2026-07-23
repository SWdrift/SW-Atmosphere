import { cross, dot, normalize, scale, add, type Vec3 } from './vector3.ts'

export type Quaternion = readonly [x: number, y: number, z: number, w: number]

export function normalizeQuaternion(quaternion: Quaternion): Quaternion {
  const magnitude = Math.hypot(
    quaternion[0],
    quaternion[1],
    quaternion[2],
    quaternion[3],
  )

  if (!Number.isFinite(magnitude) || magnitude <= 1e-12) {
    throw new Error('无法归一化零四元数或非有限四元数。')
  }

  return [
    quaternion[0] / magnitude,
    quaternion[1] / magnitude,
    quaternion[2] / magnitude,
    quaternion[3] / magnitude,
  ]
}

export function quaternionFromAxisAngle(axis: Vec3, radians: number): Quaternion {
  if (!Number.isFinite(radians)) {
    throw new Error('四元数旋转角必须是有限数。')
  }

  const unitAxis = normalize(axis)
  const halfAngle = radians * 0.5
  const sine = Math.sin(halfAngle)

  return [
    unitAxis[0] * sine,
    unitAxis[1] * sine,
    unitAxis[2] * sine,
    Math.cos(halfAngle),
  ]
}

export function multiplyQuaternions(
  left: Quaternion,
  right: Quaternion,
): Quaternion {
  const [lx, ly, lz, lw] = left
  const [rx, ry, rz, rw] = right

  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ]
}

export function quaternionFromBasis(right: Vec3, forward: Vec3, up: Vec3): Quaternion {
  const m00 = right[0]
  const m01 = forward[0]
  const m02 = up[0]
  const m10 = right[1]
  const m11 = forward[1]
  const m12 = up[1]
  const m20 = right[2]
  const m21 = forward[2]
  const m22 = up[2]
  const trace = m00 + m11 + m22
  let quaternion: Quaternion

  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2
    quaternion = [
      (m21 - m12) / scale,
      (m02 - m20) / scale,
      (m10 - m01) / scale,
      scale * 0.25,
    ]
  } else if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2
    quaternion = [
      scale * 0.25,
      (m01 + m10) / scale,
      (m02 + m20) / scale,
      (m21 - m12) / scale,
    ]
  } else if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2
    quaternion = [
      (m01 + m10) / scale,
      scale * 0.25,
      (m12 + m21) / scale,
      (m02 - m20) / scale,
    ]
  } else {
    const scale = Math.sqrt(1 + m22 - m00 - m11) * 2
    quaternion = [
      (m02 + m20) / scale,
      (m12 + m21) / scale,
      scale * 0.25,
      (m10 - m01) / scale,
    ]
  }

  return normalizeQuaternion(quaternion)
}

export function rotateVectorByQuaternion(vector: Vec3, quaternion: Quaternion): Vec3 {
  const quaternionVector: Vec3 = [quaternion[0], quaternion[1], quaternion[2]]
  const uv = cross(quaternionVector, vector)
  const uuv = cross(quaternionVector, uv)

  return add(
    vector,
    add(scale(uv, 2 * quaternion[3]), scale(uuv, 2)),
  )
}

export function isUnitQuaternion(quaternion: Quaternion, tolerance = 1e-9): boolean {
  const squaredLength =
    dot(
      [quaternion[0], quaternion[1], quaternion[2]],
      [quaternion[0], quaternion[1], quaternion[2]],
    ) +
    quaternion[3] * quaternion[3]

  return Math.abs(squaredLength - 1) <= tolerance
}
