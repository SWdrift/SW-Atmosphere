import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import { intersectRaySphere } from './raySphere.ts'

test('覆盖未命中、普通命中、球内、背离和相切', () => {
  assert.equal(intersectRaySphere([0, 0, 0], [1, 0, 0], [0, 0, 5], 1), null)

  const outside = intersectRaySphere([0, 0, 0], [0, 0, 1], [0, 0, 5], 1)
  assert.ok(outside)
  close(outside.near, 4)
  close(outside.far, 6)

  const inside = intersectRaySphere([0, 0, 0], [0, 0, 2], [0, 0, 0], 1)
  assert.ok(inside)
  close(inside.near, -0.5)
  close(inside.far, 0.5)

  const behind = intersectRaySphere([0, 0, 0], [0, 0, 1], [0, 0, -5], 1)
  assert.ok(behind)
  assert.ok(behind.far < 0)

  const tangent = intersectRaySphere([1, 0, -5], [0, 0, 1], [0, 0, 0], 1)
  assert.ok(tangent)
  close(tangent.near, 5)
  close(tangent.far, 5)
})

test('非法射线和半径 fail fast', () => {
  assert.throws(() =>
    intersectRaySphere([0, 0, 0], [0, 0, 0], [0, 0, 0], 1),
  )
  assert.throws(() =>
    intersectRaySphere([0, 0, 0], [1, 0, 0], [0, 0, 0], 0),
  )
})
