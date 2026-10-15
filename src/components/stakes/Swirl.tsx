// Twenty-One Stakes: the swirling paint background, a tiny WebGL shader drawn at low resolution for chunky pixels
import { useEffect, useRef } from 'react';

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision mediump float;
uniform vec2 res; uniform float time; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x) + time * 0.06 - r * 2.2;
  vec2 p = vec2(cos(a), sin(a)) * r * 3.2;
  for (int i = 0; i < 5; i++) {
    p += vec2(sin(p.y * 1.27 + time * 0.31), cos(p.x * 1.13 - time * 0.23)) * 0.42;
  }
  float v = sin(p.x + p.y) * 0.5 + 0.5;
  float w = sin(p.x * 0.7 - p.y * 1.3 + time * 0.17) * 0.5 + 0.5;
  vec3 col = mix(c1, c2, smoothstep(0.15, 0.85, v));
  col = mix(col, c3, smoothstep(0.6, 0.98, w) * 0.55);
  col *= 1.0 - smoothstep(0.55, 1.25, r) * 0.45;
  col = floor(col * 14.0 + 0.5) / 14.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Paint swirl in three colours; the colours ease toward new ones when the palette changes. */
export function Swirl({ palette, className }: { palette: [string, string, string]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(palette.map(hex));
  target.current = palette.map(hex);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('res'), uTime = u('time'), uc = [u('c1'), u('c2'), u('c3')];
    const cur = target.current.map((c) => [...c]);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = performance.now(), t = 0;
    const size = () => {
      const scale = 5;
      const w = Math.max(32, Math.round(canvas.clientWidth / scale)), h = Math.max(32, Math.round(canvas.clientHeight / scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        t += still ? 0 : dt;
        size();
        for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) cur[i][k] += (target.current[i][k] - cur[i][k]) * Math.min(1, dt * 1.8);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, t + 40);
        uc.forEach((l, i) => gl.uniform3f(l, cur[i][0], cur[i][1], cur[i][2]));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // don't lose the context here: React may mount this twice, and a lost context can't be reused
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={ref} className={`sk-swirl${className ? ` ${className}` : ''}`} aria-hidden="true"
      style={{ background: `radial-gradient(circle at 50% 45%, ${palette[1]}, ${palette[0]} 70%)` }} />
  );
}
