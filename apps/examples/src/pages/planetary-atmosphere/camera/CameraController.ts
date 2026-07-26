import {
  altitudeFromPosition,
  CAMERA_PITCH_LIMIT_RADIANS,
  WORLD_FORWARD,
  WORLD_UP,
} from '../math/coordinates.ts'
import {
  add,
  dot,
  isFiniteVector,
  length,
  lerp,
  normalize,
  projectOntoPlane,
  scale,
  type Vec3,
} from '../math/vector3.ts'
import {
  cameraPresetPose,
  horizonDipRadians,
  INITIAL_CAMERA_ALTITUDE_KM,
  type CameraPresetId,
  type CameraPresetPose,
} from './cameraPresets.ts'
import {
  type BodyLookAngles,
  type BodyLookFrame,
  freeBodyBasis,
  freeViewBasis,
  freeViewFromBasis,
  rollFreeBody,
  rotateFreeView,
  type FreeView,
} from './freeViewCoordinates.ts'
import {
  orbitAnglesFromRadial,
  orbitRadialFromAngles,
  rotateOrbitAngles,
  type OrbitAngles,
} from './orbitCoordinates.ts'
import { PlanetCamera } from './PlanetCamera.ts'

export type CameraMode = 'free' | 'orbit'

export const MINIMUM_CAMERA_ALTITUDE_KM = INITIAL_CAMERA_ALTITUDE_KM

const MAX_LOCKED_MOUSE_DELTA = 64

export function automaticSpeedKmPerSecond(altitudeKm: number): number {
  if (!Number.isFinite(altitudeKm)) {
    throw new Error('高度必须是有限数。')
  }

  return Math.max(0.005, Math.min(2_000, Math.max(0, altitudeKm) * 0.05))
}

export function assertFreeCameraPosition(
  position: Vec3,
  planetRadiusKm: number,
): void {
  if (
    !isFiniteVector(position) ||
    !Number.isFinite(planetRadiusKm) ||
    planetRadiusKm <= 0 ||
    length(position) <
      planetRadiusKm + MINIMUM_CAMERA_ALTITUDE_KM
  ) {
    throw new Error('Free 摄像机位置必须位于最低高度球面之外。')
  }
}

export class CameraController {
  readonly camera: PlanetCamera

  mode: CameraMode = 'free'
  actualSpeedKmPerSecond = 0
  targetSpeedKmPerSecond = 0

  private readonly canvas: HTMLCanvasElement
  private planetRadiusKm: number
  private readonly adjustSpeedExponent: (delta: number) => void
  private readonly pressedKeys = new Set<string>()
  private localVelocityKmPerSecond: Vec3 = [0, 0, 0]
  private pendingFreeLookRotationRadians: Vec3 = [0, 0, 0]
  private freeView: FreeView
  private freePositionBeforeOrbit: Vec3 | null = null
  private attached = false
  private manualInputEnabled = true
  private orbitDragging = false
  private discardNextLockedPointerMove = false
  private orbitAngles: OrbitAngles = {
    azimuthRadians: 0,
    elevationRadians: 0,
  }
  private orbitRadiusKm = 0
  private targetOrbitRadiusKm = 0

  constructor(
    canvas: HTMLCanvasElement,
    camera: PlanetCamera,
    planetRadiusKm: number,
    adjustSpeedExponent: (delta: number) => void,
  ) {
    if (!Number.isFinite(planetRadiusKm) || planetRadiusKm <= 0) {
      throw new Error('摄像机控制器的行星半径必须是有限正数。')
    }

    this.canvas = canvas
    this.camera = camera
    this.planetRadiusKm = planetRadiusKm
    this.adjustSpeedExponent = adjustSpeedExponent
    this.freeView = freeViewFromBasis(camera.forward, camera.up)
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

    if (mode === 'orbit') {
      this.freePositionBeforeOrbit = [...this.camera.position]

      if (
        this.attached &&
        document.pointerLockElement === this.canvas
      ) {
        document.exitPointerLock()
      }

      this.initializeOrbitFromCamera()
      this.applyOrbitPose()
      return
    }

    if (this.freePositionBeforeOrbit === null) {
      throw new Error('退出 Orbit 时缺少进入前的 Free 摄像机位置。')
    }

    const basis = freeViewBasis(this.freeView)
    this.camera.setPose(
      this.freePositionBeforeOrbit,
      basis.forward,
      basis.up,
    )
    this.freePositionBeforeOrbit = null
  }

