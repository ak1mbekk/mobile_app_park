shader_type spatial;
render_mode unshaded, cull_disabled;
void fragment() {
    vec2 uv = UV;
    float rib = sin(uv.x * 290.0) * 0.025;
    vec3 glass = mix(vec3(0.38,0.58,0.55), vec3(0.81,0.85,0.71), uv.y * .55 + .25 + rib);
    for (int i=0; i<5; i++) {
        float n = float(i);
        float t = fract(TIME * (.032+n*.002) + n*.273);
        float x = fract(n*.371+.146) + .002*sin(t*12.0+n);
        vec2 d = (uv-vec2(x,.16+.7*smoothstep(.05,.78,t)))/vec2(.005,.012);
        float drop = 1.-smoothstep(.55,1.,length(d));
        glass += vec3(.22) * drop * (1.-smoothstep(.79,.95,t));
    }
    ALBEDO = glass;
}
