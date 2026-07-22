import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import WelcomeView from './views/WelcomeView.vue'
import BasicSceneView from './views/BasicSceneView.vue'

export const examplePages = [
  {
    path: '/basic-scene',
    name: '基础场景',
    component: BasicSceneView,
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
