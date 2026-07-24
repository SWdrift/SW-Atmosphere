import { assert, test } from 'vitest'
import { length } from './vector3.ts'
import {
  altitudeFromPosition,
  cameraRayDirection,
  sunDirectionFromAngles,
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

test('非法 FOV fail fast', () => {
  assert.throws(() =>
    cameraRayDirection([0, 1, 0], [1, 0, 0], [0, 0, 1], 0, 1, 0, 0),
  )
})
