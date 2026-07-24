import { assert, test } from 'vitest'
import {
  CAMERA_PITCH_LIMIT_RADIANS,
  INITIAL_CAMERA_RADIAL,
} from '../math/coordinates.ts'
import { isFiniteVector, length } from '../math/vector3.ts'
import { close } from '../test/assertions.ts'
import {
  orbitAnglesFromRadial,
  orbitRadialFromAngles,
  rotateOrbitAngles,
} from './orbitCoordinates.ts'

test('turntable 在极点前停止且方位角连续', () => {
  let angles = orbitAnglesFromRadial(INITIAL_CAMERA_RADIAL)

  for (let index = 0; index < 720; index += 1) {
    angles = rotateOrbitAngles(
      angles,
      Math.PI / 180,
      Math.PI / 120,
    )
  }

  const radial = orbitRadialFromAngles(angles)
  close(length(radial), 1, 1e-8)
  close(angles.elevationRadians, CAMERA_PITCH_LIMIT_RADIANS)
  assert.ok(isFiniteVector(radial))
})
