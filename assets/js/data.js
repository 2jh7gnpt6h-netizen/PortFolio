// ============================================================
// Toutes les données du site. Pour ajouter un pays :
// 1. Mettre les photos dans images/<slug>/ (ex: images/japon/01.jpg)
// 2. Ajouter un objet dans CARNETS ci-dessous
// 3. (optionnel) L'ajouter à EXPOSITIONS pour une sélection thématique
// ============================================================

const CARNETS = [
  {
    slug: "oman",
    title: "Oman",
    place: "Mascate",
    subtitle: "Grande mosquée",
    year: 2026,
    tags: ["Architecture", "Lumière"],
    countryCode: "om", // code ISO utilisé par la carte (assets/img/world-map.svg)
    hero: "images/oman/1979.jpg",
    heroAlt: "Passage voûté aux arches successives, lumière rasante, Mascate",
    thumb: "images/oman/2030.jpg",
    photos: [
      { file: "images/oman/2030.jpg", alt: "Le dôme et le minaret principal de la grande mosquée, ciel dégagé", cap: "Le dôme, depuis la cour", meta: {} },
      { file: "images/oman/1996.jpg", alt: "Façade et dôme ajouré de la mosquée, vue en contre-plongée", cap: "Façade nord", meta: {} },
      { file: "images/oman/1998.jpg", alt: "Un visiteur traverse la cour vers l'arche centrale sous le minaret", cap: "La cour, en fin de matinée", meta: {} },
      { file: "images/oman/2020.jpg", alt: "Vue en contre-plongée serrée sur la tour du minaret, motifs géométriques", cap: "Le minaret, de près", meta: {} },
      { file: "images/oman/1979.jpg", alt: "Passage voûté aux arches successives, lumière rasante", cap: "Les arcades, lumière de fin de journée", meta: {} },
      { file: "images/oman/DSCF4138.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF4289.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5357.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5389.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5554.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/IMG_6446.JPEG", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF3270.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF3539.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF3881.JPEG", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF4900.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF4765.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF4698.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5486.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF0415.jpeg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5668.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5501.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF3913.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF4781.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF4020.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF5241.jpg", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF3019.JPG", alt: "", cap: "", meta: {} },
      { file: "images/oman/DSCF3072.JPEG", alt: "", cap: "", meta: {} },
    ],
    // notes italiques insérées entre certains groupes de photos (0 = après le 1er groupe rendu, etc.)
    notes: [
      { afterGroup: 0, text: "On arrive par la chaleur et le silence. La pierre claire renvoie la lumière avant même d'entrer." },
      { afterGroup: 1, text: "Chaque minaret raconte une échelle différente selon l'angle d'où on le regarde.", align: "right" }
    ]
  }
];

const EXPOSITIONS = [
  {
    slug: "pierre-lumiere",
    title: "Pierre et lumière",
    place: "Mascate, Oman",
    thumb: "images/oman/1979.jpg",
    note: "Trois images de la même mosquée, choisies pour la texture de la pierre et la façon dont la lumière change d'une heure à l'autre.",
    photos: [
      { file: "images/oman/2020.jpg", alt: "Vue en contre-plongée serrée sur la tour du minaret", cap: "Le minaret, milieu de journée" },
      { file: "images/oman/1996.jpg", alt: "Façade et dôme ajouré de la mosquée", cap: "La façade nord" },
      { file: "images/oman/1979.jpg", alt: "Passage voûté aux arches successives", cap: "Les arcades, fin de journée" }
    ]
  }
];
