import { localUpFromPosition } from '../math/coordinates.ts'
import {
  isUnitQuaternion,
  quaternionFromBasis,
  rotateVectorByQuaternion,
  type Quaternion,
} from '../math/quaternion.ts'
import {
  add,
  cross,
  dot,
  isFiniteVector,
  length,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from '../math/vector3.ts'

export class PlanetCamera {
  position: Vec3
  verticalFovDegrees: number
  private orientation: Quaternion = [0, 0, 0, 1]

  constructor(
    position: Vec3,
    forward: Vec3,
    upHint: Vec3,
    verticalFovDegrees: number,
  ) {
    this.position = position
    this.verticalFovDegrees = verticalFovDegrees
    this.setOrientation(forward, upHint)
    this.setVerticalFov(verticalFovDegrees)
  }

  get localUp(): Vec3 {
    return localUpFromPosition(this.position)
  }

  get forward(): Vec3 {
    return normalize(rotateVectorByQuaternion([0, 1, 0], this.orientation))
  }

  get right(): Vec3 {
    return normalize(rotateVectorByQuaternion([1, 0, 0], this.orientation))
  }

  get up(): Vec3 {
    return normalize(rotateVectorByQuaternion([0, 0, 1], this.orientation))
  }

  setPose(position: Vec3, forward: Vec3, upHint: Vec3): void {
    this.position = position
    this.setOrientation(forward, upHint)
    this.assertFinite()
  }

  setVerticalFov(degrees: number): void {
    if (!Number.isFinite(degrees) || degrees < 5 || degrees > 100) {
      throw new Error('垂直 FOV 必须位于 5° 到 100°。')
    }

    this.verticalFovDegrees = degrees
  }

  move(displacementKm: Vec3, planetRadiusKm: number, minimumAltitudeKm: number): void {
    const minimumRadius = planetRadiusKm + minimumAltitudeKm
    const displacementLengthSquared = dot(displacementKm, displacementKm)

    if (
      !Number.isFinite(minimumRadius) ||
      minimumRadius <= 0 ||
      !Number.isFinite(displacementLengthSquared)
    ) {
      throw new Error('摄像机移动产生了无效位置。')
    }

    if (displacementLengthSquared <= 1e-24) {
      return
    }

    let nextPosition = add(this.position, displacementKm)
    const startDotDisplacement = dot(this.position, displacementKm)
    const radiusDifference =
      dot(this.position, this.position) - minimumRadius * minimumRadius
    const discriminant =
      startDotDisplacement * startDotDisplacement -
      displacementLengthSquared * radiusDifference

    // 对移动线段做球面 sweep；命中后保留剩余切向位移，避免高速穿地或径向拉回。
    if (startDotDisplacement < 0 && discriminant >= 0) {
      const contactAmount =
        (-startDotDisplacement - Math.sqrt(discriminant)) /
        displacementLengthSquared

      if (contactAmount >= 0 && contactAmount <= 1) {
        const contactPosition = add(
          this.position,
          scale(displacementKm, contactAmount),
        )
        const contactNormal = normalize(contactPosition)
        const remainingDisplacement = scale(
          displacementKm,
          1 - contactAmount,
        )

        nextPosition = add(
          contactPosition,
          projectOntoPlane(remainingDisplacement, contactNormal),
        )

        const nextRadius = length(nextPosition)
        if (nextRadius < minimumRadius) {
          nextPosition = scale(nextPosition, minimumRadius / nextRadius)
        }
      }
    }

    if (!isFiniteVector(nextPosition) || length(nextPosition) <= 1e-12) {
      throw new Error('摄像机移动产生了无效位置。')
    }

    this.position = nextPosition
    this.assertFinite()
  }

  private setOrientation(forward: Vec3, upHint: Vec3): void {
    const normalizedForward = normalize(forward)
    const projectedUp = projectOntoPlane(upHint, normalizedForward)

    if (length(projectedUp) <= 1e-12) {
      throw new Error('摄像机 up 不能与 forward 共线。')
    }

    const normalizedUp = normalize(projectedUp)
    const right = normalize(cross(normalizedForward, normalizedUp))

    this.orientation = quaternionFromBasis(right, normalizedForward, normalizedUp)
    this.assertFinite()
  }

  private assertFinite(): void {
    if (
      !isFiniteVector(this.position) ||
      !isFiniteVector(this.forward) ||
      !isFiniteVector(this.up) ||
      !isUnitQuaternion(this.orientation)
    ) {
      throw new Error('摄像机状态包含 NaN 或 Infinity。')
    }
  }
}
