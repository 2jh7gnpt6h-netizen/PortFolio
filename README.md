# Carnets — site photo

## Structure

```
index.html                    coquille HTML (nav + intro + lightbox), tout le contenu est injecté par JS
assets/css/style.css          tous les styles
assets/data/content.json      TOUT le contenu : carnets, expositions, textes du site
admin.html                    l'interface d'administration (non listée sur le site)
assets/js/admin.js            son code : édition + publication vers GitHub
assets/js/app.js              routage (#home, #carnet/oman, #expositions, #carte...) + mise en page des photos
assets/js/globe.js            le globe interactif (intro plein écran et page Carte)
assets/data/countries-110m.json  contours des pays (Natural Earth / world-atlas, domaine public,
                              fond 110m complété par les micro-États du 50m)
assets/data/countries.json    noms français des pays proposés dans l'administration
assets/vendor/*.min.js        d3-array, d3-geo, topojson-client — embarqués, aucune dépendance réseau
images/<pays>/*.jpg           les photos, un sous-dossier par carnet
```

## Modifier le site sans toucher au code

Le site est statique : il n'y a pas de serveur, donc pas de « compte
administrateur » au sens classique. Un mot de passe écrit dans le JavaScript
serait lisible par n'importe quel visiteur et ne protégerait rien.

L'administration passe donc par **GitHub lui-même**, avec un jeton d'accès
personnel comme clé. Le jeton reste dans le navigateur, c'est GitHub qui le
valide, et il se révoque à tout moment.

### Première fois

1. Créer un jeton sur
   [github.com → Fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) :
   - *Repository access* : **Only select repositories** → ce dépôt
   - *Repository permissions* → **Contents : Read and write**
   - donner une date d'expiration (il faudra le recréer ensuite)
2. Ouvrir `https://<ton-pseudo>.github.io/<nom-du-repo>/admin.html`
3. Coller le jeton. Il est mémorisé sur cet appareil.

### Ensuite

- **Carnets** : titre, lieu, année, étiquettes, pays sur le globe, photo de
  couverture, notes intercalées.
- **Périodes du voyage** : une ou plusieurs par pays, au jour près. Un pays
  visité deux fois apparaît deux fois dans la chronologie, à sa place. Un
  carnet sans date n'y figure pas, et l'onglet disparaît tant qu'aucune date
  n'est renseignée.
- **Photographies** : dépose des fichiers, ils sont **redimensionnés à 2400 px
  dans le navigateur** et compressées sous 620 Ko avant envoi (en WebP quand
  le navigateur le gère). Réordonner, pivoter, légender, supprimer.
  La rotation réécrit le fichier : c'est ce qu'il faut pour les photos
  enregistrées en paysage sans métadonnée d'orientation.
- **Ajouter un pays** : bouton « Ajouter », choisir le pays dans la liste. Le
  globe s'allume tout seul, aucun code à écrire. La liste couvre 235 pays et
  territoires, micro-États compris (Bahreïn, Singapour, Malte, Monaco…) : les
  plus petits sont dessinés par une pastille dorée, sans quoi ils feraient un
  pixel et resteraient impossibles à voir comme à cliquer.
- **Ordre des carnets** : automatique. L'accueil et la légende de la carte
  classent du voyage le plus récent au plus ancien, comme la chronologie —
  l'ordre dans lequel tu crées les carnets n'a donc aucune importance. Un
  carnet daté seulement par son année se range en fin d'année ; un carnet
  sans aucune date ferme la liste.
- **Photo d'accueil** : rien à choisir. La grande image du haut est tirée au
  sort parmi toutes les photos du site à chaque visite, et la légende indique
  de quel carnet elle vient. La photo de couverture réglée dans un carnet
  sert toujours pour sa propre page et pour sa vignette.
- **Expositions** : créer, choisir les photos parmi tous les carnets.
- **Textes du site** : tout ce qui est écrit en dur sur les pages.

« Publier » envoie **un seul commit**, même avec trente photos, et GitHub Pages
republie le site en une à deux minutes.

