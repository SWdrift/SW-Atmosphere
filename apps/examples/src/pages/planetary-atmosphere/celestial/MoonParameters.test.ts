import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import {
  EARTH_MOON,
  observeMoon,
  validateMoonParameters,
} from './MoonParameters.ts'

test('地心观察使用真实地月尺度派生月球角半径', () => {
  const observation = observeMoon(EARTH_MOON, [0, 0, 0], [1, 0, 0])

  assert.deepEqual(observation.directionFromCamera, [1, 0, 0])
  close(
    observation.angularRadiusRadians,
    Math.asin(
      EARTH_MOON.radiusKm / EARTH_MOON.meanDistanceFromPlanetCenterKm,
    ),
    1e-12,
  )
})

test('相机位置改变观察方向和角半径，不建立固定显示尺寸', () => {
  const nearSide = observeMoon(EARTH_MOON, [30_000, 0, 0], [1, 0, 0])
  const offset = observeMoon(EARTH_MOON, [0, 30_000, 0], [1, 0, 0])

  assert.ok(
    nearSide.angularRadiusRadians >
      Math.asin(
        EARTH_MOON.radiusKm / EARTH_MOON.meanDistanceFromPlanetCenterKm,
      ),
  )
  assert.ok(offset.directionFromCamera[1] < 0)
})

test('非法月球参数和观察输入 fail fast', () => {
  assert.throws(() =>
    validateMoonParameters({
      ...EARTH_MOON,
      meanDistanceFromPlanetCenterKm: EARTH_MOON.radiusKm,
    }),
  )
  assert.throws(() =>
    validateMoonParameters({
      ...EARTH_MOON,
      diffuseReflectance: [1.1, 0.12, 0.12],
    }),
  )
  assert.throws(() =>
    observeMoon(EARTH_MOON, [Number.NaN, 0, 0], [1, 0, 0]),
  )
  assert.throws(() =>
    observeMoon(
      {
        ...EARTH_MOON,
        meanDistanceFromPlanetCenterKm: 2_000,
      },
      [1_000, 0, 0],
      [1, 0, 0],
    ),
  )
})
