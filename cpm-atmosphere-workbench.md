# Atmosphere Iteration Workbench Memory

本文件保存 `cp-atmosphere-workbench.md` 的可复用工程记忆；活跃任务和高频约束仍以 CP 为准。

## 状态与用例

- 摄像机预设保存纯定位数据和确定性位姿计算；验证用例在其上定义 Earth clear 基线、场景控制、参考图和动作路径，两者不合并。
- 路由只表达验证用例选择，验证用例定义目标状态，Pinia 工作台状态表达执行阶段。按钮、直接 URL、刷新和浏览器历史共同进入路由驱动的激活入口。
- Vue/Pinia 响应式 Proxy 不能直接传给浏览器 `structuredClone`。控制状态使用按权威 schema 显式复制的 `cloneAtmosphereControls`，避免克隆失败和嵌套对象共享。

## 路径与自动化

- 动作路径只包含完整控制状态、绝对相机姿态、定时移动/等待和检查点；执行期间关闭人工相机输入，任何结束路径都恢复输入。
- 页面最小自动化面为 `window.atmosphereWorkbench`；路径检查点派发 `atmosphere-workbench-checkpoint`，事件携带含用例、画布、DPR、浏览器、控制和相机状态的只读快照。
- 参考图片通过静态 `new URL(..., import.meta.url)` 进入 Vite 资产图，保持原始宽高比；加载失败必须显式进入工作台错误信息。

## 验证

- `cargo wgsl` 会递归扫描当前目录，包括依赖中的 WESL 扩展语法文件。项目快速检查应从 `apps/examples/src/pages` 执行 WGSL 校验，只扫描受控页面 shader。
- 前端测试使用 Vitest。文件或单模块测试与源码原地同名放置；跨模块、全流程测试放在页面目录的 `test/`，不再建立 `apps/examples/tests/` 聚合文件。
