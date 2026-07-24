<script setup lang="ts">
import { EARTH_ATMOSPHERE } from './atmosphere/AtmosphereParameters.ts'
import {
  AtmosphereRenderer,
  type AtmosphereDebugView,
  type AtmosphereQuality,
  type AtmosphereRendererInfo,
} from './atmosphere/AtmosphereRenderer.ts'
import {
  CAMERA_PRESETS,
  CameraController,
  INITIAL_CAMERA_ALTITUDE_KM,
  type CameraMode,
  type CameraPresetId,
} from './camera/CameraController.ts'
import { PlanetCamera } from './camera/PlanetCamera.ts'
import {
  altitudeFromPosition,
  INITIAL_CAMERA_RADIAL,
  sunDirectionFromAngles,
  WORLD_UP,
} from './math/coordinates.ts'
import type { Vec3 } from './math/vector3.ts'
import { dot, scale } from './math/vector3.ts'
import {
  DebugOverlay,
  type DebugGridPlane,
} from './ui/DebugOverlay.ts'

const DEFAULT_EXPOSURE = 10
const DEFAULT_QUALITY: AtmosphereQuality = 'medium'

const canvas = ref<HTMLCanvasElement | null>(null)
const debugCanvas = ref<HTMLCanvasElement | null>(null)
const mode = ref<CameraMode>('free')
const verticalFovDegrees = ref(60)
const speedExponent = ref(0)
const sunAzimuthDegrees = ref(135)
const sunElevationDegrees = ref(25)
const exposure = ref(DEFAULT_EXPOSURE)
const geometryDebug = ref(false)
const quality = ref<AtmosphereQuality>(DEFAULT_QUALITY)
const multipleScattering = ref(true)
const debugView = ref<AtmosphereDebugView>('final')
const aerialPerspectiveSlice = ref(1)
const rayleighEnabled = ref(true)
const mieEnabled = ref(true)
const ozoneEnabled = ref(true)
const gridDebug = ref(true)
const skyGridDebug = ref(false)
const gridPlane = ref<DebugGridPlane>('xy')
const statusMessage = ref('正在初始化 WebGPU...')
const errorMessage = ref('')

const telemetry = reactive({
  altitudeKm: INITIAL_CAMERA_ALTITUDE_KM,
  localSunElevationDegrees: 0,
  actualSpeedKmPerSecond: 0,
  targetSpeedKmPerSecond: 0,
  position: [0, 0, 0] as Vec3,
  frameMilliseconds: 0,
  submitMilliseconds: 0,
  rebuiltPasses: '无',
  gpuPasses: '未采样',
  pointerLocked: false,
})

const rendererInfo = ref<AtmosphereRendererInfo | null>(null)

const FIXED_SCENARIOS = [
  {
    id: 'ground-terminator',
    label: '地表晨昏线 60°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 60,
    sunAzimuthDegrees: 90,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'ground-sun-plus-five',
    label: '地表太阳 +5°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 60,
    sunAzimuthDegrees: 95,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'ground-sun-minus-one',
    label: '地表太阳 −1°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 60,
    sunAzimuthDegrees: 89,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'ground-civil-twilight',
    label: '地表太阳 −6°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 60,
    sunAzimuthDegrees: 84,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'ground-nautical-twilight',
    label: '地表太阳 −12°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 60,
    sunAzimuthDegrees: 78,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'ground-astronomical-twilight',
    label: '地表太阳 −18°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 60,
    sunAzimuthDegrees: 72,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'narrow-sunrise',
    label: '地表太阳 5°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 5,
    sunAzimuthDegrees: 90,
    sunElevationDegrees: 0,
    exposure: 2,
  },
  {
    id: 'narrow-sunrise-10',
    label: '地表太阳 10°',
    preset: 'surface',
    quality: 'high',
    verticalFovDegrees: 10,
    sunAzimuthDegrees: 90,
    sunElevationDegrees: 0,
    exposure: 2,
  },
  {
    id: 'high-altitude-terminator',
    label: '高空晨昏线 20 km',
    preset: 'twenty-km',
    quality: 'high',
    verticalFovDegrees: 20,
    sunAzimuthDegrees: 90,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'space-limb',
    label: '太空大气边缘',
    preset: 'space-limb',
    quality: 'high',
    verticalFovDegrees: 20,
    sunAzimuthDegrees: 90,
    sunElevationDegrees: 0,
    exposure: 10,
  },
  {
    id: 'planetary-terminator',
    label: '行星盘晨昏线',
    preset: 'deep-space',
    quality: 'high',
    verticalFovDegrees: 20,
    sunAzimuthDegrees: 90,
    sunElevationDegrees: 0,
    exposure: 10,
  },
] as const satisfies readonly {
  id: string
  label: string
  preset: CameraPresetId
  quality: AtmosphereQuality
  verticalFovDegrees: number
  sunAzimuthDegrees: number
  sunElevationDegrees: number
  exposure: number
}[]

