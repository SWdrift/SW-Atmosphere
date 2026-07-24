import { assert, test } from 'vitest'
import {
  DEFAULT_REFERENCE_ROUTE_STATE,
  referenceRouteQuery,
  referenceRouteStateFromQuery,
} from './referenceRoute.ts'

test('缺省查询使用不显示和 0.5 混合比例', () => {
  assert.deepEqual(
    referenceRouteStateFromQuery({}),
    DEFAULT_REFERENCE_ROUTE_STATE,
  )
})

test('查询参数保持显示状态和混合比例往返', () => {
  const state = {
    visible: true,
    mix: 0.35,
  }

  assert.deepEqual(
    referenceRouteStateFromQuery(referenceRouteQuery(state)),
    state,
  )
})

test('非法查询参数 fail fast', () => {
  assert.throws(() =>
    referenceRouteStateFromQuery({ reference: 'yes' }),
  )
  assert.throws(() =>
    referenceRouteStateFromQuery({ reference: ['1'] }),
  )
  assert.throws(() =>
    referenceRouteStateFromQuery({ mix: '1.1' }),
  )
  assert.throws(() =>
    referenceRouteQuery({ visible: false, mix: Number.NaN }),
  )
})
