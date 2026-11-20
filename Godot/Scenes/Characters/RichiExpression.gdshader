shader_type spatial;
render_mode cull_disabled;

uniform sampler2D coat : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D tail_rings : hint_default_black, filter_linear_mipmap, repeat_disable;
uniform sampler2D relief : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D orm : filter_linear_mipmap, repeat_enable;
uniform sampler2D eye_projection : source_color, filter_linear, repeat_disable;
uniform vec2 gaze = vec2(0.0);
uniform float eyelids : hint_range(0.0, 1.0) = 0.0;
uniform float expression : hint_range(-1.0, 1.0) = 0.0;
uniform float expression_lid : hint_range(0.0, 1.0) = 0.0;
uniform float wet_eyes : hint_range(0.0, 1.0) = 0.0;
uniform float mouth_open : hint_range(0.0, 1.0) = 0.0;
uniform float belly_motion = 0.0;

void vertex() {
    // Hips and lower spine support the soft belly. Exclude legs, arms and the face.
    vec4 torso = vec4(lessThan(BONE_INDICES, uvec4(4u)));
    float supported = smoothstep(0.35, 0.84, dot(torso, BONE_WEIGHTS));
    vec3 region = (VERTEX - vec3(0.0, 0.58, 0.43)) / vec3(0.42, 0.34, 0.31);
    float mask = 1.0 - smoothstep(0.02, 1.0, length(region));
    VERTEX += NORMAL * belly_motion * mask * supported;
}

