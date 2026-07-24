import { assert, test } from 'vitest'
import { length } from './vector3.ts'
import { close } from '../test/assertions.ts'
import {
  isUnitQuaternion,
  quaternionFromAxisAngle,
  rotateVectorByQuaternion,
} from './quaternion.ts'

test('旋转跨越极点不退化并保持单位长度', () => {
  const quarterTurn = quaternionFromAxisAngle(
    [1, 0, 0],
    Math.PI / 2,
  )
  const rotated = rotateVectorByQuaternion(
    [0, 0, 1],
    quarterTurn,
  )

  assert.ok(isUnitQuaternion(quarterTurn))
  close(rotated[0], 0)
  close(rotated[1], -1)
  close(rotated[2], 0)
  close(length(rotated), 1)
})
