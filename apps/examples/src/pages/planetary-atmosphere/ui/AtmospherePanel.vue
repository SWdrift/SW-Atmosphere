<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import {
  atmospherePanelIdFromPath,
  ATMOSPHERE_PANEL_ROUTES,
  type AtmospherePanelId,
} from '../panelRoutes.ts'

const route = useRoute()
const router = useRouter()

const activePanel = computed({
  get(): AtmospherePanelId {
    return atmospherePanelIdFromPath(route.path)
  },
  set(id: AtmospherePanelId): void {
    const panel = ATMOSPHERE_PANEL_ROUTES.find(
      (candidate) => candidate.id === id,
    )

    if (!panel) {
      throw new Error(`未知的大气实验面板：${id}`)
    }

    void router.push({
      path: panel.path,
      query: route.query,
    })
  },
})
</script>

<template>
  <aside class="atmosphere-panel" aria-label="大气实验控制面板">
    <el-tabs v-model="activePanel">
      <el-tab-pane
        v-for="panel in ATMOSPHERE_PANEL_ROUTES"
        :key="panel.id"
        :label="panel.label"
        :name="panel.id"
      >
        <slot :name="panel.id"></slot>
      </el-tab-pane>
    </el-tabs>
  </aside>
</template>

<style scoped>
.atmosphere-panel {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.atmosphere-panel :deep(.el-tabs) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.atmosphere-panel :deep(.el-tabs__header) {
  flex: none;
  height: 39px;
  margin: 0;
  padding: 0 12px;
}

.atmosphere-panel :deep(.el-tabs__content) {
  flex: 1;
  box-sizing: border-box;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
</style>
