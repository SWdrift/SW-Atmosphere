import {
  CAMERA_PITCH_LIMIT_RADIANS,
  WORLD_UP,
} from '../math/coordinates.ts'
import {
  add,
  cross,
  dot,
  length,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from '../math/vector3.ts'

export interface FreeView {
  yawRadians: number
  pitchRadians: number
  rollRadians: number
}

export interface FreeViewBasis {
  right: Vec3
  forward: Vec3
  up: Vec3
}

export function freeViewFromBasis(forward: Vec3, up: Vec3): FreeView {
  const normalizedForward = normalize(forward)
  const pitchRadians = Math.asin(
    Math.max(
      -Math.sin(CAMERA_PITCH_LIMIT_RADIANS),
      Math.min(
        Math.sin(CAMERA_PITCH_LIMIT_RADIANS),
        normalizedForward[2],
      ),
    ),
  )
  const yawRadians = Math.atan2(
    normalizedForward[0],
    normalizedForward[1],
  )
  const constrainedForward: Vec3 = [
    Math.sin(yawRadians) * Math.cos(pitchRadians),
    Math.cos(yawRadians) * Math.cos(pitchRadians),
    Math.sin(pitchRadians),
  ]
  const baseRight = normalize(cross(constrainedForward, WORLD_UP))
  const baseUp = normalize(cross(baseRight, constrainedForward))
  const normalizedUp = normalize(projectOntoPlane(up, constrainedForward))

  return {
    yawRadians,
    pitchRadians,
    rollRadians: Math.atan2(
      dot(normalizedUp, baseRight),
      dot(normalizedUp, baseUp),
    ),
  }
}

export function freeViewBasis(view: FreeView): FreeViewBasis {
  if (
    !Number.isFinite(view.yawRadians) ||
    !Number.isFinite(view.pitchRadians) ||
    !Number.isFinite(view.rollRadians) ||
    Math.abs(view.pitchRadians) > CAMERA_PITCH_LIMIT_RADIANS
  ) {
    throw new Error('自由摄像机视角必须使用有限角度，pitch 必须位于 ±89°。')
  }

  const forward: Vec3 = [
    Math.sin(view.yawRadians) * Math.cos(view.pitchRadians),
    Math.cos(view.yawRadians) * Math.cos(view.pitchRadians),
    Math.sin(view.pitchRadians),
  ]
  const baseRight = normalize(cross(forward, WORLD_UP))
  const baseUp = normalize(cross(baseRight, forward))
  const cosine = Math.cos(view.rollRadians)
  const sine = Math.sin(view.rollRadians)

  return {
    right: add(scale(baseRight, cosine), scale(baseUp, -sine)),
    forward,
    up: add(scale(baseRight, sine), scale(baseUp, cosine)),
  }
}

export function rotateFreeView(
  view: FreeView,
  cameraLocalRotationRadians: Vec3,
): FreeView {
  if (Math.abs(cameraLocalRotationRadians[1]) > 1e-12) {
    throw new Error('鼠标观察旋转不能修改本地滚转。')
  }

  const angleRadians = length(cameraLocalRotationRadians)

  if (!Number.isFinite(angleRadians)) {
    throw new Error('自由摄像机观察旋转必须是有限向量。')
  }

  if (angleRadians <= 1e-12) {
    return view
  }

  const cosine = Math.cos(view.rollRadians)
  const sine = Math.sin(view.rollRadians)
  const pitchDelta =
    cameraLocalRotationRadians[0] * cosine +
    cameraLocalRotationRadians[2] * sine
  const yawDelta =
    cameraLocalRotationRadians[0] * sine -
    cameraLocalRotationRadians[2] * cosine
  const yawRadians = view.yawRadians + yawDelta

  return {
    yawRadians: Math.atan2(Math.sin(yawRadians), Math.cos(yawRadians)),
    pitchRadians: Math.max(
      -CAMERA_PITCH_LIMIT_RADIANS,
      Math.min(
        CAMERA_PITCH_LIMIT_RADIANS,
        view.pitchRadians + pitchDelta,
      ),
    ),
    rollRadians: view.rollRadians,
  }
}

export function rollFreeView(view: FreeView, deltaRadians: number): FreeView {
  if (!Number.isFinite(deltaRadians)) {
    throw new Error('自由摄像机滚转增量必须是有限数。')
  }

  const rollRadians = view.rollRadians + deltaRadians

  return {
    yawRadians: view.yawRadians,
    pitchRadians: view.pitchRadians,
    rollRadians: Math.atan2(Math.sin(rollRadians), Math.cos(rollRadians)),
  }
}
