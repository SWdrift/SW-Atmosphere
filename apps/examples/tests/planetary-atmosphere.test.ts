import assert from 'node:assert/strict'
import test from 'node:test'
import { EARTH_STAGE_ONE } from '../src/pages/planetary-atmosphere/atmosphere/AtmosphereParameters.ts'
import { automaticSpeedKmPerSecond } from '../src/pages/planetary-atmosphere/camera/CameraController.ts'
import { PlanetCamera } from '../src/pages/planetary-atmosphere/camera/PlanetCamera.ts'
import {
  orbitAnglesFromRadial,
  orbitRadialFromAngles,
  rotateOrbitAngles,
} from '../src/pages/planetary-atmosphere/camera/orbitCoordinates.ts'
import {
  altitudeFromPosition,
  CAMERA_PITCH_LIMIT_RADIANS,
  cameraRayDirection,
  INITIAL_CAMERA_RADIAL,
  sunDirectionFromAngles,
  zUpForwardFromAngles,
  zUpViewAnglesFromForward,
} from '../src/pages/planetary-atmosphere/math/coordinates.ts'
import { intersectRaySphere } from '../src/pages/planetary-atmosphere/math/raySphere.ts'
import {
  isUnitQuaternion,
  quaternionFromAxisAngle,
  rotateVectorByQuaternion,
} from '../src/pages/planetary-atmosphere/math/quaternion.ts'
import { dot, isFiniteVector, length } from '../src/pages/planetary-atmosphere/math/vector3.ts'
import {
  projectWorldDirectionToNdc,
  projectWorldPointToNdc,
} from '../src/pages/planetary-atmosphere/ui/DebugOverlay.ts'

const EPSILON = 1e-9

function close(actual: number, expected: number, epsilon = EPSILON): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `期望 ${actual} 与 ${expected} 的差不超过 ${epsilon}`,
  )
}

test('ray-sphere：覆盖未命中、普通命中、球内、背离和相切', () => {
  assert.equal(intersectRaySphere([0, 0, 0], [1, 0, 0], [0, 0, 5], 1), null)

  const outside = intersectRaySphere([0, 0, 0], [0, 0, 1], [0, 0, 5], 1)
  assert.ok(outside)
  close(outside.near, 4)
  close(outside.far, 6)

  const inside = intersectRaySphere([0, 0, 0], [0, 0, 2], [0, 0, 0], 1)
  assert.ok(inside)
  close(inside.near, -0.5)
  close(inside.far, 0.5)

  const behind = intersectRaySphere([0, 0, 0], [0, 0, 1], [0, 0, -5], 1)
  assert.ok(behind)
  assert.ok(behind.far < 0)

  const tangent = intersectRaySphere([1, 0, -5], [0, 0, 1], [0, 0, 0], 1)
  assert.ok(tangent)
  close(tangent.near, 5)
  close(tangent.far, 5)
})

test('camera ray：中心射线等于 forward，边缘射线保持归一化和正确方向', () => {
  const center = cameraRayDirection(
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
    16 / 9,
    0,
    0,
  )
  assert.deepEqual(center, [0, 1, 0])

  const upperRight = cameraRayDirection(
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    60,
    16 / 9,
    1,
    1,
  )
  close(length(upperRight), 1)
  assert.ok(upperRight[0] > 0)
  assert.ok(upperRight[1] > 0)
  assert.ok(upperRight[2] > 0)
})

test('坐标：高度、太阳方位和太阳高度角使用同一右手系', () => {
  close(altitudeFromPosition([0, 0, 6361.5], 6360), 1.5)

  const northHorizon = sunDirectionFromAngles(0, 0)
  assert.deepEqual(northHorizon, [0, 1, 0])

  const zenith = sunDirectionFromAngles(0, 90)
  close(dot(zenith, [0, 0, 1]), 1)

  const view = zUpViewAnglesFromForward([1, 0, 0], 0)
  close(view.yawRadians, Math.PI / 2)
  const reconstructed = zUpForwardFromAngles(view)
  close(reconstructed[0], 1)
  close(reconstructed[1], 0)
  close(reconstructed[2], 0)
})

