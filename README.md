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
2. Ouvre le **SQL Editor** du projet et exécute le script [`supabase.sql`](supabase.sql) (table + règles de sécurité RLS : lecture publique des arbres `valide`, insertion publique seulement en `attente`) — le script est idempotent : le ré-exécuter applique les mises à jour de schéma (p. ex. nouvelles colonnes `kids_friendly`, `acces_pieton`)
3. C'est tout — l'URL du projet et la clé *publishable* `sb_publishable_…` (publique par conception) sont déjà dans `index.html`

**⏱ Date de ramassage** : réservée aux **administrateurs** — le champ est masqué dans le formulaire public et la base refuse toute insertion publique avec une date (RLS). Un admin peut la définir **au moment de la validation**.

**🙋 Participations** : dans la popup de tout arbre validé, n'importe qui peut s'inscrire (« 🙋 Je viens ») avec son pseudo et un nombre de personnes. Le total et la liste apparaissent dans la popup. Nécessite la section 8 de `supabase.sql`.

**📷 Photo réelle** : dans le formulaire (modes créer/modifier, donc admins), le bouton « 📷 Prendre / choisir une photo » ouvre l’appareil photo du téléphone, **redimensionne l’image à 1024 px** et l’envoie dans le bucket public Supabase Storage `photos` ; l’URL obtenue remplit automatiquement le champ photo (les visiteurs qui proposent un arbre collent une URL). Nécessite la section 9 de `supabase.sql` (bucket + politiques).

## 📲 Application installable + hors-ligne (PWA)

Olivemap est installable comme une vraie application :

- **Android/Chrome** : menu ⊝ → ⋮ → « Installer l'application » (ou la bannière 📲) ;
- **iOS/Safari** : Partager → « Sur l'écran d'accueil » ;
- **Desktop Chrome/Edge** : icône ⊕ dans la barre d'adresse.

Mode **hors-ligne** (service worker `sw.js`, cache `olivemap-v1`) :

- l'interface (HTML/CSS/JS, Leaflet) est préchargée ;
- `arbres.geojson` est mis en cache → les arbres du dépôt restent consultables sans réseau ;
- les **tuiles OSM déjà visitées** restent affichées (cache limité à 400) ;
- les données Supabase (validations, participations) exigent du réseau : hors-ligne, seule la carte du dépôt s'affiche, les erreurs Supabase sont silencieuses.

**Après une mise à jour du site** : recharge la page (2 fois) pour récupérer la nouvelle version. Si besoin, incrémente `CACHE = 'olivemap-vN'` dans `sw.js` pour forcer le nettoyage des anciens caches.

**👑 Panneau admin (bouton 👑 du site)**

- Connexion par **identifiant (pseudo) + mot de passe** — pas d'email affiché. Le pseudo est mappé en interne vers le compte système Supabase `pseudo@olivemap.claret`. Le mot de passe n'est jamais stocké en clair (bcrypt + sel, côté Supabase).
- Voir les **demandes en attente**, définir une date de ramassage, **valider** ✅ ou **rejeter** 🗑️ en un clic
- Les demandes en attente apparaissent aussi **directement sur la carte** pour les admins connectés : point **en pointillés et translucide**, popup marquée « ⏳ En attente » avec **date + heure de ramassage (optionnel)** et boutons **Valider/Rejeter** directement dans le popup (invisibles pour les visiteurs, filtre RLS)
- **Édition complète depuis la popup** (admins) : bouton « ✏️ Modifier » (formulaire pré-rempli : tous les champs + date de ramassage), « ⏳ Dévalider » (remet l’arbre en attente) et « 🗑 Supprimer » — protégé par la RLS côté base
- **Tableau récapitulatif de tous les arbres** en base (nom, propriétaire, rendement, espèce, ramassage, statut) avec actions rapides : valider/dévalider, supprimer
- **Gérer les administrateurs** : ajouter un pseudo (`＋`) ou en retirer — le premier admin doit néanmoins être inséré à la main : dans le SQL Editor, décommente la section 7 de `supabase.sql` avec ton pseudo (sous la forme du compte système) :

```sql
insert into public.admins (email) values ('ton-pseudo@olivemap.claret') on conflict (email) do nothing;
```

Crée ensuite le compte utilisateur correspondant **dans le tableau de bord Supabase** (il n'y a volontairement pas de bouton d'inscription sur le site) : *Authentication → Users → Add user*, avec comme email **`ton-pseudo@olivemap.claret`** (exactement, suffixe compris) et **le mot de passe de ton choix** — c'est celui que tu taperas sur le site. Supabase le stocke haché (bcrypt), jamais en clair. Puis sur le site : bouton 👑 → ton pseudo + mot de passe → **Se connecter** → tu es admin.

Pour ajouter **un autre admin** : crée d'abord son utilisateur dans *Authentication → Users → Add user* (email `pseudo@olivemap.claret` + mot de passe, à lui communiquer), puis ajoute simplement son pseudo dans la liste 👑 « Administrateurs ». Faute de la première étape, sa connexion sera refusée.

La sécurité est côté base (RLS) : un compte non-admin ne peut ni voir les demandes, ni valider, ni gérer la liste. Les données du GeoJSON et de Supabase restent **fusionnées** à l'affichage.

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
- `kids_friendly` : `true` si l'arbre est adapté aux enfants (affiché 👶 dans le popup)
- `acces_pieton` : `true` si l'accès est piéton uniquement (affiché 🚶 dans le popup)
- `ramassage` : date/heure prévue de ramassage, format `"AAAA-MM-JTHH:MM"` (p. ex. `"2026-12-15T09:30"`) — affichée 🚚 dans le popup ; **une fois la date passée, le marqueur devient grisé** (opacity réduite) et le popup affiche ✅ Ramassé
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
