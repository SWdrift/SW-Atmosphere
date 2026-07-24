import { test } from 'vitest'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import { PlanetCamera } from '../camera/PlanetCamera.ts'
import {
  freeViewBasis,
  rollFreeBody,
} from '../camera/freeViewCoordinates.ts'
import { dot, length } from '../math/vector3.ts'
import { close } from './assertions.ts'

test('自由视角局部 forward 经姿态转换后在世界空间移动', () => {
  const camera = new PlanetCamera(
    [0, 0, 7000],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const view = rollFreeBody(
    {
      bodyOrientation: [0, 0, 0, 1],
      yawRadians: 0.6,
      pitchRadians: 0.4,
    },
    Math.PI / 3,
  )
  const basis = freeViewBasis(view)
  camera.setPose(
    camera.position,
    basis.forward,
    basis.up,
  )

  const positionBeforeMove = camera.position
  const globalForward = camera.forward
  camera.move(
    globalForward,
    EARTH_ATMOSPHERE.bottomRadiusKm,
    0.01,
  )

  close(
    camera.position[0] - positionBeforeMove[0],
    globalForward[0],
  )
  close(
    camera.position[1] - positionBeforeMove[1],
    globalForward[1],
  )
  close(
    camera.position[2] - positionBeforeMove[2],
    globalForward[2],
  )
  close(length(camera.forward), 1)
  close(dot(camera.forward, camera.right), 0)
  close(dot(camera.forward, camera.up), 0)
})
