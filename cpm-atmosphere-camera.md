# Atmosphere Camera Memory

本文件保存 `cp-atmosphere-camera.md` 的可复用工程记忆；活跃任务和高频约束仍以 CP 为准。

## 坐标与控制

- 世界空间和相机局部空间均采用右手 Z-up 约定。`PlanetCamera` 的单位四元数是最终姿态真相，renderer 只消费世界空间位置和 `right/up/forward`。
- Free 的 `qBody` 定义人的局部 right/forward/up 与局部天顶，`lookYaw/lookPitch` 是相对 Body 的观察角；最终姿态为 `qBody × qYaw × qPitch`。
- Q/E 绕当前最终 forward 旋转整个 Body，鼠标只修改 Look。因此横滚后的局部坐标、屏幕与局部天顶整体一致旋转，最终姿态不反馈为控制角。
- Free 的 WASD 缓动速度保存为相机局部分量，每帧通过当前基转换为世界位移。Orbit 单独使用世界 Z-up 方位角、仰角和半径。
- 摄像机预设是纯定位数据；验证用例在其上编排场景、参数、可选参考图和动作路径，两者不合并。

## Pointer Lock

- Windows Chromium 的 Pointer Lock 相对移动流可能偶发产生异常大的 `movementX/Y`。该离散输入会按灵敏度直接转换为单帧旋转，因此曾表现为无规律的视角跳变，并容易被误判为四元数或坐标系错误。
- 已定位到输入尖峰后，控制器在输入边界丢弃长度超过 `64px` 的单事件并输出 `[CameraInputOutlier]`。逐帧比较摄像机基和输入预算的跳变探针只服务过定位过程，不再作为常驻运行逻辑。
- 没有新测量证据时，不用平滑、插值或阻尼掩盖输入尖峰。

## 路径接入

- 自动化路径以绝对姿态和明确插值时间驱动摄像机；执行期间禁用人工输入，结束、停止或失败都恢复输入。
- 天空经纬 debug 是不读取摄像机位置的无限远世界方向层，可用于区分姿态问题与场景位置问题，但不是大气天空盒。
