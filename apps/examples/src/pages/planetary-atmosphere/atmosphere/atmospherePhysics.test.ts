import { assert, test } from 'vitest'
import { close } from '../test/assertions.ts'
import { EARTH_ATMOSPHERE } from './AtmosphereParameters.ts'
import {
  createDefaultCelestialScenario,
  evaluateCelestialScenario,
} from '../celestial/CelestialSystem.ts'
import { eclipseDiagnosticsAtPoint } from '../celestial/CelestialRenderFrame.ts'
import {
  aerialPerspectiveDistanceFromSlice,
  aerialPerspectiveSliceFromDistance,
  beerLambert,
  cornetteShanksPhase,
  exponentialDensity,
  multiScatteringRadiusSunCosineFromUv,
  multiScatteringUvFromRadiusSunCosine,
  ozoneDensity,
  rayleighPhase,
  resolveAtmosphereLutDirtyPasses,
  skyViewParametersFromUv,
  skyViewUvFromParameters,
  solarDiskIrradianceCosine,
  solarDiskPixelCoverage,
  solarDiskSolidAngle,
  solarDiskVisibleFraction,
  transmittanceRadiusCosineFromUv,
  transmittanceUvFromRadiusCosine,
} from './atmospherePhysics.ts'

const DEFAULT_SUN_ANGULAR_RADIUS_RADIANS = (() => {
  const snapshot = evaluateCelestialScenario(
    createDefaultCelestialScenario(),
    0,
  )
  return eclipseDiagnosticsAtPoint(
    snapshot,
    snapshot.earth.systemPositionKm,
  ).sunAngularRadiusRadians
})()

test('指数剖面和臭氧三角剖面覆盖边界', () => {
  close(exponentialDensity(0, 8), 1)
  close(exponentialDensity(8, 8), Math.exp(-1))
  close(exponentialDensity(-1, 8), 1)
  close(ozoneDensity(10, 25, 15), 0)
  close(ozoneDensity(25, 25, 15), 1)
  close(ozoneDensity(40, 25, 15), 0)
  close(ozoneDensity(50, 25, 15), 0)
  assert.throws(() => exponentialDensity(1, 0))
  assert.throws(() => ozoneDensity(25, 25, Number.NaN))
})

test('Rayleigh 与 Cornette-Shanks 在球面积分上归一化', () => {
  const sampleCount = 20_000
  const step = 2 / sampleCount
  let rayleighIntegral = 0
  let mieIntegral = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const cosine = -1 + (index + 0.5) * step
    rayleighIntegral += rayleighPhase(cosine) * step * 2 * Math.PI
    mieIntegral +=
      cornetteShanksPhase(cosine, EARTH_ATMOSPHERE.miePhaseG) *
      step *
      2 *
      Math.PI
  }

  close(rayleighIntegral, 1, 1e-8)
  close(mieIntegral, 1, 1e-6)
  assert.ok(
    cornetteShanksPhase(1, EARTH_ATMOSPHERE.miePhaseG) >
      cornetteShanksPhase(-1, EARTH_ATMOSPHERE.miePhaseG),
  )
})

test('Beer-Lambert 在路径增长时透射率单调下降', () => {
  assert.deepEqual(beerLambert([0.1, 0.2, 0.3], 0), [1, 1, 1])

  const near = beerLambert([0.1, 0.2, 0.3], 1)
  const far = beerLambert([0.1, 0.2, 0.3], 10)

  assert.ok(far.every((component, index) => component < near[index]))
  assert.throws(() => beerLambert([-0.1, 0.2, 0.3], 1))
})

test('太阳圆盘使用精确球冠立体角', () => {
  const radius = DEFAULT_SUN_ANGULAR_RADIUS_RADIANS
  const exact = solarDiskSolidAngle(radius)
  const smallAngle = Math.PI * radius * radius
  const relativeError = Math.abs(smallAngle - exact) / exact

  assert.ok(exact > 0)
  assert.ok(relativeError < 2e-6)
  assert.throws(() => solarDiskSolidAngle(0), /太阳角半径/)
  assert.throws(() => solarDiskSolidAngle(Number.NaN), /太阳角半径/)
})

test('太阳圆盘像素覆盖率在物理边缘连续且单调', () => {
  const radius = DEFAULT_SUN_ANGULAR_RADIUS_RADIANS
  const pixelWidth = radius * 0.25
  const distances = [
    radius - pixelWidth,
    radius - pixelWidth * 0.5,
    radius,
    radius + pixelWidth * 0.5,
    radius + pixelWidth,
  ]
  const coverages = distances.map((distance) =>
    solarDiskPixelCoverage(distance, radius, pixelWidth),
  )

  assert.deepEqual(coverages, [1, 1, 0.5, 0, 0])
  assert.ok(
    coverages.every(
      (coverage, index) =>
        index === 0 || coverage <= coverages[index - 1],
    ),
  )
  assert.throws(() =>
    solarDiskPixelCoverage(0, radius, 0),
  )
})

test('太阳圆盘穿越几何地平线时可见率和地表辐照连续', () => {
  const radius = DEFAULT_SUN_ANGULAR_RADIUS_RADIANS
  const distances = [-radius, -radius / 2, 0, radius / 2, radius]
  const visibleFractions = distances.map((distance) =>
    solarDiskVisibleFraction(distance, radius),
  )
  const irradianceCosines = distances.map((distance) =>
    solarDiskIrradianceCosine(distance, radius),
  )

  close(visibleFractions[0], 0)
  close(visibleFractions[2], 0.5)
  close(visibleFractions[4], 1)
  assert.ok(
    visibleFractions.every(
      (fraction, index) =>
        index === 0 || fraction >= visibleFractions[index - 1],
    ),
  )
  assert.ok(
    irradianceCosines.every(
      (cosine, index) =>
        index === 0 || cosine >= irradianceCosines[index - 1],
    ),
  )
  close(
    irradianceCosines[2],
    (2 * radius) / (3 * Math.PI),
    1e-12,
  )
  assert.throws(() =>
    solarDiskVisibleFraction(Number.NaN, radius),
  )
})

