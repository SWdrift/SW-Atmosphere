import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import type {
  AtmosphereDebugView,
  AtmosphereQuality,
} from '../atmosphere/AtmosphereRenderer.ts'
import {
  cameraPresetPose,
  horizonDipRadians,
  INITIAL_CAMERA_ALTITUDE_KM,
  type CameraPresetId,
} from '../camera/cameraPresets.ts'
import {
  sunAnglesFromDirection,
  sunDirectionFromLocalAngles,
} from '../math/coordinates.ts'
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

interface ValidationComponents {
  rayleighEnabled: boolean
  mieEnabled: boolean
  ozoneEnabled: boolean
}

interface ValidationControls {
  quality: AtmosphereQuality
  verticalFovDegrees: number
  sunAzimuthDegrees: number
  sunElevationDegrees: number
  exposure: number
  multipleScattering: boolean
  debugView: AtmosphereDebugView
  aerialPerspectiveSlice: number
  components: ValidationComponents
}

interface FinalControlsInput {
  quality: AtmosphereQuality
  verticalFovDegrees: number
  sunAzimuthDegrees: number
  sunElevationDegrees: number
  exposure: number
  multipleScattering: boolean
  components: ValidationComponents
}

export interface ValidationCase {
  id: string
  label: string
  objective: string
  baseline: 'earth-clear'
  cameraPreset: CameraPresetId
  controls: ValidationControls
  reference: ValidationReference | null
  path: WorkbenchPath | null
}

export interface ValidationCaseGroup {
  id: string
  label: string
  description: string
  cases: readonly ValidationCase[]
}

export interface ValidationCaseCategory {
  id: string
  label: string
  groups: readonly ValidationCaseGroup[]
}

const ALL_COMPONENTS: ValidationComponents = {
  rayleighEnabled: true,
  mieEnabled: true,
  ozoneEnabled: true,
}

const RAYLEIGH_ONLY: ValidationComponents = {
  rayleighEnabled: true,
  mieEnabled: false,
  ozoneEnabled: false,
}

const MIE_ONLY: ValidationComponents = {
  rayleighEnabled: false,
  mieEnabled: true,
  ozoneEnabled: false,
}

const NO_OZONE: ValidationComponents = {
  rayleighEnabled: true,
  mieEnabled: true,
  ozoneEnabled: false,
}

const HIGH_ALTITUDE_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/public/atmoshpere/对流层-陆地-02.webp',
    import.meta.url,
  ).href,
  label: '高空大气层次参考',
  comparable: '地平线亮层、天顶深蓝和向太空的连续过渡。',
  unknowns: '拍摄高度、镜头、曝光、白平衡和后期处理未知；忽略云与地表。',
}

const TWILIGHT_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/public/atmoshpere/暮光-全天空变化过程.webp',
    import.meta.url,
  ).href,
  label: '暮光层次参考',
  comparable: '向日、天顶和背日方向随太阳高度变化的相对层次。',
  unknowns: '拍摄位置、曝光和白平衡未知；不用于确定绝对颜色或辐亮度。',
}

const SPACE_LIMB_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/public/atmoshpere/地球边缘-远景-ISS.webp',
    import.meta.url,
  ).href,
  label: '白昼大气边缘参考',
  comparable: '蓝白薄边、行星轮廓以及向黑色太空的连续衰减。',
  unknowns: '轨道高度、FOV、曝光和图像处理未知；不比较云与地表。',
}

const PLANETARY_REFERENCE: ValidationReference = {
  src: new URL(
    '../../../../../../document/public/atmoshpere/地球边缘-远景-Artemis2.webp',
    import.meta.url,
  ).href,
  label: '行星盘大气参考',
  comparable: '受光 limb、表面照明和大气外整体层次。',
  unknowns: '相机响应、合成处理和准确太阳方位未知；不比较地表纹理。',
}

