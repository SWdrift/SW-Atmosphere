import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import {
  dot,
  length,
  normalize,
  subtract,
} from '../math/vector3.ts'
import {
  cloneCelestialScenario,
  circularOrbitAtDirection,
  createDefaultCelestialScenario,
  evaluateCelestialScenario,
  evaluateOrbit,
} from './CelestialSystem.ts'

test('圆轨道在四分之一周期后转过直角', () => {
  const orbit = {
    semiMajorAxisKm: 10,
    eccentricity: 0,
    inclinationDegrees: 0,
    ascendingNodeDegrees: 0,
    periapsisArgumentDegrees: 0,
    meanAnomalyAtEpochDegrees: 0,
    periodSeconds: 4,
  }

  assert.deepEqual(evaluateOrbit(orbit, 0), [10, 0, 0])
  const quarter = evaluateOrbit(orbit, 1)
  close(quarter[0], 0, 1e-12)
  close(quarter[1], 10, 1e-12)
  close(quarter[2], 0, 1e-12)
})

test('默认场景按太阳根、地球、月球父子轨道组合', () => {
  const scenario = createDefaultCelestialScenario()
  const snapshot = evaluateCelestialScenario(scenario, 0)

  assert.deepEqual(snapshot.sun.systemPositionKm, [0, 0, 0])
  close(
    length(subtract(
      snapshot.moon.systemPositionKm,
      snapshot.earth.systemPositionKm,
    )),
    scenario.moonOrbit.semiMajorAxisKm *
      (1 - scenario.moonOrbit.eccentricity),
    1e-6,
  )
  assert.equal(snapshot.earth.parentId, 'sun')
  assert.equal(snapshot.moon.parentId, 'earth')
  assert.ok(dot(
    normalize(scenario.earthRotation.poleDirection),
    normalize(subtract(
      snapshot.sun.systemPositionKm,
      snapshot.earth.systemPositionKm,
    )),
  ) < 0)
})

test('圆轨道可由任意南北半球目标方向构建', () => {
  const baseOrbit = createDefaultCelestialScenario().moonOrbit

  for (const direction of [
    [1, 2, 3],
    [-2, 1, -3],
    [0, -1, 0],
  ] as const) {
    const orbit = circularOrbitAtDirection(baseOrbit, direction)
    const position = evaluateOrbit(orbit, 0)

    close(length(position), orbit.semiMajorAxisKm, 1e-6)
    close(
      dot(normalize(position), normalize(direction)),
      1,
      1e-12,
    )
  }
})

test('同一历元重复求值确定且场景复制不共享嵌套参数', () => {
  const scenario = createDefaultCelestialScenario()
  const clone = cloneCelestialScenario(scenario)

  clone.moonOrbit.meanAnomalyAtEpochDegrees += 10
  clone.earthRotation.poleDirection = [
    clone.earthRotation.poleDirection[0] + 0.01,
    clone.earthRotation.poleDirection[1],
    clone.earthRotation.poleDirection[2],
  ]

  assert.notEqual(
    clone.moonOrbit.meanAnomalyAtEpochDegrees,
    scenario.moonOrbit.meanAnomalyAtEpochDegrees,
  )
  assert.notEqual(
    clone.earthRotation.poleDirection[0],
    scenario.earthRotation.poleDirection[0],
  )
  assert.deepEqual(
    evaluateCelestialScenario(scenario, 1234),
    evaluateCelestialScenario(scenario, 1234),
  )
})

test('非法轨道 fail fast', () => {
  const scenario = createDefaultCelestialScenario()

  assert.throws(() =>
    evaluateCelestialScenario({
      ...scenario,
      moonOrbit: {
        ...scenario.moonOrbit,
        eccentricity: 1,
      },
    }, 0),
  )
})
