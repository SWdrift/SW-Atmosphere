import {
  INITIAL_CAMERA_RADIAL,
  WORLD_UP,
} from '../math/coordinates.ts'
import {
  add,
  cross,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from '../math/vector3.ts'

export const INITIAL_CAMERA_ALTITUDE_KM = 0.0015

export const CAMERA_PRESETS = [
  {
    id: 'surface',
    label: '地表',
    altitudeKm: INITIAL_CAMERA_ALTITUDE_KM,
    view: 'tangent',
    rollDegrees: 0,
  },
  {
    id: 'twenty-km',
    label: '20 km',
    altitudeKm: 20,
    view: 'tangent',
    rollDegrees: 0,
  },
  {
    id: 'tilted-tangent',
    label: '斜向切线 45°',
    altitudeKm: 20,
    view: 'tangent',
    rollDegrees: 45,
  },
  {
    id: 'karman-line',
    label: '100 km',
    altitudeKm: 100,
    view: 'planet',
    rollDegrees: 0,
  },
  {
    id: 'low-orbit',
    label: '低轨',
    altitudeKm: 400,
    view: 'planet',
    rollDegrees: 0,
  },
  {
    id: 'space-limb',
    label: '太空边缘',
    altitudeKm: 400,
    view: 'limb',
    rollDegrees: 0,
  },
  {
    id: 'deep-space',
    label: '深空',
    altitudeKm: 30_000,
    view: 'planet',
    rollDegrees: 0,
  },
] as const

export type CameraPresetId = (typeof CAMERA_PRESETS)[number]['id']

export interface CameraPresetPose {
  position: Vec3
  forward: Vec3
  up: Vec3
}

export function horizonDipRadians(
  altitudeKm: number,
  planetRadiusKm: number,
): number {
  if (
    !Number.isFinite(altitudeKm) ||
    altitudeKm < 0 ||
    !Number.isFinite(planetRadiusKm) ||
    planetRadiusKm <= 0
  ) {
    throw new Error('地平线几何要求有限非负高度和有限正行星半径。')
  }

  return Math.acos(planetRadiusKm / (planetRadiusKm + altitudeKm))
}

export function tangentCameraPose(
  altitudeKm: number,
  planetRadiusKm: number,
  rollDegrees = 0,
): CameraPresetPose {
  const radiusKm = planetRadiusKm + altitudeKm
  const position = scale(INITIAL_CAMERA_RADIAL, radiusKm)
  const localUp = INITIAL_CAMERA_RADIAL
  const dipRadians = horizonDipRadians(altitudeKm, planetRadiusKm)
  const forward = normalize(
    add(
      scale([1, 0, 0], Math.cos(dipRadians)),
      scale(localUp, -Math.sin(dipRadians)),
    ),
  )
  const baseUp = normalize(projectOntoPlane(localUp, forward))

  if (!Number.isFinite(rollDegrees)) {
    throw new Error('摄像机滚转角必须是有限数。')
  }
  if (rollDegrees === 0) {
    return { position, forward, up: baseUp }
  }

  const rollRadians = (rollDegrees * Math.PI) / 180
  const right = normalize(cross(forward, baseUp))
  const up = add(
    scale(baseUp, Math.cos(rollRadians)),
    scale(right, Math.sin(rollRadians)),
  )

  return { position, forward, up }
}

export function cameraPresetPose(
  id: CameraPresetId,
  planetRadiusKm: number,
): CameraPresetPose {
  if (!Number.isFinite(planetRadiusKm) || planetRadiusKm <= 0) {
    throw new Error('摄像机预设的行星半径必须是有限正数。')
  }

  const preset = CAMERA_PRESETS.find((candidate) => candidate.id === id)

  if (!preset) {
    throw new Error(`未知摄像机预设：${id}`)
  }

  if (preset.view === 'tangent' || preset.view === 'limb') {
    return tangentCameraPose(
      preset.altitudeKm,
      planetRadiusKm,
      preset.rollDegrees,
    )
  }

  return {
    position: scale(
      INITIAL_CAMERA_RADIAL,
      planetRadiusKm + preset.altitudeKm,
    ),
    forward: scale(INITIAL_CAMERA_RADIAL, -1),
    up: WORLD_UP,
  }
}
