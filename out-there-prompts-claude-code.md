# Out There — séquence de prompts Claude Code

Vitrine web : carte interactive des sondes robotiques actives du système solaire, construite autour du temps de latence.

**Référence visuelle :** placer `out-there-prototype-v3.html` dans `/reference/prototype-v3.html` avant de commencer. C'est la source de vérité pour l'esthétique, la projection log-radiale, l'éventail des sondes co-localisées et le comportement caméra. Le prototype contient de fausses données — tout l'enjeu de cette séquence est de les remplacer par des vraies.

---

## Prompt 0 — À coller dans `CLAUDE.md` avant de commencer

```
# Out There

Site vitrine statique. Carte du système solaire montrant les ~16 sondes
robotiques actives, avec pour thèse centrale : rien de ce qu'on voit ne se
passe maintenant. Tout est déjà vieux du temps de trajet du signal.

## Stack
- Vite + React + TypeScript
- Canvas 2D pour la carte (pas de lib 3D, pas de D3)
- Aucune dépendance runtime au-delà de React
- Déploiement statique (Cloudflare Pages ou Vercel)

## Contrainte architecturale absolue
ZÉRO BACKEND. Aucune clé API n'est jamais exposée au client.
Toutes les données externes sont récupérées par une GitHub Action quotidienne
qui écrit des fichiers JSON statiques dans /public/data/. Le client ne fait que
lire ces fichiers.
Si une fonctionnalité semble exiger un serveur, s'arrêter et le signaler
plutôt que d'improviser un proxy.

## Design tokens (repris du prototype, ne pas inventer)
--void:#06080B  --panel:#0C0F15  --rule:#171C25  --rule-2:#232B37
--txt:#DCE2EC   --dim:#6E7889    --dim-2:#454D5C
--signal:#8FD6E6  (actif)
--delay:#E5B571   (RÉSERVÉ au temps de latence et aux sondes à imagerie)
--dead:#3B4250    (silencieux / retiré)
Typo : IBM Plex Mono partout, IBM Plex Sans pour les titres uniquement.

## Règle de couleur
L'ambre --delay ne sert QU'À DEUX CHOSES : les valeurs de latence, et les
sondes qui renvoient des images publiques. Ne jamais l'utiliser en décoration.

## Règle de données
Aucune valeur numérique affichée ne doit être inventée ou codée en dur.
Si une donnée n'est pas disponible, afficher "—" et logger un avertissement
au build. Ne jamais combler un trou par une estimation plausible.
```

---

## Prompt 1 — Scaffolding

**Objectif :** initialiser le projet et poser la structure de fichiers.

```
Initialise un projet Vite + React + TypeScript nommé "out-there".

Structure attendue :
  /reference/prototype-v3.html      (déjà présent, ne pas modifier)
  /data/registry.json               manifeste éditorial, versionné à la main
  /scripts/                         scripts Node exécutés par la CI
  /src/map/                         moteur canvas
  /src/ui/                          HUD et tiroir de flotte
  /public/data/                     JSON générés, gitignorés sauf .gitkeep
  /public/frames/                   images téléchargées, gitignorées

Configure TypeScript en strict. Ajoute les polices IBM Plex Mono et
IBM Plex Sans en self-hosted via @fontsource (pas de CDN Google, la vitrine
doit fonctionner hors ligne une fois buildée).

Crée /src/styles/tokens.css avec les variables du CLAUDE.md.

Ne code aucune fonctionnalité à ce stade. Vérifie juste que `npm run dev`
affiche une page noire avec le mot OUT THERE en haut à gauche, dans la
bonne typo et les bonnes couleurs.
```

---

## Prompt 2 — Le registre éditorial

**Objectif :** séparer proprement ce qui est écrit à la main de ce qui est récupéré automatiquement.

