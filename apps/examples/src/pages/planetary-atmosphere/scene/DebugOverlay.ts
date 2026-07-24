import type { PlanetCamera } from '../camera/PlanetCamera.ts'
import {
  add,
  dot,
  scale,
  subtract,
  type Vec3,
} from '../math/vector3.ts'
import type { DebugGridPlane } from '../model/atmosphereState.ts'

interface CameraPoint {
  x: number
  y: number
  depth: number
}

export interface ProjectedPoint {
  x: number
  y: number
  depth: number
}

const GLOBAL_AXES = [
  { label: 'X', direction: [1, 0, 0] as const, color: '#d73333' },
  { label: 'Y', direction: [0, 1, 0] as const, color: '#2a9d45' },
  { label: 'Z', direction: [0, 0, 1] as const, color: '#367bf5' },
] as const

function toCameraPoint(worldPoint: Vec3, camera: PlanetCamera): CameraPoint {
  const relative = subtract(worldPoint, camera.position)

  return {
    x: dot(relative, camera.right),
    y: dot(relative, camera.up),
    depth: dot(relative, camera.forward),
  }
}

export function projectWorldPointToNdc(
  worldPoint: Vec3,
  camera: PlanetCamera,
  aspect: number,
): ProjectedPoint | null {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error('调试投影宽高比必须是有限正数。')
  }

  const point = toCameraPoint(worldPoint, camera)

  if (point.depth <= 1e-3) {
    return null
  }

  const tangentHalfFov = Math.tan((camera.verticalFovDegrees * Math.PI) / 360)

  return {
    x: point.x / (point.depth * tangentHalfFov * aspect),
    y: point.y / (point.depth * tangentHalfFov),
    depth: point.depth,
  }
}

export function projectWorldDirectionToNdc(
  worldDirection: Vec3,
  camera: PlanetCamera,
  aspect: number,
): ProjectedPoint | null {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error('调试投影宽高比必须是有限正数。')
  }

  const point: CameraPoint = {
    x: dot(worldDirection, camera.right),
    y: dot(worldDirection, camera.up),
    depth: dot(worldDirection, camera.forward),
  }

  if (point.depth <= 1e-3) {
    return null
  }

  const tangentHalfFov = Math.tan((camera.verticalFovDegrees * Math.PI) / 360)

  return {
    x: point.x / (point.depth * tangentHalfFov * aspect),
    y: point.y / (point.depth * tangentHalfFov),
    depth: point.depth,
  }
}

export class DebugOverlay {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly gridExtentKm: number
  private readonly gridSpacingKm = 1_000
  private cssWidth = 0
  private cssHeight = 0

  constructor(canvas: HTMLCanvasElement, gridExtentKm: number) {
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('无法获取调试 overlay 的 2D canvas 上下文。')
    }

