import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import WelcomeView from './pages/WelcomeView.vue'
import PlanetaryAtmosphere from './pages/planetary-atmosphere/index.vue'
import { ATMOSPHERE_PANEL_ROUTES } from './pages/planetary-atmosphere/panelRoutes.ts'
import WebgpuLightUp from './pages/webgpu-light-up/index.vue'

export const examplePages = [
  {
    path: '/webgpu-light-up',
    name: 'WebGPU 点亮测试',
    component: WebgpuLightUp,
  },
  {
    path: ATMOSPHERE_PANEL_ROUTES[0].path,
    name: '大气实验',
    component: PlanetaryAtmosphere,
  },
] as const

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: '首页',
    component: WelcomeView,
  },
  {
    path: '/planetary-atmosphere',
    redirect: ATMOSPHERE_PANEL_ROUTES[0].path,
  },
  ...examplePages.map((page) => ({
    path: page.path,
    name: page.name,
    component: page.component,
  })),
  ...ATMOSPHERE_PANEL_ROUTES.slice(1).map((panel) => ({
    path: panel.path,
    name: `大气实验-${panel.label}`,
    component: PlanetaryAtmosphere,
  })),
  {
    path: '/planetary-atmosphere/presets/:caseId',
    name: '大气实验-验证用例',
    component: PlanetaryAtmosphere,
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
