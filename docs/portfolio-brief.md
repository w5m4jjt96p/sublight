# Sublight, dossier de projet

> **À quoi sert ce fichier.** C'est un brief à donner à Claude (chat) comme
> contexte, pour qu'il aide à écrire, structurer ou mettre en page une étude de
> cas Sublight dans un portfolio de designer. Tout ce qui suit est vérifié
> contre le dépôt : chiffres mesurés, décisions réellement prises, bugs
> réellement rencontrés. Rien n'est estimé. Si une info manque, elle est
> marquée comme telle plutôt que comblée.
>
> **Prompt de départ suggéré :** « Voici le dossier d'un projet que j'ai conçu.
> Aide-moi à en tirer une étude de cas portfolio de N mots, orientée [process /
> systeme de design / produit]. Ne rajoute aucun chiffre qui ne soit pas dans
> le dossier. »

---

## 1. Le projet en un paragraphe

**Sublight** est une carte du système solaire qui recense la flotte robotique
active, construite autour d'une seule idée : **rien de ce que vous voyez n'est
en train de se produire.** Chaque distance est exprimée en temps-lumière, et
chaque temps-lumière est mesuré, jamais inventé. Le projet existe sous deux
formes jumelles : un site (sublight.observer) et une application iOS native.

- **En ligne :** sublight.observer (Cloudflare Pages)
- **iOS :** application SwiftUI native, distribuée en TestFlight
- **Période :** premier commit le 25 août 2026 ; au 16 septembre 2026, 97 commits
  de code (136 avec les rafraîchissements de données automatiques)
- **Rôle :** conception produit, UX/UI, direction artistique, écriture

---

## 1 bis. Répartition du travail, à énoncer clairement

**L'UX, l'UI, la direction artistique, l'écriture et toutes les décisions
produit sont de moi. Le code ne l'est pas : le développement web, iOS et le
pipeline de données ont été écrits par Claude Code, l'agent de développement
d'Anthropic, sur ma direction.**

Cette phrase, ou son équivalent, doit apparaître dans l'étude de cas. Trois
raisons :

1. C'est vrai, et une étude de cas qui laisse croire le contraire s'effondre au
   premier entretien technique.
2. Ça ne retire rien au travail présenté. Tout ce qui suit (la thèse, les règles
   de couleur, le tri par heure d'arrivée, l'arbitrage stories contre flux, la
   pellicule, la navigation) relève de décisions de conception, pas
   d'implémentation.
3. En 2026, diriger un agent de développement sur onze jours et en sortir deux
   applications cohérentes **est** une compétence de designer, pas un aveu.
   Voir l'angle 5 en section 8.

**Zone grise à trancher toi-même :** les icônes SVG de la section 4.7 ont été
tracées par l'agent à partir de mon brief (sujets, style monoline, grille,
épaisseur de trait). Selon la rigueur que tu veux afficher, écris soit
« icônes dessinées sur mesure d'après mon brief », soit « direction du jeu
d'icônes ». Ne pas écrire « dessinées à la main » sans autre précision.

---

## 2. Le problème de design

Les cartes du système solaire mentent toutes de la même façon : elles montrent
une flotte de sondes comme si on l'observait en direct. Or on ne voit jamais
une sonde. On voit un signal qui a mis des minutes ou des heures à arriver.
Perseverance est à 15 min 42 s de lumière au moment où j'écris : la dernière
photo « d'aujourd'hui » montre un Mars vieux d'un quart d'heure.

Le pari du projet : faire du **délai** l'objet du design, pas une note de bas de
page. Tout le système visuel, éditorial et informationnel découle de là.

---

## 3. Ce que contient le produit

| Vue | Contenu |
|---|---|
| **Carte** | 17 engins, positions réelles issues de JPL Horizons, rayon logarithmique, anneaux orbitaux, marqueurs 1 / 10 / 100 UA, héliopause. En 3D (WebGL brut, ciel et planètes NASA, voir section 11) ; la carte plate reste le repli sans WebGL et un choix via `?map3d=0` |
| **Fiche engin** | Distance, temps-lumière, statut, dernière image, contact antenne en direct (Deep Space Network) |
| **Galerie** | Flux unique de toutes les images de la flotte, trié par **heure d'arrivée mesurée** (le `date_received` de la NASA) |
| **Mars** | Globe 3D (WebGL sur le web, SceneKit sur iOS) avec sites d'atterrissage et trajets des rovers |
| **Traverse** | Carte HiRISE du parcours d'un rover, photos par sol |
| **Deep Sky** | L'échelle du temps-lumière prolongée : « Rien ici n'est nouveau » |

