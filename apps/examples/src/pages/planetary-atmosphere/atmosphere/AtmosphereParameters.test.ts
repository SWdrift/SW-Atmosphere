import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import {
  ATMOSPHERE_UNIFORM_FLOAT_COUNT,
  EARTH_ATMOSPHERE,
  serializeAtmosphereParameters,
} from './AtmosphereParameters.ts'

test('GPU 序列化布局固定且只包含物理真相', () => {
  const uniforms = serializeAtmosphereParameters(EARTH_ATMOSPHERE)

  assert.equal(uniforms.length, ATMOSPHERE_UNIFORM_FLOAT_COUNT)
  assert.equal(uniforms[0], EARTH_ATMOSPHERE.bottomRadiusKm)
  assert.equal(uniforms[1], EARTH_ATMOSPHERE.topRadiusKm)
  close(uniforms[2], EARTH_ATMOSPHERE.sunAngularRadiusRadians, 1e-8)
  close(uniforms[4], EARTH_ATMOSPHERE.rayleighScatteringPerKm[0], 1e-8)
  assert.equal(uniforms[7], EARTH_ATMOSPHERE.rayleighScaleHeightKm)
  close(uniforms[11], EARTH_ATMOSPHERE.mieScaleHeightKm, 1e-7)
  close(uniforms[15], EARTH_ATMOSPHERE.miePhaseG, 1e-7)
  assert.equal(uniforms[19], EARTH_ATMOSPHERE.ozoneLayerCenterHeightKm)
  assert.equal(uniforms[23], EARTH_ATMOSPHERE.ozoneLayerHalfWidthKm)
  close(
    uniforms[24],
    EARTH_ATMOSPHERE.solarIrradianceWattsPerSquareMeterPerNm[0],
    1e-7,
  )
  close(
    uniforms[28],
    EARTH_ATMOSPHERE.skySpectralRadianceToLinearSrgb[0],
    1e-7,
  )
  close(
    uniforms[32],
    EARTH_ATMOSPHERE.sunSpectralRadianceToLinearSrgb[0],
    1e-7,
  )
})

test('非法半径、剖面、反照率和 scattering/extinction fail fast', () => {
  assert.throws(() =>
    serializeAtmosphereParameters({
      ...EARTH_ATMOSPHERE,
      topRadiusKm: EARTH_ATMOSPHERE.bottomRadiusKm,
    }),
  )
  assert.throws(() =>
    serializeAtmosphereParameters({
      ...EARTH_ATMOSPHERE,
      ozoneLayerCenterHeightKm: 95,
    }),
  )
  assert.throws(() =>
    serializeAtmosphereParameters({
      ...EARTH_ATMOSPHERE,
      groundAlbedoLinear: [1.1, 0.1, 0.1],
    }),
  )
  assert.throws(() =>
    serializeAtmosphereParameters({
      ...EARTH_ATMOSPHERE,
      mieScatteringPerKm: [0.01, 0.003996, 0.003996],
    }),
  )
  assert.throws(() =>
    serializeAtmosphereParameters({
      ...EARTH_ATMOSPHERE,
      skySpectralRadianceToLinearSrgb: [0, 1, 1],
    }),
  )
})
