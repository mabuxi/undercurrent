# Journal des changements

Toutes les versions d’Undercurrent, de la plus récente à la plus ancienne. L’app lit ce fichier quand le français est choisi ; une version sans notes ici s’affiche en anglais (CHANGELOG.md).

## 0.23.0 · 10 octobre 2026

### Plein écran sur téléphone
- Un sélecteur en haut : Court (vidéos courtes, GIF et images), Mélangé et Long. C’est le même que le filtre de format du fil, donc le plein écran et le fil montrent toujours la même chose. Balayez vers la gauche ou la droite sur un post pour passer au mode suivant. Une nouvelle session commence sur Mélangé sauf si vos filtres disent autre chose ; avec d’autres filtres (une recherche, des tags, un kink...), aucun mode n’est allumé.
- Ce sur quoi le fil est filtré (une recherche, des tags, un kink...) s’affiche en puces en haut du plein écran, chacune avec un ×, plus Tout effacer pour revenir au plein écran normal sans le quitter.
- Un + sous la photo à droite suit la personne qui a publié (ou la personne dans la vidéo quand le site ne dit pas qui a publié) ; une coche montre que vous la suivez déjà, touchez-la encore pour ne plus suivre.
- Les personnes dans une vidéo montrent maintenant leur photo (photos des performeurs, ou la photo de profil des sites qui en ont une) au lieu d’une icône générique.
- Tous les boutons sur la vidéo ont le même aspect transparent.
- Maintenir le côté d’une vidéo pour l’accélérer ne fait plus défiler vers un autre post quand votre doigt bouge.

### Fil
- Les vidéos du fil sont laissées au lecteur du téléphone ou du navigateur partout : plus de toucher pour mettre en pause ni de double toucher pour liker sur les vidéos (c’était bogué). Les images gardent le double toucher pour liker.
- Sur téléphone, le bouton plein écran se place juste sur le bouton plein écran du lecteur (en haut à gauche), donc les deux ouvrent le plein écran.

### Kinks sur la carte
- Les kinks s’affichent deux par ligne sur téléphone, chacun avec un bouton modifier.
- La page d’un kink est réorganisée : un grand « Voir dans le fil », puis Approfondir, Explorer autour et Du nouveau tout près en tuiles, puis Modifier, Combiner, Masquer et Retirer en plus petits boutons. Combiner est maintenant avec les autres actions et montre les kinks à choisir.
- Les tags et le groupe sont juste sous les actions. « Va souvent avec » devient « Ajoutez des tags au kink pour l’améliorer », dans son propre encadré mis en avant.
- La couleur à côté du nom est un simple point de couleur (touchez-le pour changer la couleur), au lieu de l’icône bizarre d’avant. Changer la couleur n’enregistre plus à chaque pas du sélecteur.
- « Tous les kinks » flotte en haut pour toujours revenir facilement.
- Sur téléphone, les petits widgets se mettent deux côte à côte ; l’assistant, les meilleures correspondances et les interactions récentes prennent toute la largeur.
- Corrigé : combiner deux kinks garde maintenant toujours tous les tags des deux. La page d’un kink ne montrait que les 8 premiers tags, et ajouter ou retirer un tag là n’enregistrait que ces 8, donc des tags d’un kink combiné pouvaient se perdre.

### Carte
- Sur téléphone, un doigt fait défiler la page au-delà de la carte (un toucher ouvre toujours un cercle) ; deux doigts déplacent et zooment la carte. Glisser de côté avec un doigt montre comment faire.

### Sources
- Toutes les quelques publications vues, les sources automatiques sont ajustées tout de suite au lieu d’une fois par heure : les sources dont vous avez passé les cinq ou six dernières publications se mettent au repos, des sources pour ce qui vous plaît en ce moment sont ajoutées ou réveillées et récupérées aussitôt, et quand le fil se répète ou que rien ne vous plaît, il ajoute des recherches pour d’autres choses que vous aimez et qui n’étaient pas à l’écran récemment. Les sources que vous suivez vous-même ne sont jamais modifiées.
- Les sources et recherches automatiques ramènent maintenant surtout ce qui est populaire cette semaine, pour des publications meilleures et plus fraîches au lieu des mêmes ou de nouvelles de faible qualité.

