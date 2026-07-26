# Atmosphere Moon Memory

本文件保存 `cp-atmosphere-moon.md` 的可复用工程记忆；控制目标和活跃任务仍以 CP 为准。

## 参数与观察几何

- `celestial/MoonParameters.ts` 是月球尺度和当前反射近似的唯一来源。地月基准采用赤道半径 `1737.5 km`、平均地心距离 `384400 km`；`0.12` 灰色 Lambert 漫反射率只是当前无纹理工程近似，不代表真实月面光度模型。
- UI 保存月球相对地心的世界方位角和高度角。`AtmosphereScene` 先构建月心世界位置，再以 `moonCenter - cameraPosition` 派生相机观察方向和实际角半径；不得改回无限远固定方向或固定显示尺寸。
- 月球参数、摄像机位置和方向在 CPU 边界 fail fast。确定性测试覆盖地心角半径、近侧尺寸变化、横向视差和非法输入。

## 渲染与合成

- Frame uniform 在既有 8 个 `vec4` 后追加 `moon_direction_angular_radius` 与 `moon_reflectance_enabled`，总计 10 个 `vec4`、160 bytes。月球参数不进入 `AtmosphereParameters`。
- Final shader 用角半径解析重建单位球面，月面法线与唯一太阳方向的 Lambert 余弦形成月相；圆盘轮廓只使用像素角宽度抗锯齿，不扩大物理角半径。
- 月球与太阳共同构成背景辐亮度。未命中地表时，Reference、Production 逐像素路径和 Sky-View 最终组合都执行 `backgroundRadiance × transmittance + inScatteredRadiance`；命中地表时由现有地表覆盖率遮挡背景。
- LUT 和密度调试视图不包含月球。月面纹理、真实反射分布、历表、自转/天平动、地照和食相尚未进入实现。

## 验证

- `pnpm check:quick` 同时执行 Vue TypeScript 检查与 WGSL 校验。
- `pnpm --filter examples test` 覆盖 CPU 回归；`pnpm --filter examples build` 验证生产构建。
- 月球的实际亮度、相位轮廓和地平线遮挡仍需在用户启动的 WebGPU 浏览器中进行视觉验收，构建成功不能替代该项。
