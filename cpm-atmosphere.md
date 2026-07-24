# Planet Atmosphere Memory

本文件保存 `cp-atmosphere.md` 的可复用工程记忆；控制目标和活跃任务仍以 CP 为准。

## 摄像机边界

- 摄像机坐标、控制模式、Pointer Lock 和路径接入的可复用结论已迁移到 `cpm-atmosphere-camera.md`。
- 大气渲染只消费世界空间摄像机基；GPU camera-relative 只平移数值原点，不改变世界轴或场景真相。

## 大气渲染实现决策

- WGSL 以 `atmosphere/shaders/` 为唯一受版本控制的权威路径；在没有可验证组合工具前，用一个清晰分区的模块共享物理函数和多个 entry point，不用字符串拼接拆分或复制公式。
- `AtmosphereParameters` 只保存不可推导的物理量；布局与序列化只在参数模块定义。物理参数使用独立 uniform buffer，逐帧 buffer 只承载相机、太阳方向、曝光和调试状态。
- `AtmosphereRenderer` 是 WebGPU 设备、资源生命周期和 pass 顺序的协调边界；不预设 class-per-pass，只有出现真实独立生命周期或不同变化原因时才提取资源对象。
- Production LUT 通过物理开关、散射阶数、质量、相机、太阳和画布依赖键维护 dirty dependency。
- 不依赖 `float16-filterable`；`rgba16float` LUT 使用 `textureLoad` 手工插值，目标设备兼容性仍需实测。

## 太阳与 Aerial Perspective

- 默认曝光只在最终合成后的唯一 tone mapping 边界标定；太阳圆盘使用像素角覆盖率解析抗锯齿，不扩大物理角半径制造柔边。
- 太阳圆盘辐亮度只由 `solarIrradiance / (2π(1 - cos(angularRadius)))` 构建一次；glare/bloom 等相机光学效果必须与大气散射和太阳能量真相分离。
- Aerial Perspective 的地表终点与大气顶终点不是可跨类别插值的连续量。Radiance alpha 保存终点分类；纯地表邻域只混合同类样本，跨分类边界逐像素复用 Production 积分核。
- Production 地表覆盖率由球交判别式的屏幕导数构造；Aerial 切线重建则按相邻角向 texel 射线的 X/Y 联合判别式足迹建立连续逐像素积分带，斜向边界不能只取单轴最大变化，也不能用离散 froxel 分类单元直接切换算法。最终组合仍是 `surfaceRadiance × T + L`。残留伪影必须先通过同姿态 debug 对照定位，不用整屏模糊、提高曝光或盲目扩大 LUT 掩盖。
- 大气外 Production 不复用大气内 Sky-View/Aerial 映射。外部屏幕射线只积分大气顶入口到大气出口或地表的实际介质区间，复用共享 `integrate_aerial_transfer`、Transmittance LUT 与 Multi-Scattering LUT；显式 Reference 保留视线与太阳路径嵌套积分作为对照。

## 验证

- 回归测试：`pnpm --filter examples test`。
- 类型检查与生产构建：`pnpm --filter examples build`，实际执行 `vue-tsc -b && vite build`。
- 当前没有 lint 脚本；报告时明确写未配置。
