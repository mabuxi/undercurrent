import { lang } from './i18n.js';

// Fantasy ideas without the local model (it may still be downloading during the welcome steps): short stories built
// from what you picked, never the picks in a row. Each has a specific setting that is not easy to come by, someone,
// what happens, and a twist that only shows up when your picks call for it (public, getting caught, a straight guy,
// a partner watching). A story uses two to four of your picks, not all of them. English and French.
// Nothing about step family, non-consent or age.

// Each place has a calm version and a riskier one, used when you picked public or getting caught.
const PLACES = {
  shower: { en: [['in the steam room of a spa after closing', 'Spa after hours'], ['in a spa’s shared showers, where anyone could walk in', 'Spa showers']], fr: [['dans le hammam d’un spa après la fermeture', 'Spa après la fermeture'], ['dans les douches communes d’un spa, où n’importe qui peut entrer', 'Douches du spa']] },
  gym: { en: [['in the locker room after the last class of the night', 'Locker room'], ['in the gym’s sauna while the place is still open', 'Gym sauna']], fr: [['dans les vestiaires après le dernier cours du soir', 'Vestiaires'], ['dans le sauna de la salle de sport, encore ouverte', 'Sauna de la salle']] },
  office: { en: [['in a glass meeting room after the cleaners have left', 'After hours'], ['in a glass meeting room while the open space is still full', 'Glass meeting room']], fr: [['dans une salle de réunion vitrée après le départ des agents d’entretien', 'Après les heures'], ['dans une salle de réunion vitrée, l’open space encore plein', 'Salle vitrée']] },
  hotel: { en: [['in a hotel suite on a work trip, an hour before your flight', 'Hotel suite'], ['on a hotel balcony, the neighbours’ lights still on', 'Hotel balcony']], fr: [['dans une suite d’hôtel en voyage d’affaires, une heure avant votre vol', 'Suite d’hôtel'], ['sur un balcon d’hôtel, chez les voisins la lumière encore allumée', 'Balcon d’hôtel']] },
  car: { en: [['in a parked car at a dark viewpoint above the city', 'Viewpoint'], ['in a parked car on a busy street, the windows barely fogged', 'Busy street']], fr: [['dans une voiture garée à un belvédère sombre au-dessus de la ville', 'Belvédère'], ['dans une voiture garée dans une rue passante, vitres à peine embuées', 'Rue passante']] },
  outdoor: { en: [['on a hidden beach between the dunes at sunset', 'Hidden dunes'], ['on a hiking trail, a few steps off the path', 'Off the trail']], fr: [['sur une plage cachée entre les dunes au coucher du soleil', 'Dunes cachées'], ['sur un sentier de randonnée, à quelques pas du chemin', 'Hors du sentier']] },
  public: { en: [['in the back row of an almost empty cinema', 'Back row'], ['in the back row of a cinema with people two rows ahead', 'Two rows ahead']], fr: [['au dernier rang d’un cinéma presque vide', 'Dernier rang'], ['au dernier rang d’un cinéma, des gens deux rangs devant', 'Deux rangs devant']] },
  massage: { en: [['on a massage table on holiday, the hands lingering a little too long', 'Holiday massage'], ['behind a thin curtain in a beach massage hut', 'Beach massage']], fr: [['sur une table de massage en vacances, des mains qui s’attardent un peu trop', 'Massage en vacances'], ['derrière un rideau fin dans une cabane de massage sur la plage', 'Massage sur la plage']] }
};
const DEFAULT_PLACES = [
  { open: true, en: ['in a sleeper cabin on a night train, the door barely closing', 'Night train'], fr: ['dans une couchette de train de nuit, la porte qui ferme à peine', 'Train de nuit'] },
  { en: ['in a mountain cabin while a storm cuts the power', 'Storm cabin'], fr: ['dans un chalet de montagne pendant qu’une tempête coupe le courant', 'Chalet sous l’orage'] },
  { open: true, en: ['at a house party, in the coat room upstairs', 'Coat room'], fr: ['à une fête, dans la pièce aux manteaux à l’étage', 'Pièce aux manteaux'] },
  { open: true, en: ['on a rooftop terrace after the party has emptied out', 'Rooftop'], fr: ['sur un toit-terrasse après la fin de la fête', 'Toit-terrasse'] }
];

