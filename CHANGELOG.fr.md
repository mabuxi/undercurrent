# Journal des changements

Toutes les versions d’Undercurrent, de la plus récente à la plus ancienne. L’app lit ce fichier quand le français est choisi ; une version sans notes ici s’affiche en anglais (CHANGELOG.md).

## 0.17.1 · 5 octobre 2026

### Corrections
- Les traductions utilisent le modèle local intermédiaire (le 9B s’il est installé) et savent dans quelle langue est la publication : le petit modèle rendait souvent les titres sans les traduire.
- Les titres en majuscules sont traduits comme des phrases normales.
- Un texte rendu sans traduction n’est jamais gardé, et l’app vous propose de réessayer.

## 0.17.0 · 5 octobre 2026

### Français
- Undercurrent parle français. Passez de l’anglais au français dans Réglages, Langue, ou dès la première étape d’accueil ; le premier démarrage suit la langue de votre Mac.
- Tous les écrans, messages, étapes de recherche, erreurs, notes de mise à jour et les menus de l’app Mac suivent la langue.
- Les noms des kinks et des familles s’affichent en français. Les tags restent en anglais partout.
- L’assistant répond dans la langue choisie.
- Une recherche en français cherche aussi les mots anglais qu’utilisent les sources, et le mot français en plus : « pieds poilus » trouve feet et hairy, ainsi que les publications titrées en français.

### Traduire
- Les publications écrites dans une autre langue que la vôtre ont un bouton Traduire sous leur texte et un petit bouton à côté du titre. L’IA locale de ce Mac les traduit, et les traductions sont gardées : la deuxième fois, c’est instantané.
- Les boutons n’apparaissent que si la langue de la publication est clairement reconnue et différente de la vôtre.

### La langue ne change pas ce que vous voyez
- Les titres et textes en français donnent les mêmes tags anglais que les titres en anglais : les publications françaises rejoignent les mêmes kinks.
- Les IA qui taguent écrivent toujours les tags en anglais, aussi pour les publications françaises.
- Le classement, les kinks et l’apprentissage sont les mêmes dans les deux langues.

### Autres
- Les dates et les nombres suivent les formats européens dans les deux langues.
- Les nombres au singulier se lisent correctement (« 1 réponse », « 1 flamme »).

## 0.16.1 · 4 octobre 2026

### Corrections
- L’installateur pour le Terminal ferme correctement Undercurrent s’il est ouvert avant d’installer la nouvelle version.

## 0.16.0 · 4 octobre 2026

### Se télécharge comme n’importe quelle app
- Undercurrent est prêt à l’emploi sur la page Releases de GitHub : une image disque à glisser dans Applications, ou une ligne à coller dans le Terminal qui l’installe et l’ouvre.
- Rien à installer avant : ni Node.js, ni npm, ni Xcode, ni git. L’app contient son propre Node.js.
- Fonctionne sur les Mac Apple Silicon et Intel avec macOS 13 ou plus récent.
- Au premier démarrage, Ollama s’installe et les modèles adaptés à votre Mac se téléchargent tout seuls.

### Mises à jour
- L’app téléchargée se met à jour toute seule depuis les Releases GitHub : elle télécharge la nouvelle version avec une barre de progression, se remplace et se rouvre sur la nouvelle version. Ni git ni compte GitHub nécessaires.
- Chaque nouvelle version est construite et publiée automatiquement par GitHub dès qu’elle est taguée.
- Une app construite depuis un dossier de code continue à se mettre à jour avec git.

### Autres
- L’app téléchargée lit des réglages facultatifs du serveur dans un fichier .env de son dossier de données.

## 0.15.0 · 4 octobre 2026

### Profils
- Les Réglages ont des profils : chacun avec ses kinks, son historique, ses sources et ses réglages. L’IA locale est partagée.
- Un nouveau profil s’ouvre avec les étapes d’accueil ; passez d’un profil à l’autre d’un clic (Undercurrent redémarre sur l’autre).
- Renommez les profils, donnez-leur une couleur, sauvegardez-les, restaurez une sauvegarde comme nouveau profil et supprimez ceux dont vous n’avez plus besoin.

### Choisir les modèles d’IA
- Pour chaque tâche (taguer, regarder de plus près, l’assistant), Undercurrent recommande le modèle qui convient à ce Mac, d’après sa puce et sa mémoire, et montre ce qu’il faut pour chaque autre option.
- Choisissez-en un autre, ou tapez n’importe quel modèle connu d’Ollama. Le même choix se trouve dans Réglages, Modèles d’IA locale.

### Tout se télécharge tout seul
- Au premier démarrage, Ollama s’installe automatiquement s’il manque.
- Les modèles se téléchargent dès que vous les avez choisis, pendant que vous parcourez le reste des étapes d’accueil.
- Les téléchargements interrompus reprennent tout seuls au démarrage suivant.

### Qui vous voyez
- Le curseur démarre à 50 %. De 45 % à 65 %, il signifie hétéro uniquement : un homme et une femme ensemble.
- Nouvelle option « Tout le monde » : des publications avec n’importe qui, quoi qu’indique le curseur.
- Le curseur des étapes d’accueil est centré, avec la zone hétéro marquée dessus.

### Corrections
- La recherche de mises à jour utilise la clé de ce Mac pour le dépôt.

