import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import {
  AtmosphereRenderer,
  type AtmosphereRendererInfo,
} from '../atmosphere/AtmosphereRenderer.ts'
import {
  buildCelestialRenderFrame,
  eclipseDiagnosticsAtPoint,
} from '../celestial/CelestialRenderFrame.ts'
import {
  cameraFrameRelativeToBody,
  cameraSystemFrame,
  rebaseCameraPose,
  type CameraReferenceBinding,
} from '../celestial/CelestialReferenceFrames.ts'
import {
  bodyFromSnapshot,
  evaluateCelestialScenario,
  type CameraReferenceFrame,
  type CelestialBodyId,
} from '../celestial/CelestialSystem.ts'
import { EARTH_MOON_MATERIAL } from '../celestial/CelestialMaterials.ts'
import {
  CameraController,
  type CameraMode,
} from '../camera/CameraController.ts'
import {
  cameraPresetPose,
  type CameraPresetId,
  type CameraPresetPose,
} from '../camera/cameraPresets.ts'
import { PlanetCamera } from '../camera/PlanetCamera.ts'
import {
  altitudeFromPosition,
} from '../math/coordinates.ts'
import {
  dot,
  normalize,
  subtract,
  type Vec3,
} from '../math/vector3.ts'
import type {
  AtmosphereControls,
  AtmosphereTelemetry,
} from '../model/atmosphereState.ts'
import { DebugOverlay } from './DebugOverlay.ts'

