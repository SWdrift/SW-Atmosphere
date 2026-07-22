struct FrameUniforms {
  data: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  // 三个顶点覆盖整个画布，避免额外顶点缓冲。
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );

  let position = positions[vertex_index];

  var output: VertexOutput;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2<f32>(0.5);
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // 从 uniform 中提取时间与分辨率。
  let time = frame.data.x;
  let resolution = frame.data.yz;
  let safe_height = max(resolution.y, 1.0);
  let aspect = resolution.x / safe_height;

  // 将 UV 映射到带长宽比矫正的屏幕坐标。
  let p = (input.uv * 2.0 - vec2<f32>(1.0)) * vec2<f32>(aspect, 1.0);

  // 距中心的距离，用于构造波动效果。
  let distance_from_center = length(p);

  // 动态波纹：随时间波动，并随距离变化。
  let wave = 0.5 + 0.5 * sin(time * 2.0 - distance_from_center * 8.0);

  let glow = exp(-3.0 * dot(p, p));
  let base = vec3<f32>(0.025, 0.07, 0.16);
  let light = vec3<f32>(0.12, 0.62, 1.0) * (0.25 * wave + glow);

  return vec4<f32>(base + light, 1.0);
}
