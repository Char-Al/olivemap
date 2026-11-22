# 🫒 Olivemap

Carte interactive d'arbres avec leurs informations — 100 % statique, hébergée gratuitement sur **GitHub Pages**.

- Carte OpenStreetMap avec marqueurs cliquables (popup : propriétaire, rendement, espèce, hauteur, circonférence, année de plantation, état, notes, photo…)
- **2 couleurs de points** : vert = arbre d'un particulier, bleu = arbre de la mairie
- **Rendement 1→3** (●○○) affiché dans le popup, le survol et la légende — et le marqueur affiche **1, 2 ou 3 olives 🫒** selon le rendement, visible d'un coup d'œil sur la carte
- Recherche plein texte + filtres par espèce et par propriétaire
- Mode « nouveau point » : clic sur la carte → coordonnées + bloc GeoJSON copiés dans le presse-papiers
- Bouton de géolocalisation
- Responsive, fonctionne sur mobile

## 🚀 Activer le site

Les 10 oliviers d'exemple sont placés à **Claret (34270)** autour du village.

## ☁️ Supabase — propositions ouvertes aux visiteurs

Le bouton **« 🙋 »** permet à n'importe qui de proposer un arbre **sans compte GitHub** : le point est enregistré dans une base Supabase avec le statut `attente`, puis affiché sur la carte dès que **tu le valides**.

**Mise en place (une fois, ~2 min) :**

1. Crée un projet gratuit sur [supabase.com](https://supabase.com)
2. Ouvre le **SQL Editor** du projet et exécute le script [`supabase.sql`](supabase.sql) (table + règles de sécurité RLS : lecture publique des arbres `valide`, insertion publique seulement en `attente`)
3. C'est tout — l'URL du projet et la clé `anon` (publique par conception) sont déjà dans `index.html`

**Valider une proposition :** Table Editor → table `arbres` → ligne en `attente` → changer `statut` en `valide`. La carte se met à jour au chargement suivant. Les données du GeoJSON et de Supabase sont **fusionnées** à l'affichage.

## ➕ Créer un arbre directement depuis le site

1. Bouton **« ＋ Point »** → clic à l'endroit voulu sur la carte → un formulaire s'ouvre (nom, propriétaire, rendement 1–3, espèce, dimensions, état, photo, notes)
2. **« Créer l'arbre »** → l'arbre est ajouté au dépôt par une demande signée au nom de ton compte GitHub (un commit apparaît dans l'historique) et le site se met à jour au prochain déploiement (~1 min)

Au premier usage, le site demande un **jeton GitHub** (bouton 🔑 pour y revenir) :

- crée-le sur [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) (Fine-grained)
- **Repository access** : *Only select repositories* → `olivemap`
- **Permissions** : Contents → *Read and write*

Le jeton est stocké **uniquement dans ce navigateur** (localStorage) et ne part que vers l'API GitHub. Bouton **Supprimer** dans le panneau 🔑 pour l'effacer. Sans jeton, le bouton « Copier le JSON » du formulaire reste disponible pour l'ajout manuel.

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
    "type": "particulier",
    "production": 2,
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
- `type` : `particulier` (point **vert**) ou `mairie` (point **bleu**)
- `production` : échelle de **1 à 3** affichée en ●●○, et le marqueur arbore **1, 2 ou 3 olives 🫒** en conséquence
- Tous les champs sauf `nom` sont optionnels ; ajoute tes propres clés, elles apparaîtront dans le popup
- Sur la carte, le bouton **« ＋ Point »** copie un bloc déjà rempli avec `type` et `production`
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