Note : `admin.html` est accessible à tous, mais sans jeton valide elle ne
permet rien — ni de lire quoi que ce soit de privé, ni d'écrire.

## Après avoir modifié un CSS ou un JS

Les navigateurs gardent ces fichiers en mémoire : sans précaution, une
modification peut rester invisible pendant des heures. Les pages les
appellent donc avec un numéro de version (`style.css?v=3`). **Incrémenter ce
numéro dans `index.html` et `admin.html`** à chaque modification d'un fichier
`.css` ou `.js` — c'est ce qui force les navigateurs à recharger.

Le contenu (`content.json`) n'est pas concerné : il est demandé en
`no-cache`, donc toujours à jour.

## Ajouter un pays à la main (sans l'administration)

1. Créer `images/japon/` et y déposer les photos, idéalement redimensionnées
   (voir plus bas — ne pas mettre les fichiers bruts de l'appareil).
2. Ouvrir `assets/data/content.json` et ajouter un objet dans `carnets`, sur
   le modèle de celui d'Oman :

```json
{
  "slug": "japon",
  "title": "Japon",
  "place": "Tokyo / Kyoto",
  "year": "2026",
  "tags": ["Ville", "Temples"],
  "countryCode": "jp",
  "hero": "images/japon/01.jpg",
  "heroAlt": "...",
  "thumb": "images/japon/01.jpg",
  "photos": [
    { "file": "images/japon/01.jpg", "alt": "...", "cap": "...", "w": 2400, "h": 1600, "meta": {} },
    { "file": "images/japon/02.jpg", "alt": "...", "cap": "...", "w": 1600, "h": 2400, "meta": {} }
  ],
  "notes": []
}
```

Rien d'autre à toucher : la page d'accueil, le carnet, le globe et le menu
se mettent à jour automatiquement. `countryCode` est un code ISO alpha-2 en
minuscules (om, jp, id, eg, jo, uz...) ; la liste complète des codes reconnus
est dans `assets/data/countries.json`.

La chronologie compte les pays **une seule fois** : deux carnets qui portent le
même `countryCode` (« Oman I » et « Oman II ») font deux voyages mais un seul
pays. Le pourcentage affiché rapporte ce total aux 193 États membres de l'ONU.

`w` et `h` sont les dimensions en pixels de la photo. Elles servent à réserver
la place avant chargement et surtout à **apparier les photos de même
orientation côte à côte** : deux portraits voisins forment un duo de taille
strictement identique. Si tu redimensionnes tes photos comme indiqué plus bas,
c'est toujours `2400 / 1600` en paysage et `1600 / 2400` en portrait.

Aucune photo ne dépasse jamais ~78 % de la hauteur de l'écran (sauf l'image
d'en-tête, volontairement plein cadre).

## Préparer les photos avant de les ajouter

Ne pas mettre les fichiers de l'appareil tels quels (souvent 15-40 Mo
pièce) : avec 60 photos le dépôt deviendrait ingérable. Redimensionner
d'abord, par exemple avec ImageMagick :

```bash
for f in *.jpg; do
  convert "$f" -resize 2400x2400\> -quality 90 -strip "resized/$f"
done
```

Ça ramène chaque photo à ~500 Ko-1 Mo tout en gardant une bonne qualité
d'affichage plein écran.

## Mettre en ligne sur GitHub Pages

Le contenu du site est à la racine de ce dépôt. Il suffit de pousser sur
`main` :

```bash
git add .
git commit -m "Mise à jour du site"
git push
```

Sur GitHub : Settings → Pages → Source : "Deploy from a branch", branche
`main`, dossier `/ (root)`. Le site sera en ligne à
`https://<ton-pseudo>.github.io/<nom-du-repo>/` en une à deux minutes.

Pour les mises à jour suivantes (nouveau pays, nouvelles photos) :

```bash
git add .
git commit -m "Ajout du carnet Japon"
git push
```

Le site se republie automatiquement à chaque push sur `main`.
