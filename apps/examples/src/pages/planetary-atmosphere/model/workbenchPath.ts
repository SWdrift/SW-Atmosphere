import type { CameraPresetPose } from '../camera/cameraPresets.ts'
import { lerp, normalize } from '../math/vector3.ts'
import {
  cloneAtmosphereControls,
  type AtmosphereControls,
} from './atmosphereState.ts'

export type WorkbenchPathStep =
  | {
      type: 'set-controls'
      controls: AtmosphereControls
    }
  | {
      type: 'set-camera-pose'
      pose: CameraPresetPose
    }
  | {
      type: 'move-camera'
      from: CameraPresetPose
      to: CameraPresetPose
      durationMilliseconds: number
    }
  | {
      type: 'wait'
      durationMilliseconds: number
    }
  | {
      type: 'checkpoint'
      id: string
    }

export interface WorkbenchPath {
  id: string
  label: string
  steps: readonly WorkbenchPathStep[]
}

export interface WorkbenchPathPort {
  setControls(controls: AtmosphereControls): void
  setCameraPose(pose: CameraPresetPose): void
  setManualInputEnabled(enabled: boolean): void
  checkpoint(id: string): void
}

export interface WorkbenchPathClock {
  elapse(
    durationMilliseconds: number,
    update: (progress: number) => void,
    signal: AbortSignal,
  ): Promise<void>
}

export const browserWorkbenchPathClock: WorkbenchPathClock = {
  elapse(durationMilliseconds, update, signal) {
    if (
      !Number.isFinite(durationMilliseconds) ||
      durationMilliseconds < 0
    ) {
      throw new Error('动作路径持续时间必须是有限非负数。')
    }

    if (durationMilliseconds === 0) {
      signal.throwIfAborted()
      update(1)
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const startedAt = performance.now()
      let animationFrameId = 0

      const abort = (): void => {
        cancelAnimationFrame(animationFrameId)
        reject(signal.reason)
      }
      const tick = (now: number): void => {
        if (signal.aborted) {
          abort()
          return
        }

        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / durationMilliseconds),
        )
        update(progress)

        if (progress === 1) {
          signal.removeEventListener('abort', abort)
          resolve()
          return
        }

        animationFrameId = requestAnimationFrame(tick)
      }

      signal.addEventListener('abort', abort, { once: true })
      animationFrameId = requestAnimationFrame(tick)
    })
  },
}

export async function executeWorkbenchPath(
  path: WorkbenchPath,
  port: WorkbenchPathPort,
  signal: AbortSignal,
  clock: WorkbenchPathClock = browserWorkbenchPathClock,
): Promise<void> {
  signal.throwIfAborted()
  port.setManualInputEnabled(false)

  try {
    for (const step of path.steps) {
      signal.throwIfAborted()

      if (step.type === 'set-controls') {
        port.setControls(cloneAtmosphereControls(step.controls))
        continue
      }
      if (step.type === 'set-camera-pose') {
        port.setCameraPose(step.pose)
        continue
      }
      if (step.type === 'checkpoint') {
        port.checkpoint(step.id)
        continue
      }
      if (step.type === 'wait') {
        await clock.elapse(
          step.durationMilliseconds,
          () => {},
          signal,
        )
        continue
      }

      await clock.elapse(
        step.durationMilliseconds,
        (progress) => {
          port.setCameraPose({
            position: lerp(step.from.position, step.to.position, progress),
            forward: normalize(
              lerp(step.from.forward, step.to.forward, progress),
            ),
            up: normalize(lerp(step.from.up, step.to.up, progress)),
          })
        },
        signal,
      )
    }
  } finally {
    port.setManualInputEnabled(true)
  }
}
