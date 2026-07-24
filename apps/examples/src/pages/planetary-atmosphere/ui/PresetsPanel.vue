<script setup lang="ts">
import {
  CAMERA_PRESETS,
  type CameraPresetId,
} from '../camera/cameraPresets.ts'
import { VALIDATION_CASES } from '../model/validationCases.ts'
import { useAtmosphereStore } from '../model/atmosphereStore.ts'

const emit = defineEmits<{
  'apply-preset': [id: CameraPresetId]
  'activate-case': [id: string]
  'run-path': [id: string]
  'stop-path': []
  'set-reference-visible': [visible: boolean]
  'set-reference-mix': [mix: number]
}>()

const store = useAtmosphereStore()
const activeValidationCase = computed(() =>
  VALIDATION_CASES.find(
    (candidate) => candidate.id === store.workbench.activeCaseId,
  ),
)
const activeReference = computed(() =>
  activeValidationCase.value === undefined
    ? null
    : activeValidationCase.value.reference,
)

function setReferenceVisible(value: string | number | boolean): void {
  if (typeof value !== 'boolean') {
    throw new Error('参考图显示状态必须是 boolean。')
  }

  emit('set-reference-visible', value)
}

function setReferenceMix(value: number | number[]): void {
  if (typeof value !== 'number') {
    throw new Error('参考图混合比例必须是单个数值。')
  }

  emit('set-reference-mix', value)
}
</script>

<template>
  <section class="panel-section">
    <h2>摄像机预设</h2>
    <div class="preset-buttons">
      <el-button
        v-for="preset in CAMERA_PRESETS"
        :key="preset.id"
        :disabled="store.runtime.phase !== 'running'"
        @click="emit('apply-preset', preset.id)"
      >
        {{ preset.label }}
      </el-button>
    </div>
  </section>

  <section class="panel-section">
    <h2>验证用例</h2>
    <div class="preset-buttons">
      <el-button
        v-for="validationCase in VALIDATION_CASES"
        :key="validationCase.id"
        :type="
          store.workbench.activeCaseId === validationCase.id
            ? 'primary'
            : 'default'
        "
        :disabled="store.runtime.phase !== 'running'"
        @click="emit('activate-case', validationCase.id)"
      >
        {{ validationCase.label }}
      </el-button>
    </div>

    <el-alert
      v-if="store.workbench.errorMessage"
      class="workbench-error"
      :title="store.workbench.errorMessage"
      type="error"
      :closable="false"
    />

    <div class="reference-controls">
      <el-checkbox
        :model-value="store.workbench.referenceVisible"
        @update:model-value="setReferenceVisible"
      >
        显示参考图
      </el-checkbox>
      <el-slider
        :model-value="store.workbench.referenceMix"
        :min="0"
        :max="1"
        :step="0.05"
        :show-tooltip="false"
        @update:model-value="setReferenceMix"
      />
      <output>
        {{ store.workbench.referenceMix.toFixed(2) }}
      </output>
    </div>

    <template v-if="activeValidationCase">
      <template v-if="activeReference">
        <el-text size="small" type="info">
          {{ activeReference.comparable }}
        </el-text>
        <el-text class="reference-note" size="small" type="info">
          {{ activeReference.unknowns }}
        </el-text>
      </template>
      <el-text v-else size="small" type="info">
        当前验证用例没有参考图。
      </el-text>

      <div
        v-if="activeValidationCase.path"
        class="path-controls"
      >
        <el-button
          type="primary"
          :loading="store.workbench.phase === 'running-path'"
          :disabled="store.workbench.phase === 'running-path'"
          @click="emit('run-path', activeValidationCase.path.id)"
        >
          运行：{{ activeValidationCase.path.label }}
        </el-button>
        <el-button
          :disabled="store.workbench.phase !== 'running-path'"
          @click="emit('stop-path')"
        >
          停止
        </el-button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.panel-section + .panel-section {
  margin-top: 16px;
}

.panel-section h2 {
  margin: 0 0 10px;
  font-size: 14px;
}

.preset-buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.preset-buttons .el-button {
  width: 100%;
  margin: 0;
}

.workbench-error,
.reference-controls,
.path-controls {
  margin-top: 10px;
}

.reference-controls {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 40px;
  align-items: center;
  gap: 8px;
}

.reference-controls output {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.reference-note {
  display: block;
  margin-top: 4px;
}

.path-controls {
  display: flex;
}
</style>
