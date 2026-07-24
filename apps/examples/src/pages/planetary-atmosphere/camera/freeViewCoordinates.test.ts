import { assert, test } from 'vitest'
import { CAMERA_PITCH_LIMIT_RADIANS } from '../math/coordinates.ts'
import { dot } from '../math/vector3.ts'
import { close } from '../test/assertions.ts'
import {
  freeViewBasis,
  rollFreeBody,
  rotateFreeView,
  type FreeView,
} from './freeViewCoordinates.ts'

test('Body 偏转前后鼠标观察规律一致', () => {
  const levelView: FreeView = {
    bodyOrientation: [0, 0, 0, 1],
    yawRadians: 0.4,
    pitchRadians: 0.2,
  }
  const rolledView = rollFreeBody(levelView, Math.PI / 3)
  const input: [number, number, number] = [0.03, 0, -0.02]
  const levelRotated = rotateFreeView(levelView, input)
  const rollRotated = rotateFreeView(rolledView, input)

  close(levelRotated.yawRadians, rollRotated.yawRadians)
  close(levelRotated.pitchRadians, rollRotated.pitchRadians)
  assert.deepEqual(levelRotated.bodyOrientation, levelView.bodyOrientation)
  assert.deepEqual(rollRotated.bodyOrientation, rolledView.bodyOrientation)
})

test('相反观察与 Body 偏转输入均闭合完整姿态', () => {
  const view: FreeView = {
    bodyOrientation: [0, 0, 0, 1],
    yawRadians: 0.3,
    pitchRadians: 0.2,
  }
  const firstBasis = freeViewBasis(view)
  const moved = rotateFreeView(view, [0.04, 0, -0.07])
  const lookClosed = rotateFreeView(moved, [-0.04, 0, 0.07])
  const beforeRollBasis = freeViewBasis(lookClosed)
  const rolled = rollFreeBody(lookClosed, 0.6)
  const rolledBasis = freeViewBasis(rolled)
  const closed = rollFreeBody(rolled, -0.6)
  const closedBasis = freeViewBasis(closed)

  close(dot(beforeRollBasis.forward, rolledBasis.forward), 1)
  close(dot(beforeRollBasis.up, rolledBasis.up), Math.cos(0.6))
  close(dot(firstBasis.forward, closedBasis.forward), 1)
  close(dot(firstBasis.right, closedBasis.right), 1)
  close(dot(firstBasis.up, closedBasis.up), 1)
  close(closed.yawRadians, view.yawRadians)
  close(closed.pitchRadians, view.pitchRadians)
})

test('Body 偏转后 pitch 仍相对局部天顶限制', () => {
  const levelView: FreeView = {
    bodyOrientation: [0, 0, 0, 1],
    yawRadians: 0,
    pitchRadians: CAMERA_PITCH_LIMIT_RADIANS,
  }
  const view = rollFreeBody(levelView, Math.PI / 4)
  const blockedPitch = rotateFreeView(view, [0.02, 0, 0])
  const freeYaw = rotateFreeView(view, [0, 0, -0.02])

  close(blockedPitch.pitchRadians, view.pitchRadians)
  close(blockedPitch.yawRadians, view.yawRadians)
  close(freeYaw.pitchRadians, view.pitchRadians)
  close(freeYaw.yawRadians, 0.02)
  assert.deepEqual(freeYaw.bodyOrientation, view.bodyOrientation)
})
