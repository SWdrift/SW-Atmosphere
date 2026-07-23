# Planet Atmosphere Control Plane

## Control Plane Role

本控制平面约束 `SW-Atmosphere` 中原生 WebGPU 星球大气实验的实现、验证和后续演进。目标是在同一个球形几何与辐射传输模型中，建立从地表到深空连续工作的学习型渲染器。

阶段一星球舞台已经收口。后续从共享物理核心与 Reference 直接积分开始，再建立 Hillaire 2020 风格的 Production compute LUT 管线；不得用视觉上“像蓝天”的临时效果绕过正确性门槛。

## Meta Reference

- 先读根目录 `cp-meta.md`，再读本文件；可复用记忆读取同目录 `cpm-planet-atmosphere.md`。
- 同时遵循根目录 `AGENTS.md` 与 `apps/examples/src/pages/AGENTS.md`。
- 阶段完成或动态任务区膨胀时使用 `compact-control-plane`。
- 修改或审查代码时使用 `code-smell-guard`，只处理当前改动引入或加重的坏味道。

## Scope

- 主作用域：`apps/examples/src/pages/planetary-atmosphere/`。
- 入口：`apps/examples/src/router.ts`；保留 `webgpu-light-up`，不在其上堆叠大气实现。
- 最小公共面：路由只导入页面组件；摄像机、数学、参数、资源、pass 和 shader 均留在页面内部，不建立大 barrel export。
- 允许配套改动：页面 README、`apps/examples` 测试与构建配置、完成本任务必需的路由配置。
- 阶段外：云、天气、海洋、地形细节、植被、城市、玩法、第三方三维引擎。

## Core Rules

### 权威边界

- `AtmosphereParameters` 是物理参数唯一来源；TS、WGSL、Reference、Production 和 UI 只消费同一份定义及其序列化布局。
- CPU/GPU 长度统一使用 km；UI 角度使用 degree，数学与 WGSL 使用 radian。
- 世界空间固定为右手 Z-up 笛卡尔坐标：`+X` 右、`+Y` 前、`+Z` 上，行星中心为原点。
- 相机局部基为 `+X` right、`+Y` forward、`+Z` up；`PlanetCamera` 单位四元数是姿态唯一真相。
- Free yaw/pitch、Orbit 方位/仰角/半径、太阳世界方向分别拥有独立状态，只在模式边界显式转换。
- 真相无法构建时 fail fast，不用 `||`、`??` 或隐式默认值制造替代状态。

### 渲染边界

- 行星和大气是同心球壳；地表、大气内部、轨道和深空共用一套相交与辐射模型。
- 每像素视线由全屏三角形与摄像机基重建；禁止用天空盒、渐变背景、二维圆或固定高度平面实现大气。
- 天空经纬 debug 只是独立的无限远方向 overlay，不得进入大气模型或被描述为天空盒实现。
- CPU 世界位置使用 JavaScript `number`；GPU 使用相机相对行星中心，避免星球尺度 f32 精度损失。
- 物理计算保持 HDR 线性 RGB，最终合成后只执行一次 exposure 与 tone mapping。
- Reference 与 Production 共享密度、相函数、遮挡、参数、单位、坐标映射和颜色管理。
- Production 依赖顺序固定为 Parameters → Transmittance → Multi-Scattering → Sky-View → Aerial Perspective 3D → Final。
- Aerial Perspective 必须使用 `texture_3d`；ozone 只吸收；多重散射不得用常量环境光替代。

### 工程与验证

- pipeline、bind group、纹理、buffer 和 sampler 在生命周期边界创建；不得每帧重建 GPU 资源。
- TS/WGSL buffer 偏移、对齐、纹理 format/usage、storage access 和 sampler 类型必须记录并匹配。
- LUT 使用 dirty dependency；静止且依赖未变时不重建，resize 只重建尺寸相关资源。
- shader compilation info、error scope、`uncapturederror` 与 `device.lost` 必须暴露可定位错误。
- CPU 数学先有确定性测试；GPU 正确性依靠 LUT debug、固定场景、Reference 对照和管线校验。
- 保留 Pointer Lock `64px` 异常输入过滤、`[CameraInputOutlier]` 与 `[CameraViewJumpProbe]`；没有测量证据时不用平滑或阻尼掩盖尖峰。
- `pnpm --filter examples test` 运行回归测试；`pnpm --filter examples build` 执行 `vue-tsc -b && vite build`。当前没有 lint 脚本。
- 不编造性能数据；CPU submit 时间不得称为 GPU 时间。没有目标设备证据时明确写未验证。
- 不主动启动持久开发服务器；人工浏览器验证使用用户已启动的服务。

