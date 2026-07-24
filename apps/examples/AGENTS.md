# AGENTS.md

本文件适用于 `apps/examples`。进入 `src/pages` 后，还必须同时遵循该目录更具体的 `AGENTS.md`。

## 样式与组件

- 样式以 Element Plus 默认和紧凑风格为基准，实用性与功能性优先。
- 样式保持最简，不添加无用或无意义的装饰性样式，以减少 CSS 长度和维护成本。
- 能使用 Element Plus 组件实现的界面元素，不使用原生 HTML 控件；目标是统一交互与视觉。原生元素仅用于 Element Plus 没有对应能力的语义结构或底层能力，例如 `canvas`。

## Command and Verification

以下命令从仓库根目录执行：

- `pnpm check:quick`：默认快速验证命令；当前会执行 `pnpm --filter examples check:quick` 和 `cargo wgsl`，不生成构建产物。
- `pnpm --filter examples check:quick`：执行 `vue-tsc --noEmit -p tsconfig.app.json`，只做 `apps/examples/src` 范围内的 Vue / TypeScript 类型检查。
- `pnpm --filter examples test`：运行 tests。
- `pnpm --filter examples build`：执行 `vue-tsc -b && vite build`，包含类型检查。
- `cargo wgsl`：校验仓库内 `.wgsl` 着色器；语法或静态语义错误会返回非零退出码。
- `pnpm --filter examples dev`：启动开发服务器；仅在用户明确要求时执行。
- `pnpm --filter examples preview`：预览生产产物。

普通组件、样式、文案、局部 TypeScript 逻辑或 WGSL 着色器修改后，优先使用 `pnpm check:quick` 验证。

不要把 `pnpm --filter examples build`、`vite build`、`npm run build` 作为普通修改后的默认验证命令。仅当修改涉及构建配置、依赖、锁文件、路由入口、动态导入、懒加载、静态资源路径、部署 `base`、环境变量，或用户明确要求完整构建验证时，才运行 build。

运行 build 前，必须先说明触发 build 的具体原因。任务完成回复中必须说明实际运行的验证命令；若跳过 build，说明本次修改未涉及构建配置、依赖、路由入口、资源路径或部署行为。

当前没有独立的 `lint` script。
