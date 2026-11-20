shader_type spatial;
render_mode cull_disabled;

uniform sampler2D flax : source_color, repeat_enable, filter_linear_mipmap;
uniform vec4 dye : source_color = vec4(0.43, 0.60, 0.56, 1.0);
uniform vec4 stitch : source_color = vec4(0.51, 0.23, 0.17, 1.0);
uniform float drawn : hint_range(0.0, 1.0) = 0.0;

void vertex() {
    // The rail and the middle tie stay fixed. Only the loose lower hem lifts.
    float loose = smoothstep(0.50, 0.98, UV.y);
    float gust = smoothstep(0.68, 0.99, sin(TIME * 0.67));
    // Unfasten the waist and spread the same linen across the window rail.
    VERTEX.x = mix(VERTEX.x, mix(-2.10, 0.22, UV.x), drawn);
    float fold = UV.x * 37.70;
    VERTEX.z = mix(VERTEX.z, 0.030 * cos(fold), drawn);
    NORMAL = normalize(mix(NORMAL, normalize(vec3(0.487 * sin(fold), 0.0, 1.0)), drawn));
    VERTEX.z += 0.012 * loose * gust * sin(TIME * 2.2 + UV.x * 3.0);
}
void fragment() {
    float grain = texture(flax, UV * vec2(1.5, 5.5)).r;
    float band = step(UV.x, 0.10) * step(0.018, UV.x);
    vec2 cell = fract(UV * vec2(23.0, 37.0));
    float thread = 1.0 - smoothstep(0.12, 0.24, min(abs(cell.x - cell.y), abs(1.0-cell.x-cell.y)));
    ALBEDO = mix(dye.rgb * (0.64 + grain * 0.68), stitch.rgb, band * thread) * mix(1.0, 0.76, drawn);
    ROUGHNESS = 0.96;
}
