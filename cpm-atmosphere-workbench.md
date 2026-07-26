# Atmosphere Iteration Workbench Memory

本文件保存 `cp-atmosphere-workbench.md` 的可复用工程记忆；活跃任务和高频约束仍以 CP 为准。

## 状态与用例

- 摄像机预设保存纯定位数据和确定性位姿计算；验证用例在其上定义 Earth clear 基线、场景控制、可选参考图和动作路径，两者不合并。
- 验证目录采用“分类 → 分组 → 用例”层级；`VALIDATION_CASE_CATEGORIES` 是目录、顺序和用例定义的唯一真相，`VALIDATION_CASES` 只从该目录派生以兼容按 ID 查询。
- 每个用例携带明确验证目标和完整可调控制规格。当前覆盖 FOV、太阳、曝光、质量、散射阶数、调试视图与 Rayleigh/Mie/ozone 开关；新增参数先进入权威控制状态，再扩展基线和用例。
- 上位文档中的未实现能力不建立伪用例。气辉、极光、折射、云、动态天气和其他星球组分需要先有运行时权威状态。
- 路由路径表达验证用例选择，`reference=0|1` 与 `mix=0..1` 查询参数表达独立参考图设置；验证用例定义目标状态，Pinia 工作台状态表达执行阶段。按钮、直接 URL、刷新和浏览器历史共同进入路由驱动的入口。
- 参考图显示默认关闭、混合比例默认 `0.5`，不随用例激活、切换或取消而重置；无参考图的用例只是不渲染图片，不修改这两个设置。
- Vue/Pinia 响应式 Proxy 不能直接传给浏览器 `structuredClone`。控制状态使用按权威 schema 显式复制的 `cloneAtmosphereControls`，避免克隆失败和嵌套对象共享。

## 路径与自动化

- 动作路径只包含完整控制状态、绝对相机姿态、定时移动/等待和检查点；执行期间关闭人工相机输入，任何结束路径都恢复输入。
- 球面切线姿态由 `camera/cameraPresets.ts` 统一计算：中心射线到球心的最短距离等于底部半径，screen up 是当地天顶在视平面上的投影。地表观察高度为 `0.0015 km`；最低飞行高度直接消费同一数值。
- 当地太阳高度由观察点 local up 与明确的当地水平参考方向构建，再转换为渲染器消费的世界方位/高度角。用例表不直接编码“90° + 当地高度”的偶然关系。
- 深空预设距地表 `30,000 km` 时，大气顶角直径约 `20.467886°`；行星盘验证使用 `24°` 垂直 FOV 保留完整轮廓和边距。
- limb 高度路径不能对端点 position/forward 做线性插值；应插值高度并逐帧重算球面切线姿态。
- 页面最小自动化面为 `window.atmosphereWorkbench`；路径检查点派发 `atmosphere-workbench-checkpoint`，事件携带含用例、画布、DPR、浏览器、控制和相机状态的只读快照。
- 参考图片通过静态 `new URL(..., import.meta.url)` 消费 `document/public/atmoshpere/` 中由上位文档使用的 WebP 资产并进入 Vite 资产图，保持原始宽高比；加载失败必须显式进入工作台错误信息。

## 验证

- `cargo wgsl` 会递归扫描当前目录，包括依赖中的 WESL 扩展语法文件。项目快速检查应从 `apps/examples/src/pages` 执行 WGSL 校验，只扫描受控页面 shader。
- 前端测试使用 Vitest。文件或单模块测试与源码原地同名放置；跨模块、全流程测试放在页面目录的 `test/`，不再建立 `apps/examples/tests/` 聚合文件。
