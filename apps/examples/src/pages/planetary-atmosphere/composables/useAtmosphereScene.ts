import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  CameraPresetId,
  CameraPresetPose,
} from '../camera/cameraPresets.ts'
import type { Vec3 } from '../math/vector3.ts'
import { useAtmosphereStore } from '../model/atmosphereStore.ts'
import {
  cloneAtmosphereControls,
} from '../model/atmosphereState.ts'
import {
  createValidationControls,
  validationCaseById,
  validationCasePath,
} from '../model/validationCases.ts'
import {
  referenceRouteQuery,
  referenceRouteStateFromQuery,
} from '../model/referenceRoute.ts'
import {
  executeWorkbenchPath,
  type WorkbenchPathPort,
} from '../model/workbenchPath.ts'
import {
  atmospherePanelIdFromPath,
} from '../panelRoutes.ts'
import { AtmosphereScene } from '../scene/AtmosphereScene.ts'

export interface AtmosphereWorkbenchSnapshot {
  caseId: string
  phase: string
  pathId: string | null
  checkpoints: readonly string[]
  reference: {
    visible: boolean
    mix: number
    loaded: boolean
  }
  canvas: {
    width: number
    height: number
    devicePixelRatio: number
  }
  browser: string
  controls: ReturnType<typeof createValidationControls>
  camera: CameraPresetPose
}

export interface AtmosphereWorkbenchApi {
  activateCase(id: string): Promise<void>
  deactivateCase(): Promise<void>
  runPath(id: string): Promise<void>
  stopPath(): void
  setReferenceVisible(visible: boolean): Promise<void>
  setReferenceMix(mix: number): Promise<void>
  getSnapshot(): AtmosphereWorkbenchSnapshot
}

declare global {
  interface Window {
    atmosphereWorkbench?: AtmosphereWorkbenchApi
  }
}