## 0.22.2 · 9 octobre 2026

### Plein écran sur téléphone
- Les vidéos restent de nouveau au milieu de l’écran, sous les boutons (le changement de la 0.22.1 qui plaçait les vidéos larges au-dessus des boutons est annulé).
- Les vidéos d’une minute ou plus ont une petite rangée sous la vidéo : −15 secondes, le lecteur plein écran du téléphone, +15 secondes.
- Maintenir le côté d’une vidéo d’une minute ou plus la lit en 5x au lieu de 2x ; les vidéos plus courtes restent en 2x.
- Le fond derrière un post prend les couleurs de ce qui est lu (ou de l’image), et change en douceur avec la vidéo.
- Pendant que vous faites défiler le plein écran, le fil derrière suit, donc en fermant vous revenez sur le même post avec tout ce qui est au-dessus déjà chargé.

### Fil sur téléphone
- Un toucher sur une vidéo du fil la met de nouveau en pause ou la relance ; le plein écran ne s’ouvre plus qu’avec le bouton plein écran, ou quand vous passez en plein écran avec le bouton du lecteur.
- Les lecteurs d’autres sites dans le fil ont aussi un bouton plein écran. Les vidéos Pornhub, RedTube, YouPorn et Eporner se lisent maintenant aussi dans le fil avec le lecteur du téléphone (le lecteur du site reste la solution de secours).
- Corrigé : un lecteur pouvait s’arrêter tout seul juste après avoir appuyé sur lecture quand le fil le remplaçait par un autre lecteur.
- Les tags, les kinks et le × qui retire un tag ne réagissent plus quand votre doigt s’y pose pour arrêter ou lancer un défilement ; seul un vrai toucher compte. Pareil dans le plein écran.

### Comment ce que vous regardez compte
- Le temps passé à regarder compte maintenant d’autant plus qu’il est long, sans s’arrêter à un tout petit maximum : environ 0,6 point pour 9 secondes, 1,5 pour 30 secondes, 2,3 pour une minute, 3,2 pour deux minutes, 4,4 pour cinq et 5,4 pour dix. Avant, 9 secondes et 2 minutes donnaient toutes les deux 0,3. Plusieurs visites du même post s’additionnent en temps total.
- Un like, une sauvegarde ou de la chaleur comptent d’autant plus que vous aviez regardé longtemps : la moitié après un coup d’œil, en entier après deux minutes. Le temps regardé après le like le complète de la même façon, donc l’ordre ne change rien. Un dislike compte toujours en entier tout de suite.
- Regarder jusqu’au bout et les boucles comptent moins qu’avant (le temps lui-même porte ça maintenant).
- Vos goûts et votre historique sont recalculés une fois avec les nouveaux poids à la mise à jour.

## 0.22.1 · 9 octobre 2026

### Plein écran sur téléphone
- Les vidéos Pornhub, RedTube, YouPorn et Eporner se lisent maintenant dans le lecteur du téléphone : le Mac récupère le fichier vidéo derrière le lecteur du site et le transmet (ces liens ne marchent que depuis le Mac qui les a demandés). Les lecteurs des sites restaient souvent noirs sur iPhone. Ces vidéos démarrent maintenant toutes seules comme les autres, se mettent en pause d’un toucher, se parcourent, se zooment et s’accélèrent. Quand le fichier est introuvable, le lecteur du site est utilisé comme avant. Pornhub donne des fichiers jusqu’à 480p de cette façon, Eporner jusqu’à 1080p, RedTube un flux.
- Les lecteurs d’autres sites qui chargent encore dans leur propre lecteur reçoivent la demande de lecture automatique.
- Les vidéos larges et les lecteurs d’autres sites se placent au-dessus des boutons de droite au lieu d’être dessous : la vidéo tient dans l’espace entre les boutons du haut et la colonne de boutons.
- La chaleur est maintenant un curseur vertical : un toucher sur la flamme la déploie en curseur vers le haut, ou maintenez la flamme et glissez vers le haut pour régler la chaleur tout de suite ; en relâchant, elle est gardée.
- Maintenez le côté gauche ou droit d’une vidéo pour la lire en 2x tant que vous maintenez ; un badge 2x s’affiche en haut. (Impossible dans le lecteur d’un autre site, donc ça marche sur toutes les vidéos que le téléphone lit lui-même.)
- Le bouton avec l’image ouvre maintenant toujours quelque chose : sur les vidéos de sites qui ne disent pas qui les a mises en ligne, un panneau l’explique et propose seulement les publications de ce site et la page d’origine, plus les personnes dans la vidéo.
- Le panneau de profil est pensé pour le téléphone : nom plus grand, statistiques en tuiles, tags sur une ligne, publications sur trois colonnes, boutons sur deux colonnes.
- L’ombre sombre sur la vidéo est plus légère.

