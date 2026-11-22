shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back;

uniform vec3 water_color : source_color = vec3(0.24, 0.40, 0.35);
uniform vec3 sky_color : source_color = vec3(0.69, 0.78, 0.70);
// Optional small pourable vessel. The room tub keeps its original, static surface.
uniform bool pitcher = false;
uniform float fill_height = 0.244;
uniform float pitcher_tilt = 0.0;

varying vec2 surface_position;
varying float edge;

// Conservative inner profile, measured from the cream inner-glaze rings of wash-pitcher.glb.
float inside_radius(float y) {
    if (y < 0.027 || y > 0.263) return 0.0;
    if (y < 0.06) return mix(0.076, 0.103, (y - 0.027) / 0.033);
    if (y < 0.088) return mix(0.103, 0.106, (y - 0.06) / 0.028);
    if (y < 0.117) return mix(0.106, 0.099, (y - 0.088) / 0.029);
    if (y < 0.193) return mix(0.099, 0.073, (y - 0.117) / 0.076);
    if (y < 0.218) return 0.073;
    return mix(0.073, 0.085, (y - 0.218) / 0.045);
}

void vertex() {
    edge = 0.0;
    if (pitcher) {
        edge = length(VERTEX.xz) / 0.075;
        if (edge > 0.001) {
            vec2 ray = normalize(VERTEX.xz);
            float c = cos(pitcher_tilt);
            float s = sin(pitcher_tilt);
            float lo = 0.0;
            float hi = 0.20;
            // Only the 32 authored perimeter vertices need a horizontal cross-section.
            for (int i = 0; i < 7; i++) {
                float r = (lo + hi) * 0.5;
                vec2 wall = r * ray * vec2(1.0, c);
                float height = fill_height + r * ray.y * s;
                if (length(wall) < inside_radius(height)) lo = r;
                else hi = r;
            }
            VERTEX.xz = ray * lo * edge;
        }
    }
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
    if (pitcher) {
        float meniscus = smoothstep(0.84, 0.98, edge);
        ALBEDO = mix(ALBEDO, sky_color, 0.27 * meniscus + 0.18 * highlight);
    }
    ROUGHNESS = 0.23 + 0.11 * (1.0 - highlight);
    SPECULAR = 0.49;
    ALPHA = 0.64 + 0.16 * reflectance;
}
