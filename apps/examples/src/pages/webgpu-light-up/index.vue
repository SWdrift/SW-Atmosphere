<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import shaderCode from './shader.wgsl?raw'

const canvas = ref<HTMLCanvasElement | null>(null)
const bufferUsage = (
  globalThis as typeof globalThis & {
    GPUBufferUsage: { UNIFORM: number; COPY_DST: number }
  }
).GPUBufferUsage

let frameId = 0

async function start(): Promise<void> {
  const renderingCanvas = canvas.value!
  const gpu = navigator.gpu
  const adapter = (await gpu.requestAdapter({
    powerPreference: 'high-performance',
  }))!
  const device = await adapter.requestDevice()
  const context = renderingCanvas.getContext('webgpu') as GPUCanvasContext
  const canvasFormat = gpu.getPreferredCanvasFormat()

  context.configure({
    device,
    format: canvasFormat,
    alphaMode: 'opaque',
  })

  const shaderModule = device.createShaderModule({
    code: shaderCode,
  })

  const pipeline = device.createRenderPipeline({
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

  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
  })

  const bindGroup = device.createBindGroup({
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

  function render(now: number): void {
    const dpr = Math.min(window.devicePixelRatio, 2)

    renderingCanvas.width = Math.floor(renderingCanvas.clientWidth * dpr)
    renderingCanvas.height = Math.floor(renderingCanvas.clientHeight * dpr)

    // uniform 数据顺序必须与 shader.wgsl 中 FrameUniforms.data 保持一致。
    uniformData[0] = (now - startedAt) / 1000
    uniformData[1] = renderingCanvas.width
    uniformData[2] = renderingCanvas.height
    uniformData[3] = 0

    device.queue.writeBuffer(uniformBuffer, 0, uniformData)

    const commandEncoder = device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
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
    frameId = requestAnimationFrame(render)
  }

  frameId = requestAnimationFrame(render)
}

onMounted(() => {
  void start()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
})
</script>

<template>
  <h1>WebGPU 点亮测试</h1>
  <canvas ref="canvas"></canvas>
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: calc(100vh - 64px);
  min-height: 100px;
  min-width: 100px;
  border: 1px solid #a2a9b1;
  background: #000;
}
</style>
