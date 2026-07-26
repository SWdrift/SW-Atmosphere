<script setup lang="ts">
import { EARTH_ATMOSPHERE } from '../atmosphere/AtmosphereParameters.ts'
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
const positionX = ref(0)
const positionY = ref(0)
const positionZ = ref(0)
const lookYawDegrees = ref(0)
const lookPitchDegrees = ref(0)
const positionDirty = ref(false)
const lookDirty = ref(false)
const poseEditError = ref('')

watch(
  () => store.runtime.telemetry.position,
  (position) => {
    if (positionDirty.value) {
      return
    }

    positionX.value = position[0]
    positionY.value = position[1]
    positionZ.value = position[2]
  },
  { immediate: true },
)

watch(
  () => [
    store.runtime.telemetry.lookYawDegrees,
    store.runtime.telemetry.lookPitchDegrees,
  ] as const,
  ([yawDegrees, pitchDegrees]) => {
    if (
      lookDirty.value ||
      yawDegrees === null ||
      pitchDegrees === null
    ) {
      return
    }

    lookYawDegrees.value = yawDegrees
    lookPitchDegrees.value = pitchDegrees
  },
  { immediate: true },
)

function markPositionDirty(): void {
  positionDirty.value = true
  poseEditError.value = ''
}

function markLookDirty(): void {
  lookDirty.value = true
  poseEditError.value = ''
}

function applyPosition(): void {
  const position: Vec3 = [
    positionX.value,
    positionY.value,
    positionZ.value,
  ]

  try {
    assertFreeCameraPosition(
      position,
      EARTH_ATMOSPHERE.bottomRadiusKm,
    )
  } catch (error) {
    poseEditError.value =
      error instanceof Error ? error.message : String(error)
    return
  }

  emit('set-free-position', position)
  positionDirty.value = false
}

function applyLookAngles(): void {
  emit(
    'set-free-look-angles',
    lookYawDegrees.value,
    lookPitchDegrees.value,
  )
  lookDirty.value = false
}
</script>

<template>
  <section class="panel-section">
    <h2>摄像机</h2>
    <el-radio-group v-model="store.controls.camera.mode">
      <el-radio-button value="free">Free flight</el-radio-button>
      <el-radio-button value="orbit">Orbit</el-radio-button>
    </el-radio-group>

    <div class="view-shortcuts">
      <el-button
        :disabled="
          store.runtime.phase !== 'running' ||
          store.controls.camera.mode !== 'free'
        "
        @click="emit('reset-equatorial-body')"
      >
        赤道默认
      </el-button>
      <el-button
        :disabled="
          store.runtime.phase !== 'running' ||
          store.controls.camera.mode !== 'free'
        "
        @click="emit('reset-body-to-world-basis')"
      >
        世界基准
      </el-button>
    </div>

    <div class="pose-editor">
      <div class="pose-editor-title">位置（世界坐标 km）</div>
      <label class="pose-input">
        <span>X</span>
        <el-input-number
          v-model="positionX"
          :controls="false"
          :precision="3"
          @update:model-value="markPositionDirty"
        />
      </label>
      <label class="pose-input">
        <span>Y</span>
        <el-input-number
          v-model="positionY"
          :controls="false"
          :precision="3"
          @update:model-value="markPositionDirty"
        />
      </label>
      <label class="pose-input">
        <span>Z</span>
        <el-input-number
          v-model="positionZ"
          :controls="false"
          :precision="3"
          @update:model-value="markPositionDirty"
        />
      </label>
      <el-button
        :disabled="
          !positionDirty ||
          store.runtime.phase !== 'running' ||
          store.controls.camera.mode !== 'free'
        "
        @click="applyPosition"
      >
        应用位置
      </el-button>

      <div class="pose-editor-title">观察偏转（相对 Body）</div>
      <label class="pose-input">
        <span>偏航角</span>
        <el-input-number
          v-model="lookYawDegrees"
          :controls="false"
          :min="-180"
          :max="180"
          :precision="2"
          @update:model-value="markLookDirty"
        />
      </label>
      <label class="pose-input">
        <span>俯仰角</span>
        <el-input-number
          v-model="lookPitchDegrees"
          :controls="false"
          :min="-89"
          :max="89"
          :precision="2"
          @update:model-value="markLookDirty"
        />
      </label>
      <el-button
        :disabled="
          !lookDirty ||
          store.runtime.phase !== 'running' ||
          store.controls.camera.mode !== 'free'
        "
        @click="applyLookAngles"
      >
        应用观察角
      </el-button>
      <el-text
        v-if="poseEditError"
        class="pose-edit-error"
        type="danger"
        size="small"
      >
        {{ poseEditError }}
      </el-text>
    </div>

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
    <h2>天体与输出</h2>
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
      <span>太阳方位</span>
      <el-slider
        v-model="store.controls.sun.azimuthDegrees"
        :min="-180"
        :max="180"
        :show-tooltip="false"
      />
      <output>{{ store.controls.sun.azimuthDegrees }}°</output>
    </div>
    <div class="control-row">
      <span>太阳高度</span>
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
    <div class="checkboxes">
      <el-checkbox v-model="store.controls.moon.enabled">
        显示月球
      </el-checkbox>
    </div>
    <div class="control-row">
      <span>月球方位</span>
      <el-slider
        v-model="store.controls.moon.azimuthDegrees"
        :min="-180"
        :max="180"
        :show-tooltip="false"
      />
      <output>{{ store.controls.moon.azimuthDegrees.toFixed(0) }}°</output>
    </div>
    <div class="control-row">
      <span>月球高度</span>
      <el-slider
        v-model="store.controls.moon.elevationDegrees"
        :min="-90"
        :max="90"
        :step="0.5"
        :show-tooltip="false"
      />
      <output>
        {{ store.controls.moon.elevationDegrees.toFixed(1) }}°
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
      <el-checkbox v-model="store.controls.debug.axesIndicator">
        XYZ 视角指示器
      </el-checkbox>
      <el-checkbox v-model="store.controls.debug.attitudeIndicator">
        Body/Look 姿态仪
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

.view-shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.view-shortcuts .el-button {
  width: 100%;
  margin: 0;
}

.pose-editor {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-extra-light);
}

.pose-editor-title {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.pose-editor-title:not(:first-child) {
  margin-top: 4px;
}

.pose-input {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.pose-input .el-input-number {
  width: 100%;
}

.pose-editor .el-button {
  width: 100%;
  margin: 0;
}

.pose-edit-error {
  line-height: 1.4;
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