### Lecteurs d’autres sites
- La note sous un lecteur en cours (« Le lecteur reste noir ? Le charger sans le bloqueur ») a disparu. « Charger sans le bloqueur de contenu » (et le réactiver) se trouve maintenant dans le menu ⋯ de la publication, dans le fil sur Mac et sur téléphone, et dans le panneau ⋯ de la visionneuse plein écran.

## 0.22.0 · 9 octobre 2026

### Plein écran sur téléphone
- Le plein écran est maintenant une visionneuse façon TikTok : une publication remplit l’écran, un glissement vers le haut ou le bas passe à la suivante ou à la précédente, sans fenêtres entre elles et sans la barre d’onglets. Toucher une vidéo dans le fil l’ouvre aussi, également pour les lecteurs d’autres sites.
- Tout ce qu’une publication permet reste là : j’aime (un double-tap n’importe où aussi), je n’aime pas, chaleur, commentaires, enregistrer et le menu ⋯ dans une colonne à droite ; qui l’a publiée, le titre (toucher pour le texte entier) et une ligne de kinks et de tags en bas. Profils, commentaires, « Pourquoi ça », l’assistant, tous les kinks et tags (pour en ajouter ou en retirer) s’ouvrent dans un panneau qui glisse vers le haut.
- Un toucher met en pause ou relance, une fine ligne en bas montre où en est la vidéo et se fait glisser pour sauter, pincer zoome (glisser pour se déplacer, double-tap pour revenir). Un seul bouton de son en haut pour toutes les vidéos.
- Les lecteurs d’autres sites jouent directement dans la visionneuse ; glissez en dehors du lecteur pour continuer.
- D’autres publications se chargent avant la fin, ce que vous aimez ou enregistrez dans la visionneuse apparaît aussi dans le fil, le geste retour la ferme, et le fil vous attend sur la dernière publication vue. Rien dans le fil ne joue ni ne compte de temps derrière.

### Fantasmes
- Les fantasmes suggérés ont « Affiner » et « Régénérer », dans les premiers pas, dans Mémoire et dans les fenêtres de fantasmes du fil. Affiner ouvre les tags du fantasme : retirez-en, écrivez-en de nouveaux, puis « Mettre à jour l’histoire » la réécrit autour d’eux. Régénérer écrit une autre histoire avec les mêmes tags.
- Écrire votre propre fantasme : des tags sont proposés pendant que vous écrivez (ce que les mots disent tout de suite, ce que l’IA y lit quand vous faites une pause) ; choisissez ceux qui conviennent ou écrivez les vôtres. Les fantasmes que vous écrivez ou façonnez vous-même comptent toujours comme au moins 90 % de correspondance.
- Nouveau : « Aller plus loin » dans n’importe quel fantasme, depuis sa fenêtre, Mémoire, la carte, ou une nouvelle fenêtre du fil qui pose déjà la première question. Un choix rapide à la fois (où, avec qui, ce qui se passe, l’ambiance, ce qu’ils portent, comment ça finit…), chaque choix montre combien de publications l’ont, et les publications suivent chaque réponse. À la fin, le fantasme est réécrit autour de tout ce que vous avez choisi : enregistrez-le comme nouveau fantasme, mettez l’ancien à jour, faites-en un kink ou voyez-le dans le fil.

