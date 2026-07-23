import { isFiniteVector, type Vec3 } from '../math/vector3.ts'

export interface AtmosphereParameters {
  bottomRadiusKm: number
  topRadiusKm: number
  rayleighScatteringPerKm: Vec3
  rayleighScaleHeightKm: number
  mieScatteringPerKm: Vec3
  mieExtinctionPerKm: Vec3
  mieScaleHeightKm: number
  miePhaseG: number
  ozoneAbsorptionPerKm: Vec3
  ozoneLayerCenterHeightKm: number
  ozoneLayerHalfWidthKm: number
  groundAlbedoLinear: Vec3
  solarIrradianceWattsPerSquareMeterPerNm: Vec3
  sunAngularRadiusRadians: number
}

export const ATMOSPHERE_UNIFORM_FLOAT_COUNT = 28
export const ATMOSPHERE_UNIFORM_BYTE_SIZE =
  ATMOSPHERE_UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT

/**
 * 类地球物理参数的唯一来源。长度使用 km，散射和消光系数使用 km^-1。
 * RGB 系数采用 Hillaire 2020 配套实现中的类地球设置，臭氧为 10-40 km 三角剖面。
 */
export const EARTH_ATMOSPHERE: Readonly<AtmosphereParameters> = Object.freeze({
  bottomRadiusKm: 6360,
  topRadiusKm: 6460,
  rayleighScatteringPerKm: [0.005802, 0.013558, 0.0331],
  rayleighScaleHeightKm: 8,
  mieScatteringPerKm: [0.003996, 0.003996, 0.003996],
  mieExtinctionPerKm: [0.00444, 0.00444, 0.00444],
  mieScaleHeightKm: 1.2,
  miePhaseG: 0.8,
  ozoneAbsorptionPerKm: [0.00065, 0.001881, 0.000085],
  ozoneLayerCenterHeightKm: 25,
  ozoneLayerHalfWidthKm: 15,
  groundAlbedoLinear: [0.1, 0.1, 0.1],
  solarIrradianceWattsPerSquareMeterPerNm: [1.474, 1.8504, 1.91198],
  sunAngularRadiusRadians: 0.004675,
} satisfies AtmosphereParameters)

export function serializeAtmosphereParameters(
  parameters: AtmosphereParameters,
): Float32Array {
  if (
    !Number.isFinite(parameters.bottomRadiusKm) ||
    !Number.isFinite(parameters.topRadiusKm) ||
    parameters.bottomRadiusKm <= 0 ||
    parameters.topRadiusKm <= parameters.bottomRadiusKm
  ) {
    throw new Error('大气底部和顶部半径必须是递增的有限正数。')
  }

  if (
    !Number.isFinite(parameters.rayleighScaleHeightKm) ||
    !Number.isFinite(parameters.mieScaleHeightKm) ||
    parameters.rayleighScaleHeightKm <= 0 ||
    parameters.mieScaleHeightKm <= 0
  ) {
    throw new Error('Rayleigh 和 Mie 尺度高度必须是有限正数。')
  }

  if (
    !Number.isFinite(parameters.ozoneLayerCenterHeightKm) ||
    !Number.isFinite(parameters.ozoneLayerHalfWidthKm) ||
    parameters.ozoneLayerCenterHeightKm <= 0 ||
    parameters.ozoneLayerHalfWidthKm <= 0 ||
    parameters.ozoneLayerCenterHeightKm + parameters.ozoneLayerHalfWidthKm >
      parameters.topRadiusKm - parameters.bottomRadiusKm
  ) {
    throw new Error('臭氧层必须完整位于大气高度范围内。')
  }

  if (
    !Number.isFinite(parameters.miePhaseG) ||
    parameters.miePhaseG <= -1 ||
    parameters.miePhaseG >= 1
  ) {
    throw new Error('Mie 相函数 g 必须位于 -1 到 1 之间。')
  }

  if (
    !Number.isFinite(parameters.sunAngularRadiusRadians) ||
    parameters.sunAngularRadiusRadians <= 0 ||
    parameters.sunAngularRadiusRadians >= Math.PI / 2
  ) {
    throw new Error('太阳角半径必须是小于 π/2 的有限正数。')
  }

  const nonnegativeSpectra = [
    parameters.rayleighScatteringPerKm,
    parameters.mieScatteringPerKm,
    parameters.mieExtinctionPerKm,
    parameters.ozoneAbsorptionPerKm,
    parameters.solarIrradianceWattsPerSquareMeterPerNm,
  ]

  if (
    nonnegativeSpectra.some(
      (spectrum) =>
        !isFiniteVector(spectrum) || spectrum.some((component) => component < 0),
    )
  ) {
    throw new Error('大气光谱参数必须由有限非负分量组成。')
  }

  if (
    !isFiniteVector(parameters.groundAlbedoLinear) ||
    parameters.groundAlbedoLinear.some(
      (component) => component < 0 || component > 1,
    )
  ) {
    throw new Error('地表反照率必须由 0 到 1 的有限分量组成。')
  }

  if (
    parameters.mieScatteringPerKm.some(
      (component, index) => component > parameters.mieExtinctionPerKm[index],
    )
  ) {
    throw new Error('Mie scattering 不能大于对应的 extinction。')
  }

  return new Float32Array([
    parameters.bottomRadiusKm,
    parameters.topRadiusKm,
    parameters.sunAngularRadiusRadians,
    0,
    ...parameters.rayleighScatteringPerKm,
    parameters.rayleighScaleHeightKm,
    ...parameters.mieScatteringPerKm,
    parameters.mieScaleHeightKm,
    ...parameters.mieExtinctionPerKm,
    parameters.miePhaseG,
    ...parameters.ozoneAbsorptionPerKm,
    parameters.ozoneLayerCenterHeightKm,
    ...parameters.groundAlbedoLinear,
    parameters.ozoneLayerHalfWidthKm,
    ...parameters.solarIrradianceWattsPerSquareMeterPerNm,
    0,
  ])
}
