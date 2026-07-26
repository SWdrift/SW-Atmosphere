import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import { bodyElevationScreenOffset } from './BodyAttitudeIndicator.ts'

test('Body 水平线只表达 Look pitch 相对身体水平的偏移', () => {
  close(bodyElevationScreenOffset(0, 0, 18), 0)
  assert.ok(bodyElevationScreenOffset(0, Math.PI / 6, 18) > 0)
  close(
    bodyElevationScreenOffset(Math.PI / 12, 0, 18),
    -Math.tan(Math.PI / 12) * 18,
  )
  close(
    bodyElevationScreenOffset(Math.PI / 6, 0, 18),
    -Math.tan(Math.PI / 6) * 18,
  )
  close(
    bodyElevationScreenOffset(Math.PI / 6, Math.PI / 6, 18),
    0,
  )
  assert.throws(() =>
    bodyElevationScreenOffset(0, Number.NaN, 18),
  )
})
