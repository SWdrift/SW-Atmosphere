import type { Vec3 } from '../math/vector3.ts'

const PI = Math.PI

export interface AtmosphereLutDependencyKeys {
  atmosphere: string
  multipleScattering: string
  skyView: string
  aerialPerspective: string
}

export interface AtmosphereLutDirtyPasses {
  transmittance: boolean
  multipleScattering: boolean
  skyView: boolean
  aerialPerspective: boolean
}

export function resolveAtmosphereLutDirtyPasses(
  previous: AtmosphereLutDependencyKeys,
  next: AtmosphereLutDependencyKeys,
): AtmosphereLutDirtyPasses {
  const transmittance = previous.atmosphere !== next.atmosphere
  const multipleScattering =
    transmittance ||
    previous.multipleScattering !== next.multipleScattering

  return {
    transmittance,
    multipleScattering,
    skyView: multipleScattering || previous.skyView !== next.skyView,
    aerialPerspective:
      multipleScattering ||
      previous.aerialPerspective !== next.aerialPerspective,
  }
}

export function exponentialDensity(heightKm: number, scaleHeightKm: number): number {
  if (
    !Number.isFinite(heightKm) ||
    !Number.isFinite(scaleHeightKm) ||
    scaleHeightKm <= 0
  ) {
    throw new Error('密度高度和尺度高度必须是有限数，尺度高度必须为正。')
  }

  return Math.exp(-Math.max(heightKm, 0) / scaleHeightKm)
}

export function ozoneDensity(
  heightKm: number,
  centerHeightKm: number,
  halfWidthKm: number,
): number {
  if (
    !Number.isFinite(heightKm) ||
    !Number.isFinite(centerHeightKm) ||
    !Number.isFinite(halfWidthKm) ||
    centerHeightKm <= 0 ||
    halfWidthKm <= 0
  ) {
    throw new Error('臭氧剖面参数必须是有限正数。')
  }

  return Math.max(0, 1 - Math.abs(heightKm - centerHeightKm) / halfWidthKm)
}

export function rayleighPhase(cosine: number): number {
  if (!Number.isFinite(cosine) || cosine < -1 || cosine > 1) {
    throw new Error('Rayleigh 相函数余弦必须位于 -1 到 1。')
  }

  return (3 * (1 + cosine * cosine)) / (16 * PI)
}

export function cornetteShanksPhase(cosine: number, g: number): number {
  if (
    !Number.isFinite(cosine) ||
    cosine < -1 ||
    cosine > 1 ||
    !Number.isFinite(g) ||
    g <= -1 ||
    g >= 1
  ) {
    throw new Error('Cornette-Shanks 参数超出合法范围。')
  }

  const gSquared = g * g
  const denominator = Math.pow(1 + gSquared - 2 * g * cosine, 1.5)

  return (
    (3 / (8 * PI)) *
    ((1 - gSquared) / (2 + gSquared)) *
    ((1 + cosine * cosine) / denominator)
  )
}

export function beerLambert(extinctionPerKm: Vec3, distanceKm: number): Vec3 {
  if (
    extinctionPerKm.some((component) => !Number.isFinite(component) || component < 0) ||
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    throw new Error('Beer-Lambert 需要有限非负的消光系数和距离。')
  }

  return [
    Math.exp(-extinctionPerKm[0] * distanceKm),
    Math.exp(-extinctionPerKm[1] * distanceKm),
    Math.exp(-extinctionPerKm[2] * distanceKm),
  ]
}

export function solarDiskSolidAngle(angularRadiusRadians: number): number {
  if (
    !Number.isFinite(angularRadiusRadians) ||
    angularRadiusRadians <= 0 ||
    angularRadiusRadians >= Math.PI / 2
  ) {
    throw new Error('太阳角半径必须是小于 π/2 的有限正数。')
  }

  return 2 * Math.PI * (1 - Math.cos(angularRadiusRadians))
}

