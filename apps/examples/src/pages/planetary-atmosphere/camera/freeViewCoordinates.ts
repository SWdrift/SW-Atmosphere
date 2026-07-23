import { CAMERA_PITCH_LIMIT_RADIANS } from '../math/coordinates.ts'
import {
  isUnitQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  quaternionFromBasis,
  rotateVectorByQuaternion,
  type Quaternion,
} from '../math/quaternion.ts'
import {
  cross,
  isFiniteVector,
  normalize,
  projectOntoPlane,
  type Vec3,
} from '../math/vector3.ts'

export interface FreeView {
  bodyOrientation: Quaternion
  yawRadians: number
  pitchRadians: number
}

export interface FreeViewBasis {
  right: Vec3
  forward: Vec3
  up: Vec3
}

export function freeViewFromBasis(forward: Vec3, up: Vec3): FreeView {
  const normalizedForward = normalize(forward)
  const normalizedUp = normalize(projectOntoPlane(up, normalizedForward))
  const right = normalize(cross(normalizedForward, normalizedUp))

  return {
    bodyOrientation: quaternionFromBasis(
      right,
      normalizedForward,
      normalizedUp,
    ),
    yawRadians: 0,
    pitchRadians: 0,
  }
}

export function freeViewBasis(view: FreeView): FreeViewBasis {
  if (
    !isUnitQuaternion(view.bodyOrientation) ||
    !Number.isFinite(view.yawRadians) ||
    !Number.isFinite(view.pitchRadians) ||
    Math.abs(view.pitchRadians) > CAMERA_PITCH_LIMIT_RADIANS
  ) {
    throw new Error('自由摄像机必须使用单位 Body 姿态和 ±89° 内的有限观察角。')
  }

  const yaw = quaternionFromAxisAngle([0, 0, -1], view.yawRadians)
  const pitch = quaternionFromAxisAngle([1, 0, 0], view.pitchRadians)
  const orientation = normalizeQuaternion(
    multiplyQuaternions(
      view.bodyOrientation,
      multiplyQuaternions(yaw, pitch),
    ),
  )

  return {
    right: normalize(rotateVectorByQuaternion([1, 0, 0], orientation)),
    forward: normalize(rotateVectorByQuaternion([0, 1, 0], orientation)),
    up: normalize(rotateVectorByQuaternion([0, 0, 1], orientation)),
  }
}

export function rotateFreeView(
  view: FreeView,
  lookRotationRadians: Vec3,
): FreeView {
  if (
    !isFiniteVector(lookRotationRadians) ||
    Math.abs(lookRotationRadians[1]) > 1e-12
  ) {
    throw new Error('鼠标观察旋转必须是有限向量且不能修改 Body 姿态。')
  }

  const yawRadians = view.yawRadians - lookRotationRadians[2]

  return {
    bodyOrientation: view.bodyOrientation,
    yawRadians: Math.atan2(Math.sin(yawRadians), Math.cos(yawRadians)),
    pitchRadians: Math.max(
      -CAMERA_PITCH_LIMIT_RADIANS,
      Math.min(
        CAMERA_PITCH_LIMIT_RADIANS,
        view.pitchRadians + lookRotationRadians[0],
      ),
    ),
  }
}

export function rollFreeBody(view: FreeView, deltaRadians: number): FreeView {
  if (!Number.isFinite(deltaRadians)) {
    throw new Error('自由摄像机 Body 偏转增量必须是有限数。')
  }

  if (Math.abs(deltaRadians) <= 1e-12) {
    return view
  }

  const forward = freeViewBasis(view).forward
  const bodyRoll = quaternionFromAxisAngle(forward, deltaRadians)

  return {
    bodyOrientation: normalizeQuaternion(
      multiplyQuaternions(bodyRoll, view.bodyOrientation),
    ),
    yawRadians: view.yawRadians,
    pitchRadians: view.pitchRadians,
  }
}
