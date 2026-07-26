# Atmosphere Moon Control Plane

## Control Plane Role

本控制平面约束月球表面反射、可见球体和背景大气合成；月球实体、轨道、时间、系统位置与参考空间统一由 `cp-celestial-system.md` 控制。月球不进入 `AtmosphereParameters`，也不建立月球专属的大气散射公式。

月球由有限太阳实体照亮、受地球遮挡，并作为背景辐亮度穿过地球大气。月面纹理、真实光度模型和地形遮挡属于后续独立阶段；食相几何进入统一天体系统。

## Meta Reference

- 先读 `cp-meta.md`、`document/行星大气光学与视象图谱.md`、`document/地球占比和轨道高度估计.md`、`cp-celestial-system.md`、`cp-atmosphere.md`，再读本文件。
- 可复用结论读取 `cpm-atmosphere.md`、`cpm-atmosphere-visual.md` 和同 scope 的 `cpm-atmosphere-moon.md`（存在时）。
- 摄像机坐标与控制读取 `cp-atmosphere-camera.md`；晴空颜色和显示验证读取 `cp-atmosphere-visual.md`。
- 修改或审查代码时使用 `code-smell-guard`；阶段完成或动态任务区膨胀时使用 `compact-control-plane`。

## Scope

- 主作用域：`apps/examples/src/pages/planetary-atmosphere/` 内的月球参数、观察几何、控制状态、逐帧 uniform、Final shader 与对应测试和 README。
- 入口：`AtmosphereScene` 消费天体系统给出的月球实体帧；`AtmosphereRenderer` 上传已验证的相机相对中心/半径；Final shader 构建月面辐亮度并与现有大气传递结果合成。
- 最小公共面：月球反射参数与天体系统月球实体输入；不再拥有独立位置或方向控制。
- 本阶段外：月面纹理和地形、天平动、地照、镜头 glow 和 bloom。

## Core Rules

- 月球半径和轨道距离由统一天体场景定义；月面漫反射参数由月球材质模块定义。角半径由相机到月心的实际距离派生，不另设显示尺寸或最小像素尺寸。
- 月球位置只能消费 `CelestialSnapshot`；不得恢复地心方向、方位角或高度角控制。
- 月面使用唯一太阳实体照明；本阶段采用无纹理 Lambert 漫反射近似，明确不宣称真实月面光度模型。
- 月球只在未被地球表面遮挡的背景射线上出现。穿过大气时统一执行 `backgroundRadiance × transmittance + inScatteredRadiance`，不得添加月球专属颜色、曝光或透射捷径。
- Final 之外的 LUT 和密度调试视图不混入月球；几何调试允许显示分类，但不得被描述为物理输出。
- 参数和方向无法构建时 fail fast；不得用 fallback、隐藏默认尺寸或扩大圆盘来换取可见性。
- 验证至少覆盖材质非法值、相机视差、实体角半径和食相几何，以及 TypeScript、WGSL、测试和生产构建。

## Task Board

- 当前无活跃任务。
