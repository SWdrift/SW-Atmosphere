import { assert, test } from 'vitest'
import { PlanetCamera } from '../camera/PlanetCamera.ts'
import { close } from '../test/assertions.ts'
import {
  projectWorldDirectionToNdc,
  projectWorldPointToNdc,
} from './DebugOverlay.ts'

test('全局点投影并正确剔除相机后方', () => {
  const camera = new PlanetCamera(
    [0, 0, 10],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const center = projectWorldPointToNdc(
    [0, 10, 10],
    camera,
    16 / 9,
  )
  const right = projectWorldPointToNdc(
    [1, 10, 10],
    camera,
    16 / 9,
  )
  const behind = projectWorldPointToNdc(
    [0, -10, 10],
    camera,
    16 / 9,
  )

  assert.ok(center)
  assert.ok(right)
  close(center.x, 0)
  close(center.y, 0)
  assert.ok(right.x > 0)
  assert.equal(behind, null)
})

test('天空经纬投影只依赖世界方向', () => {
  const firstCamera = new PlanetCamera(
    [0, 0, 10],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const secondCamera = new PlanetCamera(
    [10_000, -20_000, 30_000],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const firstProjection = projectWorldDirectionToNdc(
    [0, 1, 0],
    firstCamera,
    16 / 9,
  )
  const secondProjection = projectWorldDirectionToNdc(
    [0, 1, 0],
    secondCamera,
    16 / 9,
  )

  assert.ok(firstProjection)
  assert.ok(secondProjection)
  close(firstProjection.x, 0)
  close(firstProjection.y, 0)
  close(secondProjection.x, firstProjection.x)
  close(secondProjection.y, firstProjection.y)
  assert.equal(
    projectWorldDirectionToNdc(
      [0, -1, 0],
      firstCamera,
      16 / 9,
    ),
    null,
  )
})
