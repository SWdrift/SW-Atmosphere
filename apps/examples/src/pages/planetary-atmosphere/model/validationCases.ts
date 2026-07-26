import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import type {
  AtmosphereDebugView,
  AtmosphereQuality,
} from '../atmosphere/AtmosphereRenderer.ts'
import {
  cameraPresetPose,
  horizonDipRadians,
  INITIAL_CAMERA_ALTITUDE_KM,
  tangentCameraPose,
  type CameraPresetPose,
  type CameraPresetId,
} from '../camera/cameraPresets.ts'
import {
  circularOrbitAtDirection,
} from '../celestial/CelestialSystem.ts'
import {
  sunDirectionFromLocalAngles,
} from '../math/coordinates.ts'
import { intersectRaySphere } from '../math/raySphere.ts'
import {
  add,
  cross,
  normalize,
  scale,
} from '../math/vector3.ts'
import {
  cloneAtmosphereControls,
  createEarthControls,
  type AtmosphereControls,
} from './atmosphereState.ts'
import type { WorkbenchPath } from './workbenchPath.ts'

export interface ValidationReference {
  src: string
  label: string
  aspectRatio: number
  fit: 'contain' | 'cover'
  alignment: string
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
  moonComposition:
    | { kind: 'standard' }
    | {
        kind: 'out-of-frame'
        cameraPose: CameraPresetPose
      }
    | {
        kind: 'camera-ray'
        cameraPose: CameraPresetPose
        rightOffset: number
        upOffset: number
      }
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
  cameraPose: CameraPresetPose
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

const HIGH_ALTITUDE_DAY_REFERENCE: ValidationReference = {
  src: '/atmosphere-references/对流层-云层-01.jpg',
  label: '高空白昼云海与地平线参考',
  aspectRatio: 5826 / 3884,
  fit: 'cover',
  alignment: '约 12 km 高度；相机低于切线约 1.8°，垂直 FOV 15°；太阳位于左侧画外。',
  comparable: '地平线高度与曲率、蓝色天空向远方霾层的连续梯度。',
  unknowns: '原图准确飞行高度、镜头焦距、曝光和云层高度未知；不比较云层纹理。',
}

const HIGH_ALTITUDE_SUNSET_REFERENCE: ValidationReference = {
  src: '/atmosphere-references/对流层-日落.jpg',
  label: '高空日落与地平线参考',
  aspectRatio: 4347 / 2743,
  fit: 'cover',
  alignment: '约 12 km 高度；相机高于切线约 1.27°，垂直 FOV 10°；太阳沿地平线方向位于右侧画外。',
  comparable: '地平线高度与曲率、暖色长路径和向蓝色高层的连续过渡。',
  unknowns: '原图准确飞行高度、镜头焦距、太阳方位、曝光和云层高度未知；不比较云层纹理。',
}

const SPACE_LIMB_REFERENCE: ValidationReference = {
  src: '/atmosphere-references/地球边缘-远景-ISS.jpg',
  label: 'ISS 白昼大气边缘参考',
  aspectRatio: 4256 / 2832,
  fit: 'cover',
  alignment: '400 km；摄像机滚转约 -8°、从切线向地表下俯约 10.3°，垂直 FOV 40°，太阳当地高度约 +40°。',
  comparable: '蓝白薄边、行星轮廓以及向黑色太空的连续衰减。',
  unknowns: '原图准确轨道姿态、焦距、曝光和图像处理未知；不比较云与地表纹理。',
}

const SPACE_SUNRISE_REFERENCE: ValidationReference = {
  src: '/atmosphere-references/地球边缘-日出结构-ISS.jpg',
  label: 'ISS 大气边缘日出参考',
  aspectRatio: 768 / 511,
  fit: 'cover',
  alignment: '400 km；摄像机高于切线约 0.35°，太阳中心位于切线方向，垂直 FOV 10°。',
  comparable: '太阳附近长路径暖色、远离太阳后的蓝色高层和黑色太空。',
  unknowns: '原图准确轨道姿态、曝光和后期未知；不比较云与地表。',
}

const SPACE_OBLIQUE_REFERENCE: ValidationReference = {
  src: '/atmosphere-references/地球边缘-晨昏线-ISS.jpg',
  label: 'ISS 斜视大气与月球参考',
  aspectRatio: 1000 / 663,
  fit: 'cover',
  alignment: '400 km、切线外偏约 0.8°；摄像机滚转约 -47°，垂直 FOV 15°；月球位于画面右下，太阳位于画面外。',
  comparable: '斜向 limb、月球圆盘中心与角尺寸、蓝色高层和黑色太空。',
  unknowns: '原图准确轨道姿态、曝光和后期未知；只比较可复现的几何与大气层次。',
}

const PLANETARY_REFERENCE: ValidationReference = {
  src: '/atmosphere-references/地球边缘-完整夜景-Artemis2.jpg',
  label: 'Artemis 2 地球夜半球参考',
  aspectRatio: 1.5,
  fit: 'cover',
  alignment: '距地表 30,000 km；相机向右偏航约 0.94°、向行星中心下俯约 1.93°，夜半球相位角约 145°，垂直 FOV 25.75°；月球位于右下。',
  comparable: '地球圆盘中心与角尺寸、月球中心与角尺寸、夜半球轮廓和受光 limb。',
  unknowns: '原图准确距离、相位角、相机响应和合成处理未知；不比较云与地表纹理。',
}

const SURFACE_CAMERA = cameraPresetPose(
  'surface',
  EARTH_ATMOSPHERE.bottomRadiusKm,
)
const TWENTY_KM_CAMERA = cameraPresetPose(
  'twenty-km',
  EARTH_ATMOSPHERE.bottomRadiusKm,
)
const HIGH_ALTITUDE_REFERENCE_ALTITUDE_KM = 12
const HIGH_ALTITUDE_REFERENCE_BASE_CAMERA = tangentCameraPose(
  HIGH_ALTITUDE_REFERENCE_ALTITUDE_KM,
  EARTH_ATMOSPHERE.bottomRadiusKm,
)
const SPACE_LIMB_CAMERA = cameraPresetPose(
  'space-limb',
  EARTH_ATMOSPHERE.bottomRadiusKm,
)
const SPACE_LIMB_DAY_BASE_CAMERA = tangentCameraPose(
  400,
  EARTH_ATMOSPHERE.bottomRadiusKm,
  -8,
)
const SPACE_LIMB_ROLLED_BASE_CAMERA = tangentCameraPose(
  400,
  EARTH_ATMOSPHERE.bottomRadiusKm,
  -47,
)
const DEEP_SPACE_CAMERA = cameraPresetPose(
  'deep-space',
  EARTH_ATMOSPHERE.bottomRadiusKm,
)

function pitchCameraPose(
  pose: CameraPresetPose,
  pitchDegrees: number,
): CameraPresetPose {
  if (!Number.isFinite(pitchDegrees)) {
    throw new Error('验证用例摄像机俯仰角必须是有限数。')
  }

  const pitchRadians = pitchDegrees * Math.PI / 180
  return {
    position: pose.position,
    forward: normalize(add(
      scale(pose.forward, Math.cos(pitchRadians)),
      scale(pose.up, Math.sin(pitchRadians)),
    )),
    up: normalize(add(
      scale(pose.up, Math.cos(pitchRadians)),
      scale(pose.forward, -Math.sin(pitchRadians)),
    )),
  }
}

function yawCameraPose(
  pose: CameraPresetPose,
  yawDegrees: number,
): CameraPresetPose {
  if (!Number.isFinite(yawDegrees)) {
    throw new Error('验证用例摄像机偏航角必须是有限数。')
  }

  const yawRadians = yawDegrees * Math.PI / 180
  const right = normalize(cross(pose.forward, pose.up))
  return {
    position: pose.position,
    forward: normalize(add(
      scale(pose.forward, Math.cos(yawRadians)),
      scale(right, Math.sin(yawRadians)),
    )),
    up: pose.up,
  }
}

const SURFACE_DAY_CAMERA = pitchCameraPose(SURFACE_CAMERA, 10)
const HIGH_ALTITUDE_DAY_NARROW_CAMERA =
  pitchCameraPose(HIGH_ALTITUDE_REFERENCE_BASE_CAMERA, -1.8)
const HIGH_ALTITUDE_SUNSET_NARROW_CAMERA =
  pitchCameraPose(HIGH_ALTITUDE_REFERENCE_BASE_CAMERA, 1.27)
const SPACE_LIMB_DOWNWARD_CAMERA =
  pitchCameraPose(SPACE_LIMB_DAY_BASE_CAMERA, -10.3)

const SPACE_LIMB_ROLLED_CAMERA =
  pitchCameraPose(SPACE_LIMB_ROLLED_BASE_CAMERA, 0.8)
const SPACE_LIMB_SUNRISE_CAMERA =
  pitchCameraPose(SPACE_LIMB_CAMERA, 0.35)
const DEEP_SPACE_ARTEMIS_CAMERA =
  pitchCameraPose(yawCameraPose(DEEP_SPACE_CAMERA, 0.94), -1.93)
const SPACE_OBLIQUE_MOON_RIGHT_OFFSET = 0.044
const SPACE_OBLIQUE_MOON_UP_OFFSET = -0.0382
const PLANETARY_MOON_RIGHT_OFFSET = 0.1358
const PLANETARY_MOON_UP_OFFSET = -0.192

function finalControls(
  specification: FinalControlsInput,
): ValidationControls {
  return {
    ...specification,
    debugView: 'final',
    aerialPerspectiveSlice: 1,
    moonComposition: { kind: 'standard' },
  }
}

function lunarFinalControls(
  specification: FinalControlsInput,
  cameraPose: CameraPresetPose,
  rightOffset: number,
  upOffset: number,
): ValidationControls {
  return {
    ...finalControls(specification),
    moonComposition: {
      kind: 'camera-ray',
      cameraPose,
      rightOffset,
      upOffset,
    },
  }
}

function imageAlignedFinalControls(
  specification: FinalControlsInput,
  cameraPose: CameraPresetPose,
): ValidationControls {
  return {
    ...finalControls(specification),
    moonComposition: {
      kind: 'out-of-frame',
      cameraPose,
    },
  }
}

function directionFromCameraOffsets(
  pose: CameraPresetPose,
  rightOffset: number,
  upOffset: number,
): readonly [number, number, number] {
  const cameraRight = normalize(cross(pose.forward, pose.up))
  return normalize(add(
    pose.forward,
    add(
      scale(cameraRight, rightOffset),
      scale(pose.up, upOffset),
    ),
  ))
}

function createControlsFromSpecification(
  specification: ValidationControls,
): AtmosphereControls {
  const result = createEarthControls()
  result.camera.verticalFovDegrees =
    specification.verticalFovDegrees
  const sunDirection = [
    Math.cos(specification.sunElevationDegrees * Math.PI / 180) *
      Math.cos(specification.sunAzimuthDegrees * Math.PI / 180),
    Math.cos(specification.sunElevationDegrees * Math.PI / 180) *
      Math.sin(specification.sunAzimuthDegrees * Math.PI / 180),
    Math.sin(specification.sunElevationDegrees * Math.PI / 180),
  ] as const
  const earthDirection = [
    -sunDirection[0],
    -sunDirection[1],
    -sunDirection[2],
  ] as const
  result.celestial.scenario.earthOrbit = circularOrbitAtDirection(
    result.celestial.scenario.earthOrbit,
    earthDirection,
  )
  if (specification.moonComposition.kind === 'standard') {
    result.celestial.scenario.moonOrbit.meanAnomalyAtEpochDegrees = 90
  } else if (specification.moonComposition.kind === 'out-of-frame') {
    result.celestial.scenario.moonOrbit = circularOrbitAtDirection(
      result.celestial.scenario.moonOrbit,
      scale(specification.moonComposition.cameraPose.forward, -1),
    )
  } else {
    const placement = specification.moonComposition
    const pose = placement.cameraPose
    const cameraRay = directionFromCameraOffsets(
      pose,
      placement.rightOffset,
      placement.upOffset,
    )
    const orbitIntersection = intersectRaySphere(
      pose.position,
      cameraRay,
      [0, 0, 0],
      result.celestial.scenario.moonOrbit.semiMajorAxisKm,
    )
    if (orbitIntersection === null || orbitIntersection.far <= 0) {
      throw new Error('月球验证构图射线无法到达月球轨道。')
    }
    const distance =
      orbitIntersection.near > 0
        ? orbitIntersection.near
        : orbitIntersection.far
    const moonPosition = add(
      pose.position,
      scale(cameraRay, distance),
    )
    result.celestial.scenario.moonOrbit = circularOrbitAtDirection(
      result.celestial.scenario.moonOrbit,
      moonPosition,
    )
  }
  result.celestial.simulationTimeSeconds = 0
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
  return localSunAnglesAtAzimuth(
    cameraPreset,
    0,
    elevationDegrees,
  )
}

function localSunAnglesAtAzimuth(
  cameraPreset: CameraPresetId,
  azimuthDegrees: number,
  elevationDegrees: number,
): {
  sunAzimuthDegrees: number
  sunElevationDegrees: number
} {
  const pose = cameraPresetPose(
    cameraPreset,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  return localSunAnglesForPose(
    pose,
    azimuthDegrees,
    elevationDegrees,
  )
}

function localSunAnglesForPose(
  pose: CameraPresetPose,
  azimuthDegrees: number,
  elevationDegrees: number,
): {
  sunAzimuthDegrees: number
  sunElevationDegrees: number
} {
  const direction = sunDirectionFromLocalAngles(
    pose.position,
    [1, 0, 0],
    azimuthDegrees,
    elevationDegrees,
  )
  return {
    sunAzimuthDegrees:
      Math.atan2(direction[1], direction[0]) * 180 / Math.PI,
    sunElevationDegrees:
      Math.asin(direction[2]) * 180 / Math.PI,
  }
}

const SURFACE_VISIBLE_HORIZON_ELEVATION_DEGREES =
  (-horizonDipRadians(
    INITIAL_CAMERA_ALTITUDE_KM,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  ) *
    180) /
  Math.PI

const SPACE_LIMB_VISIBLE_HORIZON_ELEVATION_DEGREES =
  (-horizonDipRadians(
    400,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  ) *
    180) /
  Math.PI

const HIGH_ALTITUDE_REFERENCE_VISIBLE_HORIZON_ELEVATION_DEGREES =
  (-horizonDipRadians(
    HIGH_ALTITUDE_REFERENCE_ALTITUDE_KM,
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
        label: '地表几何对齐',
        description: '固定地平线、太阳圆盘、FOV、视线和摄像机姿态。',
        cases: [
          {
            id: 'ground-day-sunward',
            label: '高太阳地平线梯度',
            objective: '检查近太阳亮区、地平线长路径和地表直射关系。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_DAY_CAMERA,
            controls: imageAlignedFinalControls({
              quality: 'high',
              verticalFovDegrees: 55,
              ...localSunAnglesAtAzimuth('surface', -20, 35),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }, SURFACE_DAY_CAMERA),
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
            cameraPose: SURFACE_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', 5),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-sun-zero',
            label: '太阳 0°',
            objective: '检查太阳中心位于当地水平面时的圆盘与天空连续变化。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: GROUND_TERMINATOR_CONTROLS,
            reference: null,
            path: null,
          },
          {
            id: 'ground-sun-minus-one',
            label: '太阳 −1°',
            objective: '检查日落后高层受光与近地阴影的连续分离。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -1),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-civil-twilight',
            label: '民用暮光 · −6°',
            objective: '检查向日、天顶和背日方向仍可辨识的暮光层次。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -6),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-nautical-twilight',
            label: '航海暮光 · −12°',
            objective: '检查多重散射维持的低亮度层次和连续衰减。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -12),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'ground-astronomical-twilight',
            label: '天文暮光 · −18°',
            objective: '检查晴空散射残光的低亮度边界，不把气辉当作已实现能力。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('surface', -18),
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
        id: 'high-altitude',
        label: '高空连续性',
        description: '检查剩余大气柱减少后，地平线亮层到深色天顶的连续变化。',
        cases: [
          {
            id: 'high-altitude-day',
            label: '20 km 白昼',
            objective: '检查高空白昼的地平线亮层、深蓝天顶和连续衰减。',
            baseline: 'earth-clear',
            cameraPose: TWENTY_KM_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 60,
              ...localSunAngles('twenty-km', 20),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'high-altitude-terminator',
            label: '20 km 晨昏',
            objective: '检查受光高层、进入阴影的低层和太空背景关系。',
            baseline: 'earth-clear',
            cameraPose: TWENTY_KM_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 20,
              ...localSunAngles('twenty-km', 0),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'high-altitude-day-narrow',
            label: '12 km 白昼窄视场',
            objective: '对齐高空白昼照片中的地平线高度、曲率和蓝色天空梯度。',
            baseline: 'earth-clear',
            cameraPose: HIGH_ALTITUDE_DAY_NARROW_CAMERA,
            controls: imageAlignedFinalControls({
              quality: 'high',
              verticalFovDegrees: 15,
              ...localSunAnglesForPose(
                HIGH_ALTITUDE_DAY_NARROW_CAMERA,
                -90,
                20,
              ),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }, HIGH_ALTITUDE_DAY_NARROW_CAMERA),
            reference: HIGH_ALTITUDE_DAY_REFERENCE,
            path: null,
          },
          {
            id: 'high-altitude-sunset-narrow',
            label: '12 km 日落窄视场',
            objective: '对齐高空日落照片中的地平线高度、曲率和暖色长路径。',
            baseline: 'earth-clear',
            cameraPose: HIGH_ALTITUDE_SUNSET_NARROW_CAMERA,
            controls: imageAlignedFinalControls({
              quality: 'high',
              verticalFovDegrees: 10,
              ...localSunAnglesForPose(
                HIGH_ALTITUDE_SUNSET_NARROW_CAMERA,
                60,
                HIGH_ALTITUDE_REFERENCE_VISIBLE_HORIZON_ELEVATION_DEGREES,
              ),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }, HIGH_ALTITUDE_SUNSET_NARROW_CAMERA),
            reference: HIGH_ALTITUDE_SUNSET_REFERENCE,
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
            id: 'space-limb-day-side',
            label: '白昼侧光 limb',
            objective: '检查蓝白薄边、地表终点和向黑色太空的连续衰减。',
            baseline: 'earth-clear',
            cameraPose: SPACE_LIMB_DOWNWARD_CAMERA,
            controls: imageAlignedFinalControls({
              quality: 'high',
              verticalFovDegrees: 40,
              ...localSunAngles('space-limb', 40),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }, SPACE_LIMB_DOWNWARD_CAMERA),
            reference: SPACE_LIMB_REFERENCE,
            path: null,
          },
          {
            id: 'space-limb-sunrise',
            label: '晨昏 limb',
            objective: '检查低太阳切线路径中的暖色低层与蓝色高层关系。',
            baseline: 'earth-clear',
            cameraPose: SPACE_LIMB_SUNRISE_CAMERA,
            controls: imageAlignedFinalControls({
              quality: 'high',
              verticalFovDegrees: 10,
              ...localSunAngles(
                'space-limb',
                SPACE_LIMB_VISIBLE_HORIZON_ELEVATION_DEGREES,
              ),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }, SPACE_LIMB_SUNRISE_CAMERA),
            reference: SPACE_SUNRISE_REFERENCE,
            path: null,
          },
          {
            id: 'space-limb-oblique',
            label: '斜视 limb 与月球',
            objective: '对齐斜向地球边缘、月球圆盘位置与尺寸，并确保太阳位于画外。',
            baseline: 'earth-clear',
            cameraPose: SPACE_LIMB_ROLLED_CAMERA,
            controls: lunarFinalControls(
              {
                quality: 'high',
                verticalFovDegrees: 15,
                ...localSunAngles('space-limb', 40),
                exposure: 10,
                multipleScattering: true,
                components: ALL_COMPONENTS,
              },
              SPACE_LIMB_ROLLED_CAMERA,
              SPACE_OBLIQUE_MOON_RIGHT_OFFSET,
              SPACE_OBLIQUE_MOON_UP_OFFSET,
            ),
            reference: SPACE_OBLIQUE_REFERENCE,
            path: null,
          },
          {
            id: 'space-limb-rise',
            label: '沿 limb 上升',
            objective: '检查摄像机从 400 km 到 800 km 连续上升时的切线几何和亮层变化。',
            baseline: 'earth-clear',
            cameraPose: SPACE_LIMB_CAMERA,
            controls: SPACE_LIMB_CONTROLS,
            reference: null,
            path: SPACE_LIMB_PATH,
          },
          {
            id: 'space-limb-backlit',
            label: '背光 limb',
            objective: '检查新月相位下轮廓外前向散射、深夜侧切点和漏光边界。',
            baseline: 'earth-clear',
            cameraPose: SPACE_LIMB_CAMERA,
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
            id: 'planetary-night-side',
            label: 'Artemis 夜半球行星盘',
            objective: '对齐夜半球远景地球与月球的圆盘中心、角尺寸、相位和受光 limb。',
            baseline: 'earth-clear',
            cameraPose: DEEP_SPACE_ARTEMIS_CAMERA,
            controls: lunarFinalControls(
              {
                quality: 'high',
                verticalFovDegrees: 25.75,
                ...localSunAngles('deep-space', -55),
                exposure: 10,
                multipleScattering: true,
                components: ALL_COMPONENTS,
              },
              DEEP_SPACE_ARTEMIS_CAMERA,
              PLANETARY_MOON_RIGHT_OFFSET,
              PLANETARY_MOON_UP_OFFSET,
            ),
            reference: PLANETARY_REFERENCE,
            path: null,
          },
          {
            id: 'planetary-terminator',
            label: '行星盘晨昏线',
            objective: '检查表面昼夜边界、受光高层和夜侧大气的连续关系。',
            baseline: 'earth-clear',
            cameraPose: DEEP_SPACE_CAMERA,
            controls: finalControls({
              quality: 'high',
              verticalFovDegrees: 24,
              ...localSunAngles('deep-space', 0),
              exposure: 10,
              multipleScattering: true,
              components: ALL_COMPONENTS,
            }),
            reference: null,
            path: null,
          },
          {
            id: 'planetary-crescent',
            label: '背光新月行星',
            objective: '检查暗面轮廓、细受光弧和大气外路径的能量连续性。',
            baseline: 'earth-clear',
            cameraPose: DEEP_SPACE_CAMERA,
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
            id: 'ground-horizon-sun-fov-5',
            label: '地平线太阳 · FOV 5°',
            objective: '放大检查太阳圆盘、抗锯齿边缘和圆盘外散射。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
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
            id: 'ground-horizon-sun-fov-10',
            label: '地平线太阳 · FOV 10°',
            objective: '与 5°/20° 用例比较同一世界射线和太阳能量。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
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
            id: 'ground-horizon-sun-fov-20',
            label: '地平线太阳 · FOV 20°',
            objective: '作为窄视场与常规视场之间的太阳圆盘对照。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
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
        id: 'lunar-composition',
        label: '月球与大气构图',
        description: '以真实月球轨道位置检查暮光、最长大气路径和夜侧天空中的月相与透射。',
        cases: [
          {
            id: 'lunar-ground-terminator',
            label: '晨昏线 · 近地平月球',
            objective: '检查晨昏散射背景中的月球视差、细月相和地平线遮挡连续性。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: lunarFinalControls(
              {
                quality: 'high',
                verticalFovDegrees: 20,
                ...localSunAnglesAtAzimuth('surface', 90, 0),
                exposure: 10,
                multipleScattering: true,
                components: ALL_COMPONENTS,
              },
              SURFACE_CAMERA,
              0.08,
              0.08,
            ),
            reference: null,
            path: null,
          },
          {
            id: 'lunar-space-limb',
            label: '大气边缘 · 月球',
            objective: '检查月球穿过近切线大气时的透射、入射散射和地表遮挡边界。',
            baseline: 'earth-clear',
            cameraPose: SPACE_LIMB_CAMERA,
            controls: lunarFinalControls(
              {
                quality: 'high',
                verticalFovDegrees: 20,
                ...localSunAngles('space-limb', 20),
                exposure: 10,
                multipleScattering: true,
                components: ALL_COMPONENTS,
              },
              SPACE_LIMB_CAMERA,
              0,
              0.005,
            ),
            reference: null,
            path: null,
          },
          {
            id: 'lunar-ground-night',
            label: '夜侧大气 · 高月',
            objective: '检查夜侧低亮度大气中的明亮月面、自然角尺寸和无专属曝光合成。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: lunarFinalControls(
              {
                quality: 'high',
                verticalFovDegrees: 100,
                ...localSunAngles('surface', -90),
                exposure: 18,
                multipleScattering: true,
                components: ALL_COMPONENTS,
              },
              SURFACE_CAMERA,
              0,
              1,
            ),
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
            cameraPose: SURFACE_CAMERA,
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
            cameraPose: SURFACE_CAMERA,
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
            cameraPose: SURFACE_CAMERA,
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
            cameraPose: SURFACE_CAMERA,
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
            cameraPose: SURFACE_CAMERA,
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
            id: 'ground-terminator-production-multiple',
            label: 'Production 多重散射',
            objective: '比较多重散射贡献，并可运行三阶段渲染路径检查点。',
            baseline: 'earth-clear',
            cameraPose: SURFACE_CAMERA,
            controls: GROUND_TERMINATOR_CONTROLS,
            reference: null,
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
