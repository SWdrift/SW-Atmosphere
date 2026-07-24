export interface ReferenceRouteState {
  visible: boolean
  mix: number
}

export const DEFAULT_REFERENCE_ROUTE_STATE: ReferenceRouteState = {
  visible: false,
  mix: 0.5,
}

export function referenceRouteStateFromQuery(
  query: Readonly<Record<string, unknown>>,
): ReferenceRouteState {
  const reference = query.reference
  const mix = query.mix

  if (
    reference !== undefined &&
    reference !== '0' &&
    reference !== '1'
  ) {
    throw new Error('reference 路由参数必须是 0 或 1。')
  }
  if (mix !== undefined && typeof mix !== 'string') {
    throw new Error('mix 路由参数必须是单个数值。')
  }

  const parsedMix =
    mix === undefined
      ? DEFAULT_REFERENCE_ROUTE_STATE.mix
      : Number(mix)

  if (
    !Number.isFinite(parsedMix) ||
    parsedMix < 0 ||
    parsedMix > 1
  ) {
    throw new Error('mix 路由参数必须位于 0 到 1。')
  }

  return {
    visible:
      reference === undefined
        ? DEFAULT_REFERENCE_ROUTE_STATE.visible
        : reference === '1',
    mix: parsedMix,
  }
}

export function referenceRouteQuery(
  state: ReferenceRouteState,
): Record<string, string> {
  if (
    !Number.isFinite(state.mix) ||
    state.mix < 0 ||
    state.mix > 1
  ) {
    throw new Error('参考图混合比例必须位于 0 到 1。')
  }

  return {
    reference: state.visible ? '1' : '0',
    mix: String(state.mix),
  }
}
