(function () {
  "use strict";

  var root = document.getElementById("root");
  var nav = document.getElementById("mainNav");
  var topBar = document.getElementById("topBar");

  function esc(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function findCarnet(slug) {
    return CARNETS.find(function (c) { return c.slug === slug; });
  }
  function findExpo(slug) {
    return EXPOSITIONS.find(function (e) { return e.slug === slug; });
  }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function ratio(p) {
    return (p && p.w && p.h) ? (p.w / p.h) : 1.5;
  }
  function isPortrait(p) {
    return ratio(p) < 1;
  }

  // Galerie active : alimente la lightbox et sa navigation.
  var gallery = [];

  // ---------- Fragments partagés ----------
  function carnetRowHTML(item, navTarget) {
    return (
      '<div class="carnet-row reveal" data-nav="' + navTarget + '" tabindex="0" role="link" aria-label="Ouvrir ' + esc(item.title) + '">' +
        '<div class="carnet-thumb"><img src="' + item.thumb + '" alt="" loading="lazy" decoding="async"></div>' +
        "<div class=\"carnet-body\">" +
          '<div class="carnet-title serif">' + esc(item.title) + "</div>" +
          '<div class="carnet-meta">' + esc(item.place) + (item.photos ? " · " + item.photos.length + " photographies" : "") + "</div>" +
        "</div>" +
        '<div class="carnet-tags">' + ((item.tags || []).map(function (t) { return '<span class="carnet-tag glass">' + esc(t) + "</span>"; }).join("")) + "</div>" +
        '<span class="carnet-go" aria-hidden="true">↗</span>' +
      "</div>"
    );
  }

  function emptyRowHTML(label) {
    return (
      '<div class="carnet-row is-empty reveal">' +
        '<div class="carnet-thumb is-placeholder">à venir</div>' +
        '<div class="carnet-body">' +
          '<div class="carnet-title serif">' + esc(label) + "</div>" +
          '<div class="carnet-meta">En préparation</div>' +
        "</div>" +
        '<div class="carnet-tags"></div><span></span>' +
      "</div>"
    );
  }

  // ---------- Moteur de mise en page ----------
  // Deux photos voisines de même orientation forment un duo : elles partagent
  // exactement la même boîte, donc la même taille à l'écran. Sinon la photo
  // est présentée seule, toujours bornée en hauteur (jamais plein écran).
  function layoutBlocks(photos) {
    var blocks = [], i = 0;
    while (i < photos.length) {
      var a = photos[i], b = photos[i + 1];
      var opening = blocks.length === 0;
      if (!opening && b && isPortrait(a) === isPortrait(b)) {
        blocks.push({ kind: "duo", items: [a, b], from: i });
        i += 2;
      } else {
        blocks.push({ kind: "solo", items: [a], from: i });
        i += 1;
      }
    }
    return blocks;
  }

  function frameHTML(p, index) {
    var ar = ratio(p);
    return (
      '<figure class="frame" style="--ar:' + ar.toFixed(4) + '" data-i="' + index + '">' +
        '<img src="' + p.file + '" alt="' + esc(p.alt) + '"' +
          (p.w ? ' width="' + p.w + '" height="' + p.h + '"' : "") +
          ' loading="lazy" decoding="async">' +
        (p.cap ? '<figcaption class="cap glass">' + esc(p.cap) + "</figcaption>" : "") +
      "</figure>"
    );
  }

  function photosEssayHTML(photos, notes, offset) {
    notes = notes || [];
    offset = offset || 0;
    var blocks = layoutBlocks(photos);
    return blocks.map(function (b, gi) {
      var ar = ratio(b.items[0]).toFixed(4);
      var cls = b.kind === "duo" ? "plate duo reveal" : "plate solo reveal " + (isPortrait(b.items[0]) ? "is-portrait" : "is-landscape");
      var inner = b.items.map(function (p, k) { return frameHTML(p, offset + b.from + k); }).join("");
      var html = '<div class="' + cls + '" style="--ar:' + ar + '">' + inner + "</div>";
      var note = notes.find(function (n) { return n.afterGroup === gi; });
      if (note) {
        html += '<div class="essay-note reveal' + (note.align === "right" ? " align-right" : "") + '"><p>' + esc(note.text) + "</p></div>";
      }
      return html;
    }).join("");
  }

  // ---------- Vues ----------
  function renderHome() {
    var featured = CARNETS[CARNETS.length - 1];
    var heroImg = featured ? featured.hero : "";
    var heroAlt = featured ? featured.heroAlt : "";
    var rows = CARNETS.map(function (c) { return carnetRowHTML(c, "carnet/" + c.slug); }).join("");

    root.innerHTML =
      '<div class="hero"><img src="' + heroImg + '" alt="' + esc(heroAlt) + '" fetchpriority="high" decoding="async">' +
        '<div class="hero-caption">' +
          '<span class="loc glass">' + esc(featured ? featured.title + " · " + featured.place : "") + "</span>" +
          '<span class="scroll-cue" aria-hidden="true">défiler</span>' +
        "</div>" +
      "</div>" +
      '<div class="intro-block"><div class="intro-grid">' +
        '<h2 class="serif reveal">Des lieux traversés, gardés en images.</h2>' +
        '<p class="lede reveal">Consultant dans la vie active, photographe le reste du temps. Ce site rassemble mes carnets de voyage — un lieu, une lumière, quelques images qui restent une fois le sac reposé.</p>' +
      "</div></div>" +
      '<div class="section-head"><h2 class="serif">Carnets</h2><span class="count">' + CARNETS.length + " publié" + (CARNETS.length > 1 ? "s" : "") + "</span></div>" +
      '<div class="carnets">' + rows + emptyRowHTML("Prochain carnet") + "</div>" +
      footerHTML();
    gallery = [];
  }

  function renderCarnet(slug) {
    var c = findCarnet(slug);
    if (!c) { location.hash = "#home"; return; }
    gallery = c.photos.slice();
    root.innerHTML =
      '<article class="essay">' +
        '<div class="essay-head">' +
          '<a href="#home" class="essay-back" data-nav="home">← Carnets</a>' +
          '<h1 class="essay-title serif">' + esc(c.title) + "</h1>" +
          '<div class="essay-sub"><span>' + esc(c.place) + "</span>" +
            (c.subtitle ? "<span>" + esc(c.subtitle) + "</span>" : "") +
            "<span>" + c.photos.length + " photographies</span>" +
            "<span>" + c.year + "</span></div>" +
        "</div>" +
        photosEssayHTML(c.photos, c.notes, 0) +
        '<div class="essay-end"><span>' + esc(c.title) + " — " + c.year + "</span>" +
          '<a href="#home" class="to-back serif" data-nav="home">Retour aux carnets ↰</a></div>' +
      "</article>" + footerHTML();
  }

  function renderExpositions() {
    var rows = EXPOSITIONS.map(function (e) {
      return carnetRowHTML({ title: e.title, place: e.place, thumb: e.thumb, photos: e.photos, tags: ["Sélection"] }, "expo/" + e.slug);
    }).join("");
    root.innerHTML =
      '<div class="page-head">' +
        '<h1 class="essay-title compact serif">Expositions</h1>' +
        '<div class="essay-sub"><span>Sélections thématiques, quelques photos par carnet</span></div>' +
      "</div>" +
      '<div class="carnets">' + rows + emptyRowHTML("Prochaine exposition") + "</div>" +
      footerHTML();
    gallery = [];
  }

  function renderExpo(slug) {
    var e = findExpo(slug);
    if (!e) { location.hash = "#expositions"; return; }
    gallery = e.photos.slice();
    root.innerHTML =
      '<article class="essay">' +
        '<div class="essay-head">' +
          '<a href="#expositions" class="essay-back" data-nav="expositions">← Expositions</a>' +
          '<h1 class="essay-title serif">' + esc(e.title) + "</h1>" +
          '<div class="essay-sub"><span>' + esc(e.place) + "</span><span>" + e.photos.length + " photographies</span></div>" +
        "</div>" +
        '<div class="essay-note reveal"><p>' + esc(e.note) + "</p></div>" +
        photosEssayHTML(e.photos, [], 0) +
        '<div class="essay-end"><span>Exposition — 2026</span>' +
          '<a href="#expositions" class="to-back serif" data-nav="expositions">Retour aux expositions ↰</a></div>' +
      "</article>" + footerHTML();
  }

  var carteGlobe = null;

  function destroyCarteGlobe() {
    if (carteGlobe) { carteGlobe.destroy(); carteGlobe = null; }
  }

  function renderCarte() {
    gallery = [];
    root.innerHTML =
      '<div class="page-head">' +
        '<h1 class="essay-title compact serif">Carte</h1>' +
        '<div class="essay-sub"><span>' + CARNETS.length + " pays visité" + (CARNETS.length > 1 ? "s" : "") +
          "</span><span>Faites tourner le globe</span></div>" +
      "</div>" +
      '<div class="globe-panel">' +
        '<div class="globe-holder"><canvas id="carteGlobe" class="globe-canvas"></canvas>' +
          '<div class="globe-tip glass" id="carteTip" aria-hidden="true"></div>' +
        "</div>" +
        '<div class="map-legend glass">' +
          '<p class="legend-head">Pays visités</p>' +
          CARNETS.map(function (c) {
            return '<button class="legend-row" data-code="' + esc(c.countryCode) + '" data-slug="' + esc(c.slug) + '">' +
                     '<span class="legend-dot"></span><span class="legend-name">' + esc(c.title) + "</span>" +
                     '<span class="legend-count">' + c.photos.length + "</span></button>";
          }).join("") +
        "</div>" +
      "</div>" + footerHTML("Fond de carte : Natural Earth (domaine public)");

    var canvas = document.getElementById("carteGlobe");
    var tip = document.getElementById("carteTip");
    carteGlobe = Globe.create(canvas, {
      highlights: CARNETS.map(function (c) { return { code: c.countryCode, title: c.title, slug: c.slug }; }),
      fill: 0.9,
      onHover: function (hit, x, y) { showTip(tip, canvas, hit, x, y); },
      onSelect: function (hit) { location.hash = "#carnet/" + hit.slug; }
    });

    root.querySelectorAll(".legend-row").forEach(function (btn) {
      btn.addEventListener("mouseenter", function () {
        if (carteGlobe) carteGlobe.focusCountry(btn.getAttribute("data-code"));
      });
      btn.addEventListener("click", function () {
        location.hash = "#carnet/" + btn.getAttribute("data-slug");
      });
    });
  }

  function showTip(tip, canvas, hit, x, y) {
    if (!tip) return;
    if (!hit) { tip.classList.remove("is-on"); return; }
    var rect = canvas.getBoundingClientRect();
    tip.textContent = hit.title;
    tip.style.left = (x - rect.left) + "px";
    tip.style.top = (y - rect.top) + "px";
    tip.classList.add("is-on");
  }

  function footerHTML(extra) {
    return '<footer class="site"><span>Rémy — carnets de voyage</span>' +
      (extra ? "<span>" + esc(extra) + "</span>" : "") +
      "<span>2026</span></footer>";
  }

  // ---------- Router ----------
  var ROUTES = { home: renderHome, expositions: renderExpositions, carte: renderCarte };

  function navGroup(hash) {
    if (hash === "home" || hash.indexOf("carnet/") === 0) return "home";
    if (hash === "expositions" || hash.indexOf("expo/") === 0) return "expositions";
    if (hash === "carte") return "carte";
    return "home";
  }

  function render() {
    destroyCarteGlobe();
    var hash = (window.location.hash || "#home").replace("#", "");
    if (hash.indexOf("carnet/") === 0) {
      renderCarnet(hash.slice("carnet/".length));
    } else if (hash.indexOf("expo/") === 0) {
      renderExpo(hash.slice("expo/".length));
    } else if (ROUTES[hash]) {
      ROUTES[hash]();
    } else {
      renderHome();
    }

    root.classList.remove("view-enter");
    void root.offsetWidth; // relance l'animation
    root.classList.add("view-enter");

    nav.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-view") === navGroup(hash));
    });
    document.body.classList.toggle("on-home", hash === "home");
    window.scrollTo(0, 0);
    attachFrameListeners();
    observeReveals();
    updateChrome();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-nav]");
    if (el) {
      e.preventDefault();
      window.location.hash = "#" + el.getAttribute("data-nav");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var el = document.activeElement;
    if (el && el.classList && el.classList.contains("carnet-row")) {
      e.preventDefault();
      window.location.hash = "#" + el.getAttribute("data-nav");
    }
  });
  window.addEventListener("hashchange", render);

  // ---------- Révélation au défilement ----------
  var revealObserver = null;
  function observeReveals() {
    var targets = root.querySelectorAll(".reveal");
    if (reducedMotion() || !("IntersectionObserver" in window)) {
      targets.forEach(function (t) { t.classList.add("is-in"); });
      return;
    }
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    targets.forEach(function (t) { revealObserver.observe(t); });
  }

  function updateChrome() {
    topBar.classList.toggle("is-scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", updateChrome, { passive: true });

  // ---------- Lightbox ----------
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxCap = document.getElementById("lightboxCap");
  var metaPanel = document.getElementById("metaPanel");
  var infoBtn = document.getElementById("lightboxInfo");
  var prevBtn = document.getElementById("lightboxPrev");
  var nextBtn = document.getElementById("lightboxNext");
  var lbIndex = -1;
  var lastFocus = null;

  function renderMeta(meta) {
    var rows = [
      ["Appareil", meta.camera], ["Objectif", meta.lens], ["Focale", meta.focal],
      ["Ouverture", meta.aperture], ["Vitesse", meta.shutter], ["ISO", meta.iso]
    ].filter(function (r) { return r[1]; });
    if (rows.length === 0) {
      metaPanel.innerHTML = '<p class="meta-empty">Métadonnées non disponibles pour cette photo.</p>';
    } else {
      metaPanel.innerHTML = rows.map(function (r) {
        return '<div class="meta-row"><span>' + r[0] + "</span><b>" + esc(r[1]) + "</b></div>";
      }).join("");
    }
  }

  function showAt(i) {
    if (!gallery.length) return;
    lbIndex = (i + gallery.length) % gallery.length;
    var p = gallery[lbIndex];
    lightboxImg.src = p.file;
    lightboxImg.alt = p.alt || "";
    var counter = gallery.length > 1 ? (lbIndex + 1) + " / " + gallery.length : "";
    lightboxCap.textContent = [p.cap, counter].filter(Boolean).join("  ·  ");
    lightboxCap.classList.toggle("is-empty", !lightboxCap.textContent);
    renderMeta(p.meta || {});
    metaPanel.classList.remove("is-open");
    var many = gallery.length > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
  }

  function openLightbox(i) {
    lastFocus = document.activeElement;
    showAt(i);
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("lb-open");
    document.getElementById("lightboxClose").focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lb-open");
    metaPanel.classList.remove("is-open");
    lbIndex = -1;
    window.setTimeout(function () { if (!lightbox.classList.contains("is-open")) lightboxImg.src = ""; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function attachFrameListeners() {
    root.querySelectorAll(".frame").forEach(function (fig) {
      var img = fig.querySelector("img");
      if (img) {
        img.addEventListener("load", function () { fig.classList.add("is-loaded"); });
        if (img.complete) fig.classList.add("is-loaded");
      }
      fig.addEventListener("click", function () {
        openLightbox(parseInt(fig.getAttribute("data-i"), 10) || 0);
      });
    });
  }

  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
  infoBtn.addEventListener("click", function () { metaPanel.classList.toggle("is-open"); });
  prevBtn.addEventListener("click", function () { showAt(lbIndex - 1); });
  nextBtn.addEventListener("click", function () { showAt(lbIndex + 1); });
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox || e.target.classList.contains("lb-figure")) closeLightbox();
  });
  document.addEventListener("keydown", function (e) {
    if (!lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") showAt(lbIndex + 1);
    else if (e.key === "ArrowLeft") showAt(lbIndex - 1);
  });

  // ---------- Intro : globe puis entrée dans le site ----------
  var intro = document.getElementById("intro");
  var introGlobe = null;

  function introAlreadySeen() {
    try { return sessionStorage.getItem("introSeen") === "1"; } catch (e) { return false; }
  }
  function markIntroSeen() {
    try { sessionStorage.setItem("introSeen", "1"); } catch (e) {}
  }

  function dismissIntro(then) {
    if (!intro || intro.hidden || intro.classList.contains("is-leaving")) return;
    markIntroSeen();
    intro.classList.add("is-leaving");
    document.body.classList.remove("intro-open");
    var wait = reducedMotion() ? 0 : 900;
    window.setTimeout(function () {
      intro.hidden = true;
      intro.classList.remove("is-leaving", "is-on");
      if (introGlobe) { introGlobe.destroy(); introGlobe = null; }
      if (then) then();
    }, wait);
  }

  function startIntro() {
    var hash = (window.location.hash || "#home").replace("#", "");
    if (hash !== "home" || introAlreadySeen() || !window.Globe) return;

    intro.hidden = false;
    document.body.classList.add("intro-open");
    var canvas = document.getElementById("introGlobe");
    var tip = document.getElementById("introTip");

    introGlobe = Globe.create(canvas, {
      highlights: CARNETS.map(function (c) { return { code: c.countryCode, title: c.title, slug: c.slug }; }),
      fill: 0.86,
      onHover: function (hit, x, y) { showTip(tip, canvas, hit, x, y); },
      onSelect: function (hit) {
        introGlobe.focusCountry(hit.code, function () {
          dismissIntro(function () { location.hash = "#carnet/" + hit.slug; });
        });
      },
      onError: function () { dismissIntro(); }
    });

    window.requestAnimationFrame(function () { intro.classList.add("is-on"); });

    var leave = function () { dismissIntro(); };
    document.getElementById("introEnter").addEventListener("click", leave);
    intro.addEventListener("wheel", function (e) {
      if (e.deltaY > 0) leave();
    }, { passive: true });
    var touchStart = null;
    intro.addEventListener("touchstart", function (e) {
      touchStart = e.touches[0] ? e.touches[0].clientY : null;
    }, { passive: true });
    intro.addEventListener("touchmove", function (e) {
      if (touchStart == null || !e.touches[0]) return;
      if (touchStart - e.touches[0].clientY > 60) leave();
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (intro.hidden) return;
      if (e.key === "Escape" || e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        leave();
      }
    });
  }

  render();
  startIntro();
})();
