import type { PlanetCamera } from '../camera/PlanetCamera.ts'
import type { Vec3 } from '../math/vector3.ts'
import { resolveAtmosphereLutDirtyPasses } from './atmospherePhysics.ts'

const TRANSMITTANCE_SIZE = [256, 64]
const MULTIPLE_SCATTERING_SIZE = [32, 32]
const SKY_VIEW_SIZE = [192, 108]
const AERIAL_PERSPECTIVE_SIZE = 32

export interface AtmosphereLutFrame {
  camera: PlanetCamera
  sunDirection: Vec3
  multipleScattering: boolean
  rayleighEnabled: boolean
  mieEnabled: boolean
  ozoneEnabled: boolean
}

export interface AtmosphereLutQuality {
  skyViewSteps: number
  aerialPerspectiveSteps: number
}

interface AtmosphereLutResources {
  transmittancePipeline: GPUComputePipeline
  multipleScatteringPipeline: GPUComputePipeline
  skyViewPipeline: GPUComputePipeline
  aerialPerspectivePipeline: GPUComputePipeline
  transmittanceTexture: GPUTexture
  multipleScatteringTexture: GPUTexture
  skyViewTexture: GPUTexture
  aerialRadianceTexture: GPUTexture
  aerialTransmittanceTexture: GPUTexture
  transmittanceAtmosphereBindGroup: GPUBindGroup
  transmittanceOutputBindGroup: GPUBindGroup
  multipleScatteringAtmosphereBindGroup: GPUBindGroup
  multipleScatteringResourcesBindGroup: GPUBindGroup
  skyViewAtmosphereBindGroup: GPUBindGroup
  skyViewResourcesBindGroup: GPUBindGroup
  aerialPerspectiveAtmosphereBindGroup: GPUBindGroup
  aerialPerspectiveResourcesBindGroup: GPUBindGroup
  renderBindGroup: GPUBindGroup
}

export class AtmosphereLutPipeline {
  readonly renderBindGroup: GPUBindGroup

  private readonly transmittancePipeline: GPUComputePipeline
  private readonly multipleScatteringPipeline: GPUComputePipeline
  private readonly skyViewPipeline: GPUComputePipeline
  private readonly aerialPerspectivePipeline: GPUComputePipeline
  private readonly transmittanceTexture: GPUTexture
  private readonly multipleScatteringTexture: GPUTexture
  private readonly skyViewTexture: GPUTexture
  private readonly aerialRadianceTexture: GPUTexture
  private readonly aerialTransmittanceTexture: GPUTexture
  private readonly transmittanceAtmosphereBindGroup: GPUBindGroup
  private readonly transmittanceOutputBindGroup: GPUBindGroup
  private readonly multipleScatteringAtmosphereBindGroup: GPUBindGroup
  private readonly multipleScatteringResourcesBindGroup: GPUBindGroup
  private readonly skyViewAtmosphereBindGroup: GPUBindGroup
  private readonly skyViewResourcesBindGroup: GPUBindGroup
  private readonly aerialPerspectiveAtmosphereBindGroup: GPUBindGroup
  private readonly aerialPerspectiveResourcesBindGroup: GPUBindGroup
  private atmosphereDependencyKey = 'true:true:true'
  private skyViewDependencyKey = ''
  private aerialPerspectiveDependencyKey = ''

  private constructor(resources: AtmosphereLutResources) {
    this.transmittancePipeline = resources.transmittancePipeline
    this.multipleScatteringPipeline = resources.multipleScatteringPipeline
    this.skyViewPipeline = resources.skyViewPipeline
    this.aerialPerspectivePipeline = resources.aerialPerspectivePipeline
    this.transmittanceTexture = resources.transmittanceTexture
    this.multipleScatteringTexture = resources.multipleScatteringTexture
    this.skyViewTexture = resources.skyViewTexture
    this.aerialRadianceTexture = resources.aerialRadianceTexture
    this.aerialTransmittanceTexture = resources.aerialTransmittanceTexture
    this.transmittanceAtmosphereBindGroup =
      resources.transmittanceAtmosphereBindGroup
    this.transmittanceOutputBindGroup = resources.transmittanceOutputBindGroup
    this.multipleScatteringAtmosphereBindGroup =
      resources.multipleScatteringAtmosphereBindGroup
    this.multipleScatteringResourcesBindGroup =
      resources.multipleScatteringResourcesBindGroup
    this.skyViewAtmosphereBindGroup = resources.skyViewAtmosphereBindGroup
    this.skyViewResourcesBindGroup = resources.skyViewResourcesBindGroup
    this.aerialPerspectiveAtmosphereBindGroup =
      resources.aerialPerspectiveAtmosphereBindGroup
    this.aerialPerspectiveResourcesBindGroup =
      resources.aerialPerspectiveResourcesBindGroup
    this.renderBindGroup = resources.renderBindGroup
  }

