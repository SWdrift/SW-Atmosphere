# 大气实验

阶段一验证星球尺度几何、摄像机、太阳和 WebGPU 生命周期。阶段二已建立共享物理参数、Reference 单次散射直接积分，以及 Transmittance、Multi-Scattering、Sky-View、双 3D Aerial Perspective 和地表最终合成。`几何分类调试` 只用固定颜色区分地表、大气壳射线和太空，不代表物理输出。

## 运行

```powershell
pnpm --filter examples dev
```

访问 `/planetary-atmosphere`。构建与 CPU 测试分别执行：

```powershell
pnpm --filter examples build
pnpm --filter examples test
```

测试使用 Vitest。文件或模块级测试与源码同目录同名；跨模块测试位于本目录的 `test/`。

## 操作

- Free flight：点击 canvas 进入 Pointer Lock。相机使用 Body/Look Rig：鼠标修改相对 Body 局部天顶的 yaw/pitch，pitch 限制为 ±89°；`Q/E` 绕当前最终视线旋转整个 Body，局部 right/up、局部天顶和屏幕随之一起偏转，lookYaw/lookPitch 保持不变。因此任意 Q/E 后鼠标操作与默认姿态同构。`W/S` 沿最终 view forward、`A/D` 沿最终 view right；`Space/C` 严格沿 Body local up 上升/下降，不随 Look yaw/pitch 偏转。`Shift` 加速，`Ctrl` 减速，滚轮调整速度指数。
- Orbit：拖动或使用 `WASD` 调整绕世界 `+Z` 的方位角与轨道仰角，仰角在极点前限制为 ±89°，避免视线与世界 up 共线；摄像机始终看向世界原点且不产生 roll。滚轮或 `Q/E` 改变轨道半径。
- Free 模式提供两个快捷视角：“赤道默认”把相机移回 `-Y` 赤道地表，使 Body 水平面严格重合世界 XZ，并由 Look 单独承担真实可见地平线俯角；“世界基准”保持当前位置，只把 Body/Look 重置为 `right=+X、forward=+Y、up=+Z`。两个操作在 Orbit 中禁用。
- Free 模式的摄像机面板可编辑世界位置与相对 Body 的“偏航角/俯仰角”。编辑使用独立草稿和显式应用命令，不把低频 telemetry 双向绑定成控制真相；位置必须位于最低高度球面之外，偏航角限制为 ±180°、俯仰角限制为 ±89°。最终 View forward、Body right/forward/up 和 Look 角继续由场景 telemetry 发布到诊断面板；Orbit 不存在 Body/Look 时对应字段显示 `—`，且禁用这些 Free 编辑命令。
- 预设不会切换控制模式。地表预设高度为 `0.0015 km`（1.5 m）；地表、20 km 和 limb 预设按球面半径精确指向可见地平线，低轨和深空预设朝向行星中心。
- “验证用例”按“观察尺度 / 专项诊断 → 分组 → 用例”展示，并使用 `/planetary-atmosphere/presets/:caseId` 深链接。点击按钮、直接访问、刷新和浏览器前进后退都由同一路由入口激活完整场景；离开“预设”标签页后取消激活，但不擅自恢复页面参数。
- 自动化可直接访问稳定用例 URL，例如 `/planetary-atmosphere/presets/ground-civil-twilight`、`/planetary-atmosphere/presets/space-limb` 或 `/planetary-atmosphere/presets/ground-terminator-reference`，再通过 `window.atmosphereWorkbench.getSnapshot()` 获取完整上下文。
- 参考图是可选用例数据，默认不显示，混合比例默认 `0.5`；两项设置不随用例切换而变化，并通过 `reference=0|1`、`mix=0..1` 查询参数复现。图片保持原始宽高比，只比较用例注明的自然层次，不用于逐像素拟合。
- `地表晨昏线 60°` 提供 Production、Reference、Aerial L 串行对照路径；`太空大气边缘` 提供从 400 km 到 800 km 的确定性 limb 移动路径，每帧按当前高度重新构建切线姿态。路径执行期间禁用冲突的人工相机输入。
- `全局 XYZ 网格` 固定在世界原点，可切换 XY、XZ、YZ 平面；X 永远为红色、Y 为绿色、Z 为蓝色，不跟随摄像机或地表法线移动。右上角的 `WORLD` 指示器显示世界轴在最终视角中的投影，保留朝视线方向的缩短量；相邻 Body/Look 姿态仪以 Body 水平面为基准显示 Look pitch，并标出相对 Body 的 yaw/pitch。姿态仪刻度使用 `tan(目标仰角 - Look pitch)` 的透视投影，`15°/30°` 等标签对应真实角差，不采用视觉等距假刻度。Orbit 没有 Body/Look 状态时姿态仪明确显示 `NO BODY`，不从世界坐标伪造身体水平。两个指示器均可独立开关。
- 网格和两个指示器由画面内的独立透明 2D overlay canvas 绘制，不参与 WebGPU shader、深度和 tone mapping，但会进入视口截图。
- `天空经纬网格` 是无限远世界方向层，不是大气渲染所使用的天空盒。纬度相对世界 XY 平面，经度绕世界 `+Z`，青色赤道为纬度 `0°`，黄色主经线为经度 `0°`（世界 `+Y`）。它不读取摄像机位置，可用于直接检查视角旋转的方向和连续性。