export function solarDiskPixelCoverage(
  angularDistanceRadians: number,
  angularRadiusRadians: number,
  pixelAngularWidthRadians: number,
): number {
  if (
    !Number.isFinite(angularDistanceRadians) ||
    !Number.isFinite(angularRadiusRadians) ||
    !Number.isFinite(pixelAngularWidthRadians) ||
    angularDistanceRadians < 0 ||
    angularRadiusRadians <= 0 ||
    pixelAngularWidthRadians <= 0
  ) {
    throw new Error('太阳圆盘覆盖率需要有限、非负的角距离和有限正角宽度。')
  }

  const inner = angularRadiusRadians - pixelAngularWidthRadians * 0.5
  const outer = angularRadiusRadians + pixelAngularWidthRadians * 0.5
  const t = Math.max(
    0,
    Math.min(1, (angularDistanceRadians - inner) / (outer - inner)),
  )

  return 1 - t * t * (3 - 2 * t)
}

export function solarDiskVisibleFraction(
  signedHorizonDistanceRadians: number,
  angularRadiusRadians: number,
): number {
  if (
    !Number.isFinite(signedHorizonDistanceRadians) ||
    !Number.isFinite(angularRadiusRadians) ||
    angularRadiusRadians <= 0 ||
    angularRadiusRadians >= Math.PI / 2
  ) {
    throw new Error('太阳圆盘可见率需要有限的地平线角距和合法角半径。')
  }

  if (signedHorizonDistanceRadians <= -angularRadiusRadians) {
    return 0
  }
  if (signedHorizonDistanceRadians >= angularRadiusRadians) {
    return 1
  }

  const normalizedDistance =
    signedHorizonDistanceRadians / angularRadiusRadians
  return (
    Math.acos(-normalizedDistance) +
    normalizedDistance * Math.sqrt(1 - normalizedDistance ** 2)
  ) / Math.PI
}

export function solarDiskIrradianceCosine(
  signedHorizonDistanceRadians: number,
  angularRadiusRadians: number,
): number {
  const visibleFraction = solarDiskVisibleFraction(
    signedHorizonDistanceRadians,
    angularRadiusRadians,
  )

  if (visibleFraction === 0) {
    return 0
  }
  if (visibleFraction === 1) {
    return Math.max(Math.sin(signedHorizonDistanceRadians), 0)
  }

  const normalizedDistance =
    signedHorizonDistanceRadians / angularRadiusRadians
  const segmentFirstMoment =
    (2 / 3) *
    angularRadiusRadians *
    Math.pow(1 - normalizedDistance ** 2, 1.5) /
    Math.PI

  return Math.max(
    signedHorizonDistanceRadians * visibleFraction + segmentFirstMoment,
    0,
  )
}

export function transmittanceUvFromRadiusCosine(
  bottomRadiusKm: number,
  topRadiusKm: number,
  radiusKm: number,
  cosine: number,
): readonly [u: number, v: number] {
  if (
    !Number.isFinite(bottomRadiusKm) ||
    !Number.isFinite(topRadiusKm) ||
    !Number.isFinite(radiusKm) ||
    !Number.isFinite(cosine) ||
    bottomRadiusKm <= 0 ||
    topRadiusKm <= bottomRadiusKm ||
    radiusKm < bottomRadiusKm ||
    radiusKm > topRadiusKm ||
    cosine < -1 ||
    cosine > 1
  ) {
    throw new Error('Transmittance 映射参数超出物理范围。')
  }

  const horizonDistance = Math.sqrt(
    topRadiusKm * topRadiusKm - bottomRadiusKm * bottomRadiusKm,
  )
  const distanceToHorizon = Math.sqrt(
    Math.max(radiusKm * radiusKm - bottomRadiusKm * bottomRadiusKm, 0),
  )
  const distance = Math.max(
    -radiusKm * cosine +
      Math.sqrt(
        Math.max(
          radiusKm * radiusKm * (cosine * cosine - 1) +
            topRadiusKm * topRadiusKm,
          0,
        ),
      ),
    0,
  )
  const distanceMin = topRadiusKm - radiusKm
  const distanceMax = distanceToHorizon + horizonDistance
  const u =
    distanceMax === distanceMin
      ? 0
      : (distance - distanceMin) / (distanceMax - distanceMin)

  return [Math.max(0, Math.min(1, u)), distanceToHorizon / horizonDistance]
}

