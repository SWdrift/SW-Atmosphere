# Planet Atmosphere Control Plane

## Control Plane Role

本控制平面约束 `SW-Atmosphere` 中原生 WebGPU 星球大气实验的实现、验证和后续演进。目标是在同一个球形几何与辐射传输模型中，建立从地表到深空连续工作的学习型渲染器。

阶段一星球舞台已经收口。后续从共享物理核心与 Reference 直接积分开始，再建立 Hillaire 2020 风格的 Production compute LUT 管线；不得用视觉上“像蓝天”的临时效果绕过正确性门槛。

## Meta Reference

- 先读根目录 `cp-meta.md`，再读本文件；可复用记忆读取同目录 `cpm-atmosphere.md`。
- 长期目标读取 `document/行星大气与动态天气长期目标.md`；大气光学概念、自然视象和读图方法读取 `document/行星大气光学与视象图谱.md`。本 CP 不重复维护这些上位内容。
- 晴空视觉真实性、晨昏线、光谱颜色和参考图验收读取 `cp-atmosphere-visual.md`；性能工作读取 `cp-atmosphere-performance.md`；页面迭代和 URL 验证读取 `cp-atmosphere-workbench.md`；摄像机坐标、控制、输入、预设和路径接入读取 `cp-atmosphere-camera.md`。
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
- 摄像机最终姿态、控制状态和输入边界由 `cp-atmosphere-camera.md` 约束；本平面只消费其世界空间结果。
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
- `pnpm --filter examples test` 运行回归测试；`pnpm --filter examples build` 执行 `vue-tsc -b && vite build`。当前没有 lint 脚本。
- 不编造性能数据；CPU submit 时间不得称为 GPU 时间。没有目标设备证据时明确写未验证。
- 不主动启动持久开发服务器；人工浏览器验证使用用户已启动的服务。

## Task Board

- [ ] 完成视觉 CP 的 Earth clear、太阳、晨昏线和跨尺度验收，并建立 Reference/Production 的线性 HDR 对照。
- [ ] 完成性能 CP 的分 pass 遥测和目标设备实测，明确 GPU 时间、CPU submit 与未验证项。
- [ ] 使用固定场景联合复查斜向近地边界、大气顶内外、FOV/质量档和连续运动；问题归因后再进入专项 CP 修复。
- [ ] 运行 `pnpm check:quick`、回归测试与构建，并完成 WebGPU validation、shader compilation 和 LUT debug 复查。
