import { assert, test } from 'vitest'
import {
  EARTH_MOON_MATERIAL,
  validateMoonMaterial,
} from './CelestialMaterials.ts'

test('月面材质要求有限的单位区间 RGB 反射率', () => {
  validateMoonMaterial(EARTH_MOON_MATERIAL)
  assert.throws(() => validateMoonMaterial({
    diffuseReflectance: [0.12, 2, 0.12],
  }))
})
