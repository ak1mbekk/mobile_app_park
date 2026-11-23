shader_type canvas_item;
render_mode unshaded;

uniform vec4 far_water : source_color = vec4(0.36, 0.56, 0.49, 1.0);
uniform vec4 near_water : source_color = vec4(0.69, 0.82, 0.70, 1.0);
uniform vec4 sunlight : source_color = vec4(0.96, 0.92, 0.73, 1.0);
uniform sampler2D treeline : source_color, filter_linear, repeat_disable;
uniform float flow = 0.0;
uniform float ripple_age = 2.0;
uniform float ripple_x = 0.5;
uniform float water_aspect = 0.4;

void fragment() {
    float x = UV.x;
    float y = UV.y;
    float far_edge = 0.17 + 0.08 * sin(x * 5.4 + 0.7) + 0.12 * x;
    float near_edge = 0.66 + 0.10 * sin(x * 5.7 + 1.45) + 0.035 * sin(x * 11.0 - 0.8) + 0.08 * x;
    float depth = clamp((y - far_edge) / (near_edge - far_edge), 0.0, 1.0);
    float shore = smoothstep(far_edge - 0.007, far_edge + 0.005, y)
                * (1.0 - smoothstep(near_edge - 0.004, near_edge + 0.007, y));
    vec3 color = mix(far_water.rgb, near_water.rgb, depth);
    float ripple_offset = 0.003 * sin(y * 116.0 + flow * 1.4);
    vec4 reflected_trees = texture(treeline, vec2((x + 0.18) / 1.36 + ripple_offset, 1.0 - depth * 1.70));
    float reflection = reflected_trees.a * (1.0 - smoothstep(0.14, 0.67, depth));
    color = mix(color, reflected_trees.rgb * vec3(0.75, 0.87, 0.81), reflection * 0.38);
    float row = floor(y * 35.0);
    float along = sin((18.0 + 5.0 * sin(row)) * x + 8.9 * row + sin(3.2 * row) * 7.0 + flow * 0.65);
    float across = 1.0 - smoothstep(0.04, 0.20, abs(fract(y * 35.0) - 0.5));
    float glint = smoothstep(0.82, 0.96, along) * across;
    float ripple_center = mix(far_edge, near_edge, 0.50);
    float ring_distance = length(vec2(x - ripple_x, (y - ripple_center) * water_aspect * 4.0));
    float ring = 1.0 - smoothstep(0.002, 0.008, abs(ring_distance - ripple_age * 0.12));
    ring *= smoothstep(0.06, 0.23, depth) * (1.0 - smoothstep(0.77, 0.94, depth));
    color = mix(color, sunlight.rgb, glint * 0.25 + ring * 0.44 * (1.0 - smoothstep(0.0, 1.1, ripple_age)));
    color = mix(color, sunlight.rgb, smoothstep(0.965, 0.995, depth) * 0.24);
    COLOR = vec4(color, shore);
}
