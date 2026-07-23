struct FrameUniforms {
  planet_center_radius: vec4<f32>,
  camera_right_tan_half_fov: vec4<f32>,
  camera_up_aspect: vec4<f32>,
  camera_forward_atmosphere_radius: vec4<f32>,
  sun_direction_angular_radius: vec4<f32>,
  sun_radiance_exposure: vec4<f32>,
  surface_albedo_debug: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct RayInterval {
  near: f32,
  far: f32,
  hit: u32,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );

  let position = positions[vertex_index];

  var output: VertexOutput;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2<f32>(0.5);
  return output;
}

fn intersect_sphere(
  ray_origin: vec3<f32>,
  ray_direction: vec3<f32>,
  sphere_center: vec3<f32>,
  sphere_radius: f32,
) -> RayInterval {
  let offset = ray_origin - sphere_center;
  let half_b = dot(offset, ray_direction);
  let c = dot(offset, offset) - sphere_radius * sphere_radius;
  let discriminant = half_b * half_b - c;

  if (discriminant < 0.0) {
    return RayInterval(0.0, 0.0, 0u);
  }

  let root = sqrt(max(discriminant, 0.0));
  return RayInterval(-half_b - root, -half_b + root, 1u);
}

fn tone_map(linear_radiance: vec3<f32>, exposure: f32) -> vec3<f32> {
  let mapped = vec3<f32>(1.0) - exp(-max(linear_radiance, vec3<f32>(0.0)) * exposure);
  return pow(mapped, vec3<f32>(1.0 / 2.2));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let screen = input.uv * 2.0 - vec2<f32>(1.0);
  let ray_origin = vec3<f32>(0.0);
  let ray_direction = normalize(
    frame.camera_forward_atmosphere_radius.xyz
      + frame.camera_right_tan_half_fov.xyz
        * screen.x
        * frame.camera_up_aspect.w
        * frame.camera_right_tan_half_fov.w
      + frame.camera_up_aspect.xyz
        * screen.y
        * frame.camera_right_tan_half_fov.w
  );

  let planet_center = frame.planet_center_radius.xyz;
  let planet_radius = frame.planet_center_radius.w;
  let atmosphere_radius = frame.camera_forward_atmosphere_radius.w;
  let atmosphere_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    planet_center,
    atmosphere_radius,
  );
  let ground_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    planet_center,
    planet_radius,
  );
  let crosses_atmosphere = atmosphere_hit.hit == 1u && atmosphere_hit.far >= 0.0;
  let hits_ground = ground_hit.hit == 1u && ground_hit.far >= 0.0 && ground_hit.near >= 0.0;
  let sun_visible =
    dot(ray_direction, frame.sun_direction_angular_radius.xyz)
      >= cos(frame.sun_direction_angular_radius.w);

  var radiance = vec3<f32>(0.0);

  if (frame.surface_albedo_debug.w > 0.5) {
    if (hits_ground) {
      radiance = vec3<f32>(0.45, 0.16, 0.035);
    } else if (crosses_atmosphere) {
      radiance = vec3<f32>(0.015, 0.18, 0.28);
    } else {
      radiance = vec3<f32>(0.0025, 0.0025, 0.004);
    }

    if (sun_visible && !hits_ground) {
      radiance = frame.sun_radiance_exposure.xyz;
    }
  } else {
    if (hits_ground) {
      let surface_position = ray_origin + ray_direction * ground_hit.near;
      let surface_normal = normalize(surface_position - planet_center);
      let direct_irradiance = max(
        dot(surface_normal, frame.sun_direction_angular_radius.xyz),
        0.0,
      );
      radiance =
        frame.surface_albedo_debug.xyz
        * frame.sun_radiance_exposure.xyz
        * direct_irradiance;
    } else if (sun_visible) {
      radiance = frame.sun_radiance_exposure.xyz;
    }
  }

  return vec4<f32>(tone_map(radiance, frame.sun_radiance_exposure.w), 1.0);
}
