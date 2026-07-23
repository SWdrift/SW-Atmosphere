struct AtmosphereUniforms {
  radii_sun: vec4<f32>,
  rayleigh_scattering_scale_height: vec4<f32>,
  mie_scattering_scale_height: vec4<f32>,
  mie_extinction_phase_g: vec4<f32>,
  ozone_absorption_center_height: vec4<f32>,
  ground_albedo_ozone_half_width: vec4<f32>,
  solar_irradiance_w_m2_nm: vec4<f32>,
};

struct FrameUniforms {
  planet_center_exposure: vec4<f32>,
  camera_right_tan_half_fov: vec4<f32>,
  camera_up_aspect: vec4<f32>,
  camera_forward_debug: vec4<f32>,
  sun_direction: vec4<f32>,
  integration: vec4<f32>,
  quality_debug: vec4<f32>,
  components: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> atmosphere: AtmosphereUniforms;

@group(0) @binding(1)
var<uniform> frame: FrameUniforms;

@group(1) @binding(5)
var transmittance_output: texture_storage_2d<rgba16float, write>;

@group(1) @binding(0)
var transmittance_lut: texture_2d<f32>;

@group(1) @binding(1)
var multiple_scattering_lut: texture_2d<f32>;

@group(1) @binding(2)
var sky_view_lut: texture_2d<f32>;

@group(1) @binding(3)
var aerial_radiance_lut: texture_3d<f32>;

@group(1) @binding(9)
var aerial_transmittance_lut: texture_3d<f32>;

@group(1) @binding(6)
var multiple_scattering_output: texture_storage_2d<rgba16float, write>;

@group(1) @binding(7)
var sky_view_output: texture_storage_2d<rgba16float, write>;

@group(1) @binding(8)
var aerial_radiance_output: texture_storage_3d<rgba16float, write>;

@group(1) @binding(10)
var aerial_transmittance_output: texture_storage_3d<rgba16float, write>;

const PI: f32 = 3.141592653589793;
const INV_FOUR_PI: f32 = 1.0 / (4.0 * PI);

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct RayInterval {
  near: f32,
  far: f32,
  hit: u32,
};

struct MediumSample {
  scattering_rayleigh: vec3<f32>,
  scattering_mie: vec3<f32>,
  extinction: vec3<f32>,
};

struct AerialEndpointSample {
  radiance: vec3<f32>,
  transmittance: vec3<f32>,
  weight: f32,
};

struct AerialTransfer {
  radiance: vec3<f32>,
  transmittance: vec3<f32>,
};

struct AerialRayBoundary {
  distance: f32,
  hits_ground: u32,
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

fn camera_ray_direction(uv: vec2<f32>) -> vec3<f32> {
  let screen = uv * 2.0 - vec2<f32>(1.0);
  return normalize(
    frame.camera_forward_debug.xyz
      + frame.camera_right_tan_half_fov.xyz
        * screen.x
        * frame.camera_up_aspect.w
        * frame.camera_right_tan_half_fov.w
      + frame.camera_up_aspect.xyz
        * screen.y
        * frame.camera_right_tan_half_fov.w
  );
}

fn sphere_discriminant(
  ray_origin: vec3<f32>,
  ray_direction: vec3<f32>,
  sphere_center: vec3<f32>,
  sphere_radius: f32,
) -> f32 {
  let offset = ray_origin - sphere_center;
  let half_b = dot(offset, ray_direction);
  return half_b * half_b - (
    dot(offset, offset) - sphere_radius * sphere_radius
  );
}

fn aerial_ray_boundary(
  ray_origin: vec3<f32>,
  ray_direction: vec3<f32>,
) -> AerialRayBoundary {
  let ground_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.x,
  );
  let atmosphere_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.y,
  );
  let hits_ground = ground_hit.hit == 1u && ground_hit.near > 0.001;
  let distance = select(atmosphere_hit.far, ground_hit.near, hits_ground);
  return AerialRayBoundary(max(distance, 0.0), select(0u, 1u, hits_ground));
}

fn aerial_ground_boundary_blend(
  uv: vec2<f32>,
  ground_discriminant: f32,
) -> f32 {
  let dimensions = textureDimensions(aerial_radiance_lut);
  let texel_uv = 1.0 / vec2<f32>(dimensions.xy - vec2<u32>(1u));
  let ray_origin = -frame.planet_center_exposure.xyz;
  let radius = atmosphere.radii_sun.x;
  let left = sphere_discriminant(
    ray_origin,
    camera_ray_direction(clamp(
      uv - vec2<f32>(texel_uv.x, 0.0),
      vec2<f32>(0.0),
      vec2<f32>(1.0),
    )),
    vec3<f32>(0.0),
    radius,
  );
  let right = sphere_discriminant(
    ray_origin,
    camera_ray_direction(clamp(
      uv + vec2<f32>(texel_uv.x, 0.0),
      vec2<f32>(0.0),
      vec2<f32>(1.0),
    )),
    vec3<f32>(0.0),
    radius,
  );
  let bottom = sphere_discriminant(
    ray_origin,
    camera_ray_direction(clamp(
      uv - vec2<f32>(0.0, texel_uv.y),
      vec2<f32>(0.0),
      vec2<f32>(1.0),
    )),
    vec3<f32>(0.0),
    radius,
  );
  let top = sphere_discriminant(
    ray_origin,
    camera_ray_direction(clamp(
      uv + vec2<f32>(0.0, texel_uv.y),
      vec2<f32>(0.0),
      vec2<f32>(1.0),
    )),
    vec3<f32>(0.0),
    radius,
  );
  let axis_discriminant_span = max(
    max(
      abs(left - ground_discriminant),
      abs(right - ground_discriminant),
    ),
    max(
      abs(bottom - ground_discriminant),
      abs(top - ground_discriminant),
    ),
  );
  let diagonal_discriminant_span =
    0.5 * (abs(right - left) + abs(top - bottom));
  let discriminant_span = max(
    axis_discriminant_span,
    diagonal_discriminant_span,
  );
  let safe_span = max(discriminant_span, 1.0e-6);
  return 1.0 - smoothstep(
    safe_span * 1.25,
    safe_span * 2.25,
    abs(ground_discriminant),
  );
}