export function transmittanceRadiusCosineFromUv(
  bottomRadiusKm: number,
  topRadiusKm: number,
  uv: readonly [u: number, v: number],
): readonly [radiusKm: number, cosine: number] {
  if (
    !Number.isFinite(bottomRadiusKm) ||
    !Number.isFinite(topRadiusKm) ||
    bottomRadiusKm <= 0 ||
    topRadiusKm <= bottomRadiusKm ||
    uv.some((component) => !Number.isFinite(component) || component < 0 || component > 1)
  ) {
    throw new Error('Transmittance UV 必须位于单位正方形。')
  }

  const horizonDistance = Math.sqrt(
    topRadiusKm * topRadiusKm - bottomRadiusKm * bottomRadiusKm,
  )
  const distanceToHorizon = horizonDistance * uv[1]
  const radiusKm = Math.sqrt(
    distanceToHorizon * distanceToHorizon + bottomRadiusKm * bottomRadiusKm,
  )
  const distanceMin = topRadiusKm - radiusKm
  const distanceMax = distanceToHorizon + horizonDistance
  const distance = distanceMin + uv[0] * (distanceMax - distanceMin)
  const cosine =
    distance === 0
      ? 1
      : (horizonDistance * horizonDistance -
          distanceToHorizon * distanceToHorizon -
          distance * distance) /
        (2 * radiusKm * distance)

  return [radiusKm, Math.max(-1, Math.min(1, cosine))]
}

export function multiScatteringUvFromRadiusSunCosine(
  bottomRadiusKm: number,
  topRadiusKm: number,
  radiusKm: number,
  sunCosine: number,
): readonly [u: number, v: number] {
  if (
    !Number.isFinite(bottomRadiusKm) ||
    !Number.isFinite(topRadiusKm) ||
    !Number.isFinite(radiusKm) ||
    !Number.isFinite(sunCosine) ||
    bottomRadiusKm <= 0 ||
    topRadiusKm <= bottomRadiusKm ||
    radiusKm < bottomRadiusKm ||
    radiusKm > topRadiusKm ||
    sunCosine < -1 ||
    sunCosine > 1
  ) {
    throw new Error('Multi-Scattering 映射参数超出物理范围。')
  }

  return [
    0.5 + 0.5 * sunCosine,
    (radiusKm - bottomRadiusKm) / (topRadiusKm - bottomRadiusKm),
  ]
}

export function multiScatteringRadiusSunCosineFromUv(
  bottomRadiusKm: number,
  topRadiusKm: number,
  uv: readonly [u: number, v: number],
): readonly [radiusKm: number, sunCosine: number] {
  if (
    !Number.isFinite(bottomRadiusKm) ||
    !Number.isFinite(topRadiusKm) ||
    bottomRadiusKm <= 0 ||
    topRadiusKm <= bottomRadiusKm ||
    uv.some((component) => !Number.isFinite(component) || component < 0 || component > 1)
  ) {
    throw new Error('Multi-Scattering UV 必须位于单位正方形。')
  }

  return [
    bottomRadiusKm + uv[1] * (topRadiusKm - bottomRadiusKm),
    uv[0] * 2 - 1,
  ]
}

