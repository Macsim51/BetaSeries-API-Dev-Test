export const DEFAULT_ENDPOINTS = [
  {
    group: "Search",
    name: "Rechercher series, films, membres",
    method: "GET",
    path: "/search/all",
    description: "Recherche globale pratique pour trouver des IDs.",
    auth: false,
    query: [
      ["query", "Better Call Saul", "Texte recherche"],
      ["limit", "10", "Nombre de resultats"]
    ]
  },
  {
    group: "Search",
    name: "Rechercher une serie",
    method: "GET",
    path: "/search/shows",
    description: "Retourne les series correspondant au texte.",
    auth: false,
    query: [["title", "Dark", "Titre ou fragment"]]
  },
  {
    group: "Search",
    name: "Rechercher un film",
    method: "GET",
    path: "/movies/search",
    description: "Recherche de films.",
    auth: false,
    query: [["title", "Dune", "Titre ou fragment"]]
  },
  {
    group: "Shows",
    name: "Details d'une serie",
    method: "GET",
    path: "/shows/display",
    description: "Informations completes d'une serie par ID.",
    auth: false,
    query: [
      ["id", "1", "ID BetaSeries"],
      ["fields", "", "Ex: id,title,images.poster"]
    ]
  },
  {
    group: "Shows",
    name: "Episodes d'une serie",
    method: "GET",
    path: "/shows/episodes",
    description: "Liste des episodes d'une serie.",
    auth: false,
    query: [
      ["id", "1", "ID serie"],
      ["season", "", "Optionnel"]
    ]
  },
  {
    group: "Shows",
    name: "Saisons d'une serie",
    method: "GET",
    path: "/shows/seasons",
    description: "Resume des saisons.",
    auth: false,
    query: [["id", "1", "ID serie"]]
  },
  {
    group: "Shows",
    name: "Images d'une serie",
    method: "GET",
    path: "/shows/pictures",
    description: "Images disponibles pour une serie.",
    auth: false,
    query: [["id", "1", "ID serie"]]
  },
  {
    group: "Shows",
    name: "Genres series",
    method: "GET",
    path: "/shows/genres",
    description: "Liste des genres de series.",
    auth: false,
    query: []
  },
  {
    group: "Shows",
    name: "Series a decouvrir",
    method: "GET",
    path: "/shows/discover",
    description: "Suggestions de series.",
    auth: false,
    query: [
      ["limit", "10", "Optionnel"],
      ["offset", "0", "Optionnel"]
    ]
  },
  {
    group: "Shows",
    name: "Series du membre",
    method: "GET",
    path: "/shows/member",
    description: "Bibliotheque series du compte identifie.",
    auth: true,
    query: [
      ["id", "", "ID membre optionnel"],
      ["status", "", "Optionnel"]
    ]
  },
  {
    group: "Shows",
    name: "Ajouter une serie au compte",
    method: "POST",
    path: "/shows/show",
    description: "Ajoute ou met a jour une serie dans ton profil.",
    auth: true,
    query: [],
    body: [
      ["id", "", "ID serie"],
      ["status", "", "Optionnel"]
    ]
  },
  {
    group: "Shows",
    name: "Supprimer une serie",
    method: "DELETE",
    path: "/shows/show",
    description: "Retire une serie du compte identifie.",
    auth: true,
    query: [["id", "", "ID serie"]]
  },
  {
    group: "Episodes",
    name: "Details episode",
    method: "GET",
    path: "/episodes/display",
    description: "Details d'un ou plusieurs episodes.",
    auth: false,
    query: [["id", "", "ID episode ou liste"]]
  },
  {
    group: "Episodes",
    name: "Marquer un episode vu",
    method: "POST",
    path: "/episodes/watched",
    description: "Action membre sur un episode.",
    auth: true,
    query: [],
    body: [
      ["id", "", "ID episode"],
      ["bulk", "", "Optionnel"]
    ]
  },
  {
    group: "Episodes",
    name: "Retirer episode vu",
    method: "DELETE",
    path: "/episodes/watched",
    description: "Annule le marquage vu.",
    auth: true,
    query: [["id", "", "ID episode"]]
  },
  {
    group: "Episodes",
    name: "Episodes non vus",
    method: "GET",
    path: "/episodes/list",
    description: "Liste d'episodes du membre selon filtres.",
    auth: true,
    query: [
      ["showId", "", "Optionnel"],
      ["limit", "20", "Optionnel"]
    ]
  },
  {
    group: "Members",
    name: "Infos membre connecte",
    method: "GET",
    path: "/members/infos",
    description: "Profil du membre identifie.",
    auth: true,
    query: []
  },
  {
    group: "Members",
    name: "Badges membre",
    method: "GET",
    path: "/members/badges",
    description: "Badges d'un membre.",
    auth: true,
    query: [["id", "", "ID membre optionnel"]]
  },
  {
    group: "Members",
    name: "Options membre",
    method: "GET",
    path: "/members/options",
    description: "Options et preferences du compte.",
    auth: true,
    query: []
  },
  {
    group: "Planning",
    name: "Planning membre",
    method: "GET",
    path: "/planning/member",
    description: "Calendrier d'episodes du membre.",
    auth: true,
    query: [
      ["month", "", "YYYY-MM optionnel"],
      ["unseen", "", "Optionnel"]
    ]
  },
  {
    group: "Planning",
    name: "Planning general",
    method: "GET",
    path: "/planning/general",
    description: "Calendrier public.",
    auth: false,
    query: [
      ["date", "", "YYYY-MM-DD optionnel"],
      ["before", "", "Optionnel"],
      ["after", "", "Optionnel"]
    ]
  },
  {
    group: "Movies",
    name: "Details film",
    method: "GET",
    path: "/movies/movie",
    description: "Details d'un film par ID BetaSeries/TMDB/IMDB.",
    auth: false,
    query: [
      ["id", "", "ID BetaSeries"],
      ["tmdb_id", "", "ID TMDB optionnel"],
      ["imdb_id", "", "ID IMDB optionnel"]
    ]
  },
  {
    group: "Movies",
    name: "Film aleatoire",
    method: "GET",
    path: "/movies/random",
    description: "Retourne un film au hasard.",
    auth: false,
    query: []
  },
  {
    group: "Movies",
    name: "Films a decouvrir",
    method: "GET",
    path: "/movies/discover",
    description: "Suggestions de films.",
    auth: false,
    query: [
      ["type", "", "Optionnel"],
      ["limit", "10", "Optionnel"]
    ]
  },
  {
    group: "Movies",
    name: "Films du membre",
    method: "GET",
    path: "/movies/member",
    description: "Films ajoutes par le membre.",
    auth: true,
    query: [["id", "", "ID membre optionnel"]]
  },
  {
    group: "Movies",
    name: "Noter un film",
    method: "POST",
    path: "/movies/note",
    description: "Ajoute une note sur un film.",
    auth: true,
    query: [],
    body: [
      ["id", "", "ID film"],
      ["note", "", "Note"]
    ]
  },
  {
    group: "Movies",
    name: "Genres films",
    method: "GET",
    path: "/movies/genres",
    description: "Liste des genres de films.",
    auth: false,
    query: []
  },
  {
    group: "Friends",
    name: "Liste amis",
    method: "GET",
    path: "/friends/list",
    description: "Amis du membre identifie.",
    auth: true,
    query: []
  },
  {
    group: "Friends",
    name: "Demandes d'amis",
    method: "GET",
    path: "/friends/requests",
    description: "Demandes recues ou envoyees.",
    auth: true,
    query: []
  },
  {
    group: "Timeline",
    name: "Timeline membre",
    method: "GET",
    path: "/timeline/member",
    description: "Activite du membre.",
    auth: true,
    query: [
      ["id", "", "ID membre optionnel"],
      ["limit", "20", "Optionnel"]
    ]
  },
  {
    group: "Comments",
    name: "Commentaires",
    method: "GET",
    path: "/comments/comments",
    description: "Commentaires attaches a un objet.",
    auth: false,
    query: [
      ["type", "show", "show, episode, movie..."],
      ["id", "", "ID objet"]
    ]
  },
  {
    group: "Subtitles",
    name: "Derniers sous-titres",
    method: "GET",
    path: "/subtitles/last",
    description: "Derniers sous-titres indexes.",
    auth: false,
    query: [["language", "vf", "Optionnel"]]
  },
  {
    group: "Platforms",
    name: "Plateformes",
    method: "GET",
    path: "/platforms/list",
    description: "Plateformes SVoD disponibles.",
    auth: false,
    query: []
  },
  {
    group: "News",
    name: "Derniere news",
    method: "GET",
    path: "/news/last",
    description: "Dernieres actualites BetaSeries.",
    auth: false,
    query: []
  },
  {
    group: "Custom",
    name: "Endpoint libre",
    method: "GET",
    path: "/shows/display",
    description: "Modifie methode, chemin et parametres a la main.",
    auth: false,
    query: [["id", "1", "Exemple"]]
  }
];
