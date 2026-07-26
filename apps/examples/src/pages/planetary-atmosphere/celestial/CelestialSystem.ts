import {
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  quaternionFromBasis,
  rotateVectorByQuaternion,
  type Quaternion,
} from '../math/quaternion.ts'
import {
  add,
  cross,
  isFiniteVector,
  normalize,
  projectOntoPlane,
  type Vec3,
} from '../math/vector3.ts'

export type CelestialBodyId = 'sun' | 'earth' | 'moon'
export type CameraReferenceFrame = 'inertial' | 'body-fixed'

export interface OrbitDefinition {
  semiMajorAxisKm: number
  eccentricity: number
  inclinationDegrees: number
  ascendingNodeDegrees: number
  periapsisArgumentDegrees: number
  meanAnomalyAtEpochDegrees: number
  periodSeconds: number
}

export interface RotationDefinition {
  poleDirection: Vec3
  periodSeconds: number
  phaseAtEpochDegrees: number
}

export interface CelestialScenario {
  epochSeconds: number
  bodyRadiiKm: Record<CelestialBodyId, number>
  solarIrradianceReferenceDistanceKm: number
  earthOrbit: OrbitDefinition
  moonOrbit: OrbitDefinition
  earthRotation: RotationDefinition
  moonRotation: RotationDefinition
}

export interface CelestialBodySnapshot {
  id: CelestialBodyId
  parentId: CelestialBodyId | null
  radiusKm: number
  systemPositionKm: Vec3
  systemRotation: Quaternion
}

export interface CelestialSnapshot {
  simulationTimeSeconds: number
  solarIrradianceScale: number
  sun: CelestialBodySnapshot
  earth: CelestialBodySnapshot
  moon: CelestialBodySnapshot
}

export const SUN_RADIUS_KM = 696_340
export const EARTH_ORBIT_REFERENCE_DISTANCE_KM = 149_597_870.7
export const EARTH_RADIUS_KM = 6_360
export const MOON_RADIUS_KM = 1_737.5

const DAY_SECONDS = 86_400

export function createDefaultCelestialScenario(): CelestialScenario {
  const earthPhaseDegrees = 160
  const earthEccentricity = 0.0167
  const earthMeanAnomalyRadians = degreesToRadians(earthPhaseDegrees)
  const earthEccentricAnomaly = solveEccentricAnomaly(
    earthMeanAnomalyRadians,
    earthEccentricity,
  )
  const earthTrueAnomalyDegrees = Math.atan2(
    Math.sqrt(1 - earthEccentricity * earthEccentricity) *
      Math.sin(earthEccentricAnomaly),
    Math.cos(earthEccentricAnomaly) - earthEccentricity,
  ) * 180 / Math.PI
  const sunDirectionDegrees = earthTrueAnomalyDegrees - 180
  const axialTiltRadians = (23.4393 * Math.PI) / 180
  const poleAzimuthRadians = (sunDirectionDegrees + 180) * Math.PI / 180

  return {
    epochSeconds: 0,
    bodyRadiiKm: {
      sun: SUN_RADIUS_KM,
      earth: EARTH_RADIUS_KM,
      moon: MOON_RADIUS_KM,
    },
    solarIrradianceReferenceDistanceKm:
      EARTH_ORBIT_REFERENCE_DISTANCE_KM,
    earthOrbit: {
      semiMajorAxisKm: EARTH_ORBIT_REFERENCE_DISTANCE_KM,
      eccentricity: earthEccentricity,
      inclinationDegrees: 0,
      ascendingNodeDegrees: 0,
      periapsisArgumentDegrees: 0,
      meanAnomalyAtEpochDegrees: earthPhaseDegrees,
      periodSeconds: 365.256_363_004 * DAY_SECONDS,
    },
    moonOrbit: {
      semiMajorAxisKm: 384_400,
      eccentricity: 0.0549,
      inclinationDegrees: 5.145,
      ascendingNodeDegrees: sunDirectionDegrees,
      periapsisArgumentDegrees: 0,
      meanAnomalyAtEpochDegrees: 0,
      periodSeconds: 27.321_661 * DAY_SECONDS,
    },
    earthRotation: {
      poleDirection: [
        Math.sin(axialTiltRadians) * Math.cos(poleAzimuthRadians),
        Math.sin(axialTiltRadians) * Math.sin(poleAzimuthRadians),
        Math.cos(axialTiltRadians),
      ],
      periodSeconds: 86_164.0905,
      phaseAtEpochDegrees: 0,
    },
    moonRotation: {
      poleDirection: [0, 0, 1],
      periodSeconds: 27.321_661 * DAY_SECONDS,
      phaseAtEpochDegrees: 0,
    },
  }
}