失焦、退出 Pointer Lock、模式切换和组件卸载都会清空按键与速度状态。

Pointer Lock 单个 `mousemove` 的位移长度超过 `64px` 时视为浏览器异常输入，控制器会丢弃该事件并输出 `[CameraInputOutlier]`。这只过滤离散输入尖峰，不对正常鼠标输入做平滑、插值或阻尼。

页面运行后通过 `window.atmosphereWorkbench` 暴露只读快照和最小操作 API：`activateCase(id)`、`deactivateCase()`、`runPath(id)`、`stopPath()`、`setReferenceVisible(visible)`、`setReferenceMix(mix)`、`getSnapshot()`。每个动作路径检查点还会派发 `atmosphere-workbench-checkpoint` 事件，事件 `detail` 是当时的可序列化快照，供浏览器截图或自动化消费。

## 坐标约定

- 采用与 Blender 世界轴相同的右手 Z-up 约定：`+X` 向右、`+Y` 向前、`+Z` 向上，行星中心位于世界原点。
- 默认观察点位于行星 `-Y` 赤道方向，避免把目标锁定摄像机放在世界上轴极点。太阳方位角 `0°` 指向世界 `+Y`，`90°` 指向世界 `+X`；高度角相对世界 XY 平面。
- `localUp = normalize(cameraPosition)`。
- 相机局部基固定为 `right=+X`、`forward=+Y`、`up=+Z`。Free 的控制真相是单位 `qBody` 与相对 Body 的 `lookYaw/lookPitch`，最终姿态固定为 `qCamera = qBody × qYaw × qPitch`。Q/E 以当前最终 forward 为世界旋转轴左乘 `qBody`，鼠标不修改 Body；最终四元数不反馈为控制角。
- Orbit 的方位角、仰角和半径是轨道状态的唯一来源。它改变摄像机的世界位置，再以世界 `+Z` 为 up 参考朝向球心；返回 Free 时把当前完整世界基初始化为新的 Body，观察角归零。
- 太阳不是场景物体，也没有局部 transform。UI 角度只生成一个世界空间单位方向，shader、昼夜面和太阳圆盘消费同一个方向。
- 月球是地球大气外的独立天体。UI 控制地心方向，`celestial/MoonParameters.ts` 唯一定义平均半径、地心距离和当前 Lambert 漫反射近似；场景由相机世界位置派生视差和角半径，不设置显示尺寸。
- CPU 和 GPU 长度统一使用 km，角度在 UI/CPU 输入使用 degree，三角函数和 WGSL 使用 radian。
- CPU 世界位置使用 JavaScript `number`。GPU 把摄像机视为原点，上传 `planetCenter = -cameraPosition`，避免 shader 中再次叠加大坐标。
- WGSL clip-space 的 x/y 范围是 `[-1, 1]`，深度范围是 `[0, 1]`。阶段一使用没有深度附件的全屏三角形。
- CPU 不构造矩阵；向 WGSL 直接上传正交摄像机基。WGSL `vec4`/矩阵遵循列向量语义，后续若加入矩阵必须保持这一约定。

像素射线为：

```text
normalize(
  forward
  + right * ndcX * aspect * tan(verticalFov / 2)
  + up * ndcY * tan(verticalFov / 2)
)
```

