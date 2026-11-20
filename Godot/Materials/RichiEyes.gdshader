shader_type spatial;
render_mode cull_disabled;

uniform sampler2D coat : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D tail_rings : hint_default_black, filter_linear_mipmap, repeat_disable;
uniform sampler2D relief : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D orm : filter_linear_mipmap, repeat_enable;
uniform sampler2D eye_projection : source_color, filter_linear, repeat_disable;
uniform vec2 gaze = vec2(0.0);
uniform float eyelids : hint_range(0.0, 1.0) = 0.0;

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
    float full_closure = smoothstep(0.70, 1.0, eyelids);
    vec2 eye = (pixel - centre) / mix(vec2(54.0, 44.0), vec2(62.0, 51.0), full_closure);
    float lid_radius = length(eye);
    if (eyelids > 0.0 && lid_radius < 1.0) {
        float rim = 1.0 - smoothstep(mix(0.80, 0.89, full_closure), 1.0, lid_radius);
        float lid_edge = mix(-1.05, 0.10 + 0.18 * (1.0 - eye.x * eye.x), eyelids);
        vec2 lid_uv = vec2(pixel.x, 7.0 + 3.0 * eye.y) / size;
        vec3 lid_fur = texture(eye_projection, lid_uv).rgb;
        float closure = smoothstep(0.0, 0.11, eyelids);
        float cover = mix(smoothstep(-0.065, 0.04, lid_edge - eye.y), 1.0, full_closure);
        lid_weight = cover * rim * closure;
        float crease = (1.0 - smoothstep(0.025, 0.070, abs(eye.y - lid_edge))) * (1.0 - smoothstep(0.58, 0.89, abs(eye.x)));
        fur = mix(fur, lid_fur, lid_weight);
        fur = mix(fur, lid_fur * 0.22, crease * rim * closure);
    }
    ALBEDO = fur;
    NORMAL_MAP = texture(relief, UV).rgb;
    vec3 surface = texture(orm, UV).rgb;
    NORMAL_MAP_DEPTH = mix(1.0, 0.24, lid_weight);
    ROUGHNESS = mix(surface.g, 0.92, lid_weight);
    METALLIC = surface.b * (1.0 - lid_weight);
    SPECULAR = mix(0.5, 0.09, lid_weight);
}
