import { createPinia, setActivePinia } from 'pinia'
import {
  assert,
  beforeEach,
  expect,
  test,
} from 'vitest'
import {
  cloneAtmosphereControls,
  createEarthControls,
} from '../model/atmosphereState.ts'
import { useAtmosphereStore } from '../model/atmosphereStore.ts'
import {
  createValidationControls,
  type ValidationCaseGroup,
  VALIDATION_CASE_CATEGORIES,
  VALIDATION_CASES,
  validationCaseById,
  validationCasePath,
} from '../model/validationCases.ts'
import {
  executeWorkbenchPath,
  type WorkbenchPathClock,
  type WorkbenchPathPort,
} from '../model/workbenchPath.ts'
import { atmospherePanelIdFromPath } from '../panelRoutes.ts'
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
import {
  cameraPresetPose,
  horizonDipRadians,
} from '../camera/cameraPresets.ts'
import { evaluateCelestialScenario } from '../celestial/CelestialSystem.ts'
import {
  add,
  cross,
  dot,
  length,
  normalize,
  scale,
  subtract,
  type Vec3,
} from '../math/vector3.ts'
import { close } from './assertions.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

function sunDirectionForControls(
  controls: ReturnType<typeof createEarthControls>,
): Vec3 {
  const snapshot = evaluateCelestialScenario(
    controls.celestial.scenario,
    controls.celestial.simulationTimeSeconds,
  )

  return normalize(subtract(
    snapshot.sun.systemPositionKm,
    snapshot.earth.systemPositionKm,
  ))
}

function moonIlluminatedFraction(
  validationCaseId: string,
): number {
  const validationCase = validationCaseById(validationCaseId)
  const controls = createValidationControls(
    validationCase,
  )
  const snapshot = evaluateCelestialScenario(
    controls.celestial.scenario,
    controls.celestial.simulationTimeSeconds,
  )
  const pose = validationCase.cameraPose
  const moonToSun = normalize(subtract(
    snapshot.sun.systemPositionKm,
    snapshot.moon.systemPositionKm,
  ))
  const moonToObserver = normalize(subtract(
    add(snapshot.earth.systemPositionKm, pose.position),
    snapshot.moon.systemPositionKm,
  ))

  return (1 + dot(moonToSun, moonToObserver)) / 2
}

