import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import {
  AtmosphereRenderer,
  type AtmosphereRendererInfo,
} from '../atmosphere/AtmosphereRenderer.ts'
import {
  CameraController,
  type CameraMode,
} from '../camera/CameraController.ts'
import {
  INITIAL_CAMERA_ALTITUDE_KM,
  type CameraPresetId,
  type CameraPresetPose,
} from '../camera/cameraPresets.ts'
import { PlanetCamera } from '../camera/PlanetCamera.ts'
import {
  altitudeFromPosition,
  INITIAL_CAMERA_RADIAL,
  sunDirectionFromAngles,
  WORLD_UP,
} from '../math/coordinates.ts'
import { dot, scale } from '../math/vector3.ts'
import type {
  AtmosphereControls,
  AtmosphereTelemetry,
} from '../model/atmosphereState.ts'
import { DebugOverlay } from './DebugOverlay.ts'

export interface AtmosphereSceneEvents {
  adjustSpeedExponent(delta: number): void
  updateTelemetry(telemetry: AtmosphereTelemetry): void
  setPointerLocked(pointerLocked: boolean): void
  reportRenderError(message: string): void
}

export class AtmosphereScene {
  readonly rendererInfo: AtmosphereRendererInfo

  private readonly renderingCanvas: HTMLCanvasElement
  private readonly camera: PlanetCamera
  private readonly controller: CameraController
  private readonly renderer: AtmosphereRenderer
  private readonly overlay: DebugOverlay
  private readonly getControls: () => AtmosphereControls
  private readonly events: AtmosphereSceneEvents
  private animationFrameId = 0
  private attached = false
  private running = false
  private previousTime: number | null = null
  private telemetryUpdatedAt = 0
  private smoothedFrameMilliseconds = 0

  private constructor(
    renderingCanvas: HTMLCanvasElement,
    camera: PlanetCamera,
    controller: CameraController,
    renderer: AtmosphereRenderer,
    overlay: DebugOverlay,
    getControls: () => AtmosphereControls,
    events: AtmosphereSceneEvents,
  ) {
    this.renderingCanvas = renderingCanvas
    this.camera = camera
    this.controller = controller
    this.renderer = renderer
    this.overlay = overlay
    this.getControls = getControls
    this.events = events
    this.rendererInfo = renderer.info
  }

  static async create(
    renderingCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    getControls: () => AtmosphereControls,
    events: AtmosphereSceneEvents,
  ): Promise<AtmosphereScene> {
    const controls = getControls()
    const initialRadius =
      EARTH_ATMOSPHERE.bottomRadiusKm + INITIAL_CAMERA_ALTITUDE_KM
    const camera = new PlanetCamera(
      scale(INITIAL_CAMERA_RADIAL, initialRadius),
      [1, 0, 0],
      WORLD_UP,
      controls.camera.verticalFovDegrees,
    )
    const controller = new CameraController(
      renderingCanvas,
      camera,
      EARTH_ATMOSPHERE.bottomRadiusKm,
      events.adjustSpeedExponent,
    )
    let scene: AtmosphereScene | null = null
    const renderer = await AtmosphereRenderer.create(
      renderingCanvas,
      EARTH_ATMOSPHERE,
      (message) => {
        if (scene === null) {
          throw new Error('场景完成创建前收到了渲染器运行时错误。')
        }

        scene.stopFrameLoop()
        events.reportRenderError(message)
      },
    )
    const overlay = new DebugOverlay(
      overlayCanvas,
      EARTH_ATMOSPHERE.topRadiusKm * 1.5,
    )

    scene = new AtmosphereScene(
      renderingCanvas,
      camera,
      controller,
      renderer,
      overlay,
      getControls,
      events,
    )
    scene.setCameraMode(controls.camera.mode)
    return scene
  }

  start(): void {
    if (this.attached) {
      throw new Error('AtmosphereScene 不允许重复启动。')
    }

    this.controller.attach()
    document.addEventListener(
      'pointerlockchange',
      this.handlePointerLockChange,
    )
    this.attached = true
    this.running = true
    this.previousTime = null
    this.telemetryUpdatedAt = performance.now()
    this.smoothedFrameMilliseconds = 0
    this.animationFrameId = requestAnimationFrame(this.renderFrame)
  }