fn sample_medium(position: vec3<f32>, planet_center: vec3<f32>) -> MediumSample {
  let height = max(length(position - planet_center) - atmosphere.radii_sun.x, 0.0);
  let rayleigh_density =
    exp(-height / atmosphere.rayleigh_scattering_scale_height.w)
      * frame.components.x;
  let mie_density =
    exp(-height / atmosphere.mie_scattering_scale_height.w)
      * frame.components.y;
  let ozone_density = max(
    0.0,
    1.0
      - abs(height - atmosphere.ozone_absorption_center_height.w)
        / atmosphere.ground_albedo_ozone_half_width.w,
  ) * frame.components.z;
  let scattering_rayleigh =
    atmosphere.rayleigh_scattering_scale_height.xyz * rayleigh_density;
  let scattering_mie =
    atmosphere.mie_scattering_scale_height.xyz * mie_density;
  let extinction =
    scattering_rayleigh
      + atmosphere.mie_extinction_phase_g.xyz * mie_density
      + atmosphere.ozone_absorption_center_height.xyz * ozone_density;

  return MediumSample(scattering_rayleigh, scattering_mie, extinction);
}

fn rayleigh_phase(cosine: f32) -> f32 {
  return 3.0 * (1.0 + cosine * cosine) / (16.0 * PI);
}

fn cornette_shanks_phase(cosine: f32, g: f32) -> f32 {
  let g_squared = g * g;
  return 3.0 / (8.0 * PI)
    * (1.0 - g_squared) / (2.0 + g_squared)
    * (1.0 + cosine * cosine)
    / pow(1.0 + g_squared - 2.0 * g * cosine, 1.5);
}

fn integrate_optical_depth(
  ray_origin: vec3<f32>,
  ray_direction: vec3<f32>,
  distance: f32,
  planet_center: vec3<f32>,
  step_count: u32,
) -> vec3<f32> {
  let step_length = distance / f32(step_count);
  var optical_depth = vec3<f32>(0.0);

  for (var step = 0u; step < step_count; step += 1u) {
    let sample_distance = (f32(step) + 0.5) * step_length;
    let medium = sample_medium(
      ray_origin + ray_direction * sample_distance,
      planet_center,
    );
    optical_depth += medium.extinction * step_length;
  }

  return optical_depth;
}

fn transmittance_to_sun(
  position: vec3<f32>,
  sun_direction: vec3<f32>,
  planet_center: vec3<f32>,
  step_count: u32,
) -> vec3<f32> {
  let ground_hit = intersect_sphere(
    position,
    sun_direction,
    planet_center,
    atmosphere.radii_sun.x,
  );

  if (ground_hit.hit == 1u && ground_hit.near >= 0.0) {
    return vec3<f32>(0.0);
  }

  let atmosphere_hit = intersect_sphere(
    position,
    sun_direction,
    planet_center,
    atmosphere.radii_sun.y,
  );
  let optical_depth = integrate_optical_depth(
    position,
    sun_direction,
    max(atmosphere_hit.far, 0.0),
    planet_center,
    step_count,
  );
  return exp(-optical_depth);
}

fn transmittance_parameters_from_uv(uv: vec2<f32>) -> vec2<f32> {
  let bottom_radius = atmosphere.radii_sun.x;
  let top_radius = atmosphere.radii_sun.y;
  let horizon_distance = sqrt(
    top_radius * top_radius - bottom_radius * bottom_radius,
  );
  let distance_to_horizon = horizon_distance * uv.y;
  let radius = sqrt(
    distance_to_horizon * distance_to_horizon
      + bottom_radius * bottom_radius,
  );
  let distance_min = top_radius - radius;
  let distance_max = distance_to_horizon + horizon_distance;
  let distance = distance_min + uv.x * (distance_max - distance_min);
  var cosine = 1.0;

  if (distance > 0.0) {
    cosine = (
      horizon_distance * horizon_distance
        - distance_to_horizon * distance_to_horizon
        - distance * distance
    ) / (2.0 * radius * distance);
  }

  return vec2<f32>(radius, clamp(cosine, -1.0, 1.0));
}

fn unit_range_from_texture_coord(coordinate: f32, size: u32) -> f32 {
  let inverse_size = 1.0 / f32(size);
  return (coordinate - 0.5 * inverse_size) / (1.0 - inverse_size);
}

fn transmittance_uv_from_parameters(radius: f32, cosine: f32) -> vec2<f32> {
  let bottom_radius = atmosphere.radii_sun.x;
  let top_radius = atmosphere.radii_sun.y;
  let horizon_distance = sqrt(
    top_radius * top_radius - bottom_radius * bottom_radius,
  );
  let distance_to_horizon = sqrt(max(
    radius * radius - bottom_radius * bottom_radius,
    0.0,
  ));
  let distance = max(
    -radius * cosine
      + sqrt(max(
        radius * radius * (cosine * cosine - 1.0)
          + top_radius * top_radius,
        0.0,
      )),
    0.0,
  );
  let distance_min = top_radius - radius;
  let distance_max = distance_to_horizon + horizon_distance;
  var u = 0.0;

  if (distance_max > distance_min) {
    u = (distance - distance_min) / (distance_max - distance_min);
  }

  return clamp(
    vec2<f32>(u, distance_to_horizon / horizon_distance),
    vec2<f32>(0.0),
    vec2<f32>(1.0),
  );
}

fn sample_texture_2d_linear(
  lut: texture_2d<f32>,
  uv: vec2<f32>,
) -> vec3<f32> {
  let dimensions = textureDimensions(lut);
  let texel_position =
    clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0))
      * vec2<f32>(dimensions - vec2<u32>(1u));
  let texel_min = vec2<u32>(floor(texel_position));
  let texel_max = min(texel_min + vec2<u32>(1u), dimensions - vec2<u32>(1u));
  let blend = fract(texel_position);
  let texel_min_i32 = vec2<i32>(texel_min);
  let texel_max_i32 = vec2<i32>(texel_max);
  let bottom = mix(
    textureLoad(lut, vec2<i32>(texel_min_i32.x, texel_min_i32.y), 0).rgb,
    textureLoad(lut, vec2<i32>(texel_max_i32.x, texel_min_i32.y), 0).rgb,
    blend.x,
  );
  let top = mix(
    textureLoad(lut, vec2<i32>(texel_min_i32.x, texel_max_i32.y), 0).rgb,
    textureLoad(lut, vec2<i32>(texel_max_i32.x, texel_max_i32.y), 0).rgb,
    blend.x,
  );
  return mix(bottom, top, blend.y);
}

