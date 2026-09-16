(function () {
  var root = document.getElementById("root");
  var nav = document.getElementById("mainNav");

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

  // ---------- Fragments partagés ----------
  function carnetRowHTML(item, navTarget) {
    return (
      '<div class="carnet-row" data-nav="' + navTarget + '" tabindex="0" role="link" aria-label="Ouvrir ' + esc(item.title) + '">' +
        '<div class="carnet-thumb"><img src="' + item.thumb + '" alt="" loading="lazy"></div>' +
        "<div>" +
          '<div class="carnet-title">' + esc(item.title) + "</div>" +
          '<div class="carnet-meta">' + esc(item.place) + (item.photos ? " · " + item.photos.length + " photographies" : "") + "</div>" +
        "</div>" +
        '<div class="carnet-tags">' + ((item.tags || []).map(function (t) { return '<span class="carnet-tag">' + esc(t) + "</span>"; }).join("")) + "</div>" +
      "</div>"
    );
  }

  function emptyRowHTML(label) {
    return (
      '<div class="carnet-row is-empty">' +
        '<div class="carnet-thumb">à venir</div>' +
        "<div>" +
          '<div class="carnet-title" style="opacity:.6;">' + esc(label) + "</div>" +
          '<div class="carnet-meta">En préparation</div>' +
        "</div>" +
        '<div class="carnet-tags"></div>' +
      "</div>"
    );
  }

  // Rendu générique d'une série de photos en alternance plein cadre / duo,
  // avec insertion optionnelle de notes italiques entre les groupes.
  function photosEssayHTML(photos, notes) {
    notes = notes || [];
    var html = "";
    var i = 0, takeDuo = false, groupIndex = 0;
    while (i < photos.length) {
      var take = Math.min(takeDuo ? 2 : 1, photos.length - i);
      var group = photos.slice(i, i + take);
      i += take;

      if (group.length === 2) {
        html += '<div class="duo">' + group.map(frameHTML).join("") + "</div>";
      } else {
        html += '<div class="frame full">' + frameInner(group[0]) + "</div>";
      }

      var note = notes.find(function (n) { return n.afterGroup === groupIndex; });
      if (note) {
        html += '<div class="essay-note' + (note.align === "right" ? " align-right" : "") + '"><p>' + esc(note.text) + "</p></div>";
      }

      groupIndex++;
      takeDuo = !takeDuo;
    }
    return html;
  }
  function frameHTML(p) { return '<div class="frame">' + frameInner(p) + "</div>"; }
  function frameInner(p) {
    return (
      '<img src="' + p.file + '" alt="' + esc(p.alt) + '" loading="lazy" data-meta="' + esc(JSON.stringify(p.meta || {})) + '">' +
      '<span class="cap">' + esc(p.cap || "") + "</span>"
    );
  }

  // ---------- Vues ----------
  function renderHome() {
    var featured = CARNETS[CARNETS.length - 1];
    var heroImg = featured ? featured.hero : "";
    var heroAlt = featured ? featured.heroAlt : "";
    var rows = CARNETS.map(function (c) { return carnetRowHTML(c, "carnet/" + c.slug); }).join("");

    root.innerHTML =
      '<div class="hero"><img src="' + heroImg + '" alt="' + esc(heroAlt) + '">' +
        '<div class="hero-caption"><span class="loc">' + esc(featured ? featured.place + ", " + (featured.country || "") : "") + '</span></div>' +
      "</div>" +
      '<div class="intro"><div class="intro-grid">' +
        "<h1>Des lieux traversés, gardés en images.</h1>" +
        '<p class="lede">Consultant dans la vie active, photographe le reste du temps. Ce site rassemble mes carnets de voyage — un lieu, une lumière, quelques images qui restent une fois le sac reposé.</p>' +
      "</div></div>" +
      '<div class="section-head"><h2>Carnets</h2><span class="count">' + CARNETS.length + " publié" + (CARNETS.length > 1 ? "s" : "") + "</span></div>" +
      '<div class="carnets">' + rows + emptyRowHTML("Prochain carnet") + "</div>" +
      '<footer class="site"><span>Rémy — carnets de voyage</span><span>2026</span></footer>';
  }

  function renderCarnet(slug) {
    var c = findCarnet(slug);
    if (!c) { renderHome(); return; }
    root.innerHTML =
      '<article class="essay">' +
        '<div class="essay-head">' +
          '<a href="#home" class="essay-back" data-nav="home">← Carnets</a>' +
          '<h1 class="essay-title serif">' + esc(c.title) + "</h1>" +
          '<div class="essay-sub"><span>' + esc(c.place) + "</span>" +
            (c.subtitle ? "<span>" + esc(c.subtitle) + "</span>" : "") +
            "<span>" + c.photos.length + " photographies</span></div>" +
        "</div>" +
        photosEssayHTML(c.photos, c.notes) +
        '<div class="essay-end"><span>' + esc(c.title) + " — " + c.year + "</span>" +
          '<a href="#home" class="to-back" data-nav="home">Retour aux carnets ↰</a></div>' +
      "</article>";
  }

  function renderExpositions() {
    var rows = EXPOSITIONS.map(function (e) { return carnetRowHTML({ title: e.title, place: e.place, thumb: e.thumb, photos: e.photos, tags: ["Sélection"] }, "expo/" + e.slug); }).join("");
    root.innerHTML =
      '<div class="essay-head" style="padding-bottom:0;">' +
        '<h1 class="essay-title compact serif">Expositions</h1>' +
        '<div class="essay-sub"><span>Sélections thématiques, quelques photos par carnet</span></div>' +
      "</div>" +
      '<div class="carnets" style="padding-top:20px;">' + rows + emptyRowHTML("Prochaine exposition") + "</div>" +
      '<footer class="site"><span>Rémy — carnets de voyage</span><span>2026</span></footer>';
  }

  function renderExpo(slug) {
    var e = findExpo(slug);
    if (!e) { renderExpositions(); return; }
    root.innerHTML =
      '<article class="essay">' +
        '<div class="essay-head">' +
          '<a href="#expositions" class="essay-back" data-nav="expositions">← Expositions</a>' +
          '<h1 class="essay-title serif">' + esc(e.title) + "</h1>" +
          '<div class="essay-sub"><span>' + esc(e.place) + "</span><span>" + e.photos.length + " photographies</span></div>" +
        "</div>" +
        '<div class="essay-note"><p>' + esc(e.note) + "</p></div>" +
        e.photos.map(function (p) { return '<div class="frame full">' + frameInner(p) + "</div>"; }).join("") +
        '<div class="essay-end"><span>Exposition — 2026</span>' +
          '<a href="#expositions" class="to-back" data-nav="expositions">Retour aux expositions ↰</a></div>' +
      "</article>";
  }

  function renderCarte() {
    root.innerHTML =
      '<div class="essay-head" style="padding-bottom:0;">' +
        '<h1 class="essay-title compact serif">Carte</h1>' +
        '<div class="essay-sub"><span>' + CARNETS.length + " pays visité" + (CARNETS.length > 1 ? "s" : "") + "</span></div>" +
      "</div>" +
      '<div class="map-wrap" id="mapWrap">Chargement de la carte…</div>' +
      '<div class="map-legend" id="mapLegend"></div>' +
      '<footer class="site"><span>Fond de carte : Al MacDonald / Fritz Lekschas (CC BY-SA 3.0)</span><span>2026</span></footer>';

    fetch("assets/img/world-map.svg")
      .then(function (r) { return r.text(); })
      .then(function (svg) {
        var wrap = document.getElementById("mapWrap");
        wrap.innerHTML = svg;
        var byCode = {};
        CARNETS.forEach(function (c) { byCode[c.countryCode] = c; });
        Object.keys(byCode).forEach(function (code) {
          var path = wrap.querySelector("#" + code);
          if (!path) return;
          var c = byCode[code];
          path.classList.add("visited");
          path.setAttribute("tabindex", "0");
          path.setAttribute("role", "link");
          var title = document.createElementNS("http://www.w3.org/2000/svg", "title");
          title.textContent = c.title + " — voir les photographies";
          path.insertBefore(title, path.firstChild);
          path.addEventListener("click", function () { window.location.hash = "#carnet/" + c.slug; });
          path.addEventListener("keydown", function (e) { if (e.key === "Enter") window.location.hash = "#carnet/" + c.slug; });
        });
        document.getElementById("mapLegend").innerHTML = CARNETS.map(function (c) {
          return '<div class="map-legend-row"><span class="map-legend-dot"></span><span>' + esc(c.title) +
                 ' — <a href="#carnet/' + c.slug + '" data-nav="carnet/' + c.slug + '">voir les photographies</a></span></div>';
        }).join("");
      });
  }

  // ---------- Router ----------
  var ROUTES = {
    home: renderHome,
    expositions: renderExpositions,
    carte: renderCarte
  };

  function navGroup(hash) {
    if (hash === "home" || hash.indexOf("carnet/") === 0) return "home";
    if (hash === "expositions" || hash.indexOf("expo/") === 0) return "expositions";
    if (hash === "carte") return "carte";
    return "home";
  }

  function render() {
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
    window.scrollTo(0, 0);
    attachFrameListeners();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-nav]");
    if (el) window.location.hash = "#" + el.getAttribute("data-nav");
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

  // ---------- Lightbox ----------
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var metaPanel = document.getElementById("metaPanel");
  var infoBtn = document.getElementById("lightboxInfo");

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

  function attachFrameListeners() {
    root.querySelectorAll(".frame img").forEach(function (img) {
      img.addEventListener("click", function () {
        var meta = {};
        try { meta = JSON.parse(img.getAttribute("data-meta") || "{}"); } catch (e) {}
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        renderMeta(meta);
        metaPanel.classList.remove("is-open");
        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
      });
    });
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.src = "";
    metaPanel.classList.remove("is-open");
  }
  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
  infoBtn.addEventListener("click", function () { metaPanel.classList.toggle("is-open"); });
  lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLightbox(); });

  render();
})();
