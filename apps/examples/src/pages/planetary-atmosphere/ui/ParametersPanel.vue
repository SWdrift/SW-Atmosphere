<script setup lang="ts">
import { assertFreeCameraPosition } from '../camera/CameraController.ts'
import type { Vec3 } from '../math/vector3.ts'
import { useAtmosphereStore } from '../model/atmosphereStore.ts'

const emit = defineEmits<{
  'reset-body-to-world-basis': []
  'reset-equatorial-body': []
  'restore-defaults': []
  'set-free-look-angles': [yawDegrees: number, pitchDegrees: number]
  'set-free-position': [position: Vec3]
}>()

const store = useAtmosphereStore()
const position = ref<Vec3>([0, 0, 0])
const lookYawDegrees = ref(0)
const lookPitchDegrees = ref(0)
const positionDirty = ref(false)
const lookDirty = ref(false)
const poseEditError = ref('')
const referenceRadiusKm = computed(() =>
  store.controls.celestial.scenario.bodyRadiiKm[
    store.controls.camera.referenceBodyId
  ],
)

watch(
  () => store.runtime.telemetry.position,
  (value) => {
    if (!positionDirty.value) {
      position.value = [...value]
    }
  },
  { immediate: true },
)

watch(
  () => [
    store.runtime.telemetry.lookYawDegrees,
    store.runtime.telemetry.lookPitchDegrees,
  ] as const,
  ([yaw, pitch]) => {
    if (!lookDirty.value && yaw !== null && pitch !== null) {
      lookYawDegrees.value = yaw
      lookPitchDegrees.value = pitch
    }
  },
  { immediate: true },
)

function applyPosition(): void {
  try {
    assertFreeCameraPosition(position.value, referenceRadiusKm.value)
    emit('set-free-position', [...position.value])
    positionDirty.value = false
    poseEditError.value = ''
  } catch (error) {
    poseEditError.value =
      error instanceof Error ? error.message : String(error)
  }
}

function applyLookAngles(): void {
  emit('set-free-look-angles', lookYawDegrees.value, lookPitchDegrees.value)
  lookDirty.value = false
}
</script>

<template>
  <section class="panel-section">
    <h2>绑定与移动</h2>
    <label class="field">
      <span>参考天体</span>
      <el-select v-model="store.controls.camera.referenceBodyId">
        <el-option label="地球" value="earth" />
        <el-option label="月球" value="moon" />
        <el-option label="太阳" value="sun" />
      </el-select>
    </label>
    <label class="field">
      <span>参考系</span>
      <el-select v-model="store.controls.camera.referenceFrame">
        <el-option label="惯性系" value="inertial" />
        <el-option label="天体固连系" value="body-fixed" />
      </el-select>
    </label>
    <label class="field">
      <span>控制模式</span>
      <el-radio-group v-model="store.controls.camera.mode">
        <el-radio-button value="free">Free</el-radio-button>
        <el-radio-button value="orbit">Orbit</el-radio-button>
      </el-radio-group>
    </label>
    <div class="buttons">
      <el-button
        :disabled="store.controls.camera.mode !== 'free'"
        @click="emit('reset-equatorial-body')"
      >
        赤道默认
      </el-button>
      <el-button
        :disabled="store.controls.camera.mode !== 'free'"
        @click="emit('reset-body-to-world-basis')"
      >
        世界基准
      </el-button>
    </div>
  </section>

  <section class="panel-section">
    <h2>相机参数</h2>
    <label class="field">
      <span>垂直 FOV</span>
      <el-input-number
        v-model="store.controls.camera.verticalFovDegrees"
        :min="5"
        :max="100"
      />
    </label>
    <label class="field">
      <span>速度指数</span>
      <el-input-number
        v-model="store.controls.camera.speedExponent"
        :min="-4"
        :max="6"
        :step="0.25"
      />
    </label>
    <div class="vector-editor">
      <span>位置（参考系 km）</span>
      <el-input-number
        v-for="(_, index) in position"
        :key="index"
        v-model="position[index]"
        :controls="false"
        :precision="3"
        @update:model-value="positionDirty = true"
      />
      <el-button
        :disabled="!positionDirty || store.controls.camera.mode !== 'free'"
        @click="applyPosition"
      >
        应用位置
      </el-button>
    </div>
    <label class="field">
      <span>偏航角</span>
      <el-input-number
        v-model="lookYawDegrees"
        :min="-180"
        :max="180"
        @update:model-value="lookDirty = true"
      />
    </label>
    <label class="field">
      <span>俯仰角</span>
      <el-input-number
        v-model="lookPitchDegrees"
        :min="-89"
        :max="89"
        @update:model-value="lookDirty = true"
      />
    </label>
    <el-button
      :disabled="!lookDirty || store.controls.camera.mode !== 'free'"
      @click="applyLookAngles"
    >
      应用观察角
    </el-button>
    <el-text v-if="poseEditError" type="danger" size="small">
      {{ poseEditError }}
    </el-text>
  </section>

  <el-button @click="emit('restore-defaults')">恢复默认场景</el-button>
</template>

<style scoped>
.panel-section + .panel-section {
  margin-top: 16px;
}

h2 {
  margin: 0 0 10px;
  font-size: 14px;
}

.field,
.vector-editor {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.vector-editor {
  grid-template-columns: 1fr;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
