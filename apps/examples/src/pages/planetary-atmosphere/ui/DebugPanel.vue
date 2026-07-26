<script setup lang="ts">
import { useAtmosphereStore } from '../model/atmosphereStore.ts'
import DiagnosticsPanel from './DiagnosticsPanel.vue'

const store = useAtmosphereStore()
</script>

<template>
  <section>
    <h2>调试输出</h2>
    <label class="field">
      <span>视图</span>
      <el-select v-model="store.controls.rendering.debugView">
        <el-option label="Final" value="final" />
        <el-option label="Transmittance" value="transmittance" />
        <el-option label="Multi-Scattering" value="multiple-scattering" />
        <el-option label="Sky-View" value="sky-view" />
        <el-option label="Aerial L" value="aerial-radiance" />
        <el-option label="Aerial T" value="aerial-transmittance" />
        <el-option label="Density RGB" value="density" />
      </el-select>
    </label>
    <label
      v-if="store.controls.rendering.debugView.startsWith('aerial-')"
      class="field"
    >
      <span>体切片</span>
      <el-input-number
        v-model="store.controls.rendering.aerialPerspectiveSlice"
        :min="0"
        :max="1"
        :step="0.01"
      />
    </label>
    <div class="checks">
      <el-checkbox v-model="store.controls.debug.geometry">几何分类</el-checkbox>
      <el-checkbox v-model="store.controls.debug.grid">XYZ 网格</el-checkbox>
      <el-checkbox v-model="store.controls.debug.skyGrid">天空经纬网</el-checkbox>
      <el-checkbox v-model="store.controls.debug.axesIndicator">坐标轴</el-checkbox>
      <el-checkbox v-model="store.controls.debug.attitudeIndicator">姿态仪</el-checkbox>
    </div>
    <label class="field">
      <span>网格平面</span>
      <el-select v-model="store.controls.debug.gridPlane">
        <el-option label="XY" value="xy" />
        <el-option label="XZ" value="xz" />
        <el-option label="YZ" value="yz" />
      </el-select>
    </label>
  </section>
  <DiagnosticsPanel />
</template>

<style scoped>
h2 {
  margin: 0 0 10px;
  font-size: 14px;
}

.field {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.checks {
  display: flex;
  flex-direction: column;
}
</style>
