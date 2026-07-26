# Atmosphere Camera Control Plane

## Control Plane Role

本控制平面约束大气实验页的摄像机坐标、姿态、控制模式、输入边界、预设和确定性路径接入。它是 `cp-atmosphere.md` 的下位工程平面；大气渲染只消费摄像机结果，视觉 CP 继续负责 FOV、构图和连续运动的验收。

## Meta Reference

- 先读 `cp-meta.md`、`cp-atmosphere.md`，再读本文件；可复用摄像机结论读取 `cpm-atmosphere-camera.md`。
- 验证用例和动作路径同时读取 `cp-atmosphere-workbench.md`；FOV 与画面验收同时读取 `cp-atmosphere-visual.md`。
- 修改或审查代码时使用 `code-smell-guard`；阶段完成或动态任务区膨胀时使用 `compact-control-plane`。

## Scope

- 控制对象：摄像机姿态、Free/Orbit 控制、键鼠输入、Pointer Lock、摄像机预设，以及动作路径与摄像机的命令边界。
- 直接调用方：场景协调层、工作台路径、摄像机 UI 和渲染器。
- 最小操作面：设置/读取完整姿态、切换模式、应用稳定预设、启停人工输入和逐帧更新；不向 UI 暴露内部四元数或控制器可变对象。
- 阶段外：大气物理、曝光补偿、镜头后期效果、通用输入框架和录制任意用户操作。

## Core Rules

- 世界空间固定为右手 Z-up：`+X` 右、`+Y` 前、`+Z` 上；摄像机局部基固定为 `+X` right、`+Y` forward、`+Z` up。
- `PlanetCamera` 单位四元数是最终渲染姿态的唯一真相。渲染器只消费由它派生的世界空间位置与 `right/up/forward`，不得建立第二份姿态。
- Free 使用 Body/Look Rig：`qBody` 表达身体局部坐标与局部天顶，鼠标只修改相对 Body 的 yaw/pitch，pitch 限制为 ±89°；Q/E 绕当前最终 forward 旋转 Body。最终姿态固定为 `qCamera = qBody × qYaw × qPitch`，不得从最终姿态反解并修正控制状态。
- Orbit 的世界 Z-up 方位角、仰角和半径是独立权威状态；Free 与 Orbit 切换必须显式同步完整姿态，不混用两套中间状态。
- Free 移动速度保存为局部分量：WASD 通过最终 view right/forward 转换，升降必须通过 `qBody` 派生的 Body up 转换，不能使用经过 Look yaw/pitch 后的 camera up；姿态变化不得遗留旧世界方向的速度。
- 画面方向辅助使用视口内透明 overlay canvas。世界 XYZ 指示器只消费最终相机姿态；Body/Look 姿态仪只消费 Body 相对观察角，两者保持独立模块、独立开关，不把世界水平混入 Body 水平。
- Free 快捷重置只有两个权威语义：“赤道默认”重置到 `-Y` 赤道并使 Body 水平面与 XZ 重合，真实地平线俯角留在 Look pitch；“世界基准”保持位置并把 Body/Look 重置为世界 `+X/+Y/+Z` 基。Orbit 不构造这两种 Body 重置。
- Free 摄像机面板可通过显式命令编辑世界位置与相对 Body 的 Look 偏航角/俯仰角；编辑草稿只服务输入过程，不得与低频 telemetry 双向绑定或成为运行时姿态真相。位置合法性和角度边界由 `CameraController` 权威校验，Orbit 必须拒绝 Free 编辑命令。
- 最终 view forward、Body 三轴和 Look 角只作为低频 telemetry 发布到诊断面板；不得把四元数或可变控制器暴露给 Vue，也不得在面板中反解或修正另一份姿态。
- 摄像机预设只保存纯定位数据和确定性位姿计算，不承载验证用例、参考图、参数或 URL 语义。
- FOV 只改变视锥；不得修改摄像机世界姿态、太阳角尺寸、物理辐亮度或散射参数。
- Windows Chromium 的 Pointer Lock 相对移动流曾出现离散的大幅 `movementX/Y`，会直接放大为单帧视角跳变。因此保留单事件长度超过 `64px` 时丢弃并输出 `[CameraInputOutlier]` 的输入边界；没有新测量证据时不增加平滑、插值或阻尼。
- 根因已收敛到异常输入事件后，不再常驻执行逐帧视角跳变探针。需要重新诊断时应基于新的可复现证据临时引入，不把诊断状态变成运行时真相。
- 确定性动作路径使用完整绝对姿态或明确起止姿态；执行期间关闭冲突的人工输入，任何结束路径都恢复输入。路径编排不得重新实现摄像机数学。
- 文件或模块级测试与源码原地同名放置；跨模块和全流程测试放在页面 `test/` 目录。

## Task Board

- [ ] 在允许操作本地页面时复查 Pointer Lock 的正常输入连续性、异常事件过滤，以及 Free/Orbit/预设/路径切换后的姿态连续性。
