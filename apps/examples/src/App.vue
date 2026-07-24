<template>
  <el-container class="app-shell">
    <el-aside width="200px">
      <el-menu router :default-active="activeExamplePath">
        <el-menu-item
          v-for="page in examplePages"
          :key="page.path"
          :index="page.path"
        >
          {{ page.name }}
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-main>
      <RouterView />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { examplePages } from './router'

const route = useRoute()
const activeExamplePath = computed(() => {
  const page = examplePages.find(
    (candidate) =>
      route.path === candidate.path ||
      route.path.startsWith(`${candidate.path}/`),
  )

  return page?.path
})
</script>

<style>
:root {
  font-family: var(--el-font-family);
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
}

body {
  margin: 0;
}

h1 {
  margin: 0;
  font-size: 20px;
  line-height: 32px;
}

#app {
  height: 100vh;
}

.app-shell {
  height: 100%;
}

.el-aside {
  border-right: 1px solid var(--el-menu-border-color);
  background: var(--el-bg-color-page);
}

.el-aside .el-menu {
  border-right: 0;
}

.el-main {
  min-width: 0;
  height: 100%;
  padding: 12px;
  overflow: auto;
}

@media (max-width: 700px) {
  .el-aside {
    width: 140px !important;
  }
}
</style>