let cameraState: PlanetCamera | null = null
let controller: CameraController | null = null
let renderer: AtmosphereRenderer | null = null
let debugOverlay: DebugOverlay | null = null
let animationFrameId = 0
let disposed = false

function setMode(nextMode: CameraMode): void {
  mode.value = nextMode
  controller?.setMode(nextMode)
}

function applyPreset(id: CameraPresetId): void {
  controller?.applyPreset(id)
}

function selectQuality(nextQuality: AtmosphereQuality): void {
  quality.value = nextQuality

  if (nextQuality === 'reference') {
    multipleScattering.value = false
  }
}

function applyFixedScenario(
  scenario: (typeof FIXED_SCENARIOS)[number],
): void {
  selectQuality(scenario.quality)
  debugView.value = 'final'
  verticalFovDegrees.value = scenario.verticalFovDegrees
  sunAzimuthDegrees.value = scenario.sunAzimuthDegrees
  sunElevationDegrees.value = scenario.sunElevationDegrees
  exposure.value = scenario.exposure
  controller?.applyPreset(scenario.preset)
}

function restoreEarthDefaults(): void {
  verticalFovDegrees.value = 60
  speedExponent.value = 0
  sunAzimuthDegrees.value = 135
  sunElevationDegrees.value = 25
  exposure.value = DEFAULT_EXPOSURE
  geometryDebug.value = false
  quality.value = DEFAULT_QUALITY
  multipleScattering.value = true
  debugView.value = 'final'
  aerialPerspectiveSlice.value = 1
  rayleighEnabled.value = true
  mieEnabled.value = true
  ozoneEnabled.value = true
  gridDebug.value = true
  skyGridDebug.value = false
  gridPlane.value = 'xy'
  setMode('free')
  controller?.applyPreset('surface')
}

function formatDistance(value: number): string {
  if (Math.abs(value) < 1) {
    return `${(value * 1000).toFixed(1)} m`
  }

  return `${value.toFixed(value < 100 ? 2 : 1)} km`
}

function formatVector(vector: Vec3): string {
  return vector.map((component) => component.toFixed(2)).join(', ')
}

function handlePointerLockChange(): void {
  telemetry.pointerLocked = document.pointerLockElement === canvas.value
}

