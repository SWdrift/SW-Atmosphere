import type {
  AtmosphereDebugView,
  AtmosphereQuality,
} from '../atmosphere/AtmosphereRenderer.ts'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import {
  type CameraMode,
} from '../camera/CameraController.ts'
import {
  cameraPresetPose,
  INITIAL_CAMERA_ALTITUDE_KM,
} from '../camera/cameraPresets.ts'
import {
  sunAnglesFromDirection,
  sunDirectionFromLocalAngles,
} from '../math/coordinates.ts'
import type { Vec3 } from '../math/vector3.ts'

export type DebugGridPlane = 'xy' | 'xz' | 'yz'

export interface AtmosphereControls {
  camera: {
    mode: CameraMode
    verticalFovDegrees: number
    speedExponent: number
  }
  sun: {
    azimuthDegrees: number
    elevationDegrees: number
  }
  moon: {
    enabled: boolean
    azimuthDegrees: number
    elevationDegrees: number
  }
  rendering: {
    exposure: number
    quality: AtmosphereQuality
    multipleScattering: boolean
    debugView: AtmosphereDebugView
    aerialPerspectiveSlice: number
    rayleighEnabled: boolean
    mieEnabled: boolean
    ozoneEnabled: boolean
  }
  debug: {
    geometry: boolean
    grid: boolean
    skyGrid: boolean
    axesIndicator: boolean
    attitudeIndicator: boolean
    gridPlane: DebugGridPlane
  }
}

export interface AtmosphereTelemetry {
  altitudeKm: number
  localSunElevationDegrees: number
  actualSpeedKmPerSecond: number
  targetSpeedKmPerSecond: number
  position: Vec3
  viewForward: Vec3 | null
  bodyRight: Vec3 | null
  bodyForward: Vec3 | null
  bodyUp: Vec3 | null
  lookYawDegrees: number | null
  lookPitchDegrees: number | null
  frameMilliseconds: number
  submitMilliseconds: number
  rebuiltPasses: string
  gpuPasses: string
  pointerLocked: boolean
}

export type AtmosphereRuntimePhase =
  | 'initializing'
  | 'running'
  | 'failed'
  | 'stopped'

const INITIAL_CAMERA_POSE = cameraPresetPose(
  'surface',
  EARTH_ATMOSPHERE.bottomRadiusKm,
)
const INITIAL_SUN_ANGLES = sunAnglesFromDirection(
  sunDirectionFromLocalAngles(
    INITIAL_CAMERA_POSE.position,
    [1, 0, 0],
    0,
    20,
  ),
)
const INITIAL_MOON_ANGLES = sunAnglesFromDirection(
  sunDirectionFromLocalAngles(
    INITIAL_CAMERA_POSE.position,
    [1, 0, 0],
    -30,
    0,
  ),
)

export function createEarthControls(): AtmosphereControls {
  return {
    camera: {
      mode: 'free',
      verticalFovDegrees: 60,
      speedExponent: 0,
    },
    sun: {
      azimuthDegrees: INITIAL_SUN_ANGLES.azimuthDegrees,
      elevationDegrees: INITIAL_SUN_ANGLES.elevationDegrees,
    },
    moon: {
      enabled: true,
      azimuthDegrees: INITIAL_MOON_ANGLES.azimuthDegrees,
      elevationDegrees: INITIAL_MOON_ANGLES.elevationDegrees,
    },
    rendering: {
      exposure: 10,
      quality: 'medium',
      multipleScattering: true,
      debugView: 'final',
      aerialPerspectiveSlice: 1,
      rayleighEnabled: true,
      mieEnabled: true,
      ozoneEnabled: true,
    },
    debug: {
      geometry: false,
      grid: true,
      skyGrid: false,
      axesIndicator: true,
      attitudeIndicator: true,
      gridPlane: 'xy',
    },
  }
}

export function cloneAtmosphereControls(
  controls: AtmosphereControls,
): AtmosphereControls {
  return {
    camera: { ...controls.camera },
    sun: { ...controls.sun },
    moon: { ...controls.moon },
    rendering: { ...controls.rendering },
    debug: { ...controls.debug },
  }
}

export function createInitialTelemetry(): AtmosphereTelemetry {
  return {
    altitudeKm: INITIAL_CAMERA_ALTITUDE_KM,
    localSunElevationDegrees: 0,
    actualSpeedKmPerSecond: 0,
    targetSpeedKmPerSecond: 0,
    position: [0, 0, 0],
    viewForward: null,
    bodyRight: null,
    bodyForward: null,
    bodyUp: null,
    lookYawDegrees: null,
    lookPitchDegrees: null,
    frameMilliseconds: 0,
    submitMilliseconds: 0,
    rebuiltPasses: '无',
    gpuPasses: '未采样',
    pointerLocked: false,
  }
}
