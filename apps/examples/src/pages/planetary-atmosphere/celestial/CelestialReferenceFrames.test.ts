import { assert, test } from 'vitest'
import { PlanetCamera } from '../camera/PlanetCamera.ts'
import { close } from '../test/assertions.ts'
import {
  createDefaultCelestialScenario,
  evaluateCelestialScenario,
} from './CelestialSystem.ts'
import {
  cameraSystemFrame,
  rebaseCameraPose,
} from './CelestialReferenceFrames.ts'

test('地心惯性参考空间平移到系统空间后保持摄像机局部偏移', () => {
  const snapshot = evaluateCelestialScenario(
    createDefaultCelestialScenario(),
    0,
  )
  const camera = new PlanetCamera([0, -7000, 0], [1, 0, 0], [0, -1, 0], 60)
  const system = cameraSystemFrame(
    snapshot,
    { bodyId: 'earth', frame: 'inertial' },
    camera,
  )

  close(
    system.positionKm[0] - snapshot.earth.systemPositionKm[0],
    0,
    1e-9,
  )
  close(
    system.positionKm[1] - snapshot.earth.systemPositionKm[1],
    -7000,
    1e-9,
  )
})

test('切换参考天体后往返保持系统空间摄像机姿态', () => {
  const snapshot = evaluateCelestialScenario(
    createDefaultCelestialScenario(),
    10_000,
  )
  const original = {
    position: [0, -7000, 10] as const,
    forward: [1, 0, 0] as const,
    up: [0, 0, 1] as const,
  }
  const moonPose = rebaseCameraPose(
    snapshot,
    { bodyId: 'earth', frame: 'inertial' },
    { bodyId: 'moon', frame: 'body-fixed' },
    original,
  )
  const restored = rebaseCameraPose(
    snapshot,
    { bodyId: 'moon', frame: 'body-fixed' },
    { bodyId: 'earth', frame: 'inertial' },
    moonPose,
  )

  for (let index = 0; index < 3; index += 1) {
    close(restored.position[index], original.position[index], 1e-6)
    close(restored.forward[index], original.forward[index], 1e-12)
    close(restored.up[index], original.up[index], 1e-12)
  }
  assert.notDeepEqual(moonPose.position, original.position)
})
