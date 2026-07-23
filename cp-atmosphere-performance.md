# Planet Atmosphere Performance Control Plane

## Control Plane Role

本控制平面约束星球大气渲染的整体性能分析、优化和验证，覆盖 Reference、Production、静态与动态 LUT、Final 全屏合成、大气内外观察路径以及性能遥测。优化必须建立在正确的物理结果和实际测量之上，不以降低无法解释的视觉正确性换取帧时间。

首项优化已建立“大气外逐像素 Production 单层积分”：相机越过大气顶后不再回退逐像素 Reference 嵌套积分。当前仍需完成浏览器视觉、GPU timestamp 和目标设备性能验证；大气内动态 LUT 重建、Final 全屏成本、DPR、边界精确积分和后续 Outside View LUT 均留在本控制平面持续测量和推进。

## Meta Reference

- 先读根目录 `cp-meta.md`，再读上位 `cp-atmosphere.md`，最后读本文件。
- 可复用工程记忆读取根目录 `cpm-atmosphere.md`；本 CP 与其冲突时，以代码事实、上位 CP 和本 CP 的更具体任务边界为准。
- 同时遵循根目录 `AGENTS.md` 与 `apps/examples/src/pages/AGENTS.md`。
- 修改或审查代码时使用 `code-smell-guard`；阶段完成或动态任务区膨胀时使用 `compact-control-plane`。

## Scope

- 主作用域：`apps/examples/src/pages/planetary-atmosphere/`，重点包括：
  - `apps/examples/src/pages/planetary-atmosphere/atmosphere/shaders/stageOne.wgsl`
  - `apps/examples/src/pages/planetary-atmosphere/atmosphere/AtmosphereRenderer.ts`
  - `apps/examples/src/pages/planetary-atmosphere/atmosphere/AtmosphereLutPipeline.ts`
- 配套作用域：`GpuTimestampRecorder.ts`、大气物理 CPU 测试、页面 README、性能遥测与固定场景入口。
- 最小公共面不变：实现留在页面内部，不新增对外 shader helper、schema 或 barrel export。
- 当前大气外 Production 第一版不新增高维 LUT；其他性能优化也不得在没有测量证据时扩大纹理、降低分辨率或增加复杂缓存。
- 不修改物理参数，不用曝光补偿性能近似造成的差异。
- 阶段外：云、地形细节、TAA 框架、通用后处理、动态分辨率和第三方渲染引擎。

## Core Rules

### 当前 LUT 模式

LUT 是对昂贵函数在有限输入格点上的预计算纹理；生成 LUT 时仍会积分，Final 通过纹理查询与相邻 texel 插值复用结果。当前 LUT 的权威职责如下：

| LUT | 当前尺寸 | 表达的函数 | 与观察者关系 | 大气外可用性 |
| --- | ---: | --- | --- | --- |
| Transmittance | `256×64` | 大气内某位置沿某方向到大气边界的 RGB 透射率 | 与相机无关 | 直接复用 |
| Multi-Scattering | `32×32` | 某高度与太阳天顶角下的多重散射近似 | 与相机无关 | 直接复用 |
| Sky-View | `192×108` | 当前大气内观察高度和太阳条件下的天空方向辐亮度 | 依赖大气内观察者 | 不强行复用到大气外 |
| Aerial Perspective | 两个 `32³` | 当前相机视锥中随方向和距离变化的 RGB `L` 与 RGB `T` | 依赖相机视锥 | 当前生成和映射只服务大气内 |

- Transmittance 与 Multi-Scattering 是共享底层物理 LUT；大气内外 Production 必须消费同一份纹理和参数化。
- Sky-View 与 Aerial Perspective 是当前视点缓存，不代表完整的内外通用大气函数。
- 不把外部相机位置 clamp 到大气顶后查询 Sky-View；这会丢失外部射线的大气入口、出口、行星角尺寸和 limb 路径语义。
- Reference 与 Production 都需要视线路径积分；二者关键差异是 Reference 为每个视线样本再次积分太阳路径，Production 查询 Transmittance LUT，并按开关查询 Multi-Scattering LUT。

### 当前性能模型

| 路径或 pass | 主要成本 | 变化条件 | 当前判断 |
| --- | --- | --- | --- |
| Reference Final | 全分辨率视线步数 × 太阳路径步数 | 每帧、每个命中大气的像素 | 正确性基准，不是 Production 性能目标 |
| 大气外 Production | 全分辨率单层视线积分，每步查询共享物理 LUT | 每帧、每个命中大气的像素 | 第一版已实现，目标设备性能待验证 |
| Transmittance | `256×64`，每 texel 40 步 | 初始化或物理分量变化 | 静态成本，通常不是稳定帧率瓶颈 |
| Multi-Scattering | `32×32×64` 个方向样本 × 20 步 | 初始化或物理分量变化 | 初始化与切换尖峰候选 |
| Sky-View | `192×108×质量步数` | 高度、太阳天顶角、散射开关或质量变化 | 持续位移时的动态 compute 候选 |
| Aerial Perspective | `32³×质量步数`，同时写 RGB `L/T` | 位置、姿态、FOV、尺寸、太阳或质量变化 | 持续运动时的主要动态 compute 候选 |
| Final | 按物理画布分辨率全屏执行 | 每帧 | 静止 Production 和高 DPR 下的主要候选 |
| Aerial 边界精确积分 | limb/地表分类边界逐像素补算 | 边界像素 | 斜向近地场景的局部候选 |