// Who it is with, and whether that person is a he (m), a she (w) or either (n).
const WHO = {
  muscle: { g: 'n', en: 'a muscular stranger', fr: 'un inconnu musclé' }, jock: { g: 'm', en: 'a jock from the team', fr: 'un sportif de l’équipe' },
  daddy: { g: 'm', en: 'a bearded older man', fr: 'un homme plus âgé et barbu' }, twink: { g: 'm', en: 'a slim younger guy', fr: 'un jeune mec mince' },
  bear: { g: 'm', en: 'a big hairy bear', fr: 'un gros nounours poilu' }, hairy: { g: 'm', en: 'a hairy, rugged guy', fr: 'un mec poilu et rugueux' },
  'hairy chest': { g: 'm', en: 'a guy with a hairy chest', fr: 'un mec au torse poilu' }, beard: { g: 'm', en: 'a bearded guy', fr: 'un mec barbu' },
  abs: { g: 'n', en: 'someone with abs you can’t stop looking at', fr: 'quelqu’un aux abdos qu’on ne peut pas quitter des yeux' },
  'straight guy': { g: 'm', en: 'a straight guy who has never done this', fr: 'un hétéro qui n’a jamais fait ça' },
  'gay for pay': { g: 'm', en: 'a straight guy who came for the money', fr: 'un hétéro venu pour l’argent' },
  hunk: { g: 'm', en: 'a tall hunk', fr: 'un grand beau mec' }, otter: { g: 'm', en: 'a lean, hairy otter', fr: 'un mec fin et poilu' },
  milf: { g: 'w', en: 'an older woman from next door', fr: 'une femme plus âgée, la voisine' }, cougar: { g: 'w', en: 'a confident older woman', fr: 'une femme plus âgée et sûre d’elle' },
  mature: { g: 'n', en: 'someone older and very sure of themselves', fr: 'quelqu’un de plus âgé et très sûr de soi' },
  'girl next door': { g: 'w', en: 'the girl from across the hall', fr: 'la fille d’en face sur le palier' },
  'big tits': { g: 'w', en: 'a woman with big tits', fr: 'une femme aux gros seins' }, curvy: { g: 'w', en: 'a curvy woman', fr: 'une femme pulpeuse' },
  petite: { g: 'w', en: 'a petite woman', fr: 'une femme menue' }, 'big ass': { g: 'n', en: 'someone with a big ass', fr: 'quelqu’un avec un gros cul' },
  'bubble butt': { g: 'n', en: 'someone with a perfect bubble butt', fr: 'quelqu’un avec un cul bien rebondi' },
  lesbian: { g: 'w', en: 'the woman you have been flirting with for weeks', fr: 'la femme avec qui vous flirtez depuis des semaines' },
  'alt girl': { g: 'w', en: 'a tattooed alt girl', fr: 'une fille alternative tatouée' }, tomboy: { g: 'w', en: 'a tomboy in a cap', fr: 'une garçon manqué en casquette' },
  college: { g: 'n', en: 'someone from your college', fr: 'quelqu’un de la fac' }, femboy: { g: 'm', en: 'a femboy', fr: 'un femboy' }, trans: { g: 'w', en: 'a trans woman', fr: 'une femme trans' },
  tattoo: { g: 'n', en: 'someone covered in tattoos', fr: 'quelqu’un couvert de tatouages' }, uncut: { g: 'm', en: 'a guy who is uncut', fr: 'un mec non circoncis' },
  bbc: { g: 'm', en: 'a guy with a big black cock', fr: 'un mec avec une grosse bite noire' }, 'big balls': { g: 'm', en: 'a guy with big balls', fr: 'un mec aux grosses couilles' }
};
const DEFAULT_WHO = { men: { g: 'm', en: 'a guy you have never seen there before', fr: 'un mec que vous n’avez jamais vu là' }, women: { g: 'w', en: 'a woman you have never seen there before', fr: 'une femme que vous n’avez jamais vue là' }, both: { g: 'n', en: 'a stranger', fr: 'un inconnu' } };