test('跨尺度速度：近地可精细移动，太空受明确上限约束', () => {
  close(automaticSpeedKmPerSecond(-10), 0.005)
  close(automaticSpeedKmPerSecond(1.5), 0.075)
  close(automaticSpeedKmPerSecond(100), 5)
  close(automaticSpeedKmPerSecond(100_000), 2_000)
  assert.throws(() => automaticSpeedKmPerSecond(Number.NaN))
})

test('PlanetCamera：Z-up 旋转无 roll、保持正交且移动不能穿地', () => {
  const minimumRadius =
    EARTH_STAGE_ONE.planetRadiusKm + EARTH_STAGE_ONE.minimumCameraAltitudeKm
  const camera = new PlanetCamera(
    [0, 0, EARTH_STAGE_ONE.planetRadiusKm + 1],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )

  camera.setZUpView({
    yawRadians: 0.4,
    pitchRadians: (80 * Math.PI) / 180,
  })
  close(length(camera.forward), 1)
  close(length(camera.right), 1)
  close(length(camera.up), 1)
  close(dot(camera.forward, camera.right), 0, 1e-8)
  close(dot(camera.right, [0, 0, 1]), 0, 1e-8)
  assert.ok(
    Math.abs(dot(camera.forward, [0, 0, 1])) <=
      Math.sin((89 * Math.PI) / 180) + 1e-9,
  )
  assert.ok(isFiniteVector(camera.forward))
  assert.throws(() =>
    camera.setZUpView({ yawRadians: 0, pitchRadians: Math.PI / 2 }),
  )

  const forwardBeforeMove = camera.forward
  const upBeforeMove = camera.up

  camera.move(
    [0, 0, -100],
    EARTH_STAGE_ONE.planetRadiusKm,
    EARTH_STAGE_ONE.minimumCameraAltitudeKm,
  )
  close(length(camera.position), minimumRadius, 1e-8)
  assert.ok(isFiniteVector(camera.position))
  assert.ok(isFiniteVector(camera.forward))
  assert.deepEqual(camera.forward, forwardBeforeMove)
  assert.deepEqual(camera.up, upBeforeMove)
})

