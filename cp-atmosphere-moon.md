# Atmosphere Moon Control Plane

## Control Plane Role

本控制平面约束月球进入星球大气舞台时的几何、光照、控制与大气合成。月球是大气之外的独立天体，不进入 `AtmosphereParameters`，也不建立月球专属的大气散射公式。

本阶段建立可验证的最小月球：按地月尺度构建球体、由现有唯一太阳方向照亮、受地球遮挡，并作为背景辐亮度穿过地球大气。月面材质、轨道历表和食相属于后续独立阶段。

## Meta Reference

- 先读 `cp-meta.md`、`document/行星大气光学与视象图谱.md`、`document/地球占比和轨道高度估计.md`、`cp-atmosphere.md`，再读本文件。
- 可复用结论读取 `cpm-atmosphere.md`、`cpm-atmosphere-visual.md` 和同 scope 的 `cpm-atmosphere-moon.md`（存在时）。
- 摄像机坐标与控制读取 `cp-atmosphere-camera.md`；晴空颜色和显示验证读取 `cp-atmosphere-visual.md`。
- 修改或审查代码时使用 `code-smell-guard`；阶段完成或动态任务区膨胀时使用 `compact-control-plane`。

## Scope

- 主作用域：`apps/examples/src/pages/planetary-atmosphere/` 内的月球参数、观察几何、控制状态、逐帧 uniform、Final shader 与对应测试和 README。
- 入口：`AtmosphereScene` 从地心月球方向和相机世界位置派生逐帧观察方向与角半径；`AtmosphereRenderer` 只上传已验证的月球帧数据；Final shader 构建月面辐亮度并与现有大气传递结果合成。
- 最小公共面：月球参数与观察几何模块、`AtmosphereControls.moon`、`StageOneFrame` 月球输入；不扩展页面目录的 barrel export。
- 本阶段外：月面纹理和地形、自转与天平动、轨道历表、视差之外的天文坐标系统、月食与日食、地照、镜头 glow 和 bloom。

## Core Rules

- 月球赤道半径、平均地心距离与漫反射率只能来自月球参数模块；角半径由相机到月心的实际距离派生，不另设显示尺寸或最小像素尺寸。
- 月球位置以世界空间地心方向和地心距离构建；逐帧观察方向只能由月心世界位置减去相机世界位置派生。
- 月面使用当前唯一太阳方向照明；本阶段采用无纹理 Lambert 漫反射近似，明确不宣称真实月面光度模型。
- 月球只在未被地球表面遮挡的背景射线上出现。穿过大气时统一执行 `backgroundRadiance × transmittance + inScatteredRadiance`，不得添加月球专属颜色、曝光或透射捷径。
- Final 之外的 LUT 和密度调试视图不混入月球；几何调试允许显示分类，但不得被描述为物理输出。
- 参数和方向无法构建时 fail fast；不得用 fallback、隐藏默认尺寸或扩大圆盘来换取可见性。
- 验证至少覆盖参数非法值、相机视差与角半径变化、月球启停、控制复制，以及 TypeScript、WGSL、测试和生产构建。

## Task Board

- 当前无活跃任务。
