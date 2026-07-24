import { assert, test } from 'vitest'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import {
  dot,
  normalize,
} from '../math/vector3.ts'
import { close } from '../test/assertions.ts'
import {
  automaticSpeedKmPerSecond,
  CameraController,
} from './CameraController.ts'
import { CAMERA_PRESETS } from './cameraPresets.ts'
import {
  freeViewBasis,
  rollFreeBody,
  type FreeView,
} from './freeViewCoordinates.ts'
import { PlanetCamera } from './PlanetCamera.ts'
import { isUnitQuaternion } from '../math/quaternion.ts'

test('跨尺度速度近地可精细移动且太空受上限约束', () => {
  close(automaticSpeedKmPerSecond(-10), 0.005)
  close(automaticSpeedKmPerSecond(1.5), 0.075)
  close(automaticSpeedKmPerSecond(100), 5)
  close(automaticSpeedKmPerSecond(100_000), 2_000)
  assert.throws(() =>
    automaticSpeedKmPerSecond(Number.NaN),
  )
})

test('斜向切线预设在屏幕中稳定倾斜 45°', () => {
  const camera = new PlanetCamera(
    [0, 0, EARTH_ATMOSPHERE.bottomRadiusKm + 20],
    [1, 0, 0],
    [0, 0, 1],
    60,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
    () => {},
  )

  controller.applyPreset('tilted-tangent')

  const preset = CAMERA_PRESETS.find(
    (candidate) => candidate.id === 'tilted-tangent',
  )
  assert.ok(preset)
  assert.equal(preset.rollDegrees, 45)

  const radialToPlanetCenter = normalize([
    -camera.position[0],
    -camera.position[1],
    -camera.position[2],
  ])
  const screenNormal = [
    dot(radialToPlanetCenter, camera.right),
    dot(radialToPlanetCenter, camera.up),
  ]
  const tangentAngleRadians =
    Math.atan2(screenNormal[1], screenNormal[0]) + Math.PI / 2
  const normalizedTangentAngle = Math.atan2(
    Math.sin(tangentAngleRadians),
    Math.cos(tangentAngleRadians),
  )

  close(Math.abs(normalizedTangentAngle), Math.PI / 4)
})

test('Orbit 回切 Free 时恢复进入前的完整位姿', () => {
  const camera = new PlanetCamera(
    [0, -EARTH_ATMOSPHERE.bottomRadiusKm - 20, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
    () => {},
  )
  const freePosition = camera.position
  const freeForward = camera.forward
  const freeUp = camera.up

  controller.setMode('orbit')
  assert.ok(dot(camera.forward, freeForward) < 0.5)
  controller.applyPreset('karman-line')
  assert.notDeepEqual(camera.position, freePosition)

  controller.setMode('free')
  assert.deepEqual(camera.position, freePosition)
  close(dot(camera.forward, freeForward), 1)
  close(dot(camera.up, freeUp), 1)
  assert.equal(controller.mode, 'free')
})

test('偏转时 WASD 跟随最终局部基且 Q/E 旋转 Body', () => {
  const camera = new PlanetCamera(
    [0, 0, 100_000],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const initialView = rollFreeBody(
    {
      bodyOrientation: [0, 0, 0, 1],
      yawRadians: 0,
      pitchRadians: 0,
    },
    Math.PI / 3,
  )
  const initialBasis = freeViewBasis(initialView)
  camera.setPose(
    camera.position,
    initialBasis.forward,
    initialBasis.up,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
    () => {},
  )
  const controls = controller as unknown as {
    pressedKeys: Set<string>
    updateFreeFlight(
      deltaSeconds: number,
      speedExponent: number,
    ): void
  }

  controls.pressedKeys.add('KeyD')
  const positionBeforeRight = camera.position
  controls.updateFreeFlight(1, 0)
  const rightDisplacement = [
    camera.position[0] - positionBeforeRight[0],
    camera.position[1] - positionBeforeRight[1],
    camera.position[2] - positionBeforeRight[2],
  ] as const

  close(
    dot(normalize(rightDisplacement), camera.right),
    1,
    1e-9,
  )

  const rollCamera = new PlanetCamera(
    [0, 0, 100_000],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const rollController = new CameraController(
    {} as HTMLCanvasElement,
    rollCamera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
    () => {},
  )
  const rollControls = rollController as unknown as {
    pressedKeys: Set<string>
    freeView: FreeView
    updateFreeFlight(
      deltaSeconds: number,
      speedExponent: number,
    ): void
  }
  const positionBeforeRoll = rollCamera.position
  const forwardBeforeRoll = rollCamera.forward
  const upBeforeRoll = rollCamera.up

  rollControls.pressedKeys.add('KeyE')
  rollControls.updateFreeFlight(1, 0)

  assert.deepEqual(rollCamera.position, positionBeforeRoll)
  close(dot(rollCamera.forward, forwardBeforeRoll), 1, 1e-9)
  close(dot(rollCamera.up, upBeforeRoll), Math.cos(0.8), 1e-9)
  close(rollControls.freeView.yawRadians, 0)
  close(rollControls.freeView.pitchRadians, 0)
  assert.ok(
    isUnitQuaternion(rollControls.freeView.bodyOrientation),
  )
})
