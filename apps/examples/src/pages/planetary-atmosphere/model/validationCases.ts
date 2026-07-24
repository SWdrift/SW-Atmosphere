import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import type { AtmosphereQuality } from '../atmosphere/AtmosphereRenderer.ts'
import {
  cameraPresetPose,
  type CameraPresetId,
  type CameraPresetPose,
} from '../camera/cameraPresets.ts'
import { normalize } from '../math/vector3.ts'
import {
  cloneAtmosphereControls,
  createEarthControls,
  type AtmosphereControls,
} from './atmosphereState.ts'
import type { WorkbenchPath } from './workbenchPath.ts'

export interface ValidationReference {
  src: string
  label: string
  comparable: string
  unknowns: string
}

interface ValidationControls {
  quality: AtmosphereQuality
  verticalFovDegrees: number
  sunAzimuthDegrees: number
  sunElevationDegrees: number
  exposure: number
}

export interface ValidationCase {
  id: string
  label: string
  baseline: 'earth-clear'
  cameraPreset: CameraPresetId
  controls: ValidationControls
  reference: ValidationReference | null
  path: WorkbenchPath | null
}

const HIGH_ALTITUDE_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/atmosphere-reference/a-wide-angle-view-shows-the-earths-atmosphere-and-clouds-from-high-altitude-with-a-dark-blue-sky-above-photo.jpg',
    import.meta.url,
  ).href,
  label: '高空大气层次参考',
  comparable: '地平线亮层、天顶深蓝和向太空的连续过渡。',
  unknowns: '拍摄高度、镜头、曝光、白平衡和后期处理未知；忽略云与地表。',
}

const TWILIGHT_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/atmosphere-reference/an-aerial-view-captures-a-vibrant-sunset-or-sunrise-painting-the-horizon-above-a-vast-cloudscape-photo.jpg',
    import.meta.url,
  ).href,
  label: '晨昏层次参考',
  comparable: '低层暖色、上层蓝色与夜侧衰减的相对层次。',
  unknowns: '拍摄位置、太阳几何高度、曝光和白平衡未知；忽略云形与地表。',
}

const SPACE_LIMB_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/atmosphere-reference/The_Earth_s_atmosphere_seen_from_space.jpg',
    import.meta.url,
  ).href,
  label: '太空 limb 参考',
  comparable: '大气边缘厚度、色序以及向黑色太空的连续衰减。',
  unknowns: '轨道高度、FOV、曝光和图像处理未知；不比较地表与云。',
}

const PLANETARY_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/atmosphere-reference/EarthsAtmosphereNASAPic.jpg',
    import.meta.url,
  ).href,
  label: '行星盘大气参考',
  comparable: '受光 limb、表面晨昏关系和大气外整体层次。',
  unknowns: '相机响应、合成处理和准确太阳方位未知；不比较地表纹理。',
}

function validationControls(
  quality: AtmosphereQuality,
  verticalFovDegrees: number,
  sunAzimuthDegrees: number,
  sunElevationDegrees: number,
  exposure: number,
): ValidationControls {
  return {
    quality,
    verticalFovDegrees,
    sunAzimuthDegrees,
    sunElevationDegrees,
    exposure,
  }
}

function createControlsFromSpecification(
  specification: ValidationControls,
): AtmosphereControls {
  const result = createEarthControls()
  result.camera.verticalFovDegrees =
    specification.verticalFovDegrees
  result.sun.azimuthDegrees = specification.sunAzimuthDegrees
  result.sun.elevationDegrees = specification.sunElevationDegrees
  result.rendering.exposure = specification.exposure
  result.rendering.quality = specification.quality
  result.rendering.multipleScattering =
    specification.quality !== 'reference'
  result.rendering.debugView = 'final'
  result.debug.geometry = false
  result.debug.grid = false
  result.debug.skyGrid = false

  return result
}

function limbPose(altitudeKm: number): CameraPresetPose {
  const planetRadiusKm = EARTH_ATMOSPHERE.bottomRadiusKm
  const radiusKm = planetRadiusKm + altitudeKm

  if (!Number.isFinite(altitudeKm) || altitudeKm <= 0) {
    throw new Error('limb 路径高度必须是有限正数。')
  }

  return {
    position: [0, -radiusKm, 0],
    forward: normalize([
      0,
      Math.sqrt(1 - (planetRadiusKm / radiusKm) ** 2),
      planetRadiusKm / radiusKm,
    ]),
    up: [0, 0, 1],
  }
}

const SPACE_LIMB_PATH: WorkbenchPath = {
  id: 'space-limb-rise',
  label: '沿 limb 上升',
  steps: [
    {
      type: 'set-camera-pose',
      pose: cameraPresetPose(
        'space-limb',
        EARTH_ATMOSPHERE.bottomRadiusKm,
      ),
    },
    {
      type: 'set-controls',
      controls: createControlsFromSpecification(
        validationControls('high', 20, 90, 0, 10),
      ),
    },
    {
      type: 'checkpoint',
      id: 'space-limb-start',
    },
    {
      type: 'move-camera',
      from: limbPose(400),
      to: limbPose(800),
      durationMilliseconds: 1_500,
    },
    {
      type: 'checkpoint',
      id: 'space-limb-800-km',
    },
  ],
}

