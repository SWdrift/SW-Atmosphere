# WebGPU 点亮测试

一个最小 Vue + Vite WebGPU 验证应用。

验证路径：

`Vue → TypeScript → WebGPU adapter/device → GPU canvas → WGSL compilation → render pipeline → uniform upload → command submission → animated pixels`

## 运行

```bash
pnpm install
pnpm dev
```

在新版 Chrome 或 Edge 中打开 Vite 输出的本地地址。

## 成功标准

- 画布显示蓝色动态径向光。
- 状态区域显示 `WebGPU 管线已运行`。
- 调整窗口宽度时动画持续运行。