test('初始状态使用 1.5 m 可见地平线姿态和确定性天体场景', () => {
  const controls = createEarthControls()
  const pose = cameraPresetPose(
    'surface',
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  const sunDirection = sunDirectionForControls(controls)
  const localUp = normalize(pose.position)
  const localSunElevationDegrees =
    (Math.asin(dot(sunDirection, localUp)) * 180) / Math.PI

  close(
    length(pose.position) - EARTH_ATMOSPHERE.bottomRadiusKm,
    0.0015,
    1e-10,
  )
  close(
    length(cross(pose.position, pose.forward)),
    EARTH_ATMOSPHERE.bottomRadiusKm,
    1e-8,
  )
  assert.ok(Number.isFinite(localSunElevationDegrees))
  assert.equal(controls.celestial.paused, true)
})

test('Store 是默认值、质量约束和速度指数的唯一真相', () => {
  const store = useAtmosphereStore()
  const spaceLimb =
    validationCaseById('space-limb-day-side')

  store.adjustSpeedExponent(100)
  assert.equal(store.controls.camera.speedExponent, 6)

  store.setQuality('reference')
  assert.equal(store.controls.rendering.quality, 'reference')
  assert.equal(store.controls.rendering.multipleScattering, false)
  assert.throws(() => store.setQuality('unknown'))

  store.replaceControls(createValidationControls(spaceLimb))
  assert.equal(store.controls.camera.verticalFovDegrees, 40)
  assert.equal(store.controls.rendering.quality, 'high')

  store.restoreEarthControls()
  assert.equal(store.controls.camera.speedExponent, 0)
  assert.equal(store.controls.camera.verticalFovDegrees, 60)
  assert.equal(store.controls.rendering.quality, 'medium')
})

test('控制状态可复制 Pinia Proxy 且不共享嵌套对象', () => {
  const store = useAtmosphereStore()
  const cloned = cloneAtmosphereControls(store.controls)

  cloned.camera.verticalFovDegrees = 20
  cloned.rendering.debugView = 'aerial-radiance'

  assert.equal(store.controls.camera.verticalFovDegrees, 60)
  assert.equal(store.controls.rendering.debugView, 'final')
  assert.notEqual(cloned.camera, store.controls.camera)
  assert.notEqual(cloned.rendering, store.controls.rendering)
})

test('验证用例具有稳定 URL、完整基线和未知 ID 语义', () => {
  const spaceLimb =
    validationCaseById('space-limb-day-side')
  const planetaryNightSide =
    validationCaseById('planetary-night-side')
  const controls = createValidationControls(spaceLimb)

  assert.equal(
    validationCasePath(spaceLimb.id),
    '/planetary-atmosphere/presets/space-limb-day-side',
  )
  assert.equal(
    atmospherePanelIdFromPath(validationCasePath(spaceLimb.id)),
    'presets',
  )
  assert.equal(
    validationCasePath(planetaryNightSide.id),
    '/planetary-atmosphere/presets/planetary-night-side',
  )
  assert.equal(controls.camera.mode, 'free')
  assert.equal(controls.camera.verticalFovDegrees, 40)
  assert.equal(controls.rendering.debugView, 'final')
  assert.equal(controls.debug.grid, false)
  assert.equal(controls.debug.axesIndicator, true)
  assert.equal(controls.debug.attitudeIndicator, true)
  for (const retiredId of [
    'planetary-day',
    'space-limb',
    'space-limb-terminator',
    'narrow-sunrise',
    'narrow-sunrise-10',
    'narrow-sunrise-20',
    'ground-terminator',
  ]) {
    assert.throws(() => validationCaseById(retiredId))
  }
  assert.throws(() => validationCaseById('unknown'))
  assert.throws(() =>
    atmospherePanelIdFromPath('/planetary-atmosphere/unknown'),
  )
})

test('工作台状态形成单向生命周期', () => {
  const store = useAtmosphereStore()

  store.requestValidationCase('space-limb-day-side')
  assert.equal(store.workbench.phase, 'pending')
  store.beginValidationCaseActivation('space-limb-day-side')
  store.completeValidationCaseActivation('space-limb-day-side')
  assert.equal(store.workbench.phase, 'active')
  assert.equal(store.workbench.referenceVisible, false)
  assert.equal(store.workbench.referenceMix, 0.5)

  store.setReferenceVisible(true)
  store.setReferenceMix(0.35)

  store.beginWorkbenchPath('space-limb-rise')
  store.addWorkbenchCheckpoint('start')
  assert.deepEqual(store.workbench.checkpoints, ['start'])
  store.finishWorkbenchPath()
  assert.equal(store.workbench.phase, 'active')

  store.deactivateValidationCase()
  assert.equal(store.workbench.phase, 'idle')
  assert.equal(store.workbench.activeCaseId, null)
  assert.equal(store.workbench.referenceVisible, true)
  assert.equal(store.workbench.referenceMix, 0.35)
})

test('动作路径按声明顺序执行并恢复人工输入', async () => {
  const validationCase = validationCaseById('space-limb-rise')
  assert.ok(validationCase.path)
  const calls: string[] = []
  const port: WorkbenchPathPort = {
    setControls: () => calls.push('controls'),
    setCameraPose: (pose) => {
      calls.push(`pose:${pose.position[1].toFixed(0)}`)
    },
    setManualInputEnabled: (enabled) => {
      calls.push(enabled ? 'manual:on' : 'manual:off')
    },
    checkpoint: (id) => calls.push(`checkpoint:${id}`),
  }
  const clock: WorkbenchPathClock = {
    async elapse(_duration, update, signal): Promise<void> {
      signal.throwIfAborted()
      update(0.5)
      update(1)
    },
  }

  await executeWorkbenchPath(
    validationCase.path,
    port,
    new AbortController().signal,
    clock,
  )

  assert.deepEqual(calls, [
    'manual:off',
    'pose:-6760',
    'controls',
    'checkpoint:space-limb-start',
    'pose:-6960',
    'pose:-7160',
    'checkpoint:space-limb-800-km',
    'manual:on',
  ])
})

test('limb 动作路径中点仍精确相切', async () => {
  const validationCase = validationCaseById('space-limb-rise')
  assert.ok(validationCase.path)
  const poses: Parameters<WorkbenchPathPort['setCameraPose']>[0][] = []
  const port: WorkbenchPathPort = {
    setControls: () => {},
    setCameraPose: (pose) => poses.push(pose),
    setManualInputEnabled: () => {},
    checkpoint: () => {},
  }
  const clock: WorkbenchPathClock = {
    async elapse(_duration, update, signal): Promise<void> {
      signal.throwIfAborted()
      update(0.5)
    },
  }

  await executeWorkbenchPath(
    validationCase.path,
    port,
    new AbortController().signal,
    clock,
  )

  const midpoint = poses.at(-1)
  assert.ok(midpoint)
  close(
    length(cross(midpoint.position, midpoint.forward)),
    EARTH_ATMOSPHERE.bottomRadiusKm,
    1e-8,
  )
  close(
    length(midpoint.position) - EARTH_ATMOSPHERE.bottomRadiusKm,
    600,
    1e-8,
  )
})

test('验证用例的当地太阳高度、相位与取景范围满足数值定义', () => {
  const localElevationCases = [
    ['ground-day-sunward', 35],
    ['ground-sun-plus-five', 5],
    ['ground-sun-zero', 0],
    ['ground-sun-minus-one', -1],
    ['ground-civil-twilight', -6],
    ['ground-nautical-twilight', -12],
    ['ground-astronomical-twilight', -18],
    ['high-altitude-day-narrow', 20],
    [
      'high-altitude-sunset-narrow',
      -horizonDipRadians(
        12,
        EARTH_ATMOSPHERE.bottomRadiusKm,
      ) * 180 / Math.PI,
    ],
    ['lunar-ground-terminator', 0],
    ['lunar-ground-night', -90],
  ] as const

  for (const [id, expectedElevationDegrees] of localElevationCases) {
    const validationCase = validationCaseById(id)
    const controls = createValidationControls(validationCase)
    const pose = validationCase.cameraPose
    const sunDirection = sunDirectionForControls(controls)
    const localElevationDegrees =
      (Math.asin(dot(sunDirection, normalize(pose.position))) * 180) /
      Math.PI

    close(
      localElevationDegrees,
      expectedElevationDegrees,
      Math.abs(expectedElevationDegrees) === 90 ? 1e-5 : 1e-10,
    )
  }

  const phaseCases = [
    ['planetary-night-side', 145, 25.75],
    ['planetary-terminator', 90, 24],
    ['planetary-crescent', 160, 24],
  ] as const

  for (const [
    id,
    expectedPhaseDegrees,
    expectedFovDegrees,
  ] of phaseCases) {
    const validationCase = validationCaseById(id)
    const controls = createValidationControls(validationCase)
    const pose = validationCase.cameraPose
    const sunDirection = sunDirectionForControls(controls)
    const phaseDegrees =
      (Math.acos(dot(sunDirection, normalize(pose.position))) * 180) /
      Math.PI

    close(phaseDegrees, expectedPhaseDegrees, 1e-10)
    assert.equal(
      controls.camera.verticalFovDegrees,
      expectedFovDegrees,
    )
  }

  for (const id of [
    'ground-horizon-sun-fov-5',
    'ground-horizon-sun-fov-10',
    'ground-horizon-sun-fov-20',
  ]) {
    const validationCase = validationCaseById(id)
    const controls = createValidationControls(validationCase)
    const pose = validationCase.cameraPose
    const sunDirection = sunDirectionForControls(controls)

    close(dot(sunDirection, pose.forward), 1, 1e-12)
  }

  {
    const validationCase =
      validationCaseById('space-limb-sunrise')
    const controls = createValidationControls(validationCase)
    const sunDirection = sunDirectionForControls(controls)
    close(
      dot(sunDirection, validationCase.cameraPose.forward),
      Math.cos(0.35 * Math.PI / 180),
      1e-12,
    )
  }

  for (const [id, expectedFovDegrees] of [
    ['high-altitude-day-narrow', 15],
    ['high-altitude-sunset-narrow', 10],
  ] as const) {
    const validationCase = validationCaseById(id)
    const controls = createValidationControls(validationCase)
    close(
      length(validationCase.cameraPose.position) -
        EARTH_ATMOSPHERE.bottomRadiusKm,
      12,
      1e-10,
    )
    assert.equal(
      controls.camera.verticalFovDegrees,
      expectedFovDegrees,
    )
    assert.ok(validationCase.reference)
  }
})

test('月球验证用例由轨道快照精确构建目标画面射线', () => {
  const cases = [
    ['lunar-ground-terminator', 0.08, 0.08],
    ['lunar-space-limb', 0, 0.005],
    ['lunar-ground-night', 0, 1],
    ['space-limb-oblique', 0.044, -0.0382],
    ['planetary-night-side', 0.1358, -0.192],
  ] as const

  for (const [id, rightOffset, upOffset] of cases) {
    const validationCase = validationCaseById(id)
    const controls = createValidationControls(validationCase)
    const snapshot = evaluateCelestialScenario(
      controls.celestial.scenario,
      controls.celestial.simulationTimeSeconds,
    )
    const pose = validationCase.cameraPose
    const cameraRight = normalize(cross(pose.forward, pose.up))
    const expectedDirection = normalize(add(
      pose.forward,
      add(
        scale(cameraRight, rightOffset),
        scale(pose.up, upOffset),
      ),
    ))
    const cameraSystemPosition = add(
      snapshot.earth.systemPositionKm,
      pose.position,
    )
    const actualDirection = normalize(subtract(
      snapshot.moon.systemPositionKm,
      cameraSystemPosition,
    ))

    close(dot(actualDirection, expectedDirection), 1, 1e-12)
    assert.equal(controls.celestial.simulationTimeSeconds, 0)
    assert.equal(controls.celestial.paused, true)
  }

  assert.ok(
    moonIlluminatedFraction('lunar-ground-terminator') > 0.4,
  )
  assert.ok(
    moonIlluminatedFraction('lunar-ground-night') > 0.8,
  )
})

test('动作路径取消后恢复输入且不执行后续检查点', async () => {
  const validationCase = validationCaseById('space-limb-rise')
  assert.ok(validationCase.path)
  const controller = new AbortController()
  const calls: string[] = []
  const port: WorkbenchPathPort = {
    setControls: () => calls.push('controls'),
    setCameraPose: () => calls.push('pose'),
    setManualInputEnabled: (enabled) => {
      calls.push(enabled ? 'manual:on' : 'manual:off')
    },
    checkpoint: (id) => calls.push(`checkpoint:${id}`),
  }
  const clock: WorkbenchPathClock = {
    async elapse(_duration, _update, _signal): Promise<void> {
      controller.abort(new Error('停止'))
      controller.signal.throwIfAborted()
    },
  }

  await expect(
    executeWorkbenchPath(
      validationCase.path,
      port,
      controller.signal,
      clock,
    ),
  ).rejects.toThrow('停止')
  assert.equal(calls.at(-1), 'manual:on')
  assert.equal(
    calls.includes('checkpoint:space-limb-800-km'),
    false,
  )
})

test('验证用例 ID 唯一且仅部分用例包含完整参考元数据', () => {
  const ids = new Set(VALIDATION_CASES.map((item) => item.id))
  const withReference = VALIDATION_CASES.filter(
    (item) => item.reference !== null,
  )
  const withoutReference = VALIDATION_CASES.filter(
    (item) => item.reference === null,
  )

  assert.equal(ids.size, VALIDATION_CASES.length)
  assert.ok(withReference.length > 0)
  assert.ok(withoutReference.length > 0)
  assert.ok(
    withReference.every(
      (item) =>
        item.reference !== null &&
        item.reference.src.length > 0 &&
        Number.isFinite(item.reference.aspectRatio) &&
        item.reference.aspectRatio > 0 &&
        (
          item.reference.fit === 'contain' ||
          item.reference.fit === 'cover'
        ) &&
        item.reference.alignment.length > 0 &&
        item.reference.comparable.length > 0 &&
        item.reference.unknowns.length > 0,
    ),
  )
})

test('验证用例直接保存有限正交摄像机姿态', () => {
  for (const validationCase of VALIDATION_CASES) {
    const pose = validationCase.cameraPose

    assert.ok(
      [...pose.position, ...pose.forward, ...pose.up].every(
        (component) => Number.isFinite(component),
      ),
    )
    close(length(pose.forward), 1, 1e-12)
    close(length(pose.up), 1, 1e-12)
    close(dot(pose.forward, pose.up), 0, 1e-12)
  }
})

test('验证用例目录按分类和分组形成唯一顺序', () => {
  const categoryIds = new Set(
    VALIDATION_CASE_CATEGORIES.map((category) => category.id),
  )
  const groups = VALIDATION_CASE_CATEGORIES.reduce<
    ValidationCaseGroup[]
  >(
    (result, category) => {
      result.push(...category.groups)
      return result
    },
    [],
  )
  const groupIds = new Set(groups.map((group) => group.id))
  const groupedCases = groups.flatMap((group) => group.cases)

  assert.equal(
    categoryIds.size,
    VALIDATION_CASE_CATEGORIES.length,
  )
  assert.equal(groupIds.size, groups.length)
  assert.ok(groups.every((group) => group.cases.length > 0))
  assert.deepEqual(
    groupedCases.map((item) => item.id),
    VALIDATION_CASES.map((item) => item.id),
  )
  assert.ok(
    VALIDATION_CASES.every(
      (item) =>
        item.objective.length > 0 &&
        validationCasePath(item.id).endsWith(item.id),
    ),
  )
})

test('介质分量和渲染路径用例构建完整可调状态', () => {
  const rayleigh = createValidationControls(
    validationCaseById('ground-rayleigh-only'),
  )
  const mie = createValidationControls(
    validationCaseById('ground-mie-only'),
  )
  const reference = createValidationControls(
    validationCaseById('ground-terminator-reference'),
  )
  const productionSingle = createValidationControls(
    validationCaseById('ground-terminator-single'),
  )

  assert.deepEqual(
    [
      rayleigh.rendering.rayleighEnabled,
      rayleigh.rendering.mieEnabled,
      rayleigh.rendering.ozoneEnabled,
    ],
    [true, false, false],
  )
  assert.deepEqual(
    [
      mie.rendering.rayleighEnabled,
      mie.rendering.mieEnabled,
      mie.rendering.ozoneEnabled,
    ],
    [false, true, false],
  )
  assert.equal(reference.rendering.quality, 'reference')
  assert.equal(reference.rendering.multipleScattering, false)
  assert.equal(productionSingle.rendering.quality, 'high')
  assert.equal(
    productionSingle.rendering.multipleScattering,
    false,
  )
})
