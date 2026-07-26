import type { BodyLookAngles } from '../camera/freeViewCoordinates.ts'

const RADIANS_TO_DEGREES = 180 / Math.PI

export function bodyElevationScreenOffset(
  elevationRadians: number,
  lookPitchRadians: number,
  scale: number,
): number {
  if (
    !Number.isFinite(elevationRadians) ||
    !Number.isFinite(lookPitchRadians) ||
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    throw new Error('Body 姿态仪要求有限角度和有限正比例。')
  }

  return -Math.tan(elevationRadians - lookPitchRadians) * scale
}

export function drawBodyAttitudeIndicator(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  look: BodyLookAngles | null,
): void {
  const outerRadius = 34
  const innerRadius = 29
  const pitchScale = 18

  context.save()
  context.fillStyle = 'rgba(0, 0, 0, 0.62)'
  context.beginPath()
  context.arc(centerX, centerY, outerRadius, 0, Math.PI * 2)
  context.fill()

  if (look === null) {
    context.fillStyle = 'rgba(255, 255, 255, 0.62)'
    context.font = '9px ui-monospace, monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('ORBIT', centerX, centerY - 4)
    context.fillText('NO BODY', centerX, centerY + 8)
    context.restore()
    return
  }

  context.save()
  context.beginPath()
  context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
  context.clip()

  const horizonY =
    centerY + bodyElevationScreenOffset(0, look.pitchRadians, pitchScale)
  const clampedHorizonY = Math.max(
    centerY - innerRadius,
    Math.min(centerY + innerRadius, horizonY),
  )
  context.fillStyle = 'rgba(62, 126, 174, 0.55)'
  context.fillRect(
    centerX - innerRadius,
    centerY - innerRadius,
    innerRadius * 2,
    clampedHorizonY - (centerY - innerRadius),
  )
  context.fillStyle = 'rgba(143, 96, 54, 0.55)'
  context.fillRect(
    centerX - innerRadius,
    clampedHorizonY,
    innerRadius * 2,
    centerY + innerRadius - clampedHorizonY,
  )

  context.strokeStyle = 'rgba(255, 255, 255, 0.78)'
  context.fillStyle = 'rgba(255, 255, 255, 0.78)'
  context.lineWidth = 1
  context.font = '8px ui-monospace, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  for (let elevationDegrees = -60; elevationDegrees <= 60; elevationDegrees += 15) {
    const elevationRadians = (elevationDegrees * Math.PI) / 180
    const offsetY = bodyElevationScreenOffset(
      elevationRadians,
      look.pitchRadians,
      pitchScale,
    )

    if (Math.abs(offsetY) > innerRadius) {
      continue
    }

    const halfWidth = elevationDegrees === 0 ? 24 : 9
    const y = centerY + offsetY
    context.beginPath()
    context.moveTo(centerX - halfWidth, y)
    context.lineTo(centerX + halfWidth, y)
    context.stroke()

    if (elevationDegrees !== 0) {
      context.fillText(
        String(Math.abs(elevationDegrees)),
        centerX + halfWidth + 5,
        y,
      )
    }
  }
  context.restore()

  context.strokeStyle = '#f0c54d'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(centerX - 12, centerY)
  context.lineTo(centerX - 4, centerY)
  context.lineTo(centerX, centerY + 3)
  context.lineTo(centerX + 4, centerY)
  context.lineTo(centerX + 12, centerY)
  context.stroke()

  const yawDegrees = look.yawRadians * RADIANS_TO_DEGREES
  const pitchDegrees = look.pitchRadians * RADIANS_TO_DEGREES
  context.fillStyle = 'rgba(255, 255, 255, 0.78)'
  context.font = '9px ui-monospace, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(
    `Y${yawDegrees >= 0 ? '+' : ''}${yawDegrees.toFixed(0)} P${
      pitchDegrees >= 0 ? '+' : ''
    }${pitchDegrees.toFixed(0)}`,
    centerX,
    centerY + 25,
  )
  context.restore()
}
