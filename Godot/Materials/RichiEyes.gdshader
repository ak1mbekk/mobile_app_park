shader_type spatial;
render_mode cull_disabled;

uniform sampler2D coat : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D relief : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D orm : filter_linear_mipmap, repeat_enable;
uniform sampler2D eye_projection : source_color, filter_linear, repeat_disable;
uniform vec2 gaze = vec2(0.0);

void fragment() {
    vec3 fur = texture(coat, UV).rgb;
    vec2 size = vec2(340.0, 120.0);
    vec2 pixel = UV2 * size;
    vec2 centre = vec2(pixel.x < 170.0 ? 61.0 : 281.0, 57.0);
    float radius = length((pixel - centre) / vec2(43.0, 40.0));
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
    ALBEDO = fur;
    NORMAL_MAP = texture(relief, UV).rgb;
    vec3 surface = texture(orm, UV).rgb;
    ROUGHNESS = surface.g;
    METALLIC = surface.b;
}
