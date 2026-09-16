# Carnets — site photo

## Structure

```
index.html              coquille HTML (nav + lightbox), tout le contenu est injecté par JS
assets/css/style.css     tous les styles
assets/js/data.js        les carnets, expositions et pays visités — le seul fichier à modifier pour ajouter du contenu
assets/js/app.js         routage (#home, #carnet/oman, #expositions, #carte...) + rendu
assets/img/world-map.svg fond de carte du monde (CC BY-SA 3.0, Al MacDonald / Fritz Lekschas)
images/<pays>/*.jpg      les photos, une sous-dossier par carnet
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
  countryCode: "jp",          // doit exister dans world-map.svg
  hero: "images/japon/01.jpg",
  heroAlt: "...",
  thumb: "images/japon/01.jpg",
  photos: [
    { file: "images/japon/01.jpg", alt: "...", cap: "...", meta: {} },
    { file: "images/japon/02.jpg", alt: "...", cap: "...", meta: {} },
    // ... jusqu'à 10
  ],
  notes: [] // optionnel : phrases italiques insérées entre les photos
}
```

Rien d'autre à toucher : la page d'accueil, le carnet, la carte et le menu
se mettent à jour automatiquement. `countryCode` doit être un code ISO
alpha-2 en minuscules (om, jp, id, eg, jo, uz...) présent dans
`assets/img/world-map.svg` — ce sont les mêmes que les IDs des paths du SVG.

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

```bash
cd site-repo
git init
git add .
git commit -m "Site initial"
git branch -M main
git remote add origin https://github.com/<ton-pseudo>/<nom-du-repo>.git
git push -u origin main
```

Puis sur GitHub : Settings → Pages → Source : "Deploy from a branch",
branche `main`, dossier `/ (root)`. Le site sera en ligne à
`https://<ton-pseudo>.github.io/<nom-du-repo>/` en une à deux minutes.

Pour les mises à jour suivantes (nouveau pays, nouvelles photos) :

```bash
git add .
git commit -m "Ajout du carnet Japon"
git push
```

Le site se republie automatiquement à chaque push sur `main`.
