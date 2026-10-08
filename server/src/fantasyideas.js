import { lang } from './i18n.js';
import { GENDER_OF } from './concepts.js';

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
  hotel: { en: [['in a hotel suite on a work trip', 'Hotel suite'], ['on a hotel balcony, the neighbours’ lights still on', 'Hotel balcony']], fr: [['dans une suite d’hôtel en voyage d’affaires', 'Suite d’hôtel'], ['sur un balcon d’hôtel, chez les voisins la lumière encore allumée', 'Balcon d’hôtel']] },
  car: { en: [['in a parked car at a dark viewpoint above the city', 'Viewpoint'], ['in a parked car on a busy street, the windows barely fogged', 'Busy street']], fr: [['dans une voiture garée à un belvédère sombre au-dessus de la ville', 'Belvédère'], ['dans une voiture garée dans une rue passante, vitres à peine embuées', 'Rue passante']] },
  outdoor: { en: [['on a hidden beach between the dunes at sunset', 'Hidden dunes'], ['on a hiking trail, a few steps off the path', 'Off the trail']], fr: [['sur une plage cachée entre les dunes au coucher du soleil', 'Dunes cachées'], ['sur un sentier de randonnée, à quelques pas du chemin', 'Hors du sentier']] },
  public: { en: [['in the back row of an almost empty cinema', 'Back row'], ['in the back row of a busy cinema', 'Back row']], fr: [['au dernier rang d’un cinéma presque vide', 'Dernier rang'], ['au dernier rang d’un cinéma bondé', 'Dernier rang']] },
  massage: { en: [['on a massage table on holiday', 'Holiday massage'], ['behind a thin curtain in a beach massage hut', 'Beach massage']], fr: [['sur une table de massage en vacances', 'Massage en vacances'], ['derrière un rideau fin dans une cabane de massage sur la plage', 'Massage sur la plage']] }
};
const DEFAULT_PLACES = [
  { open: true, en: ['in a sleeper cabin on a night train', 'Night train'], fr: ['dans une couchette de train de nuit', 'Train de nuit'] },
  { en: ['in a mountain cabin during a blackout', 'Storm cabin'], fr: ['dans un chalet de montagne pendant une coupure de courant', 'Chalet sous l’orage'] },
  { open: true, en: ['in the coat room at a house party', 'Coat room'], fr: ['dans la pièce aux manteaux d’une fête', 'Pièce aux manteaux'] },
  { open: true, en: ['on a rooftop after the party', 'Rooftop'], fr: ['sur un toit-terrasse après la fête', 'Toit-terrasse'] }
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
  lesbian: { g: 'w', en: 'the woman you’ve been flirting with', fr: 'la femme avec qui vous flirtez' },
  'alt girl': { g: 'w', en: 'a tattooed alt girl', fr: 'une fille alternative tatouée' }, tomboy: { g: 'w', en: 'a tomboy in a cap', fr: 'une garçon manqué en casquette' },
  college: { g: 'n', en: 'someone from your college', fr: 'quelqu’un de la fac' }, femboy: { g: 'm', en: 'a femboy', fr: 'un femboy' }, trans: { g: 'w', en: 'a trans woman', fr: 'une femme trans' },
  tattoo: { g: 'n', en: 'someone covered in tattoos', fr: 'quelqu’un couvert de tatouages' }, uncut: { g: 'm', en: 'a guy who is uncut', fr: 'un mec non circoncis' },
  bbc: { g: 'm', en: 'a guy with a big black cock', fr: 'un mec avec une grosse bite noire' }, 'big balls': { g: 'm', en: 'a guy with big balls', fr: 'un mec aux grosses couilles' }
};
const DEFAULT_WHO = { men: { g: 'm', en: 'a guy you have never seen there before', fr: 'un mec que vous n’avez jamais vu là' }, women: { g: 'w', en: 'a woman you have never seen there before', fr: 'une femme que vous n’avez jamais vue là' }, both: { g: 'n', en: 'a stranger', fr: 'un inconnu' } };

