import {
  validateMoonMaterial,
  type MoonMaterial,
} from '../celestial/CelestialMaterials.ts'
import type { CelestialRenderFrame } from '../celestial/CelestialRenderFrame.ts'
import { normalize, subtract, type Vec3 } from '../math/vector3.ts'
import {
  ATMOSPHERE_UNIFORM_BYTE_SIZE,
  serializeAtmosphereParameters,
  type AtmosphereParameters,
} from './AtmosphereParameters.ts'
import { AtmosphereLutPipeline } from './AtmosphereLutPipeline.ts'
import type { AtmosphereCameraFrame } from './AtmosphereFrame.ts'
import { GpuTimestampRecorder } from './GpuTimestampRecorder.ts'
import stageOneShader from './shaders/stageOne.wgsl?raw'

const FRAME_UNIFORM_FLOAT_COUNT = 40
const FRAME_UNIFORM_BYTE_SIZE =
  FRAME_UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT

export type AtmosphereQuality = 'reference' | 'low' | 'medium' | 'high'
export type AtmosphereDebugView =
  | 'final'
  | 'transmittance'
  | 'multiple-scattering'
  | 'sky-view'
  | 'aerial-radiance'
  | 'aerial-transmittance'
  | 'density'

const QUALITY_SETTINGS = Object.freeze({
  reference: {
    production: false,
    referenceViewSteps: 48,
    referenceLightSteps: 24,
    skyViewSteps: 32,
    aerialPerspectiveSteps: 16,
  },
  low: {
    production: true,
    referenceViewSteps: 24,
    referenceLightSteps: 12,
    skyViewSteps: 12,
    aerialPerspectiveSteps: 6,
  },
  medium: {
    production: true,
    referenceViewSteps: 32,
    referenceLightSteps: 16,
    skyViewSteps: 20,
    aerialPerspectiveSteps: 10,
  },
  high: {
    production: true,
    referenceViewSteps: 48,
    referenceLightSteps: 24,
    skyViewSteps: 32,
    aerialPerspectiveSteps: 16,
  },
} satisfies Record<
  AtmosphereQuality,
  {
    production: boolean
    referenceViewSteps: number
    referenceLightSteps: number
    skyViewSteps: number
    aerialPerspectiveSteps: number
  }
>)

const DEBUG_VIEW_INDEX = Object.freeze({
  final: 0,
  transmittance: 1,
  'multiple-scattering': 2,
  'sky-view': 3,
  'aerial-radiance': 4,
  'aerial-transmittance': 5,
  density: 6,
} satisfies Record<AtmosphereDebugView, number>)

export interface StageOneFrame {
  camera: AtmosphereCameraFrame
  celestial: CelestialRenderFrame
  exposure: number
  geometryDebug: boolean
  quality: AtmosphereQuality
  multipleScattering: boolean
  debugView: AtmosphereDebugView
  aerialPerspectiveSlice: number
  rayleighEnabled: boolean
  mieEnabled: boolean
  ozoneEnabled: boolean
}

export interface AtmosphereRendererInfo {
  adapter: string
  canvasFormat: GPUTextureFormat
  timestampQuerySupported: boolean
}

export interface AtmosphereFrameResult {
  submitMilliseconds: number
  rebuiltPasses: readonly string[]
  gpuPassMilliseconds: Readonly<Record<string, number>> | null
}

export class AtmosphereRenderer {
  readonly info: AtmosphereRendererInfo

