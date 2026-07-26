import type { PlanetCamera } from '../camera/PlanetCamera.ts'
import { dot } from '../math/vector3.ts'

const GLOBAL_AXES = [
  { label: 'X', direction: [1, 0, 0] as const, color: '#e24a4a' },
  { label: 'Y', direction: [0, 1, 0] as const, color: '#42b65f' },
  { label: 'Z', direction: [0, 0, 1] as const, color: '#4b86f7' },
] as const

export interface ProjectedWorldAxis {
  label: 'X' | 'Y' | 'Z'
  color: string
  screenX: number
  screenY: number
  depth: number
}

export function projectWorldAxes(
  camera: PlanetCamera,
): ProjectedWorldAxis[] {
  return GLOBAL_AXES.map((axis) => ({
    label: axis.label,
    color: axis.color,
    screenX: dot(axis.direction, camera.right),
    screenY: -dot(axis.direction, camera.up),
    depth: dot(axis.direction, camera.forward),
  })).sort((a, b) => a.depth - b.depth)
}

export function drawWorldAxesIndicator(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  camera: PlanetCamera,
): void {
  const radius = 25

  context.save()
  context.fillStyle = 'rgba(0, 0, 0, 0.62)'
  context.beginPath()
  context.arc(centerX, centerY, 34, 0, Math.PI * 2)
  context.fill()
  context.font = '11px ui-monospace, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  for (const axis of projectWorldAxes(camera)) {
    const endX = centerX + axis.screenX * radius
    const endY = centerY + axis.screenY * radius
    const screenLength = Math.hypot(axis.screenX, axis.screenY)

    context.strokeStyle = axis.color
    context.fillStyle = axis.color
    context.lineWidth = axis.depth >= 0 ? 2 : 1
    context.globalAlpha = axis.depth >= 0 ? 1 : 0.42

    if (screenLength <= 1e-6) {
      context.beginPath()
      context.arc(centerX, centerY, axis.depth >= 0 ? 3 : 2, 0, Math.PI * 2)
      context.fill()
      continue
    }

    context.beginPath()
    context.moveTo(centerX, centerY)
    context.lineTo(endX, endY)
    context.stroke()
    context.fillText(axis.label, endX, endY)
  }

  context.globalAlpha = 1
  context.fillStyle = 'rgba(255, 255, 255, 0.7)'
  context.font = '9px system-ui, sans-serif'
  context.fillText('WORLD', centerX, centerY + 25)
  context.restore()
}
