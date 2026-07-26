import type { Vec3 } from '../math/vector3.ts'

export interface AtmosphereCameraFrame {
  position: Vec3
  right: Vec3
  up: Vec3
  forward: Vec3
  verticalFovDegrees: number
}
