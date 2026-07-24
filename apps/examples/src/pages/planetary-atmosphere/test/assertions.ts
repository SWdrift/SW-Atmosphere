import { assert } from 'vitest'

export function close(
  actual: number,
  expected: number,
  epsilon = 1e-9,
): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `期望 ${actual} 与 ${expected} 的差不超过 ${epsilon}`,
  )
}