### 资料优先级

- Hillaire 2020 与 UnrealEngineSkyAtmosphere：Production LUT、多重散射、地空连续与 3D Aerial Perspective。
- Bruneton 2008：辐射传输、预计算散射和高阶散射理论。
- Bruneton 2017：量纲、density profile、纹理坐标往返、数值保护与测试。
- Maxime Heckel：浏览器教学路径和视觉基线，不作为 Production 性能终点。

## Task Board

### 共享物理核心与 Reference

- [ ] 交叉核对指定论文、文档、测试和配套实现，建立公式/章节/源码出处表。
- [ ] 集中定义类地球参数、物理意义、单位、来源、范围和 LUT 失效依赖。
- [ ] 实现共享 Rayleigh、Mie scattering/extinction、Cornette-Shanks、ozone absorption、density profile、optical depth 与 Beer-Lambert。
- [ ] 测试高度/半径、density profile、相函数、映射往返及极端输入无 NaN/Infinity。
- [ ] 实现可配置 Reference 视线/太阳路径积分、行星阴影、地表、太阳圆盘和 HDR 合成。
- [ ] 建立 Ground noon、sunset、twilight 与 space limb 固定 Reference 基准。

### Production LUT

- [ ] 建立集中管理的 compute/render pipeline、资源生命周期、参数上传和 dirty dependency。
- [ ] 实现 Transmittance LUT 与非线性 `(r, mu)` 映射、地表遮挡和 UV 往返测试。
- [ ] 实现 Hillaire Multi-Scattering LUT，记录参数化、方向样本、迭代策略并支持关闭比较。
- [ ] 实现地平线高精度、地表/大气/太空连续的 Sky-View LUT。
- [ ] 实现真正的 Aerial Perspective `texture_3d`、非线性距离切片和 slice debug。
- [ ] 实现太空、太阳、天空、大气边缘、地表、夜侧和 `scene × T + L` final composition。
- [ ] 检测 HDR 浮点纹理 optional feature 并提供经过验证的兼容路径。

### 调试、质量与最终验收

- [ ] 完成物理开关、质量档、LUT 预览、density、pass 时间和 dirty 状态调试面板。
- [ ] 实现 Low / Medium / High / Reference 四档及完整视觉预设。
- [ ] 支持 `timestamp-query` 时测 GPU pass；不支持时只报告 CPU submit。
- [ ] 建立 Reference/Production 固定像素或低分辨率误差比较与合理阈值。
- [ ] 实测目标设备 1080p FPS、帧时间、LUT 重建频率与瓶颈。
- [ ] README 补全物理公式、LUT 数据流、内存布局、性能、误差和平台迁移边界。
- [ ] 最终逐项核对 12 条完成标准，运行 build/test/GPU/视觉验证并报告全部缺项。

## Stage One Baseline

- 页面、路由、模块边界和 README 已建立；Vue 只负责 canvas、生命周期和调试 UI。
- 全屏三角形完成世界射线重建、球交、行星轮廓、大气区间分类、Lambert 地表、太阳方向/圆盘、线性 HDR 与一次 tone mapping。
- Free 使用世界 Z-up、无 roll yaw/pitch；Orbit 使用 Z-up turntable；位置 sweep 防止高速穿地。
- 已实现跨尺度速度、预设、Pointer Lock 清理、resize、shader 诊断、validation、device lost 与卸载。
- 全局 XYZ 平面网格和无限远天空经纬网格均为独立 2D overlay。
- 用户在实际浏览器持续验证并提供输入日志；Pointer Lock 跳变被定位为异常相对位移并加入过滤与探针。
- `pnpm --filter examples test`：14/14 通过。
- `pnpm --filter examples build`：通过，包含 `vue-tsc -b`；Vite 成功生成生产产物。
- lint 未配置；浏览器、GPU 型号、分辨率和阶段一性能数字未记录，不得补造。

## Required Sources

- Maxime Heckel: <https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/>
- Bruneton and Neyret 2008: <https://inria.hal.science/inria-00288758/document>
- Bruneton 2017: <https://ebruneton.github.io/precomputed_atmospheric_scattering/> and <https://github.com/ebruneton/precomputed_atmospheric_scattering>
- Hillaire 2020: <https://sebh.github.io/publications/egsr2020.pdf> and <https://github.com/sebh/UnrealEngineSkyAtmosphere>
