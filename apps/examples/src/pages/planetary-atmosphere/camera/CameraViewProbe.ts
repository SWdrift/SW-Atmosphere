import type { Quaternion } from '../math/quaternion.ts'
import { dot, type Vec3 } from '../math/vector3.ts'
import type { CameraMode } from './CameraController.ts'
import type { FreeView } from './freeViewCoordinates.ts'
import type { OrbitAngles } from './orbitCoordinates.ts'
import type { PlanetCamera } from './PlanetCamera.ts'

interface ViewProbeSnapshot {
  position: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
  freeBodyOrientation: Quaternion
  freeLookYawRadians: number
  freeLookPitchRadians: number
  orbitAngles: OrbitAngles
}

export interface ViewProbeInput {
  source:
    | 'free-mouse'
    | 'free-keyboard'
    | 'orbit-pointer'
    | 'orbit-keyboard'
    | 'mode'
    | 'preset'
  movementX: number
  movementY: number
  timestamp: number
}

export interface CameraViewProbeFrame {
  camera: PlanetCamera
  freeView: FreeView
  orbitAngles: OrbitAngles
  mode: CameraMode
  deltaSeconds: number
  pointerLocked: boolean
}

export class CameraViewProbe {
  private snapshot: ViewProbeSnapshot | null = null
  private inputBudgetRadians = 0
  private lastInput: ViewProbeInput | null = null

  resetInput(input: ViewProbeInput): void {
    this.inputBudgetRadians = 0
    this.lastInput = input
  }

  recordInput(input: ViewProbeInput, budgetRadians: number): void {
    if (!Number.isFinite(budgetRadians) || budgetRadians < 0) {
      throw new Error('视角探针输入预算必须是有限非负数。')
    }

    this.inputBudgetRadians += budgetRadians
    this.lastInput = input
  }

  sample(frame: CameraViewProbeFrame): void {
    const snapshot: ViewProbeSnapshot = {
      position: [...frame.camera.position],
      forward: frame.camera.forward,
      right: frame.camera.right,
      up: frame.camera.up,
      freeBodyOrientation: frame.freeView.bodyOrientation,
      freeLookYawRadians: frame.freeView.yawRadians,
      freeLookPitchRadians: frame.freeView.pitchRadians,
      orbitAngles: { ...frame.orbitAngles },
    }
    const previous = this.snapshot

    if (previous) {
      const angleDegrees = {
        forward: this.vectorAngleDegrees(
          previous.forward,
          snapshot.forward,
        ),
        right: this.vectorAngleDegrees(previous.right, snapshot.right),
        up: this.vectorAngleDegrees(previous.up, snapshot.up),
      }
      const maximumAngleDegrees = Math.max(
        angleDegrees.forward,
        angleDegrees.right,
        angleDegrees.up,
      )
      const inputBudgetDegrees =
        (this.inputBudgetRadians * 180) / Math.PI
      const reasons: string[] = []

      if (maximumAngleDegrees >= 8) {
        reasons.push('单帧视角变化超过 8°')
      }

      if (
        maximumAngleDegrees >= 0.5 &&
        maximumAngleDegrees > inputBudgetDegrees + 0.25
      ) {
        reasons.push('视角变化超过本帧输入角度预算')
      }

      if (reasons.length > 0) {
        console.warn('[CameraViewJumpProbe]', {
          reasons,
          mode: frame.mode,
          deltaSeconds: frame.deltaSeconds,
          pointerLocked: frame.pointerLocked,
          maximumAngleDegrees,
          angleDegrees,
          inputBudgetDegrees,
          lastInput: this.lastInput,
          before: previous,
          after: snapshot,
        })
      }
    }

    this.snapshot = snapshot
    this.inputBudgetRadians = 0
  }

  private vectorAngleDegrees(a: Vec3, b: Vec3): number {
    const cosine = Math.max(-1, Math.min(1, dot(a, b)))
    return (Math.acos(cosine) * 180) / Math.PI
  }
}
