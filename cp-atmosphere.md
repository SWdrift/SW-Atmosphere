# Planet Atmosphere Control Plane

## Control Plane Role

本控制平面约束 `SW-Atmosphere` 中原生 WebGPU 星球大气实验的实现、验证和后续演进。目标是在同一个球形几何与辐射传输模型中，建立从地表到深空连续工作的学习型渲染器。

阶段一星球舞台已经收口。后续从共享物理核心与 Reference 直接积分开始，再建立 Hillaire 2020 风格的 Production compute LUT 管线；不得用视觉上“像蓝天”的临时效果绕过正确性门槛。

## Meta Reference

- 先读根目录 `cp-meta.md`，再读本文件；可复用记忆读取同目录 `cpm-atmosphere.md`。
- 晴空视觉真实性、晨昏线、光谱颜色和参考图验收继续读取 `cp-atmosphere-visual.md`；性能工作读取 `cp-atmosphere-performance.md`。
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
- 相机局部基为 `+X` right、`+Y` forward、`+Z` up；`PlanetCamera` 单位四元数是最终渲染姿态的唯一真相。
- Free 控制采用传统 Body/Look Rig：单位四元数 `qBody` 是人的身体局部坐标与局部天顶，Q/E 绕当前最终视线旋转整个 Body；`lookYaw/lookPitch` 是相对 Body 的观察角，鼠标只更新它们且 pitch 限制为 ±89°。最终姿态固定为 `qCamera = qBody × qYaw × qPitch`，不得把 roll 放在 Look 之后，也不得从最终姿态反解或修正控制状态。Orbit 方位/仰角/半径和太阳世界方向保留独立状态。
- Free 的 WASD 速度状态保存为相机局部分量，每帧使用当前相机基转换为世界位移；姿态变化不得遗留旧世界方向的速度。
- 真相无法构建时 fail fast，不用 `||`、`??` 或隐式默认值制造替代状态。

### 渲染边界

- 行星和大气是同心球壳；地表、大气内部、轨道和深空共用一套相交与辐射模型。
- 星球、太阳、大气、世界 XYZ 网格和天空经纬方向均以世界空间为权威定义；摄像机只派生世界到屏幕的观察变换。GPU camera-relative 坐标只允许平移数值原点，不得改变世界轴或成为第二份场景真相。
- 每像素视线由全屏三角形与摄像机基重建；禁止用天空盒、渐变背景、二维圆或固定高度平面实现大气。
- 天空经纬 debug 只是独立的无限远方向 overlay，不得进入大气模型或被描述为天空盒实现。
- CPU 世界位置使用 JavaScript `number`；GPU 使用相机相对行星中心，避免星球尺度 f32 精度损失。
- 物理计算保持 HDR 线性 RGB，最终合成后只执行一次 exposure 与 tone mapping。
- Reference 与 Production 共享密度、相函数、遮挡、参数、单位、坐标映射和颜色管理。
- Rayleigh 与 Cornette-Shanks 相函数均按全立体角积分为 1；太阳辐照度到太阳圆盘辐亮度的立体角换算只发生一次，不得重复引入 `1/(4π)` 或太阳立体角因子。
- Reference 与 Production 只在相同物理参数和相同散射阶数下比较：先关闭多重散射比较单次散射，再单独评估多重散射贡献。
- Production 依赖顺序固定为 Parameters → Transmittance → Multi-Scattering → Sky-View → Aerial Perspective 3D → Final。
- Sky-View 只服务大气内观察者；相机位于大气外时使用逐像素积分或等价的大气外路径，不强行复用大气内映射。
- Aerial Perspective 必须分别表达 RGB 入射散射辐亮度和 RGB 透射率，默认使用两个 `texture_3d`；最终组合固定为 `sceneRadiance × transmittance + inScatteredRadiance`。
- ozone 只吸收；多重散射不得用常量环境光替代。

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

### 当前执行

- [ ] 使用 `斜向晨昏线` 固定场景完成用户侧验收：关闭 XYZ overlay，对照 Medium Final、Aerial L 与 Aerial T，并覆盖 20°/60°/100° 垂直 FOV、Low/Medium/High、静止与缓慢滚转。
- [ ] 比较 Reference、Production 与 Multi-Scattering debug 的 HDR 数值和显示结果，区分散射阶数差异与曝光问题；禁止修改物理参数或 LUT 输出补偿亮度。
- [ ] 为 Ground noon、sunset、twilight、space limb 建立亮度、太阳覆盖率和散射开关语义验证。
- [ ] 建立 Reference/Production 固定像素或低分辨率误差比较及合理阈值。
- [ ] 在目标设备实测 1080p FPS、GPU 帧时间、LUT 重建频率和瓶颈；不支持 `timestamp-query` 时只报告 CPU submit。
- [ ] 运行当前工作区的 `pnpm check:quick`、回归测试与构建，并完成 WebGPU validation、shader、固定场景和 LUT debug 复查。
- [ ] 核对最终完成标准，明确报告未验证项。

### 残留问题响应

- [ ] 若固定场景仍有边界伪影，先记录 Final/Aerial L/Aerial T、FOV、DPR、质量档及运动表现，确认是否仍绑定 froxel 网格。
- [ ] 修复前测量边界像素比例与 GPU pass；不先采用全屏逐像素积分、扩大 3D LUT、整屏模糊或曝光补偿。

## 当前验收边界

- 默认地表日间应清晰可读，sunset、twilight 和夜侧仍保持亮度层级，不允许全局抬黑或固定环境光。
- Reference 与 Production 的差异只能来自散射阶数或已知近似；不得存在隐藏曝光、重复太阳因子或路径专属补偿。
- 太阳圆盘需在不同分辨率、FOV 和缓慢运动下保持物理角尺寸、稳定圆形和连续边缘，并在大气内接受透射衰减。
- 用户原始斜向近地视角不得出现可辨识的阶梯、froxel 亮斑、地表/天空互染或运动闪烁；边界修复不得改变远离轮廓的 HDR 结果。
