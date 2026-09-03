/*
 * Clouds, generated rather than photographed.
 *
 * ── Why not a photo ──────────────────────────────────────────────────────────
 *
 * A stock sky would be one more image to license, host, and wait for, and it
 * would have a fixed resolution on a page that has to be sharp on a 6K display.
 * The bigger problem is that a photograph of a sky has its own light in it —
 * its own sun position, its own colour temperature — and it has to sit under a
 * gradient that already has both. They fight.
 *
 * ── What this is instead ─────────────────────────────────────────────────────
 *
 * Fractal noise, thresholded into shape. `feTurbulence` with several octaves
 * produces the same self-similar structure that makes a real cloud edge look
 * like a cloud edge at every scale, which is exactly what a blurred blob does
 * not have — that was the previous attempt and it read as smoke.
 *
 * The pipeline is four steps, and each one matters:
 *
 *   turbulence      self-similar noise, wider than it is tall so the clouds
 *                   stretch horizontally the way wind-sheared cloud does
 *   colour matrix   throw away the noise's colour, keep its luminance, and use
 *                   it as alpha against a fixed white. The negative constant is
 *                   the threshold: it decides how much of the field is sky
 *                   rather than cloud, and it is the single value that controls
 *                   whether this looks overcast or scattered
 *   gamma on alpha  bends the edge falloff. Without it the noise fades out
 *                   linearly and every cloud has a grey halo
 *   blur            takes the last of the pixel grain off
 *
 * ── Why the edges fade ───────────────────────────────────────────────────────
 *
 * The tile repeats horizontally forever. Turbulence is not tileable, so its
 * left and right edges would not meet and there would be a hard vertical seam
 * marching across the sky. The mask fades both edges to nothing, so tiles meet
 * in empty sky and the gap reads as the space between one cloud bank and the
 * next, which is what a real sky looks like anyway.
 */

interface CloudLayer {
  /** Lower is bigger, more distant-looking cloud structure. */
  frequency: string;
  /** How much of the field is cloud. More negative is more sky. */
  threshold: number;
  /** Different seeds so the three bands are not the same cloud three times. */
  seed: number;
  blur: number;
  height: number;
}

function texture({ frequency, threshold, seed, blur, height }: CloudLayer) {
  const w = 1400;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${height}' viewBox='0 0 ${w} ${height}'>
<defs>
<filter id='c' x='0' y='0' width='100%' height='100%'>
<feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='5' seed='${seed}' result='n'/>
<feColorMatrix in='n' type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.42 0.42 0.42 0 ${threshold}' result='t'/>
<feComponentTransfer in='t' result='g'><feFuncA type='gamma' amplitude='1' exponent='1.7' offset='0'/></feComponentTransfer>
<feGaussianBlur in='g' stdDeviation='${blur}'/>
</filter>
<linearGradient id='f' x1='0' x2='1' y1='0' y2='0'>
<stop offset='0' stop-color='#000'/><stop offset='0.12' stop-color='#fff'/>
<stop offset='0.88' stop-color='#fff'/><stop offset='1' stop-color='#000'/>
</linearGradient>
<mask id='m'><rect width='${w}' height='${height}' fill='url(#f)'/></mask>
</defs>
<rect width='${w}' height='${height}' filter='url(#c)' mask='url(#m)'/>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/*
 * Three bands, and the differences between them are doing the perspective.
 *
 * Near cloud is large, soft and sparse. Far cloud is small, tighter and more
 * broken up, because distance compresses structure — the same reason a distant
 * hillside of trees reads as texture and a near one reads as trees. Paired with
 * the three drift speeds in global.css, that is enough depth cueing without any
 * of it actually being in perspective.
 */
export const CLOUD_NEAR = texture({
  frequency: "0.0016 0.009",
  threshold: -0.22,
  seed: 17,
  blur: 5,
  height: 300,
});

export const CLOUD_MID = texture({
  frequency: "0.0026 0.013",
  threshold: -0.3,
  seed: 41,
  blur: 4,
  height: 260,
});

export const CLOUD_FAR = texture({
  frequency: "0.0042 0.02",
  threshold: -0.38,
  seed: 73,
  blur: 3,
  height: 220,
});
