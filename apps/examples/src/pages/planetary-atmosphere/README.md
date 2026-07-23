# 行星大气实验：阶段一

阶段一只验证星球尺度几何、摄像机、太阳和 WebGPU 生命周期。当前没有实现大气散射；正常模式中的天空保持黑色，`几何分类调试` 才用固定颜色区分地表、大气壳射线和太空。

## 运行

```powershell
pnpm --filter examples dev
```

访问 `/planetary-atmosphere`。构建与 CPU 测试分别执行：

```powershell
pnpm --filter examples build
pnpm --filter examples test
```

## 操作

- Free flight：点击 canvas 进入 Pointer Lock；鼠标水平绕世界 `+Z` 偏航，垂直调整俯仰并限制在 ±89°，不产生 roll；`W/S` 沿相机局部 forward、`A/D` 沿相机局部 right，这些方向在移动前转换到世界空间；`Q/E` 沿世界 Z 移动。`Shift` 加速，`Ctrl` 减速，滚轮调整速度指数。
- Orbit：拖动或使用 `WASD` 调整绕世界 `+Z` 的方位角与轨道仰角，仰角在极点前限制为 ±89°，避免视线与世界 up 共线；摄像机始终看向世界原点且不产生 roll。滚轮或 `Q/E` 改变轨道半径。
- 预设不会切换控制模式；高空、低轨和深空预设朝向行星中心。
- `全局 XYZ 网格` 固定在世界原点，可切换 XY、XZ、YZ 平面；X 永远为红色、Y 为绿色、Z 为蓝色，不跟随摄像机或地表法线移动。网格由独立透明 2D canvas 投影，不参与 WebGPU shader、深度和 tone mapping；右上角朝向标始终可见。
- `天空经纬网格` 是无限远世界方向层，不是大气渲染所使用的天空盒。纬度相对世界 XY 平面，经度绕世界 `+Z`，青色赤道为纬度 `0°`，黄色主经线为经度 `0°`（世界 `+Y`）。它不读取摄像机位置，可用于直接检查视角旋转的方向和连续性。

失焦、退出 Pointer Lock、模式切换和组件卸载都会清空按键与速度状态。

页面内置 `[CameraViewJumpProbe]` 控制台探针。它逐帧比较摄像机 `forward/right/up`，并累计同一帧鼠标或键盘提供的角度预算；单帧变化达到 `8°`，或实际变化明显超过输入预算时，会输出跳变原因、模式、Pointer Lock、原始输入、Free yaw/pitch、Orbit 方位/仰角、位置和变化前后的完整摄像机基。

Pointer Lock 单个 `mousemove` 的位移长度超过 `64px` 时视为浏览器异常输入，控制器会丢弃该事件并输出 `[CameraInputOutlier]`。这只过滤离散输入尖峰，不对正常鼠标输入做平滑、插值或阻尼。

## 坐标约定

- 采用与 Blender 世界轴相同的右手 Z-up 约定：`+X` 向右、`+Y` 向前、`+Z` 向上，行星中心位于世界原点。
- 默认观察点位于行星 `-Y` 赤道方向，避免把目标锁定摄像机放在世界上轴极点。太阳方位角 `0°` 指向世界 `+Y`，`90°` 指向世界 `+X`；高度角相对世界 XY 平面。
- `localUp = normalize(cameraPosition)`。
- 相机局部基固定为 `right=+X`、`forward=+Y`、`up=+Z`，由单一单位四元数转换到世界空间。Free 的 yaw/pitch 是控制器内唯一视角状态，每次直接重建无 roll 姿态；从 Orbit 返回 Free 时立即完成一次显式转换，不再等首次鼠标事件改变坐标约束。
- Orbit 的方位角、仰角和半径是轨道状态的唯一来源。它改变摄像机的世界位置，再以世界 `+Z` 为 up 参考朝向球心；不会把轨道状态写入 Free 的视角状态。
- 太阳不是场景物体，也没有局部 transform。UI 角度只生成一个世界空间单位方向，shader、昼夜面和太阳圆盘消费同一个方向。
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
Vue 生命周期和控件
  → CameraController（DOM 输入、速度、模式、预设）
  → PlanetCamera（位置、单位四元数、全局正交基、防穿地）
  → AtmosphereRenderer（WebGPU 资源、uniform、render pass）
  → stageOne.wgsl（射线重建、球交、太阳圆盘、Lambert 地表）
  → exposure + tone mapping
  → canvas

PlanetCamera
  → DebugOverlay（全局网格投影、近面裁剪、XYZ 朝向标）
  → transparent 2D canvas
```

`AtmosphereParameters.ts` 是半径、地表反照率、太阳辐亮度和角半径的唯一来源。Vue、摄像机与 WGSL 不重新定义这些值。

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

速度指数再乘 `2^exponent`。Free flight 对目标速度做指数响应，并使用已经转换到世界空间的相机 forward/right 与世界 Z。`PlanetCamera.move` 对位移线段和最低高度球做 sweep；接触地表后保留剩余切向位移，既不修改相机朝向，也不允许高速穿过行星。

## 太阳与颜色

太阳是从场景点指向太阳的单位方向，不是有限距离点光源。圆盘由：

```text
dot(viewDirection, sunDirection) >= cos(sunAngularRadius)
```

判定。地表使用 `albedo * solarRadiance * max(dot(normal, sunDirection), 0)`。物理计算保持线性 HDR，只在最终 fragment 输出前执行一次曝光、指数 tone mapping 和显示 gamma。

## Uniform 布局

TS 使用连续 28 个 `f32`，WGSL 使用 7 个 `vec4<f32>`，总计 112 bytes：

| byte offset | WGSL 字段 | 内容 |
| ---: | --- | --- |
| 0 | `planet_center_radius` | 相机相对球心 xyz、地表半径 |
| 16 | `camera_right_tan_half_fov` | right xyz、`tan(FOV/2)` |
| 32 | `camera_up_aspect` | up xyz、宽高比 |
| 48 | `camera_forward_atmosphere_radius` | forward xyz、大气顶半径 |
| 64 | `sun_direction_angular_radius` | 太阳方向 xyz、角半径 |
| 80 | `sun_radiance_exposure` | 太阳线性辐亮度 rgb、曝光 |
| 96 | `surface_albedo_debug` | 地表线性反照率 rgb、调试开关 |

## 生命周期与错误

pipeline、uniform buffer 和 bind group 只在初始化创建。每帧只调整 canvas 像素尺寸、写入既有 uniform、创建帧命令并提交。shader compilation info、pipeline validation error scope、`uncapturederror` 和 `device.lost` 都会向页面暴露错误。卸载时解除输入监听、取消 RAF、unconfigure canvas 并销毁 GPU 资源。

## 阶段一边界

- 尚无 Rayleigh、Mie、ozone、透射率或多重散射。
- 大气壳颜色只存在于显式几何调试模式，不代表物理天空。
- `CPU submit` 是 CPU 编码与提交周边时间，不是 GPU pass 时间。
- 视觉与输入验收必须在支持 WebGPU 的实际浏览器中完成，不能由构建成功替代。

## 源码学习顺序

1. `atmosphere/AtmosphereParameters.ts`
2. `math/vector3.ts`
3. `math/coordinates.ts`
4. `math/raySphere.ts`
5. `camera/PlanetCamera.ts`
6. `camera/orbitCoordinates.ts`
7. `camera/CameraController.ts`
8. `atmosphere/shaders/stageOne.wgsl`
9. `atmosphere/AtmosphereRenderer.ts`
10. `index.vue`