export function useAtmosphereScene(
  renderingCanvas: Ref<HTMLCanvasElement | null>,
  overlayCanvas: Ref<HTMLCanvasElement | null>,
) {
  const route = useRoute()
  const router = useRouter()
  const store = useAtmosphereStore()
  let scene: AtmosphereScene | null = null
  let disposed = false
  let pathAbortController: AbortController | null = null
  let pathRunSequence = 0

  watch(
    () => store.controls.camera.mode,
    (mode) => {
      scene?.setCameraMode(mode)
    },
  )
  watch(
    () => store.controls.camera.verticalFovDegrees,
    (degrees) => {
      scene?.setVerticalFov(degrees)
    },
  )
  watch(
    () => [
      store.controls.camera.referenceBodyId,
      store.controls.camera.referenceFrame,
    ] as const,
    ([bodyId, frame]) => {
      scene?.setCameraReference(bodyId, frame)
    },
  )
  watch(
    () => [
      route.path,
      route.params.caseId,
      route.query.reference,
      route.query.mix,
      store.runtime.phase,
    ] as const,
    () => {
      syncRouteCase()
    },
    { immediate: true },
  )

  onMounted(() => {
    window.atmosphereWorkbench = workbench

    start().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : String(error)

      console.error(error)
      store.setFailed(message)
    })
  })

  onBeforeUnmount(() => {
    disposed = true
    stopPath()
    scene?.destroy()
    scene = null
    store.setStopped()

    if (window.atmosphereWorkbench === workbench) {
      delete window.atmosphereWorkbench
    }
  })

  async function start(): Promise<void> {
    const resolvedRenderingCanvas = renderingCanvas.value
    const resolvedOverlayCanvas = overlayCanvas.value

    if (!resolvedRenderingCanvas || !resolvedOverlayCanvas) {
      throw new Error('缺少行星大气 canvas 或调试 overlay。')
    }

    const createdScene = await AtmosphereScene.create(
      resolvedRenderingCanvas,
      resolvedOverlayCanvas,
      () => store.controls,
      {
        adjustSpeedExponent: store.adjustSpeedExponent,
        advanceSimulationTime: store.advanceSimulationTime,
        updateTelemetry: store.updateTelemetry,
        setPointerLocked: store.setPointerLocked,
        reportRenderError: store.setRenderError,
      },
    )

    if (disposed) {
      createdScene.destroy()
      return
    }

    scene = createdScene
    createdScene.start()
    store.setRunning(createdScene.rendererInfo)
    syncRouteCase()
  }

  function requireScene(): AtmosphereScene {
    if (scene === null) {
      throw new Error('大气场景尚未完成初始化。')
    }

    return scene
  }

  function syncRouteCase(): void {
    let referenceState

    try {
      referenceState = referenceRouteStateFromQuery(route.query)
    } catch (error) {
      store.failValidationCase(
        error instanceof Error ? error.message : String(error),
      )
      return
    }

    store.setReferenceVisible(referenceState.visible)
    store.setReferenceMix(referenceState.mix)

    let panelId

    try {
      panelId = atmospherePanelIdFromPath(route.path)
    } catch {
      deactivateCurrentCase()
      return
    }

    if (panelId !== 'presets') {
      deactivateCurrentCase()
      return
    }

    const rawCaseId = route.params.caseId

    if (rawCaseId === undefined) {
      deactivateCurrentCase()
      return
    }
    if (typeof rawCaseId !== 'string') {
      store.failValidationCase('验证用例 URL 只能包含一个 ID。')
      return
    }

    let validationCase

    try {
      validationCase = validationCaseById(rawCaseId)
    } catch (error) {
      store.failValidationCase(
        error instanceof Error ? error.message : String(error),
      )
      return
    }

    if (
      store.workbench.activeCaseId === validationCase.id &&
      (
        store.workbench.phase === 'active' ||
        store.workbench.phase === 'running-path'
      )
    ) {
      return
    }

    store.requestValidationCase(validationCase.id)

    if (scene === null || store.runtime.phase !== 'running') {
      return
    }

    activateCurrentRouteCase(validationCase.id)
  }

  function activateCurrentRouteCase(id: string): void {
    const validationCase = validationCaseById(id)
    const activeScene = requireScene()
    const previousControls = cloneAtmosphereControls(store.controls)
    const previousCamera = activeScene.getCameraPose()

    stopPath()
    store.beginValidationCaseActivation(id)

    try {
      const controls = createValidationControls(validationCase)
      store.replaceControls(controls)
      activeScene.setCameraMode(controls.camera.mode)
      activeScene.setVerticalFov(controls.camera.verticalFovDegrees)
      activeScene.setCameraPose(validationCase.cameraPose)
      store.completeValidationCaseActivation(id)
    } catch (error) {
      store.replaceControls(previousControls)
      activeScene.setCameraMode(previousControls.camera.mode)
      activeScene.setVerticalFov(
        previousControls.camera.verticalFovDegrees,
      )
      activeScene.setCameraPose(previousCamera)
      store.failValidationCase(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  function deactivateCurrentCase(): void {
    stopPath()

    if (
      store.workbench.phase !== 'idle' ||
      store.workbench.requestedCaseId !== null
    ) {
      store.deactivateValidationCase()
    }
  }

  function applyControls(
    controls: ReturnType<typeof createValidationControls>,
  ): void {
    const activeScene = requireScene()
    store.replaceControls(controls)
    activeScene.setCameraMode(controls.camera.mode)
    activeScene.setVerticalFov(controls.camera.verticalFovDegrees)
  }

  async function runPath(id: string): Promise<void> {
    const activeCaseId = store.workbench.activeCaseId

    if (activeCaseId === null) {
      throw new Error('没有激活的验证用例。')
    }

    const validationCase = validationCaseById(activeCaseId)

    if (validationCase.path === null || validationCase.path.id !== id) {
      throw new Error(`验证用例 ${activeCaseId} 不包含动作路径 ${id}。`)
    }

    stopPath()
    const activeScene = requireScene()
    const controller = new AbortController()
    const sequence = ++pathRunSequence
    pathAbortController = controller
    store.beginWorkbenchPath(id)

    const port: WorkbenchPathPort = {
      setControls: applyControls,
      setCameraPose: (pose) => {
        activeScene.setCameraPose(pose)
      },
      setManualInputEnabled: (enabled) => {
        activeScene.setManualInputEnabled(enabled)
      },
      checkpoint: (checkpointId) => {
        if (sequence === pathRunSequence) {
          store.addWorkbenchCheckpoint(checkpointId)
          window.dispatchEvent(
            new CustomEvent('atmosphere-workbench-checkpoint', {
              detail: getSnapshot(),
            }),
          )
        }
      },
    }

    try {
      await executeWorkbenchPath(
        validationCase.path,
        port,
        controller.signal,
      )

      if (sequence === pathRunSequence) {
        store.finishWorkbenchPath()
        pathAbortController = null
      }
    } catch (error) {
      if (sequence !== pathRunSequence) {
        return
      }

      pathAbortController = null
      if (controller.signal.aborted) {
        store.finishWorkbenchPath()
        return
      }

      store.failValidationCase(
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  function stopPath(): void {
    pathRunSequence += 1
    pathAbortController?.abort(
      new DOMException('动作路径已停止。', 'AbortError'),
    )
    pathAbortController = null

    if (store.workbench.phase === 'running-path') {
      store.finishWorkbenchPath()
    }
  }

  function getSnapshot(): AtmosphereWorkbenchSnapshot {
    const activeCaseId = store.workbench.activeCaseId
    const canvas = renderingCanvas.value

    if (activeCaseId === null || canvas === null) {
      throw new Error('验证用例或渲染画布尚未就绪。')
    }

    return {
      caseId: activeCaseId,
      phase: store.workbench.phase,
      pathId: store.workbench.pathId,
      checkpoints: [...store.workbench.checkpoints],
      reference: {
        visible: store.workbench.referenceVisible,
        mix: store.workbench.referenceMix,
        loaded: store.workbench.referenceLoaded,
      },
      canvas: {
        width: canvas.width,
        height: canvas.height,
        devicePixelRatio: window.devicePixelRatio,
      },
      browser: navigator.userAgent,
      controls: cloneAtmosphereControls(store.controls),
      camera: requireScene().getCameraPose(),
    }
  }

  const workbench: AtmosphereWorkbenchApi = {
    async activateCase(id): Promise<void> {
      await router.push({
        path: validationCasePath(id),
        query: referenceRouteQuery({
          visible: store.workbench.referenceVisible,
          mix: store.workbench.referenceMix,
        }),
      })
      await nextTick()
      syncRouteCase()
    },
    async deactivateCase(): Promise<void> {
      await router.push({
        path: '/planetary-atmosphere/presets',
        query: referenceRouteQuery({
          visible: store.workbench.referenceVisible,
          mix: store.workbench.referenceMix,
        }),
      })
      await nextTick()
      deactivateCurrentCase()
    },
    runPath,
    stopPath,
    async setReferenceVisible(visible): Promise<void> {
      await router.replace({
        path: route.path,
        query: {
          ...route.query,
          ...referenceRouteQuery({
            visible,
            mix: store.workbench.referenceMix,
          }),
        },
      })
      await nextTick()
      syncRouteCase()
    },
    async setReferenceMix(mix): Promise<void> {
      await router.replace({
        path: route.path,
        query: {
          ...route.query,
          ...referenceRouteQuery({
            visible: store.workbench.referenceVisible,
            mix,
          }),
        },
      })
      await nextTick()
      syncRouteCase()
    },
    getSnapshot,
  }

  function applyCameraPreset(id: CameraPresetId): void {
    requireScene().applyCameraPreset(id)
  }

  function resetEquatorialBody(): void {
    requireScene().resetEquatorialBody()
  }

  function resetBodyToWorldBasis(): void {
    requireScene().resetBodyToWorldBasis()
  }

  function setFreePosition(position: Vec3): void {
    requireScene().setFreePosition(position)
  }

  function setFreeLookAnglesDegrees(
    yawDegrees: number,
    pitchDegrees: number,
  ): void {
    requireScene().setFreeLookAngles(
      (yawDegrees * Math.PI) / 180,
      (pitchDegrees * Math.PI) / 180,
    )
  }

  function restoreEarthDefaults(): void {
    store.restoreEarthControls()
    const activeScene = requireScene()
    activeScene.setCameraMode(store.controls.camera.mode)
    activeScene.setVerticalFov(
      store.controls.camera.verticalFovDegrees,
    )
    activeScene.applyCameraPreset('surface')
  }

  return {
    applyCameraPreset,
    resetBodyToWorldBasis,
    resetEquatorialBody,
    setFreeLookAnglesDegrees,
    setFreePosition,
    restoreEarthDefaults,
    workbench,
  }
}
