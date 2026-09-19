// Conversion des films déposés depuis l'administration.
//
// Un « bon de commande » (films/queue/<id>.json) décrit un fichier brut rangé
// dans une release GitHub. Ce script le récupère, le convertit au format du
// web, en tire une image d'affiche, range le tout et inscrit le film dans la
// fiche du carnet. Le brut est ensuite effacé : il a fait son office.
//
// Réglages retenus après mesure sur une source 1080p à 40 Mbps : CRF 23 avec
// un plafond à 4 Mbps donne 22 Mo la minute, soit treize fois plus léger, pour
// une différence invisible à l'œil (PSNR 41 dB).

"use strict";

var fs = require("fs");
var path = require("path");
var execFileSync = require("child_process").execFileSync;

var RACINE = process.cwd();
var FILE_ATTENTE = path.join(RACINE, "films", "queue");
var CONTENU = path.join(RACINE, "assets", "data", "content.json");
var DEPOT = process.env.GH_REPO;
var JETON = process.env.GH_TOKEN;

var CRF = "23";
var PLAFOND = "4M";
var TAMPON = "8M";
var LARGEUR_MAX = 1920;

function journal() {
  console.log.apply(console, arguments);
}

function courir(cmd, args, options) {
  return execFileSync(cmd, args, Object.assign({ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, options || {}));
}

// Un identifiant venu d'un fichier ne doit jamais pouvoir sortir du dossier
// qu'on lui destine.
function assainir(valeur) {
  return String(valeur || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function api(chemin, methode) {
  var out = courir("curl", [
    "-sS", "-X", methode || "GET",
    "-H", "Authorization: Bearer " + JETON,
    "-H", "Accept: application/vnd.github+json",
    "-w", "\n%{http_code}",
    "https://api.github.com" + chemin
  ]);
  var coupe = out.lastIndexOf("\n");
  var code = parseInt(out.slice(coupe + 1), 10);
  var corps = out.slice(0, coupe);
  return { code: code, corps: corps };
}

// Le téléchargement suit la redirection vers le stockage signé. curl retire
// l'en-tête d'autorisation en changeant de domaine, ce qui est exactement ce
// qu'il faut : le stockage la refuserait.
function telecharger(idAsset, destination) {
  courir("curl", [
    "-sSL", "--fail",
    "-H", "Authorization: Bearer " + JETON,
    "-H", "Accept: application/octet-stream",
    "-o", destination,
    "https://api.github.com/repos/" + DEPOT + "/releases/assets/" + idAsset
  ], { stdio: ["ignore", "inherit", "inherit"] });
}

function sonder(fichier) {
  var brut = courir("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "format=duration",
    "-of", "json", fichier
  ]);
  var d = JSON.parse(brut);
  var flux = (d.streams || [])[0] || {};
  return {
    w: flux.width || 0,
    h: flux.height || 0,
    dur: Math.round(parseFloat((d.format || {}).duration || 0))
  };
}

function convertir(source, destination) {
  // On ne remonte jamais la définition : une source déjà en 1080p garde sa
  // taille, une source plus grande y est ramenée. La largeur reste paire,
  // sinon l'encodeur refuse.
  var filtre = "scale='min(" + LARGEUR_MAX + ",iw)':-2";
  courir("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", source,
    "-vf", filtre,
    "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
    "-crf", CRF, "-maxrate", PLAFOND, "-bufsize", TAMPON,
    // Sans yuv420p, un film tourné en 10 bits reste noir dans la plupart des
    // navigateurs.
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    // Place l'index en tête : la lecture démarre sans attendre tout le fichier.
    "-movflags", "+faststart",
    destination
  ], { stdio: ["ignore", "inherit", "inherit"] });
}

function affiche(film, destination) {
  // ffmpeg choisit lui-même la vue la plus représentative plutôt qu'une
  // première image souvent noire.
  courir("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", film,
    "-vf", "thumbnail=250,scale='min(1600,iw)':-2",
    "-frames:v", "1", "-q:v", "4",
    destination
  ], { stdio: ["ignore", "inherit", "inherit"] });
}

function lireContenu() {
  return JSON.parse(fs.readFileSync(CONTENU, "utf8"));
}

function ecrireContenu(contenu) {
  fs.writeFileSync(CONTENU, JSON.stringify(contenu), "utf8");
}

function traiter(fichierBon) {
  var bon = JSON.parse(fs.readFileSync(fichierBon, "utf8"));
  if (bon.erreur) { journal("  (déjà en erreur, ignoré)"); return; }

  var id = assainir(bon.id);
  var slug = assainir(bon.slug);
  if (!id || !slug) throw new Error("bon de commande incomplet (id ou pays manquant)");
  if (!bon.assetId) throw new Error("aucun fichier brut associé");

  var contenu = lireContenu();
  var carnet = (contenu.carnets || []).filter(function (c) { return c.slug === bon.slug; })[0];
  if (!carnet) throw new Error("le pays « " + bon.slug + " » n'existe plus");

  var dossier = path.join(RACINE, "videos", slug);
  fs.mkdirSync(dossier, { recursive: true });

  var brut = path.join("/tmp", "brut-" + id);
  var film = path.join(dossier, id + ".mp4");
  var image = path.join(dossier, id + ".jpg");

  journal("  téléchargement du brut…");
  telecharger(bon.assetId, brut);
  var avant = fs.statSync(brut).size;

  journal("  conversion…");
  convertir(brut, film);
  affiche(film, image);
  fs.unlinkSync(brut);

  var mesures = sonder(film);
  var apres = fs.statSync(film).size;
  journal("  " + Math.round(avant / 1048576) + " Mo → " + Math.round(apres / 1048576) +
          " Mo (" + (avant / apres).toFixed(1) + "× plus léger), " + mesures.dur + " s");

  carnet.films = (carnet.films || []).filter(function (f) { return f.file !== "videos/" + slug + "/" + id + ".mp4"; });
  carnet.films.push({
    file: "videos/" + slug + "/" + id + ".mp4",
    poster: "videos/" + slug + "/" + id + ".jpg",
    w: mesures.w, h: mesures.h, dur: mesures.dur,
    cap: String(bon.cap || "")
  });
  contenu.version = 3;
  ecrireContenu(contenu);

  // Le brut a rempli son rôle : on libère la release.
  var suppression = api("/repos/" + DEPOT + "/releases/assets/" + bon.assetId, "DELETE");
  if (suppression.code >= 300) journal("  (le brut n'a pas pu être effacé : " + suppression.code + ")");

  fs.unlinkSync(fichierBon);
  journal("  ✓ rangé dans " + carnet.title);
}

function main() {
  if (!fs.existsSync(FILE_ATTENTE)) { journal("Aucune file d'attente."); return; }
  var bons = fs.readdirSync(FILE_ATTENTE).filter(function (f) { return /\.json$/.test(f); }).sort();
  if (!bons.length) { journal("Aucun film en attente."); return; }

  journal(bons.length + " film(s) en attente.");
  bons.forEach(function (nom) {
    var chemin = path.join(FILE_ATTENTE, nom);
    journal("— " + nom);
    try {
      traiter(chemin);
    } catch (e) {
      // On n'abandonne pas les autres films, et on laisse une trace lisible
      // dans l'administration plutôt qu'un échec muet.
      journal("  ✗ " + e.message);
      try {
        var bon = JSON.parse(fs.readFileSync(chemin, "utf8"));
        bon.erreur = String(e.message || e).slice(0, 500);
        fs.writeFileSync(chemin, JSON.stringify(bon, null, 1), "utf8");
      } catch (e2) { journal("  (bon de commande illisible)"); }
    }
  });
}

main();