fn sample_texture_3d_linear(
  lut: texture_3d<f32>,
  uvw: vec3<f32>,
) -> vec3<f32> {
  let dimensions = textureDimensions(lut);
  let texel_position =
    clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0))
      * vec3<f32>(dimensions - vec3<u32>(1u));
  let texel_min = vec3<u32>(floor(texel_position));
  let texel_max = min(texel_min + vec3<u32>(1u), dimensions - vec3<u32>(1u));
  let blend = fract(texel_position);
  let texel_min_i32 = vec3<i32>(texel_min);
  let texel_max_i32 = vec3<i32>(texel_max);
  let z0_y0 = mix(
    textureLoad(
      lut,
      vec3<i32>(texel_min_i32.x, texel_min_i32.y, texel_min_i32.z),
      0,
    ).rgb,
    textureLoad(
      lut,
      vec3<i32>(texel_max_i32.x, texel_min_i32.y, texel_min_i32.z),
      0,
    ).rgb,
    blend.x,
  );
  let z0_y1 = mix(
    textureLoad(
      lut,
      vec3<i32>(texel_min_i32.x, texel_max_i32.y, texel_min_i32.z),
      0,
    ).rgb,
    textureLoad(
      lut,
      vec3<i32>(texel_max_i32.x, texel_max_i32.y, texel_min_i32.z),
      0,
    ).rgb,
    blend.x,
  );
  let z1_y0 = mix(
    textureLoad(
      lut,
      vec3<i32>(texel_min_i32.x, texel_min_i32.y, texel_max_i32.z),
      0,
    ).rgb,
    textureLoad(
      lut,
      vec3<i32>(texel_max_i32.x, texel_min_i32.y, texel_max_i32.z),
      0,
    ).rgb,
    blend.x,
  );
  let z1_y1 = mix(
    textureLoad(
      lut,
      vec3<i32>(texel_min_i32.x, texel_max_i32.y, texel_max_i32.z),
      0,
    ).rgb,
    textureLoad(
      lut,
      vec3<i32>(texel_max_i32.x, texel_max_i32.y, texel_max_i32.z),
      0,
    ).rgb,
    blend.x,
  );
  return mix(
    mix(z0_y0, z0_y1, blend.y),
    mix(z1_y0, z1_y1, blend.y),
    blend.z,
  );
}

fn sample_ground_aerial_endpoint(uv: vec2<f32>) -> AerialEndpointSample {
  let dimensions = textureDimensions(aerial_radiance_lut);
  let texel_position =
    clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0))
      * vec2<f32>(dimensions.xy - vec2<u32>(1u));
  let texel_min = vec2<u32>(floor(texel_position));
  let texel_max =
    min(texel_min + vec2<u32>(1u), dimensions.xy - vec2<u32>(1u));
  let blend = fract(texel_position);
  let z = i32(dimensions.z - 1u);
  let coordinate_00 = vec3<i32>(i32(texel_min.x), i32(texel_min.y), z);
  let coordinate_10 = vec3<i32>(i32(texel_max.x), i32(texel_min.y), z);
  let coordinate_01 = vec3<i32>(i32(texel_min.x), i32(texel_max.y), z);
  let coordinate_11 = vec3<i32>(i32(texel_max.x), i32(texel_max.y), z);
  let radiance_00 = textureLoad(aerial_radiance_lut, coordinate_00, 0);
  let radiance_10 = textureLoad(aerial_radiance_lut, coordinate_10, 0);
  let radiance_01 = textureLoad(aerial_radiance_lut, coordinate_01, 0);
  let radiance_11 = textureLoad(aerial_radiance_lut, coordinate_11, 0);
  let weight_00 =
    (1.0 - blend.x) * (1.0 - blend.y)
      * select(0.0, 1.0, radiance_00.a > 0.5);
  let weight_10 =
    blend.x * (1.0 - blend.y)
      * select(0.0, 1.0, radiance_10.a > 0.5);
  let weight_01 =
    (1.0 - blend.x) * blend.y
      * select(0.0, 1.0, radiance_01.a > 0.5);
  let weight_11 =
    blend.x * blend.y
      * select(0.0, 1.0, radiance_11.a > 0.5);
  let weight = weight_00 + weight_10 + weight_01 + weight_11;

  if (weight <= 1.0e-6) {
    return AerialEndpointSample(
      vec3<f32>(0.0),
      vec3<f32>(1.0),
      0.0,
    );
  }

  let radiance =
    (
      radiance_00.rgb * weight_00
        + radiance_10.rgb * weight_10
        + radiance_01.rgb * weight_01
        + radiance_11.rgb * weight_11
    ) / weight;
  let transmittance =
    (
      textureLoad(aerial_transmittance_lut, coordinate_00, 0).rgb * weight_00
        + textureLoad(aerial_transmittance_lut, coordinate_10, 0).rgb * weight_10
        + textureLoad(aerial_transmittance_lut, coordinate_01, 0).rgb * weight_01
        + textureLoad(aerial_transmittance_lut, coordinate_11, 0).rgb * weight_11
    ) / weight;

  return AerialEndpointSample(radiance, transmittance, weight);
}

fn sample_transmittance_to_top(position: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let radius = length(position);
  let cosine = clamp(dot(position, direction) / radius, -1.0, 1.0);
  return sample_texture_2d_linear(
    transmittance_lut,
    transmittance_uv_from_parameters(radius, cosine),
  );
}

