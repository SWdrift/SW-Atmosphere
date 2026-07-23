import type { StageOneAtmosphereParameters } from '../atmosphere/AtmosphereParameters.ts'
import {
  altitudeFromPosition,
  CAMERA_PITCH_LIMIT_RADIANS,
  INITIAL_CAMERA_RADIAL,
  WORLD_UP,
  zUpViewAnglesFromForward,
  type ZUpViewAngles,
} from '../math/coordinates.ts'
import {
  add,
  dot,
  length,
  lerp,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from '../math/vector3.ts'
import {
  orbitAnglesFromRadial,
  orbitRadialFromAngles,
  rotateOrbitAngles,
  type OrbitAngles,
} from './orbitCoordinates.ts'
import { PlanetCamera } from './PlanetCamera.ts'

export type CameraMode = 'free' | 'orbit'

export const CAMERA_PRESETS = [
  { id: 'surface', label: '地表', altitudeKm: 1.5, view: 'tangent' },
  { id: 'twenty-km', label: '20 km', altitudeKm: 20, view: 'tangent' },
  { id: 'karman-line', label: '100 km', altitudeKm: 100, view: 'planet' },
  { id: 'low-orbit', label: '低轨', altitudeKm: 400, view: 'planet' },
  { id: 'deep-space', label: '深空', altitudeKm: 30_000, view: 'planet' },
] as const

export type CameraPresetId = (typeof CAMERA_PRESETS)[number]['id']

const MAX_LOCKED_MOUSE_DELTA = 64

interface ViewProbeSnapshot {
  position: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
  freeView: ZUpViewAngles
  orbitAngles: OrbitAngles
}

interface ViewProbeInput {
  source: 'free-mouse' | 'orbit-pointer' | 'orbit-keyboard' | 'mode' | 'preset'
  movementX: number
  movementY: number
  timestamp: number
}

export function automaticSpeedKmPerSecond(altitudeKm: number): number {
  if (!Number.isFinite(altitudeKm)) {
    throw new Error('高度必须是有限数。')
  }

  return Math.max(0.005, Math.min(2_000, Math.max(0, altitudeKm) * 0.05))
}

export class CameraController {
  readonly camera: PlanetCamera

  mode: CameraMode = 'free'
  speedExponent = 0
  actualSpeedKmPerSecond = 0
  targetSpeedKmPerSecond = 0

  private readonly canvas: HTMLCanvasElement
  private readonly parameters: StageOneAtmosphereParameters
  private readonly pressedKeys = new Set<string>()
  private velocityKmPerSecond: Vec3 = [0, 0, 0]
  private attached = false
  private orbitDragging = false
  private discardNextLockedPointerMove = false
  private freeView: ZUpViewAngles = { yawRadians: 0, pitchRadians: 0 }
  private orbitAngles: OrbitAngles = {
    azimuthRadians: 0,
    elevationRadians: 0,
  }
  private orbitRadiusKm = 0
  private targetOrbitRadiusKm = 0
  private viewProbeSnapshot: ViewProbeSnapshot | null = null
  private viewProbeInputBudgetRadians = 0
  private lastViewProbeInput: ViewProbeInput | null = null

  constructor(
    canvas: HTMLCanvasElement,
    camera: PlanetCamera,
    parameters: StageOneAtmosphereParameters,
  ) {
    this.canvas = canvas
    this.camera = camera
    this.parameters = parameters
    this.initializeFreeViewFromCamera()
    this.initializeOrbitFromCamera()
  }

  attach(): void {
    if (this.attached) {
      throw new Error('CameraController 不允许重复 attach。')
    }

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.attached = true
  }

  detach(): void {
    if (!this.attached) {
      return
    }

    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock()
    }

    this.resetInput()
    this.attached = false
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) {
      return
    }

    this.mode = mode
    this.resetInput()
    this.viewProbeInputBudgetRadians = 0
    this.lastViewProbeInput = {
      source: 'mode',
      movementX: 0,
      movementY: 0,
      timestamp: performance.now(),
    }

    if (mode === 'orbit') {
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock()
      }

      this.initializeOrbitFromCamera()
      this.applyOrbitPose()
      return
    }

    this.initializeFreeViewFromCamera()
    this.camera.setZUpView(this.freeView)
  }

  setSpeedExponent(exponent: number): void {
    if (!Number.isFinite(exponent) || exponent < -4 || exponent > 6) {
      throw new Error('速度指数必须位于 -4 到 6。')
    }

    this.speedExponent = exponent
  }

  applyPreset(id: CameraPresetId): void {
    const preset = CAMERA_PRESETS.find((candidate) => candidate.id === id)

    if (!preset) {
      throw new Error(`未知摄像机预设：${id}`)
    }

    const radius = this.parameters.planetRadiusKm + preset.altitudeKm
    const position = scale(INITIAL_CAMERA_RADIAL, radius)
    const forward: Vec3 =
      preset.view === 'tangent' ? [1, 0, 0] : scale(INITIAL_CAMERA_RADIAL, -1)

    this.camera.setPose(position, forward, WORLD_UP)
    this.viewProbeInputBudgetRadians = 0
    this.lastViewProbeInput = {
      source: 'preset',
      movementX: 0,
      movementY: 0,
      timestamp: performance.now(),
    }
    this.velocityKmPerSecond = [0, 0, 0]
    this.actualSpeedKmPerSecond = 0
    this.initializeFreeViewFromCamera()
    this.initializeOrbitFromCamera()

    if (this.mode === 'orbit') {
      this.applyOrbitPose()
    } else {
      this.camera.setZUpView(this.freeView)
    }
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('帧间隔必须是有限非负数。')
    }

    if (deltaSeconds === 0) {
      this.probeViewContinuity(deltaSeconds)
      return
    }

    if (this.mode === 'free') {
      this.updateFreeFlight(deltaSeconds)
    } else {
      this.updateOrbit(deltaSeconds)
    }

    this.probeViewContinuity(deltaSeconds)
  }

  private updateFreeFlight(deltaSeconds: number): void {
    const altitudeKm = altitudeFromPosition(
      this.camera.position,
      this.parameters.planetRadiusKm,
    )
    const speedModifier =
      (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight') ? 4 : 1) *
      (this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight')
        ? 0.2
        : 1)

    this.targetSpeedKmPerSecond =
      automaticSpeedKmPerSecond(altitudeKm) * 2 ** this.speedExponent * speedModifier

    let desiredDirection: Vec3 = [0, 0, 0]

    if (this.pressedKeys.has('KeyW')) desiredDirection = add(desiredDirection, this.camera.forward)
    if (this.pressedKeys.has('KeyS')) desiredDirection = add(desiredDirection, scale(this.camera.forward, -1))
    if (this.pressedKeys.has('KeyD')) desiredDirection = add(desiredDirection, this.camera.right)
    if (this.pressedKeys.has('KeyA')) desiredDirection = add(desiredDirection, scale(this.camera.right, -1))
    if (this.pressedKeys.has('KeyE')) desiredDirection = add(desiredDirection, WORLD_UP)
    if (this.pressedKeys.has('KeyQ')) desiredDirection = add(desiredDirection, scale(WORLD_UP, -1))

    const hasMovementInput = length(desiredDirection) > 1e-12
    const desiredVelocity = hasMovementInput
      ? scale(normalize(desiredDirection), this.targetSpeedKmPerSecond)
      : ([0, 0, 0] as const)
    const response = 1 - Math.exp(-(hasMovementInput ? 5 : 7) * deltaSeconds)

    this.velocityKmPerSecond = lerp(this.velocityKmPerSecond, desiredVelocity, response)
    this.camera.move(
      scale(this.velocityKmPerSecond, deltaSeconds),
      this.parameters.planetRadiusKm,
      this.parameters.minimumCameraAltitudeKm,
    )

    const currentAltitudeKm = altitudeFromPosition(
      this.camera.position,
      this.parameters.planetRadiusKm,
    )

    if (
      currentAltitudeKm <= this.parameters.minimumCameraAltitudeKm + 1e-6 &&
      dot(this.velocityKmPerSecond, this.camera.localUp) < 0
    ) {
      this.velocityKmPerSecond = projectOntoPlane(
        this.velocityKmPerSecond,
        this.camera.localUp,
      )
    }

    this.actualSpeedKmPerSecond = length(this.velocityKmPerSecond)
  }

  private updateOrbit(deltaSeconds: number): void {
    const angularSpeed = 0.8
    let yawRadians = 0
    let pitchRadians = 0

    if (this.pressedKeys.has('KeyA')) yawRadians -= angularSpeed * deltaSeconds
    if (this.pressedKeys.has('KeyD')) yawRadians += angularSpeed * deltaSeconds
    if (this.pressedKeys.has('KeyW')) pitchRadians += angularSpeed * deltaSeconds
    if (this.pressedKeys.has('KeyS')) pitchRadians -= angularSpeed * deltaSeconds
    if (this.pressedKeys.has('KeyQ')) this.targetOrbitRadiusKm *= Math.exp(deltaSeconds)
    if (this.pressedKeys.has('KeyE')) this.targetOrbitRadiusKm *= Math.exp(-deltaSeconds)

    if (yawRadians !== 0 || pitchRadians !== 0) {
      this.viewProbeInputBudgetRadians +=
        Math.abs(yawRadians) + Math.abs(pitchRadians)
      this.lastViewProbeInput = {
        source: 'orbit-keyboard',
        movementX: yawRadians,
        movementY: pitchRadians,
        timestamp: performance.now(),
      }
    }

    this.rotateOrbit(yawRadians, pitchRadians)
    this.clampOrbit()

    const previousPosition = this.camera.position
    const radiusResponse = 1 - Math.exp(-6 * deltaSeconds)
    this.orbitRadiusKm +=
      (this.targetOrbitRadiusKm - this.orbitRadiusKm) * radiusResponse

    const radial = orbitRadialFromAngles(this.orbitAngles)
    const position = scale(radial, this.orbitRadiusKm)

    this.camera.setPose(position, scale(radial, -1), WORLD_UP)
    this.actualSpeedKmPerSecond = length([
      position[0] - previousPosition[0],
      position[1] - previousPosition[1],
      position[2] - previousPosition[2],
    ]) / deltaSeconds
    this.targetSpeedKmPerSecond = automaticSpeedKmPerSecond(
      this.orbitRadiusKm - this.parameters.planetRadiusKm,
    )
  }

  private initializeOrbitFromCamera(): void {
    const radius = length(this.camera.position)

    this.orbitRadiusKm = radius
    this.targetOrbitRadiusKm = radius
    this.orbitAngles = orbitAnglesFromRadial(this.camera.position)
    this.clampOrbit()
  }

  private initializeFreeViewFromCamera(): void {
    this.freeView = zUpViewAnglesFromForward(
      this.camera.forward,
      this.freeView.yawRadians,
    )
  }

  private clampOrbit(): void {
    const minimumRadius =
      this.parameters.planetRadiusKm + this.parameters.minimumCameraAltitudeKm
    const maximumRadius = this.parameters.planetRadiusKm + 100_000
    this.targetOrbitRadiusKm = Math.max(
      minimumRadius,
      Math.min(maximumRadius, this.targetOrbitRadiusKm),
    )
  }

  private rotateOrbit(yawRadians: number, pitchRadians: number): void {
    this.orbitAngles = rotateOrbitAngles(
      this.orbitAngles,
      yawRadians,
      pitchRadians,
    )
  }

  private applyOrbitPose(): void {
    const radial = orbitRadialFromAngles(this.orbitAngles)
    this.camera.setPose(
      scale(radial, this.orbitRadiusKm),
      scale(radial, -1),
      WORLD_UP,
    )
  }

  private probeViewContinuity(deltaSeconds: number): void {
    const snapshot: ViewProbeSnapshot = {
      position: [...this.camera.position],
      forward: this.camera.forward,
      right: this.camera.right,
      up: this.camera.up,
      freeView: { ...this.freeView },
      orbitAngles: { ...this.orbitAngles },
    }
    const previous = this.viewProbeSnapshot

    if (previous) {
      const angleDegrees = {
        forward: this.vectorAngleDegrees(previous.forward, snapshot.forward),
        right: this.vectorAngleDegrees(previous.right, snapshot.right),
        up: this.vectorAngleDegrees(previous.up, snapshot.up),
      }
      const maximumAngleDegrees = Math.max(
        angleDegrees.forward,
        angleDegrees.right,
        angleDegrees.up,
      )
      const inputBudgetDegrees =
        (this.viewProbeInputBudgetRadians * 180) / Math.PI
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
          mode: this.mode,
          deltaSeconds,
          pointerLocked: document.pointerLockElement === this.canvas,
          maximumAngleDegrees,
          angleDegrees,
          inputBudgetDegrees,
          lastInput: this.lastViewProbeInput,
          before: previous,
          after: snapshot,
        })
      }
    }

    this.viewProbeSnapshot = snapshot
    this.viewProbeInputBudgetRadians = 0
  }

  private vectorAngleDegrees(a: Vec3, b: Vec3): number {
    const cosine = Math.max(-1, Math.min(1, dot(a, b)))
    return (Math.acos(cosine) * 180) / Math.PI
  }

  private resetInput(): void {
    this.pressedKeys.clear()
    this.orbitDragging = false
    this.velocityKmPerSecond = [0, 0, 0]
    this.actualSpeedKmPerSecond = 0
  }

  private hasKeyboardFocus(): boolean {
    return (
      document.pointerLockElement === this.canvas || document.activeElement === this.canvas
    )
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.focus()

    if (this.mode === 'free') {
      void this.canvas.requestPointerLock().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'SecurityError') {
          return
        }

        console.error('Pointer Lock 请求失败：', error)
      })
      return
    }

    this.orbitDragging = true
    this.canvas.setPointerCapture(event.pointerId)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    const sensitivity = 0.0025

    if (this.mode !== 'free' || document.pointerLockElement !== this.canvas) {
      return
    }

    if (this.discardNextLockedPointerMove) {
      this.discardNextLockedPointerMove = false
      return
    }

    const movementLength = Math.hypot(event.movementX, event.movementY)

    if (!Number.isFinite(movementLength)) {
      throw new Error('Pointer Lock 鼠标位移必须是有限数。')
    }

    if (movementLength > MAX_LOCKED_MOUSE_DELTA) {
      console.warn('[CameraInputOutlier]', {
        reason: `单事件位移超过 ${MAX_LOCKED_MOUSE_DELTA}px，已丢弃`,
        movementX: event.movementX,
        movementY: event.movementY,
        movementLength,
        timestamp: event.timeStamp,
        pointerLocked: true,
        freeView: { ...this.freeView },
        camera: {
          position: [...this.camera.position],
          forward: this.camera.forward,
          right: this.camera.right,
          up: this.camera.up,
        },
      })
      return
    }

    this.freeView = {
      yawRadians:
        this.freeView.yawRadians + event.movementX * sensitivity,
      pitchRadians: Math.max(
        -CAMERA_PITCH_LIMIT_RADIANS,
        Math.min(
          CAMERA_PITCH_LIMIT_RADIANS,
          this.freeView.pitchRadians - event.movementY * sensitivity,
        ),
      ),
    }
    this.viewProbeInputBudgetRadians +=
      (Math.abs(event.movementX) + Math.abs(event.movementY)) * sensitivity
    this.lastViewProbeInput = {
      source: 'free-mouse',
      movementX: event.movementX,
      movementY: event.movementY,
      timestamp: event.timeStamp,
    }
    this.camera.setZUpView(this.freeView)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.mode !== 'orbit' || !this.orbitDragging) {
      return
    }

    const sensitivity = 0.0025
    this.viewProbeInputBudgetRadians +=
      (Math.abs(event.movementX) + Math.abs(event.movementY)) * sensitivity
    this.lastViewProbeInput = {
      source: 'orbit-pointer',
      movementX: event.movementX,
      movementY: event.movementY,
      timestamp: event.timeStamp,
    }
    this.rotateOrbit(
      -event.movementX * sensitivity,
      event.movementY * sensitivity,
    )
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }

    this.orbitDragging = false
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()

    if (this.mode === 'free') {
      this.setSpeedExponent(
        Math.max(-4, Math.min(6, this.speedExponent - Math.sign(event.deltaY) * 0.25)),
      )
      return
    }

    this.targetOrbitRadiusKm *= Math.exp(event.deltaY * 0.001)
    this.clampOrbit()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.hasKeyboardFocus() || event.target instanceof HTMLInputElement) {
      return
    }

    if (
      event.code.startsWith('Key') ||
      event.code.startsWith('Shift') ||
      event.code.startsWith('Control')
    ) {
      event.preventDefault()
      this.pressedKeys.add(event.code)
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code)
  }

  private readonly onBlur = (): void => {
    this.resetInput()
  }

  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement === this.canvas) {
      this.discardNextLockedPointerMove = true
      return
    }

    this.discardNextLockedPointerMove = false
    this.resetInput()
  }
}
