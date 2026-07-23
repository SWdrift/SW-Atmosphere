import { dot, subtract, type Vec3 } from './vector3.ts'

export interface RayInterval {
  near: number
  far: number
}

/**
 * 返回沿射线参数 t 的有序交点。方向不要求预先归一化，t 的单位由方向长度决定。
 * 使用 half-b 形式减少无意义的乘二操作，并把接近零的负判别式视为相切。
 */
export function intersectRaySphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
): RayInterval | null {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('球半径必须是有限正数。')
  }

  const offset = subtract(origin, center)
  const a = dot(direction, direction)

  if (!Number.isFinite(a) || a <= 1e-24) {
    throw new Error('射线方向必须是有限非零向量。')
  }

  const halfB = dot(offset, direction)
  const c = dot(offset, offset) - radius * radius
  const discriminant = halfB * halfB - a * c
  const tolerance = 1e-12 * Math.max(1, Math.abs(halfB * halfB), Math.abs(a * c))

  if (discriminant < -tolerance) {
    return null
  }

  const root = Math.sqrt(Math.max(discriminant, 0))
  const near = (-halfB - root) / a
  const far = (-halfB + root) / a

  return near <= far ? { near, far } : { near: far, far: near }
}
