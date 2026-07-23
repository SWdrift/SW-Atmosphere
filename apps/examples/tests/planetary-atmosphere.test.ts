import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ATMOSPHERE_UNIFORM_FLOAT_COUNT,
  EARTH_ATMOSPHERE,
  serializeAtmosphereParameters,
} from '../src/pages/planetary-atmosphere/atmosphere/AtmosphereParameters.ts'
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
} from '../src/pages/planetary-atmosphere/atmosphere/atmospherePhysics.ts'
import {
  automaticSpeedKmPerSecond,
  CAMERA_PRESETS,
  CameraController,
  MINIMUM_CAMERA_ALTITUDE_KM,
} from '../src/pages/planetary-atmosphere/camera/CameraController.ts'
import {
  freeViewBasis,
  rollFreeBody,
  rotateFreeView,
  type FreeView,
} from '../src/pages/planetary-atmosphere/camera/freeViewCoordinates.ts'
import { PlanetCamera } from '../src/pages/planetary-atmosphere/camera/PlanetCamera.ts'
import {
  orbitAnglesFromRadial,
  orbitRadialFromAngles,
  rotateOrbitAngles,
} from '../src/pages/planetary-atmosphere/camera/orbitCoordinates.ts'
import {
  altitudeFromPosition,
  CAMERA_PITCH_LIMIT_RADIANS,
  cameraRayDirection,
  INITIAL_CAMERA_RADIAL,
  sunDirectionFromAngles,
} from '../src/pages/planetary-atmosphere/math/coordinates.ts'
import { intersectRaySphere } from '../src/pages/planetary-atmosphere/math/raySphere.ts'
import {
  isUnitQuaternion,
  quaternionFromAxisAngle,
  rotateVectorByQuaternion,
} from '../src/pages/planetary-atmosphere/math/quaternion.ts'
import {
  dot,
  isFiniteVector,
  length,
  normalize,
} from '../src/pages/planetary-atmosphere/math/vector3.ts'
import {
  projectWorldDirectionToNdc,
  projectWorldPointToNdc,
} from '../src/pages/planetary-atmosphere/ui/DebugOverlay.ts'

const EPSILON = 1e-9

function close(actual: number, expected: number, epsilon = EPSILON): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `期望 ${actual} 与 ${expected} 的差不超过 ${epsilon}`,
  )
}

