export const ATMOSPHERE_PANEL_ROUTES = [
  {
    id: 'parameters',
    label: '参数',
    path: '/planetary-atmosphere/parameters',
  },
  {
    id: 'presets',
    label: '预设',
    path: '/planetary-atmosphere/presets',
  },
  {
    id: 'diagnostics',
    label: '诊断',
    path: '/planetary-atmosphere/diagnostics',
  },
] as const

export type AtmospherePanelId =
  (typeof ATMOSPHERE_PANEL_ROUTES)[number]['id']

export function atmospherePanelIdFromPath(
  path: string,
): AtmospherePanelId {
  const panel = ATMOSPHERE_PANEL_ROUTES.find(
    (candidate) =>
      path === candidate.path ||
      (
        candidate.id === 'presets' &&
        path.startsWith(`${candidate.path}/`)
      ),
  )

  if (!panel) {
    throw new Error(`未知的大气实验面板路由：${path}`)
  }

  return panel.id
}
