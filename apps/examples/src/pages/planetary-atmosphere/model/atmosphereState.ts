import type {
  AtmosphereDebugView,
  AtmosphereQuality,
} from '../atmosphere/AtmosphereRenderer.ts'
import {
  cloneCelestialScenario,
  createDefaultCelestialScenario,
  type CameraReferenceFrame,
  type CelestialBodyId,
  type CelestialScenario,
} from '../celestial/CelestialSystem.ts'
import {
  type CameraMode,
} from '../camera/CameraController.ts'
import {
  INITIAL_CAMERA_ALTITUDE_KM,
} from '../camera/cameraPresets.ts'
import type { Vec3 } from '../math/vector3.ts'

export type DebugGridPlane = 'xy' | 'xz' | 'yz'

export interface AtmosphereControls {
  camera: {
    mode: CameraMode
    verticalFovDegrees: number
    speedExponent: number
    referenceBodyId: CelestialBodyId
    referenceFrame: CameraReferenceFrame
  }
  celestial: {
    scenario: CelestialScenario
    simulationTimeSeconds: number
    paused: boolean
    timeScale: number
    selectedBodyId: CelestialBodyId
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
  simulationTimeSeconds: number
  referenceBodyId: CelestialBodyId
  sunDistanceKm: number
  moonDistanceKm: number
  sunMoonSeparationDegrees: number
  solarVisibleFraction: number
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

export function createEarthControls(): AtmosphereControls {
  return {
    camera: {
      mode: 'free',
      verticalFovDegrees: 60,
      speedExponent: 0,
      referenceBodyId: 'earth',
      referenceFrame: 'inertial',
    },
    celestial: {
      scenario: createDefaultCelestialScenario(),
      simulationTimeSeconds: 0,
      paused: true,
      timeScale: 3600,
      selectedBodyId: 'earth',
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
    celestial: {
      ...controls.celestial,
      scenario: cloneCelestialScenario(controls.celestial.scenario),
    },
    rendering: { ...controls.rendering },
    debug: { ...controls.debug },
  }
}

export function createInitialTelemetry(): AtmosphereTelemetry {
  return {
    altitudeKm: INITIAL_CAMERA_ALTITUDE_KM,
    localSunElevationDegrees: 0,
    simulationTimeSeconds: 0,
    referenceBodyId: 'earth',
    sunDistanceKm: 0,
    moonDistanceKm: 0,
    sunMoonSeparationDegrees: 0,
    solarVisibleFraction: 1,
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
