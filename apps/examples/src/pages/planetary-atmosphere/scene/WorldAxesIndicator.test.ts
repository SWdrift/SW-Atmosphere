import { assert, test } from 'vitest'
import { PlanetCamera } from '../camera/PlanetCamera.ts'
import { close } from '../test/assertions.ts'
import { projectWorldAxes } from './WorldAxesIndicator.ts'

test('XYZ 指示器保留轴线朝向视线时的透视缩短量', () => {
  const camera = new PlanetCamera(
    [0, 0, 0],
    [1, 1, 0],
    [0, 0, 1],
    60,
  )
  const axes = projectWorldAxes(camera)
  const xAxis = axes.find((axis) => axis.label === 'X')
  const yAxis = axes.find((axis) => axis.label === 'Y')
  const zAxis = axes.find((axis) => axis.label === 'Z')

  assert.ok(xAxis)
  assert.ok(yAxis)
  assert.ok(zAxis)
  close(Math.hypot(xAxis.screenX, xAxis.screenY), Math.SQRT1_2)
  close(Math.hypot(yAxis.screenX, yAxis.screenY), Math.SQRT1_2)
  close(Math.hypot(zAxis.screenX, zAxis.screenY), 1)
  close(xAxis.depth, Math.SQRT1_2)
  close(yAxis.depth, Math.SQRT1_2)
})