async function start(): Promise<void> {
  const renderingCanvas = canvas.value
  const overlayCanvas = debugCanvas.value

  if (!renderingCanvas || !overlayCanvas) {
    throw new Error('缺少行星大气 canvas 或调试 overlay。')
  }

  const initialRadius =
    EARTH_ATMOSPHERE.bottomRadiusKm + INITIAL_CAMERA_ALTITUDE_KM
  const camera = new PlanetCamera(
    scale(INITIAL_CAMERA_RADIAL, initialRadius),
    [1, 0, 0],
    WORLD_UP,
    60,
  )
  const cameraController = new CameraController(
    renderingCanvas,
    camera,
    EARTH_ATMOSPHERE.bottomRadiusKm,
  )
  const atmosphereRenderer = await AtmosphereRenderer.create(
    renderingCanvas,
    EARTH_ATMOSPHERE,
    (message) => {
      errorMessage.value = message
      statusMessage.value = '渲染已停止'
      cancelAnimationFrame(animationFrameId)
    },
  )

  if (disposed) {
    atmosphereRenderer.destroy()
    return
  }

  cameraState = camera
  controller = cameraController
  renderer = atmosphereRenderer
  const overlay = new DebugOverlay(
    overlayCanvas,
    EARTH_ATMOSPHERE.topRadiusKm * 1.5,
  )
  debugOverlay = overlay
  rendererInfo.value = atmosphereRenderer.info
  cameraController.attach()
  document.addEventListener('pointerlockchange', handlePointerLockChange)
  statusMessage.value = 'WebGPU 大气管线运行中'

  let previousTime: number | null = null
  let telemetryUpdatedAt = performance.now()
  let smoothedFrameMilliseconds = 0

  function renderFrame(now: number): void {
    const frameMilliseconds =
      previousTime === null ? 0 : Math.max(0, now - previousTime)
    const deltaSeconds = Math.min(frameMilliseconds / 1000, 0.05)
    previousTime = now

    cameraController.update(deltaSeconds)

    const sunDirection = sunDirectionFromAngles(
      sunAzimuthDegrees.value,
      sunElevationDegrees.value,
    )
    const frameResult = atmosphereRenderer.render({
      camera,
      sunDirection,
      exposure: exposure.value,
      geometryDebug: geometryDebug.value,
      quality: quality.value,
      multipleScattering:
        quality.value === 'reference' ? false : multipleScattering.value,
      debugView: debugView.value,
      aerialPerspectiveSlice: aerialPerspectiveSlice.value,
      rayleighEnabled: rayleighEnabled.value,
      mieEnabled: mieEnabled.value,
      ozoneEnabled: ozoneEnabled.value,
    })
    overlay.render(
      camera,
      gridPlane.value,
      gridDebug.value,
      skyGridDebug.value,
    )

    smoothedFrameMilliseconds =
      smoothedFrameMilliseconds === 0
        ? frameMilliseconds
        : smoothedFrameMilliseconds * 0.9 + frameMilliseconds * 0.1

    if (now - telemetryUpdatedAt >= 100) {
      telemetry.altitudeKm = altitudeFromPosition(
        camera.position,
        EARTH_ATMOSPHERE.bottomRadiusKm,
      )
      telemetry.localSunElevationDegrees =
        Math.asin(Math.max(-1, Math.min(1, dot(camera.localUp, sunDirection)))) *
        180 /
        Math.PI
      telemetry.actualSpeedKmPerSecond = cameraController.actualSpeedKmPerSecond
      telemetry.targetSpeedKmPerSecond = cameraController.targetSpeedKmPerSecond
      telemetry.position = camera.position
      telemetry.frameMilliseconds = smoothedFrameMilliseconds
      telemetry.submitMilliseconds = frameResult.submitMilliseconds
      telemetry.rebuiltPasses =
        frameResult.rebuiltPasses.length > 0
          ? frameResult.rebuiltPasses.join(', ')
          : '无'
      const gpuPassEntries = frameResult.gpuPassMilliseconds
        ? Object.entries(frameResult.gpuPassMilliseconds)
        : []
      telemetry.gpuPasses =
        gpuPassEntries.length > 0
          ? gpuPassEntries
              .map(([label, milliseconds]) => `${label} ${milliseconds.toFixed(3)} ms`)
              .join(', ')
          : rendererInfo.value?.timestampQuerySupported
            ? '等待采样'
            : '不可用'
      speedExponent.value = cameraController.speedExponent
      telemetryUpdatedAt = now
    }

    animationFrameId = requestAnimationFrame(renderFrame)
  }

  animationFrameId = requestAnimationFrame(renderFrame)
}

watch(verticalFovDegrees, (degrees) => {
  cameraState?.setVerticalFov(degrees)
})

watch(speedExponent, (exponent) => {
  controller?.setSpeedExponent(exponent)
})

onMounted(() => {
  start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    console.error(error)
    errorMessage.value = message
    statusMessage.value = '初始化失败'
  })
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(animationFrameId)
  document.removeEventListener('pointerlockchange', handlePointerLockChange)
  controller?.detach()
  renderer?.destroy()
  debugOverlay?.clear()
})
</script>

