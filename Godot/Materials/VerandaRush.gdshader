shader_type spatial;

uniform sampler2D flax : source_color, repeat_enable, filter_linear_mipmap;
uniform vec4 straw : source_color = vec4(0.75, 0.58, 0.36, 1.0);
varying vec2 mat_position;

void vertex() {
    mat_position = VERTEX.xz;
}
void fragment() {
    float radius = length(mat_position);
    float angle = atan(mat_position.y, mat_position.x);
    float coil = radius * 24.0 - angle / TAU;
    float loops = 0.5 + 0.5 * cos(coil * TAU);
    float braid = sin(angle * 80.0 + 2.7 * sin(coil * TAU));
    float fiber = texture(flax, mat_position * 12.0).r;
    float fade = 1.0 - smoothstep(0.09, 0.44, fwidth(coil));
    ALBEDO = straw.rgb * (0.78 + fiber * 0.32 + fade * (0.20 * loops + 0.10 * braid));
    ROUGHNESS = 0.99;
}
