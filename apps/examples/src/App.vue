<template>
  <div class="app-shell">
    <aside class="sidebar">
      <nav>
        <RouterLink
          v-for="page in examplePages"
          :key="page.path"
          class="nav-link"
          :to="page.path"
        >
          {{ page.name }}
        </RouterLink>
      </nav>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { examplePages } from './router'
</script>

<style>
:root {
  font: 16px/1.55 Inter, ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
  color: #202122;
  background: #fff;
}

body {
  margin: 0;
}

a {
  color: #36c;
}

h1 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 32px;
  font-weight: 400;
  line-height: 1.3;
}

p {
  max-width: 760px;
  margin: 0;
  color: #202122;
}

#app {
  min-height: 100vh;
}

.app-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
  border-right: 1px solid #a2a9b1;
  background: #f8f9fa;
  padding: 10px;
}

nav {
  display: flex;
  flex-direction: column;
}

.nav-link {
  padding: 4px 0;
  text-decoration: underline;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #202122;
}

.content {
  min-width: 0;
  padding: 10px;
}
</style>
