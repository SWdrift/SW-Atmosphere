# Clear Atmosphere Visual Fidelity Memory

本文件保存 `cp-atmosphere-visual.md` 的可复用实现决策；活跃视觉任务和高频验收约束仍以 CP 为准。自然现象与读图知识以上位 `document/行星大气光学与视象图谱.md` 为准。

## 颜色与太阳

- `AtmosphereParameters` 已承载 Bruneton 680/550/440 nm 的 sky/sun 显示近似；Reference 与 Production 保持三波长 HDR 积分，最终统一转换到线性 sRGB，再经过唯一 exposure、tone mapping 和分段 sRGB 传递函数。
- 当前三波长方案是待多波长 Reference 验证的 Production 近似，不是完整光谱真值；不得据此宣称照片级真实。
- 有限太阳圆盘遮挡使用解析圆盘分段面积和一阶矩；同一可见率进入地表直射、单次散射、Multi-Scattering 输入和大气外路径。
- 太阳圆盘辐亮度来自唯一的太阳辐照度与立体角换算；FOV 只影响屏幕覆盖，不改变太阳能量或物理角尺寸。

## 固定场景与尺度

- 垂直 FOV 权威范围已覆盖 `5°–100°`。大气内 High 或 `FOV≤20°` 时，Final 可直接积分实际介质路径并复用共享物理 LUT，以避免视点缓存掩盖窄视场误差。
- 已建立地表局部太阳高度 `+5°/0°/−1°/−6°/−12°/−18°`、`5°/10°` 太阳、约 20 km 高空、400 km limb 和深空行星盘入口；固定场景显示相机位置处的局部太阳高度。
- 球对称大气没有内生纬度差异。纬度、日期、地方时、自转轴与太阳赤纬若进入系统，应由独立天文几何派生世界太阳方向，不在大气 shader 内重复定义。
- 背景天体若后续加入，统一按 `backgroundRadiance × transmittance + inScatteredRadiance` 合成，不建立天体专属大气公式。

## 未建立的能力

- 完整多波长、多阶散射离线 Reference、GPU HDR readback、近地折射和目标设备人工视觉验收尚未完成。
- 晴空气溶胶的非灰消光、完整地表天空漫射耦合、其他星球组分与相机后期效果仍属于后续能力。