export function cloneCelestialScenario(
  scenario: CelestialScenario,
): CelestialScenario {
  return {
    epochSeconds: scenario.epochSeconds,
    bodyRadiiKm: { ...scenario.bodyRadiiKm },
    solarIrradianceReferenceDistanceKm:
      scenario.solarIrradianceReferenceDistanceKm,
    earthOrbit: { ...scenario.earthOrbit },
    moonOrbit: { ...scenario.moonOrbit },
    earthRotation: {
      ...scenario.earthRotation,
      poleDirection: [...scenario.earthRotation.poleDirection],
    },
    moonRotation: {
      ...scenario.moonRotation,
      poleDirection: [...scenario.moonRotation.poleDirection],
    },
  }
}

export function evaluateCelestialScenario(
  scenario: CelestialScenario,
  simulationTimeSeconds: number,
): CelestialSnapshot {
  validateScenario(scenario)

  if (!Number.isFinite(simulationTimeSeconds)) {
    throw new Error('天体模拟时间必须是有限数。')
  }

  const elapsedSeconds = simulationTimeSeconds - scenario.epochSeconds
  const sun = bodySnapshot(
    'sun',
    null,
    scenario.bodyRadiiKm.sun,
    [0, 0, 0],
    [0, 0, 0, 1],
  )
  const earthPosition = evaluateOrbit(scenario.earthOrbit, elapsedSeconds)
  const earth = bodySnapshot(
    'earth',
    'sun',
    scenario.bodyRadiiKm.earth,
    earthPosition,
    evaluateRotation(scenario.earthRotation, elapsedSeconds),
  )
  const moon = bodySnapshot(
    'moon',
    'earth',
    scenario.bodyRadiiKm.moon,
    add(
      earthPosition,
      evaluateOrbit(scenario.moonOrbit, elapsedSeconds),
    ),
    evaluateRotation(scenario.moonRotation, elapsedSeconds),
  )

  const earthSunDistanceKm = Math.hypot(...earthPosition)

  return {
    simulationTimeSeconds,
    solarIrradianceScale:
      (
        scenario.solarIrradianceReferenceDistanceKm /
        earthSunDistanceKm
      ) ** 2,
    sun,
    earth,
    moon,
  }
}

export function evaluateOrbit(
  orbit: OrbitDefinition,
  elapsedSeconds: number,
): Vec3 {
  validateOrbit(orbit)

  if (!Number.isFinite(elapsedSeconds)) {
    throw new Error('轨道求值时间必须是有限数。')
  }

  const meanAnomaly =
    degreesToRadians(orbit.meanAnomalyAtEpochDegrees) +
    (2 * Math.PI * elapsedSeconds) / orbit.periodSeconds
  const eccentricAnomaly = solveEccentricAnomaly(
    normalizeRadians(meanAnomaly),
    orbit.eccentricity,
  )
  const x =
    orbit.semiMajorAxisKm *
    (Math.cos(eccentricAnomaly) - orbit.eccentricity)
  const y =
    orbit.semiMajorAxisKm *
    Math.sqrt(1 - orbit.eccentricity * orbit.eccentricity) *
    Math.sin(eccentricAnomaly)
  const periapsisRotation = quaternionFromAxisAngle(
    [0, 0, 1],
    degreesToRadians(orbit.periapsisArgumentDegrees),
  )
  const inclinationRotation = quaternionFromAxisAngle(
    [1, 0, 0],
    degreesToRadians(orbit.inclinationDegrees),
  )
  const nodeRotation = quaternionFromAxisAngle(
    [0, 0, 1],
    degreesToRadians(orbit.ascendingNodeDegrees),
  )
  const orientation = normalizeQuaternion(
    multiplyQuaternions(
      nodeRotation,
      multiplyQuaternions(inclinationRotation, periapsisRotation),
    ),
  )

  return rotateVectorByQuaternion([x, y, 0], orientation)
}

export function circularOrbitAtDirection(
  orbit: OrbitDefinition,
  direction: Vec3,
): OrbitDefinition {
  validateOrbit(orbit)

  if (!isFiniteVector(direction)) {
    throw new Error('圆轨道目标方向必须是有限非零向量。')
  }

  const unitDirection = normalize(direction)
  const azimuthDegrees =
    Math.atan2(unitDirection[1], unitDirection[0]) * 180 / Math.PI
  const latitudeDegrees =
    Math.asin(unitDirection[2]) * 180 / Math.PI

  if (Math.abs(latitudeDegrees) < 1e-12) {
    return {
      ...orbit,
      eccentricity: 0,
      inclinationDegrees: 0,
      ascendingNodeDegrees: azimuthDegrees,
      periapsisArgumentDegrees: 0,
      meanAnomalyAtEpochDegrees: 0,
    }
  }

  const northern = latitudeDegrees > 0
  return {
    ...orbit,
    eccentricity: 0,
    inclinationDegrees: Math.abs(latitudeDegrees),
    ascendingNodeDegrees:
      azimuthDegrees + (northern ? -90 : 90),
    periapsisArgumentDegrees: 0,
    meanAnomalyAtEpochDegrees: northern ? 90 : -90,
  }
}

