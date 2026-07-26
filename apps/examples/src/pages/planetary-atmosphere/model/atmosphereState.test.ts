import { assert, test } from 'vitest'
import {
  cloneAtmosphereControls,
  createEarthControls,
} from './atmosphereState.ts'

test('Earth 默认控制包含可见且独立的月球方向', () => {
  const controls = createEarthControls()

  assert.equal(controls.moon.enabled, true)
  assert.ok(Number.isFinite(controls.moon.azimuthDegrees))
  assert.ok(Number.isFinite(controls.moon.elevationDegrees))
  assert.notDeepEqual(controls.moon, controls.sun)
})

test('复制控制状态时不共享月球控制对象', () => {
  const controls = createEarthControls()
  const clone = cloneAtmosphereControls(controls)

  clone.moon.enabled = false
  clone.moon.azimuthDegrees += 10

  assert.equal(controls.moon.enabled, true)
  assert.notEqual(
    clone.moon.azimuthDegrees,
    controls.moon.azimuthDegrees,
  )
})
