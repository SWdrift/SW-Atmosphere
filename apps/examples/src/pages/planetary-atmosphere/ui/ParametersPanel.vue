<script setup lang="ts">
import { useAtmosphereStore } from '../model/atmosphereStore.ts'

const emit = defineEmits<{
  'restore-defaults': []
}>()

const store = useAtmosphereStore()
</script>

<template>
  <section class="panel-section">
    <h2>摄像机</h2>
    <el-radio-group v-model="store.controls.camera.mode">
      <el-radio-button value="free">Free flight</el-radio-button>
      <el-radio-button value="orbit">Orbit</el-radio-button>
    </el-radio-group>

    <div class="control-row">
      <span>垂直 FOV</span>
      <el-slider
        v-model="store.controls.camera.verticalFovDegrees"
        :min="5"
        :max="100"
        :show-tooltip="false"
      />
      <output>{{ store.controls.camera.verticalFovDegrees }}°</output>
    </div>
    <div class="control-row">
      <span>速度指数</span>
      <el-slider
        v-model="store.controls.camera.speedExponent"
        :min="-4"
        :max="6"
        :step="0.25"
        :show-tooltip="false"
      />
      <output>
        2^{{ store.controls.camera.speedExponent.toFixed(2) }}
      </output>
    </div>
  </section>

  <section class="panel-section">
    <h2>太阳与输出</h2>
    <el-radio-group
      :model-value="store.controls.rendering.quality"
      @update:model-value="store.setQuality"
    >
      <el-radio-button value="reference">Reference</el-radio-button>
      <el-radio-button value="low">Low</el-radio-button>
      <el-radio-button value="medium">Medium</el-radio-button>
      <el-radio-button value="high">High</el-radio-button>
    </el-radio-group>

    <div class="checkboxes">
      <el-checkbox
        v-model="store.controls.rendering.multipleScattering"
        :disabled="store.controls.rendering.quality === 'reference'"
      >
        多重散射（Production）
      </el-checkbox>
      <el-checkbox v-model="store.controls.rendering.rayleighEnabled">
        Rayleigh
      </el-checkbox>
      <el-checkbox v-model="store.controls.rendering.mieEnabled">
        Mie
      </el-checkbox>
      <el-checkbox v-model="store.controls.rendering.ozoneEnabled">
        Ozone 吸收
      </el-checkbox>
    </div>

    <div class="control-row">
      <span>调试视图</span>
      <el-select v-model="store.controls.rendering.debugView">
        <el-option label="Final" value="final" />
        <el-option label="Transmittance" value="transmittance" />
        <el-option
          label="Multi-Scattering"
          value="multiple-scattering"
        />
        <el-option label="Sky-View" value="sky-view" />
        <el-option label="Aerial L" value="aerial-radiance" />
        <el-option label="Aerial T" value="aerial-transmittance" />
        <el-option label="Density RGB" value="density" />
      </el-select>
    </div>
    <div
      v-if="
        store.controls.rendering.debugView === 'aerial-radiance' ||
        store.controls.rendering.debugView === 'aerial-transmittance'
      "
      class="control-row"
    >
      <span>体切片</span>
      <el-slider
        v-model="store.controls.rendering.aerialPerspectiveSlice"
        :min="0"
        :max="1"
        :step="0.01"
        :show-tooltip="false"
      />
      <output>
        {{
          store.controls.rendering.aerialPerspectiveSlice.toFixed(2)
        }}
      </output>
    </div>
    <div class="control-row">
      <span>方位角</span>
      <el-slider
        v-model="store.controls.sun.azimuthDegrees"
        :min="-180"
        :max="180"
        :show-tooltip="false"
      />
      <output>{{ store.controls.sun.azimuthDegrees }}°</output>
    </div>
    <div class="control-row">
      <span>高度角</span>
      <el-slider
        v-model="store.controls.sun.elevationDegrees"
        :min="-20"
        :max="90"
        :step="0.5"
        :show-tooltip="false"
      />
      <output>
        {{ store.controls.sun.elevationDegrees.toFixed(1) }}°
      </output>
    </div>
    <div class="control-row">
      <span>曝光</span>
      <el-slider
        v-model="store.controls.rendering.exposure"
        :min="0.25"
        :max="20"
        :step="0.25"
        :show-tooltip="false"
      />
      <output>
        {{ store.controls.rendering.exposure.toFixed(2) }}
      </output>
    </div>

    <div class="checkboxes">
      <el-checkbox v-model="store.controls.debug.geometry">
        几何分类调试
      </el-checkbox>
      <el-checkbox v-model="store.controls.debug.grid">
        全局 XYZ 网格
      </el-checkbox>
      <el-checkbox v-model="store.controls.debug.skyGrid">
        天空经纬网格
      </el-checkbox>
    </div>
    <div class="control-row">
      <span>网格平面</span>
      <el-select v-model="store.controls.debug.gridPlane">
        <el-option label="XY" value="xy" />
        <el-option label="XZ" value="xz" />
        <el-option label="YZ" value="yz" />
      </el-select>
    </div>
  </section>

  <el-button @click="emit('restore-defaults')">
    恢复 Earth 默认值
  </el-button>
</template>

<style scoped>
.panel-section + .panel-section {
  margin-top: 16px;
}

.panel-section h2 {
  margin: 0 0 10px;
  font-size: 14px;
}

.control-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 58px;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  font-size: 13px;
}

.control-row output {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.control-row .el-select {
  grid-column: 2 / 4;
}

.checkboxes {
  display: flex;
  flex-wrap: wrap;
  margin: 8px 0;
}

.panel-section :deep(.el-radio-group) {
  display: flex;
  margin-bottom: 8px;
}

.panel-section :deep(.el-radio-button) {
  flex: 1;
}

.panel-section :deep(.el-radio-button__inner) {
  width: 100%;
  padding-right: 8px;
  padding-left: 8px;
}
</style>