test('PlanetCamera：高速移动不能穿过行星，接触后保留切向移动', () => {
  const minimumRadius =
    EARTH_STAGE_ONE.planetRadiusKm + EARTH_STAGE_ONE.minimumCameraAltitudeKm
  const camera = new PlanetCamera(
    [minimumRadius + 1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    60,
  )

  camera.move(
    [-minimumRadius * 3, 10, 0],
    EARTH_STAGE_ONE.planetRadiusKm,
    EARTH_STAGE_ONE.minimumCameraAltitudeKm,
  )

  assert.ok(length(camera.position) >= minimumRadius - 1e-8)
  assert.ok(camera.position[1] > 0)
  assert.ok(camera.position[0] > 0)
})

test('PlanetCamera：正视球心时仍能构造稳定的 right/up', () => {
  const radius = EARTH_STAGE_ONE.planetRadiusKm + 400
  const camera = new PlanetCamera(
    [0, 0, radius],
    [0, 0, -1],
    [0, 1, 0],
    60,
  )

  close(length(camera.right), 1)
  close(length(camera.up), 1)
  close(dot(camera.forward, camera.right), 0)
  close(dot(camera.forward, camera.up), 0)
  assert.ok(isFiniteVector(camera.right))
  assert.ok(isFiniteVector(camera.up))
})

test('Z-up 视角：偏航跨越 ±180° 时方向连续', () => {
  const beforeWrap = zUpForwardFromAngles({
    yawRadians: (179.9 * Math.PI) / 180,
    pitchRadians: 0.3,
  })
  const afterWrap = zUpForwardFromAngles({
    yawRadians: (-179.9 * Math.PI) / 180,
    pitchRadians: 0.3,
  })

  assert.ok(dot(beforeWrap, afterWrap) > 0.99999)
})

test('四元数旋转：跨越极点不退化并保持单位长度', () => {
  const quarterTurn = quaternionFromAxisAngle([1, 0, 0], Math.PI / 2)
  const rotated = rotateVectorByQuaternion([0, 0, 1], quarterTurn)

  assert.ok(isUnitQuaternion(quarterTurn))
  close(rotated[0], 0)
  close(rotated[1], -1)
  close(rotated[2], 0)
  close(length(rotated), 1)
})

test('Orbit：turntable 在极点前停止，方位角仍连续', () => {
  let angles = orbitAnglesFromRadial(INITIAL_CAMERA_RADIAL)

  for (let index = 0; index < 720; index += 1) {
    angles = rotateOrbitAngles(angles, Math.PI / 180, Math.PI / 120)
  }

  const radial = orbitRadialFromAngles(angles)
  close(length(radial), 1, 1e-8)
  close(angles.elevationRadians, CAMERA_PITCH_LIMIT_RADIANS)
  assert.ok(isFiniteVector(radial))
})

test('自由摄像机：局部 forward 经四元数转换后在全局坐标中移动', () => {
  const camera = new PlanetCamera([0, 0, 7000], [0, 1, 0], [0, 0, 1], 60)

  camera.setZUpView({
    yawRadians: Math.PI / 2,
    pitchRadians: Math.PI / 5,
  })

  const positionBeforeMove = camera.position
  const globalForward = camera.forward
  camera.move(globalForward, EARTH_STAGE_ONE.planetRadiusKm, 0.01)

  close(camera.position[0] - positionBeforeMove[0], globalForward[0])
  close(camera.position[1] - positionBeforeMove[1], globalForward[1])
  close(camera.position[2] - positionBeforeMove[2], globalForward[2])
  close(length(camera.forward), 1)
  close(dot(camera.forward, camera.right), 0)
  close(dot(camera.forward, camera.up), 0)
})

test('调试 overlay 投影：使用全局点并正确剔除相机后方', () => {
  const camera = new PlanetCamera([0, 0, 10], [0, 1, 0], [0, 0, 1], 60)
  const center = projectWorldPointToNdc([0, 10, 10], camera, 16 / 9)
  const right = projectWorldPointToNdc([1, 10, 10], camera, 16 / 9)
  const behind = projectWorldPointToNdc([0, -10, 10], camera, 16 / 9)

  assert.ok(center)
  assert.ok(right)
  close(center.x, 0)
  close(center.y, 0)
  assert.ok(right.x > 0)
  assert.equal(behind, null)
})

test('天空经纬网格投影：只依赖世界方向，不受相机位置影响', () => {
  const firstCamera = new PlanetCamera([0, 0, 10], [0, 1, 0], [0, 0, 1], 60)
  const secondCamera = new PlanetCamera(
    [10_000, -20_000, 30_000],
    [0, 1, 0],
    [0, 0, 1],
    60,
  )
  const firstProjection = projectWorldDirectionToNdc(
    [0, 1, 0],
    firstCamera,
    16 / 9,
  )
  const secondProjection = projectWorldDirectionToNdc(
    [0, 1, 0],
    secondCamera,
    16 / 9,
  )

  assert.ok(firstProjection)
  assert.ok(secondProjection)
  close(firstProjection.x, 0)
  close(firstProjection.y, 0)
  close(secondProjection.x, firstProjection.x)
  close(secondProjection.y, firstProjection.y)
  assert.equal(
    projectWorldDirectionToNdc([0, -1, 0], firstCamera, 16 / 9),
    null,
  )
})

test('极端输入：非法射线和 FOV fail fast', () => {
  assert.throws(() => intersectRaySphere([0, 0, 0], [0, 0, 0], [0, 0, 0], 1))
  assert.throws(() => intersectRaySphere([0, 0, 0], [1, 0, 0], [0, 0, 0], 0))
  assert.throws(() =>
    cameraRayDirection([0, 1, 0], [1, 0, 0], [0, 0, 1], 0, 1, 0, 0),
  )
})