void fragment() {
    // Use the full-resolution silhouette to keep pigment out of nearby atlas islands.
    float tail_coverage = smoothstep(0.50, 0.75, textureLod(tail_rings, UV, 0.0).a);
    float ring = texture(tail_rings, UV).r * tail_coverage;
    vec3 fur = texture(coat, UV).rgb * mix(vec3(1.0), vec3(0.32, 0.34, 0.38), ring);
    vec2 size = vec2(340.0, 120.0);
    vec2 pixel = UV2 * size;
    vec2 centre = vec2(pixel.x < 170.0 ? 61.0 : 281.0, 57.0);
    float radius = length((pixel - centre) / vec2(43.0, 40.0));
    float lid_weight = 0.0;
    if (radius < 1.0) {
        // Pin the lid and outer rim. UV2 follows the same skinned vertices as UV0.
        float weight = 1.0 - smoothstep(0.46, 1.0, radius);
        vec2 shift = gaze * vec2(0.85, 0.82) * weight / size;
        vec3 moved = texture(eye_projection, UV2 - shift).rgb;
        // Keep the baked catchlights under the window as the iris slides underneath.
        vec2 p = pixel * 2.0;
        float glint = 0.65 * exp(-dot(p-vec2(110.0,83.0), p-vec2(110.0,83.0))/38.0)
                    + 0.65 * exp(-dot(p-vec2(514.0,83.0), p-vec2(514.0,83.0))/38.0)
                    + 0.56 * exp(-dot(p-vec2(573.0,82.0), p-vec2(573.0,82.0))/38.0);
        float mask = (1.0 - smoothstep(0.74, 1.0, radius)) * smoothstep(0.0, 2.0, length(gaze));
        fur = mix(fur, mix(moved, vec3(0.94, 0.88, 0.75), glint), mask);
    }
    // Cover the painted amber rim as well as the pupil, and give the lid a matte finish.
    float emotional_squint = 0.34 * max(0.0,-expression) + 0.11 * max(0.0,expression);
    float lid_amount = max(eyelids, max(expression_lid, emotional_squint));
    float full_closure = smoothstep(0.70, 1.0, lid_amount);
    vec2 eye = (pixel - centre) / mix(vec2(54.0, 44.0), vec2(62.0, 51.0), full_closure);
    float lid_radius = length(eye);
    if (lid_amount > 0.0 && lid_radius < 1.0) {
        float rim = 1.0 - smoothstep(mix(0.80, 0.89, full_closure), 1.0, lid_radius);
        float inner = eye.x * (pixel.x < 170.0 ? 1.0 : -1.0);
        float lid_edge = mix(-1.05, 0.10 + 0.18 * (1.0 - eye.x * eye.x), lid_amount)
            - 0.38 * max(0.0,-expression) * inner * (1.0 - full_closure);
        vec2 lid_uv = vec2(pixel.x, 7.0 + 3.0 * eye.y) / size;
        vec3 lid_fur = texture(eye_projection, lid_uv).rgb;
        float closure = smoothstep(0.0, 0.11, lid_amount);
        float cover = mix(smoothstep(-0.065, 0.04, lid_edge - eye.y), 1.0, full_closure);
        float cheek_edge = 0.68 - 0.28 * (1.0 - eye.x * eye.x);
        float raised_cheek = smoothstep(-0.04, 0.09, eye.y - cheek_edge) * max(0.0,expression);
        cover = max(cover, raised_cheek);
        lid_weight = cover * rim * closure;
        float crease = (1.0 - smoothstep(0.025, 0.070, abs(eye.y - lid_edge))) * (1.0 - smoothstep(0.58, 0.89, abs(eye.x)));
        fur = mix(fur, lid_fur, lid_weight);
        fur = mix(fur, lid_fur * 0.22, crease * rim * closure);
    }
    if (wet_eyes > 0.0 && radius < 1.0) {
        float outer = pixel.x < 170.0 ? -1.0 : 1.0;
        vec2 tear = (pixel - centre - vec2(12.0 * outer, 22.0)) / vec2(11.0, 15.0);
        float water = (1.0 - smoothstep(0.42, 1.0, length(tear))) * wet_eyes;
        float wet_line = (pixel.y - centre.y - 14.0) / 5.3;
        float edge = 0.62 * exp(-wet_line * wet_line) * (1.0 - smoothstep(0.45, 0.91, radius));
        fur = mix(fur, vec3(0.51, 0.74, 0.87), max(water * 0.86, edge * wet_eyes));
        vec2 reflected = tear - vec2(-0.14, -0.10);
        float tear_glint = exp(-dot(reflected, reflected) * 5.8) * water;
        fur = mix(fur, vec3(0.84, 0.96, 1.0), tear_glint);
    }
    if (mouth_open > 0.0 || abs(expression) > 0.05) {
        // The muzzle island is sampled in texture space so the mouth follows the skinned face.
        vec2 offset = UV - vec2(0.548, 0.780);
        vec2 muzzle = vec2(dot(offset, vec2(0.82, -0.57)), dot(offset, vec2(0.57, 0.82)));
        float corner = clamp(muzzle.x / 0.013, -1.0, 1.0);
        float curve = (expression > 0.0 ? 0.0065 : 0.0041) * expression * corner * corner;
        float smile = (1.0 - smoothstep(0.0011, 0.0033, abs(muzzle.y + curve))) * (1.0 - smoothstep(0.010, 0.016, abs(muzzle.x)));
        fur = mix(fur, vec3(0.11, 0.046, 0.027), smile * abs(expression) * 0.77);
        vec2 opening = muzzle / vec2(mix(0.008, 0.016, mouth_open), mix(0.001, 0.011, mouth_open));
        float opening_mask = (1.0 - smoothstep(0.76, 1.0, length(opening))) * smoothstep(0.04, 0.32, mouth_open);
        float tongue = smoothstep(0.30, 0.80, opening.y) * (1.0 - smoothstep(0.25, 0.72, abs(opening.x)));
        fur = mix(fur, mix(vec3(0.027, 0.012, 0.008), vec3(0.27, 0.09, 0.065), tongue * mouth_open), opening_mask);
    }
    ALBEDO = fur;
    NORMAL_MAP = texture(relief, UV).rgb;
    vec3 surface = texture(orm, UV).rgb;
    NORMAL_MAP_DEPTH = mix(1.0, 0.24, lid_weight);
    ROUGHNESS = mix(surface.g, 0.92, lid_weight);
    METALLIC = surface.b * (1.0 - lid_weight);
    SPECULAR = mix(0.5, 0.09, lid_weight);
}