### Voyages
- « Surprenez-moi » devient un voyage de découverte. Le grand modèle lit tout ce que vous avez fait et vous mène vers un genre de publication que vous n’avez jamais ouvert, juste à côté de ce que vous aimez. La destination n’est jamais inventée : c’est un vrai genre de publication d’ici qui apparaît avec ce que vous aimez bien plus souvent que le hasard, jamais ouvert, rien que vous n’ayez pas aimé, jamais de jeu de rôle familial. Vous y arrivez par quelques étapes que vous aimez déjà, chacune avec des publications qui ont les deux, et la destination reste une surprise jusqu’à la dernière étape.
- À la fin, vous dites si c’était pour vous : j’adore (ça devient un kink), peut-être (plus dans le fil, ou aller plus loin dedans), ou pas pour moi (les voyages n’y retournent jamais). Chaque voyage va ailleurs.
- Testé sur un vrai profil avec les vrais modèles locaux : le plan arrive en une vingtaine de secondes une fois le modèle chargé.

### La fenêtre Votre carte
- Elle alterne entre « en ce moment » (vos kinks en bulles, plus grandes quand ils vous attirent maintenant, avec ce qui monte ou baisse ; touchez-en une pour filtrer) et « à explorer ensuite » (des kinks voisins des vôtres jamais ouverts, chacun avec une publication à essayer, un toucher pour voir ses publications et + pour en faire un kink).

### Petites choses
- Je n’aime pas est bleu et enregistrer est jaune, dans les mêmes couleurs douces.
- Ouvrir un profil fait défiler plus bas, pour que le profil commence en haut de l’écran.
- Les premiers pas ne dépassent plus du bord droit d’un écran de téléphone.
- Sur téléphone, toucher une vidéo avec ses propres commandes est de nouveau pris en compte (ça n’arrivait jamais à l’app).

## 0.21.2 · 8 octobre 2026

### Premiers pas
- Idées de fantasmes : le grand modèle local avait souvent besoin de plus que ses 30 secondes (il doit d’abord se charger), donc les idées de secours, toutes semblables, s’affichaient. Il a maintenant 100 secondes, puis le modèle rapide prend le relais, et les idées s’écrivent en arrière-plan pendant l’animation de la plume. Si l’IA ne répond toujours pas, une ligne le dit, avec « Redemander à l’IA ».
- Les kinks de chaque idée de l’IA sont reconnus plus souplement (aussi en français, ou seulement cités dans la phrase), les bonnes idées ne sont plus jetées.
- Les idées de secours varient davantage : d’autres actes qui vont avec les vôtres (seulement ceux qui correspondent à qui vous voulez voir), et deux façons de dire les plus courants.
- Suggestions de kinks : l’IA avait pour consigne d’éviter tout ce qui existait dans chaque famille, même ce qui était caché derrière « + plus », donc la plupart de ses réponses étaient écartées. Seul ce qui est à l’écran compte maintenant ; on lui en demande plus, et une seconde fois quand elle se répète. Les réponses qui arrivent après un autre choix sont gardées.
- L’animation d’écriture a une plume au lieu du crayon de modification.

## 0.21.1 · 8 octobre 2026

### Premiers pas
- Les suggestions viennent maintenant de l’IA locale : chaque choix lui en demande d’autres dans cette famille et dans d’autres qui vont avec, avec les kinks tout prêts comme exemples à ne pas répéter. Ce qu’elle renvoie est vérifié : un vrai kink dans une famille qui existe, rien de déjà affiché, rien de vague, rien sur l’âge, la famille, les animaux ou le non-consentement. La famille où vous avez cliqué montre quand elle réfléchit. Sans l’IA (encore en téléchargement, ou passée), les suggestions toutes prêtes sont utilisées.
- « En générer plus » demande à l’IA d’autres kinks de cette famille de la même façon ; sans elle, le reste des kinks tout prêts de la famille.
- Les kinks de l’IA retrouvent le contour en pointillés, aussi une fois ajoutés, jusqu’à ce que vous les choisissiez. Ce que vous choisissez reste toujours visible dans sa famille.
- Les pays sous un continent n’ont plus le petit coin.
- Les idées de fantasmes redeviennent une seule phrase courte et explicite, comme une description de scène plutôt qu’une histoire : un lieu précis, quelqu’un, l’acte et un frisson tiré de vos choix. Les kinks utilisés s’affichent dessous, ici et dans Mémoire. L’IA locale reçoit la même consigne.

### Vidéos
- Les lecteurs d’autres sites n’ont plus aucun j’aime au clic ou au double clic : chaque clic est pour le lecteur.

