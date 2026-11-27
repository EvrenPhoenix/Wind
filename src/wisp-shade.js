// Wisp's clay lighting, off the main thread. The page sends the shapes (circles for the body, a polyline for the curl),
// the size and the colour; this builds each silhouette with exact anti-aliased edges (signed distances), blurs it in
// floating point into a height map, lights it from the upper left the way an SVG feDiffuseLighting would, adds a touch
// of dither so no 8-bit banding shows, and sends the pixels back.
"use strict";
var LX, LY, LZ;
(function () { var az = 255 * Math.PI / 180, el = 50 * Math.PI / 180; LX = Math.cos(az) * Math.cos(el); LY = Math.sin(az) * Math.cos(el); LZ = Math.sin(el); })();
function boxSizes(sigma) { var wl = Math.floor(Math.sqrt(4 * sigma * sigma + 1)); if (wl % 2 === 0) wl--; var m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4)), out = []; for (var i = 0; i < 3; i++) out.push(i < m ? wl : wl + 2); return out; }
function box(src, dst, w, h, r, horiz) {
  var inv = 1 / (2 * r + 1), lines = horiz ? h : w, len = horiz ? w : h, step = horiz ? 1 : w;
  for (var l = 0; l < lines; l++) {
    var o = horiz ? l * w : l, acc = 0, i;
    for (i = 0; i <= r && i < len; i++) acc += src[o + i * step];
    for (i = 0; i < len; i++) { dst[o + i * step] = acc * inv; var add = i + r + 1, sub = i - r; if (add < len) acc += src[o + add * step]; if (sub >= 0) acc -= src[o + sub * step]; }
  }
}
function silhouetteCircles(w, h, vb, circles) {   // coverage of a union of circles, anti-aliased by distance
  var s = w / vb[2], A = new Float32Array(w * h);
  for (var y = 0; y < h; y++) { var v = vb[1] + (y + .5) / s;
    for (var x = 0; x < w; x++) { var u = vb[0] + (x + .5) / s, sd = -1e9;
      for (var k = 0; k < circles.length; k += 3) { var dx = u - circles[k], dy = v - circles[k + 1], d = circles[k + 2] - Math.sqrt(dx * dx + dy * dy); if (d > sd) sd = d; }
      var a = .5 + sd * s; A[y * w + x] = a <= 0 ? 0 : a >= 1 ? 1 : a; } }
  return A;
}
function silhouetteStroke(w, h, vb, pts, half) {   // coverage of a round-capped stroke along a polyline
  var s = w / vb[2], A = new Float32Array(w * h);
  for (var y = 0; y < h; y++) { var v = vb[1] + (y + .5) / s;
    for (var x = 0; x < w; x++) { var u = vb[0] + (x + .5) / s, best = 1e9;
      for (var k = 0; k + 3 < pts.length; k += 2) {
        var ax = pts[k], ay = pts[k + 1], bx = pts[k + 2], by = pts[k + 3], ex = bx - ax, ey = by - ay, t = ((u - ax) * ex + (v - ay) * ey) / (ex * ex + ey * ey || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t; var qx = ax + ex * t - u, qy = ay + ey * t - v, d = qx * qx + qy * qy; if (d < best) best = d; }
      var a = .5 + (half - Math.sqrt(best)) * s; A[y * w + x] = a <= 0 ? 0 : a >= 1 ? 1 : a; } }
  return A;
}
function light(A, w, h, vb, blurU, heightU, fill, depth) {
  var s = w / vb[2], n = w * h, H = new Float32Array(A), T = new Float32Array(n), sizes = boxSizes(blurU * s);
  for (var b = 0; b < 3; b++) { var r = (sizes[b] - 1) >> 1; box(H, T, w, h, r, true); box(T, H, w, h, r, false); }
  var out = new Uint8ClampedArray(n * 4), k = heightU * s * 1.081 * depth, fr = fill[0], fg = fill[1], fb = fill[2];
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var i = y * w + x, a = A[i]; if (!a) continue;
    var nx = -k * ((x + 1 < w ? H[i + 1] : 0) - (x > 0 ? H[i - 1] : 0)), ny = -k * ((y + 1 < h ? H[i + w] : 0) - (y > 0 ? H[i - w] : 0));
    var D = 1.24 * (nx * LX + ny * LY + LZ) / Math.sqrt(nx * nx + ny * ny + 1); if (D < 0) D = 0;
    var dz = Math.random() - .5, j = i * 4, cr = 1.05 * D - .05, cg = 1.03 * D - .03, cb = .99 * D + .01;
    out[j] = fr * (cr < 0 ? 0 : cr > 1 ? 1 : cr) + dz; out[j + 1] = fg * (cg < 0 ? 0 : cg > 1 ? 1 : cg) + dz; out[j + 2] = fb * (cb < 0 ? 0 : cb > 1 ? 1 : cb) + dz; out[j + 3] = a * 255 + .5;
  }
  return out;
}
onmessage = function (e) {
  var m = e.data;
  try {
    var b = m.body, t = m.tuft;
    var bp = light(silhouetteCircles(b.w, b.h, b.vb, b.circles), b.w, b.h, b.vb, b.blur, b.height, m.fill, m.depth);
    var tp = light(silhouetteStroke(t.w, t.h, t.vb, t.pts, t.half), t.w, t.h, t.vb, t.blur, t.height, m.fill, m.depth);
    if (typeof createImageBitmap === "function" && typeof ImageData === "function") {   // ready-made GPU images: the page swaps them in with no copying
      Promise.all([createImageBitmap(new ImageData(bp, b.w, b.h)), createImageBitmap(new ImageData(tp, t.w, t.h))])
        .then(function (bm) { postMessage({ id: m.id, body: bm[0], tuft: bm[1] }, [bm[0], bm[1]]); },
              function () { postMessage({ id: m.id, body: bp, tuft: tp }, [bp.buffer, tp.buffer]); });
    } else postMessage({ id: m.id, body: bp, tuft: tp }, [bp.buffer, tp.buffer]);
  } catch (err) { postMessage({ id: m.id, error: String(err && err.message || err) }); }
};
