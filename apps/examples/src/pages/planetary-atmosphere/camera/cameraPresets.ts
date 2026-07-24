import {
  INITIAL_CAMERA_RADIAL,
  WORLD_UP,
} from '../math/coordinates.ts'
import {
  add,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from '../math/vector3.ts'

export const INITIAL_CAMERA_ALTITUDE_KM = 1.5

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

  const radius = planetRadiusKm + preset.altitudeKm
  const position = scale(INITIAL_CAMERA_RADIAL, radius)
  let forward: Vec3
  let up = WORLD_UP

  if (preset.view === 'tangent') {
    forward = [1, 0, 0]
  } else if (preset.view === 'limb') {
    forward = [
      0,
      Math.sqrt(1 - (planetRadiusKm / radius) ** 2),
      planetRadiusKm / radius,
    ]
  } else {
    forward = scale(INITIAL_CAMERA_RADIAL, -1)
  }

  if (preset.rollDegrees !== 0) {
    const rollRadians = (preset.rollDegrees * Math.PI) / 180
    const baseRight = normalize(
      projectOntoPlane(INITIAL_CAMERA_RADIAL, forward),
    )
    up = add(
      scale(baseRight, Math.sin(rollRadians)),
      scale(WORLD_UP, Math.cos(rollRadians)),
    )
  }

  return { position, forward, up }
}