export function skyViewParametersFromUv(
  bottomRadiusKm: number,
  viewRadiusKm: number,
  uv: readonly [u: number, v: number],
): readonly [viewZenithCosine: number, horizontalLightViewCosine: number] {
  if (
    !Number.isFinite(bottomRadiusKm) ||
    !Number.isFinite(viewRadiusKm) ||
    bottomRadiusKm <= 0 ||
    viewRadiusKm < bottomRadiusKm ||
    uv.some((component) => !Number.isFinite(component) || component < 0 || component > 1)
  ) {
    throw new Error('Sky-View 映射参数超出物理范围。')
  }

  const horizonDistance = Math.sqrt(
    Math.max(viewRadiusKm * viewRadiusKm - bottomRadiusKm * bottomRadiusKm, 0),
  )
  const beta = Math.acos(horizonDistance / viewRadiusKm)
  const zenithHorizonAngle = Math.PI - beta
  let viewZenithCosine: number

  if (uv[1] < 0.5) {
    let coordinate = 1 - 2 * uv[1]
    coordinate *= coordinate
    viewZenithCosine = Math.cos(zenithHorizonAngle * (1 - coordinate))
  } else {
    let coordinate = uv[1] * 2 - 1
    coordinate *= coordinate
    viewZenithCosine = Math.cos(zenithHorizonAngle + beta * coordinate)
  }

  return [viewZenithCosine, 1 - 2 * uv[0] * uv[0]]
}

export function skyViewUvFromParameters(
  bottomRadiusKm: number,
  viewRadiusKm: number,
  intersectsGround: boolean,
  viewZenithCosine: number,
  horizontalLightViewCosine: number,
): readonly [u: number, v: number] {
  if (
    !Number.isFinite(bottomRadiusKm) ||
    !Number.isFinite(viewRadiusKm) ||
    !Number.isFinite(viewZenithCosine) ||
    !Number.isFinite(horizontalLightViewCosine) ||
    bottomRadiusKm <= 0 ||
    viewRadiusKm < bottomRadiusKm ||
    viewZenithCosine < -1 ||
    viewZenithCosine > 1 ||
    horizontalLightViewCosine < -1 ||
    horizontalLightViewCosine > 1
  ) {
    throw new Error('Sky-View 反向映射参数超出物理范围。')
  }

  const horizonDistance = Math.sqrt(
    Math.max(viewRadiusKm * viewRadiusKm - bottomRadiusKm * bottomRadiusKm, 0),
  )
  const beta = Math.acos(horizonDistance / viewRadiusKm)
  const zenithHorizonAngle = Math.PI - beta
  let v: number

  if (intersectsGround) {
    const coordinate =
      (Math.acos(viewZenithCosine) - zenithHorizonAngle) / beta
    v = Math.sqrt(Math.max(coordinate, 0)) * 0.5 + 0.5
  } else {
    const coordinate =
      1 - Math.acos(viewZenithCosine) / zenithHorizonAngle
    v = (1 - Math.sqrt(Math.max(coordinate, 0))) * 0.5
  }

  return [
    Math.sqrt(Math.max(-horizontalLightViewCosine * 0.5 + 0.5, 0)),
    Math.max(0, Math.min(1, v)),
  ]
}

export function aerialPerspectiveDistanceFromSlice(
  boundaryDistanceKm: number,
  slice: number,
): number {
  if (
    !Number.isFinite(boundaryDistanceKm) ||
    !Number.isFinite(slice) ||
    boundaryDistanceKm < 0 ||
    slice < 0 ||
    slice > 1
  ) {
    throw new Error('Aerial Perspective 距离和切片必须位于有限非负范围。')
  }

  return boundaryDistanceKm * slice * slice
}

export function aerialPerspectiveSliceFromDistance(
  boundaryDistanceKm: number,
  distanceKm: number,
): number {
  if (
    !Number.isFinite(boundaryDistanceKm) ||
    !Number.isFinite(distanceKm) ||
    boundaryDistanceKm < 0 ||
    distanceKm < 0 ||
    distanceKm > boundaryDistanceKm
  ) {
    throw new Error('Aerial Perspective 距离必须位于射线边界内。')
  }

  return boundaryDistanceKm === 0
    ? 0
    : Math.sqrt(distanceKm / boundaryDistanceKm)
}
