# Planet Atmosphere Performance Control Plane

## Control Plane Role

本控制平面约束星球大气渲染的性能分析、优化和目标设备验证。它是 `cp-atmosphere.md` 的下位专项平面：上位 CP 定义共同物理与渲染边界，本平面只控制测量、瓶颈归因、优化次序和性能验收，不以降低无法解释的视觉正确性换取帧时间。

大气外逐像素 Production 第一版已经建立，当前重点是验证其正确性和目标设备成本，并测量大气内动态 LUT、Final、DPR 与边界精确积分的实际瓶颈。稳定实现决策见 `cpm-atmosphere-performance.md`。

## Meta Reference

- 先读 `cp-meta.md`、上位目标 `document/行星大气与动态天气长期目标.md`、`cp-atmosphere.md`，再读本文件。
- 可复用实现决策读取 `cpm-atmosphere.md` 与 `cpm-atmosphere-performance.md`；视觉正确性读取 `cp-atmosphere-visual.md`。
- 同时遵循根目录 `AGENTS.md` 与 `apps/examples/src/pages/AGENTS.md`。
- 修改或审查代码时使用 `code-smell-guard`；阶段完成或动态任务区膨胀时使用 `compact-control-plane`。

## Scope

- 主作用域：`apps/examples/src/pages/planetary-atmosphere/` 内的 Reference、Production、LUT、Final、性能遥测和固定场景。
- 直接调用方：大气渲染器、LUT 管线、页面调试信息和性能验证流程。
- 最小公共面：性能信息继续留在页面内部；不新增对外 shader helper、schema 或 barrel export。
- 当前允许：基于测量修正算法量级、重复工作、dirty dependency、pass 成本和大气外路径。
- 当前不允许：无测量依据地扩大 LUT、降低分辨率、增加复杂缓存、修改物理参数或用曝光补偿近似误差。
- 阶段外：云、地形细节、通用 TAA、动态分辨率、通用后处理和第三方渲染引擎。

## Core Rules

- 正确性先于优化：Reference 与 Production 只在相同物理参数、散射阶数、视线语义和显示链路下比较；先比较线性 HDR。
- 先测量再归因：静止、原地旋转、持续位移、大气外和 Reference 分开记录，不用单一平均 FPS 混合不同 dirty 状态。
- 性能记录至少包含固定场景、画布物理尺寸、DPR、FOV、质量档、大气屏幕覆盖率、实际重建 pass、FPS、CPU submit 与 GPU pass 时间。
- 没有 `timestamp-query` 时只报告 CPU submit；不得把 CPU submit 称为 GPU 时间，不编造目标设备数据。
- 优先消除算法量级错误和无意重复工作，再考虑降分辨率、缓存、时域累积或动态质量。
- LUT dirty dependency 必须精确：依赖不变不重建，依赖变化不得读取过期结果；不得为减少重建删除真实依赖。
- 大气顶内外、limb、晨昏线和太阳遮挡是数值敏感区。出现跳变或色带时先检查积分区间、坐标、LUT 映射、采样和能量因子，不先用混合带、曝光或模糊掩盖。
- 后续 Outside View LUT 只有在逐像素 Production 正确性通过且目标设备仍不达标后才进入；时域方案还需可靠的历史失效与重投影语义。
- 优化 Final 或边界积分不得改变远离边界的 HDR 结果；直接路径必须保留为数值基准和边界 fallback。

## Task Board

### 当前执行

- [ ] 建立大气内静止、原地旋转、持续位移、斜向近地边界、大气顶外、space limb 和 Reference 的固定性能记录。
- [ ] 确认 timestamp 能区分 Transmittance、Multi-Scattering、Sky-View、Aerial Perspective 与 Final；不支持时明确记录限制。
- [ ] 关闭 Multi-Scattering，对 Ground noon、sunset、twilight、space limb 比较 Reference 与 Outside Production 的线性 HDR。
- [ ] 覆盖大气顶内外连续移动，以及未命中大气、穿壳返回太空、命中地表三类固定像素，验证 `L/T`、终点分类和路径切换。
- [ ] 覆盖 Low/Medium/High、20°/60°/100° FOV、不同 DPR 与缓慢运动，检查 limb 色带、阶梯、闪烁和帧时间断崖。
- [ ] 在目标设备记录 1080p GPU pass 时间、FPS、屏幕覆盖率、LUT 重建频率和质量步数；同时测量动态 LUT、Final 与边界精确积分。
- [ ] 运行 `pnpm check:quick`、`pnpm --filter examples test` 与 `pnpm --filter examples build`，完成 WebGPU validation 和 shader compilation 复查。

### 暂缓

- [ ] 仅在当前路径正确性通过且目标设备仍不达标时，设计低分辨率 Outside View LUT，并测量重建、插值、边界 fallback 与显存成本。
- [ ] 仅在空间重建仍不达标且历史语义完备时，评估抖动采样、重投影与时域累积。