  applyPreset(id: CameraPresetId): void {
    if (id === 'surface' && this.mode === 'free') {
      this.resetEquatorialBody()
      return
    }

    const pose = cameraPresetPose(id, this.planetRadiusKm)

    this.setPose(pose)
    if (this.mode === 'orbit') {
      this.applyOrbitPose()
    }
  }

  setPose(pose: CameraPresetPose): void {
    this.camera.setPose(pose.position, pose.forward, pose.up)
    this.resetInput()

    if (this.mode === 'free') {
      this.initializeFreeViewFromCamera()
    }
    this.initializeOrbitFromCamera()
  }

  getPose(): CameraPresetPose {
    return {
      position: [...this.camera.position],
      forward: [...this.camera.forward],
      up: [...this.camera.up],
    }
  }

  setReferenceBodyRadius(radiusKm: number): void {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new Error('摄像机参考天体半径必须是有限正数。')
    }

    if (radiusKm === this.planetRadiusKm) {
      return
    }

    const previousRadiusKm = this.planetRadiusKm
    const previousAltitudeKm =
      length(this.camera.position) - previousRadiusKm
    const nextPosition = scale(
      normalize(this.camera.position),
      radiusKm + Math.max(previousAltitudeKm, MINIMUM_CAMERA_ALTITUDE_KM),
    )
    this.planetRadiusKm = radiusKm
    this.camera.setPose(nextPosition, this.camera.forward, this.camera.up)

    if (this.freePositionBeforeOrbit !== null) {
      const previousFreeAltitudeKm =
        length(this.freePositionBeforeOrbit) - previousRadiusKm
      this.freePositionBeforeOrbit = scale(
        normalize(this.freePositionBeforeOrbit),
        radiusKm +
          Math.max(previousFreeAltitudeKm, MINIMUM_CAMERA_ALTITUDE_KM),
      )
    }