// What catches your attention first.
const HOOKS = {
  en: ['keeps holding your gaze', 'sits down a little too close', 'asks if you want company', 'locks the door behind you both', 'brushes past you on purpose'],
  fr: ['ne vous quitte pas des yeux', 's’assoit un peu trop près', 'vous demande si vous voulez de la compagnie', 'ferme la porte à clé derrière vous deux', 'vous frôle exprès']
};

const ACTS = {
  blowjob: { en: 'goes down on you', fr: 'vous prend dans sa bouche' },
  deepthroat: { en: 'takes you all the way down', fr: 'vous prend jusqu’au fond de la gorge' },
  sloppy: { en: 'gives you a long, sloppy blowjob', fr: 'vous fait une pipe longue et baveuse' },
  'face fucking': { en: 'opens wide and lets you set the pace', fr: 'ouvre grand la bouche et vous laisse le rythme' },
  rimming: { en: 'spreads you open and eats your ass', fr: 'vous écarte et vous lèche le cul' },
  'pussy licking': { en: 'eats you out until your legs shake', fr: 'vous lèche jusqu’à ce que vos jambes tremblent' },
  facesitting: { en: 'climbs up and sits on your face', fr: 's’assoit sur votre visage' },
  kissing: { en: 'kisses you until neither of you can wait', fr: 'vous embrasse jusqu’à ce que personne ne puisse attendre' },
  anal: { en: 'bends over and lets you inside, slowly at first', fr: 'se penche et vous laisse entrer, doucement d’abord' },
  doggystyle: { en: 'bends over for you', fr: 'se penche devant vous' },
  missionary: { en: 'pulls you on top, face to face', fr: 'vous attire tout contre, face à face' },
  riding: { en: 'climbs on top and rides you', fr: 'monte sur vous et vous chevauche' },
  'reverse cowgirl': { en: 'rides you facing away, looking back over a shoulder', fr: 'vous chevauche de dos en vous regardant par-dessus l’épaule' },
  'standing sex': { en: 'pins you against the wall', fr: 'vous plaque contre le mur' },
  'sixty nine': { en: 'ends up in a sixty-nine with you', fr: 'finit en soixante-neuf avec vous' },
  spooning: { en: 'slides in behind you on your side', fr: 'se glisse derrière vous, sur le côté' },
  'prone bone': { en: 'pushes you flat on your stomach', fr: 'vous plaque à plat ventre' },
  'mating press': { en: 'holds your legs up and does not stop', fr: 'vous relève les jambes et ne s’arrête plus' },
  handjob: { en: 'strokes you slowly', fr: 'vous branle lentement' },
  fingering: { en: 'works you open with careful fingers', fr: 'vous ouvre avec des doigts patients' },
  toys: { en: 'pulls out a toy and uses it on you', fr: 'sort un jouet et l’utilise sur vous' },
  titfuck: { en: 'lets you slide between those tits', fr: 'vous laisse glisser entre ses seins' },
  scissoring: { en: 'grinds against you until you both come', fr: 'se frotte contre vous jusqu’à ce que vous jouissiez toutes les deux' },
  'strap on': { en: 'straps on and takes charge', fr: 'met un gode-ceinture et prend les choses en main' },
  bareback: { en: 'takes you raw', fr: 'vous prend sans capote' },
  breeding: { en: 'begs you not to pull out', fr: 'vous supplie de ne pas vous retirer' },
  masturbation: { en: 'watches you touch yourself', fr: 'vous regarde vous toucher' },
  edging: { en: 'keeps you on the edge for what feels like an hour', fr: 'vous garde au bord pendant ce qui semble une heure' },
  massage: { en: 'starts with a massage that slowly stops being one', fr: 'commence par un massage qui n’en est bientôt plus un' }
};
const FINISH = {
  creampie: { en: 'until you finish inside', fr: 'jusqu’à ce que vous jouissiez dedans' }, facial: { en: 'and you finish all over that face', fr: 'et vous finissez sur son visage' },
  swallow: { en: 'and swallows every drop', fr: 'et avale jusqu’à la dernière goutte' }, 'huge load': { en: 'until you shoot a huge load', fr: 'jusqu’à une énorme giclée' },
  dripping: { en: 'and leaves everything dripping', fr: 'et tout finit par dégouliner' }, precum: { en: 'with you leaking the whole time', fr: 'pendant que vous mouillez sans arrêt' }
};
const HOW = {
  rough: { en: 'rough and impatient', fr: 'brutal et impatient' }, sensual: { en: 'slow and sensual', fr: 'lent et sensuel' },
  dominant: { en: 'in full control of you', fr: 'en gardant tout le contrôle' }, submissive: { en: 'letting you take full control', fr: 'en vous laissant tout le contrôle' },
  teasing: { en: 'after a long, slow tease', fr: 'après une longue taquinerie' }, 'dirty talk': { en: 'talking dirty the whole time', fr: 'en parlant cru tout du long' },
  moaning: { en: 'loud enough for the neighbours', fr: 'assez fort pour les voisins' }, bondage: { en: 'with your hands tied', fr: 'les mains attachées' },
  femdom: { en: 'with her in charge', fr: 'avec elle aux commandes' }
};
const WEARS = {
  jockstrap: { en: 'in just a jockstrap', fr: 'en jockstrap' }, underwear: { en: 'in just underwear', fr: 'en sous-vêtements' },
  lingerie: { en: 'in black lingerie', fr: 'en lingerie noire' }, heels: { en: 'in heels', fr: 'en talons' }, 'yoga pants': { en: 'in tight yoga pants', fr: 'en legging moulant' },
  socks: { en: 'still in socks', fr: 'encore en chaussettes' }, uniform: { en: 'still in uniform', fr: 'encore en uniforme' }, jeans: { en: 'in tight jeans', fr: 'en jean moulant' },
  shorts: { en: 'in short shorts', fr: 'en short court' }, oiled: { en: 'covered in oil', fr: 'couvert d’huile' }, sweaty: { en: 'still sweaty', fr: 'encore en sueur' }
};
// The twist: only when your picks ask for it.
const THRILL = {
  public: { en: 'Someone could see you at any moment, and neither of you stops.', fr: 'Quelqu’un pourrait vous voir à tout moment, et aucun de vous ne s’arrête.' },
  caught: { en: 'Right at the end, footsteps come closer.', fr: 'Juste à la fin, des pas se rapprochent.' },
  cheating: { en: 'Their partner calls twice while it happens, and nobody answers.', fr: 'Son partenaire appelle deux fois pendant ce temps, et personne ne répond.' },
  'first time': { en: 'It is their first time with someone like you, and they want it badly.', fr: 'C’est sa première fois avec quelqu’un comme vous, et l’envie est énorme.' },
  'straight guy': { en: 'He swears he is straight, right up until he isn’t.', fr: 'Il jure qu’il est hétéro, jusqu’à ce qu’il ne le soit plus.' },
  'gay for pay': { en: 'It started as a paid shoot, but nobody is acting anymore.', fr: 'Ça devait être un tournage payé, mais plus personne ne joue.' },
  casting: { en: 'It was supposed to be an audition. The camera keeps rolling.', fr: 'Ce devait être une audition. La caméra continue de tourner.' },
  pov: { en: 'You film every second from your own point of view.', fr: 'Vous filmez chaque seconde de votre point de vue.' },
  threesome: { en: 'Then their friend walks in and does not leave.', fr: 'Puis son ami entre, et ne repart pas.' },
  roleplay: { en: 'You both stay in character until the very end.', fr: 'Vous restez tous les deux dans votre rôle jusqu’au bout.' },
  'size difference': { en: 'The size difference makes it even harder to stay quiet.', fr: 'La différence de taille rend le silence encore plus difficile.' },
  hotwife: { en: 'Her partner watches from the doorway, and asks for more.', fr: 'Son partenaire regarde depuis la porte, et en redemande.' },
  cuckold: { en: 'Your partner watches from the chair in the corner.', fr: 'Votre partenaire regarde depuis le fauteuil dans le coin.' },
  swingers: { en: 'Across the room, your partners are doing the same.', fr: 'De l’autre côté de la pièce, vos partenaires font pareil.' }
};
const RISKY = ['public', 'caught'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "goes down on you" with they: "go down on you".
const plural = (s) => s.replace(/^(\S+)/, (v) => (v === 'goes' ? 'go' : /(sh|ch|ss|x)es$/.test(v) ? v.slice(0, -2) : v.endsWith('s') ? v.slice(0, -1) : v));

// gender: 'men', 'women' or 'both', from the balance you set.
export function fantasyIdeas(picked = [], { gender = 'both', max = 5 } = {}) {
  const L = lang() === 'fr' ? 'fr' : 'en';
  const has = (table) => picked.filter((c) => table[c]);
  const places = has(PLACES), whos = has(WHO), acts = has(ACTS), hows = has(HOW), wears = has(WEARS), finishes = has(FINISH), thrills = has(THRILL);
  if (!acts.length && !places.length && !whos.length) return [];
  const risky = picked.some((c) => RISKY.includes(c));
  // Your places first, then a few settings that are hard to come by, so one picked place does not make every story the same.
  const allPlaces = [...places.map((k) => ({ key: k, open: true, en: PLACES[k].en[risky ? 1 : 0], fr: PLACES[k].fr[risky ? 1 : 0] })), ...DEFAULT_PLACES];
  const actList = acts.length ? acts : ['kissing'];
  // Every place with every act, in an order where each story changes both the place and the act when it can.
  const combos = allPlaces.flatMap((p, pi) => actList.map((a, ai) => ({ place: p, actKey: a, pi, ai })));
  const order = [];
  const used = new Set();
  let last = null;
  while (order.length < combos.length) {
    const free = combos.filter((c) => !used.has(c));
    const placeUses = (pi) => order.filter((c) => c.pi === pi).length;
    free.sort((x, y) => ((last && (x.pi === last.pi || x.ai === last.ai)) - (last && (y.pi === last.pi || y.ai === last.ai))) || placeUses(x.pi) - placeUses(y.pi) || x.pi - y.pi || x.ai - y.ai);
    last = free[0];
    used.add(last);
    order.push(last);
  }
  const out = [];
  for (let i = 0; i < order.length && out.length < max; i++) {
    const { place, actKey } = order[i];
    const whoKey = whos.length ? whos[(i + 1) % whos.length] : null;
    const w = whoKey ? WHO[whoKey] : DEFAULT_WHO[gender] || DEFAULT_WHO.both;
    const g = w.g !== 'n' ? w.g : gender === 'men' ? 'm' : gender === 'women' ? 'w' : 'n';
    // One extra touch at most (what they wear, how it goes, or how it ends), so a story is never a list of picks.
    const extras = [wears.length ? { k: wears[i % wears.length], t: 'wear' } : null, hows.length ? { k: hows[i % hows.length], t: 'how' } : null, finishes.length ? { k: finishes[i % finishes.length], t: 'fin' } : null].filter(Boolean);
    const extra = extras.length ? extras[i % extras.length] : null;
    // Getting seen or caught only where someone could actually walk in: your places, or the open settings.
    const fitting = thrills.filter((x) => !RISKY.includes(x) || place.key || place.open);
    const thrill = fitting.length && (i % 3 !== 2 || out.length < 2) ? fitting[i % fitting.length] : null;
    const pron = L === 'fr' ? (g === 'w' ? 'Elle' : 'Il') : g === 'm' ? 'He' : g === 'w' ? 'She' : 'They';
    let act = ACTS[actKey][L];
    if (pron === 'They') act = plural(act);
    const s1 = `${cap(place[L][0])}, ${w[L]}${extra?.t === 'wear' ? ` ${WEARS[extra.k][L]}` : ''} ${HOOKS[L][i % HOOKS[L].length]}.`;
    let s2 = `${pron} ${act}`;
    if (extra?.t === 'fin') s2 += ` ${pron === 'They' ? FINISH[extra.k][L].replace(/\bswallows\b/, 'swallow').replace(/\bleaves\b/, 'leave') : FINISH[extra.k][L]}`;
    if (extra?.t === 'how') s2 += `, ${HOW[extra.k][L]}`;
    s2 += '.';
    const story = [s1, s2, thrill ? THRILL[thrill][L] : null].filter(Boolean).join(' ');
    const concepts = [...new Set([place.key || null, whoKey, acts.length ? actKey : null, extra?.k || null, thrill].filter(Boolean))];
    if (!concepts.length) continue;
    const name = place[L][1];
    if (out.some((f) => f.name === name)) continue;
    out.push({ name, description: story, concepts });
  }
  return out;
}
