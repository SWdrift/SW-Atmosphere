import {
  isFiniteVector,
  length,
  normalize,
  scale,
  subtract,
  type Vec3,
} from '../math/vector3.ts'

export interface MoonParameters {
  readonly radiusKm: number
  readonly meanDistanceFromPlanetCenterKm: number
  readonly diffuseReflectance: Vec3
}

export interface MoonObservation {
  directionFromCamera: Vec3
  angularRadiusRadians: number
}

export const EARTH_MOON: Readonly<MoonParameters> = Object.freeze({
  radiusKm: 1_737.5,
  meanDistanceFromPlanetCenterKm: 384_400,
  diffuseReflectance: Object.freeze([0.12, 0.12, 0.12] as const),
})

export function validateMoonParameters(parameters: MoonParameters): void {
  if (
    !Number.isFinite(parameters.radiusKm) ||
    parameters.radiusKm <= 0 ||
    !Number.isFinite(parameters.meanDistanceFromPlanetCenterKm) ||
    parameters.meanDistanceFromPlanetCenterKm <= parameters.radiusKm
  ) {
    throw new Error('月球半径和地心距离必须是有限正数，且地心距离必须大于半径。')
  }

  if (
    !isFiniteVector(parameters.diffuseReflectance) ||
    parameters.diffuseReflectance.some(
      (component) => component < 0 || component > 1,
    )
  ) {
    throw new Error('月面漫反射率必须是 0 到 1 的有限 RGB。')
  }
}

export function observeMoon(
  parameters: MoonParameters,
  cameraPositionKm: Vec3,
  directionFromPlanetCenter: Vec3,
): MoonObservation {
  validateMoonParameters(parameters)

  if (!isFiniteVector(cameraPositionKm)) {
    throw new Error('月球观察要求有限的摄像机世界位置。')
  }

  const moonCenter = scale(
    normalize(directionFromPlanetCenter),
    parameters.meanDistanceFromPlanetCenterKm,
  )
  const cameraToMoon = subtract(moonCenter, cameraPositionKm)
  const distanceFromCameraKm = length(cameraToMoon)

  if (distanceFromCameraKm <= parameters.radiusKm) {
    throw new Error('摄像机不能位于月球内部或表面。')
  }

  return {
    directionFromCamera: scale(cameraToMoon, 1 / distanceFromCameraKm),
    angularRadiusRadians: Math.asin(
      parameters.radiusKm / distanceFromCameraKm,
    ),
  }
}