## 数据流

```text
Pinia AtmosphereStore（控制参数唯一真相、低频运行快照）
  → Vue 控制面板（只消费状态和发出操作）
  → useAtmosphereScene（Vue 生命周期适配）
  → AtmosphereScene（场景资源、更新/渲染循环、遥测发布）
  → CameraController（DOM 输入、速度、Free/Orbit 模式）
  → PlanetCamera（位置、单位四元数、全局正交基、防穿地）
  → AtmosphereRenderer（WebGPU 资源、uniform、compute/render pass）
  → Transmittance LUT（256×64，RGB 透射率）
  → Multi-Scattering LUT（32×32，RGB Ψms / 单位太阳辐照度）
  → Sky-View LUT（192×108，大气内观察者的天空辐亮度）
  → Aerial Perspective（两个 32³ RGB 体纹理）
  → High 或 FOV≤20°：逐像素大气积分（复用 Transmittance / Multi-Scattering）
  → stageOne.wgsl（Reference 射线积分、太阳圆盘、Lambert 地表）
  → 三波长辐亮度近似转换为线性 sRGB
  → exposure + tone mapping + sRGB 传递函数
  → canvas

PlanetCamera
  → scene/DebugOverlay（overlay 生命周期、网格投影与指示器排列）
    → WorldAxesIndicator（世界 XYZ 投影）
    → BodyAttitudeIndicator（Body 水平与 Look 关系）
  → transparent 2D canvas
```

`AtmosphereParameters.ts` 是底部/顶部半径、Rayleigh/Mie、ozone、地表反照率和太阳参数的唯一来源，并负责 fail-fast 校验与 GPU 序列化。`celestial/MoonParameters.ts` 独立保存月球尺度和反射参数，并从世界空间月心与相机位置构建逐帧观察结果。摄像机预设、初始高度和切线姿态由 `camera/cameraPresets.ts` 定义；`CameraController.ts` 直接消费同一初始高度作为最低高度，不建立第二个数值。右侧功能菜单的控制参数由 `model/atmosphereStore.ts` 集中维护；场景内部的摄像机姿态、速度积分和 GPU 资源不进入 Vue 响应式状态。

## 球交

令 `o` 为射线原点、`d` 为方向、`c` 为球心、`r` 为半径：

```text
a = dot(d, d)
halfB = dot(o - c, d)
cTerm = dot(o - c, o - c) - r²
discriminant = halfB² - a * cTerm
t = (-halfB ± sqrt(discriminant)) / a
```

CPU 实现在 `math/raySphere.ts`，覆盖未命中、背离、内部、相切和普通双交点。WGSL 使用单位方向后的等价式。大气区间只在 `far >= 0` 时可见；地表只接受摄像机前方的 `near >= 0` 交点。

## 跨尺度控制

自动速度由 `camera/CameraController.ts` 唯一定义：

```text
speedKmPerSecond = clamp(max(0.005, altitudeKm * 0.05), 0.005, 2000)
```

速度指数再乘 `2^exponent`。Free flight 在局部分量中对目标速度做指数响应：WASD 使用最终 view right/forward，Space/C 使用 `qBody` 派生的 Body up。Look yaw/pitch 因此不会改变升降基准，Q/E 修改 Body 后升降方向才随 Body 旋转。`PlanetCamera.move` 对位移线段和最低高度球做 sweep；接触地表后保留剩余切向位移，既不修改相机朝向，也不允许高速穿过行星。

## 太阳、月球与颜色

太阳是从场景点指向太阳的单位方向，不是有限距离点光源。圆盘先计算视线与太阳方向的角距离，再使用该角距离的屏幕导数估计像素角宽度：

```text
angularDistance = acos(dot(viewDirection, sunDirection))
coverage = 1 - smoothstep(
  sunAngularRadius - 0.5 * pixelAngularWidth,
  sunAngularRadius + 0.5 * pixelAngularWidth,
  angularDistance
)
```

判定。太阳 RGB 波长采样辐照度单位为 `W·m^-2·nm^-1`。太阳圆盘辐亮度由 `solarIrradianceWattsPerSquareMeterPerNm / (2π(1-cos(angularRadius)))` 得到，单位为 `W·m^-2·sr^-1·nm^-1`；圆盘边缘使用像素角距离的屏幕导数估计覆盖宽度，不扩大物理角半径。

