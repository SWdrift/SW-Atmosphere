# Planet Atmosphere Performance Memory

本文件保存 `cp-atmosphere-performance.md` 的可复用实现决策；活跃测量与优化任务仍以 CP 为准。

## 路径与成本边界

- Transmittance 与 Multi-Scattering 是大气内外共享的底层物理 LUT；Sky-View 与 Aerial Perspective 是大气内观察者的视点缓存，不把外部相机位置 clamp 到大气顶后复用。
- Reference 为每个视线样本积分太阳路径；Production 查询 Transmittance，并按统一开关查询 Multi-Scattering。比较时必须统一散射阶数、参数、视线语义与显示链路。
- 性能成本不能只按相机高度判断；画布物理像素、DPR、大气屏幕覆盖率、质量步数、dirty 状态和实际重建 pass 都会改变结果。
- 静态 LUT、动态 LUT、Final 和边界精确积分必须分 pass 观测；初始化尖峰、持续运动与静止帧不能混为同一平均值。

## 大气外 Production

- 外部屏幕射线先与大气顶和地表求交，只积分大气顶入口到出口或地表的实际介质区间；相机到入口的真空段不进入步长。
- 外部路径复用共享 `L/T` 积分核、Transmittance 与 Multi-Scattering，不复制密度、散射、消光或颜色公式。
- 终点组合固定为：地表 `surfaceRadiance × T + L`；穿壳返回深空为 `L`；位于大气路径后的太阳为 `solarRadiance × T + L`；未命中大气的太阳不施加大气透射。
- 第一版逐像素 Production 是后续 Outside View LUT 的数值基准和边界 fallback；Production 模式不得在大气外静默回退 Reference。
- Outside View LUT 若进入后续版本，必须分别表达 RGB `L/T` 和路径分类，只插值同类样本；轮廓重建带或缺少同类样本时回退直接路径。
- 时域方案必须先定义相机运动、FOV/resize、太阳、质量和物理参数变化时的历史失效规则，并保留无历史 fallback。

## 资料

- Hillaire 2020 与 UnrealEngineSkyAtmosphere：Production LUT、多重散射、地空连续与 3D Aerial Perspective。
- Bruneton 2008：辐射传输、预计算散射和高阶散射理论。
- Bruneton 2017：量纲、density profile、纹理坐标往返、数值保护与测试。
