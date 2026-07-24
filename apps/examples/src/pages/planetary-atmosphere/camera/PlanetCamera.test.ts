import { assert, test } from 'vitest'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import { close } from '../test/assertions.ts'
import {
  dot,
  isFiniteVector,
  length,
} from '../math/vector3.ts'
import { MINIMUM_CAMERA_ALTITUDE_KM } from './CameraController.ts'
import { PlanetCamera } from './PlanetCamera.ts'

test('姿态保持正交且移动不能穿地', () => {
  const minimumRadius =
    EARTH_ATMOSPHERE.bottomRadiusKm + MINIMUM_CAMERA_ALTITUDE_KM
  const camera = new PlanetCamera(
    [0, 0, EARTH_ATMOSPHERE.bottomRadiusKm + 1],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )

  camera.setPose(camera.position, [0.3, 0.9, 0.2], [-0.2, 0.1, 1])
  close(length(camera.forward), 1)
  close(length(camera.right), 1)
  close(length(camera.up), 1)
  close(dot(camera.forward, camera.right), 0, 1e-8)
  close(dot(camera.up, camera.forward), 0, 1e-8)
  assert.ok(isFiniteVector(camera.forward))
  assert.throws(() =>
    camera.setPose(
      camera.position,
      [0, Number.NaN, 0],
      [0, 0, 1],
    ),
  )

  const forwardBeforeMove = camera.forward
  const upBeforeMove = camera.up

  camera.move(
    [0, 0, -100],
    EARTH_ATMOSPHERE.bottomRadiusKm,
    MINIMUM_CAMERA_ALTITUDE_KM,
  )
  close(length(camera.position), minimumRadius, 1e-8)
  assert.ok(isFiniteVector(camera.position))
  assert.deepEqual(camera.forward, forwardBeforeMove)
  assert.deepEqual(camera.up, upBeforeMove)
})

test('高速移动不能穿过行星且接触后保留切向移动', () => {
  const minimumRadius =
    EARTH_ATMOSPHERE.bottomRadiusKm + MINIMUM_CAMERA_ALTITUDE_KM
  const camera = new PlanetCamera(
    [minimumRadius + 1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    60,
  )

  camera.move(
    [-minimumRadius * 3, 10, 0],
    EARTH_ATMOSPHERE.bottomRadiusKm,
    MINIMUM_CAMERA_ALTITUDE_KM,
  )

  assert.ok(length(camera.position) >= minimumRadius - 1e-8)
  assert.ok(camera.position[1] > 0)
  assert.ok(camera.position[0] > 0)
})

test('正视球心时仍能构造稳定的 right/up', () => {
  const radius = EARTH_ATMOSPHERE.bottomRadiusKm + 400
  const camera = new PlanetCamera(
    [0, 0, radius],
    [0, 0, -1],
    [0, 1, 0],
    60,
  )

  close(length(camera.right), 1)
  close(length(camera.up), 1)
  close(dot(camera.forward, camera.right), 0)
  close(dot(camera.forward, camera.up), 0)
  assert.ok(isFiniteVector(camera.right))
  assert.ok(isFiniteVector(camera.up))
})

test('允许 5° 窄视场并拒绝范围外输入', () => {
  const camera = new PlanetCamera(
    [0, 0, EARTH_ATMOSPHERE.bottomRadiusKm + 1],
    [0, 1, 0],
    [0, 0, 1],
    5,
  )

  assert.equal(camera.verticalFovDegrees, 5)
  assert.throws(() => camera.setVerticalFov(4.99), /5° 到 100°/)
  assert.throws(() => camera.setVerticalFov(100.01), /5° 到 100°/)
})
