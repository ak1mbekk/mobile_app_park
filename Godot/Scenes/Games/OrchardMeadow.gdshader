shader_type canvas_item;
render_mode unshaded;

uniform sampler2D pigment : repeat_enable, filter_linear;
uniform vec4 sunlit : source_color = vec4(0.78, 0.77, 0.47, 1.0);
uniform vec4 cool : source_color = vec4(0.37, 0.50, 0.31, 1.0);

void fragment() {
    vec2 uv = UV;
    // Broad patches catch light on the bank. Tighter horizontal variation reads as ground in perspective.
    float patch = texture(pigment, uv * vec2(0.74, 2.45)).r;
    float tuft = texture(pigment, uv * vec2(4.2, 19.0) + vec2(0.23, 0.47)).r;
    float fleck = texture(pigment, uv * vec2(13.0, 38.0)).r;
    float light = smoothstep(0.39, 0.74, patch * 0.68 + tuft * 0.32);
    float shade = 1.0 - smoothstep(0.18, 0.45, patch);
    vec3 meadow = mix(COLOR.rgb, cool.rgb, shade * 0.17);
    meadow = mix(meadow, sunlit.rgb, light * mix(0.22, 0.43, uv.y));
    COLOR.rgb = meadow + (fleck - 0.5) * mix(0.008, 0.036, uv.y);
}
