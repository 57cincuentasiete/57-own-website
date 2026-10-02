/* ==========================================================================
   Jason Zhu — Nineteen

   Progressive enhancement only. The letter, the wish and every word of the
   message are already in the HTML and already readable without this file.
   What JavaScript adds here:

     1. a canvas confetti burst when a wish is made
     2. a courteous scroll so a freshly opened letter is actually on screen
     3. colorful balloons floating up as the card opens

   If this script never loads, the card still works. If the visitor has asked
   for reduced motion, the balloons and confetti do not animate.
   ========================================================================== */

'use strict';

(function () {
  var TAU = Math.PI * 2;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function reduced() {
    return reduceQuery.matches;
  }

  /* A short, decorative welcome. Removed completely once it has finished. */
  function welcomeBalloons() {
    if (reduced()) return;
    var surface = document.createElement('canvas');
    var brush = surface.getContext('2d');
    if (!brush) return;
    surface.className = 'birthday-balloons';
    surface.setAttribute('aria-hidden', 'true');
    document.body.appendChild(surface);

    var palette = [
      ['#FFC2D5', '#EF578F', '#B62B71'],
      ['#B5F4E7', '#24BDB6', '#087E8F'],
      ['#FFF0AF', '#F5C650', '#C38A26'],
      ['#E6D3FF', '#A879E1', '#7145AD'],
      ['#C8E9FF', '#63B9EE', '#297CB7']
    ];
    var balloons = [];
    var w, h, scale, animation;
    var started = performance.now();
    var finished = false;

    function fit() {
      w = surface.clientWidth;
      h = surface.clientHeight;
      scale = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.round(w * scale);
      surface.height = Math.round(h * scale);
      brush.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function stop() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(animation);
      window.removeEventListener('resize', fit);
      window.removeEventListener('pagehide', stop);
      if (reduceQuery.removeEventListener) reduceQuery.removeEventListener('change', motionChanged);
      else if (reduceQuery.removeListener) reduceQuery.removeListener(motionChanged);
      surface.remove();
    }

    function motionChanged() {
      if (reduced()) stop();
    }

    fit();
    var count = w < 600 ? 8 : 12;
    for (var i = 0; i < count; i++) {
      balloons.push({
        side: i % 2 ? 1 : -1,
        lane: Math.floor(i / 2) % 3,
        delay: Math.floor(i / 2) * 0.12,
        radius: 34 + (i * 13 % 23),
        phase: i * 2.4,
        color: palette[i % palette.length],
        monogram: i === 2 || i === 7
      });
    }

    function draw(now) {
      var elapsed = (now - started) / 1000;
      if (elapsed >= 6 || reduced()) { stop(); return; }
      brush.clearRect(0, 0, w, h);
      // A restrained shower of foil stars frames the greeting.
      for (var s = 0; s < 38; s++) {
        var age = elapsed - (s % 9) * 0.09;
        if (age < 0) continue;
        var side = s % 2 ? 1 : -1;
        var sx = w * (side < 0 ? 0.12 : 0.88) + Math.sin(s * 3.7 + age) * Math.min(w * 0.13, 130);
        var sy = h * (0.25 + (s % 7) * 0.1) - age * (48 + s % 4 * 13);
        var size = 2 + s % 4;
        brush.save();
        brush.translate(sx, sy);
        brush.rotate(age * 0.5 + s);
        brush.globalAlpha = Math.min(1, age * 2, (6 - elapsed) * 2) * (0.35 + Math.sin(age * 3 + s) * 0.2);
        brush.fillStyle = s % 3 ? '#D8AC50' : '#AC85CE';
        brush.beginPath();
        brush.moveTo(0, -size * 2);
        brush.quadraticCurveTo(size * 0.3, -size * 0.3, size * 1.4, 0);
        brush.quadraticCurveTo(size * 0.3, size * 0.3, 0, size * 2);
        brush.quadraticCurveTo(-size * 0.3, size * 0.3, -size * 1.4, 0);
        brush.quadraticCurveTo(-size * 0.3, -size * 0.3, 0, -size * 2);
        brush.fill();
        brush.restore();
      }
      balloons.forEach(function (balloon) {
        var age = Math.max(0, elapsed - balloon.delay);
        var progress = Math.min(1, age / (5.7 - balloon.delay));
        var r = balloon.radius * Math.min(1, w / 700);
        var inset = w * (0.055 + balloon.lane * (w < 600 ? 0.065 : 0.07));
        var x = balloon.side < 0 ? inset : w - inset;
        x += Math.sin(age * 1.3 + balloon.phase) * r * 0.28;
        var y = h * (0.88 + balloon.lane * 0.075) - (h * 1.15 + r * 5) * (progress * 0.78 + progress * progress * 0.22);
        brush.save();
        brush.translate(x, y);
        brush.rotate(Math.sin(elapsed * 1.5 + balloon.phase) * 0.09);
        brush.globalAlpha = Math.min(1, age * 3, (6 - elapsed) / 0.5);

        // Loose, gently waving ribbon beneath each balloon.
        brush.strokeStyle = '#B89464';
        brush.lineWidth = 1;
        brush.beginPath();
        brush.moveTo(0, r * 1.25);
        for (var strand = 1; strand <= 28; strand++) {
          var length = strand / 28;
          brush.lineTo(Math.sin(length * 8 - age * 2 + balloon.phase) * r * 0.22 * length,
            r * (1.25 + length * 3.1));
        }
        brush.stroke();

        var sheen = brush.createRadialGradient(-r * 0.4, -r * 0.55, r * 0.04, r * 0.28, r * 0.25, r * 1.65);
        sheen.addColorStop(0, balloon.color[0]);
        sheen.addColorStop(0.48, balloon.color[1]);
        sheen.addColorStop(1, balloon.color[2]);
        brush.fillStyle = sheen;
        brush.beginPath();
        brush.moveTo(0, r * 1.23);
        brush.bezierCurveTo(-r * 0.5, r * 1.06, -r * 1.05, r * 0.38, -r, -r * 0.2);
        brush.bezierCurveTo(-r * 0.94, -r * 1.55, r * 0.94, -r * 1.55, r, -r * 0.2);
        brush.bezierCurveTo(r * 1.05, r * 0.38, r * 0.5, r * 1.06, 0, r * 1.23);
        brush.fill();
        brush.strokeStyle = 'rgba(255,255,255,0.5)';
        brush.lineWidth = r * 0.075;
        brush.lineCap = 'round';
        brush.beginPath();
        brush.ellipse(-r * 0.18, -r * 0.25, r * 0.57, r * 0.69, -0.3, Math.PI * 1.03, Math.PI * 1.48);
        brush.stroke();
        if (balloon.monogram) {
          brush.fillStyle = 'rgba(255,255,255,0.82)';
          brush.font = 'italic ' + Math.round(r * 0.85) + 'px Georgia, serif';
          brush.textAlign = 'center';
          brush.fillText('19', 0, r * 0.23);
        }
        brush.fillStyle = balloon.color[2];
        brush.beginPath();
        brush.moveTo(0, r * 1.15);
        brush.lineTo(-r * 0.13, r * 1.36);
        brush.lineTo(r * 0.13, r * 1.36);
        brush.closePath();
        brush.fill();
        brush.restore();
      });
      animation = requestAnimationFrame(draw);
    }

    window.addEventListener('resize', fit);
    window.addEventListener('pagehide', stop);
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', motionChanged);
    else if (reduceQuery.addListener) reduceQuery.addListener(motionChanged);
    animation = requestAnimationFrame(draw);
  }

  welcomeBalloons();

  /* ------------------------------------------------------------------ */
  /* Scroll courtesy                                                     */
  /* ------------------------------------------------------------------ */

  function bringIntoView(el) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= 0 && rect.bottom <= vh) return;

    var offset = Math.max(16, vh * 0.1);
    var target = window.pageYOffset + rect.top - offset;

    try {
      window.scrollTo({
        top: Math.max(0, target),
        behavior: reduced() ? 'auto' : 'smooth'
      });
    } catch (err) {
      window.scrollTo(0, Math.max(0, target));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Confetti                                                            */
  /* ------------------------------------------------------------------ */

  var canvas = document.querySelector('[data-confetti]');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

  if (ctx) {
    // All drawn from the card's own palette. Nothing near-black: small dark
    // specks on cream paper read as dirt rather than as confetti.
    var COLORS = [
      '#B79CE0', '#8E6FC4', '#D9C7F0', '#7A4FA8',
      '#F2CE6B', '#E0A93C', '#D98CA8', '#C9708F'
    ];

    var GRAVITY = 1150;   // px / s^2
    var DRAG = 2.1;       // exponential velocity decay, per second
    var MAX_PARTICLES = 420;

    var parts = [];
    var raf = 0;
    var lastTime = 0;
    var width = 0;
    var height = 0;
    var dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Measure the canvas rather than the window. It is fixed at inset 0,
      // so its own box is exactly the surface we are able to paint on.
      width = canvas.clientWidth || document.documentElement.clientWidth;
      height = canvas.clientHeight || document.documentElement.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Assigning width/height resets the context, so re-apply the scale.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pick(list) {
      return list[Math.floor(Math.random() * list.length)];
    }

    function burst(x, y, count, angle, spread, speedMin, speedMax) {
      for (var i = 0; i < count; i++) {
        if (parts.length >= MAX_PARTICLES) return;

        var a = angle + (Math.random() - 0.5) * spread;
        var speed = speedMin + Math.random() * (speedMax - speedMin);
        var size = 5 + Math.random() * 8;

        parts.push({
          x: x,
          y: y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          w: size,
          h: size * (0.42 + Math.random() * 0.3),
          rot: Math.random() * TAU,
          vrot: (Math.random() - 0.5) * 9,
          flip: Math.random() * TAU,
          vflip: (Math.random() - 0.5) * 11,
          wobble: 1.4 + Math.random() * 2.6,
          phase: Math.random() * TAU,
          color: pick(COLORS),
          shape: Math.random() < 0.26 ? 'circle' : 'strip',
          life: 0,
          ttl: 2.1 + Math.random() * 1.5
        });
      }
    }

    function paint(dt, elapsed) {
      var alive = 0;

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.life += dt;
        if (p.life >= p.ttl) continue;

        var damp = Math.exp(-DRAG * dt);
        p.vy += GRAVITY * dt;
        p.vx *= damp;
        p.vy *= damp;

        p.x += (p.vx + Math.sin(elapsed * p.wobble + p.phase) * 26) * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.flip += p.vflip * dt;

        if (p.y > height + 60) continue;

        // Fade in quickly, then fade out over the last stretch of life.
        var fade = 1;
        var remaining = p.ttl - p.life;
        if (p.life < 0.08) fade = p.life / 0.08;
        if (remaining < 0.9) fade = Math.min(fade, remaining / 0.9);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // Squashing the width by cos(flip) reads as a strip tumbling in 3D.
        ctx.scale(Math.cos(p.flip), 1);
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w * 0.34, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
        }

        ctx.restore();

        parts[alive++] = p;
      }

      parts.length = alive;
    }

    function frame(now) {
      if (!lastTime) lastTime = now;
      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);
      paint(dt, now / 1000);

      if (parts.length === 0) {
        ctx.clearRect(0, 0, width, height);
        raf = 0;
        lastTime = 0;
        return;
      }
      raf = window.requestAnimationFrame(frame);
    }

    function celebrate() {
      if (reduced()) return;

      resize();

      var vh = height;
      var vw = width;
      var origin = document.querySelector('[data-wish] > summary');
      var rect = origin ? origin.getBoundingClientRect() : null;
      var cx = rect ? rect.left + rect.width / 2 : vw / 2;
      var cy = rect ? rect.top + rect.height / 2 : vh * 0.6;

      burst(cx, cy, 90, -Math.PI / 2, Math.PI * 1.15, 320, 780);
      burst(-10, vh + 10, 70, -Math.PI / 3.1, Math.PI / 5, 900, 1500);
      burst(vw + 10, vh + 10, 70, -Math.PI + Math.PI / 3.1, Math.PI / 5, 900, 1500);

      if (!raf) {
        lastTime = 0;
        raf = window.requestAnimationFrame(frame);
      }
    }

    window.addEventListener('resize', function () {
      if (raf) resize();
    });

    // If the visitor turns reduced motion on mid-celebration, stop cleanly.
    var onMotionChange = function () {
      if (!reduced()) return;
      parts.length = 0;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
        lastTime = 0;
      }
      ctx.clearRect(0, 0, width, height);
    };

    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener('change', onMotionChange);
    } else if (reduceQuery.addListener) {
      reduceQuery.addListener(onMotionChange);
    }

    resize();

    document.querySelectorAll('[data-wish]').forEach(function (el) {
      el.addEventListener('toggle', function () {
        if (el.open) celebrate();
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Keep a freshly opened letter on screen                              */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll('details[data-letter], details[data-wish]').forEach(function (el) {
    el.addEventListener('toggle', function () {
      if (el.open) bringIntoView(el);
    });
  });
})();