fn sample_solar_transmittance(
  position: vec3<f32>,
  sun_direction: vec3<f32>,
) -> vec3<f32> {
  let ground_hit = intersect_sphere(
    position,
    sun_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.x,
  );

  if (ground_hit.hit == 1u && ground_hit.near > 0.001) {
    return vec3<f32>(0.0);
  }

  return sample_transmittance_to_top(position, sun_direction);
}

fn sample_multiple_scattering(
  position: vec3<f32>,
  sun_direction: vec3<f32>,
) -> vec3<f32> {
  let radius = length(position);
  let sun_cosine = clamp(dot(position, sun_direction) / radius, -1.0, 1.0);
  let uv = vec2<f32>(
    sun_cosine * 0.5 + 0.5,
    (radius - atmosphere.radii_sun.x)
      / (atmosphere.radii_sun.y - atmosphere.radii_sun.x),
  );
  return sample_texture_2d_linear(multiple_scattering_lut, uv);
}

@compute @workgroup_size(8, 8)
fn cs_transmittance(@builtin(global_invocation_id) id: vec3<u32>) {
  let dimensions = textureDimensions(transmittance_output);

  if (id.x >= dimensions.x || id.y >= dimensions.y) {
    return;
  }

  let uv = (vec2<f32>(id.xy) + vec2<f32>(0.5)) / vec2<f32>(dimensions);
  let unit_uv = vec2<f32>(
    unit_range_from_texture_coord(uv.x, dimensions.x),
    unit_range_from_texture_coord(uv.y, dimensions.y),
  );
  let radius_cosine = transmittance_parameters_from_uv(unit_uv);
  let ray_origin = vec3<f32>(0.0, 0.0, radius_cosine.x);
  let ray_direction = vec3<f32>(
    sqrt(max(1.0 - radius_cosine.y * radius_cosine.y, 0.0)),
    0.0,
    radius_cosine.y,
  );
  let atmosphere_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.y,
  );
  let optical_depth = integrate_optical_depth(
    ray_origin,
    ray_direction,
    atmosphere_hit.far,
    vec3<f32>(0.0),
    40u,
  );

  textureStore(
    transmittance_output,
    vec2<i32>(id.xy),
    vec4<f32>(exp(-optical_depth), 1.0),
  );
}

@compute @workgroup_size(8, 8)
fn cs_multiple_scattering(@builtin(global_invocation_id) id: vec3<u32>) {
  let dimensions = textureDimensions(multiple_scattering_output);

  if (id.x >= dimensions.x || id.y >= dimensions.y) {
    return;
  }

  let texture_uv =
    (vec2<f32>(id.xy) + vec2<f32>(0.5)) / vec2<f32>(dimensions);
  let uv = vec2<f32>(
    unit_range_from_texture_coord(texture_uv.x, dimensions.x),
    unit_range_from_texture_coord(texture_uv.y, dimensions.y),
  );
  let atmosphere_height = atmosphere.radii_sun.y - atmosphere.radii_sun.x;
  let boundary_offset = min(0.01, atmosphere_height * 0.0001);
  let radius =
    atmosphere.radii_sun.x
      + boundary_offset
      + uv.y * (atmosphere_height - 2.0 * boundary_offset);
  let sun_cosine = uv.x * 2.0 - 1.0;
  let sun_direction = vec3<f32>(
    sqrt(max(1.0 - sun_cosine * sun_cosine, 0.0)),
    0.0,
    sun_cosine,
  );
  let sample_position = vec3<f32>(0.0, 0.0, radius);

  var second_order = vec3<f32>(0.0);
  var transfer = vec3<f32>(0.0);
  let direction_side_count = 8u;
  let ray_step_count = 20u;

  for (var polar_index = 0u; polar_index < direction_side_count; polar_index += 1u) {
    let direction_z =
      1.0 - 2.0 * (f32(polar_index) + 0.5) / f32(direction_side_count);
    let direction_radius = sqrt(max(1.0 - direction_z * direction_z, 0.0));

    for (
      var azimuth_index = 0u;
      azimuth_index < direction_side_count;
      azimuth_index += 1u
    ) {
      let azimuth =
        2.0 * PI * (f32(azimuth_index) + 0.5) / f32(direction_side_count);
      let ray_direction = vec3<f32>(
        direction_radius * cos(azimuth),
        direction_radius * sin(azimuth),
        direction_z,
      );
      let ground_hit = intersect_sphere(
        sample_position,
        ray_direction,
        vec3<f32>(0.0),
        atmosphere.radii_sun.x,
      );
      let atmosphere_hit = intersect_sphere(
        sample_position,
        ray_direction,
        vec3<f32>(0.0),
        atmosphere.radii_sun.y,
      );
      let hits_ground = ground_hit.hit == 1u && ground_hit.near > 0.001;
      var ray_length = atmosphere_hit.far;

      if (hits_ground) {
        ray_length = ground_hit.near;
      }

      let step_length = max(ray_length, 0.0) / f32(ray_step_count);
      var ray_transmittance = vec3<f32>(1.0);
      var ray_radiance = vec3<f32>(0.0);
      var ray_transfer = vec3<f32>(0.0);

      for (var step = 0u; step < ray_step_count; step += 1u) {
        let distance = (f32(step) + 0.5) * step_length;
        let position = sample_position + ray_direction * distance;
        let medium = sample_medium(position, vec3<f32>(0.0));
        let scattering =
          medium.scattering_rayleigh + medium.scattering_mie;
        let step_transmittance = exp(-medium.extinction * step_length);
        let safe_extinction = max(medium.extinction, vec3<f32>(1.0e-6));
        let segment_integral =
          (vec3<f32>(1.0) - step_transmittance) / safe_extinction;
        let scattering_integral =
          ray_transmittance * scattering * segment_integral;
        let solar_transmittance =
          sample_solar_transmittance(position, sun_direction);

        ray_radiance +=
          scattering_integral * solar_transmittance * INV_FOUR_PI;
        ray_transfer += scattering_integral;
        ray_transmittance *= step_transmittance;
      }

      if (hits_ground) {
        let ground_position =
          sample_position + ray_direction * max(ground_hit.near, 0.0);
        let ground_normal = normalize(ground_position);
        let ground_sun_cosine = max(dot(ground_normal, sun_direction), 0.0);
        let ground_solar_transmittance =
          sample_solar_transmittance(
            ground_position + ground_normal * boundary_offset,
            sun_direction,
          );
        ray_radiance +=
          ray_transmittance
            * atmosphere.ground_albedo_ozone_half_width.xyz
            * ground_solar_transmittance
            * ground_sun_cosine
            / PI;
      }

      second_order += ray_radiance;
      transfer += ray_transfer;
    }
  }

  let direction_count =
    f32(direction_side_count * direction_side_count);
  second_order /= direction_count;
  transfer = clamp(
    transfer / direction_count,
    vec3<f32>(0.0),
    vec3<f32>(0.999),
  );
  let multiple_scattering =
    second_order / max(vec3<f32>(1.0) - transfer, vec3<f32>(1.0e-3));

  textureStore(
    multiple_scattering_output,
    vec2<i32>(id.xy),
    vec4<f32>(multiple_scattering, 1.0),
  );
}

