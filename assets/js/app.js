(function () {
  "use strict";

  var root = document.getElementById("root");
  var nav = document.getElementById("mainNav");
  var topBar = document.getElementById("topBar");

  // Contenu du site. Il vit dans assets/data/content.json pour que l'admin
  // puisse le réécrire : générer du JSON est sûr, générer du JS ne l'est pas.
  var CARNETS = [];
  var EXPOSITIONS = [];
  var SITE = {};

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

    // Avec l'intro, le héros est « collant » : il reste en place derrière le
    // globe pendant toute la transition, puis défile normalement. Sans lui,
    // on verrait une bande vide passer sous le voile.
    root.innerHTML =
      (introEnabled ? '<div class="hero-stage">' : "") +
      '<div class="hero"><img src="' + heroImg + '" alt="' + esc(heroAlt) + '" fetchpriority="high" decoding="async">' +
        '<div class="hero-caption">' +
          '<span class="loc glass">' + esc(featured ? featured.title + " · " + featured.place : "") + "</span>" +
          '<span class="scroll-cue" aria-hidden="true">défiler</span>' +
        "</div>" +
      "</div>" +
      (introEnabled ? "</div>" : "") +
      '<div class="intro-block"><div class="intro-grid">' +
        '<h2 class="serif reveal">' + esc(SITE.homeHeading || "") + "</h2>" +
        '<p class="lede reveal">' + esc(SITE.lede || "") + "</p>" +
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
        '<div class="essay-end"><span>Exposition — ' + esc(SITE.year || "") + "</span>" +
          '<a href="#expositions" class="to-back serif" data-nav="expositions">Retour aux expositions ↰</a></div>' +
      "</article>" + footerHTML();
  }

  // ---------- Dates ----------
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
              "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  // « du 14 au 28 mars 2026 », « du 28 mars au 4 avril 2026 », « le 14 mars 2026 ».
  // On n'écrit le mois et l'année qu'une fois quand ils ne changent pas.
  function formatPeriod(from, to) {
    var a = parseDay(from), b = parseDay(to);
    if (!a) return "";
    var day = function (d) { return d.getDate(); };
    var full = function (d) { return d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); };
    if (!b || a.getTime() === b.getTime()) return "le " + full(a);
    if (a.getFullYear() !== b.getFullYear()) return "du " + full(a) + " au " + full(b);
    if (a.getMonth() !== b.getMonth()) {
      return "du " + day(a) + " " + MOIS[a.getMonth()] + " au " + full(b);
    }
    return "du " + day(a) + " au " + full(b);
  }

  function durationDays(from, to) {
    var a = parseDay(from), b = parseDay(to);
    if (!a) return 0;
    if (!b) return 1;
    return Math.round((b - a) / 86400000) + 1;
  }

  // Un voyage = un carnet + une de ses périodes. Un pays visité deux fois
  // apparaît donc deux fois dans la chronologie, à sa place.
  function allTrips() {
    var trips = [];
    CARNETS.forEach(function (c) {
      (c.trips || []).forEach(function (t) {
        if (parseDay(t.from)) trips.push({ carnet: c, from: t.from, to: t.to });
      });
    });
    return trips.sort(function (x, y) { return x.from < y.from ? 1 : x.from > y.from ? -1 : 0; });
  }

  var timelineGlobe = null;
  var timelineObserver = null;

  function destroyTimeline() {
    if (timelineObserver) { timelineObserver.disconnect(); timelineObserver = null; }
    if (timelineGlobe) { timelineGlobe.destroy(); timelineGlobe = null; }
  }

  function renderTimeline() {
    gallery = [];
    var trips = allTrips();
    if (!trips.length) {
      root.innerHTML =
        '<div class="page-head"><h1 class="essay-title compact serif">Chronologie</h1>' +
        '<div class="essay-sub"><span>Aucune date renseignée pour l\'instant</span></div></div>' +
        footerHTML();
      return;
    }

    var lastYear = null;
    var entries = trips.map(function (t, i) {
      var y = t.from.slice(0, 4);
      var anchor = y !== lastYear ? '<div class="tl-year serif">' + esc(y) + "</div>" : "";
      lastYear = y;
      var days = durationDays(t.from, t.to);
      return anchor +
        '<article class="tl-entry reveal" data-code="' + esc(t.carnet.countryCode) + '" data-i="' + i + '">' +
          '<div class="tl-dot" aria-hidden="true"></div>' +
          '<a class="tl-card" href="#carnet/' + esc(t.carnet.slug) + '" data-nav="carnet/' + esc(t.carnet.slug) + '">' +
            '<div class="tl-thumb"><img src="' + esc(t.carnet.thumb || t.carnet.hero) + '" alt="" loading="lazy" decoding="async"></div>' +
            '<div class="tl-body">' +
              '<h2 class="serif">' + esc(t.carnet.title) + "</h2>" +
              '<p class="tl-dates">' + esc(formatPeriod(t.from, t.to)) + "</p>" +
              '<p class="tl-meta">' + esc(t.carnet.place) + " · " + days + " jour" + (days > 1 ? "s" : "") +
                " · " + (t.carnet.photos || []).length + " photographies</p>" +
            "</div>" +
            '<span class="tl-go" aria-hidden="true">↗</span>' +
          "</a>" +
        "</article>";
    }).join("");

    var pays = {};
    trips.forEach(function (t) { pays[t.carnet.slug] = true; });
    root.innerHTML =
      '<div class="page-head">' +
        '<h1 class="essay-title compact serif">Chronologie</h1>' +
        '<div class="essay-sub"><span>' + trips.length + " voyage" + (trips.length > 1 ? "s" : "") + "</span>" +
          "<span>" + Object.keys(pays).length + " pays</span></div>" +
      "</div>" +
      '<div class="tl-wrap">' +
        '<div class="tl-globe"><div class="tl-globe-inner">' +
          '<div class="globe-glass" aria-hidden="true"></div>' +
          '<canvas id="tlGlobe" class="globe-canvas"></canvas>' +
        "</div></div>" +
        '<div class="tl-track">' + entries + "</div>" +
      "</div>" + footerHTML();

    var canvas = document.getElementById("tlGlobe");
    timelineGlobe = Globe.create(canvas, {
      highlights: CARNETS.map(function (c) { return { code: c.countryCode, title: c.title, slug: c.slug }; }),
      fill: 0.84,
      autoRotate: false,
      palette: PALETTE_PAPIER,
      onSelect: function (hit) { location.hash = "#carnet/" + hit.slug; }
    });

    // Le globe suit la lecture : l'entrée la plus proche du milieu de l'écran
    // devient le pays visé.
    var current = null;
    var pick = function () {
      var best = null, bestDist = Infinity;
      root.querySelectorAll(".tl-entry").forEach(function (el) {
        var r = el.getBoundingClientRect();
        var d = Math.abs((r.top + r.height / 2) - window.innerHeight / 2);
        if (d < bestDist) { bestDist = d; best = el; }
      });
      if (!best) return;
      best.classList.add("is-current");
      root.querySelectorAll(".tl-entry").forEach(function (el) {
        if (el !== best) el.classList.remove("is-current");
      });
      var code = best.getAttribute("data-code");
      if (code !== current) {
        current = code;
        if (timelineGlobe) {
          timelineGlobe.setActiveCountry(code);
          timelineGlobe.focusCountry(code, { duration: 0.9 });
        }
      }
    };
    timelineGlobe.ready.then(pick);
    var ticking = false;
    timelineObserver = { disconnect: function () { window.removeEventListener("scroll", onScroll); } };
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; pick(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var PALETTE_PAPIER = {
    oceanTop: "rgba(58,92,101,0.92)",
    oceanBottom: "rgba(20,42,50,0.96)",
    land: "rgba(240,235,222,0.30)",
    landStroke: "rgba(246,242,232,0.26)",
    graticule: "rgba(236,230,216,0.12)",
    limb: "rgba(8,16,20,0.42)",
    rim: "rgba(255,252,246,0.30)"
  };

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
        '<div class="globe-holder"><div class="globe-glass" aria-hidden="true"></div>' +
          '<canvas id="carteGlobe" class="globe-canvas"></canvas>' +
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
      palette: PALETTE_PAPIER,
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
    return '<footer class="site"><span>' + esc(SITE.footerName || "") + "</span>" +
      (extra ? "<span>" + esc(extra) + "</span>" : "") +
      "<span>" + esc(SITE.year || "") + "</span></footer>";
  }

  // ---------- Router ----------
  var ROUTES = { home: renderHome, chronologie: renderTimeline, expositions: renderExpositions, carte: renderCarte };

  function navGroup(hash) {
    if (hash === "home" || hash.indexOf("carnet/") === 0) return "home";
    if (hash === "expositions" || hash.indexOf("expo/") === 0) return "expositions";
    if (hash === "chronologie") return "chronologie";
    if (hash === "carte") return "carte";
    return "home";
  }

  function render() {
    destroyCarteGlobe();
    destroyTimeline();
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
    var tlLink = nav.querySelector('[data-view="chronologie"]');
    if (tlLink) tlLink.hidden = allTrips().length === 0;
    window.scrollTo(0, 0);
    attachFrameListeners();
    observeReveals();
    updateChrome();
    showIntro(hash === "home");
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

  // ---------- Intro : le globe est le haut de la page d'accueil ----------
  // La transition n'est pas un rideau qu'on chasse, c'est une fonction du
  // défilement : on remonte en haut, le globe revient. Le repère est la
  // hauteur du « spacer » posé en tête de la page d'accueil.
  var intro = document.getElementById("intro");
  var introGlobe = null;
  var introEnabled = !!window.Globe;
  var diving = false;
  var diveToken = 0;   // invalide une plongée abandonnée (retour arrière)

  function introSpan() {
    return Math.max(1, window.innerHeight * 0.85);
  }

  function updateIntro() {
    if (!introEnabled || intro.hidden || diving) return;
    var p = Math.min(1, Math.max(0, window.scrollY / introSpan()));
    intro.style.setProperty("--p", p.toFixed(4));
    intro.classList.toggle("is-past", p > 0.995);   // sorti de l'écran
    intro.classList.toggle("is-back", p > 0.45);    // laisse passer les clics
    document.body.classList.toggle("globe-front", p < 0.5);
    if (introGlobe) introGlobe.setActive(p < 0.995);
  }

  var introTicking = false;
  function onIntroScroll() {
    if (introTicking) return;
    introTicking = true;
    window.requestAnimationFrame(function () {
      introTicking = false;
      updateIntro();
    });
  }

  function enterSite() {
    window.scrollTo({ top: Math.ceil(introSpan()) + 2, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // Plongée vers le pays choisi, puis ouverture du carnet.
  function diveTo(hit) {
    if (diving) return;
    diving = true;
    var token = ++diveToken;
    intro.classList.add("is-diving");
    document.body.classList.remove("globe-front");
    var dur = reducedMotion() ? 0 : 1100;
    introGlobe.focusCountry(hit.code, { zoom: 2.6, duration: dur / 1000 }, function () {
      // Si l'utilisateur est revenu en arrière entre-temps, cette plongée est
      // caduque : elle ne doit plus naviguer.
      if (token !== diveToken) return;
      location.hash = "#carnet/" + hit.slug;
      window.setTimeout(function () {
        if (token !== diveToken) return;
        intro.classList.remove("is-diving");
        diving = false;
        showIntro(false);
      }, 60);
    });
  }

  function showIntro(on) {
    if (!introEnabled) return;
    diveToken++;
    diving = false;
    intro.hidden = !on;
    document.body.classList.toggle("has-intro", on);
    if (!on) {
      document.body.classList.remove("globe-front");
      if (introGlobe) introGlobe.setActive(false);
      return;
    }
    if (!introGlobe) {
      var canvas = document.getElementById("introGlobe");
      var tip = document.getElementById("introTip");
      introGlobe = Globe.create(canvas, {
        highlights: CARNETS.map(function (c) { return { code: c.countryCode, title: c.title, slug: c.slug }; }),
        fill: 0.84,
        onHover: function (hit, x, y) { showTip(tip, canvas, hit, x, y); },
        onSelect: diveTo,
        onError: function () { introEnabled = false; showIntro(false); }
      });
    } else {
      introGlobe.setActive(true);
      introGlobe.resize();
      introGlobe.reset();
    }
    intro.classList.remove("is-diving");
    intro.classList.add("is-on");
    updateIntro();
  }

  document.getElementById("introEnter").addEventListener("click", enterSite);
  window.addEventListener("scroll", onIntroScroll, { passive: true });
  window.addEventListener("resize", onIntroScroll);
  document.addEventListener("keydown", function (e) {
    if (intro.hidden || diving || window.scrollY > 4) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "PageDown") {
      if (document.activeElement && document.activeElement.closest(".intro-ui")) return;
      e.preventDefault();
      enterSite();
    }
  });

  // ---------- Chargement du contenu ----------
  function applySiteTexts() {
    var set = function (sel, value) {
      var el = document.querySelector(sel);
      if (el && value != null) el.textContent = value;
    };
    if (SITE.documentTitle) document.title = SITE.documentTitle;
    var meta = document.querySelector('meta[name="description"]');
    if (meta && SITE.description) meta.setAttribute("content", SITE.description);
    set(".brand", SITE.brand);
    set(".intro-kicker", SITE.kicker);
    set(".intro-hint", SITE.introHint);
    var enter = document.getElementById("introEnter");
    if (enter && SITE.enterLabel) enter.childNodes[0].nodeValue = SITE.enterLabel + " ";
    var title = document.querySelector(".intro-title");
    if (title && SITE.introTitle) {
      title.innerHTML = SITE.introTitle.split("\n").map(esc).join("<br>");
    }
  }

  fetch("assets/data/content.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("content.json " + r.status);
      return r.json();
    })
    .then(function (data) {
      CARNETS = data.carnets || [];
      EXPOSITIONS = data.expositions || [];
      SITE = data.site || {};
      applySiteTexts();
      render();
    })["catch"](function (err) {
      root.innerHTML = '<div class="page-head"><h1 class="essay-title compact serif">Contenu indisponible</h1>' +
        '<div class="essay-sub"><span>' + esc(err.message) + "</span></div></div>";
      if (intro) intro.hidden = true;
    });
})();
