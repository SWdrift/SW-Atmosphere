import { assert, test } from 'vitest'
import { length } from './vector3.ts'
import {
  altitudeFromPosition,
  cameraRayDirection,
  sunAnglesFromDirection,
  sunDirectionFromAngles,
  sunDirectionFromLocalAngles,
} from './coordinates.ts'
import { dot } from './vector3.ts'
import { close } from '../test/assertions.ts'

test('中心和边缘 camera ray 保持正确方向与单位长度', () => {
  const center = cameraRayDirection(
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
    16 / 9,
    0,
    0,
  )
  assert.deepEqual(center, [0, 1, 0])

  const upperRight = cameraRayDirection(
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
    16 / 9,
    1,
    1,
  )
  close(length(upperRight), 1)
  assert.ok(upperRight[0] > 0)
  assert.ok(upperRight[1] > 0)
  assert.ok(upperRight[2] > 0)
})

test('高度、太阳方位和太阳高度角使用同一右手系', () => {
  close(altitudeFromPosition([0, 0, 6361.5], 6360), 1.5)

  const northHorizon = sunDirectionFromAngles(0, 0)
  assert.deepEqual(northHorizon, [0, 1, 0])

  const zenith = sunDirectionFromAngles(0, 90)
  close(dot(zenith, [0, 0, 1]), 1)
})

test('当地太阳角可无损转换为运行时世界角', () => {
  const observerPosition = [0, -6360.0015, 0] as const

  for (const elevationDegrees of [20, 5, 0, -1, -6, -12, -18]) {
    const localDirection = sunDirectionFromLocalAngles(
      observerPosition,
      [1, 0, 0],
      0,
      elevationDegrees,
    )
    const worldAngles = sunAnglesFromDirection(localDirection)
    const runtimeDirection = sunDirectionFromAngles(
      worldAngles.azimuthDegrees,
      worldAngles.elevationDegrees,
    )

    close(dot(localDirection, runtimeDirection), 1, 1e-12)
    close(
      (Math.asin(dot(runtimeDirection, [0, -1, 0])) * 180) / Math.PI,
      elevationDegrees,
      1e-10,
    )
  }
})

test('非法 FOV fail fast', () => {
  assert.throws(() =>
    cameraRayDirection([0, 1, 0], [1, 0, 0], [0, 0, 1], 0, 1, 0, 0),
  )
})
