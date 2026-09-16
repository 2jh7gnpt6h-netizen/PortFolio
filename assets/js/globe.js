// ============================================================
// Globe interactif (projection orthographique, rendu canvas).
// Sert à la fois pour l'intro plein écran et pour la vue "Carte".
// Aucune dépendance réseau : d3-geo / topojson / world-atlas sont
// embarqués dans assets/vendor et assets/data.
// ============================================================
(function (global) {
  "use strict";

  // Correspondance code ISO alpha-2 -> code numérique utilisé par world-atlas.
  var A2_N3 = ("ae784 af004 al008 am051 ao024 aq010 ar032 at040 au036 az031 ba070 bd050 be056 bf854 bg100 bi108 " +
    "bj204 bn096 bo068 br076 bs044 bt064 bw072 by112 bz084 ca124 cd180 cf140 cg178 ch756 ci384 cl152 cm120 cn156 " +
    "co170 cr188 cu192 cy196 cz203 de276 dj262 dk208 do214 dz012 ec218 ee233 eg818 eh732 er232 es724 et231 fi246 " +
    "fj242 fk238 fr250 ga266 gb826 ge268 gh288 gl304 gm270 gn324 gq226 gr300 gt320 gw624 gy328 hn340 hr191 ht332 " +
    "hu348 id360 ie372 il376 in356 iq368 ir364 is352 it380 jm388 jo400 jp392 ke404 kg417 kh116 kp408 kr410 kw414 " +
    "kz398 la418 lb422 lk144 lr430 ls426 lt440 lu442 lv428 ly434 ma504 md498 me499 mg450 mk807 ml466 mm104 mn496 " +
    "mr478 mw454 mx484 my458 mz508 na516 nc540 ne562 ng566 ni558 nl528 no578 np524 nz554 om512 pa591 pe604 pg598 " +
    "ph608 pk586 pl616 pr630 ps275 pt620 py600 qa634 ro642 rs688 ru643 rw646 sa682 sb090 sd729 se752 si705 sk703 " +
    "sl694 sn686 so706 sr740 ss728 sv222 sy760 sz748 td148 tf260 tg768 th764 tj762 tl626 tm795 tn788 tr792 tt780 " +
    "tw158 tz834 ua804 ug800 us840 uy858 uz860 ve862 vn704 vu548 ye887 za710 zm894 zw716").split(" ")
    .reduce(function (acc, pair) { acc[pair.slice(0, 2)] = pair.slice(2); return acc; }, {});

  var WORLD_URL = "assets/data/countries-110m.json";
  var worldPromise = null;

  function loadWorld() {
    if (!worldPromise) {
      worldPromise = fetch(WORLD_URL)
        .then(function (r) {
          if (!r.ok) throw new Error("world-atlas " + r.status);
          return r.json();
        })
        .then(function (topo) {
          var fc = topojson.feature(topo, topo.objects.countries);
          var byId = {};
          fc.features.forEach(function (f) { byId[String(f.id)] = f; });
          return { features: fc.features, byId: byId, sphere: { type: "Sphere" } };
        });
    }
    return worldPromise;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function reducedMotion() {
    return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Interpolation d'angle par le plus court chemin (pour l'animation de visée).
  function shortestDelta(from, to) {
    var d = (to - from) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function create(canvas, options) {
    var opts = options || {};
    var ctx = canvas.getContext("2d");
    var palette = opts.palette || {};
    var highlights = [];        // [{ code, n3, title, slug, feature }]
    var world = null;
    var raf = null;
    var visible = true;
    var destroyed = false;

    var rotation = opts.rotate ? opts.rotate.slice() : [-100, -12, 0];
    var spin = opts.autoRotate === false ? 0 : (opts.spinSpeed || 5.2); // degrés/seconde
    var spinPaused = false;   // pause pendant/après un glisser
    var hoverPause = false;   // pause tant qu'un pays visité est survolé
    var resumeTimer = null;
    var hovered = null;
    var focusAnim = null;
    var lastTime = 0;
    var HALO = 1.18;          // rayon du halo, en multiples du rayon du globe
    var baseRadius = 1;
    var zoom = 1;
    var glide = null;                 // élan après un glisser
    var GLIDE_DAMPING = 2.1;          // amortissement par seconde
    var GLIDE_STOP = 6;               // °/s en deçà desquels on s'arrête

    var projection = d3.geoOrthographic().precision(0.4);
    var path = d3.geoPath(projection, ctx);
    var graticule = d3.geoGraticule10();

    // Taille de mise en page (clientWidth/Height) et non getBoundingClientRect :
    // ce dernier renvoie la boîte *transformée*, donc une valeur fausse tant
    // qu'une animation de scale est en cours — le globe et ses décors seraient
    // alors calculés sur deux repères différents.
    function cssSize() {
      return {
        w: Math.max(1, canvas.clientWidth || 1),
        h: Math.max(1, canvas.clientHeight || 1)
      };
    }

    function resize() {
      var s = cssSize();
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(s.w * dpr);
      canvas.height = Math.round(s.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Le halo déborde jusqu'à 1.18 rayon : on garde cette marge dans le
      // canvas, sinon il est tranché en haut et en bas.
      baseRadius = (Math.min(s.w, s.h) / 2) * (opts.fill || 0.84) / HALO;
      projection.translate([s.w / 2, s.h / 2]).scale(baseRadius * zoom);
      draw();
    }

    function fillPath(geo, style) {
      ctx.beginPath();
      path(geo);
      ctx.fillStyle = style;
      ctx.fill();
    }

    function strokePath(geo, style, width) {
      ctx.beginPath();
      path(geo);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function draw() {
      if (!world || destroyed) return;
      var s = cssSize();
      var cx = s.w / 2, cy = s.h / 2, r = projection.scale();
      projection.rotate(rotation);
      ctx.clearRect(0, 0, s.w, s.h);

      // Halo extérieur (borné au canvas pour ne jamais être tranché)
      var haloR = Math.min(r * HALO, Math.min(s.w, s.h) / 2);
      if (haloR > r) {
        var halo = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, haloR);
        halo.addColorStop(0, palette.halo || "rgba(182,147,90,0.28)");
        halo.addColorStop(1, "rgba(182,147,90,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();
      }

      // Océan : à peine teinté, pour laisser voir au travers. Le flou et la
      // matière « verre » sont fournis par la lentille CSS placée dessous.
      var ocean = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      ocean.addColorStop(0, palette.oceanTop || "rgba(86,142,156,0.30)");
      ocean.addColorStop(1, palette.oceanBottom || "rgba(14,38,48,0.46)");
      fillPath(world.sphere, ocean);

      // Parallèles / méridiens
      strokePath(graticule, palette.graticule || "rgba(240,236,224,0.13)", 0.6);

      // Terres
      ctx.save();
      ctx.beginPath();
      path({ type: "FeatureCollection", features: world.features });
      ctx.fillStyle = palette.land || "rgba(246,241,228,0.52)";
      ctx.fill();
      ctx.strokeStyle = palette.landStroke || "rgba(252,249,241,0.40)";
      ctx.lineWidth = 0.55;
      ctx.stroke();
      ctx.restore();

      // Pays visités
      highlights.forEach(function (h) {
        if (!h.feature) return;
        var isHot = hovered && hovered.code === h.code;
        ctx.save();
        ctx.shadowColor = palette.visitedGlow || "rgba(214,173,104,0.75)";
        ctx.shadowBlur = isHot ? 26 : 14;
        fillPath(h.feature, isHot ? (palette.visitedHot || "#f0d9a8") : (palette.visited || "#c9a063"));
        ctx.restore();
        strokePath(h.feature, isHot ? "rgba(255,247,231,0.95)" : "rgba(247,236,214,0.55)", isHot ? 1.1 : 0.7);
      });

      // Épaisseur du verre : un assombrissement discret cantonné au bord,
      // sans le vernis bombé d'avant.
      var shade = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, palette.limb || "rgba(12,20,24,0.30)");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();

      // Liseré
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = palette.rim || "rgba(255,252,246,0.42)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function tick(now) {
      raf = global.requestAnimationFrame(tick);
      if (!lastTime) lastTime = now;
      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (!visible || !world) return;

      var moved = false;
      if (focusAnim) {
        focusAnim.t = Math.min(1, focusAnim.t + dt / focusAnim.dur);
        // easeInOutCubic : départ doux, arrivée douce — la plongée ne « claque » pas
        var t = focusAnim.t;
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        rotation[0] = focusAnim.from[0] + focusAnim.d0 * e;
        rotation[1] = focusAnim.from[1] + focusAnim.d1 * e;
        if (focusAnim.dz) {
          zoom = focusAnim.z0 + focusAnim.dz * e;
          projection.scale(baseRadius * zoom);
        }
        if (focusAnim.t >= 1) { focusAnim = null; }
        moved = true;
      } else if (glide) {
        // Élan : on prolonge le geste puis on l'amortit exponentiellement.
        rotation[0] = (rotation[0] + glide.vx * dt) % 360;
        rotation[1] = clamp(rotation[1] + glide.vy * dt, -80, 80);
        var damp = Math.exp(-GLIDE_DAMPING * dt);
        glide.vx *= damp;
        glide.vy *= damp;
        if (Math.abs(glide.vx) < GLIDE_STOP && Math.abs(glide.vy) < GLIDE_STOP) {
          glide = null;
          spinPaused = false;      // la rotation de fond reprend la main
        }
        moved = true;
      } else if (spin && !spinPaused && !hoverPause) {
        rotation[0] = (rotation[0] + spin * dt) % 360;
        moved = true;
      }
      if (moved) draw();
    }

    function start() {
      if (raf == null && !destroyed) { lastTime = 0; raf = global.requestAnimationFrame(tick); }
    }
    function stop() {
      if (raf != null) { global.cancelAnimationFrame(raf); raf = null; }
    }

    function localPoint(evt) {
      var rect = canvas.getBoundingClientRect();
      return [evt.clientX - rect.left, evt.clientY - rect.top];
    }

    // Renvoie [lon, lat] si le point tombe sur la sphère visible, sinon null.
    function invertPoint(pt) {
      var s = cssSize();
      var dx = pt[0] - s.w / 2, dy = pt[1] - s.h / 2, r = projection.scale();
      if (dx * dx + dy * dy > r * r) return null;
      return projection.invert(pt);
    }

    function hitTest(pt) {
      var ll = invertPoint(pt);
      if (!ll || isNaN(ll[0])) return null;
      for (var i = 0; i < highlights.length; i++) {
        var h = highlights[i];
        if (h.feature && d3.geoContains(h.feature, ll)) return h;
      }
      return null;
    }

    // ---------- Interactions ----------
    var dragging = false, dragMoved = 0, lastPt = null, pointerId = null;
    var lastMoveT = 0, velX = 0, velY = 0;

    function onPointerDown(evt) {
      if (evt.button != null && evt.button !== 0) return;
      dragging = true;
      dragMoved = 0;
      lastPt = localPoint(evt);
      pointerId = evt.pointerId;
      lastMoveT = (global.performance || Date).now();
      velX = velY = 0;
      spinPaused = true;
      glide = null;
      focusAnim = null;
      if (canvas.setPointerCapture && pointerId != null) {
        try { canvas.setPointerCapture(pointerId); } catch (e) {}
      }
      canvas.classList.add("is-dragging");
    }

    function onPointerMove(evt) {
      var pt = localPoint(evt);
      if (dragging) {
        var k = 80 / projection.scale();
        var dx = pt[0] - lastPt[0], dy = pt[1] - lastPt[1];
        var now = (global.performance || Date).now();
        var ms = Math.max(8, now - lastMoveT);
        dragMoved += Math.abs(dx) + Math.abs(dy);
        rotation[0] = (rotation[0] + dx * k) % 360;
        rotation[1] = clamp(rotation[1] - dy * k, -80, 80);
        // Vitesse lissée, en degrés/seconde : sert d'élan au relâchement.
        var mix = 0.72;
        velX = velX * (1 - mix) + (dx * k / ms * 1000) * mix;
        velY = velY * (1 - mix) + (-dy * k / ms * 1000) * mix;
        lastPt = pt;
        lastMoveT = now;
        draw();
        return;
      }
      var hit = hitTest(pt);
      // Le globe se fige dès qu'un pays est survolé : sans cela la cible
      // s'échappe sous le curseur entre le survol et le clic. L'élan en
      // cours est coupé pour la même raison.
      hoverPause = !!hit;
      if (hit && glide) { glide = null; spinPaused = true; }
      if ((hit && hit.code) !== (hovered && hovered.code)) {
        hovered = hit;
        canvas.style.cursor = hit ? "pointer" : "grab";
        if (opts.onHover) opts.onHover(hit, evt.clientX, evt.clientY);
        draw();
      } else if (hit && opts.onHover) {
        opts.onHover(hit, evt.clientX, evt.clientY);
      }
    }

    function releaseDrag() {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove("is-dragging");
      // Un geste franc lance l'élan ; un geste mou laisse simplement la
      // rotation de fond reprendre après un temps mort.
      var speed = Math.abs(velX) + Math.abs(velY);
      if (speed > GLIDE_STOP && !reducedMotion()) {
        var cap = 900;
        glide = {
          vx: clamp(velX, -cap, cap),
          vy: clamp(velY, -cap, cap)
        };
      }
      if (resumeTimer) global.clearTimeout(resumeTimer);
      resumeTimer = global.setTimeout(function () {
        if (!glide) spinPaused = false;
      }, 2600);
    }

    function onPointerUp(evt) {
      var wasDrag = dragMoved > 6;
      releaseDrag();
      if (!wasDrag) {
        var hit = hitTest(localPoint(evt));
        if (hit && opts.onSelect) opts.onSelect(hit);
      }
    }

    function onPointerLeave() {
      releaseDrag();
      hoverPause = false;
      if (hovered) {
        hovered = null;
        if (opts.onHover) opts.onHover(null);
        draw();
      }
    }

    if (opts.interactive !== false) {
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerLeave);
      canvas.addEventListener("pointerleave", onPointerLeave);
    }

    var onResize = function () { resize(); };
    global.addEventListener("resize", onResize);

    var ro = null;
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(function () { resize(); });
      ro.observe(canvas);
    }

    var onVisibility = function () {
      visible = !document.hidden;
      lastTime = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ---------- API ----------
    function setHighlights(list) {
      highlights = (list || []).map(function (item) {
        var n3 = A2_N3[(item.code || "").toLowerCase()];
        return {
          code: item.code,
          title: item.title,
          slug: item.slug,
          n3: n3,
          feature: world && n3 ? world.byId[n3] : null
        };
      });
      draw();
    }

    // focusCountry(code[, config], done)
    //   config.zoom     : facteur d'agrandissement final (1 = pas de zoom)
    //   config.duration : durée en secondes
    function focusCountry(code, config, done) {
      if (typeof config === "function") { done = config; config = null; }
      config = config || {};
      var h = highlights.filter(function (x) { return x.code === code; })[0];
      if (!h || !h.feature) { if (done) done(); return; }
      var c = d3.geoCentroid(h.feature);
      var target = [-c[0], -c[1]];
      var targetZoom = config.zoom || 1;
      var dur = config.duration || 0.85;

      spinPaused = true;
      glide = null;
      if (reducedMotion()) {
        rotation[0] = target[0]; rotation[1] = target[1];
        zoom = targetZoom;
        projection.scale(baseRadius * zoom);
        draw();
        if (done) done();
        return;
      }
      focusAnim = {
        from: [rotation[0], rotation[1]],
        d0: shortestDelta(rotation[0], target[0]),
        d1: target[1] - rotation[1],
        z0: zoom,
        dz: targetZoom - zoom,
        t: 0,
        dur: dur
      };
      if (done) global.setTimeout(done, dur * 1000);
    }

    function destroy() {
      destroyed = true;
      stop();
      if (ro) ro.disconnect();
      global.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerLeave);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      if (resumeTimer) global.clearTimeout(resumeTimer);
    }

    var api = {
      resize: resize,
      draw: draw,
      setHighlights: setHighlights,
      focusCountry: focusCountry,
      // Suspend le rendu quand le globe n'est plus à l'écran (batterie).
      setActive: function (on) { visible = !!on && !document.hidden; lastTime = 0; },
      destroy: destroy,
      ready: loadWorld().then(function (w) {
        if (destroyed) return api;
        world = w;
        setHighlights(opts.highlights);
        resize();
        start();
        return api;
      })["catch"](function (err) {
        if (opts.onError) opts.onError(err);
        return api;
      })
    };

    return api;
  }

  global.Globe = { create: create, load: loadWorld };
})(window);