test('Transmittance radius/cosine 与 UV 往返', () => {
  const radiusSamples = [6360, 6360.1, 6380, 6420, 6459.9]

  for (const radius of radiusSamples) {
    const horizonCosine = -Math.sqrt(
      Math.max(1 - (6360 * 6360) / (radius * radius), 0),
    )
    const cosineSamples = [
      horizonCosine,
      horizonCosine * 0.5,
      0,
      0.25,
      0.8,
      1,
    ]

    for (const cosine of cosineSamples) {
      const uv = transmittanceUvFromRadiusCosine(
        6360,
        6460,
        radius,
        cosine,
      )
      const reconstructed = transmittanceRadiusCosineFromUv(
        6360,
        6460,
        uv,
      )

      close(reconstructed[0], radius, 1e-8)
      close(reconstructed[1], cosine, 1e-8)
    }
  }
})

test('Multi-Scattering 高度和太阳天顶余弦与 UV 往返', () => {
  for (const radiusKm of [6360, 6360.01, 6385, 6410, 6459.99, 6460]) {
    for (const sunCosine of [-1, -0.25, 0, 0.75, 1]) {
      const uv = multiScatteringUvFromRadiusSunCosine(
        6360,
        6460,
        radiusKm,
        sunCosine,
      )
      const restored = multiScatteringRadiusSunCosineFromUv(
        6360,
        6460,
        uv,
      )

      assert.ok(Math.abs(restored[0] - radiusKm) < 1e-9)
      assert.ok(Math.abs(restored[1] - sunCosine) < 1e-9)
    }
  }

  assert.throws(() =>
    multiScatteringUvFromRadiusSunCosine(6360, 6460, 6359, 0),
  )
  assert.throws(() =>
    multiScatteringRadiusSunCosineFromUv(
      6360,
      6460,
      [Number.NaN, 0],
    ),
  )
})

test('Sky-View 地平线上下分区与方位余弦保持往返', () => {
  const bottomRadiusKm = 6360
  const viewRadiusKm = 6361.5

  for (const u of [0, 0.1, 0.5, 0.9, 1]) {
    for (const v of [0, 0.1, 0.35, 0.65, 0.9, 1]) {
      const parameters = skyViewParametersFromUv(
        bottomRadiusKm,
        viewRadiusKm,
        [u, v],
      )
      const restored = skyViewUvFromParameters(
        bottomRadiusKm,
        viewRadiusKm,
        v > 0.5,
        parameters[0],
        parameters[1],
      )

      assert.ok(Math.abs(restored[0] - u) < 1e-7)
      assert.ok(Math.abs(restored[1] - v) < 1e-7)
    }
  }

  assert.throws(() =>
    skyViewParametersFromUv(bottomRadiusKm, 6359, [0.5, 0.5]),
  )
})

test('Aerial Perspective 平方切片覆盖射线边界', () => {
  const boundaryDistanceKm = 1132.25

  for (const slice of [0, 1 / 32, 0.25, 0.5, 0.75, 1]) {
    const distanceKm = aerialPerspectiveDistanceFromSlice(
      boundaryDistanceKm,
      slice,
    )
    const restored = aerialPerspectiveSliceFromDistance(
      boundaryDistanceKm,
      distanceKm,
    )

    assert.ok(Number.isFinite(distanceKm))
    assert.ok(Math.abs(restored - slice) < 1e-12)
  }

  assert.equal(aerialPerspectiveDistanceFromSlice(100, 0), 0)
  assert.equal(aerialPerspectiveDistanceFromSlice(100, 1), 100)
  assert.throws(() =>
    aerialPerspectiveSliceFromDistance(100, 101),
  )
})

test('LUT dirty dependency 上游级联且下游不反向污染', () => {
  const baseline = {
    atmosphere: 'earth',
    multipleScattering: 'earth',
    skyView: 'height:1.5:sun:0.5',
    aerialPerspective: 'camera-a',
  }

  assert.deepEqual(resolveAtmosphereLutDirtyPasses(baseline, baseline), {
    transmittance: false,
    multipleScattering: false,
    skyView: false,
    aerialPerspective: false,
  })
  assert.deepEqual(
    resolveAtmosphereLutDirtyPasses(baseline, {
      ...baseline,
      atmosphere: 'no-ozone',
    }),
    {
      transmittance: true,
      multipleScattering: true,
      skyView: true,
      aerialPerspective: true,
    },
  )
  assert.deepEqual(
    resolveAtmosphereLutDirtyPasses(baseline, {
      ...baseline,
      skyView: 'height:20:sun:0.5',
    }),
    {
      transmittance: false,
      multipleScattering: false,
      skyView: true,
      aerialPerspective: false,
    },
  )
  assert.deepEqual(
    resolveAtmosphereLutDirtyPasses(baseline, {
      ...baseline,
      aerialPerspective: 'camera-b',
    }),
    {
      transmittance: false,
      multipleScattering: false,
      skyView: false,
      aerialPerspective: true,
    },
  )
})