function finalControls(
  specification: FinalControlsInput,
): ValidationControls {
  return {
    ...specification,
    debugView: 'final',
    aerialPerspectiveSlice: 1,
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
    specification.multipleScattering
  result.rendering.debugView = specification.debugView
  result.rendering.aerialPerspectiveSlice =
    specification.aerialPerspectiveSlice
  result.rendering.rayleighEnabled =
    specification.components.rayleighEnabled
  result.rendering.mieEnabled =
    specification.components.mieEnabled
  result.rendering.ozoneEnabled =
    specification.components.ozoneEnabled
  result.debug.geometry = false
  result.debug.grid = false
  result.debug.skyGrid = false

  if (
    specification.quality === 'reference' &&
    specification.multipleScattering
  ) {
    throw new Error('Reference 验证用例不能开启 Production 多重散射。')
  }

  return result
}

function localSunAngles(
  cameraPreset: CameraPresetId,
  elevationDegrees: number,
): {
  sunAzimuthDegrees: number
  sunElevationDegrees: number
} {
  const pose = cameraPresetPose(
    cameraPreset,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  const direction = sunDirectionFromLocalAngles(
    pose.position,
    [1, 0, 0],
    0,
    elevationDegrees,
  )
  const angles = sunAnglesFromDirection(direction)

  return {
    sunAzimuthDegrees: angles.azimuthDegrees,
    sunElevationDegrees: angles.elevationDegrees,
  }
}

const SURFACE_VISIBLE_HORIZON_ELEVATION_DEGREES =
  (-horizonDipRadians(
    INITIAL_CAMERA_ALTITUDE_KM,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  ) *
    180) /
  Math.PI

const SPACE_LIMB_CONTROLS = finalControls({
  quality: 'high',
  verticalFovDegrees: 20,
  ...localSunAngles('space-limb', 40),
  exposure: 10,
  multipleScattering: true,
  components: ALL_COMPONENTS,
})

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
      controls: createControlsFromSpecification(SPACE_LIMB_CONTROLS),
    },
    {
      type: 'checkpoint',
      id: 'space-limb-start',
    },
    {
      type: 'move-limb-camera',
      fromAltitudeKm: 400,
      toAltitudeKm: 800,
      planetRadiusKm: EARTH_ATMOSPHERE.bottomRadiusKm,
      durationMilliseconds: 1_500,
    },
    {
      type: 'checkpoint',
      id: 'space-limb-800-km',
    },
  ],
}

const GROUND_TERMINATOR_CONTROLS = finalControls({
  quality: 'high',
  verticalFovDegrees: 60,
  ...localSunAngles('surface', 0),
  exposure: 10,
  multipleScattering: true,
  components: ALL_COMPONENTS,
})
const GROUND_TERMINATOR_AERIAL_CONTROLS =
  cloneAtmosphereControls(
    createControlsFromSpecification(GROUND_TERMINATOR_CONTROLS),
  )
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
      controls: createControlsFromSpecification(
        GROUND_TERMINATOR_CONTROLS,
      ),
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
        finalControls({
          quality: 'reference',
          verticalFovDegrees: 60,
          ...localSunAngles('surface', 0),
          exposure: 10,
          multipleScattering: false,
          components: ALL_COMPONENTS,
        }),
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

