import type {
  AtmosphereDebugView,
  AtmosphereQuality,
} from '../atmosphere/AtmosphereRenderer.ts'
import {
  type CameraMode,
} from '../camera/CameraController.ts'
import { INITIAL_CAMERA_ALTITUDE_KM } from '../camera/cameraPresets.ts'
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
    gridPlane: DebugGridPlane
  }
}

export interface AtmosphereTelemetry {
  altitudeKm: number
  localSunElevationDegrees: number
  actualSpeedKmPerSecond: number
  targetSpeedKmPerSecond: number
  position: Vec3
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

export function createEarthControls(): AtmosphereControls {
  return {
    camera: {
      mode: 'free',
      verticalFovDegrees: 60,
      speedExponent: 0,
    },
    sun: {
      azimuthDegrees: 135,
      elevationDegrees: 25,
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
    frameMilliseconds: 0,
    submitMilliseconds: 0,
    rebuiltPasses: '无',
    gpuPasses: '未采样',
    pointerLocked: false,
  }
}