    this.canvas = canvas
    this.context = context
    this.gridExtentKm = gridExtentKm
  }

  render(
    camera: PlanetCamera,
    plane: DebugGridPlane,
    worldGridVisible: boolean,
    skyGridVisible: boolean,
  ): void {
    this.resize()
    this.context.clearRect(0, 0, this.cssWidth, this.cssHeight)

    if (
      (!worldGridVisible && !skyGridVisible) ||
      this.cssWidth === 0 ||
      this.cssHeight === 0
    ) {
      return
    }

    if (skyGridVisible) {
      this.drawSkyGrid(camera)
    }

    if (worldGridVisible) {
      this.drawGrid(camera, plane)
    }

    this.drawOrientationGizmo(camera)
  }

  clear(): void {
    this.context.clearRect(0, 0, this.cssWidth, this.cssHeight)
  }

  private resize(): void {
    const cssWidth = this.canvas.clientWidth
    const cssHeight = this.canvas.clientHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr))
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr))

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    this.cssWidth = cssWidth
    this.cssHeight = cssHeight
  }

  private drawGrid(camera: PlanetCamera, plane: DebugGridPlane): void {
    const { firstAxis, secondAxis } = this.planeAxes(plane)
    const lineCount = Math.floor(this.gridExtentKm / this.gridSpacingKm)

    this.context.lineWidth = 1
    this.context.strokeStyle = 'rgba(255, 255, 255, 0.16)'

    for (let index = -lineCount; index <= lineCount; index += 1) {
      const offset = index * this.gridSpacingKm

      this.drawWorldSegment(
        add(
          scale(firstAxis, -this.gridExtentKm),
          scale(secondAxis, offset),
        ),
        add(
          scale(firstAxis, this.gridExtentKm),
          scale(secondAxis, offset),
        ),
        camera,
      )
      this.drawWorldSegment(
        add(
          scale(secondAxis, -this.gridExtentKm),
          scale(firstAxis, offset),
        ),
        add(
          scale(secondAxis, this.gridExtentKm),
          scale(firstAxis, offset),
        ),
        camera,
      )
    }

    this.context.lineWidth = 2

    for (const axis of GLOBAL_AXES) {
      this.context.strokeStyle = axis.color
      this.drawWorldSegment(
        scale(axis.direction, -this.gridExtentKm),
        scale(axis.direction, this.gridExtentKm),
        camera,
      )
    }
  }

  private drawSkyGrid(camera: PlanetCamera): void {
    this.context.save()
    this.context.lineWidth = 1

    for (let latitudeDegrees = -75; latitudeDegrees <= 75; latitudeDegrees += 15) {
      this.context.strokeStyle =
        latitudeDegrees === 0
          ? 'rgba(70, 210, 220, 0.7)'
          : 'rgba(70, 210, 220, 0.28)'
      this.drawSkyLatitude(camera, latitudeDegrees)
    }

    for (
      let longitudeDegrees = -180;
      longitudeDegrees < 180;
      longitudeDegrees += 30
    ) {
      this.context.strokeStyle =
        longitudeDegrees === 0
          ? 'rgba(245, 190, 65, 0.75)'
          : 'rgba(245, 190, 65, 0.28)'
      this.drawSkyLongitude(camera, longitudeDegrees)
    }

    this.context.restore()
  }

  private drawSkyLatitude(camera: PlanetCamera, latitudeDegrees: number): void {
    const latitudeRadians = (latitudeDegrees * Math.PI) / 180
    const latitudeCosine = Math.cos(latitudeRadians)
    const latitudeSine = Math.sin(latitudeRadians)

    this.context.beginPath()
    let drawing = false

    for (let longitudeDegrees = -180; longitudeDegrees <= 180; longitudeDegrees += 3) {
      const longitudeRadians = (longitudeDegrees * Math.PI) / 180
      const direction: Vec3 = [
        Math.sin(longitudeRadians) * latitudeCosine,
        Math.cos(longitudeRadians) * latitudeCosine,
        latitudeSine,
      ]
      drawing = this.appendSkyDirection(direction, camera, drawing)
    }

    this.context.stroke()
  }

  private drawSkyLongitude(camera: PlanetCamera, longitudeDegrees: number): void {
    const longitudeRadians = (longitudeDegrees * Math.PI) / 180
    const longitudeSine = Math.sin(longitudeRadians)
    const longitudeCosine = Math.cos(longitudeRadians)

    this.context.beginPath()
    let drawing = false

    for (let latitudeDegrees = -90; latitudeDegrees <= 90; latitudeDegrees += 3) {
      const latitudeRadians = (latitudeDegrees * Math.PI) / 180
      const latitudeCosine = Math.cos(latitudeRadians)
      const direction: Vec3 = [
        longitudeSine * latitudeCosine,
        longitudeCosine * latitudeCosine,
        Math.sin(latitudeRadians),
      ]
      drawing = this.appendSkyDirection(direction, camera, drawing)
    }

    this.context.stroke()
  }

  private appendSkyDirection(
    direction: Vec3,
    camera: PlanetCamera,
    drawing: boolean,
  ): boolean {
    const aspect = this.cssWidth / this.cssHeight
    const projected = projectWorldDirectionToNdc(direction, camera, aspect)

    if (
      !projected ||
      Math.abs(projected.x) > 4 ||
      Math.abs(projected.y) > 4
    ) {
      return false
    }

    const screenX = (projected.x * 0.5 + 0.5) * this.cssWidth
    const screenY = (0.5 - projected.y * 0.5) * this.cssHeight

    if (drawing) {
      this.context.lineTo(screenX, screenY)
    } else {
      this.context.moveTo(screenX, screenY)
    }

    return true
  }

  private drawWorldSegment(start: Vec3, end: Vec3, camera: PlanetCamera): void {
    let cameraStart = toCameraPoint(start, camera)
    let cameraEnd = toCameraPoint(end, camera)
    const nearKm = 1e-3

    if (cameraStart.depth <= nearKm && cameraEnd.depth <= nearKm) {
      return
    }

    if (cameraStart.depth <= nearKm || cameraEnd.depth <= nearKm) {
      const amount =
        (nearKm - cameraStart.depth) /
        (cameraEnd.depth - cameraStart.depth)
      const clippedPoint: CameraPoint = {
        x: cameraStart.x + (cameraEnd.x - cameraStart.x) * amount,
        y: cameraStart.y + (cameraEnd.y - cameraStart.y) * amount,
        depth: nearKm,
      }

      if (cameraStart.depth <= nearKm) {
        cameraStart = clippedPoint
      } else {
        cameraEnd = clippedPoint
      }
    }

    const startScreen = this.cameraPointToScreen(cameraStart, camera)
    const endScreen = this.cameraPointToScreen(cameraEnd, camera)

    if (
      !Number.isFinite(startScreen[0]) ||
      !Number.isFinite(startScreen[1]) ||
      !Number.isFinite(endScreen[0]) ||
      !Number.isFinite(endScreen[1])
    ) {
      return
    }

    this.context.beginPath()
    this.context.moveTo(startScreen[0], startScreen[1])
    this.context.lineTo(endScreen[0], endScreen[1])
    this.context.stroke()
  }

  private cameraPointToScreen(
    point: CameraPoint,
    camera: PlanetCamera,
  ): readonly [x: number, y: number] {
    const tangentHalfFov = Math.tan(
      (camera.verticalFovDegrees * Math.PI) / 360,
    )
    const aspect = this.cssWidth / this.cssHeight
    const normalizedX = point.x / (point.depth * tangentHalfFov * aspect)
    const normalizedY = point.y / (point.depth * tangentHalfFov)

    return [
      (normalizedX * 0.5 + 0.5) * this.cssWidth,
      (0.5 - normalizedY * 0.5) * this.cssHeight,
    ]
  }

  private drawOrientationGizmo(camera: PlanetCamera): void {
    const centerX = this.cssWidth - 48
    const centerY = 48
    const radius = 25

    this.context.save()
    this.context.fillStyle = 'rgba(0, 0, 0, 0.55)'
    this.context.beginPath()
    this.context.arc(centerX, centerY, 34, 0, Math.PI * 2)
    this.context.fill()
    this.context.font = '11px ui-monospace, monospace'
    this.context.textAlign = 'center'
    this.context.textBaseline = 'middle'

    const projectedAxes = GLOBAL_AXES.map((axis) => ({
      ...axis,
      screenX: dot(axis.direction, camera.right),
      screenY: -dot(axis.direction, camera.up),
      depth: dot(axis.direction, camera.forward),
    })).sort((a, b) => a.depth - b.depth)

    for (const axis of projectedAxes) {
      const screenLength = Math.hypot(axis.screenX, axis.screenY)

      if (screenLength <= 1e-6) {
        this.context.fillStyle = axis.color
        this.context.beginPath()
        this.context.arc(centerX, centerY, 3, 0, Math.PI * 2)
        this.context.fill()
        continue
      }

      const endX = centerX + (axis.screenX / screenLength) * radius
      const endY = centerY + (axis.screenY / screenLength) * radius

      this.context.strokeStyle = axis.color
      this.context.fillStyle = axis.color
      this.context.lineWidth = axis.depth >= 0 ? 2 : 1
      this.context.globalAlpha = axis.depth >= 0 ? 1 : 0.45
      this.context.beginPath()
      this.context.moveTo(centerX, centerY)
      this.context.lineTo(endX, endY)
      this.context.stroke()
      this.context.fillText(axis.label, endX, endY)
    }

    this.context.restore()
  }

  private planeAxes(plane: DebugGridPlane): {
    firstAxis: Vec3
    secondAxis: Vec3
  } {
    switch (plane) {
      case 'xy':
        return { firstAxis: [1, 0, 0], secondAxis: [0, 1, 0] }
      case 'xz':
        return { firstAxis: [1, 0, 0], secondAxis: [0, 0, 1] }
      case 'yz':
        return { firstAxis: [0, 1, 0], secondAxis: [0, 0, 1] }
    }
  }
}