La flotte suivie : Perseverance, Curiosity, Ingenuity, JWST, DSCOVR, Yutu-2,
BepiColombo, Parker Solar Probe, Solar Orbiter, Akatsuki, Europa Clipper,
JUICE, Psyche, Lucy, New Horizons, Voyager 1 et 2. Neuf sont actifs, cinq en
croisière, les autres dormants, silencieux ou retirés. Cette nuance de statut
est portée par la couleur, pas par un badge.

---

## 4. Les décisions de design, et pourquoi

C'est la matière principale pour un portfolio. Chaque décision a une contrainte
derrière elle, pas une préférence esthétique.

### 4.1 Le rayon est logarithmique

Voyager 1 est plus de cent fois plus loin que Mars. Sur une carte linéaire, le
système solaire interne s'effondre en un pixel et les Voyager sortent de
l'écran. Le rayon est donc compressé : `r = log10(1 + AU x 400)`. La carte
admet ouvertement qu'elle est une échelle, pas une photographie.

### 4.2 L'ambre est réservé

Trois couleurs seulement portent du sens :

```
--signal  #8FD6E6   actif
--delay   #E5B571   temps-lumière, et engins qui renvoient des images
--dead    #3B4250   silencieux / retiré
```

`--delay` (l'ambre) ne sert **jamais** de décoration. Elle ne marque que deux
choses : une valeur de temps-lumière, et un engin qui produit de l'imagerie
publique. Conséquence directe : sur n'importe quelle capture d'écran, l'œil
suit l'ambre et lit exactement la thèse du produit. La règle est écrite dans les
consignes du dépôt pour ne pas dériver.

### 4.3 Une valeur absente reste absente

Aucune valeur numérique affichée n'est inventée ou codée en dur. Si une donnée
n'est pas disponible, l'interface affiche « — » et le build enregistre un
avertissement. Jamais d'estimation plausible pour boucher un trou. C'est une
règle de design autant que d'ingénierie : la crédibilité du produit *est* le
produit.

### 4.4 L'heure affichée est l'heure d'arrivée

Une photo de rover n'est pas datée de sa prise de vue, mais du moment où sa
lumière a réellement atteint la Terre. C'est le seul horodatage honnête du
point de vue du spectateur. Toute la galerie est triée sur cet axe, ce qui
produit un ordre que personne d'autre n'affiche.

Première version : `prise de vue + temps-lumière du jour`. Vérification faite
sur les flux de la NASA, cette formule était fausse : une image attend en
mémoire du rover qu'un orbiteur passe la relayer, parfois plusieurs jours. Le
champ `date_received` publié par la NASA est l'arrivée mesurée ; la galerie est
désormais triée et datée sur lui, sur les deux plateformes. Les images d'un
même post gardent l'ordre de prise de vue, sans quoi le folioscope (4.6) ne
lit plus le mouvement.

### 4.5 La galerie emprunte la grammaire d'Instagram

Le flux a traversé quatre versions avant de se stabiliser :

1. grille par engin,
2. **stories** plein écran (construites, puis retirées),
3. blocs par engin ordonnés par date d'arrivée,
4. **flux unique entrelacé**, la version actuelle.

La règle finale, volontairement banale : **un post = un engin + un sol** (un
jour martien). Si d'autres photos existent à une autre date, c'est un autre
post. Le flux global mélange les engins par ordre d'arrivée :

```
Perseverance, sol 123, arrivé il y a 10 min
Perseverance, sol 122, arrivé il y a 30 min
Curiosity,    sol 2003, arrivé il y a 40 min
Perseverance, sol 121, arrivé il y a 50 min
```

L'enseignement le plus utile du projet : **emprunter une grammaire que
l'utilisateur connaît déjà libère toute son attention pour le contenu, qui
lui est inconnu.** Les stories étaient plus originales et objectivement pires.

### 4.6 Le défilement d'images, ou la pellicule

Problème observé : certaines photos consécutives appartiennent à une même
séquence. Les vues de la Terre par DSCOVR, regardées vite, font tourner la
planète. Certains sols de Curiosity font pareil. Les regarder une par une
détruisait cette information.

Solution : une **pellicule de vignettes** sous l'image, sur laquelle on glisse
le doigt pour faire défiler la séquence, plus un bouton de lecture à 110 ms par
image. Le post devient un folioscope. La transition entre images est un
remplacement sec, sans fondu : un fondu aurait lissé exactement le mouvement
qu'on cherchait à révéler.

La pellicule est échantillonnée à 40 vignettes maximum, quel que soit le nombre
de photos du sol (certains dépassent 230). Les vignettes remplissent la largeur
de leur cellule et recadrent les panoramas, sinon une seule image large écrasait
toute la bande.

### 4.7 Navigation flottante, icônes dessinées

La navigation est passée du bandeau supérieur à une **capsule flottante en bas
d'écran**, d'abord sur iOS puis reportée sur le web. Deux raisons : le pouce, et
le fait que le bandeau débordait sur un écran de 375 px. La capsule compte
quatre entrées, Map, Gallery, Mars, Deep Sky ; l'onglet Near-Earth a été retiré
en cours de route parce qu'il n'apportait rien à la thèse. Sur iOS, la capsule
ne porte que les icônes, à 20 pt des bords pour dégager l'indicateur d'accueil.

Les icônes de navigation (carte, galerie, Mars, ciel profond) et celle du
suivi d'antennes ont été dessinées par moi en SVG monoline, `currentColor`,
déposées dans `design/icons/` et converties par le code en composants React et
en tracés SwiftUI. Pas de bibliothèque d'icônes : aucun jeu générique ne
contient « Deep Sky », et un jeu générique aurait donné à l'ensemble un air de
tableau de bord SaaS. Réglages, recherche et horloge gardent des glyphes
système, trop basiques pour mériter un dessin.

### 4.8 Typographie

- **Roboto Mono** pour les chiffres et le petit texte. Un chiffre monospacé ne
  saute pas quand une horloge s'incrémente, et l'ensemble a le ton d'un
  instrument.
- **Stack Sans Notch** pour les titres et les noms d'engins.
- **IBM Plex Mono / Sans** en repli par glyphe, uniquement pour les symboles que
  les polices d'affichage ne couvrent pas (— · ↗ ≈ °).

La typographie des éléments d'interface a été agrandie en deux passes tardives,
sur retour utilisateur : les relevés (horloge UTC, compteur de suivi), la puce
de météo spatiale et les libellés de navigation. Corollaire non trivial : à 11,5
px, cinq libellés plus le Soleil ne tiennent en largeur sur un téléphone que si
les espaces entre éléments disparaissent et que le rembourrage interne prend le
relais. Le grossissement du texte est un problème de mise en page, pas un
réglage.

### 4.9 Parité entre les deux plateformes

Le web et iOS partagent les tokens, les règles typographiques et la
navigation. Chaque fonctionnalité a été portée dans les deux sens : la
navigation flottante est née sur iOS, le flux entrelacé sur le web. La dernière
opération du projet a consisté à aligner les tailles de police iOS sur le point
de rupture téléphone du web, table de correspondance à l'appui.

---

## 5. La contrainte structurante : zéro backend

**Aucune clé d'API n'est jamais exposée au client, et il n'y a pas de serveur.**
Une action GitHub planifiée interroge les sources publiques et écrit des
fichiers JSON statiques dans le dépôt. Le client ne fait que les lire.

```
data/registry.json          vérité éditoriale, écrite à la main, invariante
        |
        v   action planifiée, 4 fois par jour
fetch-ephemerides   JPL Horizons  -> fleet.json + planets.json
fetch-frames        flux bruts NASA -> frames.json + vignettes
fetch-dsn           Deep Space Network -> dsn.json
verify              contrôles de cohérence, anomalie par anomalie
        |
        v
site statique (Vite + React + WebGL brut, repli Canvas 2D)
```

Deux exceptions assumées, chacune vérifiée : le navigateur appelle directement
le flux du Deep Space Network et la météo spatiale NOAA, parce que ces deux
services renvoient `Access-Control-Allow-Origin: *`. Ajouter un engin au
produit, c'est ajouter **un objet JSON**, rien d'autre.

Intérêt pour un portfolio : c'est un exemple de contrainte technique qui a
amélioré le design. Pas de compte, pas de session, pas d'état serveur, donc pas
d'écran de connexion, pas de vide à remplir, pas de coût d'exploitation. Le
produit est un objet, pas un service.

---

## 6. Trois problèmes résolus, racontables tels quels

Ce sont de bonnes micro-histoires de portfolio, parce qu'elles montrent une
méthode : **mesurer avant de décider.** Cette exigence est la mienne, et c'est
elle qu'il faut mettre en avant. Les mesures elles-mêmes ont été exécutées par
l'agent, sur cette consigne.

### « Les images arrivent lentement »

Le constat de départ est un ressenti, sans diagnostic : les photos mettent trop
de temps à apparaître. La consigne a été de chercher la cause avant de toucher
à quoi que ce soit.

Cause réelle : chaque image était récupérée une seule fois, à une seule taille,
et cette même URL servait à la fois la pellicule, la scène et la visionneuse.
Une image de Curiosity pèse 275 à 676 Ko, donc une pellicule de 40 vignettes
téléchargeait environ 27 Mo avant qu'un post ne se stabilise.

Le sondage des serveurs de la NASA a révélé que chaque image MSL existe en
variantes accessibles par suffixe d'URL, non documentées côté produit :

| caméra | brut | `-br` | `-thm` |
|---|---|---|---|
| MAST_RIGHT | 275 Ko | 117 Ko | 9 Ko |
| NAV_LEFT_B | 536 Ko | 113 Ko | 8 Ko |
| FHAZ_LEFT_B | 380 Ko | 87 Ko | 7 Ko |

Le modèle est passé à trois tailles : `thumb` pour la pellicule, `view` pour la
scène, `full` pour le plein écran. Vérification après coup : le flux web émet
57 requêtes `-thm` et 41 `-br`, et plus aucune image brute pour l'affichage.

### « Une fois par jour, ce n'est pas assez »

La demande initiale était d'augmenter la fréquence de récupération, assortie
d'une condition : établir d'abord à quelle heure et combien de fois par jour la
NASA publie réellement. La lecture du champ `date_received` des flux a donné la
réponse : Curiosity publie sur une quinzaine d'heures UTC, Perseverance par cinq
salves, et l'imagerie EPIC accuse environ trois jours de retard structurel. Les
tâches planifiées ont donc été placées **après** les salves observées, pas à
intervalles réguliers.

La mesure a aussi révélé un bug invisible : une protection « déjà rafraîchi
aujourd'hui » réduisait trois tâches planifiées à une seule exécution
quotidienne, et le paquet embarqué avait six sols de retard. Le design de la
fraîcheur passait par la suppression d'un garde-fou, pas par l'ajout d'un cron.

### « Toute l'interface est bloquée »

En mode story, un clic n'importe où faisait avancer l'image, y compris sur les
boutons de l'en-tête. Cause : les zones de tap plein écran interceptaient tous
les clics et l'en-tête, rendu non cliquable, les laissait passer. Correction :
en-tête et pied de page capturent leurs propres clics, et les zones de tap sont
réduites à la bande centrale. La leçon générale : **une zone de tap plein écran
est une dette,** et il faut décider explicitement de ce qui vit au-dessus
d'elle.

À noter pour l'honnêteté du récit : le mode story a été retiré peu après. Le
bug a été corrigé, la fonctionnalité a quand même été supprimée, parce qu'elle
répondait moins bien au besoin qu'une grille.

---

## 7. Repères chiffrés (tous vérifiés)

- 17 engins suivis, dont 9 actifs
- 97 commits de code sur 23 jours
- 4 rafraîchissements de données par jour, calés sur des salves mesurées, plus
  un sondage du flux en direct toutes les 15 minutes côté client
- 3 tailles d'image par photo (environ 8 Ko / 110 Ko / 400 Ko)
- Pellicule échantillonnée à 40 vignettes, sur des sols dépassant 230 photos
- 0 dépendance d'exécution au-delà de React, 0 backend, 0 clé d'API côté client
- Bundle JavaScript : 287 Ko, 93 Ko compressé

---

## 8. Angles possibles pour l'étude de cas

À choisir selon le portfolio, à ne pas cumuler :

1. **« Concevoir avec une contrainte comme sujet. »** Le délai n'est pas un
   défaut à masquer, c'est le produit. Angle direction artistique et éditorial.
2. **« Emprunter une grammaire connue. »** Les stories contre le flux : quatre
   itérations, la version la moins originale gagne. Angle produit et UX.
3. **« Un système de design tenu par des règles écrites. »** L'ambre réservée,
   le tiret pour l'absence, les tokens partagés entre deux plateformes. Angle
   design system.
4. **« Mesurer avant de décider. »** Les trois histoires de la section 6.
   Angle process, très adapté à un portfolio orienté produit.
5. **« Designer aux commandes d'un agent. »** Deux applications cohérentes en
   onze jours, sans écrire le code : ce que ça change dans le métier, c'est que
   la qualité du produit dépend entièrement de la précision des règles qu'on
   pose. Les règles écrites du projet (l'ambre réservée, le tiret pour
   l'absence, zéro backend, un post égale un engin plus un sol) ne sont pas de
   la documentation, ce sont les instructions qui ont tenu le produit droit sur
   près de cent commits. C'est l'angle le plus différenciant des cinq, et le seul qui
   assume la répartition du travail au lieu de la contourner.

---

## 9. Ce qu'il ne faut pas affirmer

Garde-fous à respecter dans toute rédaction issue de ce document :

- **Ne pas revendiquer l'écriture du code.** Ni « développé par », ni
  « j'ai codé », ni une liste de technologies présentée comme un savoir-faire
  personnel. Les technologies peuvent être citées comme choix d'architecture
  (c'en sont), pas comme compétences d'exécution. Voir la section 1 bis.
- **Aucun chiffre d'audience, de conversion ou d'usage.** Il n'y en a pas.
  Ne pas écrire « X visiteurs » ni « Y % d'engagement ».
- **Aucun partenariat avec la NASA ou le JPL.** Les images sont du domaine
  public, les crédits sont affichés sous chaque image, et le produit dit
  explicitement qu'il n'implique aucun partenariat. C'est une règle du projet.
- **Pas de « temps réel ».** C'est l'inverse exact de la thèse. Dire « en
  direct » pour le Deep Space Network et la météo spatiale, qui le sont
  vraiment. Tout le reste est daté.
- **Pas de sur-affirmation sur l'iOS.** L'application est en TestFlight, pas
  publiée sur l'App Store à ce jour.
- **Pas de lyrisme spatial.** Le ton du projet est celui d'un instrument :
  factuel, sobre, une phrase par idée. Les titres existants donnent le
  registre : « Nothing here is happening now. », « The wall of arriving light »,
  « Nothing here is new. »

---

## 10. Captures à prévoir pour la mise en page

- La carte complète, système interne visible et Voyager encore à l'écran :
  c'est l'argument de l'échelle logarithmique en une image.
- Un post de la galerie avec la pellicule visible : c'est l'idée du folioscope.
- La capsule de navigation en gros plan : c'est le jeu d'icônes dessiné.
- Web et iOS côte à côte sur la même vue : c'est la parité.
- Un état vide avec un « — » : c'est la règle d'honnêteté rendue visible.
- Le globe de Mars avec le trajet d'un rover.

Une image animée courte de la pellicule qu'on fait défiler vaut mieux que
n'importe quel paragraphe sur la section 4.6.

---

## 11. Depuis le 5 septembre (mise à jour du 16 septembre)

Tout ce qui suit est vérifié dans le dépôt et mesuré dans le navigateur.

### La galerie, fiabilisée

- **Arrivée mesurée.** Tri et datation sur `date_received` (voir 4.4), sur le
  web et sur iOS.
- **Doublons stéréo filtrés.** Les caméras gauche et droite d'une même prise
  ne font plus deux photos : 214 photos ramenées à 149 sur un sol de
  Perseverance, 199 à 111 sur un sol de Curiosity. La première image d'un post
  est choisie par un rang de caméra (Mastcam d'abord, Hazcam en dernier), le
  même que celui de la NASA.
- **Un flux qui ne bouge pas sous les yeux.** Le flux se remaniait pendant
  quelques secondes à l'ouverture (« 14 days ago », puis « 3 hours ago », puis
  « 7 days ago »), parce que chaque réponse de la NASA re-triait tout. Il
  publie maintenant en deux temps qui ne changent jamais le haut du flux, et
  la dernière visite est conservée localement, sur iOS comme sur le web.
- **Chargé pendant qu'on regarde la carte.** L'API Perseverance de la NASA
  répond en 12 à 16 s. Le flux se chargeait à l'ouverture de la galerie, donc
  30 à 40 s d'attente. Il démarre désormais à l'ouverture du site : premiers
  posts en direct à 12 s, flux complet à 27 s, galerie immédiate ensuite.
- **iOS.** Une notification par nouveau post, qui ouvre le post et non la
  carte ; feed rechargé à chaque ouverture ; cache disque du dernier flux.

### La carte en trois dimensions (carte par défaut depuis le 17 septembre)

La carte plate a été jugée trop figée. Plutôt qu'une bibliothèque 3D, la carte
est passée en **WebGL brut** (cinq programmes de shaders, une matrice 4 x 4
écrite à la main), en gardant la compression logarithmique des distances.
Choix de construction : le GPU dessine ce qui vit dans l'espace, un calque 2D
par-dessus dessine ce qui vit sur l'écran (vignettes, éventails, libellés) et
prend le pointeur, avec le code de la carte plate, exporté et non recopié.

- **Le ciel est vrai.** Voûte issue des *Deep Star Maps 2020* de la NASA
  (étoiles Gaia DR2 sur la Voie lactée), orientée par calcul : le centre
  galactique tombe à la position prédite, et New Horizons file bien vers lui.
- **Les planètes sont vraies.** Cartes NASA et USGS (MESSENGER, Magellan,
  Blue Marble, LRO, Viking, Cassini), éclairées par le Soleil, chaque corps
  incliné sur son pôle IAU, Uranus couchée. Saturne a ses anneaux.
- **Les proportions sont vraies, Soleil compris.** 109 Terres dans le Soleil,
  onze dans Jupiter. Mesuré au pixel dans le rendu : à distance égale, 233 px
  pour le Soleil, 23 px pour Jupiter. Les distances restent compressées, et la
  légende dit exactement ce qui est à l'échelle et ce qui ne l'est pas.
- **Une erreur de chiralité découverte au passage.** Pour que ciel et
  continents ne soient pas en miroir, il a fallu constater que la carte plate
  avait toujours montré le système solaire vu depuis le *sud* de l'écliptique.
  Décision : nord en haut partout, et la carte plate inversée sur le web et
  sur iOS pour rester cohérente avec la 3D.
- **La caméra.** Zoom vers ce qui est sous le curseur, arrivée par la face
  éclairée d'un corps, interdiction géométrique d'entrer dans un corps, plan
  de coupe qui suit la distance. Trois bugs de caméra corrigés sur captures
  d'écran, dont un bouton Reset rendu incliquable par un calque mal empilé.

Limites assumées : libellés qui se chevauchent près du Soleil, rien de réglé
pour les GPU faibles, pas de portage iOS (SceneKit serait la voie). La carte
plate prend le relais automatiquement si WebGL est absent.

### Ce que ça ajoute au récit

Une sixième micro-histoire « mesurer avant de décider » : la date d'arrivée
(4.4) et la taille du Soleil ont toutes deux été tranchées en lisant des
données, un champ de la NASA dans un cas, les pixels rendus dans l'autre, et
non en faisant confiance à une formule ou à un ressenti.