fn sky_view_parameters_from_uv(
  uv: vec2<f32>,
  view_radius: f32,
) -> vec2<f32> {
  let horizon_distance = sqrt(max(
    view_radius * view_radius
      - atmosphere.radii_sun.x * atmosphere.radii_sun.x,
    0.0,
  ));
  let horizon_cosine = horizon_distance / view_radius;
  let beta = acos(clamp(horizon_cosine, -1.0, 1.0));
  let zenith_horizon_angle = PI - beta;
  var view_zenith_cosine = 1.0;

  if (uv.y < 0.5) {
    var coordinate = 1.0 - 2.0 * uv.y;
    coordinate *= coordinate;
    coordinate = 1.0 - coordinate;
    view_zenith_cosine = cos(zenith_horizon_angle * coordinate);
  } else {
    var coordinate = uv.y * 2.0 - 1.0;
    coordinate *= coordinate;
    view_zenith_cosine = cos(
      zenith_horizon_angle + beta * coordinate,
    );
  }

  let horizontal_light_view_cosine = 1.0 - 2.0 * uv.x * uv.x;
  return vec2<f32>(view_zenith_cosine, horizontal_light_view_cosine);
}

fn sky_view_uv_from_parameters(
  intersects_ground: bool,
  view_zenith_cosine: f32,
  horizontal_light_view_cosine: f32,
  view_radius: f32,
) -> vec2<f32> {
  let horizon_distance = sqrt(max(
    view_radius * view_radius
      - atmosphere.radii_sun.x * atmosphere.radii_sun.x,
    0.0,
  ));
  let horizon_cosine = horizon_distance / view_radius;
  let beta = acos(clamp(horizon_cosine, -1.0, 1.0));
  let zenith_horizon_angle = PI - beta;
  var v = 0.0;

  if (!intersects_ground) {
    var coordinate =
      1.0 - acos(clamp(view_zenith_cosine, -1.0, 1.0))
        / zenith_horizon_angle;
    coordinate = sqrt(max(coordinate, 0.0));
    v = (1.0 - coordinate) * 0.5;
  } else {
    var coordinate =
      (
        acos(clamp(view_zenith_cosine, -1.0, 1.0))
          - zenith_horizon_angle
      ) / beta;
    coordinate = sqrt(max(coordinate, 0.0));
    v = coordinate * 0.5 + 0.5;
  }

  let u = sqrt(max(
    -horizontal_light_view_cosine * 0.5 + 0.5,
    0.0,
  ));
  return clamp(vec2<f32>(u, v), vec2<f32>(0.0), vec2<f32>(1.0));
}

@compute @workgroup_size(8, 8)
fn cs_sky_view(@builtin(global_invocation_id) id: vec3<u32>) {
  let dimensions = textureDimensions(sky_view_output);

  if (id.x >= dimensions.x || id.y >= dimensions.y) {
    return;
  }

  let texture_uv =
    (vec2<f32>(id.xy) + vec2<f32>(0.5)) / vec2<f32>(dimensions);
  let uv = vec2<f32>(
    unit_range_from_texture_coord(texture_uv.x, dimensions.x),
    unit_range_from_texture_coord(texture_uv.y, dimensions.y),
  );
  let atmosphere_height = atmosphere.radii_sun.y - atmosphere.radii_sun.x;
  let boundary_offset = min(0.01, atmosphere_height * 0.0001);
  let camera_position = -frame.planet_center_exposure.xyz;
  let view_radius = clamp(
    length(camera_position),
    atmosphere.radii_sun.x + boundary_offset,
    atmosphere.radii_sun.y - boundary_offset,
  );
  let local_up = normalize(camera_position);
  let sun_zenith_cosine =
    clamp(dot(local_up, frame.sun_direction.xyz), -1.0, 1.0);
  let sun_direction = vec3<f32>(
    sqrt(max(1.0 - sun_zenith_cosine * sun_zenith_cosine, 0.0)),
    0.0,
    sun_zenith_cosine,
  );
  let parameters = sky_view_parameters_from_uv(uv, view_radius);
  let view_zenith_cosine = parameters.x;
  let horizontal_light_view_cosine = parameters.y;
  let view_zenith_sine =
    sqrt(max(1.0 - view_zenith_cosine * view_zenith_cosine, 0.0));
  let ray_direction = vec3<f32>(
    view_zenith_sine * horizontal_light_view_cosine,
    view_zenith_sine
      * sqrt(max(
        1.0
          - horizontal_light_view_cosine
            * horizontal_light_view_cosine,
        0.0,
      )),
    view_zenith_cosine,
  );
  let ray_origin = vec3<f32>(0.0, 0.0, view_radius);
  let ground_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.x,
  );
  let atmosphere_hit = intersect_sphere(
    ray_origin,
    ray_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.y,
  );
  let hits_ground = ground_hit.hit == 1u && ground_hit.near > 0.001;
  var ray_length = atmosphere_hit.far;

  if (hits_ground) {
    ray_length = ground_hit.near;
  }

  let step_count = u32(frame.quality_debug.x);
  let step_length = max(ray_length, 0.0) / f32(step_count);
  let view_sun_cosine = dot(ray_direction, sun_direction);
  let phase_rayleigh = rayleigh_phase(view_sun_cosine);
  let phase_mie = cornette_shanks_phase(
    view_sun_cosine,
    atmosphere.mie_extinction_phase_g.w,
  );
  var radiance = vec3<f32>(0.0);
  var view_transmittance = vec3<f32>(1.0);

  for (var step = 0u; step < step_count; step += 1u) {
    let distance = (f32(step) + 0.5) * step_length;
    let position = ray_origin + ray_direction * distance;
    let medium = sample_medium(position, vec3<f32>(0.0));
    let step_transmittance = exp(-medium.extinction * step_length);
    let safe_extinction = max(medium.extinction, vec3<f32>(1.0e-6));
    let segment_integral =
      (vec3<f32>(1.0) - step_transmittance) / safe_extinction;
    let solar_transmittance =
      sample_solar_transmittance(position, sun_direction);
    let direct_scattering =
      solar_transmittance
        * (
          medium.scattering_rayleigh * phase_rayleigh
            + medium.scattering_mie * phase_mie
        );
    let multiple_scattering =
      sample_multiple_scattering(position, sun_direction)
        * (medium.scattering_rayleigh + medium.scattering_mie)
        * frame.integration.w;
    let source =
      atmosphere.solar_irradiance_w_m2_nm.xyz
        * (direct_scattering + multiple_scattering);

    radiance += view_transmittance * source * segment_integral;
    view_transmittance *= step_transmittance;
  }

  textureStore(
    sky_view_output,
    vec2<i32>(id.xy),
    vec4<f32>(max(radiance, vec3<f32>(0.0)), 1.0),
  );
}