  static async create(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    renderPipeline: GPURenderPipeline,
    atmosphereUniformBuffer: GPUBuffer,
    frameUniformBuffer: GPUBuffer,
    textureUsage: { TEXTURE_BINDING: number; STORAGE_BINDING: number },
  ): Promise<AtmosphereLutPipeline> {
    device.pushErrorScope('validation')
    const transmittancePipeline = device.createComputePipeline({
      label: '大气 Transmittance LUT 管线',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'cs_transmittance' },
    })
    const multipleScatteringPipeline = device.createComputePipeline({
      label: '大气 Multi-Scattering LUT 管线',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'cs_multiple_scattering' },
    })
    const skyViewPipeline = device.createComputePipeline({
      label: '大气 Sky-View LUT 管线',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'cs_sky_view' },
    })
    const aerialPerspectivePipeline = device.createComputePipeline({
      label: '大气 Aerial Perspective 管线',
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'cs_aerial_perspective' },
    })
    const pipelineError = await device.popErrorScope()

    if (pipelineError) {
      throw new Error(`大气 LUT 管线校验失败：\n${pipelineError.message}`)
    }

    device.pushErrorScope('validation')
    const usage = textureUsage.TEXTURE_BINDING | textureUsage.STORAGE_BINDING
    const transmittanceTexture = device.createTexture({
      label: '大气 Transmittance LUT',
      size: TRANSMITTANCE_SIZE,
      format: 'rgba16float',
      usage,
    })
    const multipleScatteringTexture = device.createTexture({
      label: '大气 Multi-Scattering LUT',
      size: MULTIPLE_SCATTERING_SIZE,
      format: 'rgba16float',
      usage,
    })
    const skyViewTexture = device.createTexture({
      label: '大气 Sky-View LUT',
      size: SKY_VIEW_SIZE,
      format: 'rgba16float',
      usage,
    })
    const volumeSize = [
      AERIAL_PERSPECTIVE_SIZE,
      AERIAL_PERSPECTIVE_SIZE,
      AERIAL_PERSPECTIVE_SIZE,
    ]
    const aerialRadianceTexture = device.createTexture({
      label: 'Aerial Perspective 入射散射辐亮度',
      size: volumeSize,
      dimension: '3d',
      format: 'rgba16float',
      usage,
    })
    const aerialTransmittanceTexture = device.createTexture({
      label: 'Aerial Perspective 透射率',
      size: volumeSize,
      dimension: '3d',
      format: 'rgba16float',
      usage,
    })

    const atmosphereEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
      { binding: 1, resource: { buffer: frameUniformBuffer } },
    ]
    const transmittanceAtmosphereBindGroup = device.createBindGroup({
      label: 'Transmittance 大气参数',
      layout: transmittancePipeline.getBindGroupLayout(0),
      entries: atmosphereEntries,
    })
    const transmittanceOutputBindGroup = device.createBindGroup({
      label: 'Transmittance 输出',
      layout: transmittancePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 5, resource: transmittanceTexture.createView() },
      ],
    })
    const multipleScatteringAtmosphereBindGroup = device.createBindGroup({
      label: 'Multi-Scattering 大气参数',
      layout: multipleScatteringPipeline.getBindGroupLayout(0),
      entries: atmosphereEntries,
    })
    const multipleScatteringResourcesBindGroup = device.createBindGroup({
      label: 'Multi-Scattering 输入输出',
      layout: multipleScatteringPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: transmittanceTexture.createView() },
        { binding: 6, resource: multipleScatteringTexture.createView() },
      ],
    })
    const skyViewAtmosphereBindGroup = device.createBindGroup({
      label: 'Sky-View 大气与帧参数',
      layout: skyViewPipeline.getBindGroupLayout(0),
      entries: atmosphereEntries,
    })
    const skyViewResourcesBindGroup = device.createBindGroup({
      label: 'Sky-View LUT 输入输出',
      layout: skyViewPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: transmittanceTexture.createView() },
        { binding: 1, resource: multipleScatteringTexture.createView() },
        { binding: 7, resource: skyViewTexture.createView() },
      ],
    })
    const aerialPerspectiveAtmosphereBindGroup = device.createBindGroup({
      label: 'Aerial Perspective 大气与帧参数',
      layout: aerialPerspectivePipeline.getBindGroupLayout(0),
      entries: atmosphereEntries,
    })
    const aerialPerspectiveResourcesBindGroup = device.createBindGroup({
      label: 'Aerial Perspective 输入输出',
      layout: aerialPerspectivePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: transmittanceTexture.createView() },
        { binding: 1, resource: multipleScatteringTexture.createView() },
        { binding: 8, resource: aerialRadianceTexture.createView() },
        { binding: 10, resource: aerialTransmittanceTexture.createView() },
      ],
    })
    const renderBindGroup = device.createBindGroup({
      label: '最终渲染 LUT',
      layout: renderPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: transmittanceTexture.createView() },
        { binding: 1, resource: multipleScatteringTexture.createView() },
        { binding: 2, resource: skyViewTexture.createView() },
        { binding: 3, resource: aerialRadianceTexture.createView() },
        { binding: 9, resource: aerialTransmittanceTexture.createView() },
      ],
    })

    const result = new AtmosphereLutPipeline({
      transmittancePipeline,
      multipleScatteringPipeline,
      skyViewPipeline,
      aerialPerspectivePipeline,
      transmittanceTexture,
      multipleScatteringTexture,
      skyViewTexture,
      aerialRadianceTexture,
      aerialTransmittanceTexture,
      transmittanceAtmosphereBindGroup,
      transmittanceOutputBindGroup,
      multipleScatteringAtmosphereBindGroup,
      multipleScatteringResourcesBindGroup,
      skyViewAtmosphereBindGroup,
      skyViewResourcesBindGroup,
      aerialPerspectiveAtmosphereBindGroup,
      aerialPerspectiveResourcesBindGroup,
      renderBindGroup,
    })

    const initializationEncoder = device.createCommandEncoder({
      label: '大气静态 LUT 初始化',
    })
    result.encodeTransmittanceAndMultipleScattering(initializationEncoder)
    device.queue.submit([initializationEncoder.finish()])
    await device.queue.onSubmittedWorkDone()
    const initializationError = await device.popErrorScope()

    if (initializationError) {
      result.destroy()
      throw new Error(`大气静态 LUT 初始化失败：\n${initializationError.message}`)
    }

    return result
  }

  encodeDynamic(
    commandEncoder: GPUCommandEncoder,
    frame: AtmosphereLutFrame,
    quality: AtmosphereLutQuality,
    canvasWidth: number,
    canvasHeight: number,
    topRadiusKm: number,
    needsDynamicLuts: boolean,
    timestampWrites: (
      label: string,
    ) => GPUComputePassTimestampWrites | undefined,
  ): readonly string[] {
    const atmosphereDependencyKey = [
      frame.rayleighEnabled,
      frame.mieEnabled,
      frame.ozoneEnabled,
    ].join(':')
    const radius = Math.hypot(...frame.camera.position)
    const inverseRadius = 1 / radius
    const sunZenithCosine =
      frame.camera.position[0] * inverseRadius * frame.sunDirection[0] +
      frame.camera.position[1] * inverseRadius * frame.sunDirection[1] +
      frame.camera.position[2] * inverseRadius * frame.sunDirection[2]
    const skyViewDependencyKey = [
      radius,
      sunZenithCosine,
      frame.multipleScattering,
      quality.skyViewSteps,
    ].join(':')
    const aerialPerspectiveDependencyKey = [
      ...frame.camera.position,
      ...frame.camera.right,
      ...frame.camera.up,
      ...frame.camera.forward,
      frame.camera.verticalFovDegrees,
      canvasWidth,
      canvasHeight,
      ...frame.sunDirection,
      frame.multipleScattering,
      quality.aerialPerspectiveSteps,
    ].join(':')
    const dirtyPasses = resolveAtmosphereLutDirtyPasses(
      {
        atmosphere: this.atmosphereDependencyKey,
        multipleScattering: this.atmosphereDependencyKey,
        skyView: this.skyViewDependencyKey,
        aerialPerspective: this.aerialPerspectiveDependencyKey,
      },
      {
        atmosphere: atmosphereDependencyKey,
        multipleScattering: atmosphereDependencyKey,
        skyView: skyViewDependencyKey,
        aerialPerspective: aerialPerspectiveDependencyKey,
      },
    )
    const rebuiltPasses: string[] = []

    if (dirtyPasses.transmittance) {
      this.encodeTransmittanceAndMultipleScattering(
        commandEncoder,
        timestampWrites,
      )
      this.atmosphereDependencyKey = atmosphereDependencyKey
      this.skyViewDependencyKey = ''
      this.aerialPerspectiveDependencyKey = ''
      rebuiltPasses.push('Transmittance', 'Multi-Scattering')
    }

    if (!needsDynamicLuts || radius >= topRadiusKm) {
      return rebuiltPasses
    }

    if (dirtyPasses.skyView) {
      const pass = commandEncoder.beginComputePass({
        label: 'Sky-View LUT pass',
        timestampWrites: timestampWrites('Sky-View'),
      })
      pass.setPipeline(this.skyViewPipeline)
      pass.setBindGroup(0, this.skyViewAtmosphereBindGroup)
      pass.setBindGroup(1, this.skyViewResourcesBindGroup)
      pass.dispatchWorkgroups(24, 14)
      pass.end()
      this.skyViewDependencyKey = skyViewDependencyKey
      rebuiltPasses.push('Sky-View')
    }

    if (dirtyPasses.aerialPerspective) {
      const pass = commandEncoder.beginComputePass({
        label: 'Aerial Perspective pass',
        timestampWrites: timestampWrites('Aerial Perspective'),
      })
      pass.setPipeline(this.aerialPerspectivePipeline)
      pass.setBindGroup(0, this.aerialPerspectiveAtmosphereBindGroup)
      pass.setBindGroup(1, this.aerialPerspectiveResourcesBindGroup)
      pass.dispatchWorkgroups(8, 8, 8)
      pass.end()
      this.aerialPerspectiveDependencyKey = aerialPerspectiveDependencyKey
      rebuiltPasses.push('Aerial Perspective')
    }

    return rebuiltPasses
  }

  destroy(): void {
    this.transmittanceTexture.destroy()
    this.multipleScatteringTexture.destroy()
    this.skyViewTexture.destroy()
    this.aerialRadianceTexture.destroy()
    this.aerialTransmittanceTexture.destroy()
  }

  private encodeTransmittanceAndMultipleScattering(
    commandEncoder: GPUCommandEncoder,
    timestampWrites?: (
      label: string,
    ) => GPUComputePassTimestampWrites | undefined,
  ): void {
    const transmittancePass = commandEncoder.beginComputePass({
      label: 'Transmittance LUT pass',
      timestampWrites: timestampWrites?.('Transmittance'),
    })
    transmittancePass.setPipeline(this.transmittancePipeline)
    transmittancePass.setBindGroup(0, this.transmittanceAtmosphereBindGroup)
    transmittancePass.setBindGroup(1, this.transmittanceOutputBindGroup)
    transmittancePass.dispatchWorkgroups(32, 8)
    transmittancePass.end()

    const multipleScatteringPass = commandEncoder.beginComputePass({
      label: 'Multi-Scattering LUT pass',
      timestampWrites: timestampWrites?.('Multi-Scattering'),
    })
    multipleScatteringPass.setPipeline(this.multipleScatteringPipeline)
    multipleScatteringPass.setBindGroup(
      0,
      this.multipleScatteringAtmosphereBindGroup,
    )
    multipleScatteringPass.setBindGroup(
      1,
      this.multipleScatteringResourcesBindGroup,
    )
    multipleScatteringPass.dispatchWorkgroups(4, 4)
    multipleScatteringPass.end()
  }
}
