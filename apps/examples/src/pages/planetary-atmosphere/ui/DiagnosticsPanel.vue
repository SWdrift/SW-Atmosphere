<script setup lang="ts">
import type { Vec3 } from '../math/vector3.ts'
import { useAtmosphereStore } from '../model/atmosphereStore.ts'

const store = useAtmosphereStore()

function formatDistance(value: number): string {
  if (Math.abs(value) < 1) {
    return `${(value * 1000).toFixed(1)} m`
  }

  return `${value.toFixed(value < 100 ? 2 : 1)} km`
}

function formatVector(vector: Vec3 | null): string {
  if (vector === null) {
    return '—'
  }

  return vector.map((component) => component.toFixed(2)).join(', ')
}

function formatAngle(degrees: number | null): string {
  return degrees === null ? '—' : `${degrees.toFixed(2)}°`
}
</script>

<template>
  <section class="panel-section">
    <h2>坐标与帧</h2>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="高度">
        {{ formatDistance(store.runtime.telemetry.altitudeKm) }}
      </el-descriptions-item>
      <el-descriptions-item label="局部太阳高度">
        {{
          store.runtime.telemetry.localSunElevationDegrees.toFixed(2)
        }}°
      </el-descriptions-item>
      <el-descriptions-item label="实际速度">
        {{
          formatDistance(
            store.runtime.telemetry.actualSpeedKmPerSecond,
          )
        }}/s
      </el-descriptions-item>
      <el-descriptions-item label="目标速度">
        {{
          formatDistance(
            store.runtime.telemetry.targetSpeedKmPerSecond,
          )
        }}/s
      </el-descriptions-item>
      <el-descriptions-item label="位置 km">
        {{ formatVector(store.runtime.telemetry.position) }}
      </el-descriptions-item>
      <el-descriptions-item label="View forward">
        {{ formatVector(store.runtime.telemetry.viewForward) }}
      </el-descriptions-item>
      <el-descriptions-item label="Body right">
        {{ formatVector(store.runtime.telemetry.bodyRight) }}
      </el-descriptions-item>
      <el-descriptions-item label="Body forward">
        {{ formatVector(store.runtime.telemetry.bodyForward) }}
      </el-descriptions-item>
      <el-descriptions-item label="Body up">
        {{ formatVector(store.runtime.telemetry.bodyUp) }}
      </el-descriptions-item>
      <el-descriptions-item label="观察偏航角">
        {{ formatAngle(store.runtime.telemetry.lookYawDegrees) }}
      </el-descriptions-item>
      <el-descriptions-item label="观察俯仰角">
        {{ formatAngle(store.runtime.telemetry.lookPitchDegrees) }}
      </el-descriptions-item>
      <el-descriptions-item label="帧时间">
        {{ store.runtime.telemetry.frameMilliseconds.toFixed(2) }} ms
      </el-descriptions-item>
      <el-descriptions-item label="CPU submit">
        {{ store.runtime.telemetry.submitMilliseconds.toFixed(2) }} ms
      </el-descriptions-item>
      <el-descriptions-item label="本帧重建">
        {{ store.runtime.telemetry.rebuiltPasses }}
      </el-descriptions-item>
      <el-descriptions-item label="GPU pass">
        {{ store.runtime.telemetry.gpuPasses }}
      </el-descriptions-item>
      <el-descriptions-item label="Pointer lock">
        {{
          store.runtime.telemetry.pointerLocked
            ? '已锁定'
            : '未锁定'
        }}
      </el-descriptions-item>
    </el-descriptions>
  </section>

  <section
    v-if="store.runtime.rendererInfo"
    class="panel-section"
  >
    <h2>WebGPU</h2>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="画布格式">
        {{ store.runtime.rendererInfo.canvasFormat }}
      </el-descriptions-item>
      <el-descriptions-item label="适配器">
        {{ store.runtime.rendererInfo.adapter }}
      </el-descriptions-item>
      <el-descriptions-item label="GPU timestamp">
        {{
          store.runtime.rendererInfo.timestampQuerySupported
            ? '已启用'
            : '不支持'
        }}
      </el-descriptions-item>
    </el-descriptions>
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

.panel-section :deep(.el-descriptions__label) {
  width: 108px;
}

.panel-section :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