```
Crée /data/registry.json, le manifeste éditorial des sondes. Ce fichier est
versionné et modifié à la main. Il ne contient AUCUNE valeur qui change dans
le temps — pas de distance, pas de latence, pas de date de dernier contact.

Schéma par entrée :
{
  "id": "perseverance",
  "name": "Perseverance",
  "naifId": -168,
  "agency": "NASA / JPL",
  "launched": "2020-07-30",
  "arrived": "2021-02-18",
  "status": "active" | "cruise" | "dormant" | "silent" | "retired",
  "kind": "rover" | "orbiter" | "flyby" | "observatory" | "lander",
  "host": "mars" | null,          // corps sur/autour duquel elle se trouve
  "location": "Jezero Crater · Mars",
  "imagery": { "source": "mars2020" } | null,
  "note": "une phrase, ton sobre, factuel, pas de lyrisme spatial"
}

Remplis les 16 entrées du prototype. Pour chaque sonde, VÉRIFIE le NAIF ID
sur https://ssd.jpl.nasa.gov/horizons/ plutôt que de me faire confiance :
plusieurs des IDs que j'ai en tête sont probablement faux. Les sondes ont des
IDs négatifs. Si tu ne trouves pas d'ID pour une sonde (Yutu-2 par exemple
n'est probablement pas dans Horizons), mets naifId: null et documente-le dans
le champ "note" du registre — on gérera ce cas au prompt 3.

Écris un type TypeScript /src/types.ts qui décrit ce schéma, et un test qui
valide le JSON contre le type au build.
```

---

## Prompt 3 — Éphémérides JPL Horizons

**Objectif :** obtenir les vraies positions et distances. C'est le prompt le plus risqué de la séquence.

```
Écris /scripts/fetch-ephemerides.ts.

Source : API JPL Horizons, https://ssd.jpl.nasa.gov/api/horizons.api
Pas de clé requise. Format JSON. Requête GET avec paramètres.

Pour CHAQUE sonde du registre ayant un naifId, il faut deux requêtes :

1. Vecteurs héliocentriques → position sur la carte
   COMMAND='<naifId>', CENTER='500@10' (Soleil), EPHEM_TYPE='VECTORS',
   OUT_UNITS='AU-D', START_TIME=aujourd'hui 00:00 UTC, STOP_TIME=+1j,
   STEP_SIZE='1d'
   On en tire : rayon héliocentrique en UA, et longitude écliptique en degrés.

2. Distance géocentrique → temps de lumière
   CENTER='500@399' (Terre). On en tire la range en UA, et la range à J+1
   pour permettre l'interpolation côté client.

CAS PARTICULIERS À TRAITER EXPLICITEMENT :
- Les rovers posés (Perseverance, Curiosity, Ingenuity) ne sont pas forcément
  interrogeables comme corps mobiles. Solution : utiliser Mars (499) pour la
  distance et la position, et marquer la sonde comme "hébergée". Vérifie
  d'abord si le NAIF ID du rover répond ; sinon, bascule sur le host.
- naifId null (Yutu-2) : utiliser le host (Lune, 301).
- Sonde silencieuse (Akatsuki) : la position reste calculable, on la garde.

SORTIE : /public/data/fleet.json
{
  "generatedAt": "2026-08-19T04:00:00Z",
  "craft": [{
    "id": "perseverance",
    "heliocentricAu": 1.523,
    "eclipticLonDeg": 21.4,
    "rangeAu": 2.018,
    "rangeAuNextDay": 2.026,      // pour interpolation client
    "owltSeconds": 1006.7,
    "source": "horizons:499"       // traçabilité : quel corps a été interrogé
  }]
}

Le champ "source" est obligatoire sur chaque entrée. Je veux pouvoir savoir
d'un coup d'œil quelle sonde a été résolue directement et laquelle est
approximée par son corps hôte.

RÈGLE D'ÉCHEC : si Horizons ne répond pas ou renvoie un format inattendu pour
une sonde, le script log une erreur explicite et conserve la valeur du dernier
build réussi, en ajoutant "stale": true sur cette entrée. Il ne doit JAMAIS
écrire une valeur inventée, ni faire échouer tout le build pour une sonde.

Commence par écrire un petit script de sonde qui affiche la réponse brute
d'Horizons pour Voyager 1, et montre-la-moi avant de coder le parser. Le
format de réponse d'Horizons est du texte semi-structuré à l'intérieur d'un
JSON, il faut le voir avant de l'analyser.
```

---

## Prompt 4 — Imagerie martienne

**Objectif :** les vignettes de trames brutes, avec leurs vraies heures.