照亮大气和地表的太阳不再使用中心射线二值遮挡。每个采样点根据太阳圆盘中心到几何地平线的带符号角距，解析计算均匀圆盘露出面积；部分遮挡时，地表余弦项还积分可见圆盘的一阶矩。Production 和 Reference、单次散射、Multi-Scattering 输入以及地表直射共同使用这套有限圆盘定义。部分遮挡区的光学路径使用贴近几何切线的安全方向查询，避免用穿过行星的中心方向读取 Transmittance。

散射/消光系数使用 `km^-1`，与 km 路径积分相乘后光学深度无量纲，因此大气积分保持三条代表波长的光谱辐亮度。最终显示使用 Bruneton 680/550/440 nm 近似的 sky/sun 两组光谱到线性 sRGB 系数，并按绿色通道归一化以保持既有曝光尺度；直接太阳和地表直射先换算到 sky 编码后再与大气辐亮度合成。物理合成后只执行一次指数 tone mapping，并使用分段 sRGB 传递函数，不再以固定 `pow(1/2.2)` 代替显示编码。

月球按赤道半径 `1737.5 km` 和平均地心距离 `384400 km` 构建。Final shader 解析重建球面法线，使用当前唯一太阳方向和无纹理 Lambert 漫反射近似形成月相；地球表面负责遮挡月球，未命中地表的月球背景统一按 `moonRadiance × transmittance + inScatteredRadiance` 穿过大气。本阶段不包含月面纹理、轨道历表、地照或食相。

## Uniform 布局

物理参数 buffer 只在 renderer 创建时上传。TS 使用连续 36 个 `f32`，WGSL 使用 9 个 `vec4<f32>`，总计 144 bytes：

| byte offset | WGSL 字段 | 内容 |
| ---: | --- | --- |
| 0 | `radii_sun` | 底部半径、顶部半径、太阳角半径、padding |
| 16 | `rayleigh_scattering_scale_height` | Rayleigh scattering rgb、尺度高度 |
| 32 | `mie_scattering_scale_height` | Mie scattering rgb、尺度高度 |
| 48 | `mie_extinction_phase_g` | Mie extinction rgb、相函数 g |
| 64 | `ozone_absorption_center_height` | ozone absorption rgb、层中心高度 |
| 80 | `ground_albedo_ozone_half_width` | 地表反照率 rgb、ozone 半宽 |
| 96 | `solar_irradiance_w_m2_nm` | 太阳辐照度 RGB 波长采样，`W·m^-2·nm^-1`、padding |
| 112 | `sky_spectral_to_linear_srgb` | 三波长天空辐亮度到线性 sRGB 的归一化系数、padding |
| 128 | `sun_spectral_to_linear_srgb` | 三波长太阳辐亮度到线性 sRGB 的归一化系数、padding |

逐帧 buffer 使用 10 个 `vec4<f32>`，总计 160 bytes：

| byte offset | WGSL 字段 | 内容 |
| ---: | --- | --- |
| 0 | `planet_center_exposure` | 相机相对球心 xyz、曝光 |
| 16 | `camera_right_tan_half_fov` | right xyz、`tan(FOV/2)` |
| 32 | `camera_up_aspect` | up xyz、宽高比 |
| 48 | `camera_forward_debug` | forward xyz、调试开关 |
| 64 | `sun_direction` | 太阳方向 xyz、padding |
| 80 | `integration` | Reference 视线/太阳步数、Production 标志、多重散射开关 |
| 96 | `quality_debug` | Sky-View/Aerial 步数、debug view、3D slice |
| 112 | `components` | Rayleigh、Mie、ozone 开关、高频逐像素路径标志 |
| 128 | `moon_direction_angular_radius` | 相机指向月心的方向 xyz、观察角半径 |
| 144 | `moon_reflectance_enabled` | 月面 RGB 漫反射率、显示开关 |

## 生命周期与错误

`AtmosphereRenderer` 只协调 device/canvas、uniform 和最终 render pass；`AtmosphereLutPipeline` 统一持有五张 LUT、四个 compute pipeline、bind group、dirty dependency 与销毁。所有 GPU 资源只在生命周期边界创建，物理参数只上传一次。初始化命令先写 Transmittance，再由 Multi-Scattering 读取它，提交完成后检查 validation error。每帧只写既有 Frame uniform、按 dirty 状态编码必要 pass 并提交。

