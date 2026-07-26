import {
  dot,
  length,
  normalize,
  subtract,
  type Vec3,
} from '../math/vector3.ts'
import type { SystemCameraFrame } from './CelestialReferenceFrames.ts'
import {
  type CelestialSnapshot,
} from './CelestialSystem.ts'

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export interface CelestialRenderFrame {
  earthCenterFromCameraKm: Vec3
  sunCenterFromCameraKm: Vec3
  sunRadiusKm: number
  moonCenterFromCameraKm: Vec3
  moonRadiusKm: number
  solarIrradianceScale: number
  earthSolarVisibleFraction: number
  earthEclipsePossible: boolean
}

export interface EclipseDiagnostics {
  sunDistanceKm: number
  moonDistanceKm: number
  sunAngularRadiusRadians: number
  moonAngularRadiusRadians: number
  separationRadians: number
  solarVisibleFraction: number
}

export function buildCelestialRenderFrame(
  snapshot: CelestialSnapshot,
  camera: SystemCameraFrame,
): CelestialRenderFrame {
  const earthCenterFromCameraKm = subtract(
    snapshot.earth.systemPositionKm,
    camera.positionKm,
  )
  const sunCenterFromCameraKm = subtract(
    snapshot.sun.systemPositionKm,
    camera.positionKm,
  )
  const moonCenterFromCameraKm = subtract(
    snapshot.moon.systemPositionKm,
    camera.positionKm,
  )
  const earthEclipse = eclipseDiagnosticsAtPoint(
    snapshot,
    snapshot.earth.systemPositionKm,
  )

  return {
    earthCenterFromCameraKm,
    sunCenterFromCameraKm,
    sunRadiusKm: snapshot.sun.radiusKm,
    moonCenterFromCameraKm,
    moonRadiusKm: snapshot.moon.radiusKm,
    solarIrradianceScale: snapshot.solarIrradianceScale,
    earthSolarVisibleFraction: earthEclipse.solarVisibleFraction,
    earthEclipsePossible:
      earthEclipse.moonDistanceKm < earthEclipse.sunDistanceKm &&
      earthEclipse.separationRadians <
        earthEclipse.sunAngularRadiusRadians +
          earthEclipse.moonAngularRadiusRadians +
          Math.asin(snapshot.earth.radiusKm / earthEclipse.moonDistanceKm),
  }
}

export function eclipseDiagnosticsAtPoint(
  snapshot: CelestialSnapshot,
  systemPositionKm: Vec3,
): EclipseDiagnostics {
  const toSun = subtract(snapshot.sun.systemPositionKm, systemPositionKm)
  const toMoon = subtract(snapshot.moon.systemPositionKm, systemPositionKm)
  const sunDistanceKm = length(toSun)
  const moonDistanceKm = length(toMoon)

  if (
    sunDistanceKm <= snapshot.sun.radiusKm ||
    moonDistanceKm <= snapshot.moon.radiusKm
  ) {
    throw new Error('食相诊断点不能位于太阳或月球内部。')
  }

  const sunAngularRadiusRadians = Math.asin(
    snapshot.sun.radiusKm / sunDistanceKm,
  )
  const moonAngularRadiusRadians = Math.asin(
    snapshot.moon.radiusKm / moonDistanceKm,
  )
  const separationRadians = Math.acos(clamp(
    dot(normalize(toSun), normalize(toMoon)),
    -1,
    1,
  ))
  const occludedFraction =
    moonDistanceKm < sunDistanceKm
      ? circleOccludedFraction(
          sunAngularRadiusRadians,
          moonAngularRadiusRadians,
          separationRadians,
        )
      : 0

  return {
    sunDistanceKm,
    moonDistanceKm,
    sunAngularRadiusRadians,
    moonAngularRadiusRadians,
    separationRadians,
    solarVisibleFraction: 1 - occludedFraction,
  }
}

export function circleOccludedFraction(
  sourceRadius: number,
  occultorRadius: number,
  separation: number,
): number {
  if (
    !Number.isFinite(sourceRadius) ||
    sourceRadius <= 0 ||
    !Number.isFinite(occultorRadius) ||
    occultorRadius <= 0 ||
    !Number.isFinite(separation) ||
    separation < 0
  ) {
    throw new Error('圆盘遮挡要求有限正半径和有限非负圆心距。')
  }

  if (separation >= sourceRadius + occultorRadius) {
    return 0
  }
  if (separation <= Math.abs(sourceRadius - occultorRadius)) {
    const overlapRadius = Math.min(sourceRadius, occultorRadius)
    return Math.min(
      1,
      (overlapRadius * overlapRadius) / (sourceRadius * sourceRadius),
    )
  }

  const sourceTerm = Math.acos(clamp(
    (
      separation * separation +
      sourceRadius * sourceRadius -
      occultorRadius * occultorRadius
    ) /
      (2 * separation * sourceRadius),
    -1,
    1,
  ))
  const occultorTerm = Math.acos(clamp(
    (
      separation * separation +
      occultorRadius * occultorRadius -
      sourceRadius * sourceRadius
    ) /
      (2 * separation * occultorRadius),
    -1,
    1,
  ))
  const lensTriangle = 0.5 * Math.sqrt(Math.max(
    0,
    (
      -separation + sourceRadius + occultorRadius
    ) *
      (
        separation + sourceRadius - occultorRadius
      ) *
      (
        separation - sourceRadius + occultorRadius
      ) *
      (
        separation + sourceRadius + occultorRadius
      ),
  ))
  const overlapArea =
    sourceRadius * sourceRadius * sourceTerm +
    occultorRadius * occultorRadius * occultorTerm -
    lensTriangle

  return clamp(
    overlapArea / (Math.PI * sourceRadius * sourceRadius),
    0,
    1,
  )
}
