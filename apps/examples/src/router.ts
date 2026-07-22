import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import WelcomeView from './pages/WelcomeView.vue'
import WebgpuLightUp from './pages/webgpu-light-up/index.vue'

export const examplePages = [
  {
    path: '/webgpu-light-up',
    name: 'WebGPU 点亮测试',
    component: WebgpuLightUp,
  },
] as const

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: '首页',
    component: WelcomeView,
  },
  ...examplePages.map((page) => ({
    path: page.path,
    name: page.name,
    component: page.component,
  })),
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
