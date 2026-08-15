import { useEffect, useRef } from 'react';

/*
 * The drifting colour bloom behind everything.
 *
 * A single WebGL fragment shader, no library. Four soft blobs of peach, lilac,
 * coral and indigo orbiting on independent low-frequency paths, blended additively
 * and pushed through a soft curve so nothing ever reads as a hard edge. This is
 * what keeps the canvas from being flat off-white.
 *
 * Costs: one fullscreen quad, no geometry, no textures. It renders at a throttled
 * 30fps because nothing here moves fast enough to need 60, which roughly halves
 * the GPU cost on laptops.
 *
 * Degrades in three steps: reduced-motion renders exactly one static frame, a
 * missing WebGL context falls back to the CSS gradient underneath, and a
 * backgrounded tab stops rendering entirely.
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;

// Soft radial falloff. pow shapes the shoulder so blobs melt instead of ringing.
float blob(vec2 uv, vec2 c, float r) {
  float d = length(uv - c) / r;
  return pow(max(0.0, 1.0 - d * d), 3.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // Correct for aspect so blobs stay circular on wide screens.
  uv.x *= u_res.x / u_res.y;
  float ax = u_res.x / u_res.y;

  float t = u_time;

  vec3 peach  = vec3(1.000, 0.831, 0.761);
  vec3 lilac  = vec3(0.722, 0.651, 1.000);
  vec3 coral  = vec3(1.000, 0.478, 0.361);
  vec3 indigo = vec3(0.310, 0.275, 0.898);

  // Independent slow orbits. Prime-ish ratios so the loop never visibly repeats.
  vec2 c1 = vec2(ax * (0.28 + 0.10 * sin(t * 0.13)), 0.24 + 0.09 * cos(t * 0.17));
  vec2 c2 = vec2(ax * (0.78 + 0.09 * cos(t * 0.11)), 0.30 + 0.10 * sin(t * 0.19));
  vec2 c3 = vec2(ax * (0.62 + 0.11 * sin(t * 0.09)), 0.82 + 0.07 * cos(t * 0.14));
  vec2 c4 = vec2(ax * (0.18 + 0.08 * cos(t * 0.16)), 0.72 + 0.08 * sin(t * 0.12));

  vec3 col = vec3(0.0);
  col += peach  * blob(uv, c1, 0.62) * 0.95;
  col += lilac  * blob(uv, c2, 0.58) * 0.72;
  col += coral  * blob(uv, c3, 0.46) * 0.34;
  col += indigo * blob(uv, c4, 0.52) * 0.26;

  // Compress toward the canvas colour so the bloom tints rather than paints.
  vec3 canvas = vec3(0.969, 0.965, 0.953);
  float amount = clamp(length(col) * 0.62, 0.0, 1.0);
  vec3 outc = mix(canvas, canvas + col * 0.55, amount);

  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function Bloom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    // No WebGL: the CSS gradient on the wrapper stays visible underneath.
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      // Measure the element, not the window. window.innerWidth can still be 0 while
      // the canvas is already laid out (collapsed pane, hidden tab, early mount),
      // and sizing from it yields a 1x1 buffer that paints one upscaled pixel over
      // the whole screen.
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      // Half resolution. The image is nothing but low-frequency gradients, so the
      // upscale is invisible and it quarters the fragment work.
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return true;

      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      return true;
    };

    const draw = (t: number) => {
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // Hide until the first real frame, so the fallback gradient underneath shows
    // through instead of a flat unpainted canvas.
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 400ms ease-out';

    const reveal = () => {
      canvas.style.opacity = '1';
    };

    /**
     * Paint one frame right now, synchronously. The first frame must not depend on
     * requestAnimationFrame: rAF does not fire in a backgrounded or inactive tab, so
     * a page that mounts there would sit on an unpainted canvas indefinitely. The
     * loop only has to handle motion, not first paint.
     */
    const paintOnce = (t: number) => {
      if (!resize()) return false;
      draw(t);
      reveal();
      return true;
    };

    // The element can be laid out after mount. Observe it rather than guessing.
    const ro = new ResizeObserver(() => paintOnce(0));
    ro.observe(canvas);

    paintOnce(0);

    if (reduced) {
      // One frame, held. Still atmospheric, no motion at all.
      return () => {
        ro.disconnect();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    }

    let raf = 0;
    let last = 0;
    let painted = false;
    const FRAME_MS = 1000 / 30;
    const start = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      if (!resize()) return;
      draw((now - start) / 1000);
      if (!painted) {
        painted = true;
        reveal();
      }
    };
    raf = requestAnimationFrame(loop);

    // A backgrounded tab should cost nothing.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        // Static fallback for no-WebGL. Approximates the shader's resting state.
        background:
          'radial-gradient(60% 50% at 22% 22%, #FFD4C2 0%, transparent 60%),' +
          'radial-gradient(55% 45% at 80% 30%, #B8A6FF 0%, transparent 62%),' +
          'radial-gradient(45% 40% at 62% 84%, #FF7A5C22 0%, transparent 60%),' +
          '#F7F6F3',
      }}
    >
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