物理开关变化级联重建 Transmittance 与 Multi-Scattering，并使 Sky-View 和 Aerial Perspective 失效；观察高度/太阳天顶角只影响 Sky-View，相机姿态/FOV/画布尺寸只影响 Aerial Perspective。页面显示本帧实际重建的 pass。shader compilation info、pipeline validation error scope、`uncapturederror` 与 `device.lost` 都会向页面暴露错误。

Multi-Scattering LUT 使用 Hillaire 2020 §5.5 的 `(sunCosine, altitude)` 参数化：`u = 0.5 + 0.5 × sunCosine`，`v = altitude / atmosphereHeight`。每个 texel 使用 `8×8` 个等面积球面方向和每条方向 `20` 个中点样本，累计二阶入射散射 `L2` 与无量纲传递因子 `f`，保存 `Ψms = L2 / (1 - f)`。相函数在此处按各向同性 `1/(4π)` 出现一次；LUT 保存的是单位太阳辐照度下的 `sr^-1` 因子。臭氧只进入 extinction，不进入 scattering。

`rgba16float` 通过 `textureLoad` 手工插值，不要求 `float16-filterable` optional feature。Transmittance RGB 是无量纲透射率；Multi-Scattering RGB 是后续乘以 `solarIrradianceWattsPerSquareMeterPerNm` 的 `sr^-1` 散射因子。Aerial Radiance 的 alpha 标记该 froxel 射线是否以地表为终点，其他 LUT 的 alpha 当前没有物理含义。

Sky-View 使用 192×108 的 Hillaire 分段平方地平线映射，只在相机位于大气内时生成和读取。其 dirty key 只包含观察半径、太阳天顶余弦和多重散射开关。大气外 Production 不复用该映射：每个命中大气壳的像素只积分大气顶入口到大气出口或地表的实际介质路径，太阳透射和多重散射分别查询共享 Transmittance 与 Multi-Scattering LUT；显式 Reference 模式仍使用视线与太阳路径嵌套积分。

大气内 High 质量或垂直 FOV 不大于 `20°` 时同样不读取 Sky-View/Aerial 缓存，最终像素直接积分到地表或大气顶，并复用 Transmittance 与 Multi-Scattering LUT。该路径用于太阳前向散射峰、晨昏阴影和窄 FOV 放大后的角向高频结构；Low/Medium 广角继续使用缓存路径。

Aerial Perspective 使用两个独立的 32×32×32 `rgba16float` 纹理：一个保存 RGB 入射散射辐亮度 `L`，另一个保存无量纲 RGB 透射率 `T`，不把六个通道模糊地压入普通 RGBA。每条屏幕射线的 `z` 切片对应 `distance = boundaryDistance × z²`，其中 boundary 是该射线最先到达的地表或大气顶。当前地表 Production 合成严格使用 `surfaceRadiance × T + L`；纯地表四邻域使用归一化的地表类 froxel 插值。地表切线附近根据 Aerial 角向 texel 的 X/Y 联合判别式足迹建立连续逐像素积分带，斜向边界不会退化为单轴宽度；Aerial `L/T` 调试视图也使用这一重建边界，禁止用离散 froxel 分类单元切换算法或混合终点语义不同的样本。

## 质量与调试

- Reference：48 个视线路径样本、24 个太阳路径样本，始终为单次散射直接积分。
- Low：Sky-View 12 步、Aerial Perspective 6 步。
- Medium：Sky-View 20 步、Aerial Perspective 10 步。
- High：48 步逐像素积分；其 LUT 仍以 Sky-View 32 步、Aerial Perspective 16 步生成供调试视图使用。
- 默认使用 Medium、Multi-Scattering 和曝光 10；曝光只属于最终显示标定，不改变物理参数或 LUT 能量。
- Multi-Scattering 可在 Production 独立关闭；Reference 始终禁用该开关，关闭后可在相同物理参数与相同单次散射阶数下比较 Reference/Production。
- 调试视图覆盖 Transmittance、Multi-Scattering、Sky-View、Aerial `L`、Aerial `T` 和 Rayleigh/Mie/ozone density。
- 设备支持 `timestamp-query` 时，每 500 ms 低频读取一次实际执行 pass 的 GPU 时间；不支持时只显示 CPU submit，二者不会混称。
- 固定视觉基准覆盖地表局部太阳高度 `+5°/0°/−1°/−6°/−12°/−18°`、`5°/10°/20°` 窄 FOV 太阳、20 km 高空晨昏、400 km 太空 limb 和深空行星盘晨昏。用例先从观察点当地坐标构建太阳方向，再转换为运行时世界角；页面同时显示相机位置处的局部太阳高度，避免把世界 XY 高度角误当成当地太阳高度。