```
Écris /scripts/fetch-frames.ts.

Deux sources possibles, à tester dans cet ordre :
1. API JPL raw images, SANS clé :
   https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=12&order=sol+desc
   (et category=msl pour Curiosity)
2. Repli : https://api.nasa.gov/mars-photos/api/v1/rovers/{rover}/latest_photos
   avec clé dans les secrets GitHub. Cette API a une réputation d'instabilité,
   d'où l'ordre.

Teste les deux et dis-moi laquelle renvoie des métadonnées plus riches,
notamment l'instrument et l'horodatage de capture.

Pour chaque rover, récupère la trame la plus récente :
- télécharge l'image dans /public/frames/{rover}-{sol}-{instrument}.jpg
- redimensionne à 720px de large max, qualité 80, avec sharp
- supprime les trames de plus de 30 jours pour éviter que le repo enfle

SORTIE : /public/data/frames.json
{
  "perseverance": {
    "sol": 1971,
    "instrument": "NAVCAM_RIGHT",
    "capturedUtc": "2026-08-19T04:12:31Z",
    "file": "/frames/perseverance-1971-navcam-right.jpg",
    "credit": "NASA/JPL-Caltech"
  }
}

Le champ "capturedUtc" est le cœur du produit : l'interface affichera l'heure
de capture ET l'heure d'arrivée (capture + temps de lumière du jour). Si la
source ne fournit pas d'horodatage fiable, dis-le-moi plutôt que de le
déduire du sol.

ATTRIBUTION : le crédit doit apparaître dans l'interface, pas seulement dans
le JSON. Les images NASA sont domaine public mais l'usage ne doit pas laisser
entendre un partenariat. Si tu ajoutes plus tard des sources ESA, leur licence
est différente (CC BY-SA 3.0 IGO) — prévois le champ credit dès maintenant.
```

---

## Prompt 5 — État des liaisons DSN

**Objectif :** la seule donnée réellement temps réel du site.

```
Le Deep Space Network publie l'état de ses antennes en direct :
https://eyes.nasa.gov/dsn/data/dsn.xml
Pas de clé. Rafraîchi toutes les ~5 secondes. Indique quelle antenne parle à
quelle sonde, dans quel sens, à quel débit.

Étape 1 — VÉRIFIE D'ABORD LES EN-TÊTES CORS depuis un navigateur.
Si l'endpoint autorise le fetch côté client, on interroge directement toutes
les 15 secondes et on obtient un vrai indicateur "en contact maintenant".
Si CORS bloque, NE CONSTRUIS PAS de proxy. Reviens vers moi : on se rabattra
sur une récupération dans la GitHub Action, avec un "dernier contact connu"
horodaté plutôt qu'un direct.

Dis-moi ce que tu trouves avant d'écrire le code d'intégration.

Si le direct est possible, expose un hook /src/data/useDsn.ts qui renvoie,
par id de sonde : { inContact: boolean, direction: 'up'|'down'|'both',
antenna: string }. Le hook doit dégrader silencieusement en cas d'échec réseau
— une vitrine ne montre jamais d'erreur réseau à l'écran.
```

---

## Prompt 6 — Le moteur de carte

**Objectif :** porter le canvas du prototype en TypeScript propre, alimenté par les vraies données.

```
Lis /reference/prototype-v3.html en entier, puis porte le moteur canvas dans
/src/map/ en modules TypeScript :
  projection.ts   échelle log-radiale, monde → écran
  clusters.ts     regroupement et éventail des sondes co-localisées
  camera.ts       position, échelle, interpolation, vol vers une cible
  render.ts       boucle de dessin
  interaction.ts  drag, molette, hit-test

Conserve exactement : la projection log-radiale (R_MAX=1000, K=400), le
regroupement à moins de 16 unités monde, l'éventail sur 88° orienté à
l'opposé du Soleil, l'écart écran de 17px croissant avec le zoom et plafonné,
les traits de rappel vers l'ancre.

Différences avec le prototype :
- les positions viennent de fleet.json, plus du tableau en dur
- la longitude écliptique est réelle, donc les planètes doivent aussi être
  positionnées via Horizons (interroge les 8 planètes dans le même script
  qu'au prompt 3, elles ont les IDs 199 à 899)
- le temps de lumière s'interpole côté client entre rangeAu et rangeAuNextDay
  selon l'heure courante, pour que le chiffre bouge doucement sur la journée

Le rendu doit rester à 60fps avec 16 sondes et 420 étoiles. Utilise
requestAnimationFrame, pas de setInterval pour le dessin. Respecte
prefers-reduced-motion : impulsion de signal figée, vol caméra instantané.
```

---

## Prompt 7 — HUD et tiroir de flotte

**Objectif :** l'interface autour de la carte.

