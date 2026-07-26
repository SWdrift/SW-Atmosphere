import { isFiniteVector, type Vec3 } from '../math/vector3.ts'

export interface MoonMaterial {
  readonly diffuseReflectance: Vec3
}

export const EARTH_MOON_MATERIAL: Readonly<MoonMaterial> = Object.freeze({
  diffuseReflectance: Object.freeze([0.12, 0.12, 0.12] as const),
})

export function validateMoonMaterial(material: MoonMaterial): void {
  if (
    !isFiniteVector(material.diffuseReflectance) ||
    material.diffuseReflectance.some(
      (component) => component < 0 || component > 1,
    )
  ) {
    throw new Error('月面漫反射率必须是 0 到 1 的有限 RGB。')
  }
}