fn sample_sky_view(
  camera_position: vec3<f32>,
  ray_direction: vec3<f32>,
  sun_direction: vec3<f32>,
) -> vec3<f32> {
  let view_radius = length(camera_position);
  let local_up = camera_position / view_radius;
  let view_zenith_cosine =
    clamp(dot(ray_direction, local_up), -1.0, 1.0);
  let ground_hit = intersect_sphere(
    camera_position,
    ray_direction,
    vec3<f32>(0.0),
    atmosphere.radii_sun.x,
  );
  let intersects_ground = ground_hit.hit == 1u && ground_hit.near > 0.001;
  let view_horizontal =
    ray_direction - local_up * view_zenith_cosine;
  let sun_zenith_cosine =
    clamp(dot(sun_direction, local_up), -1.0, 1.0);
  let sun_horizontal =
    sun_direction - local_up * sun_zenith_cosine;
  let view_horizontal_length = length(view_horizontal);
  let sun_horizontal_length = length(sun_horizontal);
  var horizontal_light_view_cosine = 1.0;

  if (view_horizontal_length > 1.0e-6 && sun_horizontal_length > 1.0e-6) {
    horizontal_light_view_cosine = clamp(
      dot(view_horizontal, sun_horizontal)
        / (view_horizontal_length * sun_horizontal_length),
      -1.0,
      1.0,
    );
  }

  let uv = sky_view_uv_from_parameters(
    intersects_ground,
    view_zenith_cosine,
    horizontal_light_view_cosine,
    view_radius,
  );
  return sample_texture_2d_linear(sky_view_lut, uv);
}

fn integrate_aerial_transfer(
  ray_origin: vec3<f32>,
  ray_direction: vec3<f32>,
  distance: f32,
  step_count: u32,
) -> AerialTransfer {
  let step_length = distance / f32(step_count);
  let view_sun_cosine = dot(ray_direction, frame.sun_direction.xyz);
  let phase_rayleigh = rayleigh_phase(view_sun_cosine);
  let phase_mie = cornette_shanks_phase(
    view_sun_cosine,
    atmosphere.mie_extinction_phase_g.w,
  );
  var radiance = vec3<f32>(0.0);
  var transmittance = vec3<f32>(1.0);

  for (var step = 0u; step < step_count; step += 1u) {
    let sample_distance = (f32(step) + 0.5) * step_length;
    let position = ray_origin + ray_direction * sample_distance;
    let medium = sample_medium(position, vec3<f32>(0.0));
    let step_transmittance = exp(-medium.extinction * step_length);
    let safe_extinction = max(medium.extinction, vec3<f32>(1.0e-6));
    let segment_integral =
      (vec3<f32>(1.0) - step_transmittance) / safe_extinction;
    let solar_transmittance =
      sample_solar_transmittance(position, frame.sun_direction.xyz);
    let direct_scattering =
      solar_transmittance
        * (
          medium.scattering_rayleigh * phase_rayleigh
            + medium.scattering_mie * phase_mie
        );
    let multiple_scattering =
      sample_multiple_scattering(position, frame.sun_direction.xyz)
        * (medium.scattering_rayleigh + medium.scattering_mie)
        * frame.integration.w;
    let source =
      atmosphere.solar_irradiance_w_m2_nm.xyz
        * (direct_scattering + multiple_scattering);

    radiance += transmittance * source * segment_integral;
    transmittance *= step_transmittance;
  }

  return AerialTransfer(
    max(radiance, vec3<f32>(0.0)),
    clamp(transmittance, vec3<f32>(0.0), vec3<f32>(1.0)),
  );
}

fn production_surface_radiance(
  surface_position: vec3<f32>,
) -> vec3<f32> {
  let surface_normal = normalize(surface_position);
  let sun_cosine =
    max(dot(surface_normal, frame.sun_direction.xyz), 0.0);
  return atmosphere.ground_albedo_ozone_half_width.xyz
    * atmosphere.solar_irradiance_w_m2_nm.xyz
    * sample_solar_transmittance(
      surface_position + surface_normal * 0.001,
      frame.sun_direction.xyz,
    )
    * sun_cosine
    / PI;
}