export const VALIDATION_CASE_CATEGORIES = [
  {
    id: 'observer-scale',
    label: '观察尺度',
    groups: [
      {
        id: 'ground-daylight',
        label: '地表白昼',
        description: '检查近太阳前向散射、地平线长路径和白昼层次。',
        cases: [
          {
            id: 'ground-day-sunward',
            label: '向日地平线 · 太阳 +20°',
            objective: '检查近太阳亮区、地平线长路径和地表直射关系。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 20),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
        ],
      },
      {
        id: 'ground-twilight',
        label: '地表暮光序列',
        description: '按当地太阳高度检查白昼、日落和三段暮光的连续变化。',
        cases: [
          {
            id: 'ground-sun-plus-five',
            label: '太阳 +5°',
            objective: '检查低太阳直射、暖色长路径和天空亮度层级。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 5),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: TWILIGHT_REFERENCE,
            path: null,
          },
          {
            id: 'ground-sun-zero',
            label: '太阳 0°',
            objective: '检查太阳中心位于当地水平面时的圆盘与天空连续变化。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: GROUND_TERMINATOR_CONTROLS,
            reference: TWILIGHT_REFERENCE,
            path: null,
          },
          {
            id: 'ground-sun-minus-one',
            label: '太阳 −1°',
            objective: '检查日落后高层受光与近地阴影的连续分离。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -1),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: TWILIGHT_REFERENCE,
            path: null,
          },
          {
            id: 'ground-civil-twilight',
            label: '民用暮光 · −6°',
            objective: '检查向日、天顶和背日方向仍可辨识的暮光层次。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -6),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: TWILIGHT_REFERENCE,
            path: null,
          },
          {
            id: 'ground-nautical-twilight',
            label: '航海暮光 · −12°',
            objective: '检查多重散射维持的低亮度层次和连续衰减。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -12),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: TWILIGHT_REFERENCE,
            path: null,
          },
          {
            id: 'ground-astronomical-twilight',
            label: '天文暮光 · −18°',
            objective: '检查晴空散射残光的低亮度边界，不把气辉当作已实现能力。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -18),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: TWILIGHT_REFERENCE,
            path: null,
          },
        ],
      },
      {
        id: 'high-altitude',
        label: '高空连续性',
        description: '检查剩余大气柱减少后，地平线亮层到深色天顶的连续变化。',
        cases: [
          {
            id: 'high-altitude-day',
            label: '20 km 白昼',
            objective: '检查高空白昼的地平线亮层、深蓝天顶和连续衰减。',
            baseline: 'earth-clear',
            cameraPreset: 'twenty-km',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('twenty-km', 20),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: HIGH_ALTITUDE_REFERENCE,
            path: null,
          },
          {
            id: 'high-altitude-terminator',
            label: '20 km 晨昏',
            objective: '检查受光高层、进入阴影的低层和太空背景关系。',
            baseline: 'earth-clear',
            cameraPreset: 'twenty-km',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 20,
              ...localSunAngles('twenty-km', 0),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: HIGH_ALTITUDE_REFERENCE,
            path: null,
          },
        ],
      },
      {
        id: 'space-limb',
        label: '太空大气边缘',
        description: '用最大切线路径检查 limb 厚度、色序、终点分类和连续运动。',
        cases: [
          {
            id: 'space-limb',
            label: '白昼侧光 limb',
            objective: '检查蓝白薄边、地表终点和向黑色太空的连续衰减。',
            baseline: 'earth-clear',
            cameraPreset: 'space-limb',
            controls: SPACE_LIMB_CONTROLS,
            reference: SPACE_LIMB_REFERENCE,
            path: SPACE_LIMB_PATH,
          },
          {
            id: 'space-limb-terminator',
            label: '晨昏 limb',
            objective: '检查低太阳切线路径中的暖色低层与蓝色高层关系。',
            baseline: 'earth-clear',
            cameraPreset: 'space-limb',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 20,
              ...localSunAngles('space-limb', 0),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: SPACE_LIMB_REFERENCE,
            path: null,
          },
          {
            id: 'space-limb-backlit',
            label: '背光 limb',
            objective: '检查新月相位下轮廓外前向散射、深夜侧切点和漏光边界。',
            baseline: 'earth-clear',
            cameraPreset: 'space-limb',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 20,
              ...localSunAngles('space-limb', -90),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
        ],
      },
      {
        id: 'planetary-disk',
        label: '深空行星盘',
        description: '检查向阳侧、晨昏线和背光相位下的大气与地表共同辐亮度。',
        cases: [
          {
            id: 'planetary-day',
            label: '向阳侧行星盘',
            objective: '检查受光地表、双程大气路径和行星轮廓亮边。',
            baseline: 'earth-clear',
            cameraPreset: 'deep-space',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 24,
              ...localSunAngles('deep-space', 90),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: PLANETARY_REFERENCE,
            path: null,
          },
          {
            id: 'planetary-terminator',
            label: '行星盘晨昏线',
            objective: '检查表面昼夜边界、受光高层和夜侧大气的连续关系。',
            baseline: 'earth-clear',
            cameraPreset: 'deep-space',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 24,
              ...localSunAngles('deep-space', 0),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: PLANETARY_REFERENCE,
            path: null,
          },
          {
            id: 'planetary-crescent',
            label: '背光新月行星',
            objective: '检查暗面轮廓、细受光弧和大气外路径的能量连续性。',
            baseline: 'earth-clear',
            cameraPreset: 'deep-space',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 24,
              ...localSunAngles('deep-space', -70),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
        ],
      },
    ],
  },
  {
    id: 'diagnostics',
    label: '专项诊断',
    groups: [
      {
        id: 'solar-disk',
        label: '太阳圆盘与窄视场',
        description: '验证物理角尺寸、像素覆盖、遮挡和近太阳散射不随 FOV 改变。',
        cases: [
          {
            id: 'narrow-sunrise',
            label: '地平线太阳 · FOV 5°',
            objective: '放大检查太阳圆盘、抗锯齿边缘和圆盘外散射。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 5,
              ...localSunAngles(
                'surface',
                SURFACE_VISIBLE_HORIZON_ELEVATION_DEGREES,
              ),
              exposure: 2,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'narrow-sunrise-10',
            label: '地平线太阳 · FOV 10°',
            objective: '与 5°/20° 用例比较同一世界射线和太阳能量。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 10,
              ...localSunAngles(
                'surface',
                SURFACE_VISIBLE_HORIZON_ELEVATION_DEGREES,
              ),
              exposure: 2,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'narrow-sunrise-20',
            label: '地平线太阳 · FOV 20°',
            objective: '作为窄视场与常规视场之间的太阳圆盘对照。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 20,
              ...localSunAngles(
                'surface',
                SURFACE_VISIBLE_HORIZON_ELEVATION_DEGREES,
              ),
              exposure: 2,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
        ],
      },
      {
        id: 'components',
        label: '介质分量',
        description: '在相同几何和显示条件下隔离 Rayleigh、Mie 与 ozone 的贡献。',
        cases: [
          {
            id: 'ground-rayleigh-only',
            label: '仅 Rayleigh',
            objective: '检查分子散射的波长与方向贡献。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 20),
              exposure: 10,
              multipleScattering: true,
              components: RAYLEIGH_ONLY,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-mie-only',
            label: '仅 Mie',
            objective: '检查气溶胶前向散射和长路径灰白贡献。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 20),
              exposure: 10,
              multipleScattering: true,
              components: MIE_ONLY,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-no-ozone',
            label: '关闭 Ozone',
            objective: '与完整 Earth clear 对照吸收对长路径颜色和亮度的影响。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 20),
              exposure: 10,
              multipleScattering: true,
              components: NO_OZONE,
            }),
            reference: null,
            path: null,
          },
        ],
      },
      {
        id: 'rendering-paths',
        label: '渲染路径与散射阶数',
        description: '固定几何后分别进入 Reference、Production 单次和 Production 多重散射。',
        cases: [
          {
            id: 'ground-terminator-reference',
            label: 'Reference 单次散射',
            objective: '建立同参数、同阶数的直接积分对照。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'reference',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 0),
              exposure: 10,
              multipleScattering: false,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-terminator-single',
            label: 'Production 单次散射',
            objective: '与 Reference 公平比较 LUT 近似和直接积分。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 0),
              exposure: 10,
              multipleScattering: false,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-terminator',
            label: 'Production 多重散射',
            objective: '比较多重散射贡献，并可运行三阶段渲染路径检查点。',
            baseline: 'earth-clear',
            cameraPreset: 'surface',
            controls: GROUND_TERMINATOR_CONTROLS,
            reference: TWILIGHT_REFERENCE,
            path: GROUND_TERMINATOR_PATH,
          },
        ],
      },
    ],
  },
] as const satisfies readonly ValidationCaseCategory[]

export const VALIDATION_CASES: readonly ValidationCase[] =
  VALIDATION_CASE_CATEGORIES.reduce<ValidationCase[]>(
    (cases, category) => {
      for (const group of category.groups) {
        cases.push(...group.cases)
      }

      return cases
    },
    [],
)

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
