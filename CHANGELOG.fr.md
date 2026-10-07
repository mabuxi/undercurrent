# Journal des changements

Toutes les versions d’Undercurrent, de la plus récente à la plus ancienne. L’app lit ce fichier quand le français est choisi ; une version sans notes ici s’affiche en anglais (CHANGELOG.md).

## 0.20.0 · 7 octobre 2026

### Filtres
- Les réglages du fil sont derrière un seul bouton Filtres, sur le Mac aussi, avec le nombre de filtres actifs. Les suggestions « En ce moment » restent visibles à côté.
- Chaque filtre reste réglé jusqu’à ce que vous le changiez, même après avoir fermé Undercurrent : formats, nouveau ou populaire et la période, la part de nouveautés, l’humeur, et si le panneau est ouvert.
- Les filtres s’appliquent aussi aux recherches : l’équilibre femmes et hommes, les formats, nouveau ou populaire. Seule une recherche qui dit qui elle veut, ou qui cherche une personne, ignore l’équilibre.
- À la fin d’une recherche avec des filtres, « Retirer les filtres pour trouver plus de résultats » montre la même recherche sans eux, pour cette recherche seulement.

### Recherche
- La réponse de l’assistant prend la place de la ligne sous la salutation (« Ce soir, le fil penche vers… »), dans la même taille, et la page défile jusqu’à elle.
- Une recherche n’ajoute plus de publications « en allant plus loin » après une que vous avez aimée : elle montre ce que vous avez cherché.
- « Gay pour les fans » (gay for pay) est un kink à part entière, aussi dans les recherches en français.

### Vidéos
- Double-cliquez sur un lecteur d’un autre site pour aimer la publication, comme un double toucher sur une image.
- Nouveau bouton plein écran sur les vidéos : la vidéo entière tient toujours à l’écran, jamais rognée. Pincez pour zoomer sur l’iPhone et le trackpad du Mac, ou ctrl et la molette, touchez deux fois pour zoomer ou dézoomer, faites glisser pour vous déplacer. Sur le Mac, c’est le vrai plein écran.

### Créateurs
- Le panneau d’un créateur ou d’un performeur montre ses meilleures publications en images : ce qui est ici plus ce qui est récupéré sur la source à ce moment-là, les plus votées et vues d’abord.
- « Tout trouver de… » devient « Rechercher… ».
- Bloquer un créateur ou un performeur : plus fort que masquer une publication. Tout ce qui vient de lui est masqué, aussi ce qui arrive plus tard, et le plus grand modèle regarde plusieurs de ses publications ensemble pour apprendre ce qui ne vous a pas plu. Les créateurs bloqués se débloquent dans Mémoire.
- Chaque petit bouton de l’app a maintenant une icône.

### Mémoire
- Nouvelle section « Pas aimé » : ce que le plus grand modèle a trouvé après les masquages, pouces baissés et blocages, sans ce que vous aimez. Seuls les tags qui comptent encore contre les publications s’affichent, avec leur fréquence ; touchez × si ce n’était pas ça, et c’est annulé.
- De nouvelles suggestions de souvenirs arrivent d’elles-mêmes toutes les deux sessions, et celles sans réponse laissent la place après une semaine.
- Environ toutes les dix fenêtres, un souvenir à valider s’intercale, deux au plus par session.
- Les souvenirs anciens, ceux qui n’étaient peut-être qu’une passade et ceux dont les tags ont refroidi sont redemandés : « Toujours vrai ? ». Jamais les souvenirs épinglés ni vos limites.
- Idées de fantasmes : quatre au plus, une nouvelle série toutes les deux sessions.
- Tout ce que vous avez fait : aimer une publication plusieurs fois compte une fois et s’affiche une fois ; la chaleur montre son niveau actuel.

### Fil et fenêtres
- La fenêtre des enregistrements vient bien moins souvent : jamais dans les vingt premières fenêtres, au plus une fois sur soixante et une fois toutes les deux heures.
- Des miniatures plus grandes dans les fenêtres en liste.

### Premiers pas
- Les kinks à choisir sont plus variés : hétéro d’abord, avec du gay et du lesbien.
- Chaque choix ajoute ses propres kinks liés à « Va bien avec », et ils restent, donc la liste grandit à mesure que vous cliquez.

### Corrections
- Sur un téléphone, les filtres que vous gardez n’étirent plus la barre du haut ; ils sont dans le bouton Filtres et la ligne Affichage.
- Changer de vue ouvre la nouvelle vue en haut.
- La fin d’une recherche ne laisse plus un écran vide, et ses boutons sont plus lisibles.
- Les textes parmi les images d’un créateur affichent leur titre au lieu d’une case vide.

