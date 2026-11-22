# 🫒 Olivemap

Carte interactive d'arbres avec leurs informations — 100 % statique, hébergée gratuitement sur **GitHub Pages**.

- Carte OpenStreetMap avec marqueurs cliquables (popup : espèce, hauteur, circonférence, année de plantation, état, notes, photo…)
- Recherche plein texte + filtre par espèce
- Mode « nouveau point » : clic sur la carte → coordonnées + bloc GeoJSON copiés dans le presse-papiers
- Bouton de géolocalisation
- Responsive, fonctionne sur mobile

## 🚀 Activer le site

1. Dans ce dépôt : **Settings → Pages**
2. **Source** : *Deploy from a branch*, branche `main`, dossier `/ (root)`
3. Attends ~1 minute : le site est en ligne sur
   `https://char-al.github.io/olivemap/`

## ➕ Ajouter un arbre

Les données vivent dans [`arbres.geojson`](arbres.geojson) : une entrée = un arbre.

**Depuis le téléphone / navigateur :** ouvre le site, active « ＋ Point », clique à l'endroit voulu — le bloc JSON est copié. Ensuite, sur GitHub, édite `arbres.geojson`, colle le bloc (avec la virgule) et commit. ~30 secondes.

**À la main :**

```json
{
  "type": "Feature",
  "properties": {
    "nom": "Mon arbre",
    "espece": "Olea europaea",
    "hauteur_m": 6,
    "circonference_cm": 90,
    "annee_plantation": 1990,
    "etat": "bon",
    "photo": "https://…/photo.jpg",
    "notes": "Remarques libres"
  },
  "geometry": { "type": "Point", "coordinates": [longitude, latitude] }
}
```

- `coordinates` : **[longitude, latitude]** (ordre GeoJSON, pas lat/lng !)
- Tous les champs sauf `nom` sont optionnels ; ajoute tes propres clés, elles apparaîtront dans le popup
- `etat` accepte : `bon`, `moyen`, `mauvais` (ou ton propre texte)
- Pour une photo : héberge-la (p. ex. dans un dossier `photos/` du dépôt) et mets son URL

## 🗺️ Changer la zone par défaut

Dans `index.html`, ajuste :

```js
const DEFAULT_VIEW = { center: [latitude, longitude], zoom: 15 };
```

Si tu ne touches à rien d'autre, la carte se recadre automatiquement sur tes points au chargement.

## 🛠️ Stack

HTML/CSS/JS vanilla + [Leaflet](https://leafletjs.com/) (CDN) + tuiles OpenStreetMap. Aucun build, aucune dépendance à installer, aucune clé API.
