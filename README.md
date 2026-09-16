# Carnets — site photo

## Structure

```
index.html                    coquille HTML (nav + intro + lightbox), tout le contenu est injecté par JS
assets/css/style.css          tous les styles
assets/js/data.js             les carnets, expositions et pays visités — le seul fichier à modifier pour ajouter du contenu
assets/js/app.js              routage (#home, #carnet/oman, #expositions, #carte...) + mise en page des photos
assets/js/globe.js            le globe interactif (intro plein écran et page Carte)
assets/data/countries-110m.json  contours des pays (Natural Earth / world-atlas, domaine public)
assets/vendor/*.min.js        d3-array, d3-geo, topojson-client — embarqués, aucune dépendance réseau
images/<pays>/*.jpg           les photos, un sous-dossier par carnet
```

## Ajouter un pays (ex : Japon, 10 photos)

1. Créer `images/japon/` et y déposer les photos, idéalement redimensionnées
   (voir plus bas — ne pas mettre les fichiers bruts de l'appareil).
2. Ouvrir `assets/js/data.js` et ajouter un objet dans `CARNETS`, sur le
   modèle de celui d'Oman :

```js
{
  slug: "japon",
  title: "Japon",
  place: "Tokyo / Kyoto",
  year: 2026,
  tags: ["Ville", "Temples"],
  countryCode: "jp",          // code ISO alpha-2, allume le pays sur le globe
  hero: "images/japon/01.jpg",
  heroAlt: "...",
  thumb: "images/japon/01.jpg",
  photos: [
    { file: "images/japon/01.jpg", alt: "...", cap: "...", w: 2400, h: 1600, meta: {} },
    { file: "images/japon/02.jpg", alt: "...", cap: "...", w: 1600, h: 2400, meta: {} },
    // ... jusqu'à 10
  ],
  notes: [] // optionnel : phrases italiques insérées entre les photos
}
```

Rien d'autre à toucher : la page d'accueil, le carnet, le globe et le menu
se mettent à jour automatiquement. `countryCode` est un code ISO alpha-2 en
minuscules (om, jp, id, eg, jo, uz...).

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
