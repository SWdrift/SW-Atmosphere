<script setup lang="ts">
import { useAtmosphereScene } from './composables/useAtmosphereScene.ts'
import { useAtmosphereStore } from './model/atmosphereStore.ts'
import { VALIDATION_CASES } from './model/validationCases.ts'
import AtmospherePanel from './ui/AtmospherePanel.vue'
import DiagnosticsPanel from './ui/DiagnosticsPanel.vue'
import ParametersPanel from './ui/ParametersPanel.vue'
import PresetsPanel from './ui/PresetsPanel.vue'

const renderingCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const store = useAtmosphereStore()
const {
  applyCameraPreset,
  restoreEarthDefaults,
  workbench,
} = useAtmosphereScene(renderingCanvas, overlayCanvas)
const activeValidationCase = computed(() =>
  VALIDATION_CASES.find(
    (candidate) => candidate.id === store.workbench.activeCaseId,
  ),
)
</script>

<template>
  <div class="planetary-atmosphere">
    <header class="page-header">
      <h1>大气实验</h1>
      <el-text
        :type="store.runtime.errorMessage ? 'danger' : 'info'"
        size="small"
      >
        {{ store.runtime.statusMessage }}
      </el-text>
    </header>

    <div class="workspace">
      <section class="viewport" aria-label="星球舞台">
        <div class="canvas-stack">
          <canvas
            ref="renderingCanvas"
            class="render-canvas"
            tabindex="0"
            aria-label="原生 WebGPU 星球、太阳和大气壳几何"
          ></canvas>
          <canvas
            ref="overlayCanvas"
            class="debug-overlay"
            aria-hidden="true"
          ></canvas>
          <figure
            v-if="
              activeValidationCase &&
              store.workbench.referenceVisible
            "
            class="reference-overlay"
            :style="{ opacity: store.workbench.referenceOpacity }"
          >
            <img
              :key="activeValidationCase.id"
              :src="activeValidationCase.reference.src"
              :alt="activeValidationCase.reference.label"
              @load="store.setReferenceLoaded(true)"
              @error="
                store.setReferenceLoadFailed(
                  `参考图加载失败：${activeValidationCase.reference.label}`,
                )
              "
            />
            <figcaption>
              {{ activeValidationCase.reference.label }}
            </figcaption>
          </figure>
        </div>
        <el-alert
          v-if="store.runtime.errorMessage"
          class="error"
          :title="store.runtime.errorMessage"
          type="error"
          :closable="false"
          show-icon
        />
      </section>

      <AtmospherePanel>
        <template #parameters>
          <ParametersPanel
            @restore-defaults="restoreEarthDefaults"
          />
        </template>

        <template #presets>
          <PresetsPanel
            @apply-preset="applyCameraPreset"
            @activate-case="workbench.activateCase"
            @run-path="workbench.runPath"
            @stop-path="workbench.stopPath"
          />
        </template>

        <template #diagnostics>
          <DiagnosticsPanel />
        </template>
      </AtmospherePanel>
    </div>
  </div>
</template>

<style scoped>
.planetary-atmosphere {
  height: 100%;
  min-width: 0;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 40px;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  height: calc(100% - 40px);
  min-height: 0;
}

.viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.canvas-stack {
  position: relative;
  width: 100%;
  height: 100%;
}

.render-canvas,
.debug-overlay {
  position: absolute;
  inset: 0;
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}

.render-canvas {
  border: 1px solid var(--el-border-color);
  background: #000;
  outline: none;
}

.render-canvas:focus {
  border-color: var(--el-color-primary);
}

.debug-overlay {
  pointer-events: none;
}

.reference-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  margin: 0;
  pointer-events: none;
  background: #000;
}

.reference-overlay img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
}

.reference-overlay figcaption {
  padding: 6px 8px;
  color: #fff;
  background: rgb(0 0 0 / 70%);
  font-size: 12px;
}

.error {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
}

@media (max-width: 1000px) {
  .planetary-atmosphere {
    height: auto;
  }

  .workspace {
    grid-template-columns: 1fr;
    height: auto;
  }

  .canvas-stack {
    height: 58vh;
    min-height: 320px;
  }

  .workspace :deep(.atmosphere-panel) {
    height: 520px;
  }
}
</style>
