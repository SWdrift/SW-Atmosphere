import type { CameraPresetPose } from '../camera/cameraPresets.ts'
import type { PlanetCamera } from '../camera/PlanetCamera.ts'
import {
  rotateVectorByQuaternion,
  type Quaternion,
} from '../math/quaternion.ts'
import {
  add,
  subtract,
  type Vec3,
} from '../math/vector3.ts'
import {
  bodyFromSnapshot,
  type CameraReferenceFrame,
  type CelestialBodyId,
  type CelestialSnapshot,
} from './CelestialSystem.ts'

export interface CameraReferenceBinding {
  bodyId: CelestialBodyId
  frame: CameraReferenceFrame
}

export interface SystemCameraFrame {
  positionKm: Vec3
  right: Vec3
  forward: Vec3
  up: Vec3
  verticalFovDegrees: number
}

export function cameraSystemFrame(
  snapshot: CelestialSnapshot,
  binding: CameraReferenceBinding,
  camera: PlanetCamera,
): SystemCameraFrame {
  const body = bodyFromSnapshot(snapshot, binding.bodyId)
  const rotation =
    binding.frame === 'body-fixed'
      ? body.systemRotation
      : ([0, 0, 0, 1] as const)

  return {
    positionKm: add(
      body.systemPositionKm,
      rotateVectorByQuaternion(camera.position, rotation),
    ),
    right: rotateVectorByQuaternion(camera.right, rotation),
    forward: rotateVectorByQuaternion(camera.forward, rotation),
    up: rotateVectorByQuaternion(camera.up, rotation),
    verticalFovDegrees: camera.verticalFovDegrees,
  }
}

export function cameraFrameRelativeToBody(
  snapshot: CelestialSnapshot,
  systemCamera: SystemCameraFrame,
  bodyId: CelestialBodyId,
): SystemCameraFrame {
  const body = bodyFromSnapshot(snapshot, bodyId)

  return {
    ...systemCamera,
    positionKm: subtract(
      systemCamera.positionKm,
      body.systemPositionKm,
    ),
  }
}

export function rebaseCameraPose(
  snapshot: CelestialSnapshot,
  previousBinding: CameraReferenceBinding,
  nextBinding: CameraReferenceBinding,
  pose: CameraPresetPose,
): CameraPresetPose {
  const previousBody = bodyFromSnapshot(snapshot, previousBinding.bodyId)
  const previousRotation =
    previousBinding.frame === 'body-fixed'
      ? previousBody.systemRotation
      : ([0, 0, 0, 1] as const)
  const systemPosition = add(
    previousBody.systemPositionKm,
    rotateVectorByQuaternion(pose.position, previousRotation),
  )
  const systemForward = rotateVectorByQuaternion(
    pose.forward,
    previousRotation,
  )
  const systemUp = rotateVectorByQuaternion(pose.up, previousRotation)
  const nextBody = bodyFromSnapshot(snapshot, nextBinding.bodyId)
  const nextInverseRotation =
    nextBinding.frame === 'body-fixed'
      ? conjugateQuaternion(nextBody.systemRotation)
      : ([0, 0, 0, 1] as const)

  return {
    position: rotateVectorByQuaternion(
      subtract(systemPosition, nextBody.systemPositionKm),
      nextInverseRotation,
    ),
    forward: rotateVectorByQuaternion(
      systemForward,
      nextInverseRotation,
    ),
    up: rotateVectorByQuaternion(systemUp, nextInverseRotation),
  }
}

function conjugateQuaternion(quaternion: Quaternion): Quaternion {
  return [
    -quaternion[0],
    -quaternion[1],
    -quaternion[2],
    quaternion[3],
  ]
}
