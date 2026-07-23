# Planet Atmosphere Memory

本文件保存 `cp-atmosphere.md` 的可复用工程记忆；控制目标和活跃任务仍以 CP 为准。

## 坐标与控制

- 世界空间是右手 Z-up 笛卡尔坐标：`+X` 右、`+Y` 前、`+Z` 上，行星中心为原点。
- 相机局部基为 `+X` right、`+Y` forward、`+Z` up；`PlanetCamera` 单位四元数是最终渲染姿态的唯一真相，renderer 只消费世界空间 `right/up/forward`。
- Free 使用传统 Body/Look Rig：单位 `qBody` 定义人的局部 right/forward/up 与局部天顶，`lookYaw/lookPitch` 是相对 Body 的观察角，pitch 限制为 ±89°；最终姿态固定为 `qCamera = qBody × qYaw × qPitch`。
- Q/E 绕当前最终 forward 旋转整个 Body，lookYaw/lookPitch 不变；鼠标只更新 Look，不修改 Body。因此偏转后的局部坐标、屏幕与局部天顶整体一致旋转，操作规律与默认姿态同构。最终姿态不得反解回控制状态。Orbit 单独使用世界 Z-up turntable 方位角、仰角和半径。
- Free 的 WASD 缓动速度保存为相机局部分量，每帧再通过当前 right/forward/up 基转换到世界空间，避免横滚后残留旧世界方向。
- 天空经纬 debug 是无限远方向层，不读取相机位置；它用于区分姿态跳变与位置/场景问题，不代表天空盒大气。
- 星球、太阳、大气、世界 XYZ 网格和天空经纬方向都以世界空间为权威定义；GPU camera-relative 只平移数值原点，摄像机姿态只负责派生屏幕观察结果。

## Pointer Lock

- Windows Chromium 的 Pointer Lock 相对移动流可能偶发产生异常大的 `movementX/Y`。应先比较输入角度预算与相机基变化，不能先归因于四元数或坐标系。
- 当前 Free 控制丢弃单事件长度超过 `64px` 的输入并输出 `[CameraInputOutlier]`；`[CameraViewJumpProbe]` 记录帧前后基向量、控制状态和输入预算。
- 没有测量证据时，不用平滑、插值或阻尼掩盖输入尖峰。

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