## 公式与依据

| 子系统 | 公式或参数化 | 首要依据 |
| --- | --- | --- |
| density / extinction | 指数 Rayleigh/Mie、三角 ozone；`σt = σr + σm,ext + σozone` | Hillaire 2020 Table 1；Bruneton 2017 definitions |
| Transmittance | `T = exp(-∫σt ds)`，Bruneton 非线性 `(r, μ)` 映射 | Bruneton 2017 transmittance functions |
| 单次散射 | `∫Tview Tsun (σr pr + σm pm) E ds` | Hillaire 2020 Eq. 1-3 |
| 有限太阳圆盘 | 均匀圆盘被几何地平线分割后的面积与一阶矩 | 解析圆弓形积分；太阳角半径仍来自统一大气参数 |
| 光谱显示近似 | 680/550/440 nm sky/sun 辐亮度权重，线性 sRGB 后执行显示转换 | Bruneton 2017 `ComputeSpectralRadianceToLuminanceFactors` |
| Multi-Scattering | `Ψms = L2 / (1-fms)`，`u=(μs+1)/2`、`v=altitude/height` | Hillaire 2020 Eq. 5-11、§5.5 |
| Sky-View | 地平线上下分段平方映射，仅供大气内观察者 | Hillaire 2020 §5.3；官方 `RenderSkyCommon.hlsl` |
| Aerial Perspective | 独立 RGB `L/T`，`distance=boundary×slice²` | Hillaire 2020 §5.4；最终 `scene×T+L` |

## 当前边界

- 已有 Reference Rayleigh、Mie、ozone、Beer-Lambert 和单次散射直接积分。
- 已建立 Transmittance、Multi-Scattering、Sky-View、双 3D Aerial Perspective 与地表最终合成。
- 已接入 Bruneton 三波长显示近似、有限太阳圆盘遮挡和 High/窄 FOV 逐像素 Production 路径；完整多波长、多阶散射离线 Reference 仍未建立。
- 已接入具有地月尺度、相机视差、解析月相和统一大气背景合成的无纹理月球；轨道历表、真实月面光度与食相仍未建立。
- 大气外 Production 已使用逐像素单层视线积分，并复用 Transmittance 与 Multi-Scattering LUT；低分辨率 Outside View LUT 尚未实现。
- 固定场景已有可重复入口，但 Reference/Production 像素误差尚未由 GPU readback 自动量化。
- `rgba16float` storage 与 32³ texture limit 仍需在实际目标设备验证；读取采用 `textureLoad` 手工插值，不依赖 `float16-filterable`。
- 大气壳颜色只存在于显式几何调试模式，不代表物理天空。
- `CPU submit` 是 CPU 编码与提交周边时间；只有 `timestamp-query` 输出才是 GPU pass 时间。
- 视觉与输入验收必须在支持 WebGPU 的实际浏览器中完成，不能由构建成功替代。

## 源码学习顺序

1. `atmosphere/AtmosphereParameters.ts`
2. `celestial/MoonParameters.ts`
3. `math/vector3.ts`
4. `math/coordinates.ts`
5. `math/raySphere.ts`
6. `camera/PlanetCamera.ts`
7. `camera/orbitCoordinates.ts`
8. `camera/cameraPresets.ts`
9. `camera/CameraController.ts`
10. `model/atmosphereState.ts`
11. `model/atmosphereStore.ts`
12. `scene/AtmosphereScene.ts`
13. `atmosphere/shaders/stageOne.wgsl`
14. `atmosphere/AtmosphereLutPipeline.ts`
15. `atmosphere/GpuTimestampRecorder.ts`
16. `atmosphere/AtmosphereRenderer.ts`
17. `index.vue`