const ACTS = {
  blowjob: { en: 'gets on {p} knees and sucks you off', fr: 'se met à genoux et vous suce' },
  deepthroat: { en: 'takes you all the way down {p} throat', fr: 'vous prend jusqu’au fond de la gorge' },
  sloppy: { en: 'gives you a wet, sloppy blowjob', fr: 'vous fait une pipe baveuse' },
  'face fucking': { en: 'lets you fuck {p} face', fr: 'vous laisse lui baiser la bouche' },
  rimming: { en: 'spreads you open and eats your ass', fr: 'vous écarte et vous bouffe le cul' },
  'pussy licking': { en: 'eats your pussy until you shake', fr: 'vous lèche la chatte jusqu’à ce que vous trembliez' },
  facesitting: { en: 'sits on your face', fr: 's’assoit sur votre visage' },
  kissing: { en: 'pushes you against the wall and makes out with you', fr: 'vous plaque contre le mur et vous embrasse' },
  anal: { en: 'bends over and takes it in the ass', fr: 'se penche et se fait prendre le cul' },
  doggystyle: { en: 'bends over and gets fucked hard from behind', fr: 'se penche et se fait prendre fort par derrière' },
  missionary: { en: 'pulls you on top and lets you fuck {o} deep', fr: 'vous attire dessus et se fait prendre profond' },
  riding: { en: 'climbs on and rides you hard', fr: 'monte sur vous et vous chevauche fort' },
  'reverse cowgirl': { en: 'rides you facing away', fr: 'vous chevauche de dos' },
  'standing sex': { en: 'pins you against the wall and fucks you', fr: 'vous plaque contre le mur et vous baise' },
  'sixty nine': { en: 'gets into a sixty-nine with you', fr: 'se met en soixante-neuf avec vous' },
  spooning: { en: 'slides in behind you and fucks you slowly', fr: 'se glisse derrière vous et vous baise lentement' },
  'prone bone': { en: 'pins you flat on your stomach and fucks you', fr: 'vous plaque à plat ventre et vous baise' },
  'mating press': { en: 'folds your legs back and fucks you deep', fr: 'vous replie les jambes et vous baise profond' },
  handjob: { en: 'jerks you off', fr: 'vous branle' },
  fingering: { en: 'fingers you open', fr: 'vous doigte' },
  toys: { en: 'uses a toy on you', fr: 'utilise un jouet sur vous' },
  titfuck: { en: 'lets you fuck {p} tits', fr: 'vous laisse baiser ses seins' },
  scissoring: { en: 'grinds against you until you both come', fr: 'se frotte contre vous jusqu’à ce que vous jouissiez' },
  'strap on': { en: 'straps on and fucks you', fr: 'met un gode-ceinture et vous baise' },
  bareback: { en: 'fucks you raw', fr: 'vous baise sans capote' },
  breeding: { en: 'begs you to breed {o}', fr: 'vous supplie de jouir en lui' },
  masturbation: { en: 'watches you jerk off', fr: 'vous regarde vous branler' },
  edging: { en: 'keeps you on the edge until you beg', fr: 'vous garde au bord jusqu’à ce que vous suppliiez' },
  massage: { en: 'turns the massage into sex', fr: 'transforme le massage en baise' }
};
// A second way to say the most common acts, so ideas do not all read the same.
const ACTS2 = {
  blowjob: { en: 'sucks you off right there', fr: 'vous suce sur place' },
  'pussy licking': { en: 'goes down on you and does not stop', fr: 'descend entre vos cuisses et ne s’arrête plus' },
  riding: { en: 'straddles you and rides you slow, then hard', fr: 'vous chevauche lentement, puis fort' },
  anal: { en: 'begs you to fuck {p} ass', fr: 'vous supplie de lui prendre le cul' },
  doggystyle: { en: 'gets on all fours for you', fr: 'se met à quatre pattes pour vous' },
  kissing: { en: 'kisses you hard and pulls you closer', fr: 'vous embrasse fort et vous attire contre lui' },
  handjob: { en: 'strokes you until you can’t hold it', fr: 'vous branle jusqu’à ce que vous ne teniez plus' }
};
// Acts that go with one you picked, so a single pick still gives different ideas. Only ones that fit who you want to see.
const NEAR_ACTS = {
  blowjob: ['deepthroat', 'sixty nine', 'rimming', 'sloppy'], deepthroat: ['blowjob', 'face fucking'], 'pussy licking': ['facesitting', 'fingering', 'scissoring', 'sixty nine'],
  riding: ['reverse cowgirl', 'missionary', 'doggystyle'], anal: ['doggystyle', 'prone bone', 'rimming'], doggystyle: ['prone bone', 'anal', 'standing sex'],
  missionary: ['mating press', 'spooning', 'kissing'], scissoring: ['pussy licking', 'facesitting', 'strap on'], bareback: ['breeding', 'doggystyle', 'missionary'],
  handjob: ['edging', 'blowjob'], kissing: ['missionary', 'spooning'], rimming: ['anal', 'facesitting'], facesitting: ['pussy licking', 'rimming']
};
const FINISH = {
  creampie: { en: 'until you cum inside', fr: 'jusqu’à ce que vous jouissiez dedans' }, facial: { en: 'until you cum on {p} face', fr: 'jusqu’à ce que vous lui jouissiez sur le visage' },
  swallow: { en: 'and swallows every drop', fr: 'et avale tout' }, 'huge load': { en: 'until you shoot a huge load', fr: 'jusqu’à une énorme giclée' },
  dripping: { en: 'and leaves everything dripping', fr: 'et tout finit par dégouliner' }, precum: { en: 'with you leaking the whole time', fr: 'pendant que vous mouillez sans arrêt' }
};
const WEARS = {
  jockstrap: { en: 'in just a jockstrap', fr: 'en jockstrap' }, underwear: { en: 'in just underwear', fr: 'en sous-vêtements' },
  lingerie: { en: 'in black lingerie', fr: 'en lingerie noire' }, heels: { en: 'in heels', fr: 'en talons' }, 'yoga pants': { en: 'in tight yoga pants', fr: 'en legging moulant' },
  socks: { en: 'still in socks', fr: 'encore en chaussettes' }, uniform: { en: 'still in uniform', fr: 'encore en uniforme' }, jeans: { en: 'in tight jeans', fr: 'en jean moulant' },
  shorts: { en: 'in short shorts', fr: 'en short court' }, oiled: { en: 'covered in oil', fr: 'couvert d’huile' }, sweaty: { en: 'still sweaty', fr: 'encore en sueur' }
};
// The twist, as a short ending: only when your picks ask for it.
const THRILL = {
  public: { en: 'with people close enough to see', fr: 'avec des gens assez près pour voir' },
  caught: { en: 'and you almost get caught', fr: 'et vous manquez de vous faire prendre' },
  cheating: { en: 'while {p} partner waits at home', fr: 'pendant que son partenaire attend à la maison' },
  'first time': { en: 'for the very first time', fr: 'pour la toute première fois' },
  'gay for pay': { en: 'for cash', fr: 'pour de l’argent' },
  casting: { en: 'at a casting that goes way too far', fr: 'à un casting qui va beaucoup trop loin' },
  pov: { en: 'while you film every second', fr: 'pendant que vous filmez tout' },
  threesome: { en: 'until {p} friend joins in', fr: 'jusqu’à ce qu’un ami vous rejoigne' },
  roleplay: { en: 'while you both play strangers', fr: 'en jouant aux inconnus' },
  hotwife: { en: 'while her partner watches', fr: 'pendant que son partenaire regarde' },
  cuckold: { en: 'while your partner watches', fr: 'pendant que votre partenaire regarde' },
  swingers: { en: 'while your partners swap too', fr: 'pendant que vos partenaires échangent aussi' }
};
const RISKY = ['public', 'caught'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// gender: 'men', 'women' or 'both', from the balance you set.
export function fantasyIdeas(picked = [], { gender = 'both', max = 5 } = {}) {
  const L = lang() === 'fr' ? 'fr' : 'en';
  const has = (table) => picked.filter((c) => table[c]);
  const places = has(PLACES), whos = has(WHO), acts = has(ACTS), wears = has(WEARS), finishes = has(FINISH), thrills = has(THRILL);
  if (!acts.length && !places.length && !whos.length) return [];
  const risky = picked.some((c) => RISKY.includes(c));
  // Your places first, then a few settings that are hard to come by, so one picked place does not make every story the same.
  const allPlaces = [...places.map((k) => ({ key: k, open: true, en: PLACES[k].en[risky ? 1 : 0], fr: PLACES[k].fr[risky ? 1 : 0] })), ...DEFAULT_PLACES];
  const fitsWho = (c) => { const g = GENDER_OF[c]; return !g || (gender === 'men' ? g === 'm' : gender === 'women' ? g === 'w' : true); };
  const near = acts.length < 3 ? [...new Set(acts.flatMap((a) => NEAR_ACTS[a] || []))].filter((a) => ACTS[a] && !acts.includes(a) && fitsWho(a)).slice(0, 3 - acts.length + 1) : [];
  const actList = acts.length ? [...acts, ...near] : ['kissing'];
  // Every place with every act, in an order where each story changes both the place and the act when it can.
  const combos = allPlaces.flatMap((p, pi) => actList.map((a, ai) => ({ place: p, actKey: a, pi, ai })));
  const order = [];
  const used = new Set();
  let last = null;
  while (order.length < combos.length) {
    const free = combos.filter((c) => !used.has(c));
    const placeUses = (pi) => order.filter((c) => c.pi === pi).length;
    const actUses = (ai) => order.filter((c) => c.ai === ai).length;
    free.sort((x, y) => ((last && (x.pi === last.pi || x.ai === last.ai)) - (last && (y.pi === last.pi || y.ai === last.ai))) || actUses(x.ai) - actUses(y.ai) || placeUses(x.pi) - placeUses(y.pi) || x.pi - y.pi || x.ai - y.ai);
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
    const poss = g === 'm' ? 'his' : g === 'w' ? 'her' : 'their';
    const obj = g === 'm' ? 'him' : g === 'w' ? 'her' : 'them';
    const fill = (x) => x.replace(/\{p\}/g, poss).replace(/\{o\}/g, obj);
    // One extra touch at most (what they wear, how it ends), so it stays one short, direct sentence.
    const extras = [wears.length ? { k: wears[i % wears.length], t: 'wear' } : null, finishes.length ? { k: finishes[i % finishes.length], t: 'fin' } : null].filter(Boolean);
    const extra = extras.length ? extras[i % extras.length] : null;
    const fitting = thrills.filter((x) => !RISKY.includes(x) || place.key || place.open);
    const thrill = fitting.length ? fitting[i % fitting.length] : null;
    const phrase = ACTS2[actKey] && out.some((f) => f.concepts.includes(actKey)) ? ACTS2[actKey][L] : ACTS[actKey][L];
    let text = `${cap(place[L][0])}, ${w[L]}${extra?.t === 'wear' ? ` ${WEARS[extra.k][L]}` : ''} ${fill(phrase)}`;
    if (extra?.t === 'fin') text += ` ${fill(FINISH[extra.k][L])}`;
    if (thrill) text += `, ${fill(THRILL[thrill][L])}`;
    const concepts = [...new Set([place.key || null, whoKey, acts.length ? actKey : null, extra?.k || null, thrill].filter(Boolean))];
    if (!concepts.length) continue;
    const name = place[L][1];
    if (out.some((f) => f.name === name)) continue;
    out.push({ name, description: `${text}.`, concepts });
  }
  return out;
}
