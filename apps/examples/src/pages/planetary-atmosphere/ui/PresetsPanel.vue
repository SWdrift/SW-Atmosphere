<script setup lang="ts">
import {
  CAMERA_PRESETS,
  type CameraPresetId,
} from '../camera/cameraPresets.ts'
import {
  VALIDATION_CASE_CATEGORIES,
  VALIDATION_CASES,
} from '../model/validationCases.ts'
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
    <div
      v-for="category in VALIDATION_CASE_CATEGORIES"
      :key="category.id"
      class="case-category"
    >
      <div class="case-category-title">{{ category.label }}</div>
      <div
        v-for="group in category.groups"
        :key="group.id"
        class="case-group"
      >
        <h3>{{ group.label }}</h3>
        <el-text class="case-group-description" size="small" type="info">
          {{ group.description }}
        </el-text>
        <div class="preset-buttons case-buttons">
          <el-button
            v-for="validationCase in group.cases"
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
      </div>
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
      <el-text class="case-objective" size="small">
        {{ activeValidationCase.objective }}
      </el-text>
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

.case-category + .case-category {
  margin-top: 18px;
}

.case-category-title {
  margin-bottom: 8px;
  color: var(--el-color-primary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.case-group {
  padding: 9px 10px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-extra-light);
}

.case-group + .case-group {
  margin-top: 8px;
}

.case-group h3 {
  margin: 0 0 3px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.case-group-description {
  display: block;
  line-height: 1.45;
}

.preset-buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.case-buttons {
  margin-top: 6px;
}

.preset-buttons .el-button {
  width: 100%;
  height: auto;
  margin: 0;
  white-space: normal;
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

.case-objective {
  display: block;
  margin-top: 10px;
}

.path-controls {
  display: flex;
}
</style>