export interface AtmosphereSceneEvents {
  adjustSpeedExponent(delta: number): void
  advanceSimulationTime(deltaSeconds: number): void
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
  private cameraBinding: CameraReferenceBinding

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
    const controls = getControls()
    this.cameraBinding = {
      bodyId: controls.camera.referenceBodyId,
      frame: controls.camera.referenceFrame,
    }
  }

  static async create(
    renderingCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    getControls: () => AtmosphereControls,
    events: AtmosphereSceneEvents,
  ): Promise<AtmosphereScene> {
    const controls = getControls()
    const snapshot = evaluateCelestialScenario(
      controls.celestial.scenario,
      controls.celestial.simulationTimeSeconds,
    )
    if (snapshot.earth.radiusKm !== EARTH_ATMOSPHERE.bottomRadiusKm) {
      throw new Error(
        '当前阶段要求地球实体半径与大气底部半径完全一致。',
      )
    }
    const referenceBody = bodyFromSnapshot(
      snapshot,
      controls.camera.referenceBodyId,
    )
    const initialPose = cameraPresetPose(
      'surface',
      referenceBody.radiusKm,
    )
    const camera = new PlanetCamera(
      initialPose.position,
      initialPose.forward,
      initialPose.up,
      controls.camera.verticalFovDegrees,
    )
    const controller = new CameraController(
      renderingCanvas,
      camera,
      referenceBody.radiusKm,
      events.adjustSpeedExponent,
    )
    controller.resetEquatorialBody()
    let scene: AtmosphereScene | null = null
    const renderer = await AtmosphereRenderer.create(
      renderingCanvas,
      EARTH_ATMOSPHERE,
      EARTH_MOON_MATERIAL,
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

  setCameraReference(
    bodyId: CelestialBodyId,
    frame: CameraReferenceFrame,
  ): void {
    const nextBinding = { bodyId, frame }
    if (
      nextBinding.bodyId === this.cameraBinding.bodyId &&
      nextBinding.frame === this.cameraBinding.frame
    ) {
      return
    }

    const controls = this.getControls()
    const snapshot = evaluateCelestialScenario(
      controls.celestial.scenario,
      controls.celestial.simulationTimeSeconds,
    )
    const pose = rebaseCameraPose(
      snapshot,
      this.cameraBinding,
      nextBinding,
      this.controller.getPose(),
    )
    this.controller.setReferenceBodyRadius(
      bodyFromSnapshot(snapshot, bodyId).radiusKm,
    )
    this.controller.setPose(pose)
    this.cameraBinding = nextBinding
  }

  applyCameraPreset(id: CameraPresetId): void {
    this.controller.applyPreset(id)
  }

  resetEquatorialBody(): void {
    this.controller.resetEquatorialBody()
  }

  resetBodyToWorldBasis(): void {
    this.controller.resetBodyToWorldBasis()
  }

  setFreePosition(position: Vec3): void {
    this.controller.setFreePosition(position)
  }

  setFreeLookAngles(
    yawRadians: number,
    pitchRadians: number,
  ): void {
    this.controller.setFreeLookAngles({
      yawRadians,
      pitchRadians,
    })
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

    const frameMilliseconds =
      this.previousTime === null
        ? 0
        : Math.max(0, now - this.previousTime)
    const deltaSeconds = Math.min(frameMilliseconds / 1000, 0.05)
    this.previousTime = now
    this.events.advanceSimulationTime(deltaSeconds)
    const controls = this.getControls()
    const currentSnapshot = evaluateCelestialScenario(
      controls.celestial.scenario,
      controls.celestial.simulationTimeSeconds,
    )
    if (
      currentSnapshot.earth.radiusKm !==
      EARTH_ATMOSPHERE.bottomRadiusKm
    ) {
      throw new Error(
        '当前阶段要求地球实体半径与大气底部半径完全一致。',
      )
    }
    this.controller.setReferenceBodyRadius(
      bodyFromSnapshot(currentSnapshot, this.cameraBinding.bodyId).radiusKm,
    )

    this.controller.update(
      deltaSeconds,
      controls.camera.speedExponent,
    )
    const bodyLookFrame = this.controller.getBodyLookFrame()
    const celestialSnapshot = currentSnapshot
    const systemCamera = cameraSystemFrame(
      celestialSnapshot,
      this.cameraBinding,
      this.camera,
    )
    const atmosphereCamera = cameraFrameRelativeToBody(
      celestialSnapshot,
      systemCamera,
      'earth',
    )
    const celestial = buildCelestialRenderFrame(
      celestialSnapshot,
      systemCamera,
    )
    const frameResult = this.renderer.render({
      camera: {
        position: atmosphereCamera.positionKm,
        right: atmosphereCamera.right,
        forward: atmosphereCamera.forward,
        up: atmosphereCamera.up,
        verticalFovDegrees: atmosphereCamera.verticalFovDegrees,
      },
      celestial,
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
    this.overlay.render({
      camera: this.camera,
      bodyLookAngles: bodyLookFrame,
      plane: controls.debug.gridPlane,
      worldGridVisible: controls.debug.grid,
      skyGridVisible: controls.debug.skyGrid,
      axesIndicatorVisible: controls.debug.axesIndicator,
      attitudeIndicatorVisible: controls.debug.attitudeIndicator,
    })

    this.smoothedFrameMilliseconds =
      this.smoothedFrameMilliseconds === 0
        ? frameMilliseconds
        : this.smoothedFrameMilliseconds * 0.9 +
          frameMilliseconds * 0.1

    if (now - this.telemetryUpdatedAt >= 100) {
      const eclipse = eclipseDiagnosticsAtPoint(
        celestialSnapshot,
        systemCamera.positionKm,
      )
      const earthRelativePosition = subtract(
        systemCamera.positionKm,
        celestialSnapshot.earth.systemPositionKm,
      )
      const sunDirection = normalize(subtract(
        celestialSnapshot.sun.systemPositionKm,
        systemCamera.positionKm,
      ))
      const gpuPassEntries = frameResult.gpuPassMilliseconds
        ? Object.entries(frameResult.gpuPassMilliseconds)
        : []

      this.events.updateTelemetry({
        altitudeKm: altitudeFromPosition(
          earthRelativePosition,
          EARTH_ATMOSPHERE.bottomRadiusKm,
        ),
        localSunElevationDegrees:
          Math.asin(
            Math.max(
              -1,
              Math.min(1, dot(normalize(earthRelativePosition), sunDirection)),
            ),
          ) *
          180 /
          Math.PI,
        simulationTimeSeconds:
          controls.celestial.simulationTimeSeconds,
        referenceBodyId: this.cameraBinding.bodyId,
        sunDistanceKm: eclipse.sunDistanceKm,
        moonDistanceKm: eclipse.moonDistanceKm,
        sunMoonSeparationDegrees:
          eclipse.separationRadians * 180 / Math.PI,
        solarVisibleFraction: eclipse.solarVisibleFraction,
        actualSpeedKmPerSecond:
          this.controller.actualSpeedKmPerSecond,
        targetSpeedKmPerSecond:
          this.controller.targetSpeedKmPerSecond,
        position: this.camera.position,
        viewForward: this.camera.forward,
        bodyRight: bodyLookFrame === null ? null : bodyLookFrame.right,
        bodyForward:
          bodyLookFrame === null ? null : bodyLookFrame.forward,
        bodyUp: bodyLookFrame === null ? null : bodyLookFrame.up,
        lookYawDegrees:
          bodyLookFrame === null
            ? null
            : (bodyLookFrame.yawRadians * 180) / Math.PI,
        lookPitchDegrees:
          bodyLookFrame === null
            ? null
            : (bodyLookFrame.pitchRadians * 180) / Math.PI,
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