  destroy(): void {
    this.stopFrameLoop()

    if (this.attached) {
      document.removeEventListener(
        'pointerlockchange',
        this.handlePointerLockChange,
      )
      this.controller.detach()
      this.attached = false
    }

    this.renderer.destroy()
    this.overlay.clear()
  }

  setCameraMode(mode: CameraMode): void {
    this.controller.setMode(mode)
  }

  setVerticalFov(degrees: number): void {
    this.camera.setVerticalFov(degrees)
  }

  applyCameraPreset(id: CameraPresetId): void {
    this.controller.applyPreset(id)
  }

  setCameraPose(pose: CameraPresetPose): void {
    this.controller.setPose(pose)
  }

  getCameraPose(): CameraPresetPose {
    return this.controller.getPose()
  }

  setManualInputEnabled(enabled: boolean): void {
    this.controller.setManualInputEnabled(enabled)
  }

  private stopFrameLoop(): void {
    this.running = false
    cancelAnimationFrame(this.animationFrameId)
  }

  private readonly renderFrame = (now: number): void => {
    if (!this.running) {
      return
    }

    const controls = this.getControls()
    const frameMilliseconds =
      this.previousTime === null
        ? 0
        : Math.max(0, now - this.previousTime)
    const deltaSeconds = Math.min(frameMilliseconds / 1000, 0.05)
    this.previousTime = now

    this.controller.update(
      deltaSeconds,
      controls.camera.speedExponent,
    )

    const sunDirection = sunDirectionFromAngles(
      controls.sun.azimuthDegrees,
      controls.sun.elevationDegrees,
    )
    const frameResult = this.renderer.render({
      camera: this.camera,
      sunDirection,
      exposure: controls.rendering.exposure,
      geometryDebug: controls.debug.geometry,
      quality: controls.rendering.quality,
      multipleScattering:
        controls.rendering.quality === 'reference'
          ? false
          : controls.rendering.multipleScattering,
      debugView: controls.rendering.debugView,
      aerialPerspectiveSlice:
        controls.rendering.aerialPerspectiveSlice,
      rayleighEnabled: controls.rendering.rayleighEnabled,
      mieEnabled: controls.rendering.mieEnabled,
      ozoneEnabled: controls.rendering.ozoneEnabled,
    })
    this.overlay.render(
      this.camera,
      controls.debug.gridPlane,
      controls.debug.grid,
      controls.debug.skyGrid,
    )

    this.smoothedFrameMilliseconds =
      this.smoothedFrameMilliseconds === 0
        ? frameMilliseconds
        : this.smoothedFrameMilliseconds * 0.9 +
          frameMilliseconds * 0.1

    if (now - this.telemetryUpdatedAt >= 100) {
      const gpuPassEntries = frameResult.gpuPassMilliseconds
        ? Object.entries(frameResult.gpuPassMilliseconds)
        : []

      this.events.updateTelemetry({
        altitudeKm: altitudeFromPosition(
          this.camera.position,
          EARTH_ATMOSPHERE.bottomRadiusKm,
        ),
        localSunElevationDegrees:
          Math.asin(
            Math.max(
              -1,
              Math.min(1, dot(this.camera.localUp, sunDirection)),
            ),
          ) *
          180 /
          Math.PI,
        actualSpeedKmPerSecond:
          this.controller.actualSpeedKmPerSecond,
        targetSpeedKmPerSecond:
          this.controller.targetSpeedKmPerSecond,
        position: this.camera.position,
        frameMilliseconds: this.smoothedFrameMilliseconds,
        submitMilliseconds: frameResult.submitMilliseconds,
        rebuiltPasses:
          frameResult.rebuiltPasses.length > 0
            ? frameResult.rebuiltPasses.join(', ')
            : '无',
        gpuPasses:
          gpuPassEntries.length > 0
            ? gpuPassEntries
                .map(
                  ([label, milliseconds]) =>
                    `${label} ${milliseconds.toFixed(3)} ms`,
                )
                .join(', ')
            : this.rendererInfo.timestampQuerySupported
              ? '等待采样'
              : '不可用',
        pointerLocked:
          document.pointerLockElement === this.renderingCanvas,
      })
      this.telemetryUpdatedAt = now
    }

    this.animationFrameId = requestAnimationFrame(this.renderFrame)
  }

  private readonly handlePointerLockChange = (): void => {
    this.events.setPointerLocked(
      document.pointerLockElement === this.renderingCanvas,
    )
  }
}