test('ray-sphere：覆盖未命中、普通命中、球内、背离和相切', () => {
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

test('大气外 Production：积分区间只覆盖实际大气路径', () => {
  const atmosphereRadius = EARTH_ATMOSPHERE.topRadiusKm
  const groundRadius = EARTH_ATMOSPHERE.bottomRadiusKm

  const missesAtmosphere = intersectRaySphere(
    [0, 0, atmosphereRadius + 6.5],
    [1, 0, 0],
    [0, 0, 0],
    atmosphereRadius,
  )
  assert.equal(missesAtmosphere, null)

  const shellOrigin: [number, number, number] = [-7000, 6400, 0]
  const shellDirection: [number, number, number] = [1, 0, 0]
  const shellAtmosphere = intersectRaySphere(
    shellOrigin,
    shellDirection,
    [0, 0, 0],
    atmosphereRadius,
  )
  const shellGround = intersectRaySphere(
    shellOrigin,
    shellDirection,
    [0, 0, 0],
    groundRadius,
  )
  assert.ok(shellAtmosphere)
  assert.equal(shellGround, null)
  assert.ok(shellAtmosphere.near > 0)
  assert.ok(shellAtmosphere.far > shellAtmosphere.near)

  const groundOrigin: [number, number, number] = [-7000, 0, 0]
  const groundDirection: [number, number, number] = [1, 0, 0]
  const groundAtmosphere = intersectRaySphere(
    groundOrigin,
    groundDirection,
    [0, 0, 0],
    atmosphereRadius,
  )
  const ground = intersectRaySphere(
    groundOrigin,
    groundDirection,
    [0, 0, 0],
    groundRadius,
  )
  assert.ok(groundAtmosphere)
  assert.ok(ground)
  close(ground.near - groundAtmosphere.near, atmosphereRadius - groundRadius)
})

test('camera ray：中心射线等于 forward，边缘射线保持归一化和正确方向', () => {
  const center = cameraRayDirection(
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
    16 / 9,
    0,
    0,
  )
  assert.deepEqual(center, [0, 1, 0])

  const upperRight = cameraRayDirection(
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
    16 / 9,
    1,
    1,
  )
  close(length(upperRight), 1)
  assert.ok(upperRight[0] > 0)
  assert.ok(upperRight[1] > 0)
  assert.ok(upperRight[2] > 0)
})

test('坐标：高度、太阳方位和太阳高度角使用同一右手系', () => {
  close(altitudeFromPosition([0, 0, 6361.5], 6360), 1.5)

  const northHorizon = sunDirectionFromAngles(0, 0)
  assert.deepEqual(northHorizon, [0, 1, 0])

  const zenith = sunDirectionFromAngles(0, 90)
  close(dot(zenith, [0, 0, 1]), 1)
})

test('跨尺度速度：近地可精细移动，太空受明确上限约束', () => {
  close(automaticSpeedKmPerSecond(-10), 0.005)
  close(automaticSpeedKmPerSecond(1.5), 0.075)
  close(automaticSpeedKmPerSecond(100), 5)
  close(automaticSpeedKmPerSecond(100_000), 2_000)
  assert.throws(() => automaticSpeedKmPerSecond(Number.NaN))
})

test('大气参数：GPU 序列化布局固定且只包含物理真相', () => {
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

test('大气参数：非法半径、剖面、反照率和 scattering/extinction fail fast', () => {
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

test('大气密度：指数剖面和臭氧三角剖面覆盖边界', () => {
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

test('相函数：Rayleigh 与 Cornette-Shanks 在球面积分上归一化', () => {
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

test('Beer-Lambert：零距离为 1，路径增长时透射率单调下降', () => {
  assert.deepEqual(beerLambert([0.1, 0.2, 0.3], 0), [1, 1, 1])

  const near = beerLambert([0.1, 0.2, 0.3], 1)
  const far = beerLambert([0.1, 0.2, 0.3], 10)

  assert.ok(far.every((component, index) => component < near[index]))
  assert.throws(() => beerLambert([-0.1, 0.2, 0.3], 1))
})

test('太阳圆盘：使用精确球冠立体角且类太阳小角近似误差可量化', () => {
  const radius = EARTH_ATMOSPHERE.sunAngularRadiusRadians
  const exact = solarDiskSolidAngle(radius)
  const smallAngle = Math.PI * radius * radius
  const relativeError = Math.abs(smallAngle - exact) / exact

  assert.ok(exact > 0)
  assert.ok(relativeError < 2e-6)
  assert.throws(() => solarDiskSolidAngle(0), /太阳角半径/)
  assert.throws(() => solarDiskSolidAngle(Number.NaN), /太阳角半径/)
})

test('太阳圆盘：像素角覆盖率在物理边缘连续且保持单调', () => {
  const radius = EARTH_ATMOSPHERE.sunAngularRadiusRadians
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
      (coverage, index) => index === 0 || coverage <= coverages[index - 1],
    ),
  )
  assert.throws(() => solarDiskPixelCoverage(0, radius, 0), /太阳圆盘覆盖率/)
})

test('太阳圆盘：穿越几何地平线时可见率和地表辐照连续', () => {
  const radius = EARTH_ATMOSPHERE.sunAngularRadiusRadians
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
  assert.throws(
    () => solarDiskVisibleFraction(Number.NaN, radius),
    /太阳圆盘可见率/,
  )
})

test('Transmittance 映射：地表到大气顶的 radius/cosine 与 UV 往返', () => {
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
      const uv = transmittanceUvFromRadiusCosine(6360, 6460, radius, cosine)
      const reconstructed = transmittanceRadiusCosineFromUv(6360, 6460, uv)

      close(reconstructed[0], radius, 1e-8)
      close(reconstructed[1], cosine, 1e-8)
    }
  }
})

test('Multi-Scattering 映射：高度和太阳天顶余弦与 UV 往返', () => {
  for (const radiusKm of [6360, 6360.01, 6385, 6410, 6459.99, 6460]) {
    for (const sunCosine of [-1, -0.25, 0, 0.75, 1]) {
      const uv = multiScatteringUvFromRadiusSunCosine(
        6360,
        6460,
        radiusKm,
        sunCosine,
      )
      const restored = multiScatteringRadiusSunCosineFromUv(6360, 6460, uv)

      assert.ok(Math.abs(restored[0] - radiusKm) < 1e-9)
      assert.ok(Math.abs(restored[1] - sunCosine) < 1e-9)
    }
  }

  assert.throws(
    () => multiScatteringUvFromRadiusSunCosine(6360, 6460, 6359, 0),
    /物理范围/,
  )
  assert.throws(
    () => multiScatteringRadiusSunCosineFromUv(6360, 6460, [Number.NaN, 0]),
    /单位正方形/,
  )
})

test('Sky-View 映射：地平线上下分区与方位余弦保持往返', () => {
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

  assert.throws(
    () => skyViewParametersFromUv(bottomRadiusKm, 6359, [0.5, 0.5]),
    /物理范围/,
  )
})

test('Aerial Perspective 映射：平方切片覆盖零距离到射线边界', () => {
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
  assert.throws(
    () => aerialPerspectiveSliceFromDistance(100, 101),
    /射线边界/,
  )
})

test('LUT dirty dependency：上游变化级联，下游局部变化不反向污染', () => {
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

test('PlanetCamera：姿态保持正交且移动不能穿地', () => {
  const minimumRadius =
    EARTH_ATMOSPHERE.bottomRadiusKm + MINIMUM_CAMERA_ALTITUDE_KM
  const camera = new PlanetCamera(
    [0, 0, EARTH_ATMOSPHERE.bottomRadiusKm + 1],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )

  camera.setPose(camera.position, [0.3, 0.9, 0.2], [-0.2, 0.1, 1])
  close(length(camera.forward), 1)
  close(length(camera.right), 1)
  close(length(camera.up), 1)
  close(dot(camera.forward, camera.right), 0, 1e-8)
  close(dot(camera.up, camera.forward), 0, 1e-8)
  assert.ok(isFiniteVector(camera.forward))
  assert.throws(() =>
    camera.setPose(camera.position, [0, Number.NaN, 0], [0, 0, 1]),
  )

  const forwardBeforeMove = camera.forward
  const upBeforeMove = camera.up

  camera.move(
    [0, 0, -100],
    EARTH_ATMOSPHERE.bottomRadiusKm,
    MINIMUM_CAMERA_ALTITUDE_KM,
  )
  close(length(camera.position), minimumRadius, 1e-8)
  assert.ok(isFiniteVector(camera.position))
  assert.ok(isFiniteVector(camera.forward))
  assert.deepEqual(camera.forward, forwardBeforeMove)
  assert.deepEqual(camera.up, upBeforeMove)
})

test('PlanetCamera：高速移动不能穿过行星，接触后保留切向移动', () => {
  const minimumRadius =
    EARTH_ATMOSPHERE.bottomRadiusKm + MINIMUM_CAMERA_ALTITUDE_KM
  const camera = new PlanetCamera(
    [minimumRadius + 1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    60,
  )

  camera.move(
    [-minimumRadius * 3, 10, 0],
    EARTH_ATMOSPHERE.bottomRadiusKm,
    MINIMUM_CAMERA_ALTITUDE_KM,
  )

  assert.ok(length(camera.position) >= minimumRadius - 1e-8)
  assert.ok(camera.position[1] > 0)
  assert.ok(camera.position[0] > 0)
})

test('PlanetCamera：正视球心时仍能构造稳定的 right/up', () => {
  const radius = EARTH_ATMOSPHERE.bottomRadiusKm + 400
  const camera = new PlanetCamera(
    [0, 0, radius],
    [0, 0, -1],
    [0, 1, 0],
    60,
  )

  close(length(camera.right), 1)
  close(length(camera.up), 1)
  close(dot(camera.forward, camera.right), 0)
  close(dot(camera.forward, camera.up), 0)
  assert.ok(isFiniteVector(camera.right))
  assert.ok(isFiniteVector(camera.up))
})

test('PlanetCamera：视觉基准允许 5° 窄视场并拒绝范围外输入', () => {
  const camera = new PlanetCamera(
    [0, 0, EARTH_ATMOSPHERE.bottomRadiusKm + 1],
    [0, 1, 0],
    [0, 0, 1],
    5,
  )

  assert.equal(camera.verticalFovDegrees, 5)
  assert.throws(() => camera.setVerticalFov(4.99), /5° 到 100°/)
  assert.throws(() => camera.setVerticalFov(100.01), /5° 到 100°/)
})

test('斜向切线预设：屏幕中的行星切线稳定倾斜 45°', () => {
  const camera = new PlanetCamera(
    [0, 0, EARTH_ATMOSPHERE.bottomRadiusKm + 20],
    [1, 0, 0],
    [0, 0, 1],
    60,
  )
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )

  controller.applyPreset('tilted-tangent')

  const preset = CAMERA_PRESETS.find(
    (candidate) => candidate.id === 'tilted-tangent',
  )
  assert.ok(preset)
  assert.equal(preset.rollDegrees, 45)

  const radialToPlanetCenter = normalize([
    -camera.position[0],
    -camera.position[1],
    -camera.position[2],
  ])
  const screenNormal = [
    dot(radialToPlanetCenter, camera.right),
    dot(radialToPlanetCenter, camera.up),
  ]
  const tangentAngleRadians =
    Math.atan2(screenNormal[1], screenNormal[0]) + Math.PI / 2
  const normalizedTangentAngle = Math.atan2(
    Math.sin(tangentAngleRadians),
    Math.cos(tangentAngleRadians),
  )

  close(Math.abs(normalizedTangentAngle), Math.PI / 4)
})

test('四元数旋转：跨越极点不退化并保持单位长度', () => {
  const quarterTurn = quaternionFromAxisAngle([1, 0, 0], Math.PI / 2)
  const rotated = rotateVectorByQuaternion([0, 0, 1], quarterTurn)

  assert.ok(isUnitQuaternion(quarterTurn))
  close(rotated[0], 0)
  close(rotated[1], -1)
  close(rotated[2], 0)
  close(length(rotated), 1)
})

test('自由摄像机：Body 偏转前后鼠标观察规律一致', () => {
  const levelView: FreeView = {
    bodyOrientation: [0, 0, 0, 1],
    yawRadians: 0.4,
    pitchRadians: 0.2,
  }
  const rolledView = rollFreeBody(levelView, Math.PI / 3)
  const input: [number, number, number] = [0.03, 0, -0.02]
  const levelRotated = rotateFreeView(levelView, input)
  const rollRotated = rotateFreeView(rolledView, input)

  close(levelRotated.yawRadians, rollRotated.yawRadians)
  close(levelRotated.pitchRadians, rollRotated.pitchRadians)
  assert.deepEqual(levelRotated.bodyOrientation, levelView.bodyOrientation)
  assert.deepEqual(rollRotated.bodyOrientation, rolledView.bodyOrientation)
})

test('自由摄像机：相反观察与 Body 偏转输入均闭合完整姿态', () => {
  const view: FreeView = {
    bodyOrientation: [0, 0, 0, 1],
    yawRadians: 0.3,
    pitchRadians: 0.2,
  }
  const firstBasis = freeViewBasis(view)
  const moved = rotateFreeView(view, [0.04, 0, -0.07])
  const lookClosed = rotateFreeView(moved, [-0.04, 0, 0.07])
  const beforeRollBasis = freeViewBasis(lookClosed)
  const rolled = rollFreeBody(lookClosed, 0.6)
  const rolledBasis = freeViewBasis(rolled)
  const closed = rollFreeBody(rolled, -0.6)
  const closedBasis = freeViewBasis(closed)

  close(dot(beforeRollBasis.forward, rolledBasis.forward), 1)
  close(dot(beforeRollBasis.up, rolledBasis.up), Math.cos(0.6))
  close(dot(firstBasis.forward, closedBasis.forward), 1)
  close(dot(firstBasis.right, closedBasis.right), 1)
  close(dot(firstBasis.up, closedBasis.up), 1)
  close(closed.yawRadians, view.yawRadians)
  close(closed.pitchRadians, view.pitchRadians)
})

test('自由摄像机：Body 偏转后 pitch 仍相对局部天顶限制', () => {
  const levelView: FreeView = {
    bodyOrientation: [0, 0, 0, 1],
    yawRadians: 0,
    pitchRadians: CAMERA_PITCH_LIMIT_RADIANS,
  }
  const view = rollFreeBody(levelView, Math.PI / 4)
  const blockedPitch = rotateFreeView(view, [0.02, 0, 0])
  const freeYaw = rotateFreeView(view, [0, 0, -0.02])

  close(blockedPitch.pitchRadians, view.pitchRadians)
  close(blockedPitch.yawRadians, view.yawRadians)
  close(freeYaw.pitchRadians, view.pitchRadians)
  close(freeYaw.yawRadians, 0.02)
  assert.deepEqual(freeYaw.bodyOrientation, view.bodyOrientation)
})

test('Orbit：turntable 在极点前停止，方位角仍连续', () => {
  let angles = orbitAnglesFromRadial(INITIAL_CAMERA_RADIAL)

  for (let index = 0; index < 720; index += 1) {
    angles = rotateOrbitAngles(angles, Math.PI / 180, Math.PI / 120)
  }

  const radial = orbitRadialFromAngles(angles)
  close(length(radial), 1, 1e-8)
  close(angles.elevationRadians, CAMERA_PITCH_LIMIT_RADIANS)
  assert.ok(isFiniteVector(radial))
})

test('自由摄像机：局部 forward 经四元数转换后在全局坐标中移动', () => {
  const camera = new PlanetCamera([0, 0, 7000], [0, 1, 0], [0, 0, 1], 60)
  const view = rollFreeBody(
    {
      bodyOrientation: [0, 0, 0, 1],
      yawRadians: 0.6,
      pitchRadians: 0.4,
    },
    Math.PI / 3,
  )
  const basis = freeViewBasis(view)
  camera.setPose(camera.position, basis.forward, basis.up)

  const positionBeforeMove = camera.position
  const globalForward = camera.forward
  camera.move(globalForward, EARTH_ATMOSPHERE.bottomRadiusKm, 0.01)

  close(camera.position[0] - positionBeforeMove[0], globalForward[0])
  close(camera.position[1] - positionBeforeMove[1], globalForward[1])
  close(camera.position[2] - positionBeforeMove[2], globalForward[2])
  close(length(camera.forward), 1)
  close(dot(camera.forward, camera.right), 0)
  close(dot(camera.forward, camera.up), 0)
})

test('自由摄像机：偏转时 WASD 跟随最终局部基，Q/E 旋转 Body', () => {
  const camera = new PlanetCamera([0, 0, 100_000], [0, 1, 0], [0, 0, 1], 60)
  const initialView = rollFreeBody(
    {
      bodyOrientation: [0, 0, 0, 1],
      yawRadians: 0,
      pitchRadians: 0,
    },
    Math.PI / 3,
  )
  const initialBasis = freeViewBasis(initialView)
  camera.setPose(camera.position, initialBasis.forward, initialBasis.up)
  const controller = new CameraController(
    {} as HTMLCanvasElement,
    camera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  const controls = controller as unknown as {
    pressedKeys: Set<string>
    updateFreeFlight(deltaSeconds: number): void
  }

  controls.pressedKeys.add('KeyD')
  const positionBeforeRight = camera.position
  controls.updateFreeFlight(1)
  const rightDisplacement = [
    camera.position[0] - positionBeforeRight[0],
    camera.position[1] - positionBeforeRight[1],
    camera.position[2] - positionBeforeRight[2],
  ] as const

  close(dot(normalize(rightDisplacement), camera.right), 1, 1e-9)

  const rollCamera = new PlanetCamera(
    [0, 0, 100_000],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const rollController = new CameraController(
    {} as HTMLCanvasElement,
    rollCamera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  const rollControls = rollController as unknown as {
    pressedKeys: Set<string>
    freeView: FreeView
    updateFreeFlight(deltaSeconds: number): void
  }
  const positionBeforeRoll = rollCamera.position
  const forwardBeforeRoll = rollCamera.forward
  const upBeforeRoll = rollCamera.up

  rollControls.pressedKeys.add('KeyE')
  rollControls.updateFreeFlight(1)

  assert.deepEqual(rollCamera.position, positionBeforeRoll)
  close(dot(rollCamera.forward, forwardBeforeRoll), 1, 1e-9)
  close(dot(rollCamera.up, upBeforeRoll), Math.cos(0.8), 1e-9)
  close(rollControls.freeView.yawRadians, 0)
  close(rollControls.freeView.pitchRadians, 0)
  assert.ok(isUnitQuaternion(rollControls.freeView.bodyOrientation))
})

test('调试 overlay 投影：使用全局点并正确剔除相机后方', () => {
  const camera = new PlanetCamera([0, 0, 10], [0, 1, 0], [0, 0, 1], 60)
  const center = projectWorldPointToNdc([0, 10, 10], camera, 16 / 9)
  const right = projectWorldPointToNdc([1, 10, 10], camera, 16 / 9)
  const behind = projectWorldPointToNdc([0, -10, 10], camera, 16 / 9)

  assert.ok(center)
  assert.ok(right)
  close(center.x, 0)
  close(center.y, 0)
  assert.ok(right.x > 0)
  assert.equal(behind, null)
})

test('天空经纬网格投影：只依赖世界方向，不受相机位置影响', () => {
  const firstCamera = new PlanetCamera([0, 0, 10], [0, 1, 0], [0, 0, 1], 60)
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
    projectWorldDirectionToNdc([0, -1, 0], firstCamera, 16 / 9),
    null,
  )
})

test('极端输入：非法射线和 FOV fail fast', () => {
  assert.throws(() => intersectRaySphere([0, 0, 0], [0, 0, 0], [0, 0, 0], 1))
  assert.throws(() => intersectRaySphere([0, 0, 0], [1, 0, 0], [0, 0, 0], 0))
  assert.throws(() =>
    cameraRayDirection([0, 1, 0], [1, 0, 0], [0, 0, 1], 0, 1, 0, 0),
  )
})