```
Porte le HUD et le tiroir du prototype en composants React dans /src/ui/.

HUD haut-gauche : sonde suivie, nom et localisation.
HUD bas-gauche : temps de lumière, âge du signal, distance, dernier contact.
HUD haut-droite : "Whole system" et "Signal path".
Tiroir bas : registre complet, tri par distance croissante.

Trois choses doivent être vraies et non simulées :
- l'âge du signal décompte en continu depuis l'heure de capture réelle
- le "dernier contact" vient du DSN si le prompt 5 a abouti, sinon du
  timestamp de generatedAt avec la mention explicite "as of <heure>"
- une sonde marquée "stale": true dans fleet.json affiche un point
  d'avertissement discret dans le tiroir

Accessibilité obligatoire : chaque ligne du tiroir est focusable et
activable au clavier, la carte a une description textuelle alternative
listant les sondes et leurs latences, le contraste des textes gris sur
fond noir est vérifié à AA.
```

---

## Prompt 8 — Vignettes et fiche sonde

**Objectif :** la trame brute, et ce qui donnerait envie de revenir.

```
Vignette bas-droite, alimentée par frames.json :
instrument, sol, HEURE DE CAPTURE et HEURE D'ARRIVÉE. L'écart entre les deux
est le temps de lumière du jour — c'est le détail qui porte tout le concept,
il doit être lisible d'un coup d'œil.

Les sondes sans imagerie publique gardent le cadre, vide, avec "telemetry
only". Ne pas masquer le cadre : la flotte muette fait partie du récit.

Ajoute ensuite une fiche de détail au clic sur le nom : panneau latéral avec
la note éditoriale du registre, les dates de lancement et d'arrivée, le
compteur de durée de mission, et les 6 dernières trames si la sonde en a.

Crédit image affiché sous la vignette, jamais masqué.
```

---

## Prompt 9 — Automatisation quotidienne

**Objectif :** que le site vive sans moi.

```
GitHub Action /.github/workflows/refresh.yml :
- cron quotidien à 04:00 UTC, plus déclenchement manuel
- exécute fetch-ephemerides puis fetch-frames puis (si applicable) fetch-dsn
- commit les JSON et les images modifiés sur main
- si un script échoue, l'Action réussit quand même mais ouvre une issue
  GitHub avec le log — un site figé sur les données d'hier vaut mieux
  qu'un site cassé

Ajoute /scripts/verify.ts, exécuté en fin de chaîne, qui vérifie :
- chaque sonde du registre a une entrée dans fleet.json
- aucune latence n'est négative, nulle ou supérieure à 48h
- aucune distance héliocentrique n'est inférieure à 0.05 UA sauf pour Parker
- les fichiers images référencés existent réellement sur disque
Toute anomalie est loggée avec le nom de la sonde concernée.

La clé NASA éventuelle du prompt 4 vit dans les secrets du repo et n'apparaît
jamais dans un fichier committé ni dans le bundle client. Vérifie-le
explicitement en grepant le build de production.
```

---

## Prompt 10 — Finition et mise en ligne

**Objectif :** que ce soit présentable publiquement.

```
- Responsive : sous 860px la vignette disparaît, sous 700px le tiroir passe
  en liste condensée. La carte reste manipulable au doigt (pinch to zoom).
- Image Open Graph générée au build : la carte en vue d'ensemble avec le
  temps de lumière de Voyager 1 en surimpression.
- Une page /about courte : d'où viennent les données, quelle est la
  projection utilisée et pourquoi elle est logarithmique, quelles sondes sont
  approximées par leur corps hôte. L'honnêteté méthodologique fait partie de
  la vitrine.
- Lighthouse : performance et accessibilité au-dessus de 95.
- Déploiement Cloudflare Pages, build statique, aucune fonction serveur.

Enfin, écris un README qui explique comment ajouter une sonde au registre.
Ce doit être une seule entrée JSON, rien d'autre.
```

---

## Ordre d'exécution et points d'arrêt

Trois prompts exigent une réponse de ta part avant que Claude Code continue :

- **Prompt 3** — voir la réponse brute d'Horizons avant d'écrire le parser
- **Prompt 4** — arbitrer entre les deux sources d'images
- **Prompt 5** — décider quoi faire si CORS bloque le DSN

Ne laisse pas Claude Code improviser sur ces trois-là. Ce sont les seuls
endroits où le projet peut silencieusement se mettre à afficher des chiffres
faux, et un chiffre faux sur cette page détruit tout son intérêt.