<template>
  <div class="planetary-atmosphere">
    <header class="page-header">
      <h1>大气实验</h1>
      <output :class="{ failed: errorMessage }">{{ statusMessage }}</output>
    </header>

    <div class="workspace">
      <section class="viewport" aria-label="星球舞台">
        <div class="canvas-stack">
          <canvas
            ref="canvas"
            class="render-canvas"
            tabindex="0"
            aria-label="原生 WebGPU 星球、太阳和大气壳几何"
          ></canvas>
          <canvas
            ref="debugCanvas"
            class="debug-overlay"
            aria-hidden="true"
          ></canvas>
        </div>
        <pre v-if="errorMessage" class="error">{{ errorMessage }}</pre>
      </section>

      <aside class="controls" aria-label="调试控制">
        <fieldset>
          <legend>摄像机</legend>
          <div class="segmented">
            <button
              type="button"
              :aria-pressed="mode === 'free'"
              @click="setMode('free')"
            >
              Free flight
            </button>
            <button
              type="button"
              :aria-pressed="mode === 'orbit'"
              @click="setMode('orbit')"
            >
              Orbit
            </button>
          </div>

          <label>
            <span>垂直 FOV</span>
            <input v-model.number="verticalFovDegrees" type="range" min="5" max="100" step="1" />
            <output>{{ verticalFovDegrees }}°</output>
          </label>

          <label>
            <span>速度指数</span>
            <input v-model.number="speedExponent" type="range" min="-4" max="6" step="0.25" />
            <output>2^{{ speedExponent.toFixed(2) }}</output>
          </label>

          <div class="presets">
            <button
              v-for="preset in CAMERA_PRESETS"
              :key="preset.id"
              type="button"
              @click="applyPreset(preset.id)"
            >
              {{ preset.label }}
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>太阳与输出</legend>
          <div class="segmented">
            <button
              type="button"
              :aria-pressed="quality === 'reference'"
              @click="selectQuality('reference')"
            >
              Reference
            </button>
            <button
              type="button"
              :aria-pressed="quality === 'low'"
              @click="selectQuality('low')"
            >
              Low
            </button>
            <button
              type="button"
              :aria-pressed="quality === 'medium'"
              @click="selectQuality('medium')"
            >
              Medium
            </button>
            <button
              type="button"
              :aria-pressed="quality === 'high'"
              @click="selectQuality('high')"
            >
              High
            </button>
          </div>
          <label class="checkbox">
            <input
              v-model="multipleScattering"
              type="checkbox"
              :disabled="quality === 'reference'"
            />
            <span>多重散射（Production）</span>
          </label>
          <label class="checkbox">
            <input v-model="rayleighEnabled" type="checkbox" />
            <span>Rayleigh</span>
          </label>
          <label class="checkbox">
            <input v-model="mieEnabled" type="checkbox" />
            <span>Mie</span>
          </label>
          <label class="checkbox">
            <input v-model="ozoneEnabled" type="checkbox" />
            <span>Ozone 吸收</span>
          </label>
          <label>
            <span>调试视图</span>
            <select v-model="debugView">
              <option value="final">Final</option>
              <option value="transmittance">Transmittance</option>
              <option value="multiple-scattering">Multi-Scattering</option>
              <option value="sky-view">Sky-View</option>
              <option value="aerial-radiance">Aerial L</option>
              <option value="aerial-transmittance">Aerial T</option>
              <option value="density">Density RGB</option>
            </select>
          </label>
          <label
            v-if="
              debugView === 'aerial-radiance' ||
              debugView === 'aerial-transmittance'
            "
          >
            <span>体切片</span>
            <input
              v-model.number="aerialPerspectiveSlice"
              type="range"
              min="0"
              max="1"
              step="0.01"
            />
            <output>{{ aerialPerspectiveSlice.toFixed(2) }}</output>
          </label>
          <div class="presets">
            <button
              v-for="scenario in FIXED_SCENARIOS"
              :key="scenario.id"
              type="button"
              @click="applyFixedScenario(scenario)"
            >
              {{ scenario.label }}
            </button>
          </div>
          <label>
            <span>方位角</span>
            <input v-model.number="sunAzimuthDegrees" type="range" min="-180" max="180" step="1" />
            <output>{{ sunAzimuthDegrees }}°</output>
          </label>
          <label>
            <span>高度角</span>
            <input v-model.number="sunElevationDegrees" type="range" min="-20" max="90" step="0.5" />
            <output>{{ sunElevationDegrees.toFixed(1) }}°</output>
          </label>
          <label>
            <span>曝光</span>
            <input v-model.number="exposure" type="range" min="0.25" max="20" step="0.25" />
            <output>{{ exposure.toFixed(2) }}</output>
          </label>
          <label class="checkbox">
            <input v-model="geometryDebug" type="checkbox" />
            <span>几何分类调试</span>
          </label>
          <label class="checkbox">
            <input v-model="gridDebug" type="checkbox" />
            <span>全局 XYZ 网格</span>
          </label>
          <label class="checkbox">
            <input v-model="skyGridDebug" type="checkbox" />
            <span>天空经纬网格</span>
          </label>
          <label>
            <span>网格平面</span>
            <select v-model="gridPlane">
              <option value="xy">XY</option>
              <option value="xz">XZ</option>
              <option value="yz">YZ</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>坐标与帧</legend>
          <dl>
            <dt>高度</dt>
            <dd>{{ formatDistance(telemetry.altitudeKm) }}</dd>
            <dt>局部太阳高度</dt>
            <dd>{{ telemetry.localSunElevationDegrees.toFixed(2) }}°</dd>
            <dt>实际速度</dt>
            <dd>{{ formatDistance(telemetry.actualSpeedKmPerSecond) }}/s</dd>
            <dt>目标速度</dt>
            <dd>{{ formatDistance(telemetry.targetSpeedKmPerSecond) }}/s</dd>
            <dt>位置 km</dt>
            <dd>{{ formatVector(telemetry.position) }}</dd>
            <dt>帧时间</dt>
            <dd>{{ telemetry.frameMilliseconds.toFixed(2) }} ms</dd>
            <dt>CPU submit</dt>
            <dd>{{ telemetry.submitMilliseconds.toFixed(2) }} ms</dd>
            <dt>本帧重建</dt>
            <dd>{{ telemetry.rebuiltPasses }}</dd>
            <dt>GPU pass</dt>
            <dd>{{ telemetry.gpuPasses }}</dd>
            <dt>Pointer lock</dt>
            <dd>{{ telemetry.pointerLocked ? '已锁定' : '未锁定' }}</dd>
          </dl>
        </fieldset>

        <fieldset v-if="rendererInfo">
          <legend>WebGPU</legend>
          <dl>
            <dt>画布格式</dt>
            <dd>{{ rendererInfo.canvasFormat }}</dd>
            <dt>适配器</dt>
            <dd>{{ rendererInfo.adapter }}</dd>
            <dt>GPU timestamp</dt>
            <dd>
              {{ rendererInfo.timestampQuerySupported ? '已启用' : '不支持' }}
            </dd>
          </dl>
        </fieldset>

        <button type="button" @click="restoreEarthDefaults">恢复 Earth 默认值</button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.planetary-atmosphere {
  min-width: 0;
}