  private readonly canvas: HTMLCanvasElement
  private readonly context: GPUCanvasContext
  private readonly device: GPUDevice
  private readonly topRadiusKm: number
  private readonly moonMaterial: MoonMaterial
  private readonly pipeline: GPURenderPipeline
  private readonly lutPipeline: AtmosphereLutPipeline
  private readonly timestampRecorder: GpuTimestampRecorder | null
  private readonly atmosphereUniformBuffer: GPUBuffer
  private readonly frameUniformBuffer: GPUBuffer
  private readonly bindGroup: GPUBindGroup
  private readonly frameUniformData = new Float32Array(FRAME_UNIFORM_FLOAT_COUNT)
  private readonly onFatalError: (message: string) => void
  private active = true
  private destroyed = false

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    topRadiusKm: number,
    moonMaterial: MoonMaterial,
    pipeline: GPURenderPipeline,
    lutPipeline: AtmosphereLutPipeline,
    timestampRecorder: GpuTimestampRecorder | null,
    atmosphereUniformBuffer: GPUBuffer,
    frameUniformBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    info: AtmosphereRendererInfo,
    onFatalError: (message: string) => void,
  ) {
    this.canvas = canvas
    this.context = context
    this.device = device
    this.topRadiusKm = topRadiusKm
    this.moonMaterial = moonMaterial
    this.pipeline = pipeline
    this.lutPipeline = lutPipeline
    this.timestampRecorder = timestampRecorder
    this.atmosphereUniformBuffer = atmosphereUniformBuffer
    this.frameUniformBuffer = frameUniformBuffer
    this.bindGroup = bindGroup
    this.info = info
    this.onFatalError = onFatalError
  }

  static async create(
    canvas: HTMLCanvasElement,
    parameters: AtmosphereParameters,
    moonMaterial: MoonMaterial,
    onFatalError: (message: string) => void,
  ): Promise<AtmosphereRenderer> {
    const atmosphereUniformData = serializeAtmosphereParameters(parameters)
    validateMoonMaterial(moonMaterial)
    const gpu = navigator.gpu

    if (!gpu) {
      throw new Error('当前浏览器未提供 WebGPU。请使用支持 WebGPU 的浏览器并启用硬件加速。')
    }

    const adapter = await gpu.requestAdapter()

    if (!adapter) {
      throw new Error('没有找到可用的 WebGPU 适配器。')
    }

    const timestampQuerySupported = adapter.features.has('timestamp-query')
    const device = await adapter.requestDevice({
      requiredFeatures: timestampQuerySupported ? ['timestamp-query'] : [],
    })
    const context = canvas.getContext('webgpu') as GPUCanvasContext | null

    if (!context) {
      device.destroy()
      throw new Error('无法获取 WebGPU canvas 上下文。')
    }

    const canvasFormat = gpu.getPreferredCanvasFormat()
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque',
    })

    const shaderModule = device.createShaderModule({
      label: '星球舞台阶段一 WGSL',
      code: stageOneShader,
    })
    const compilationInfo = await shaderModule.getCompilationInfo()
    const diagnostics = compilationInfo.messages
      .map(
        (message) =>
          `${message.type.toUpperCase()} ${message.lineNum}:${message.linePos} ${message.message}`,
      )
      .join('\n')
    const hasShaderError = compilationInfo.messages.some(
      (message) => message.type === 'error',
    )

    if (diagnostics.length > 0) {
      console[hasShaderError ? 'error' : 'warn'](diagnostics)
    }

    if (hasShaderError) {
      device.destroy()
      throw new Error(`阶段一 WGSL 编译失败：\n${diagnostics}`)
    }

    device.pushErrorScope('validation')

    let pipeline: GPURenderPipeline

    try {
      pipeline = device.createRenderPipeline({
        label: '星球舞台阶段一渲染管线',
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [{ format: canvasFormat }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      })
    } catch (error) {
      await device.popErrorScope()
      device.destroy()
      throw error
    }

    const pipelineError = await device.popErrorScope()

    if (pipelineError) {
      device.destroy()
      throw new Error(`阶段一渲染管线校验失败：\n${pipelineError.message}`)
    }

    const bufferUsage = (
      globalThis as typeof globalThis & {
        GPUBufferUsage?: {
          UNIFORM: number
          COPY_DST: number
          QUERY_RESOLVE: number
          COPY_SRC: number
          MAP_READ: number
        }
      }
    ).GPUBufferUsage

    if (!bufferUsage) {
      device.destroy()
      throw new Error('当前环境缺少 GPUBufferUsage 常量。')
    }

    const textureUsage = (
      globalThis as typeof globalThis & {
        GPUTextureUsage?: { TEXTURE_BINDING: number; STORAGE_BINDING: number }
      }
    ).GPUTextureUsage

    if (!textureUsage) {
      device.destroy()
      throw new Error('当前环境缺少 GPUTextureUsage 常量。')
    }
    const mapMode = (
      globalThis as typeof globalThis & {
        GPUMapMode?: { READ: number }
      }
    ).GPUMapMode

    if (!mapMode) {
      device.destroy()
      throw new Error('当前环境缺少 GPUMapMode 常量。')
    }

    const atmosphereUniformBuffer = device.createBuffer({
      label: '大气物理参数',
      size: ATMOSPHERE_UNIFORM_BYTE_SIZE,
      usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
    })
    const frameUniformBuffer = device.createBuffer({
      label: '星球舞台帧参数',
      size: FRAME_UNIFORM_BYTE_SIZE,
      usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(atmosphereUniformBuffer, 0, atmosphereUniformData)
    const initialFrameUniformData = new Float32Array(FRAME_UNIFORM_FLOAT_COUNT)
    initialFrameUniformData.set([1, 1, 1, 0], 32)
    device.queue.writeBuffer(frameUniformBuffer, 0, initialFrameUniformData)

    device.pushErrorScope('validation')
    const bindGroup = device.createBindGroup({
      label: '大气与帧参数绑定组',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: frameUniformBuffer } },
      ],
    })
    let lutPipeline: AtmosphereLutPipeline

    try {
      lutPipeline = await AtmosphereLutPipeline.create(
        device,
        shaderModule,
        pipeline,
        atmosphereUniformBuffer,
        frameUniformBuffer,
        textureUsage,
      )
    } catch (error) {
      await device.popErrorScope()
      atmosphereUniformBuffer.destroy()
      frameUniformBuffer.destroy()
      device.destroy()
      throw error
    }
    const resourceError = await device.popErrorScope()

    if (resourceError) {
      lutPipeline.destroy()
      atmosphereUniformBuffer.destroy()
      frameUniformBuffer.destroy()
      device.destroy()
      throw new Error(`大气渲染资源校验失败：\n${resourceError.message}`)
    }
    const timestampRecorder = timestampQuerySupported
      ? new GpuTimestampRecorder(device, bufferUsage, mapMode.READ)
      : null
    const adapterDescription = [
      adapter.info.vendor,
      adapter.info.architecture,
      adapter.info.device,
      adapter.info.description,
    ]
      .filter((part) => part.length > 0)
      .join(' / ')

    const renderer = new AtmosphereRenderer(
      canvas,
      context,
      device,
      parameters.topRadiusKm,
      moonMaterial,
      pipeline,
      lutPipeline,
      timestampRecorder,
      atmosphereUniformBuffer,
      frameUniformBuffer,
      bindGroup,
      {
        adapter: adapterDescription.length > 0 ? adapterDescription : '未提供适配器信息',
        canvasFormat,
        timestampQuerySupported,
      },
      onFatalError,
    )

    device.addEventListener('uncapturederror', renderer.handleUncapturedError)
    void device.lost.then((lostInfo) => {
      if (renderer.active) {
        renderer.active = false
        onFatalError(`WebGPU device lost：${lostInfo.reason}，${lostInfo.message}`)
      }
    })

    return renderer
  }

  render(frame: StageOneFrame): AtmosphereFrameResult {
    if (!this.active) {
      throw new Error('WebGPU renderer 已停止。')
    }

    const startedAt = performance.now()
    this.resizeCanvas()
    this.writeUniforms(frame)
    this.timestampRecorder?.beginFrame(startedAt)

    const commandEncoder = this.device.createCommandEncoder({
      label: '星球舞台帧命令编码器',
    })
    const quality = QUALITY_SETTINGS[frame.quality]
    const sunDirection = normalize(subtract(
      frame.celestial.sunCenterFromCameraKm,
      frame.celestial.earthCenterFromCameraKm,
    ))
    const needsDynamicLuts =
      quality.production ||
      frame.debugView === 'sky-view' ||
      frame.debugView === 'aerial-radiance' ||
      frame.debugView === 'aerial-transmittance'
    const rebuiltPasses = this.lutPipeline.encodeDynamic(
      commandEncoder,
      {
        ...frame,
        sunDirection,
        solarIrradianceScale:
          frame.celestial.solarIrradianceScale,
      },
      quality,
      this.canvas.width,
      this.canvas.height,
      this.topRadiusKm,
      needsDynamicLuts,
      (label) => this.timestampRecorder?.timestampWrites(label),
    )

    const renderPass = commandEncoder.beginRenderPass({
      label: '星球舞台阶段一 render pass',
      timestampWrites: this.timestampRecorder?.timestampWrites('Final'),
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })

    renderPass.setPipeline(this.pipeline)
    renderPass.setBindGroup(0, this.bindGroup)
    renderPass.setBindGroup(1, this.lutPipeline.renderBindGroup)
    renderPass.draw(3)
    renderPass.end()
    const readsTimestamps = this.timestampRecorder?.resolve(commandEncoder) === true
    this.device.queue.submit([commandEncoder.finish()])

    if (readsTimestamps) {
      this.timestampRecorder?.readSubmitted()
    }

    return {
      submitMilliseconds: performance.now() - startedAt,
      rebuiltPasses,
      gpuPassMilliseconds: this.timestampRecorder?.latest ?? null,
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.active = false
    this.device.removeEventListener('uncapturederror', this.handleUncapturedError)
    this.context.unconfigure()
    this.atmosphereUniformBuffer.destroy()
    this.frameUniformBuffer.destroy()
    this.lutPipeline.destroy()
    this.timestampRecorder?.destroy()
    this.device.destroy()
  }

  private resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const maxSize = this.device.limits.maxTextureDimension2D
    const width = Math.max(1, Math.min(Math.floor(this.canvas.clientWidth * dpr), maxSize))
    const height = Math.max(
      1,
      Math.min(Math.floor(this.canvas.clientHeight * dpr), maxSize),
    )

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  private writeUniforms(frame: StageOneFrame): void {
    const { camera } = frame
    const planetCenterRelativeToCamera: Vec3 = [
      -camera.position[0],
      -camera.position[1],
      -camera.position[2],
    ]
    const tangentHalfFov = Math.tan((camera.verticalFovDegrees * Math.PI) / 360)
    const aspect = this.canvas.width / this.canvas.height
    const quality = QUALITY_SETTINGS[frame.quality]

    if (
      !Number.isFinite(frame.aerialPerspectiveSlice) ||
      frame.aerialPerspectiveSlice < 0 ||
      frame.aerialPerspectiveSlice > 1
    ) {
      throw new Error('Aerial Perspective 调试切片必须位于 0 到 1。')
    }
    const { celestial } = frame

    this.frameUniformData.set(
      [
        ...planetCenterRelativeToCamera,
        frame.exposure,
        ...camera.right,
        tangentHalfFov,
        ...camera.up,
        aspect,
        ...camera.forward,
        frame.geometryDebug ? 1 : 0,
        ...celestial.sunCenterFromCameraKm,
        celestial.sunRadiusKm,
        ...celestial.moonCenterFromCameraKm,
        celestial.moonRadiusKm,
        quality.referenceViewSteps,
        quality.referenceLightSteps,
        quality.production ? 1 : 0,
        frame.multipleScattering ? 1 : 0,
        quality.skyViewSteps,
        quality.aerialPerspectiveSteps,
        DEBUG_VIEW_INDEX[frame.debugView],
        frame.aerialPerspectiveSlice,
        frame.rayleighEnabled ? 1 : 0,
        frame.mieEnabled ? 1 : 0,
        frame.ozoneEnabled ? 1 : 0,
        frame.quality === 'high' ||
        camera.verticalFovDegrees <= 20 ||
        celestial.earthEclipsePossible
          ? 1
          : 0,
        ...this.moonMaterial.diffuseReflectance,
        celestial.solarIrradianceScale,
      ],
      0,
    )

    this.device.queue.writeBuffer(
      this.frameUniformBuffer,
      0,
      this.frameUniformData,
    )
  }

  private readonly handleUncapturedError = (event: GPUUncapturedErrorEvent): void => {
    console.error('WebGPU 未捕获错误：', event.error)
    this.onFatalError(`WebGPU 运行时错误：${event.error.message}`)
  }
}
