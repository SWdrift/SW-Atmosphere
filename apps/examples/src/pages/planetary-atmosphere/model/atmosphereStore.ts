import { defineStore } from 'pinia'
import type { AtmosphereRendererInfo } from '../atmosphere/AtmosphereRenderer.ts'
import {
  cloneAtmosphereControls,
  createEarthControls,
  createInitialTelemetry,
  type AtmosphereControls,
  type AtmosphereRuntimePhase,
  type AtmosphereTelemetry,
} from './atmosphereState.ts'

export type AtmosphereWorkbenchPhase =
  | 'idle'
  | 'pending'
  | 'activating'
  | 'active'
  | 'running-path'
  | 'error'

export const useAtmosphereStore = defineStore('planetary-atmosphere', {
  state: () => ({
    controls: createEarthControls(),
    runtime: {
      phase: 'initializing' as AtmosphereRuntimePhase,
      statusMessage: '正在初始化 WebGPU...',
      errorMessage: '',
      rendererInfo: null as AtmosphereRendererInfo | null,
      telemetry: createInitialTelemetry(),
    },
    workbench: {
      phase: 'idle' as AtmosphereWorkbenchPhase,
      requestedCaseId: null as string | null,
      activeCaseId: null as string | null,
      pathId: null as string | null,
      checkpoints: [] as string[],
      referenceVisible: false,
      referenceMix: 0.5,
      referenceLoaded: false,
      errorMessage: '',
    },
  }),

  actions: {
    setQuality(value: unknown): void {
      if (
        value !== 'reference' &&
        value !== 'low' &&
        value !== 'medium' &&
        value !== 'high'
      ) {
        throw new Error(`未知的大气渲染质量：${String(value)}`)
      }

      this.controls.rendering.quality = value
      if (value === 'reference') {
        this.controls.rendering.multipleScattering = false
      }
    },

    adjustSpeedExponent(delta: number): void {
      if (!Number.isFinite(delta)) {
        throw new Error('速度指数调整量必须是有限数。')
      }

      this.controls.camera.speedExponent = Math.max(
        -4,
        Math.min(6, this.controls.camera.speedExponent + delta),
      )
    },

    replaceControls(controls: AtmosphereControls): void {
      this.controls = cloneAtmosphereControls(controls)
    },

    restoreEarthControls(): void {
      this.controls = createEarthControls()
    },

    requestValidationCase(id: string): void {
      if (id.length === 0) {
        throw new Error('验证用例 ID 不能为空。')
      }

      this.workbench.phase = 'pending'
      this.workbench.requestedCaseId = id
      this.workbench.errorMessage = ''
    },

    beginValidationCaseActivation(id: string): void {
      if (this.workbench.requestedCaseId !== id) {
        throw new Error(`验证用例 ${id} 尚未进入待激活状态。`)
      }

      this.workbench.phase = 'activating'
      this.workbench.errorMessage = ''
    },

    completeValidationCaseActivation(id: string): void {
      if (
        this.workbench.phase !== 'activating' ||
        this.workbench.requestedCaseId !== id
      ) {
        throw new Error(`验证用例 ${id} 不处于激活流程。`)
      }

      this.workbench.phase = 'active'
      this.workbench.activeCaseId = id
      this.workbench.pathId = null
      this.workbench.checkpoints = []
      this.workbench.referenceLoaded = false
      this.workbench.errorMessage = ''
    },

    failValidationCase(message: string): void {
      this.workbench.phase = 'error'
      this.workbench.activeCaseId = null
      this.workbench.pathId = null
      this.workbench.checkpoints = []
      this.workbench.referenceLoaded = false
      this.workbench.errorMessage = message
    },

    deactivateValidationCase(): void {
      this.workbench.phase = 'idle'
      this.workbench.requestedCaseId = null
      this.workbench.activeCaseId = null
      this.workbench.pathId = null
      this.workbench.checkpoints = []
      this.workbench.referenceLoaded = false
      this.workbench.errorMessage = ''
    },

    beginWorkbenchPath(pathId: string): void {
      if (
        this.workbench.phase !== 'active' ||
        this.workbench.activeCaseId === null
      ) {
        throw new Error('没有可执行动作路径的激活验证用例。')
      }

      this.workbench.phase = 'running-path'
      this.workbench.pathId = pathId
      this.workbench.checkpoints = []
      this.workbench.errorMessage = ''
    },

    addWorkbenchCheckpoint(id: string): void {
      if (this.workbench.phase !== 'running-path') {
        throw new Error('动作路径未运行，不能记录检查点。')
      }

      this.workbench.checkpoints.push(id)
    },

    finishWorkbenchPath(): void {
      if (this.workbench.activeCaseId === null) {
        this.deactivateValidationCase()
        return
      }

      this.workbench.phase = 'active'
      this.workbench.pathId = null
    },

    setReferenceVisible(visible: boolean): void {
      this.workbench.referenceVisible = visible
    },

    setReferenceMix(mix: number): void {
      if (
        !Number.isFinite(mix) ||
        mix < 0 ||
        mix > 1
      ) {
        throw new Error('参考图混合比例必须位于 0 到 1。')
      }

      this.workbench.referenceMix = mix
    },

    setReferenceLoaded(loaded: boolean): void {
      if (this.workbench.activeCaseId === null) {
        return
      }

      this.workbench.referenceLoaded = loaded
      if (loaded) {
        this.workbench.errorMessage = ''
      }
    },

    setReferenceLoadFailed(message: string): void {
      if (this.workbench.activeCaseId === null) {
        return
      }
      if (message.length === 0) {
        throw new Error('参考图加载错误不能为空。')
      }

      this.workbench.referenceLoaded = false
      this.workbench.errorMessage = message
    },

    setRunning(info: AtmosphereRendererInfo): void {
      this.runtime.phase = 'running'
      this.runtime.statusMessage = 'WebGPU 大气管线运行中'
      this.runtime.errorMessage = ''
      this.runtime.rendererInfo = info
    },

    setFailed(message: string): void {
      this.runtime.phase = 'failed'
      this.runtime.statusMessage = '初始化失败'
      this.runtime.errorMessage = message
    },

    setRenderError(message: string): void {
      this.runtime.phase = 'failed'
      this.runtime.statusMessage = '渲染已停止'
      this.runtime.errorMessage = message
    },

    setStopped(): void {
      this.runtime.phase = 'stopped'
      this.runtime.statusMessage = '渲染已停止'
      this.runtime.telemetry.pointerLocked = false
      this.deactivateValidationCase()
    },

    updateTelemetry(telemetry: AtmosphereTelemetry): void {
      this.runtime.telemetry = telemetry
    },

    setPointerLocked(pointerLocked: boolean): void {
      this.runtime.telemetry.pointerLocked = pointerLocked
    },
  },
})
