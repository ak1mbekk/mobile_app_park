shader_type spatial;
render_mode cull_back;

uniform sampler2D old_oak : source_color, repeat_enable, filter_linear_mipmap;
uniform vec4 paint : source_color = vec4(0.56, 0.63, 0.49, 1.0);
uniform vec4 worn_edge : source_color = vec4(0.69, 0.53, 0.33, 1.0);

void fragment() {
    vec3 wood = texture(old_oak, UV * vec2(0.6, 1.8)).rgb;
    float grain = dot(wood, vec3(0.30, 0.59, 0.11));
    float edge = min(min(UV.x, 1.0 - UV.x), min(UV.y, 1.0 - UV.y));
    float wear = (1.0 - smoothstep(0.0, 0.045, edge)) * smoothstep(0.15, 0.42, grain);
    ALBEDO = mix(paint.rgb * (0.74 + 0.62 * grain), worn_edge.rgb, wear * 0.72);
    ROUGHNESS = 0.85;
}
