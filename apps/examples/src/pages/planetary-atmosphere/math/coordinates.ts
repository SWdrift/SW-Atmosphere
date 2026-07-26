import {
  add,
  cross,
  dot,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from './vector3.ts'

export const WORLD_FORWARD: Vec3 = [0, 1, 0]
export const WORLD_RIGHT: Vec3 = [1, 0, 0]
export const WORLD_UP: Vec3 = [0, 0, 1]
export const INITIAL_CAMERA_RADIAL: Vec3 = [0, -1, 0]
export const CAMERA_PITCH_LIMIT_RADIANS = (89 * Math.PI) / 180

export function altitudeFromPosition(position: Vec3, planetRadiusKm: number): number {
  return Math.hypot(position[0], position[1], position[2]) - planetRadiusKm
}

export function localUpFromPosition(position: Vec3): Vec3 {
  return normalize(position)
}

export function sunDirectionFromAngles(
  azimuthDegrees: number,
  elevationDegrees: number,
): Vec3 {
  const azimuth = (azimuthDegrees * Math.PI) / 180
  const elevation = (elevationDegrees * Math.PI) / 180
  const horizontal = Math.cos(elevation)

  return normalize(
    add(
      add(
        scale(WORLD_FORWARD, Math.cos(azimuth) * horizontal),
        scale(WORLD_RIGHT, Math.sin(azimuth) * horizontal),
      ),
      scale(WORLD_UP, Math.sin(elevation)),
    ),
  )
}

export function sunAnglesFromDirection(direction: Vec3): {
  azimuthDegrees: number
  elevationDegrees: number
} {
  const normalizedDirection = normalize(direction)

  return {
    azimuthDegrees:
      (Math.atan2(normalizedDirection[0], normalizedDirection[1]) * 180) /
      Math.PI,
    elevationDegrees:
      (Math.asin(normalizedDirection[2]) * 180) / Math.PI,
  }
}

export function sunDirectionFromLocalAngles(
  observerPosition: Vec3,
  horizonForwardHint: Vec3,
  azimuthDegrees: number,
  elevationDegrees: number,
): Vec3 {
  if (
    !Number.isFinite(azimuthDegrees) ||
    !Number.isFinite(elevationDegrees) ||
    elevationDegrees < -90 ||
    elevationDegrees > 90
  ) {
    throw new Error('当地太阳方位必须有限，高度必须位于 -90° 到 90°。')
  }

  const localUp = localUpFromPosition(observerPosition)
  const horizonForward = normalize(
    projectOntoPlane(horizonForwardHint, localUp),
  )
  const horizonRight = normalize(cross(horizonForward, localUp))
  const azimuthRadians = (azimuthDegrees * Math.PI) / 180
  const elevationRadians = (elevationDegrees * Math.PI) / 180
  const horizonDirection = add(
    scale(horizonForward, Math.cos(azimuthRadians)),
    scale(horizonRight, Math.sin(azimuthRadians)),
  )

  const direction = normalize(
    add(
      scale(horizonDirection, Math.cos(elevationRadians)),
      scale(localUp, Math.sin(elevationRadians)),
    ),
  )

  if (Math.abs(dot(direction, localUp) - Math.sin(elevationRadians)) > 1e-12) {
    throw new Error('当地太阳方向未满足目标高度角。')
  }

  return direction
}

export function cameraRayDirection(
  forward: Vec3,
  right: Vec3,
  up: Vec3,
  verticalFovDegrees: number,
  aspect: number,
  normalizedDeviceX: number,
  normalizedDeviceY: number,
): Vec3 {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error('画布宽高比必须是有限正数。')
  }

  if (
    !Number.isFinite(verticalFovDegrees) ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 180
  ) {
    throw new Error('垂直 FOV 必须位于 0 到 180 度之间。')
  }

  const tangent = Math.tan((verticalFovDegrees * Math.PI) / 360)

  return normalize(
    add(
      add(forward, scale(right, normalizedDeviceX * aspect * tangent)),
      scale(up, normalizedDeviceY * tangent),
    ),
  )
}
