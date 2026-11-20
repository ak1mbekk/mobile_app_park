shader_type spatial;
render_mode unshaded, cull_back, shadows_disabled;

varying float density;

void vertex() {
    density = INSTANCE_CUSTOM.r;
}

void fragment() {
    vec3 normal = normalize(NORMAL);
    float rim = pow(1.0 - clamp(dot(normal, normalize(VIEW)), 0.0, 1.0), 1.4);
    // The bathroom window catches the upper-left side of each film.
    float gloss = smoothstep(0.90, 0.985, dot(normal, normalize(vec3(-0.46, 0.60, 0.66))));
    vec3 edge = mix(vec3(0.70, 0.88, 0.90), vec3(0.96, 0.86, 0.78), normal.y * 0.5 + 0.5);
    ALBEDO = mix(mix(vec3(0.79, 0.89, 0.88), edge, rim), vec3(1.0), gloss);
    ALPHA = clamp(0.12 + density * 0.38 + rim * 0.52 + gloss * 0.62, 0.0, 0.93);
}
