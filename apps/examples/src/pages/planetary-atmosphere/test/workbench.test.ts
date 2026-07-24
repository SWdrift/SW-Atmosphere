import { createPinia, setActivePinia } from 'pinia'
import {
  assert,
  beforeEach,
  expect,
  test,
} from 'vitest'
import {
  cloneAtmosphereControls,
} from '../model/atmosphereState.ts'
import { useAtmosphereStore } from '../model/atmosphereStore.ts'
import {
  createValidationControls,
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

beforeEach(() => {
  setActivePinia(createPinia())
})

test('Store 是默认值、质量约束和速度指数的唯一真相', () => {
  const store = useAtmosphereStore()
  const spaceLimb = validationCaseById('space-limb')

  store.adjustSpeedExponent(100)
  assert.equal(store.controls.camera.speedExponent, 6)

  store.setQuality('reference')
  assert.equal(store.controls.rendering.quality, 'reference')
  assert.equal(store.controls.rendering.multipleScattering, false)
  assert.throws(() => store.setQuality('unknown'))

  store.replaceControls(createValidationControls(spaceLimb))
  assert.equal(store.controls.camera.verticalFovDegrees, 20)
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
  const spaceLimb = validationCaseById('space-limb')
  const controls = createValidationControls(spaceLimb)

  assert.equal(
    validationCasePath(spaceLimb.id),
    '/planetary-atmosphere/presets/space-limb',
  )
  assert.equal(
    atmospherePanelIdFromPath(validationCasePath(spaceLimb.id)),
    'presets',
  )
  assert.equal(controls.camera.mode, 'free')
  assert.equal(controls.camera.verticalFovDegrees, 20)
  assert.equal(controls.rendering.debugView, 'final')
  assert.equal(controls.debug.grid, false)
  assert.throws(() => validationCaseById('unknown'))
  assert.throws(() =>
    atmospherePanelIdFromPath('/planetary-atmosphere/unknown'),
  )
})

test('工作台状态形成单向生命周期', () => {
  const store = useAtmosphereStore()

  store.requestValidationCase('space-limb')
  assert.equal(store.workbench.phase, 'pending')
  store.beginValidationCaseActivation('space-limb')
  store.completeValidationCaseActivation('space-limb')
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
  const validationCase = validationCaseById('space-limb')
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

test('动作路径取消后恢复输入且不执行后续检查点', async () => {
  const validationCase = validationCaseById('space-limb')
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
        item.reference.comparable.length > 0 &&
        item.reference.unknowns.length > 0,
    ),
  )
})
