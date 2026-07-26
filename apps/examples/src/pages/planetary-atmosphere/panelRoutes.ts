export const ATMOSPHERE_PANEL_ROUTES = [
  {
    id: 'camera',
    label: '相机',
    path: '/planetary-atmosphere/camera',
  },
  {
    id: 'celestial',
    label: '天体',
    path: '/planetary-atmosphere/celestial',
  },
  {
    id: 'rendering',
    label: '输出',
    path: '/planetary-atmosphere/rendering',
  },
  {
    id: 'presets',
    label: '预设',
    path: '/planetary-atmosphere/presets',
  },
  {
    id: 'debug',
    label: '调试',
    path: '/planetary-atmosphere/debug',
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
