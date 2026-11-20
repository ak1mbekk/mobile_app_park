shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back;

uniform vec3 water_color : source_color = vec3(0.24, 0.40, 0.35);
uniform vec3 sky_color : source_color = vec3(0.69, 0.78, 0.70);

varying vec2 surface_position;

void vertex() {
    surface_position = VERTEX.xz;
}

void fragment() {
    float long_wave = dot(surface_position, vec2(23.0, 9.0)) - TIME * 1.21;
    float cross_wave = dot(surface_position, vec2(-12.0, 35.0)) + TIME * 0.92;
    vec3 slope = vec3(
        0.074 * cos(long_wave) + 0.031 * cos(cross_wave),
        0.0,
        0.034 * cos(long_wave) - 0.061 * cos(cross_wave)
    );
    NORMAL = normalize(NORMAL + mat3(VIEW_MATRIX) * slope);
    float reflectance = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
    float highlight = smoothstep(0.77, 0.96, 0.79 * sin(long_wave) + 0.22 * cos(cross_wave));
    ALBEDO = mix(water_color, sky_color, 0.28 * reflectance + 0.10 * highlight);
    ROUGHNESS = 0.23 + 0.11 * (1.0 - highlight);
    SPECULAR = 0.49;
    ALPHA = 0.64 + 0.16 * reflectance;
}