export function evaluateRotation(
  rotation: RotationDefinition,
  elapsedSeconds: number,
): Quaternion {
  validateRotation(rotation)

  if (!Number.isFinite(elapsedSeconds)) {
    throw new Error('自转求值时间必须是有限数。')
  }

  const pole = normalize(rotation.poleDirection)
  const referenceDirection = normalize(
    projectOntoPlane(
      Math.abs(pole[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0],
      pole,
    ),
  )
  const baseForward = normalize(cross(pole, referenceDirection))
  const base = quaternionFromBasis(referenceDirection, baseForward, pole)
  const phase =
    degreesToRadians(rotation.phaseAtEpochDegrees) +
    (2 * Math.PI * elapsedSeconds) / rotation.periodSeconds

  return normalizeQuaternion(
    multiplyQuaternions(
      quaternionFromAxisAngle(pole, phase),
      base,
    ),
  )
}

export function bodyFromSnapshot(
  snapshot: CelestialSnapshot,
  id: CelestialBodyId,
): CelestialBodySnapshot {
  return snapshot[id]
}

function validateScenario(scenario: CelestialScenario): void {
  if (!Number.isFinite(scenario.epochSeconds)) {
    throw new Error('天体场景历元必须是有限数。')
  }
  for (const id of ['sun', 'earth', 'moon'] as const) {
    const radiusKm = scenario.bodyRadiiKm[id]
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new Error(`${id} 半径必须是有限正数。`)
    }
  }
  if (
    !Number.isFinite(scenario.solarIrradianceReferenceDistanceKm) ||
    scenario.solarIrradianceReferenceDistanceKm <= 0
  ) {
    throw new Error('太阳辐照度参考距离必须是有限正数。')
  }

  validateOrbit(scenario.earthOrbit)
  validateOrbit(scenario.moonOrbit)
  validateRotation(scenario.earthRotation)
  validateRotation(scenario.moonRotation)
}

function validateOrbit(orbit: OrbitDefinition): void {
  if (
    !Number.isFinite(orbit.semiMajorAxisKm) ||
    orbit.semiMajorAxisKm <= 0 ||
    !Number.isFinite(orbit.eccentricity) ||
    orbit.eccentricity < 0 ||
    orbit.eccentricity >= 1 ||
    !Number.isFinite(orbit.inclinationDegrees) ||
    orbit.inclinationDegrees < 0 ||
    orbit.inclinationDegrees > 180 ||
    !Number.isFinite(orbit.ascendingNodeDegrees) ||
    !Number.isFinite(orbit.periapsisArgumentDegrees) ||
    !Number.isFinite(orbit.meanAnomalyAtEpochDegrees) ||
    !Number.isFinite(orbit.periodSeconds) ||
    orbit.periodSeconds <= 0
  ) {
    throw new Error('近似轨道参数必须有限，并满足正半长轴、0≤偏心率<1 和正周期。')
  }
}

function validateRotation(rotation: RotationDefinition): void {
  if (
    !isFiniteVector(rotation.poleDirection) ||
    !Number.isFinite(rotation.periodSeconds) ||
    rotation.periodSeconds <= 0 ||
    !Number.isFinite(rotation.phaseAtEpochDegrees)
  ) {
    throw new Error('天体自转必须使用有限极轴、正周期和有限历元相位。')
  }

  normalize(rotation.poleDirection)
}

function solveEccentricAnomaly(
  meanAnomaly: number,
  eccentricity: number,
): number {
  let eccentricAnomaly =
    eccentricity < 0.8 ? meanAnomaly : Math.PI

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const residual =
      eccentricAnomaly -
      eccentricity * Math.sin(eccentricAnomaly) -
      meanAnomaly
    const derivative =
      1 - eccentricity * Math.cos(eccentricAnomaly)
    const correction = residual / derivative
    eccentricAnomaly -= correction

    if (Math.abs(correction) <= 1e-13) {
      return eccentricAnomaly
    }
  }

  throw new Error('Kepler 方程未在迭代上限内收敛。')
}

function normalizeRadians(radians: number): number {
  return ((radians + Math.PI) % (2 * Math.PI) + 2 * Math.PI) %
    (2 * Math.PI) -
    Math.PI
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function bodySnapshot(
  id: CelestialBodyId,
  parentId: CelestialBodyId | null,
  radiusKm: number,
  systemPositionKm: Vec3,
  systemRotation: Quaternion,
): CelestialBodySnapshot {
  return {
    id,
    parentId,
    radiusKm,
    systemPositionKm,
    systemRotation,
  }
}