@compute @workgroup_size(4, 4, 4)
fn cs_aerial_perspective(@builtin(global_invocation_id) id: vec3<u32>) {
  let dimensions = textureDimensions(aerial_radiance_output);

  if (
    id.x >= dimensions.x
      || id.y >= dimensions.y
      || id.z >= dimensions.z
  ) {
    return;
  }

  let texture_uvw =
    (vec3<f32>(id) + vec3<f32>(0.5)) / vec3<f32>(dimensions);
  let uvw = vec3<f32>(
    unit_range_from_texture_coord(texture_uvw.x, dimensions.x),
    unit_range_from_texture_coord(texture_uvw.y, dimensions.y),
    unit_range_from_texture_coord(texture_uvw.z, dimensions.z),
  );
  let ray_direction = camera_ray_direction(uvw.xy);
  let ray_origin = -frame.planet_center_exposure.xyz;
  let boundary = aerial_ray_boundary(ray_origin, ray_direction);
  let distance = boundary.distance * uvw.z * uvw.z;
  let step_count = u32(frame.quality_debug.y);
  let transfer =
    integrate_aerial_transfer(ray_origin, ray_direction, distance, step_count);

  textureStore(
    aerial_radiance_output,
    vec3<i32>(id),
    vec4<f32>(
      transfer.radiance,
      f32(boundary.hits_ground),
    ),
  );
  textureStore(
    aerial_transmittance_output,
    vec3<i32>(id),
    vec4<f32>(transfer.transmittance, 1.0),
  );
}

fn tone_map(linear_radiance: vec3<f32>, exposure: f32) -> vec3<f32> {
  let mapped = vec3<f32>(1.0) - exp(-max(linear_radiance, vec3<f32>(0.0)) * exposure);
  return pow(mapped, vec3<f32>(1.0 / 2.2));
}