## 0.19.2 · 6 octobre 2026

### Mode test
- Maintenez Option en ouvrant Undercurrent pour l’ouvrir en mode test : de fausses publications avec des images de remplacement et des extraits d’exemple, un faux modèle, rien d’explicite. C’est le même mode que celui utilisé pour développer et tester Undercurrent.
- Le mode test a son propre dossier de données et son propre port : vos vraies données, votre fil, vos goûts et l’IA locale ne sont jamais touchés, et il peut tourner à côté de l’app normale.
- Il s’ouvre directement sur le fil, dans votre langue. L’icône du Dock affiche « Test », le titre de la fenêtre et l’écran de démarrage l’indiquent, et la page affiche une ligne jaune de mode test.
- Le menu Undercurrent propose « Redémarrer en mode test », et en mode test « Redémarrer normalement » et « Réinitialiser les données de test ».
- L’app téléchargée contient maintenant les deux courts extraits d’exemple que lit le mode test.

## 0.19.1 · 6 octobre 2026

### Retour au style d’origine
- « J’aime » et « je n’aime pas » retrouvent leur couleur d’origine, sans dégradé : actifs, ils sont un peu plus lumineux, sur un fond doux et uni de la même couleur.
- Les réactions au milieu d’une publication utilisent les mêmes icônes au trait que les boutons en dessous, juste plus grandes et plus épaisses, sur un petit disque en verre dépoli comme la barre d’onglets. La flèche se dessine, rebondit et monte (ou descend pour « je n’aime pas ») ; le marque-page se remplit ; l’œil se barre ; annuler fait disparaître un contour plus petit.
- La flamme de chaleur au milieu est la flamme du curseur, dans les mêmes couleurs, sur le même disque : elle grandit et brille avec la chaleur, s’embrase quand vous relâchez et s’éteint à zéro.
- Les réactions s’affichent au milieu de la partie visible de la publication.
- La mémoire garde sa nouvelle organisation, mais avec les cartes unies habituelles de l’app : plus de voiles colorés, la couleur seulement sur les petites icônes.

### iPhone
- Touchez deux fois une image ou une vidéo pour l’aimer, comme sur Instagram. Un seul toucher sur une image l’ouvre toujours, un instant plus tard.
- Une publication plus haute que l’écran se parcourt librement : tant qu’elle est en haut, le fil ne s’aimante que près de sa fin ou de la publication suivante.
- Le bouton « plus de tags » est maintenant une pastille « +N » propre, dans le même style que « + kink », après la ligne de tags, qui s’estompe doucement au lieu de cacher des pastilles sous un bouton.

### Corrections
- Les collections d’images avec une grande image et des petites ne débordent plus sur les tags en dessous sur un téléphone.

## 0.19.0 · 5 octobre 2026

### Réagir à une publication
- Aimer une publication fait monter une grande flèche rebondissante au milieu, comme un « j’aime » sur Instagram. Ne pas aimer fait la même flèche à l’envers, qui descend.
- Enregistrer fait tomber un marque-page doré dans la publication ; retirer un enregistrement, un « j’aime » ou un « je n’aime pas » joue un petit contour qui s’efface.
- Faire glisser la barre de chaleur met une flamme au milieu de la publication, qui grandit, se réchauffe et vacille plus vite à mesure que vous montez. En relâchant, elle s’embrase avec des étincelles ; remise à zéro, elle s’éteint en fumée.
- Masquer une publication affiche un œil barré, la publication s’assombrit puis s’efface.
- « J’aime » et « je n’aime pas » ont maintenant un fond coloré quand ils sont actifs : vert pour aimer, rouge pour ne pas aimer.

### Du mouvement partout
- Les publications, cartes, vues, panneaux, messages et fenêtres arrivent avec des animations douces et courtes ; les boutons s’enfoncent un peu quand on appuie ; la barre de recherche s’illumine quand vous écrivez.
- Sur un téléphone, la pastille claire de la barre d’onglets glisse d’un onglet à l’autre.
- Tout respecte le réglage « Réduire les animations » du Mac ou de l’iPhone : s’il est activé, les animations sont retirées.

### Mémoire
- « Tout ce que vous avez fait » passe de Votre carte à Mémoire, sans changement.
- La mémoire est organisée : des compteurs en haut (souvenirs, à valider, épinglés, fantasmes), une barre pour aller à chaque section, et une section « À valider » qui rassemble toutes les suggestions.
- Chaque catégorie a sa couleur et son icône, les catégories vides tiennent sur une ligne avec un bouton d’ajout rapide, et la catégorie se choisit avec des pastilles colorées quand vous ajoutez un souvenir.
- Les fantasmes s’affichent en cartes.