const GROUND_TERMINATOR_CONTROLS =
  createControlsFromSpecification(
    validationControls('high', 60, 90, 0, 10),
  )
const GROUND_TERMINATOR_AERIAL_CONTROLS =
  cloneAtmosphereControls(GROUND_TERMINATOR_CONTROLS)
GROUND_TERMINATOR_AERIAL_CONTROLS.rendering.debugView =
  'aerial-radiance'

const GROUND_TERMINATOR_PATH: WorkbenchPath = {
  id: 'ground-terminator-comparison',
  label: '对照渲染路径',
  steps: [
    {
      type: 'set-camera-pose',
      pose: cameraPresetPose(
        'surface',
        EARTH_ATMOSPHERE.bottomRadiusKm,
      ),
    },
    {
      type: 'set-controls',
      controls: GROUND_TERMINATOR_CONTROLS,
    },
    {
      type: 'wait',
      durationMilliseconds: 250,
    },
    {
      type: 'checkpoint',
      id: 'production-final',
    },
    {
      type: 'set-controls',
      controls: createControlsFromSpecification(
        validationControls('reference', 60, 90, 0, 10),
      ),
    },
    {
      type: 'wait',
      durationMilliseconds: 250,
    },
    {
      type: 'checkpoint',
      id: 'reference-final',
    },
    {
      type: 'set-controls',
      controls: GROUND_TERMINATOR_AERIAL_CONTROLS,
    },
    {
      type: 'wait',
      durationMilliseconds: 250,
    },
    {
      type: 'checkpoint',
      id: 'aerial-radiance',
    },
  ],
}

export const VALIDATION_CASES = [
  {
    id: 'ground-terminator',
    label: '地表晨昏线 60°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 60, 90, 0, 10),
    reference: TWILIGHT_REFERENCE,
    path: GROUND_TERMINATOR_PATH,
  },
  {
    id: 'ground-sun-plus-five',
    label: '地表太阳 +5°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 60, 95, 0, 10),
    reference: null,
    path: null,
  },
  {
    id: 'ground-sun-minus-one',
    label: '地表太阳 −1°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 60, 89, 0, 10),
    reference: null,
    path: null,
  },
  {
    id: 'ground-civil-twilight',
    label: '地表太阳 −6°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 60, 84, 0, 10),
    reference: null,
    path: null,
  },
  {
    id: 'ground-nautical-twilight',
    label: '地表太阳 −12°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 60, 78, 0, 10),
    reference: null,
    path: null,
  },
  {
    id: 'ground-astronomical-twilight',
    label: '地表太阳 −18°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 60, 72, 0, 10),
    reference: null,
    path: null,
  },
  {
    id: 'narrow-sunrise',
    label: '地表太阳 5°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 5, 90, 0, 2),
    reference: null,
    path: null,
  },
  {
    id: 'narrow-sunrise-10',
    label: '地表太阳 10°',
    baseline: 'earth-clear',
    cameraPreset: 'surface',
    controls: validationControls('high', 10, 90, 0, 2),
    reference: null,
    path: null,
  },
  {
    id: 'high-altitude-terminator',
    label: '高空晨昏线 20 km',
    baseline: 'earth-clear',
    cameraPreset: 'twenty-km',
    controls: validationControls('high', 20, 90, 0, 10),
    reference: HIGH_ALTITUDE_REFERENCE,
    path: null,
  },
  {
    id: 'space-limb',
    label: '太空大气边缘',
    baseline: 'earth-clear',
    cameraPreset: 'space-limb',
    controls: validationControls('high', 20, 90, 0, 10),
    reference: SPACE_LIMB_REFERENCE,
    path: SPACE_LIMB_PATH,
  },
  {
    id: 'planetary-terminator',
    label: '行星盘晨昏线',
    baseline: 'earth-clear',
    cameraPreset: 'deep-space',
    controls: validationControls('high', 20, 90, 0, 10),
    reference: PLANETARY_REFERENCE,
    path: null,
  },
] as const satisfies readonly ValidationCase[]

export type ValidationCaseId = (typeof VALIDATION_CASES)[number]['id']

export function validationCaseById(id: string): ValidationCase {
  const validationCase = VALIDATION_CASES.find(
    (candidate) => candidate.id === id,
  )

  if (!validationCase) {
    throw new Error(`未知验证用例：${id}`)
  }

  return validationCase
}

export function validationCasePath(id: string): string {
  validationCaseById(id)
  return `/planetary-atmosphere/presets/${encodeURIComponent(id)}`
}

export function createValidationControls(
  validationCase: ValidationCase,
): AtmosphereControls {
  if (validationCase.baseline !== 'earth-clear') {
    throw new Error(`未知验证基线：${String(validationCase.baseline)}`)
  }

  return createControlsFromSpecification(validationCase.controls)
}