fn density_debug(height: f32) -> vec3<f32> {
  let rayleigh_density =
    exp(-height / atmosphere.rayleigh_scattering_scale_height.w)
      * frame.components.x;
  let mie_density =
    exp(-height / atmosphere.mie_scattering_scale_height.w)
      * frame.components.y;
  let ozone_density = max(
    0.0,
    1.0
      - abs(height - atmosphere.ozone_absorption_center_height.w)
        / atmosphere.ground_albedo_ozone_half_width.w,
  ) * frame.components.z;
  return vec3<f32>(rayleigh_density, mie_density, ozone_density);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let ray_origin = vec3<f32>(0.0);
  let ray_direction = camera_ray_direction(input.uv);

  let planet_center = frame.planet_center_exposure.xyz;
  let camera_planet_position = -planet_center;
  let planet_radius = atmosphere.radii_sun.x;
  let atmosphere_radius = atmosphere.radii_sun.y;
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
  let ground_discriminant =
    sphere_discriminant(
      ray_origin,
      ray_direction,
      planet_center,
      planet_radius,
    );
  let ground_coverage = select(
    0.0,
    smoothstep(
      0.0,
      max(fwidth(ground_discriminant), 1.0e-6),
      max(ground_discriminant, 0.0),
    ),
    hits_ground,
  );
  let sun_angular_distance = acos(clamp(
    dot(ray_direction, frame.sun_direction.xyz),
    -1.0,
    1.0,
  ));
  let sun_pixel_angular_width = max(
    fwidth(sun_angular_distance),
    1.0e-6,
  );
  let sun_coverage = 1.0 - smoothstep(
    atmosphere.radii_sun.z - 0.5 * sun_pixel_angular_width,
    atmosphere.radii_sun.z + 0.5 * sun_pixel_angular_width,
    sun_angular_distance,
  );
  let sun_solid_angle =
    2.0 * PI * (1.0 - cos(atmosphere.radii_sun.z));
  let solar_radiance =
    atmosphere.solar_irradiance_w_m2_nm.xyz / sun_solid_angle;
  let debug_view = u32(frame.quality_debug.z);

  if (debug_view == 1u) {
    return vec4<f32>(
      pow(
        sample_texture_2d_linear(transmittance_lut, input.uv),
        vec3<f32>(1.0 / 2.2),
      ),
      1.0,
    );
  }

  if (debug_view == 2u) {
    let preview =
      sample_texture_2d_linear(multiple_scattering_lut, input.uv)
        * atmosphere.solar_irradiance_w_m2_nm.xyz;
    return vec4<f32>(
      tone_map(preview, frame.planet_center_exposure.w),
      1.0,
    );
  }

  if (debug_view == 3u) {
    return vec4<f32>(
      tone_map(
        sample_texture_2d_linear(sky_view_lut, input.uv),
        frame.planet_center_exposure.w,
      ),
      1.0,
    );
  }

  if (debug_view == 4u) {
    let aerial_boundary_blend =
      aerial_ground_boundary_blend(input.uv, ground_discriminant);
    var preview = sample_texture_3d_linear(
      aerial_radiance_lut,
      vec3<f32>(input.uv, frame.quality_debug.w),
    );

    if (aerial_boundary_blend > 0.0) {
      let boundary =
        aerial_ray_boundary(camera_planet_position, ray_direction);
      let exact = integrate_aerial_transfer(
        camera_planet_position,
        ray_direction,
        boundary.distance
          * frame.quality_debug.w
          * frame.quality_debug.w,
        u32(frame.quality_debug.y),
      );
      preview = mix(preview, exact.radiance, aerial_boundary_blend);
    }

    return vec4<f32>(
      tone_map(preview, frame.planet_center_exposure.w),
      1.0,
    );
  }

  if (debug_view == 5u) {
    let aerial_boundary_blend =
      aerial_ground_boundary_blend(input.uv, ground_discriminant);
    var preview = sample_texture_3d_linear(
      aerial_transmittance_lut,
      vec3<f32>(input.uv, frame.quality_debug.w),
    );

    if (aerial_boundary_blend > 0.0) {
      let boundary =
        aerial_ray_boundary(camera_planet_position, ray_direction);
      let exact = integrate_aerial_transfer(
        camera_planet_position,
        ray_direction,
        boundary.distance
          * frame.quality_debug.w
          * frame.quality_debug.w,
        u32(frame.quality_debug.y),
      );
      preview = mix(preview, exact.transmittance, aerial_boundary_blend);
    }

    return vec4<f32>(
      pow(preview, vec3<f32>(1.0 / 2.2)),
      1.0,
    );
  }

  if (debug_view == 6u) {
    let height =
      input.uv.y * (atmosphere.radii_sun.y - atmosphere.radii_sun.x);
    return vec4<f32>(
      pow(density_debug(height), vec3<f32>(1.0 / 2.2)),
      1.0,
    );
  }

  var radiance = vec3<f32>(0.0);

  if (frame.camera_forward_debug.w > 0.5) {
    if (hits_ground) {
      radiance = vec3<f32>(0.45, 0.16, 0.035);
    } else if (crosses_atmosphere) {
      radiance = vec3<f32>(0.015, 0.18, 0.28);
    } else {
      radiance = vec3<f32>(0.0025, 0.0025, 0.004);
    }

    if (sun_coverage > 0.0 && !hits_ground) {
      radiance = solar_radiance * sun_coverage;
    }
  } else if (crosses_atmosphere) {
    let segment_start = max(atmosphere_hit.near, 0.0);
    var segment_end = atmosphere_hit.far;

    if (hits_ground) {
      segment_end = min(segment_end, ground_hit.near);
    }

    let camera_inside_atmosphere =
      length(camera_planet_position) < atmosphere_radius;
    let production = frame.integration.z > 0.5;

    if (production && camera_inside_atmosphere) {
      var sky_radiance = sample_sky_view(
        camera_planet_position,
        ray_direction,
        frame.sun_direction.xyz,
      );

      if (sun_coverage > 0.0) {
        sky_radiance +=
          sample_transmittance_to_top(
            camera_planet_position,
            ray_direction,
          ) * solar_radiance * sun_coverage;
      }

      radiance = sky_radiance;

      if (hits_ground) {
        let surface_position =
          camera_planet_position + ray_direction * ground_hit.near;
        let surface_radiance = production_surface_radiance(surface_position);
        let aerial = sample_ground_aerial_endpoint(input.uv);
        var aerial_radiance = aerial.radiance;
        var aerial_transmittance = aerial.transmittance;
        let aerial_boundary_blend =
          aerial_ground_boundary_blend(input.uv, ground_discriminant);

        let missing_ground_sample = aerial.weight <= 1.0e-6;
        let exact_weight = max(
          aerial_boundary_blend,
          select(0.0, 1.0, missing_ground_sample),
        );

        if (exact_weight > 0.0) {
          let exact_aerial = integrate_aerial_transfer(
            camera_planet_position,
            ray_direction,
            ground_hit.near,
            u32(frame.quality_debug.y),
          );
          aerial_radiance = mix(
            aerial_radiance,
            exact_aerial.radiance,
            exact_weight,
          );
          aerial_transmittance = mix(
            aerial_transmittance,
            exact_aerial.transmittance,
            exact_weight,
          );
        }

        let ground_radiance =
          surface_radiance * aerial_transmittance + aerial_radiance;
        radiance = mix(sky_radiance, ground_radiance, ground_coverage);
      }
    } else if (production) {
      let entry_position =
        camera_planet_position + ray_direction * segment_start;
      let transfer = integrate_aerial_transfer(
        entry_position,
        ray_direction,
        max(segment_end - segment_start, 0.0),
        u32(frame.integration.x),
      );
      radiance = transfer.radiance;

      if (hits_ground) {
        let surface_position =
          camera_planet_position + ray_direction * ground_hit.near;
        radiance +=
          production_surface_radiance(surface_position)
            * transfer.transmittance;
      } else if (sun_coverage > 0.0) {
        radiance +=
          transfer.transmittance * solar_radiance * sun_coverage;
      }
    } else {
      let view_step_count = u32(frame.integration.x);
      let light_step_count = u32(frame.integration.y);
      let step_length =
        max(segment_end - segment_start, 0.0) / f32(view_step_count);
      let view_sun_cosine = dot(ray_direction, frame.sun_direction.xyz);
      let phase_rayleigh = rayleigh_phase(view_sun_cosine);
      let phase_mie = cornette_shanks_phase(
        view_sun_cosine,
        atmosphere.mie_extinction_phase_g.w,
      );
      var view_optical_depth = vec3<f32>(0.0);

      for (var step = 0u; step < view_step_count; step += 1u) {
        let sample_distance =
          segment_start + (f32(step) + 0.5) * step_length;
        let sample_position = ray_origin + ray_direction * sample_distance;
        let medium = sample_medium(sample_position, planet_center);
        let view_transmittance =
          exp(-(view_optical_depth + medium.extinction * step_length * 0.5));
        let sun_transmittance = transmittance_to_sun(
          sample_position,
          frame.sun_direction.xyz,
          planet_center,
          light_step_count,
        );
        let scattering =
          medium.scattering_rayleigh * phase_rayleigh
            + medium.scattering_mie * phase_mie;

        radiance +=
          view_transmittance
            * sun_transmittance
            * scattering
            * atmosphere.solar_irradiance_w_m2_nm.xyz
            * step_length;
        view_optical_depth += medium.extinction * step_length;
      }

      let segment_transmittance = exp(-view_optical_depth);

      if (hits_ground) {
        let surface_position = ray_origin + ray_direction * ground_hit.near;
        let surface_normal = normalize(surface_position - planet_center);
        let sun_cosine = max(dot(surface_normal, frame.sun_direction.xyz), 0.0);
        let sun_transmittance = transmittance_to_sun(
          surface_position + surface_normal * 0.001,
          frame.sun_direction.xyz,
          planet_center,
          light_step_count,
        );
        radiance +=
          segment_transmittance
            * atmosphere.ground_albedo_ozone_half_width.xyz
            * atmosphere.solar_irradiance_w_m2_nm.xyz
            * sun_transmittance
            * sun_cosine
            / PI;
      } else if (sun_coverage > 0.0) {
        radiance +=
          segment_transmittance * solar_radiance * sun_coverage;
      }
    }
  } else if (sun_coverage > 0.0) {
    radiance = solar_radiance * sun_coverage;
  }

  return vec4<f32>(tone_map(radiance, frame.planet_center_exposure.w), 1.0);
}