- “已知”只表示可由代码路径确定，不代表已有目标设备耗时排序；瓶颈排序必须以 GPU timestamp 和固定场景测量确认。
- 静止、原地旋转、持续位移、大气顶外和 Reference 必须分别测量；不得用单一平均 FPS 混合不同 dirty 状态。
- 性能成本同时受画布物理像素数、DPR、大气屏幕覆盖率、质量步数和实际重建 pass 影响。

### 第一版：大气外逐像素 Production

- Production 开启且相机位于大气外时，不再回退 Reference；只对屏幕上命中大气壳的像素执行单层视线积分。
- 每条外部视线先求大气顶球和地表球交：
  - 未命中大气：不执行大气积分。
  - 命中大气、未命中地表：积分区间为大气顶近交点到远交点。
  - 命中地表：积分区间为大气顶近交点到地表近交点。
- 相机到大气入口之间是真空；Production 积分使用 planet-centered 入口位置和大气内实际路径长度，不把真空段纳入步长。
- 复用或最小扩展现有 `integrate_aerial_transfer` 物理核；不得复制一套外部专属密度、散射、消光或颜色公式。
- 每个视线样本：
  - 从 Transmittance LUT 获取太阳到样本点的透射率。
  - 按统一开关从 Multi-Scattering LUT 获取多重散射近似。
  - 累积 RGB 入射散射辐亮度 `L` 与 RGB 视线透射率 `T`。
- 最终组合保持：
  - 地表：`surfaceRadiance × T + L`。
  - 穿过大气后回到深空：输出 `L`。
  - 太阳圆盘位于大气路径之后：`solarRadiance × T + L`。
  - 未命中大气的太阳圆盘：不施加大气透射。
- 第一版允许按现有质量档提供明确的外部视线步数，但步数属于质量真相，必须由同一份质量设置传入；shader 内不得另设隐藏默认值。

### 正确性与性能边界

- 单次散射公平比较必须关闭 Multi-Scattering，并在相同物理参数、视线步数和显示链路下比较 Reference 与 Outside Production。
- 开启 Multi-Scattering 后的亮度变化属于散射阶数差异，必须与 LUT 或曝光误差分开报告。
- 禁止通过曝光、地表反照率、散射系数、太阳能量或扩大物理太阳圆盘补偿 Production 误差。
- 大气顶内外应连续；若存在跳变，先检查积分区间、坐标空间、LUT 映射、散射开关和重复能量因子，不先增加高度混合带掩盖问题。
- limb、晨昏线和太阳遮挡是第一版的数值敏感区；步数不足造成的色带或闪烁不得描述为 LUT 必然误差。
- 性能报告区分 GPU pass 时间、CPU submit 和 FPS；没有 `timestamp-query` 时不得把 CPU submit 称为 GPU 帧时间。
- 性能成本按“命中大气的屏幕像素数 × 外部视线步数 × 每步 Production 查询成本”理解；不得只用相机高度解释性能。

### 后续版本门槛

- 第二版 Outside View LUT 只有在第一版正确性通过、目标设备实测仍不达标后才进入实现。
- 第三版时域优化只有在第二版的空间重建仍不达标，且项目具备可靠运动历史、重投影和相机切换语义后才进入实现。
- 后续优化必须以第一版 Outside Production 为数值基准和边界像素 fallback，不得删除可对照的直接路径。

### 整体优化次序

- 先完善可解释的分 pass 测量，再处理已证实瓶颈；已由当前 40–50 ms 现象和代码路径确认的大气外 Reference 回退可优先修复。
- 优先消除算法量级错误与无意重复工作，再考虑降分辨率、缓存、时域累积或动态质量。
- LUT dirty dependency 必须保持精确：依赖不变不重建，依赖变化不得读取过期结果。不得为减少重建而删除真实依赖。
- DPR、渲染比例和质量档属于可见质量策略；没有目标设备与视觉验收证据时不自动改变。
- 优化 Final 或边界积分时，不得改变远离边界的 HDR 结果。

## Task Board

### 性能基线与遥测

- [ ] 建立固定性能场景：大气内静止、原地滚转、持续位移、斜向近地边界、大气顶外、space limb 和 Reference。
- [ ] 为每个场景记录画布物理尺寸、DPR、FOV、质量档、大气屏幕覆盖率、实际重建 pass、FPS、CPU submit 与 GPU pass 时间。
- [ ] 确认 timestamp 采样能够区分 Transmittance、Multi-Scattering、Sky-View、Aerial Perspective 与 Final；不支持 `timestamp-query` 时明确只报告 CPU submit。
- [ ] 建立优化前后的同场景记录格式，不用一次性峰值或混合状态平均值代替稳定测量。

