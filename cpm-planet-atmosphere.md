# Planet Atmosphere Memory

本文件保存 `cp-planet-atmosphere.md` 的可复用工程记忆；控制目标和活跃任务仍以 CP 为准。

## 坐标与控制

- 世界空间是右手 Z-up 笛卡尔坐标：`+X` 右、`+Y` 前、`+Z` 上，行星中心为原点。
- 相机局部基为 `+X` right、`+Y` forward、`+Z` up；`PlanetCamera` 单位四元数是姿态唯一真相，renderer 只消费世界空间 `right/up/forward`。
- Free 使用世界 Z-up yaw/pitch 且禁止 roll；Orbit 使用世界 Z-up turntable 方位角、仰角和半径。模式切换必须显式转换控制状态。
- 天空经纬 debug 是无限远方向层，不读取相机位置；它用于区分姿态跳变与位置/场景问题，不代表天空盒大气。

## Pointer Lock

- Windows Chromium 的 Pointer Lock 相对移动流可能偶发产生异常大的 `movementX/Y`。应先比较输入角度预算与相机基变化，不能先归因于四元数或坐标系。
- 当前 Free 控制丢弃单事件长度超过 `64px` 的输入并输出 `[CameraInputOutlier]`；`[CameraViewJumpProbe]` 记录帧前后基向量、控制状态和输入预算。
- 没有测量证据时，不用平滑、插值或阻尼掩盖输入尖峰。

## 验证

- 回归测试：`pnpm --filter examples test`。
- 类型检查与生产构建：`pnpm --filter examples build`，实际执行 `vue-tsc -b && vite build`。
- 当前没有 lint 脚本；报告时明确写未配置。