## 0.14.0 · 4 octobre 2026

### Une vraie app Mac
- Undercurrent est maintenant une app que vous ouvrez depuis Applications ou le Dock, avec sa propre icône et ses menus.
- Elle lance tout ce dont elle a besoin : le serveur, Ollama et les modèles locaux.
- Quitter l’app (ou fermer sa fenêtre) arrête le serveur, décharge les modèles et quitte Ollama.
- Vos données sont dans ~/Library/Application Support/Undercurrent, à part du code. Les mises à jour et les nouveaux téléchargements n’y touchent jamais. Le premier démarrage y copie vos données existantes ; l’ancienne copie reste comme sauvegarde.
- Les liens vers d’autres sites s’ouvrent dans votre navigateur habituel ; les vidéos continuent de se lire dans l’app.

### Étapes d’accueil
- Un accueil en huit étapes au premier démarrage : ce qu’est Undercurrent, l’IA locale, qui vous voulez voir, vos kinks, vos fantasmes, vos sources et vos limites.
- L’étape de l’IA locale installe Ollama s’il manque et télécharge les modèles avec la progression en direct. Sur les Mac avec moins de 32 Go de mémoire, l’assistant utilise le modèle 9B.
- Le choix des kinks montre chaque famille dans sa couleur, avec des suggestions « qui va bien avec » en direct.
- Les fantasmes sont écrits par le modèle local à partir de vos choix (de simples associations quand le modèle n’est pas encore prêt), et vous pouvez ajouter les vôtres.
- Les sources sont classées de la plus populaire à la moins populaire.
- Vous pouvez relancer l’accueil depuis les Réglages.

### Mises à jour via GitHub
- Undercurrent vérifie toutes les quelques heures s’il existe une version plus récente sur GitHub et affiche un bouton « Mettre à jour vers … » s’il y en a une.
- La mise à jour montre les notes de version, installe la nouvelle version, reconstruit l’app et redémarre toute seule.
- Après une mise à jour, « Nouveautés » s’affiche une fois. Les Réglages montrent la version, un bouton de vérification et tout l’historique des changements.

### Autres
- Plus aucun nom de personne dans le code ni dans les tests.

## 0.13.0 · 4 octobre 2026

### Kinks reconstruits
- Un kink est désormais une chose précise à laquelle vous revenez, prouvée par la chaleur, les j’aime et les enregistrements sur plusieurs jours, et nettement plus fréquente dans ce que vous adorez que dans tout ce que vous voyez. Les tags présents presque partout (big cock, gay, cumshot) ne deviennent jamais des kinks.
- Des noms simples tirés des tags eux-mêmes ; toutes les orthographes sont réunies en un seul kink ; les doublons sont fusionnés.
- Les familles (Corps, Origines, Vêtements…) apparaissent dès que deux kinks en partagent une ; les kinks d’une même famille partagent sa couleur.
- Les kinks se mettent à jour tout seuls ; ce que vous changez à la main reste.
- Les kinks sont passés de Mémoire à Votre carte : un tableau complet, la même vue détaillée qu’en cliquant sur la carte, fusionner, colorer, regrouper, retirer, faire revenir.
- Les interactions récentes montrent une miniature et ouvrent la publication.

### Tags
- Le coup d’œil rapide sur les images ne recopie plus ses propres exemples de tags (il mettait « shower » sur un tiers de tout) ; des milliers de ces tags inventés ont été retirés.
- Les IA qui taguent ne taguent que ce qu’une publication dit ou montre.
- Les publications peuvent être ajoutées à un kink ou en être retirées à la main.

### Petites choses
- Une chaleur de deux flammes ou plus donne aussi un vote positif à la publication.
- Les noms « Dans cette vidéo » n’ont plus de @ ; un bouton de recherche quand une personne est introuvable ; les panneaux ouverts défilent jusqu’à être visibles ; les fenêtres enregistrées sont bien plus rares.

## 0.12.0 · 29 septembre 2026

- Prise en charge d’un serveur de scraping (Lustpress) pour XVideos, XNXX, xHamster, YouPorn et TXXX, combiné aux API officielles de Pornhub, RedTube et Eporner.
- Les profils de toutes les sources dans la recherche, triés par audience.
- Corrections des fenêtres : pas d’aperçus en pleine taille sous 90 %, les carrousels montrent la publication suivante, les images d’aperçu défilent dans les fenêtres, jamais deux fois la même image.
- Des choix « En ce moment » avec leur type, une ligne « Affichage » sous la barre de recherche, un onglet Enregistrés, un chargement plus calme pendant le défilement.
- Les compteurs seulement quand la source en a ; un « Pourquoi ceci » plus précis.

## 0.11.0 · 29 septembre 2026

- Recherche de personnes sur toutes les sources avec correction des fautes de frappe, une section de profils, « Dans cette vidéo ».
- Démarrage en une commande qui lance et arrête aussi les modèles locaux ; accès au réseau local limité aux réseaux privés.

## 0.10.0

- Recherche en direct sur plusieurs sources avec étapes, puces et un assistant capable de faire plusieurs actions.

## 0.1.0 à 0.9.0

- Le fil local : sources, tags par des modèles locaux, profil de goûts, fenêtres, carte, parcours, mémoire et fantasmes.