    this.initializeOrbitFromCamera()
  }

  getBodyLookFrame(): BodyLookFrame | null {
    if (this.mode !== 'free') {
      return null
    }

    const bodyBasis = freeBodyBasis(this.freeView)

    return {
      ...bodyBasis,
      yawRadians: this.freeView.yawRadians,
      pitchRadians: this.freeView.pitchRadians,
    }
  }

  resetEquatorialBody(): void {
    if (this.mode !== 'free') {
      throw new Error('只有 Free 模式可以重置 Body/Look 姿态。')
    }

    const surfacePose = cameraPresetPose('surface', this.planetRadiusKm)
    const localUp = normalize(surfacePose.position)
    const bodyForward = normalize(
      projectOntoPlane(surfacePose.forward, localUp),
    )
    const bodyView = freeViewFromBasis(bodyForward, localUp)
    this.freeView = {
      ...bodyView,
      pitchRadians: -horizonDipRadians(
        INITIAL_CAMERA_ALTITUDE_KM,
        this.planetRadiusKm,
      ),
    }
    const basis = freeViewBasis(this.freeView)

    this.camera.setPose(surfacePose.position, basis.forward, basis.up)
    this.resetInput()
    this.initializeOrbitFromCamera()
  }

  resetBodyToWorldBasis(): void {
    if (this.mode !== 'free') {
      throw new Error('只有 Free 模式可以重置 Body/Look 姿态。')
    }

    this.freeView = freeViewFromBasis(WORLD_FORWARD, WORLD_UP)
    this.applyFreeView()
    this.resetInput()
    this.initializeOrbitFromCamera()
  }

  setFreePosition(position: Vec3): void {
    if (this.mode !== 'free') {
      throw new Error('只有 Free 模式可以编辑摄像机位置。')
    }

    assertFreeCameraPosition(position, this.planetRadiusKm)
    this.camera.setPose(position, this.camera.forward, this.camera.up)
    this.resetInput()
    this.initializeOrbitFromCamera()
  }

  setFreeLookAngles(angles: BodyLookAngles): void {
    if (this.mode !== 'free') {
      throw new Error('只有 Free 模式可以编辑 Look 角。')
    }
    if (
      !Number.isFinite(angles.yawRadians) ||
      angles.yawRadians < -Math.PI ||
      angles.yawRadians > Math.PI ||
      !Number.isFinite(angles.pitchRadians) ||
      Math.abs(angles.pitchRadians) > CAMERA_PITCH_LIMIT_RADIANS
    ) {
      throw new Error('Look yaw 必须位于 ±180°，pitch 必须位于 ±89°。')
    }

    this.freeView = {
      ...this.freeView,
      yawRadians: angles.yawRadians,
      pitchRadians: angles.pitchRadians,
    }
    this.applyFreeView()
    this.resetInput()
  }

  setManualInputEnabled(enabled: boolean): void {
    if (enabled === this.manualInputEnabled) {
      return
    }

    this.manualInputEnabled = enabled
    this.resetInput()

    if (
      !enabled &&
      this.attached &&
      document.pointerLockElement === this.canvas
    ) {
      document.exitPointerLock()
    }
  }

  update(deltaSeconds: number, speedExponent: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('帧间隔必须是有限非负数。')
    }
    if (
      !Number.isFinite(speedExponent) ||
      speedExponent < -4 ||
      speedExponent > 6
    ) {
      throw new Error('速度指数必须位于 -4 到 6。')
    }

    if (deltaSeconds === 0) {
      return
    }

    if (!this.manualInputEnabled) {
      return
    }

    if (this.mode === 'free') {
      this.updateFreeFlight(deltaSeconds, speedExponent)
    } else {
      this.updateOrbit(deltaSeconds)
    }

  }

  private updateFreeFlight(
    deltaSeconds: number,
    speedExponent: number,
  ): void {
    const rollSpeedRadiansPerSecond = 0.8
    let rollDeltaRadians = 0

    if (this.pressedKeys.has('KeyQ')) {
      rollDeltaRadians -= rollSpeedRadiansPerSecond * deltaSeconds
    }
    if (this.pressedKeys.has('KeyE')) {
      rollDeltaRadians += rollSpeedRadiansPerSecond * deltaSeconds
    }

    const hasLookRotation =
      length(this.pendingFreeLookRotationRadians) > 1e-12

    if (hasLookRotation) {
      this.freeView = rotateFreeView(
        this.freeView,
        this.pendingFreeLookRotationRadians,
      )
      this.pendingFreeLookRotationRadians = [0, 0, 0]
    }

    if (rollDeltaRadians !== 0) {
      this.freeView = rollFreeBody(this.freeView, rollDeltaRadians)
    }

    if (hasLookRotation || rollDeltaRadians !== 0) {
      this.applyFreeView()
    }

    const altitudeKm = altitudeFromPosition(
      this.camera.position,
      this.planetRadiusKm,
    )
    const speedModifier =
      (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight') ? 4 : 1) *
      (this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight')
        ? 0.2
        : 1)

    this.targetSpeedKmPerSecond =
      automaticSpeedKmPerSecond(altitudeKm) * 2 ** speedExponent * speedModifier

    let desiredLocalDirection: Vec3 = [0, 0, 0]

    if (this.pressedKeys.has('KeyW')) desiredLocalDirection = add(desiredLocalDirection, [0, 1, 0])
    if (this.pressedKeys.has('KeyS')) desiredLocalDirection = add(desiredLocalDirection, [0, -1, 0])
    if (this.pressedKeys.has('KeyD')) desiredLocalDirection = add(desiredLocalDirection, [1, 0, 0])
    if (this.pressedKeys.has('KeyA')) desiredLocalDirection = add(desiredLocalDirection, [-1, 0, 0])
    if (this.pressedKeys.has('Space')) desiredLocalDirection = add(desiredLocalDirection, [0, 0, 1])
    if (this.pressedKeys.has('KeyC')) desiredLocalDirection = add(desiredLocalDirection, [0, 0, -1])

    const hasMovementInput = length(desiredLocalDirection) > 1e-12
    const desiredLocalVelocity = hasMovementInput
      ? scale(normalize(desiredLocalDirection), this.targetSpeedKmPerSecond)
      : ([0, 0, 0] as const)
    const response = 1 - Math.exp(-(hasMovementInput ? 5 : 7) * deltaSeconds)

    this.localVelocityKmPerSecond = lerp(
      this.localVelocityKmPerSecond,
      desiredLocalVelocity,
      response,
    )
    const bodyUp = freeBodyBasis(this.freeView).up
    let worldVelocityKmPerSecond = add(
      scale(this.camera.right, this.localVelocityKmPerSecond[0]),
      add(
        scale(this.camera.forward, this.localVelocityKmPerSecond[1]),
        scale(bodyUp, this.localVelocityKmPerSecond[2]),
      ),
    )
    this.camera.move(
      scale(worldVelocityKmPerSecond, deltaSeconds),
      this.planetRadiusKm,
      MINIMUM_CAMERA_ALTITUDE_KM,
    )

    const currentAltitudeKm = altitudeFromPosition(
      this.camera.position,
      this.planetRadiusKm,
    )

    if (
      currentAltitudeKm <= MINIMUM_CAMERA_ALTITUDE_KM + 1e-6 &&
      dot(worldVelocityKmPerSecond, this.camera.localUp) < 0
    ) {
      worldVelocityKmPerSecond = projectOntoPlane(
        worldVelocityKmPerSecond,
        this.camera.localUp,
      )
      this.localVelocityKmPerSecond = [
        dot(worldVelocityKmPerSecond, this.camera.right),
        dot(worldVelocityKmPerSecond, this.camera.forward),
        dot(worldVelocityKmPerSecond, bodyUp),
      ]
    }

    this.actualSpeedKmPerSecond = length(worldVelocityKmPerSecond)
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
      this.orbitRadiusKm - this.planetRadiusKm,
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
    this.freeView = freeViewFromBasis(this.camera.forward, this.camera.up)
  }

  private applyFreeView(): void {
    const basis = freeViewBasis(this.freeView)
    this.camera.setPose(this.camera.position, basis.forward, basis.up)
  }

  private clampOrbit(): void {
    const minimumRadius = this.planetRadiusKm + MINIMUM_CAMERA_ALTITUDE_KM
    const maximumRadius = this.planetRadiusKm + 100_000
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

  private resetInput(): void {
    this.pressedKeys.clear()
    this.orbitDragging = false
    this.localVelocityKmPerSecond = [0, 0, 0]
    this.pendingFreeLookRotationRadians = [0, 0, 0]
    this.actualSpeedKmPerSecond = 0
  }

  private hasKeyboardFocus(): boolean {
    return (
      this.manualInputEnabled &&
      (
        document.pointerLockElement === this.canvas ||
        document.activeElement === this.canvas
      )
    )
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.manualInputEnabled) {
      return
    }

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

    if (
      !this.manualInputEnabled ||
      this.mode !== 'free' ||
      document.pointerLockElement !== this.canvas
    ) {
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
        camera: {
          position: [...this.camera.position],
          forward: this.camera.forward,
          right: this.camera.right,
          up: this.camera.up,
        },
      })
      return
    }

    this.pendingFreeLookRotationRadians = add(
      this.pendingFreeLookRotationRadians,
      [
        -event.movementY * sensitivity,
        0,
        -event.movementX * sensitivity,
      ],
    )
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (
      !this.manualInputEnabled ||
      this.mode !== 'orbit' ||
      !this.orbitDragging
    ) {
      return
    }

    const sensitivity = 0.0025
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
    if (!this.manualInputEnabled) {
      return
    }

    event.preventDefault()

    if (this.mode === 'free') {
      this.adjustSpeedExponent(-Math.sign(event.deltaY) * 0.25)
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
      event.code.startsWith('Control') ||
      event.code === 'Space'
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
