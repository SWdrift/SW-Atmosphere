import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import {
  createDefaultCelestialScenario,
  evaluateCelestialScenario,
} from './CelestialSystem.ts'
import {
  circleOccludedFraction,
  eclipseDiagnosticsAtPoint,
} from './CelestialRenderFrame.ts'

test('圆盘遮挡覆盖无交、全食、环食与部分遮挡', () => {
  assert.equal(circleOccludedFraction(1, 1, 2), 0)
  assert.equal(circleOccludedFraction(1, 2, 0), 1)
  close(circleOccludedFraction(2, 1, 0), 0.25, 1e-12)
  const partial = circleOccludedFraction(1, 1, 1)
  assert.ok(partial > 0 && partial < 1)
})

test('默认冬季朔月场景在地心附近产生太阳遮挡', () => {
  const snapshot = evaluateCelestialScenario(
    createDefaultCelestialScenario(),
    0,
  )
  const diagnostics = eclipseDiagnosticsAtPoint(
    snapshot,
    snapshot.earth.systemPositionKm,
  )

  assert.ok(diagnostics.separationRadians < 0.01)
  assert.ok(diagnostics.solarVisibleFraction < 1)
})