.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #a2a9b1;
}

.page-header output {
  font-size: 13px;
  color: #54595d;
}

.page-header output.failed,
.error {
  color: #b32424;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  min-height: calc(100vh - 74px);
}

.viewport {
  min-width: 0;
  padding: 10px 10px 0 0;
}

.canvas-stack {
  position: relative;
  width: 100%;
  height: calc(100vh - 94px);
  min-height: 420px;
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
  border: 1px solid #72777d;
  background: #000;
  outline: none;
}

.render-canvas:focus {
  border-color: #36c;
  box-shadow: 0 0 0 1px #36c;
}

.debug-overlay {
  pointer-events: none;
}

.error {
  box-sizing: border-box;
  width: 100%;
  margin: 8px 0 0;
  padding: 8px;
  border: 1px solid #b32424;
  white-space: pre-wrap;
}

.controls {
  min-width: 0;
  padding: 10px 0 16px 10px;
  border-left: 1px solid #a2a9b1;
  background: #f8f9fa;
}

fieldset {
  margin: 0 0 14px;
  padding: 8px 0 0;
  border: 0;
  border-top: 1px solid #c8ccd1;
}

legend {
  padding: 0 8px 0 0;
  font-weight: 700;
}

label {
  display: grid;
  grid-template-columns: 78px minmax(80px, 1fr) 62px;
  align-items: center;
  gap: 6px;
  margin: 7px 0;
  font-size: 13px;
}

label output {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

input[type='range'] {
  width: 100%;
}

.checkbox {
  grid-template-columns: auto 1fr;
}

.segmented,
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

button {
  min-height: 30px;
  border: 1px solid #72777d;
  border-radius: 2px;
  color: #202122;
  background: #fff;
  cursor: pointer;
}

button:hover {
  background: #eaecf0;
}

button[aria-pressed='true'] {
  color: #fff;
  border-color: #36c;
  background: #36c;
}

.segmented button {
  flex: 1;
}

.presets button {
  flex: 1 0 56px;
}

dl {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 3px 8px;
  margin: 0;
  font-size: 12px;
}

dt {
  color: #54595d;
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .viewport {
    padding-right: 0;
  }

  .canvas-stack {
    height: 58vh;
    min-height: 320px;
  }

  .controls {
    padding-left: 0;
    border-top: 1px solid #a2a9b1;
    border-left: 0;
  }
}
</style>
