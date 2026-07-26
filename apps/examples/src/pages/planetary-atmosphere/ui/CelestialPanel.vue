<script setup lang="ts">
import { useAtmosphereStore } from '../model/atmosphereStore.ts'

const store = useAtmosphereStore()
const orbit = computed(() =>
  store.controls.celestial.selectedBodyId === 'moon'
    ? store.controls.celestial.scenario.moonOrbit
    : store.controls.celestial.scenario.earthOrbit,
)
const rotation = computed(() =>
  store.controls.celestial.selectedBodyId === 'moon'
    ? store.controls.celestial.scenario.moonRotation
    : store.controls.celestial.scenario.earthRotation,
)
</script>

<template>
  <section class="panel-section">
    <h2>模拟时钟</h2>
    <label class="field">
      <span>历元（秒）</span>
      <el-input-number
        v-model="store.controls.celestial.scenario.epochSeconds"
        :controls="false"
      />
    </label>
    <label class="field">
      <span>时间（秒）</span>
      <el-input-number
        v-model="store.controls.celestial.simulationTimeSeconds"
        :controls="false"
      />
    </label>
    <label class="field">
      <span>时间倍率</span>
      <el-input-number
        v-model="store.controls.celestial.timeScale"
        :min="0"
        :step="60"
      />
    </label>
    <el-checkbox v-model="store.controls.celestial.paused">暂停</el-checkbox>
    <el-button @click="store.restoreDefaultCelestialScenario()">
      恢复默认冬季日食
    </el-button>
  </section>

  <section class="panel-section">
    <h2>实体参数</h2>
    <label
      v-for="id in (['sun', 'moon'] as const)"
      :key="id"
      class="field"
    >
      <span>{{ id }} 半径 km</span>
      <el-input-number
        v-model="store.controls.celestial.scenario.bodyRadiiKm[id]"
        :min="0.001"
        :controls="false"
      />
    </label>
    <el-text size="small" type="info">
      地球实体半径由当前大气宿主固定为
      {{ store.controls.celestial.scenario.bodyRadiiKm.earth }} km。
    </el-text>
    <label class="field">
      <span>辐照参考距 km</span>
      <el-input-number
        v-model="
          store.controls.celestial.scenario
            .solarIrradianceReferenceDistanceKm
        "
        :min="0.001"
        :controls="false"
      />
    </label>
  </section>

  <section class="panel-section">
    <h2>轨道参数</h2>
    <el-radio-group v-model="store.controls.celestial.selectedBodyId">
      <el-radio-button value="earth">地球绕太阳</el-radio-button>
      <el-radio-button value="moon">月球绕地球</el-radio-button>
    </el-radio-group>
    <label class="field">
      <span>半长轴 km</span>
      <el-input-number v-model="orbit.semiMajorAxisKm" :controls="false" />
    </label>
    <label class="field">
      <span>离心率</span>
      <el-input-number
        v-model="orbit.eccentricity"
        :min="0"
        :max="0.999"
        :step="0.001"
      />
    </label>
    <label class="field">
      <span>倾角 °</span>
      <el-input-number
        v-model="orbit.inclinationDegrees"
        :min="0"
        :max="180"
        :step="0.1"
      />
    </label>
    <label class="field">
      <span>升交点 °</span>
      <el-input-number v-model="orbit.ascendingNodeDegrees" :step="1" />
    </label>
    <label class="field">
      <span>近心点角 °</span>
      <el-input-number v-model="orbit.periapsisArgumentDegrees" :step="1" />
    </label>
    <label class="field">
      <span>历元平近点角 °</span>
      <el-input-number
        v-model="orbit.meanAnomalyAtEpochDegrees"
        :step="1"
      />
    </label>
    <label class="field">
      <span>周期 s</span>
      <el-input-number v-model="orbit.periodSeconds" :controls="false" />
    </label>
  </section>

  <section class="panel-section">
    <h2>自转参数</h2>
    <label class="field">
      <span>周期 s</span>
      <el-input-number v-model="rotation.periodSeconds" :controls="false" />
    </label>
    <label class="field">
      <span>历元相位 °</span>
      <el-input-number v-model="rotation.phaseAtEpochDegrees" />
    </label>
    <label
      v-for="(_, index) in rotation.poleDirection"
      :key="index"
      class="field"
    >
      <span>极轴 {{ ['X', 'Y', 'Z'][index] }}</span>
      <el-input-number
        v-model="rotation.poleDirection[index]"
        :controls="false"
        :step="0.01"
      />
    </label>
  </section>

  <section class="panel-section">
    <h2>食相诊断</h2>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="日月角距">
        {{ store.runtime.telemetry.sunMoonSeparationDegrees.toFixed(4) }}°
      </el-descriptions-item>
      <el-descriptions-item label="太阳可见">
        {{ (store.runtime.telemetry.solarVisibleFraction * 100).toFixed(3) }}%
      </el-descriptions-item>
    </el-descriptions>
  </section>
</template>

<style scoped>
.panel-section + .panel-section {
  margin-top: 16px;
}

h2 {
  margin: 0 0 10px;
  font-size: 14px;
}

.field {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
}
</style>