### Coulisses
- La construction des versions utilise les versions Node 24 de ses actions GitHub, GitHub n’avertit plus pour Node 20.

## 0.21.0 · 8 octobre 2026

### Barre de recherche
- Ce que le fil affiche (filtres et tags de recherche) se trouve dans la barre de recherche, avant ce que vous tapez, sur autant de lignes que nécessaire. Le × efface tout. Sur téléphone, ils restent sous la barre.
- La puce « Tout effacer » disparaît : le × fait la même chose.
- Ce qu’une recherche a fait tient en une ligne de résumé : ce qui a été cherché et où, avec ce qui a été trouvé. Survolez la barre, ou tapez dedans, et toutes les étapes se déplient.

### Fil
- Quelqu’un que vous suivez et qui publie beaucoup n’inonde plus le fil : par session, sa publication la plus populaire que vous n’avez pas vue, ou deux si vous aimez ses publications.
- Les publications populaires doivent vous correspondre au moins autant que la plupart de votre fil ; l’attention ne départage qu’entre celles-là.
- Le nom d’une source (Pornhub, RedTube, etc., utilisé quand une publication n’a pas d’auteur) n’est jamais pris pour un créateur ou une communauté : ni dans les suggestions En ce moment, ni dans ce que vous aimez.
- Les publications marquées [OC], (OC), [OG], (OG), « OC: » ou « OG: », ou avec un tag OC, reçoivent le badge Contenu original en haut à droite, et la mention disparaît du titre et des tags. Les publications déjà là aussi.

### Publications
- Survolez un tag d’une publication et un × apparaît : retirez un tag qui ne correspond pas. Il reste retiré de cette publication, ne compte plus pour vos goûts depuis elle, et le tagueur en est informé pour l’utiliser plus prudemment.
- Lecteurs d’autres sites : un j’aime demande deux clics rapides ; un lecteur qui prend le focus de lui-même ne compte plus.
- Les profils de créateurs et de performeurs ont « Rechercher {nom} » avec une loupe, au lieu de « Seulement ce créateur dans le fil ». « Ajouter … comme source » disparaît : suivre quelqu’un le fait déjà.

### Premiers pas
- La première étape montre l’icône d’Undercurrent.
- L’étape IA locale attend que les modèles soient téléchargés, lancés et répondent à une question test avant les kinks. « Continuer sans l’IA pour l’instant » reste disponible pour un long premier téléchargement.
- Les kinks suivent qui vous voulez voir : en hétéro, les types de femmes, d’hommes et de couples côte à côte ; pour les hommes seulement, aucun type féminin ni de couple ; pour les femmes seulement, aucun type masculin.
- Les origines commencent par les continents, Européens / Blancs compris ; choisissez-en un et ses pays et régions apparaissent dessous. Le kink d’un continent les couvre tous.
- Les suggestions ne font apparaître que des kinks pas encore à l’écran, quelques-uns par clic, aussi dans d’autres familles. Chaque famille garde au moins six choix non pris en vue.
- Chaque famille se termine par « En générer plus » : davantage de cette famille selon qui vous voulez voir et vos choix, par le modèle local quand il tourne.
- Les idées de fantasmes sont des mini histoires : un lieu difficile à trouver, quelqu’un, ce qui se passe, et un rebondissement qui ne vient que de vos choix. Chaque idée est sa propre histoire, avec quelques-uns de vos choix, pas tous. Pareil pour les idées de fantasmes dans l’app. Pendant l’écriture, une plume et des cartes se remplissent.

## 0.20.2 · 8 octobre 2026

### Fil
- Les fenêtres de mélange (« Abdos et Douche », « Abdos × Douche ») ne montrent que des publications qui ont les deux, jamais une seule. Une publication compte aussi quand son titre ou son texte le dit, avant que le regard approfondi l’ait taguée. Un mélange n’apparaît que s’il y a assez de publications avec les deux.
- La zone hétéro des curseurs femmes et hommes est centrée : de 45 % à 55 %, donc de 55 % de femmes à 55 % d’hommes. Elle est aussi marquée sur le curseur du fil.
- « Tout le monde, n’importe quel mélange » disparaît, des filtres du fil et des premiers pas. Si vous l’aviez activé, votre équilibre s’applique à nouveau.
- Après avoir masqué ou bloqué une publication, la page remonte vers la question sur ce que vous n’avez pas aimé, au lieu de sauter à la publication suivante.