### Fil
- Le fil penche davantage vers ce qui est populaire en ce moment : chaque publication est comparée aux autres publications de sa propre source, sur l’accueil reçu et sur la vitesse à laquelle elle monte. Les publications qui décollent et vous correspondent arrivent environ toutes les cinq publications.
- Les publications que presque personne n’a aimées arrivent moins souvent, sauf si elles correspondent bien à vos goûts. Les découvertes privilégient des nouveautés que d’autres ont aimées. Vos goûts passent toujours en premier.
- N’afficher que certaines sources (« seulement bluesky ») garde le même classement que le fil normal, et va chercher davantage sur ces sources en arrière-plan : ce qui y est populaire et des recherches sur vos tags les plus forts.

### iPhone
- Les boutons moins utilisés d’une publication (demander, pourquoi ceci, enregistrer, moins comme ça, ouvrir) sont dans un menu ⋯ sur la même ligne que les autres.
- Les kinks et les tags tiennent sur une ligne ; la flèche au bout les affiche tous.

## 0.18.1 · 5 octobre 2026

### iPhone
- Le nom Undercurrent reste en haut sur un téléphone, en petit, sur la même ligne que la recherche. Le bouton de recherche devient une flèche pour faire de la place.
- Les images et les vidéos sont aussi grandes que possible tout en restant entièrement à l’écran. Le reste de la publication (tags, boutons) peut dépasser en bas : faites défiler un peu pour le voir, et en dépassant la fin de la publication, le fil s’aimante sur la suivante.

## 0.18.0 · 5 octobre 2026

### Sur votre iPhone
- Un bouton téléphone en haut affiche un code QR : scannez-le avec l’appareil photo de l’iPhone pour ouvrir Undercurrent depuis le Mac sur votre téléphone (même Wi-Fi). Il utilise le fil, les goûts et l’IA locale du Mac.
- Le code est une clé : seuls les appareils qui l’ont scanné peuvent entrer, personne d’autre sur le même Wi-Fi. « Oublier tous les téléphones associés » crée un nouveau code.
- Ajoutez-le à l’écran d’accueil et il s’ouvre en plein écran comme une app, avec sa propre icône (prise en charge des web apps sur iOS).
- Sur un téléphone, les vues sont une barre d’onglets flottante et givrée en bas, comme sur iOS : Fil, Enregistrés, Votre carte, Mémoire, Réglages.
- Le fil s’aimante de publication en publication, une à la fois. Chaque publication tient dans l’écran, avec l’image ou la vidéo aussi grande que possible. Les longs récits commencent plus courts et s’ouvrent avec « Continuer la lecture ».
- Une fenêtre apparaît toutes les 3 à 5 publications.
- La barre du haut tient sur une seule ligne fine, et les réglages du fil se replient derrière « Régler le fil ».

### Recherche
- Nommez des sources dans la barre de recherche pour ne voir qu’elles pendant un moment : « only bluesky », « bluesky, reddit », « seulement reddit ». Elles apparaissent comme une puce que vous pouvez retirer.
- Une recherche, un clic sur un tag ou un changement de filtre fait défiler jusqu’au début du fil, avec une ligne qui dit ce qui est affiché et combien de publications correspondent.
- Les filtres et les tags de recherche sont sur une seule ligne avec le même style : un tag cliqué ne saute plus à côté des tags de recherche.

### Apprentissage
- Retirer un j’aime, un enregistrement ou de la chaleur annule exactement ce que cela avait appris à votre fil. Une chaleur ramenée sous deux flammes retire aussi le vote positif qu’elle avait donné.
- Masquer ou ne pas aimer une publication : les tags que vous aimez déjà ne sont pas touchés, et le plus grand modèle local regarde la publication (des images de la vidéo quand il peut) pour trouver ce qui ne vous a probablement pas plu. Ce qu’il trouve s’affiche sous la publication, et vous pouvez retirer chaque raison avec ×.

### App Mac
- La fenêtre se déplace en faisant glisser la barre du haut, et un double-clic l’agrandit, comme une vraie barre de titre.
- Les boutons de la fenêtre ne cachent plus le nom Undercurrent ; la ligne « Navigateur local » en dessous a disparu.
- L’état de l’IA locale est un petit point à gauche de la barre de recherche : cliquez ou survolez-le pour les détails.
- Ollama démarre caché en arrière-plan et ne vous gêne plus.

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
