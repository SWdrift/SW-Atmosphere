<script setup lang="ts">
import { useAtmosphereStore } from '../model/atmosphereStore.ts'

const store = useAtmosphereStore()
</script>

<template>
  <section>
    <h2>大气输出</h2>
    <el-radio-group
      :model-value="store.controls.rendering.quality"
      @update:model-value="store.setQuality"
    >
      <el-radio-button value="reference">Reference</el-radio-button>
      <el-radio-button value="low">Low</el-radio-button>
      <el-radio-button value="medium">Medium</el-radio-button>
      <el-radio-button value="high">High</el-radio-button>
    </el-radio-group>
    <label class="field">
      <span>曝光</span>
      <el-input-number
        v-model="store.controls.rendering.exposure"
        :min="0.25"
        :max="20"
        :step="0.25"
      />
    </label>
    <div class="checks">
      <el-checkbox
        v-model="store.controls.rendering.multipleScattering"
        :disabled="store.controls.rendering.quality === 'reference'"
      >
        多重散射
      </el-checkbox>
      <el-checkbox v-model="store.controls.rendering.rayleighEnabled">
        Rayleigh
      </el-checkbox>
      <el-checkbox v-model="store.controls.rendering.mieEnabled">
        Mie
      </el-checkbox>
      <el-checkbox v-model="store.controls.rendering.ozoneEnabled">
        Ozone
      </el-checkbox>
    </div>
  </section>
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
  margin-top: 12px;
  font-size: 13px;
}

.checks {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}
</style>
