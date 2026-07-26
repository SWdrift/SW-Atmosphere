import { assert, test } from 'vitest'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import {
  cross,
  dot,
  length,
  normalize,
} from '../math/vector3.ts'
import { close } from '../test/assertions.ts'
import {
  cameraPresetPose,
  horizonDipRadians,
  INITIAL_CAMERA_ALTITUDE_KM,
  tangentCameraPose,
} from './cameraPresets.ts'

test('地表预设使用 1.5 m 高度并精确指向可见地平线', () => {
  const planetRadiusKm = EARTH_ATMOSPHERE.bottomRadiusKm
  const pose = cameraPresetPose('surface', planetRadiusKm)
  const localUp = normalize(pose.position)

  close(length(pose.position) - planetRadiusKm, 0.0015, 1e-10)
  close(length(cross(pose.position, pose.forward)), planetRadiusKm, 1e-8)
  close(dot(pose.forward, localUp), -Math.sin(
    horizonDipRadians(INITIAL_CAMERA_ALTITUDE_KM, planetRadiusKm),
  ), 1e-12)
  close(dot(cross(pose.forward, pose.up), localUp), 0, 1e-12)
  assert.ok(dot(pose.up, localUp) > 0.999_999)
})

test('切线姿态在任意路径高度都保持球面相切与当地竖直', () => {
  const planetRadiusKm = EARTH_ATMOSPHERE.bottomRadiusKm

  for (const altitudeKm of [20, 400, 600, 800]) {
    const pose = tangentCameraPose(altitudeKm, planetRadiusKm)
    const localUp = normalize(pose.position)

    close(
      length(cross(pose.position, pose.forward)),
      planetRadiusKm,
      1e-8,
    )
    close(dot(cross(pose.forward, pose.up), localUp), 0, 1e-12)
    assert.ok(dot(pose.up, localUp) > 0)
  }
})

test('深空 24° 视场完整容纳大气顶并留有边距', () => {
  const pose = cameraPresetPose(
    'deep-space',
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  const angularDiameterDegrees =
    (2 *
      Math.asin(
        EARTH_ATMOSPHERE.topRadiusKm / length(pose.position),
      ) *
      180) /
    Math.PI

  close(angularDiameterDegrees, 20.46788637845156, 1e-10)
  assert.ok(angularDiameterDegrees < 24)
})
