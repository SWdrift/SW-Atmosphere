import type { PlanetCamera } from '../camera/PlanetCamera.ts'
import type { Vec3 } from '../math/vector3.ts'
import type { StageOneAtmosphereParameters } from './AtmosphereParameters.ts'
import stageOneShader from './shaders/stageOne.wgsl?raw'

const UNIFORM_FLOAT_COUNT = 28
const UNIFORM_BYTE_SIZE = UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT

export interface StageOneFrame {
  camera: PlanetCamera
  sunDirection: Vec3
  exposure: number
  geometryDebug: boolean
}

export interface AtmosphereRendererInfo {
  adapter: string
  canvasFormat: GPUTextureFormat
}

export class AtmosphereRenderer {
  readonly info: AtmosphereRendererInfo

  private readonly canvas: HTMLCanvasElement
  private readonly context: GPUCanvasContext
  private readonly device: GPUDevice
  private readonly pipeline: GPURenderPipeline
  private readonly uniformBuffer: GPUBuffer
  private readonly bindGroup: GPUBindGroup
  private readonly parameters: StageOneAtmosphereParameters
  private readonly uniformData = new Float32Array(UNIFORM_FLOAT_COUNT)
  private readonly onFatalError: (message: string) => void
  private active = true
  private destroyed = false

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    parameters: StageOneAtmosphereParameters,
    info: AtmosphereRendererInfo,
    onFatalError: (message: string) => void,
  ) {
    this.canvas = canvas
    this.context = context
    this.device = device
    this.pipeline = pipeline
    this.uniformBuffer = uniformBuffer
    this.bindGroup = bindGroup
    this.parameters = parameters
    this.info = info
    this.onFatalError = onFatalError
  }

  static async create(
    canvas: HTMLCanvasElement,
    parameters: StageOneAtmosphereParameters,
    onFatalError: (message: string) => void,
  ): Promise<AtmosphereRenderer> {
    const gpu = navigator.gpu

    if (!gpu) {
      throw new Error('当前浏览器未提供 WebGPU。请使用支持 WebGPU 的浏览器并启用硬件加速。')
    }

    const adapter = await gpu.requestAdapter()

    if (!adapter) {
      throw new Error('没有找到可用的 WebGPU 适配器。')
    }

    const device = await adapter.requestDevice()
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
        GPUBufferUsage?: { UNIFORM: number; COPY_DST: number }
      }
    ).GPUBufferUsage

    if (!bufferUsage) {
      device.destroy()
      throw new Error('当前环境缺少 GPUBufferUsage 常量。')
    }

    const uniformBuffer = device.createBuffer({
      label: '星球舞台帧参数',
      size: UNIFORM_BYTE_SIZE,
      usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
    })
    const bindGroup = device.createBindGroup({
      label: '星球舞台帧参数绑定组',
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    })
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
      pipeline,
      uniformBuffer,
      bindGroup,
      parameters,
      {
        adapter: adapterDescription.length > 0 ? adapterDescription : '未提供适配器信息',
        canvasFormat,
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

  render(frame: StageOneFrame): number {
    if (!this.active) {
      throw new Error('WebGPU renderer 已停止。')
    }

    const startedAt = performance.now()
    this.resizeCanvas()
    this.writeUniforms(frame)

    const commandEncoder = this.device.createCommandEncoder({
      label: '星球舞台帧命令编码器',
    })
    const renderPass = commandEncoder.beginRenderPass({
      label: '星球舞台阶段一 render pass',
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
    renderPass.draw(3)
    renderPass.end()
    this.device.queue.submit([commandEncoder.finish()])

    return performance.now() - startedAt
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.active = false
    this.device.removeEventListener('uncapturederror', this.handleUncapturedError)
    this.context.unconfigure()
    this.uniformBuffer.destroy()
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
    this.uniformData.set(
      [
        ...planetCenterRelativeToCamera,
        this.parameters.planetRadiusKm,
        ...camera.right,
        tangentHalfFov,
        ...camera.up,
        aspect,
        ...camera.forward,
        this.parameters.atmosphereRadiusKm,
        ...frame.sunDirection,
        this.parameters.sunAngularRadiusRadians,
        ...this.parameters.solarRadianceLinear,
        frame.exposure,
        ...this.parameters.surfaceAlbedoLinear,
        frame.geometryDebug ? 1 : 0,
      ],
      0,
    )

    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  private readonly handleUncapturedError = (event: GPUUncapturedErrorEvent): void => {
    console.error('WebGPU 未捕获错误：', event.error)
    this.onFatalError(`WebGPU 运行时错误：${event.error.message}`)
  }
}
