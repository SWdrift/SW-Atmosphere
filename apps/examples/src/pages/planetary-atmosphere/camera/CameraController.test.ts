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
import {
  CAMERA_PRESETS,
  cameraPresetPose,
  horizonDipRadians,
  INITIAL_CAMERA_ALTITUDE_KM,
} from './cameraPresets.ts'
import {
  freeBodyBasis,
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

test('参考天体半径变化时保持相机高度而不是落入实体内部', () => {
  const camera = new PlanetCamera(
    [0, 0, 11],
    [1, 0, 0],
    [0, 0, 1],
    60,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    10,
    () => {},
  )

  controller.setReferenceBodyRadius(20)

  close(camera.position[2], 21)
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

test('偏转时平移跟随最终局部基且 Q/E 旋转 Body', () => {
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

test('Space/C 沿横滚后的身体局部 up 上升和下降', () => {
  const rolledBody = rollFreeBody(
    {
      bodyOrientation: [0, 0, 0, 1],
      yawRadians: 0,
      pitchRadians: 0,
    },
    Math.PI / 3,
  )
  const rolledView: FreeView = {
    ...rolledBody,
    pitchRadians: 0.4,
  }
  const bodyUp = freeBodyBasis(rolledView).up
  const rolledBasis = freeViewBasis(rolledView)

  for (const [key, expectedDirection] of [
    ['Space', 1],
    ['KeyC', -1],
  ] as const) {
    const camera = new PlanetCamera(
      [0, 0, 100_000],
      rolledBasis.forward,
      rolledBasis.up,
      60,
    )
    const controller = new CameraController(
      {} as HTMLCanvasElement,
      camera,
      EARTH_ATMOSPHERE.bottomRadiusKm,
      () => {},
    )
    const controls = controller as unknown as {
      pressedKeys: Set<string>
      freeView: FreeView
      updateFreeFlight(
        deltaSeconds: number,
        speedExponent: number,
      ): void
    }
    controls.freeView = rolledView
    const positionBeforeMove = camera.position

    controls.pressedKeys.add(key)
    controls.updateFreeFlight(1, 0)

    const displacement = [
      camera.position[0] - positionBeforeMove[0],
      camera.position[1] - positionBeforeMove[1],
      camera.position[2] - positionBeforeMove[2],
    ] as const
    close(
      dot(normalize(displacement), bodyUp),
      expectedDirection,
      1e-9,
    )
    assert.ok(Math.abs(dot(normalize(displacement), camera.up)) < 0.99)
  }
})

test('快捷视角分别重置赤道 Body/Look 与世界 Body 基准', () => {
  const planetRadiusKm = EARTH_ATMOSPHERE.bottomRadiusKm
  const camera = new PlanetCamera(
    [100, -planetRadiusKm - 20, 50],
    [0.3, 0.8, 0.2],
    [0, 0, 1],
    60,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    planetRadiusKm,
    () => {},
  )

  controller.resetEquatorialBody()

  const surfacePose = cameraPresetPose('surface', planetRadiusKm)
  const equatorialInternal = controller as unknown as {
    freeView: FreeView
  }
  const equatorialBody = freeBodyBasis(equatorialInternal.freeView)
  close(dot(equatorialBody.forward, [1, 0, 0]), 1)
  close(dot(equatorialBody.up, [0, -1, 0]), 1)
  close(
    equatorialInternal.freeView.pitchRadians,
    -horizonDipRadians(INITIAL_CAMERA_ALTITUDE_KM, planetRadiusKm),
    1e-12,
  )
  close(dot(camera.forward, surfacePose.forward), 1, 1e-12)
  close(dot(camera.up, surfacePose.up), 1, 1e-12)
  assert.deepEqual(camera.position, surfacePose.position)

  const positionBeforeWorldReset = camera.position
  controller.resetBodyToWorldBasis()

  assert.deepEqual(camera.position, positionBeforeWorldReset)
  close(dot(camera.right, [1, 0, 0]), 1)
  close(dot(camera.forward, [0, 1, 0]), 1)
  close(dot(camera.up, [0, 0, 1]), 1)
  const worldFrame = controller.getBodyLookFrame()
  assert.ok(worldFrame)
  close(dot(worldFrame.right, [1, 0, 0]), 1)
  close(dot(worldFrame.forward, [0, 1, 0]), 1)
  close(dot(worldFrame.up, [0, 0, 1]), 1)
  assert.deepEqual({
    yawRadians: worldFrame.yawRadians,
    pitchRadians: worldFrame.pitchRadians,
  }, {
    yawRadians: 0,
    pitchRadians: 0,
  })
})

test('Free 位置和 Look 角编辑分别保持另一组姿态真相不变', () => {
  const planetRadiusKm = EARTH_ATMOSPHERE.bottomRadiusKm
  const camera = new PlanetCamera(
    [0, -planetRadiusKm - 20, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    planetRadiusKm,
    () => {},
  )
  const initialBody = controller.getBodyLookFrame()
  assert.ok(initialBody)
  const initialForward = camera.forward
  const initialUp = camera.up
  const editedPosition = [20, -planetRadiusKm - 30, 10] as const

  controller.setFreePosition(editedPosition)

  assert.deepEqual(camera.position, editedPosition)
  assert.deepEqual(camera.forward, initialForward)
  assert.deepEqual(camera.up, initialUp)
  assert.deepEqual(controller.getBodyLookFrame(), initialBody)

  controller.setFreeLookAngles({
    yawRadians: 0.5,
    pitchRadians: -0.25,
  })

  const editedFrame = controller.getBodyLookFrame()
  assert.ok(editedFrame)
  assert.deepEqual(editedFrame.right, initialBody.right)
  assert.deepEqual(editedFrame.forward, initialBody.forward)
  assert.deepEqual(editedFrame.up, initialBody.up)
  close(editedFrame.yawRadians, 0.5)
  close(editedFrame.pitchRadians, -0.25)
  assert.notDeepEqual(camera.forward, initialForward)

  assert.throws(() => {
    controller.setFreePosition([0, 0, planetRadiusKm])
  })
  assert.throws(() => {
    controller.setFreeLookAngles({
      yawRadians: Math.PI + 0.01,
      pitchRadians: 0,
    })
  })
  assert.throws(() => {
    controller.setFreeLookAngles({
      yawRadians: 0,
      pitchRadians: Math.PI / 2,
    })
  })

  controller.setMode('orbit')
  assert.throws(() => {
    controller.setFreePosition(editedPosition)
  })
  assert.throws(() => {
    controller.setFreeLookAngles({
      yawRadians: 0,
      pitchRadians: 0,
    })
  })
})
