import { CAMERA_PITCH_LIMIT_RADIANS } from '../math/coordinates.ts'
import { normalize, type Vec3 } from '../math/vector3.ts'

export interface OrbitAngles {
  azimuthRadians: number
  elevationRadians: number
}

export function orbitAnglesFromRadial(radial: Vec3): OrbitAngles {
  const direction = normalize(radial)

  return {
    azimuthRadians: Math.atan2(direction[0], -direction[1]),
    elevationRadians: Math.max(
      -CAMERA_PITCH_LIMIT_RADIANS,
      Math.min(CAMERA_PITCH_LIMIT_RADIANS, Math.asin(direction[2])),
    ),
  }
}

export function orbitRadialFromAngles(angles: OrbitAngles): Vec3 {
  const horizontal = Math.cos(angles.elevationRadians)

  return normalize([
    Math.sin(angles.azimuthRadians) * horizontal,
    -Math.cos(angles.azimuthRadians) * horizontal,
    Math.sin(angles.elevationRadians),
  ])
}

export function rotateOrbitAngles(
  angles: OrbitAngles,
  azimuthDeltaRadians: number,
  elevationDeltaRadians: number,
): OrbitAngles {
  return {
    azimuthRadians: angles.azimuthRadians + azimuthDeltaRadians,
    elevationRadians: Math.max(
      -CAMERA_PITCH_LIMIT_RADIANS,
      Math.min(
        CAMERA_PITCH_LIMIT_RADIANS,
        angles.elevationRadians + elevationDeltaRadians,
      ),
    ),
  }
}
