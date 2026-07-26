import { assert, test } from 'vitest'
import {
  cloneAtmosphereControls,
  createEarthControls,
} from './atmosphereState.ts'

test('Earth 默认控制包含统一天体场景和地心参考系', () => {
  const controls = createEarthControls()

  assert.equal(controls.camera.referenceBodyId, 'earth')
  assert.equal(controls.camera.referenceFrame, 'inertial')
  assert.equal(controls.celestial.paused, true)
  assert.ok(
    controls.celestial.scenario.earthOrbit.semiMajorAxisKm >
      controls.celestial.scenario.moonOrbit.semiMajorAxisKm,
  )
})

test('复制控制状态时不共享嵌套轨道和自转参数', () => {
  const controls = createEarthControls()
  const clone = cloneAtmosphereControls(controls)

  clone.celestial.scenario.moonOrbit.meanAnomalyAtEpochDegrees += 10
  clone.celestial.scenario.earthRotation.poleDirection = [0, 0, 1]

  assert.notEqual(
    clone.celestial.scenario.moonOrbit.meanAnomalyAtEpochDegrees,
    controls.celestial.scenario.moonOrbit.meanAnomalyAtEpochDegrees,
  )
  assert.notDeepEqual(
    clone.celestial.scenario.earthRotation.poleDirection,
    controls.celestial.scenario.earthRotation.poleDirection,
  )
})