### Recherche
- Ce que fait une recherche n’affiche que sa dernière ligne. Survolez-la (ou touchez-la) et les étapes précédentes se déplient au-dessus.

### Premiers pas
- La famille Bite est remplacée par Positions : missionnaire, levrette, chevauchée, chevauchée inversée, debout, 69, en cuillère, à plat ventre et jambes relevées. Les kinks de bite passent dans Corps.
- Les suggestions apparaissent dans leur propre famille, en premier, avec un contour en pointillés, au lieu d’une ligne à part.
- Chaque famille a une icône au lieu d’un point, et chaque étape a une grande icône au-dessus de son titre.
- Des animations discrètes partout : les éléments de chaque étape arrivent l’un après l’autre, les choix rebondissent, l’icône respire. Rien ne bouge quand le Mac demande moins d’animations.
- Les idées de fantasmes sont de vraies scènes (un lieu, quelqu’un, ce qui se passe), comme « Sous une douche brûlante, un inconnu musclé vous prend dans sa bouche », jamais les choix à la suite. Le modèle local reçoit la même consigne.

### Mémoire
- Ce que vous n’avez pas aimé se trouve maintenant dans Rédhibitoires et limites, toujours affiché et sur toute la largeur.
- Les cartes longues défilent à l’intérieur au lieu d’allonger la page.

### Réglages
- La fenêtre Nouveautés et mise à jour couvre toujours tout, aussi depuis les Réglages. Échap ou un clic à côté la ferme.
- Les recherches, créateurs et communautés d’une source : le nom a la place qu’il lui faut, avec ses étiquettes et la date de récupération en dessous. Les noms ne se coupent plus lettre par lettre.

## 0.20.1 · 8 octobre 2026

### Ce que vous n’avez pas aimé
- Après un pouce en bas, un masquage ou un blocage, la publication demande ce que vous n’avez pas aimé, avec ses tags comme choix (sans ceux que vous aimez). Seul ce que vous choisissez compte contre les publications semblables.
- Un pouce en bas ne fait que demander. Pour un masquage ou un blocage, le grand modèle regarde aussi et sa supposition est marquée parmi les choix, mais une supposition ne compte jamais seule.
- « Pas sûr », ou laisser la question : les suppositions attendent dans Mémoire, Pas aimé, sous À vérifier, jusqu’à ce que vous les confirmiez ou les retiriez.
- Corrigé : les raisons choisies après un pouce en bas n’apparaissaient pas sous Pas aimé.

### Recherche et filtres
- Une recherche ou un filtre affiche « Affichage : … » et le nombre de publications qui correspondent à la place de la ligne « Ce soir, le fil penche vers… ». La phrase générique « publications de vos sources » disparaît ; seules les sources qui n’ont pas répondu et les notes de recherche restent écrites.
- Nouvelle puce « Tout effacer » à côté des puces de recherche : efface la recherche et tous les filtres affichés en une fois.
- Les suggestions En ce moment se renouvellent avec les fenêtres latérales, aussi quand vous remontez en haut, et passent à chaque fois par plus de ce qui vous correspond.

### Vidéos
- Un double clic sur un lecteur d’un autre site ne compte comme un j’aime que si les deux clics sont rapides (en 0,3 s).
- Un double toucher sur une vidéo ne la met plus en pause : un toucher simple attend un instant avant de lancer ou de mettre en pause.

### Apparence
- Les humeurs sont de petites tuiles sur une seule ligne pleine (deux lignes pleines de trois sur téléphone), jamais avec un vide à la fin. L’indication s’affiche au survol.
- Le bouton Filtres et les puces de sous-tags dans les fenêtres sont moins arrondis, et ces puces restent sur une ligne au lieu de devenir de grands ovales.

### Tags
- Plus de tags par publication quand c’est sûr : chaque mot qui compte dans le titre, les tags du site et les hashtags, et ce que le titre veut clairement dire (« stepmom catches me » donne stepmom et caught).
- Les hashtags deviennent des tags, découpés en mots (#BigBalls donne big balls, #hairy_chest donne hairy chest), sans le bruit comme #fyp. Les publications déjà là les reçoivent aussi.

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
