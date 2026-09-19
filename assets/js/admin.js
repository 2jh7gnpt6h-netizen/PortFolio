/* ============================================================
   Administration du site.

   Il n'y a pas de serveur : GitHub *est* le back-end. La clé est un jeton
   d'accès personnel, gardé dans ce navigateur et validé par GitHub — pas un
   mot de passe dans le code, qui serait lisible par tous les visiteurs.

   Une publication = un seul commit (API Git Data), même avec trente photos :
   sinon chaque fichier déclencherait une reconstruction de GitHub Pages.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://api.github.com";
  var CONTENT_PATH = "assets/data/content.json";
  var COUNTRIES_PATH = "assets/data/countries.json";
  var BRANCH = "main";
  // Version du format de contenu. L'admin réécrit content.json en entier :
  // un onglet resté ouvert avec du code périmé republierait le fichier sans
  // les champs qu'il ignore, effaçant silencieusement des données. On refuse
  // donc de publier un fichier plus récent que ce que cette page sait lire.
  var SCHEMA = 3;
  // On vise un poids de fichier plutôt qu'une qualité fixe : à qualité
  // constante une photo détaillée pèse deux fois plus qu'une photo douce, et
  // c'est le poids qui ralentit le site et fait échouer les gros envois.
  var TARGET_BYTES = 620 * 1024;
  var LADDER = [                    // essayés dans l'ordre jusqu'à tenir le budget
    { side: 2400, q: 0.86 }, { side: 2400, q: 0.78 }, { side: 2400, q: 0.70 },
    { side: 2000, q: 0.74 }, { side: 2000, q: 0.66 }, { side: 1700, q: 0.68 }
  ];

  // Le WebP pèse 25 à 35 % de moins que le JPEG à qualité perçue égale.
  var WEBP = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 1;
    return c.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  })();

  // Dépôt déduit de l'URL quand le site tourne sur github.io.
  var repo = (function () {
    var m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (m) {
      var seg = location.pathname.split("/").filter(Boolean)[0];
      return { owner: m[1], name: seg || (m[1] + ".github.io") };
    }
    return { owner: "2jh7gnpt6h-netizen", name: "PortFolio" };
  })();

  var state = {
    token: null,
    user: null,
    content: null,
    countries: {},
    pendingFiles: new Map(),   // chemin -> { base64, url, w, h }
    doomedFiles: new Set(),    // chemins dont la suppression est demandée
    dirty: false,
    selectedCarnet: 0,
    selectedExpo: 0,
    filmsEnAttente: []          // bons de commande en cours de conversion
  };

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slugify(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function toast(msg, isError) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("is-error", !!isError);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, isError ? 7000 : 3200);
  }

  // ---------- Couche GitHub ----------
  function gh(path, options) {
    var opts = options || {};
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: {
        "Authorization": "Bearer " + state.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (e) {
          var err = new Error((e && e.message ? e.message : r.statusText) + " (" + r.status + ")");
          err.status = r.status;
          err.endpoint = (opts.method || "GET") + " " + path;
          throw err;
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }
  function repoPath(p) { return "/repos/" + repo.owner + "/" + repo.name + p; }

  // Un 403 sur ce genre d'outil veut presque toujours dire la même chose.
  function explain(err) {
    if (err.status === 403) {
      return "Le jeton n'a pas le droit d'écrire dans " + repo.owner + "/" + repo.name + ".\n" +
        "Sur GitHub → Settings → Developer settings → jeton → Repository permissions, " +
        "mets « Contents » sur « Read and write » (un jeton classique, lui, a besoin de la portée « repo »), " +
        "puis reconnecte-toi avec le jeton mis à jour.\n" +
        "Détail : " + err.endpoint + " → " + err.message;
    }
    if (err.status === 401) {
      return "Jeton refusé (expiré ou révoqué). Il faut en créer un nouveau.";
    }
    if (err.status === 404) {
      return "Dépôt introuvable pour ce jeton : vérifie qu'il donne accès à " +
        repo.owner + "/" + repo.name + " (« Only select repositories »).";
    }
    if (err.status === 409 || err.status === 422) {
      return "La branche a bougé entre-temps. Clique sur « Recharger », puis refais tes modifications.\n" +
        "Détail : " + err.message;
    }
    return err.message;
  }

  // ---------- Connexion ----------
  function loadToken() {
    try { return localStorage.getItem("pf_token") || sessionStorage.getItem("pf_token"); }
    catch (e) { return null; }
  }
  function storeToken(token, remember) {
    try {
      (remember ? localStorage : sessionStorage).setItem("pf_token", token);
      (remember ? sessionStorage : localStorage).removeItem("pf_token");
    } catch (e) {}
  }
  function forgetToken() {
    try { localStorage.removeItem("pf_token"); sessionStorage.removeItem("pf_token"); } catch (e) {}
  }

  function connect(token, remember) {
    state.token = token;
    return gh("/user")
      .then(function (user) {
        state.user = user;
        return gh(repoPath(""));
      })
      .then(function () {
        // Vrai test d'écriture. `permissions.push` renvoyé par l'API décrit les
        // droits du *compte* sur le dépôt, pas ceux du jeton : un jeton en
        // lecture seule le franchissait, et l'échec n'arrivait qu'à la
        // publication. On crée donc un blob vide, référencé par aucun arbre ni
        // commit : invisible dans l'historique, ramassé par GitHub, et sans
        // effet sur le site.
        return gh(repoPath("/git/blobs"), { method: "POST", body: { content: "", encoding: "utf-8" } });
      })
      .then(function () {
        if (remember !== undefined) storeToken(token, remember);
        return loadEverything();
      });
  }

  function loadEverything() {
    return Promise.all([
      gh(repoPath("/contents/" + CONTENT_PATH + "?ref=" + BRANCH)),
      fetch(COUNTRIES_PATH).then(function (r) { return r.json(); })
    ]).then(function (res) {
      state.content = JSON.parse(decodeURIComponent(escape(atob(res[0].content.replace(/\n/g, "")))));
      if ((state.content.version || 1) > SCHEMA) {
        throw new Error("Cette page d'administration est périmée : le contenu du site " +
          "utilise un format plus récent. Recharge la page (Ctrl+Maj+R) avant de modifier " +
          "quoi que ce soit, sinon tu effacerais des informations.");
      }
      state.countries = res[1];
      state.pendingFiles.clear();
      state.doomedFiles.clear();
      setDirty(false);
      showWorkspace();
      // Les films en cours de conversion ne bloquent pas l'affichage : ils
      // s'ajoutent dès qu'on les connaît.
      chargerFileFilms().then(function () {
        if (currentCarnet()) renderFilms(currentCarnet());
      });
    });
  }

  function showWorkspace() {
    $("auth").hidden = true;
    $("workspace").hidden = false;
    $("saveBtn").hidden = false;
    $("reloadBtn").hidden = false;
    $("who").innerHTML = esc(state.user.login) + " · <a href=\"#\" id=\"logout\">déconnexion</a>";
    $("logout").addEventListener("click", function (e) {
      e.preventDefault();
      if (state.dirty && !confirm("Des modifications ne sont pas publiées. Se déconnecter quand même ?")) return;
      forgetToken();
      location.reload();
    });
    renderCarnetList();
    renderCarnetEditor();
    renderExpoList();
    renderExpoEditor();
    renderSiteEditor();
  }

  function setDirty(v) {
    state.dirty = v;
    var n = state.pendingFiles.size + state.doomedFiles.size;
    var badge = $("pending");
    badge.hidden = !v;
    badge.textContent = v ? (n ? n + " fichier" + (n > 1 ? "s" : "") + " + contenu" : "contenu modifié") : "";
    $("saveBtn").disabled = !v;
  }
  function touch() { setDirty(true); }

  // ---------- Images ----------
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function decode(source) {
    // createImageBitmap applique l'orientation EXIF ; l'<img> de repli aussi
    // dans les navigateurs récents.
    if (window.createImageBitmap) {
      return createImageBitmap(source, { imageOrientation: "from-image" })["catch"](function () {
        return createImageBitmap(source);
      });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = URL.createObjectURL(source);
    });
  }

  function drawTo(bmp, side, quarterTurns) {
    var w = bmp.width, h = bmp.height;
    var scale = Math.min(1, side / Math.max(w, h));
    w = Math.round(w * scale); h = Math.round(h * scale);
    var turned = (quarterTurns || 0) % 4;
    var canvas = document.createElement("canvas");
    canvas.width = turned % 2 ? h : w;
    canvas.height = turned % 2 ? w : h;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(turned * Math.PI / 2);
    ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
    return canvas;
  }

  function toBlob(canvas, type, q) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, q); });
  }

  // Redimensionne, pivote éventuellement, puis descend l'échelle des réglages
  // jusqu'à passer sous le budget. On garde le meilleur essai si rien n'y tient.
  function processImage(source, quarterTurns, forceType) {
    var type = forceType || (WEBP ? "image/webp" : "image/jpeg");
    return decode(source).then(function (bmp) {
      var i = 0, best = null;
      var attempt = function () {
        if (i >= LADDER.length) return Promise.resolve(best);
        var step = LADDER[i++];
        var canvas = drawTo(bmp, step.side, quarterTurns);
        return toBlob(canvas, type, step.q).then(function (blob) {
          if (!best || blob.size < best.blob.size) {
            best = { blob: blob, w: canvas.width, h: canvas.height, type: type };
          }
          return blob.size <= TARGET_BYTES ? best : attempt();
        });
      };
      return attempt().then(function (out) {
        if (bmp.close) bmp.close();
        return out;
      });
    });
  }

  function extFor(type) { return type === "image/webp" ? ".webp" : ".jpg"; }
  function typeForPath(path) {
    return /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
  }

  function registerFile(path, result) {
    return blobToBase64(result.blob).then(function (b64) {
      var prev = state.pendingFiles.get(path);
      if (prev && prev.url) URL.revokeObjectURL(prev.url);
      state.pendingFiles.set(path, {
        base64: b64, url: URL.createObjectURL(result.blob),
        w: result.w, h: result.h, size: result.blob.size
      });
      state.doomedFiles["delete"](path);
      touch();
      return { w: result.w, h: result.h };
    });
  }

  function photoSrc(file) {
    var pending = state.pendingFiles.get(file);
    return pending ? pending.url : file + "?v=" + encodeURIComponent(file);
  }

  function uniquePath(slug, name, ext) {
    var base = slugify(name.replace(/\.[^.]+$/, "")) || "photo";
    var used = {};
    (state.content.carnets || []).forEach(function (c) {
      (c.photos || []).forEach(function (p) { used[p.file] = true; });
    });
    state.pendingFiles.forEach(function (_, k) { used[k] = true; });
    var path = "images/" + slug + "/" + base + ext, i = 2;
    while (used[path]) { path = "images/" + slug + "/" + base + "-" + (i++) + ext; }
    return path;
  }

  // ---------- Carnets ----------
  function carnets() { return state.content.carnets || (state.content.carnets = []); }
  function currentCarnet() { return carnets()[state.selectedCarnet]; }

  function renderCarnetList() {
    $("carnetList").innerHTML = carnets().map(function (c, i) {
      return '<li><button data-i="' + i + '" class="' + (i === state.selectedCarnet ? "is-on" : "") + '">' +
        "<span>" + esc(c.title) + "</span><span class=\"count\">" + (c.photos || []).length + "</span></button></li>";
    }).join("") || '<li class="empty">Aucun pays</li>';
    $("carnetList").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.selectedCarnet = +b.dataset.i;
        renderCarnetList(); renderCarnetEditor();
      });
    });
  }

  function renderCarnetEditor() {
    var c = currentCarnet();
    var box = $("carnetEditor");
    if (!c) { box.innerHTML = '<p class="empty">Ajoute un pays pour commencer.</p>'; return; }

    var photoOptions = function (selected) {
      return (c.photos || []).map(function (p) {
        return '<option value="' + esc(p.file) + '"' + (p.file === selected ? " selected" : "") + ">" +
          esc(p.file.split("/").pop()) + "</option>";
      }).join("");
    };
    var countryOptions = Object.keys(state.countries).map(function (code) {
      return '<option value="' + code + '"' + (code === c.countryCode ? " selected" : "") + ">" +
        esc(state.countries[code]) + " (" + code + ")</option>";
    }).join("");

    box.innerHTML =
      "<h2>" + esc(c.title) + "</h2>" +
      '<p class="sub">Dossier des photos : <code>images/' + esc(c.slug) + "/</code></p>" +
      '<div class="row">' +
        field("title", "Titre", c.title) +
        field("place", "Lieu affiché", c.place) +
      "</div>" +
      '<div class="row">' +
        field("subtitle", "Sous-titre (optionnel)", c.subtitle || "") +
        field("year", "Année", c.year) +
      "</div>" +
      '<div class="row">' +
        field("tags", "Étiquettes (séparées par des virgules)", (c.tags || []).join(", ")) +
        '<label class="field"><span>Pays sur le globe</span><select data-k="countryCode">' + countryOptions + "</select></label>" +
      "</div>" +
      '<div class="row">' +
        '<label class="field"><span>Photo de couverture</span><select data-k="hero">' + photoOptions(c.hero) + "</select></label>" +
        '<label class="field"><span>Miniature</span><select data-k="thumb">' + photoOptions(c.thumb) + "</select></label>" +
      "</div>" +
      field("heroAlt", "Description de la couverture (accessibilité)", c.heroAlt || "") +

      '<div class="block"><div class="block-head"><h3>Photographies</h3>' +
        '<span><input type="file" id="addPhotos" accept="image/*" multiple hidden>' +
        '<button class="btn small" id="addPhotosBtn">Ajouter des photos</button></span></div>' +
        '<div class="photos" id="photoGrid"></div>' +
        '<p class="progress" id="photoProgress" hidden></p>' +
      "</div>" +

      '<div class="block"><div class="block-head"><h3>Films</h3>' +
        '<span><input type="file" id="addFilm" accept="video/*" hidden>' +
        '<button class="btn small" id="addFilmBtn">Déposer un film</button></span></div>' +
        '<p class="muted small" style="margin-bottom:10px;">Le fichier part tel quel, ' +
        'sans rien préparer : il est converti sur les serveurs de GitHub en une version ' +
        'légère pour le web (environ 20 Mo la minute). Comptez quelques minutes.</p>' +
        '<div id="filmList"></div>' +
        '<p class="progress" id="filmProgress" hidden></p>' +
      "</div>" +

      '<div class="block"><div class="block-head"><h3>Périodes du voyage</h3>' +
        '<button class="btn small" id="addTrip">Ajouter une période</button></div>' +
        '<p class="muted small" style="margin-bottom:10px;">Un pays visité deux fois ' +
        'apparaît deux fois dans la chronologie. Laisser vide pour ne pas l\'y faire figurer.</p>' +
        '<div id="tripsList"></div></div>' +

      '<div class="block"><div class="block-head"><h3>Notes intercalées</h3>' +
        '<button class="btn small" id="addNote">Ajouter</button></div>' +
        '<div id="notesList"></div></div>' +

      '<div class="block"><button class="btn danger small" id="delCarnet">Supprimer ce pays</button></div>';

    box.querySelectorAll("[data-k]").forEach(function (el) {
      el.addEventListener("input", function () {
        var k = el.dataset.k, v = el.value;
        if (k === "tags") c.tags = v.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        else c[k] = v;
        if (k === "title") renderCarnetList();
        touch();
      });
    });

    $("addPhotosBtn").addEventListener("click", function () { $("addPhotos").click(); });
    $("addFilmBtn").addEventListener("click", function () { $("addFilm").click(); });
    $("addFilm").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) deposerFilm(c, e.target.files[0]);
      e.target.value = "";
    });
    $("addPhotos").addEventListener("change", function (e) { addPhotos(c, e.target.files); });
    $("addTrip").addEventListener("click", function () {
      c.trips = c.trips || [];
      c.trips.push({ from: "", to: "" });
      touch(); renderTrips(c);
    });
    $("addNote").addEventListener("click", function () {
      c.notes = c.notes || [];
      c.notes.push({ afterGroup: 0, text: "", align: "left" });
      touch(); renderNotes(c);
    });
    $("delCarnet").addEventListener("click", function () {
      if (!confirm("Supprimer « " + c.title + " » et retirer ses photos du site ?")) return;
      (c.photos || []).forEach(function (p) { state.doomedFiles.add(p.file); });
      carnets().splice(state.selectedCarnet, 1);
      state.selectedCarnet = Math.max(0, state.selectedCarnet - 1);
      touch(); renderCarnetList(); renderCarnetEditor();
    });

    renderPhotoGrid(c);
    renderFilms(c);
    renderTrips(c);
    renderNotes(c);
  }

  function renderTrips(c) {
    var box = $("tripsList");
    if (!box) return;
    var trips = c.trips || [];
    if (!trips.length) { box.innerHTML = '<p class="empty">Aucune date renseignée.</p>'; return; }
    box.innerHTML = trips.map(function (t, i) {
      return '<div class="trip-item">' +
        '<label class="field"><span>Départ</span><input type="date" data-t="from" data-i="' + i + '" value="' + esc(t.from || "") + '"></label>' +
        '<label class="field"><span>Retour</span><input type="date" data-t="to" data-i="' + i + '" value="' + esc(t.to || "") + '"></label>' +
        '<button class="btn icon danger" data-tripdel="' + i + '" title="Retirer">✕</button></div>';
    }).join("");
    box.querySelectorAll("[data-t]").forEach(function (el) {
      el.addEventListener("input", function () {
        trips[+el.dataset.i][el.dataset.t] = el.value;
        touch();
      });
    });
    box.querySelectorAll("[data-tripdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        trips.splice(+b.dataset.tripdel, 1); touch(); renderTrips(c);
      });
    });
  }

  function field(key, label, value) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input type="text" data-k="' + key + '" value="' + esc(value) + '"></label>';
  }

  function renderPhotoGrid(c) {
    var grid = $("photoGrid");
    if (!grid) return;
    if (!(c.photos || []).length) { grid.innerHTML = '<p class="empty">Aucune photo.</p>'; return; }
    grid.innerHTML = c.photos.map(function (p, i) {
      var isNew = state.pendingFiles.has(p.file);
      var doomed = state.doomedFiles.has(p.file);
      return '<div class="photo' + (doomed ? " is-doomed" : "") + '">' +
        '<div class="photo-img"><img src="' + esc(photoSrc(p.file)) + '" alt="" loading="lazy">' +
          '<div class="photo-badge">' +
            (isNew ? '<span class="tagpill new">' +
              Math.round(state.pendingFiles.get(p.file).size / 1024) + " Ko</span>" : "") +
            '<span class="tagpill">' + (p.w > p.h ? "paysage" : "portrait") + "</span>" +
          "</div></div>" +
        '<div class="photo-tools">' +
          '<button class="btn icon" data-act="left" data-i="' + i + '" title="Déplacer avant">←</button>' +
          '<button class="btn icon" data-act="right" data-i="' + i + '" title="Déplacer après">→</button>' +
          '<button class="btn icon" data-act="rotl" data-i="' + i + '" title="Pivoter à gauche">⟲</button>' +
          '<button class="btn icon" data-act="rotr" data-i="' + i + '" title="Pivoter à droite">⟳</button>' +
          '<button class="btn icon danger" data-act="del" data-i="' + i + '" title="Retirer">✕</button>' +
        "</div>" +
        '<div class="photo-meta">' +
          '<input type="text" data-f="alt" data-i="' + i + '" placeholder="Description (accessibilité)" value="' + esc(p.alt || "") + '">' +
          '<input type="text" data-f="cap" data-i="' + i + '" placeholder="Légende affichée" value="' + esc(p.cap || "") + '">' +
        "</div></div>";
    }).join("");

    grid.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { photoAction(c, b.dataset.act, +b.dataset.i); });
    });
    grid.querySelectorAll("[data-f]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        c.photos[+inp.dataset.i][inp.dataset.f] = inp.value;
        touch();
      });
    });
  }

  function photoAction(c, act, i) {
    var p = c.photos[i];
    if (act === "left" && i > 0) {
      c.photos.splice(i - 1, 0, c.photos.splice(i, 1)[0]);
      touch(); renderPhotoGrid(c);
    } else if (act === "right" && i < c.photos.length - 1) {
      c.photos.splice(i + 1, 0, c.photos.splice(i, 1)[0]);
      touch(); renderPhotoGrid(c);
    } else if (act === "del") {
      state.doomedFiles.add(p.file);
      c.photos.splice(i, 1);
      if (c.hero === p.file) c.hero = (c.photos[0] || {}).file || "";
      if (c.thumb === p.file) c.thumb = (c.photos[0] || {}).file || "";
      touch(); renderCarnetEditor();
    } else if (act === "rotl" || act === "rotr") {
      rotatePhoto(c, p, act === "rotr" ? 1 : 3);
    }
  }

  // Pivoter réécrit le fichier : c'est la seule façon de corriger une photo
  // enregistrée en paysage sans métadonnée d'orientation (cas de l'Indonésie).
  function rotatePhoto(c, p, quarterTurns) {
    var pending = state.pendingFiles.get(p.file);
    var source = pending
      ? fetch(pending.url).then(function (r) { return r.blob(); })
      : fetch(p.file + "?raw=" + Date.now()).then(function (r) {
          if (!r.ok) throw new Error("Photo introuvable : " + p.file);
          return r.blob();
        });
    toast("Rotation…");
    source
      .then(function (blob) { return processImage(blob, quarterTurns, typeForPath(p.file)); })
      .then(function (out) { return registerFile(p.file, out); })
      .then(function (dim) {
        p.w = dim.w; p.h = dim.h;
        renderPhotoGrid(c);
        toast("Photo pivotée");
      })["catch"](function (e) { toast(e.message, true); });
  }

  function addPhotos(c, fileList) {
    var files = Array.prototype.slice.call(fileList);
    if (!files.length) return;
    var prog = $("photoProgress");
    prog.hidden = false;
    var done = 0, saved = 0;
    var step = function (file) {
      return processImage(file, 0).then(function (out) {
        var path = uniquePath(c.slug, file.name, extFor(out.type));
        return registerFile(path, out).then(function (dim) {
          c.photos = c.photos || [];
          c.photos.push({ file: path, alt: "", cap: "", w: dim.w, h: dim.h, meta: {} });
          if (!c.hero) c.hero = path;
          if (!c.thumb) c.thumb = path;
          done++;
          saved += file.size - out.blob.size;
          prog.textContent = "Préparation " + done + " / " + files.length +
            " — " + Math.round(out.blob.size / 1024) + " Ko" +
            " (au lieu de " + Math.round(file.size / 1024) + " Ko)";
        });
      });
    };
    files.reduce(function (chain, f) { return chain.then(function () { return step(f); }); }, Promise.resolve())
      .then(function () {
        prog.hidden = true;
        renderCarnetEditor();
        toast(files.length + " photo" + (files.length > 1 ? "s" : "") + " prête" +
          (files.length > 1 ? "s" : "") + " — " + Math.round(saved / 1024 / 1024 * 10) / 10 + " Mo économisés");
      })["catch"](function (e) { prog.hidden = true; toast(e.message, true); });
  }

  // ---------- Films ----------
  //
  // Un film brut pèse trop lourd pour le dépôt : GitHub refuse au-delà de
  // 100 Mo. On le range donc dans une « release », qui en accepte 2 Go, puis
  // on dépose un bon de commande minuscule dans le dépôt. C'est ce bon qui
  // réveille le robot chargé de la conversion.
  var TAG_FILMS = "films-raw";
  var LIMITE_BRUT = 2 * 1024 * 1024 * 1024;

  function releaseFilms() {
    return gh(repoPath("/releases/tags/" + TAG_FILMS)).catch(function (err) {
      if (err.status !== 404) throw err;
      return gh(repoPath("/releases"), {
        method: "POST",
        body: {
          tag_name: TAG_FILMS,
          name: "Films bruts (stockage temporaire)",
          body: "Dépôt technique des films avant conversion. Les fichiers sont effacés une fois convertis.",
          prerelease: true
        }
      });
    });
  }

  // XHR plutôt que fetch : lui seul rend compte de l'avancement d'un envoi,
  // et sur plusieurs centaines de méga-octets on ne peut pas laisser
  // quelqu'un devant un écran muet.
  function envoyerBrut(release, nom, fichier, onProgres) {
    return new Promise(function (resolve, reject) {
      var url = "https://uploads.github.com/repos/" + repo.owner + "/" + repo.name +
        "/releases/" + release.id + "/assets?name=" + encodeURIComponent(nom);
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Authorization", "Bearer " + state.token);
      xhr.setRequestHeader("Accept", "application/vnd.github+json");
      xhr.setRequestHeader("Content-Type", fichier.type || "application/octet-stream");
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgres) onProgres(e.loaded / e.total);
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(new Error("réponse illisible de GitHub")); }
          return;
        }
        var detail = "";
        try { detail = (JSON.parse(xhr.responseText) || {}).message || ""; } catch (e) {}
        reject(new Error("l'envoi du film a été refusé : " + (detail || xhr.status)));
      };
      // Un échec ici est presque toujours un refus du navigateur (CORS) ou une
      // coupure réseau : on le dit franchement plutôt que « erreur inconnue ».
      xhr.onerror = function () {
        reject(new Error("l'envoi n'a pas pu aboutir — connexion interrompue, " +
          "ou GitHub a refusé la requête depuis le navigateur"));
      };
      xhr.onabort = function () { reject(new Error("envoi interrompu")); };
      xhr.send(fichier);
    });
  }

  function deposerBon(id, bon) {
    var chemin = "films/queue/" + id + ".json";
    return gh(repoPath("/contents/" + chemin), {
      method: "PUT",
      body: {
        message: "Film déposé depuis l'administration",
        content: btoa(unescape(encodeURIComponent(JSON.stringify(bon, null, 1)))),
        branch: BRANCH
      }
    });
  }

  function deposerFilm(c, fichier) {
    if (fichier.size > LIMITE_BRUT) {
      toast("Ce film dépasse 2 Go, la limite de GitHub. Il faut le raccourcir.", true);
      return;
    }
    var suivi = $("filmProgress");
    var id = (slugify(c.slug) || "film") + "-" + Date.now().toString(36);
    var ext = (fichier.name.match(/\.[a-zA-Z0-9]+$/) || [".mp4"])[0].toLowerCase();
    var mo = Math.round(fichier.size / 1048576);

    var dire = function (t) { if (suivi) { suivi.hidden = false; suivi.textContent = t; } };
    dire("Préparation…");

    releaseFilms()
      .then(function (rel) {
        return envoyerBrut(rel, id + ext, fichier, function (part) {
          dire("Envoi du film (" + mo + " Mo) : " + Math.round(part * 100) + " %");
        });
      })
      .then(function (asset) {
        dire("Mise en file d'attente…");
        return deposerBon(id, {
          id: id, slug: c.slug, assetId: asset.id, nom: fichier.name, cap: ""
        });
      })
      .then(function () {
        state.filmsEnAttente.push({ id: id, slug: c.slug, nom: fichier.name });
        if (suivi) suivi.hidden = true;
        toast("Film déposé. La conversion démarre, comptez quelques minutes.");
        renderFilms(c);
      })
      .catch(function (err) {
        if (suivi) suivi.hidden = true;
        toast("Dépôt impossible : " + explain(err), true);
      });
  }

  // Les bons en attente vivent dans le dépôt, pas dans la fiche du site :
  // on va les lire pour savoir ce qui mijote (et ce qui a échoué).
  function chargerFileFilms() {
    return gh(repoPath("/contents/films/queue"))
      .then(function (liste) {
        var bons = (liste || []).filter(function (f) { return /\.json$/.test(f.name); });
        return Promise.all(bons.map(function (f) {
          return gh(repoPath("/contents/" + f.path)).then(function (d) {
            try { return JSON.parse(decodeURIComponent(escape(atob((d.content || "").replace(/\s/g, ""))))); }
            catch (e) { return null; }
          }).catch(function () { return null; });
        }));
      })
      .then(function (bons) {
        state.filmsEnAttente = bons.filter(Boolean);
      })
      .catch(function () { state.filmsEnAttente = []; });
  }

  function renderFilms(c) {
    var box = $("filmList");
    if (!box) return;
    var films = c.films || [];
    var attente = (state.filmsEnAttente || []).filter(function (b) { return b && b.slug === c.slug; });

    if (!films.length && !attente.length) {
      box.innerHTML = '<p class="empty">Aucun film pour ce pays.</p>';
      return;
    }

    box.innerHTML =
      attente.map(function (b) {
        var souci = b.erreur;
        return '<div class="film-line' + (souci ? " is-error" : "") + '">' +
          '<span class="film-state">' + (souci ? "Échec" : "En conversion…") + "</span>" +
          '<span class="film-name">' + esc(b.nom || b.id) + "</span>" +
          (souci ? '<span class="film-why">' + esc(b.erreur) + "</span>" : "") +
        "</div>";
      }).join("") +
      films.map(function (f, i) {
        return '<div class="film-line">' +
          '<img class="film-mini" src="' + esc(photoSrc(f.poster)) + '" alt="">' +
          '<label class="field film-cap-field"><span>Légende</span>' +
            '<input type="text" data-film="' + i + '" value="' + esc(f.cap || "") + '"></label>' +
          '<span class="film-dur">' + (f.dur ? Math.floor(f.dur / 60) + ":" +
            (f.dur % 60 < 10 ? "0" : "") + (f.dur % 60) : "") + "</span>" +
          '<button class="btn danger small" data-delfilm="' + i + '">Retirer</button>' +
        "</div>";
      }).join("");

    box.querySelectorAll("[data-film]").forEach(function (el) {
      el.addEventListener("input", function () {
        films[+el.dataset.film].cap = el.value;
        touch();
      });
    });
    box.querySelectorAll("[data-delfilm]").forEach(function (el) {
      el.addEventListener("click", function () {
        var f = films[+el.dataset.delfilm];
        if (!confirm("Retirer ce film du site ?")) return;
        if (f.file) state.doomedFiles.add(f.file);
        if (f.poster) state.doomedFiles.add(f.poster);
        films.splice(+el.dataset.delfilm, 1);
        touch(); renderFilms(c);
      });
    });
  }

  function renderNotes(c) {
    var box = $("notesList");
    if (!box) return;
    var notes = c.notes || [];
    if (!notes.length) { box.innerHTML = '<p class="empty">Aucune note.</p>'; return; }
    box.innerHTML = notes.map(function (n, i) {
      return '<div class="notes-item">' +
        '<input type="number" min="0" data-n="afterGroup" data-i="' + i + '" value="' + (n.afterGroup || 0) + '" title="Après le bloc n°">' +
        '<textarea data-n="text" data-i="' + i + '" placeholder="Texte de la note">' + esc(n.text || "") + "</textarea>" +
        '<select data-n="align" data-i="' + i + '">' +
          '<option value="left"' + (n.align !== "right" ? " selected" : "") + ">à gauche</option>" +
          '<option value="right"' + (n.align === "right" ? " selected" : "") + ">à droite</option></select>" +
        '<button class="btn icon danger" data-notedel="' + i + '">✕</button></div>';
    }).join("");
    box.querySelectorAll("[data-n]").forEach(function (el) {
      el.addEventListener("input", function () {
        var n = notes[+el.dataset.i];
        n[el.dataset.n] = el.dataset.n === "afterGroup" ? +el.value : el.value;
        touch();
      });
    });
    box.querySelectorAll("[data-notedel]").forEach(function (b) {
      b.addEventListener("click", function () {
        notes.splice(+b.dataset.notedel, 1); touch(); renderNotes(c);
      });
    });
  }

  function addCarnet() {
    var options = Object.keys(state.countries).map(function (code) {
      return '<option value="' + code + '">' + esc(state.countries[code]) + "</option>";
    }).join("");
    openModal("Ajouter un pays",
      '<label class="field"><span>Pays (allume le globe)</span>' +
      '<select id="newCountry">' + options + "</select></label>" +
      '<label class="field"><span>Titre du carnet</span><input type="text" id="newTitle" placeholder="laisser vide = nom du pays"></label>' +
      '<label class="field"><span>Année</span><input type="text" id="newYear" value="' + esc(state.content.site.year || "") + '"></label>',
      [{ label: "Créer", primary: true, action: function () {
        var code = $("newCountry").value;
        var title = $("newTitle").value.trim() || state.countries[code];
        var slug = slugify(title);
        if (carnets().some(function (c) { return c.slug === slug; })) {
          toast("Un carnet porte déjà ce nom", true); return true;
        }
        carnets().push({
          slug: slug, title: title, place: title, year: $("newYear").value.trim(),
          tags: [], countryCode: code, hero: "", heroAlt: "", thumb: "",
          trips: [{ from: "", to: "" }], photos: [], notes: []
        });
        state.selectedCarnet = carnets().length - 1;
        touch(); renderCarnetList(); renderCarnetEditor();
        toast("Pays ajouté — dépose maintenant ses photos");
      } }]);
  }

  // ---------- Expositions ----------
  function expos() { return state.content.expositions || (state.content.expositions = []); }

  function renderExpoList() {
    $("expoList").innerHTML = expos().map(function (e, i) {
      return '<li><button data-i="' + i + '" class="' + (i === state.selectedExpo ? "is-on" : "") + '">' +
        "<span>" + esc(e.title) + '</span><span class="count">' + (e.photos || []).length + "</span></button></li>";
    }).join("") || '<li class="empty">Aucune exposition</li>';
    $("expoList").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.selectedExpo = +b.dataset.i; renderExpoList(); renderExpoEditor();
      });
    });
  }

  function renderExpoEditor() {
    var e = expos()[state.selectedExpo];
    var box = $("expoEditor");
    if (!e) { box.innerHTML = '<p class="empty">Ajoute une exposition pour commencer.</p>'; return; }
    box.innerHTML =
      "<h2>" + esc(e.title) + "</h2>" +
      '<div class="row">' + field("title", "Titre", e.title) + field("place", "Lieu", e.place) + "</div>" +
      '<label class="field"><span>Texte d\'introduction</span><textarea data-k="note">' + esc(e.note || "") + "</textarea></label>" +
      '<div class="block"><div class="block-head"><h3>Photographies choisies</h3>' +
        '<button class="btn small" id="pickPhotos">Choisir</button></div>' +
        '<div class="photos" id="expoGrid"></div></div>' +
      '<div class="block"><button class="btn danger small" id="delExpo">Supprimer cette exposition</button></div>';

    box.querySelectorAll("[data-k]").forEach(function (el) {
      el.addEventListener("input", function () {
        e[el.dataset.k] = el.value;
        if (el.dataset.k === "title") renderExpoList();
        touch();
      });
    });
    $("pickPhotos").addEventListener("click", function () { openPhotoPicker(e); });
    $("delExpo").addEventListener("click", function () {
      if (!confirm("Supprimer « " + e.title + " » ?")) return;
      expos().splice(state.selectedExpo, 1);
      state.selectedExpo = Math.max(0, state.selectedExpo - 1);
      touch(); renderExpoList(); renderExpoEditor();
    });
    renderExpoGrid(e);
  }

  function renderExpoGrid(e) {
    var grid = $("expoGrid");
    if (!(e.photos || []).length) { grid.innerHTML = '<p class="empty">Aucune photo choisie.</p>'; return; }
    grid.innerHTML = e.photos.map(function (p, i) {
      return '<div class="photo"><div class="photo-img"><img src="' + esc(photoSrc(p.file)) + '" alt="" loading="lazy"></div>' +
        '<div class="photo-tools">' +
          '<button class="btn icon" data-x="left" data-i="' + i + '">←</button>' +
          '<button class="btn icon" data-x="right" data-i="' + i + '">→</button>' +
          '<button class="btn icon danger" data-x="del" data-i="' + i + '">✕</button></div>' +
        '<div class="photo-meta"><input type="text" data-g="cap" data-i="' + i + '" placeholder="Légende" value="' + esc(p.cap || "") + '"></div></div>';
    }).join("");
    grid.querySelectorAll("[data-x]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.dataset.i, act = b.dataset.x;
        if (act === "del") e.photos.splice(i, 1);
        else if (act === "left" && i > 0) e.photos.splice(i - 1, 0, e.photos.splice(i, 1)[0]);
        else if (act === "right" && i < e.photos.length - 1) e.photos.splice(i + 1, 0, e.photos.splice(i, 1)[0]);
        if (!e.thumb || !e.photos.some(function (p) { return p.file === e.thumb; })) {
          e.thumb = (e.photos[0] || {}).file || "";
        }
        touch(); renderExpoGrid(e);
      });
    });
    grid.querySelectorAll("[data-g]").forEach(function (inp) {
      inp.addEventListener("input", function () { e.photos[+inp.dataset.i].cap = inp.value; touch(); });
    });
  }

  function openPhotoPicker(e) {
    var chosen = {};
    (e.photos || []).forEach(function (p) { chosen[p.file] = p; });
    var html = carnets().map(function (c) {
      if (!(c.photos || []).length) return "";
      return '<div class="pick-group"><h4>' + esc(c.title) + "</h4><div class=\"pick-grid\">" +
        c.photos.map(function (p) {
          return '<div class="pick' + (chosen[p.file] ? " is-on" : "") + '" data-file="' + esc(p.file) + '">' +
            '<img src="' + esc(photoSrc(p.file)) + '" alt="" loading="lazy"></div>';
        }).join("") + "</div></div>";
    }).join("") || '<p class="empty">Aucune photo disponible.</p>';

    openModal("Choisir des photographies", html, [{ label: "Valider", primary: true, action: function () {
      var picked = [];
      $("modalBody").querySelectorAll(".pick.is-on").forEach(function (el) {
        var file = el.dataset.file;
        var existing = chosen[file];
        if (existing) { picked.push(existing); return; }
        var src = null;
        carnets().forEach(function (c) {
          (c.photos || []).forEach(function (p) { if (p.file === file) src = p; });
        });
        picked.push({ file: file, alt: src ? src.alt : "", cap: src ? src.cap : "", w: src ? src.w : 0, h: src ? src.h : 0 });
      });
      e.photos = picked;
      if (!picked.some(function (p) { return p.file === e.thumb; })) e.thumb = (picked[0] || {}).file || "";
      touch(); renderExpoEditor();
    } }]);

    $("modalBody").querySelectorAll(".pick").forEach(function (el) {
      el.addEventListener("click", function () { el.classList.toggle("is-on"); });
    });
  }

  function addExpo() {
    expos().push({ slug: "expo-" + (expos().length + 1), title: "Nouvelle exposition", place: "", thumb: "", note: "", photos: [] });
    state.selectedExpo = expos().length - 1;
    touch(); renderExpoList(); renderExpoEditor();
  }

  // ---------- Textes du site ----------
  function renderSiteEditor() {
    var s = state.content.site || (state.content.site = {});
    var fields = [
      ["brand", "Nom affiché en haut à gauche", "text"],
      ["documentTitle", "Titre de l'onglet du navigateur", "text"],
      ["description", "Description pour les moteurs de recherche", "area"],
      ["kicker", "Surtitre de l'accueil", "text"],
      ["introTitle", "Titre sur le globe (un retour à la ligne = une ligne)", "area"],
      ["introHint", "Invitation sous le titre", "text"],
      ["enterLabel", "Texte du bouton d'entrée", "text"],
      ["homeHeading", "Titre de la section d'introduction", "area"],
      ["lede", "Paragraphe de présentation", "area"],
      ["footerName", "Pied de page", "text"],
      ["year", "Année affichée", "text"]
    ];
    $("siteEditor").innerHTML = "<h2>Textes du site</h2>" +
      '<p class="sub">Tout ce qui est écrit en dur sur les pages.</p>' +
      fields.map(function (f) {
        var v = esc(s[f[0]] || "");
        return '<label class="field"><span>' + esc(f[1]) + "</span>" +
          (f[2] === "area"
            ? '<textarea data-s="' + f[0] + '">' + v + "</textarea>"
            : '<input type="text" data-s="' + f[0] + '" value="' + v + '">') + "</label>";
      }).join("");
    $("siteEditor").querySelectorAll("[data-s]").forEach(function (el) {
      el.addEventListener("input", function () { s[el.dataset.s] = el.value; touch(); });
    });
  }

  // ---------- Modale ----------
  function openModal(title, bodyHTML, buttons) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = bodyHTML;
    $("modalFoot").innerHTML = "";
    (buttons || []).forEach(function (b) {
      var el = document.createElement("button");
      el.className = "btn" + (b.primary ? " primary" : "");
      el.textContent = b.label;
      el.addEventListener("click", function () {
        if (b.action() !== true) closeModal();
      });
      $("modalFoot").appendChild(el);
    });
    $("modal").hidden = false;
  }
  function closeModal() { $("modal").hidden = true; }

  // ---------- Publication : un seul commit ----------
  // Une entrée d'arbre par fichier touché, posée sur l'arbre existant. Les
  // suppressions passent par sha:null. Les images deviennent des blobs base64.
  function publish() {
    var btn = $("saveBtn");
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = "Publication…";

    // Un fichier encore référencé quelque part ne doit pas être supprimé.
    var referenced = {};
    carnets().forEach(function (c) {
      (c.photos || []).forEach(function (p) { referenced[p.file] = true; });
      if (c.hero) referenced[c.hero] = true;
      if (c.thumb) referenced[c.thumb] = true;
    });
    expos().forEach(function (e) {
      (e.photos || []).forEach(function (p) { referenced[p.file] = true; });
      if (e.thumb) referenced[e.thumb] = true;
    });
    var deletions = Array.from(state.doomedFiles).filter(function (f) { return !referenced[f]; });
    var additions = Array.from(state.pendingFiles.keys());

    var baseCommit, tree = [];
    gh(repoPath("/git/ref/heads/" + BRANCH))
      .then(function (ref) {
        baseCommit = ref.object.sha;
        return gh(repoPath("/git/commits/" + baseCommit));
      })
      .then(function (commit) {
        var baseTree = commit.tree.sha;
        state.content.version = SCHEMA;
        tree.push({
          path: CONTENT_PATH, mode: "100644", type: "blob",
          content: JSON.stringify(state.content, null, 2) + "\n"
        });
        deletions.forEach(function (path) {
          tree.push({ path: path, mode: "100644", type: "blob", sha: null });
        });
        var i = 0;
        var uploadNext = function () {
          if (i >= additions.length) return Promise.resolve();
          var path = additions[i++];
          btn.textContent = "Envoi " + i + " / " + additions.length;
          return gh(repoPath("/git/blobs"), {
            method: "POST",
            body: { content: state.pendingFiles.get(path).base64, encoding: "base64" }
          }).then(function (blob) {
            tree.push({ path: path, mode: "100644", type: "blob", sha: blob.sha });
            return uploadNext();
          });
        };
        return uploadNext().then(function () {
          btn.textContent = "Publication…";
          return gh(repoPath("/git/trees"), { method: "POST", body: { base_tree: baseTree, tree: tree } });
        });
      })
      .then(function (newTree) {
        var parts = [];
        if (additions.length) parts.push(additions.length + " photo(s) ajoutée(s)");
        if (deletions.length) parts.push(deletions.length + " retirée(s)");
        return gh(repoPath("/git/commits"), {
          method: "POST",
          body: {
            message: "Mise à jour du contenu depuis l'administration" +
              (parts.length ? "\n\n" + parts.join(", ") : ""),
            tree: newTree.sha,
            parents: [baseCommit]
          }
        });
      })
      .then(function (commit) {
        return gh(repoPath("/git/refs/heads/" + BRANCH), { method: "PATCH", body: { sha: commit.sha } });
      })
      .then(function () {
        state.pendingFiles.forEach(function (f) { if (f.url) URL.revokeObjectURL(f.url); });
        btn.textContent = label;
        toast("Publié. Le site se met à jour d'ici une à deux minutes.");
        return loadEverything();
      })["catch"](function (e) {
        btn.textContent = label;
        btn.disabled = false;
        toast("Échec de la publication. " + explain(e), true);
      });
  }

  // ---------- Démarrage ----------
  $("loginBtn").addEventListener("click", function () {
    var token = $("tokenInput").value.trim();
    if (!token) return;
    $("authError").hidden = true;
    $("loginBtn").disabled = true;
    connect(token, $("rememberToken").checked)["catch"](function (e) {
      $("authError").textContent = explain(e);
      $("authError").hidden = false;
      $("loginBtn").disabled = false;
    });
  });
  $("tokenInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("loginBtn").click();
  });
  $("addCarnet").addEventListener("click", addCarnet);
  $("addExpo").addEventListener("click", addExpo);
  $("saveBtn").addEventListener("click", publish);
  $("reloadBtn").addEventListener("click", function () {
    if (state.dirty && !confirm("Abandonner les modifications non publiées ?")) return;
    loadEverything().then(function () { toast("Contenu rechargé"); });
  });
  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });

  $("tabs").addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (!tab) return;
    $("tabs").querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("is-on", t === tab); });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.dataset.panel !== tab.dataset.tab;
    });
  });

  window.addEventListener("beforeunload", function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  var saved = loadToken();
  if (saved) {
    connect(saved)["catch"](function (e) {
      forgetToken();
      $("authError").textContent = explain(e);
      $("authError").hidden = false;
    });
  }
})();
