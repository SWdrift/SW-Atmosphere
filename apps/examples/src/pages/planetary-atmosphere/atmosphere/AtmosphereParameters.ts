import type { Vec3 } from '../math/vector3.ts'

export interface StageOneAtmosphereParameters {
  planetRadiusKm: number
  atmosphereTopHeightKm: number
  atmosphereRadiusKm: number
  minimumCameraAltitudeKm: number
  initialCameraAltitudeKm: number
  surfaceAlbedoLinear: Vec3
  solarRadianceLinear: Vec3
  sunAngularRadiusRadians: number
}

const planetRadiusKm = 6360
const atmosphereTopHeightKm = 100

/**
 * 阶段一的唯一行星参数源。长度单位均为 km；颜色处于线性 HDR 空间。
 * 半径采用大气渲染文献中常见的近似地球值，太阳角半径为约 0.266°。
 */
export const EARTH_STAGE_ONE: Readonly<StageOneAtmosphereParameters> = Object.freeze({
  planetRadiusKm,
  atmosphereTopHeightKm,
  atmosphereRadiusKm: planetRadiusKm + atmosphereTopHeightKm,
  minimumCameraAltitudeKm: 0.01,
  initialCameraAltitudeKm: 1.5,
  surfaceAlbedoLinear: [0.08, 0.12, 0.06] as const,
  solarRadianceLinear: [20, 18.5, 16] as const,
  sunAngularRadiusRadians: (0.266 * Math.PI) / 180,
})
