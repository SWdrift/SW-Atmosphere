# Atmosphere Camera Memory

本文件保存 `cp-atmosphere-camera.md` 的可复用工程记忆；活跃任务和高频约束仍以 CP 为准。

## 坐标与控制

- 世界空间和相机局部空间均采用右手 Z-up 约定。`PlanetCamera` 的单位四元数是最终姿态真相，renderer 只消费世界空间位置和 `right/up/forward`。
- Free 的 `qBody` 定义人的局部 right/forward/up 与局部天顶，`lookYaw/lookPitch` 是相对 Body 的观察角；最终姿态为 `qBody × qYaw × qPitch`。
- Q/E 绕当前最终 forward 旋转整个 Body，鼠标只修改 Look。因此横滚后的局部坐标、屏幕与局部天顶整体一致旋转，最终姿态不反馈为控制角。
- Free 的平移缓动速度保存为局部分量。WASD 使用最终 view right/forward；Space/C 使用 `qBody` 直接派生的 Body up，因此鼠标 Look 不改变升降方向，Q/E 改变 Body 才会改变升降方向。Orbit 单独使用世界 Z-up 方位角、仰角和半径。
- 世界 XYZ 指示器与 Body/Look 姿态仪属于不同参考系，应作为独立模块绘制在视口内的透明 overlay canvas：前者消费最终相机基，后者消费相对 Body 的 yaw/pitch。两者分别受权威调试开关控制。
- 世界轴投影长度必须保留屏幕平面分量，不能把每根轴归一化到固定半径；否则轴接近视线方向时不会正确缩短。
- 赤道默认状态不能把地平线最终姿态整体折叠进 `qBody`：Body 水平面应与赤道切平面 XZ 重合，球面可见地平线俯角由 Look pitch 单独表达。页面初始、恢复默认、地表预设和快捷按钮共同消费这一入口。
- 世界基准快捷重置只修改 Free 的 Body/Look 为 `right=+X、forward=+Y、up=+Z`，不修改当前位置。姿态仪角刻度使用正切投影，标签表示真实 Body 仰角差而非等距像素。
- 摄像机世界位置与相对 Body 的 Look 偏航角/俯仰角可在 Free 模式通过显式命令编辑。Vue 只持有尚未提交的输入草稿；位置合法性和角度边界由 `CameraController` 权威校验，Orbit 拒绝这些命令，低频 telemetry 不参与双向绑定。
- 摄像机诊断读数通过场景低频 telemetry 派生：最终 View 来自 `PlanetCamera`，Body 三轴与 Look 角来自 `CameraController` 的当前 FreeView。诊断面板只读消费；Orbit 对 Body/Look 返回显式空值，不用世界或最终相机基补值。
- 摄像机预设是纯定位数据；验证用例在其上编排场景、参数、可选参考图和动作路径，两者不合并。

## Pointer Lock

- Windows Chromium 的 Pointer Lock 相对移动流可能偶发产生异常大的 `movementX/Y`。该离散输入会按灵敏度直接转换为单帧旋转，因此曾表现为无规律的视角跳变，并容易被误判为四元数或坐标系错误。
- 已定位到输入尖峰后，控制器在输入边界丢弃长度超过 `64px` 的单事件并输出 `[CameraInputOutlier]`。逐帧比较摄像机基和输入预算的跳变探针只服务过定位过程，不再作为常驻运行逻辑。
- 没有新测量证据时，不用平滑、插值或阻尼掩盖输入尖峰。

## 路径接入

- 自动化路径以绝对姿态和明确插值时间驱动摄像机；执行期间禁用人工输入，结束、停止或失败都恢复输入。
- 天空经纬 debug 是不读取摄像机位置的无限远世界方向层，可用于区分姿态问题与场景位置问题，但不是大气天空盒。
