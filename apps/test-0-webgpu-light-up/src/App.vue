<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import shaderCode from './shader.wgsl?raw'

const canvas = ref<HTMLCanvasElement | null>(null)
const statusMessage = ref('正在初始化 WebGPU...')
const hasError = ref(false)

let frameId = 0

function showStatus(message: string, failed: boolean): void {
  statusMessage.value = message
  hasError.value = failed
}

async function start(): Promise<void> {
  if (!canvas.value) {
    throw new Error('缺少 WebGPU canvas。')
  }

  const renderingCanvas: HTMLCanvasElement = canvas.value
  const gpu = navigator.gpu

  if (!gpu) {
    throw new Error('当前浏览器未暴露 WebGPU。请使用新版 Chrome 或 Edge，并启用硬件加速。')
  }

  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  })

  if (!adapter) {
    throw new Error('没有找到可用的 GPU 适配器。')
  }

  const device = await adapter.requestDevice()

  device.addEventListener('uncapturederror', (event) => {
    console.error('WebGPU 未捕获错误：', event.error)
    showStatus(`GPU 运行时错误：\n${event.error.message}`, true)
  })

  const context = renderingCanvas.getContext('webgpu') as GPUCanvasContext | null

  if (!context) {
    throw new Error('无法获取 WebGPU canvas 上下文。')
  }

  const gpuContext: GPUCanvasContext = context
  const canvasFormat = gpu.getPreferredCanvasFormat()

  gpuContext.configure({
    device,
    format: canvasFormat,
    alphaMode: 'opaque',
  })

  const shaderModule = device.createShaderModule({
    label: '点亮测试 shader',
    code: shaderCode,
  })

  const compilationInfo = await shaderModule.getCompilationInfo()
  const shaderDiagnostics = compilationInfo.messages
    .map(
      (message) =>
        `${message.type.toUpperCase()} ${message.lineNum}:${message.linePos} ${message.message}`,
    )
    .join('\n')
  const hasShaderError = compilationInfo.messages.some((message) => message.type === 'error')

  if (shaderDiagnostics) {
    console[hasShaderError ? 'error' : 'warn'](shaderDiagnostics)
  }

  if (hasShaderError) {
    throw new Error(`WGSL 编译失败：\n${shaderDiagnostics}`)
  }

  device.pushErrorScope('validation')

  const pipeline = device.createRenderPipeline({
    label: '点亮测试渲染管线',
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

  const pipelineError = await device.popErrorScope()

  if (pipelineError) {
    throw new Error(`渲染管线校验失败：\n${pipelineError.message}`)
  }

  const bufferUsage = (
    globalThis as typeof globalThis & {
      GPUBufferUsage?: { UNIFORM: number; COPY_DST: number }
    }
  ).GPUBufferUsage

  if (!bufferUsage) {
    throw new Error('当前运行环境缺少 GPUBufferUsage 常量。')
  }

  const uniformBuffer = device.createBuffer({
    label: '帧参数',
    size: 16,
    usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
  })

  const bindGroup = device.createBindGroup({
    label: '帧参数绑定组',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  })

  const uniformData = new Float32Array(4)
  const startedAt = performance.now()

  function resizeCanvasToDisplaySize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const maxSize = device.limits.maxTextureDimension2D
    const width = Math.max(1, Math.min(Math.floor(renderingCanvas.clientWidth * dpr), maxSize))
    const height = Math.max(1, Math.min(Math.floor(renderingCanvas.clientHeight * dpr), maxSize))

    if (renderingCanvas.width !== width || renderingCanvas.height !== height) {
      renderingCanvas.width = width
      renderingCanvas.height = height
    }
  }

  function render(now: number): void {
    resizeCanvasToDisplaySize()

    // uniform 数据顺序必须与 shader.wgsl 中 FrameUniforms.data 保持一致。
    uniformData[0] = (now - startedAt) / 1000
    uniformData[1] = renderingCanvas.width
    uniformData[2] = renderingCanvas.height
    uniformData[3] = 0

    device.queue.writeBuffer(uniformBuffer, 0, uniformData)

    device.pushErrorScope('validation')

    try {
      const commandEncoder = device.createCommandEncoder({
        label: '帧命令编码器',
      })

      const renderPass = commandEncoder.beginRenderPass({
        label: '点亮测试渲染通道',
        colorAttachments: [
          {
            view: gpuContext.getCurrentTexture().createView(),
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })

      renderPass.setPipeline(pipeline)
      renderPass.setBindGroup(0, bindGroup)
      renderPass.draw(3)
      renderPass.end()

      device.queue.submit([commandEncoder.finish()])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      showStatus(`GPU 命令提交失败：\n${message}`, true)
      void device.popErrorScope()
      return
    }

    void device.popErrorScope().then((error) => {
      if (error) {
        showStatus(`GPU 校验错误：\n${error.message}`, true)
        return
      }

      frameId = requestAnimationFrame(render)
    })
  }

  const adapterInfo = [
    adapter.info.vendor,
    adapter.info.architecture,
    adapter.info.device,
    adapter.info.description,
  ]
    .filter((part) => part.length > 0)
    .join(' / ')

  const statusLines = [`WebGPU 管线已运行`, `画布格式：${canvasFormat}`]

  if (adapterInfo.length > 0) {
    statusLines.push(`适配器：${adapterInfo}`)
  }

  statusLines.push('绘制：全屏三角形，3 个顶点')
  showStatus(statusLines.join('\n'), false)

  frameId = requestAnimationFrame(render)
}

onMounted(() => {
  start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    console.error(error)
    showStatus(`初始化失败：\n${message}`, true)
  })
})

onBeforeUnmount(() => {
  if (frameId) {
    cancelAnimationFrame(frameId)
  }
})
</script>

<template>
  <main>
    <h1>WebGPU 点亮测试</h1>
    <canvas ref="canvas" aria-label="WebGPU 蓝色动态径向光"></canvas>
    <pre :class="{ error: hasError }">{{ statusMessage }}</pre>
  </main>
</template>