### 当前优先：Outside Production 第一版

- [x] 冻结外部路径的坐标和区间语义，为大气顶未命中、穿壳返回太空、穿壳命中地表分别建立确定性球交测试或已有测试证据。
- [x] 让 Production 外部路径复用共享 `L/T` 积分核，以大气入口为起点、以大气内实际距离为积分长度。
- [x] 用 Transmittance LUT 替代外部 Reference 的逐样本太阳路径积分，并按现有开关接入 Multi-Scattering LUT。
- [x] 完成深空、地表、太阳圆盘的外部 Production 合成，保持 `surfaceRadiance × T + L` 和唯一 tone mapping 边界。
- [x] 保留显式 Reference 模式；Production 选择不得在大气外静默回退 Reference。
- [ ] 让 GPU timestamp 和页面重建信息能够区分 Outside Production Final 与动态 LUT 成本，不虚构目标设备数据。
- [x] 更新页面 README，说明大气内 LUT 路径、大气外逐像素 Production 路径及 Reference 对照语义。

### Outside Production 第一版验证

- [ ] 关闭 Multi-Scattering，对 Ground noon、sunset、twilight、space limb 比较 Reference 与 Outside Production 的 HDR 结果。
- [ ] 覆盖大气顶内侧、边界和外侧的连续移动，确认不存在硬切换亮度跳变、太阳能量跳变或帧时间断崖。
- [ ] 覆盖未命中大气、仅命中大气壳和命中地表三类固定像素，验证 `L/T` 与终点分类。
- [ ] 覆盖 Low/Medium/High、20°/60°/100° FOV、不同 DPR 与缓慢运动，检查 limb 色带、阶梯和闪烁。
- [ ] 在目标设备记录 1080p GPU Final 时间、FPS、命中大气的大致屏幕覆盖率和不同质量步数；与当前外部 Reference 对照。
- [ ] 运行 `pnpm check:quick`、`pnpm --filter examples test` 与 `pnpm --filter examples build`，完成 WebGPU validation 和 shader compilation info 复查。
- [ ] 明确报告浏览器视觉验证、目标设备 GPU 性能和自动数值对照中的未验证项。

### 后续整体性能优化

- [ ] 测量持续旋转时 Aerial Perspective 每帧重建成本，核对姿态、FOV、尺寸和太阳依赖是否都属于结果真相。
- [ ] 测量持续位移时 Sky-View 与 Aerial Perspective 同帧重建成本，区分观察高度变化与沿球面移动造成的依赖变化。
- [ ] 测量静止 Production 的 Final 成本随物理分辨率和 DPR 的增长，确认是否受 fill rate、手工 LUT 插值或 fragment 算术限制。
- [ ] 统计 Aerial 边界精确积分的像素覆盖率与 Final GPU 增量，确认斜向边界是否形成次级瓶颈。
- [ ] 测量初始化和物理开关变化时 Transmittance/Multi-Scattering 的一次性尖峰，不把它与稳定帧率混为一谈。
- [ ] 只有测量确认后，才为对应 pass 制定最小优化；不得预先扩大 LUT、减少真实 dirty 依赖或降低全局画质。

### Outside Production 第二版：暂缓

- [ ] 仅在第一版目标设备实测仍不达标时设计当前视点的低分辨率 Outside View 2D LUT。
- [ ] 分别表达 RGB `L` 与 RGB `T`，并保存未命中大气、穿壳返回太空、穿壳命中地表的路径分类。
- [ ] Final 使用全分辨率球交分类，只插值同类 texel；缺少同类样本或位于轮廓重建带时回退第一版逐像素 Production。
- [ ] 测量 LUT 分辨率、重建频率、边界像素比例、GPU compute/Final 时间和显存成本后再选择尺寸；不预设放大倍数。
- [ ] 验证行星外侧漏光、地表/天空互染、limb 厚度、运动闪烁和大气顶内外连续性。

### Outside Production 第三版：暂缓

- [ ] 仅在第二版仍不达标时评估抖动采样、历史重投影与时域累积。
- [ ] 先定义相机运动、FOV/resize、太阳变化、质量切换和物理参数变化时的历史失效规则。
- [ ] 建立无历史的第一版结果作为 reference fallback，覆盖相机切换和高速运动。
- [ ] 验证拖影、limb 残影、太阳残影、晨昏线闪烁和历史泄漏；没有稳定证据时不引入 TAA 掩盖空间误差。

## Outside Production 第一版数据流

```text
共享物理参数
  ├─ Transmittance LUT
  └─ Multi-Scattering LUT
          │
大气外屏幕像素
  → 大气顶/地表球交
  → 截取实际大气路径
  → 沿视线执行 Production 单层积分
       ├─ 查 Transmittance
       └─ 按开关查 Multi-Scattering
  → 得到 RGB L 与 RGB T
  → 深空、太阳或 surface × T + L
  → 唯一 exposure 与 tone mapping
```
