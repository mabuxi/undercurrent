import { lang } from './i18n.js';

// Fantasy ideas without the local model (it may still be downloading during the welcome steps): real scenarios
// built from what you picked, a place, someone, what happens and how, never just the picked words in a row.
// Each part is written out in English and French. Nothing about step family, non-consent or age.

const PLACES = {
  shower: { en: ['in a steamy shower', 'Steamy shower'], fr: ['sous une douche brûlante', 'Douche brûlante'] },
  gym: { en: ['in the empty gym after closing', 'Gym after closing'], fr: ['dans la salle de sport vide après la fermeture', 'Salle de sport fermée'] },
  office: { en: ['in the office after everyone has left', 'Late at the office'], fr: ['au bureau quand tout le monde est parti', 'Tard au bureau'] },
  hotel: { en: ['in a hotel room on a work trip', 'Hotel room'], fr: ['dans une chambre d’hôtel en voyage d’affaires', 'Chambre d’hôtel'] },
  car: { en: ['in a parked car with fogged-up windows', 'Parked car'], fr: ['dans une voiture garée aux vitres embuées', 'Voiture garée'] },
  outdoor: { en: ['on a quiet trail in the woods', 'Off the trail'], fr: ['sur un sentier tranquille en forêt', 'Hors du sentier'] },
  public: { en: ['somewhere you could get caught any second', 'Almost in public'], fr: ['là où on pourrait vous surprendre à tout moment', 'Presque en public'] },
  massage: { en: ['on a massage table, the oil still warm', 'Massage table'], fr: ['sur une table de massage, l’huile encore chaude', 'Table de massage'] }
};
const DEFAULT_PLACES = [
  { en: ['late at night in your bed', 'Late night'], fr: ['tard le soir dans votre lit', 'Tard le soir'] },
  { en: ['on the couch, the film long forgotten', 'Film forgotten'], fr: ['sur le canapé, le film oublié depuis longtemps', 'Film oublié'] },
  { en: ['in a cabin, rain on the roof', 'Rainy cabin'], fr: ['dans un chalet, la pluie sur le toit', 'Chalet sous la pluie'] }
];

const WHO = {
  muscle: { en: 'a muscular stranger', fr: 'un inconnu musclé' }, jock: { en: 'a jock from the team', fr: 'un sportif de l’équipe' },
  daddy: { en: 'a bearded older man', fr: 'un homme plus âgé et barbu' }, twink: { en: 'a slim younger guy', fr: 'un jeune mec mince' },
  bear: { en: 'a big hairy bear', fr: 'un gros nounours poilu' }, hairy: { en: 'a hairy, rugged guy', fr: 'un mec poilu et rugueux' },
  'hairy chest': { en: 'a guy with a hairy chest', fr: 'un mec au torse poilu' }, beard: { en: 'a bearded guy', fr: 'un mec barbu' },
  abs: { en: 'someone with abs you can’t stop touching', fr: 'quelqu’un aux abdos qu’on ne peut pas s’empêcher de toucher' },
  'straight guy': { en: 'a straight guy who has never done this', fr: 'un hétéro qui n’a jamais fait ça' },
  'gay for pay': { en: 'a straight guy doing it for the money', fr: 'un hétéro qui le fait pour l’argent' },
  milf: { en: 'an older woman from next door', fr: 'une femme plus âgée, la voisine' }, mature: { en: 'someone older and very sure of themselves', fr: 'quelqu’un de plus âgé et très sûr de soi' },
  'big tits': { en: 'a woman with big tits', fr: 'une femme aux gros seins' }, curvy: { en: 'a curvy woman', fr: 'une femme pulpeuse' },
  petite: { en: 'a petite woman', fr: 'une femme menue' }, 'big ass': { en: 'someone with a big ass', fr: 'quelqu’un avec un gros cul' },
  'bubble butt': { en: 'someone with a perfect bubble butt', fr: 'quelqu’un avec un cul bien rebondi' },
  lesbian: { en: 'the woman you have been flirting with', fr: 'la femme avec qui vous flirtez depuis des semaines' },
  college: { en: 'a college student', fr: 'une étudiante' }, femboy: { en: 'a femboy', fr: 'un femboy' }, trans: { en: 'a trans woman', fr: 'une femme trans' },
  tattoo: { en: 'someone covered in tattoos', fr: 'quelqu’un couvert de tatouages' }, uncut: { en: 'a guy who is uncut', fr: 'un mec non circoncis' },
  bbc: { en: 'a guy with a big black cock', fr: 'un mec avec une grosse bite noire' }, 'big balls': { en: 'a guy with big balls', fr: 'un mec aux grosses couilles' }
};
const DEFAULT_WHO = { men: { en: 'a guy you just met', fr: 'un mec que vous venez de rencontrer' }, women: { en: 'a woman you just met', fr: 'une femme que vous venez de rencontrer' }, both: { en: 'someone you just met', fr: 'quelqu’un que vous venez de rencontrer' } };

const ACTS = {
  blowjob: { en: ['goes down on you', 'Going down'], fr: ['vous prend dans sa bouche', 'À genoux'] },
  deepthroat: { en: ['takes you all the way down their throat', 'All the way down'], fr: ['vous prend jusqu’au fond de la gorge', 'Jusqu’au fond'] },
  sloppy: { en: ['gives you a long, sloppy blowjob', 'Sloppy'], fr: ['vous fait une pipe longue et baveuse', 'Baveuse'] },
  'face fucking': { en: ['lets you fuck their face', 'Face first'], fr: ['vous laisse lui baiser la bouche', 'La bouche'] },
  rimming: { en: ['spreads you open and eats your ass', 'Eaten out'], fr: ['vous écarte et vous lèche le cul', 'Léché'] },
  'pussy licking': { en: ['eats you out until your legs shake', 'Legs shaking'], fr: ['vous lèche jusqu’à ce que vos jambes tremblent', 'Jambes tremblantes'] },
  facesitting: { en: ['sits on your face', 'Sit on it'], fr: ['s’assoit sur votre visage', 'Assis dessus'] },
  kissing: { en: ['kisses you until neither of you can wait', 'One kiss too many'], fr: ['vous embrasse jusqu’à ce que personne ne puisse attendre', 'Un baiser de trop'] },
  anal: { en: ['lets you take them from behind, slowly at first', 'From behind'], fr: ['se laisse prendre par derrière, doucement d’abord', 'Par derrière'] },
  doggystyle: { en: ['bends over for you', 'Bent over'], fr: ['se penche devant vous', 'Penché'] },
  missionary: { en: ['pulls you on top, face to face', 'Face to face'], fr: ['vous attire tout contre, face à face', 'Face à face'] },
  riding: { en: ['climbs on top and rides you', 'On top'], fr: ['monte sur vous et vous chevauche', 'Au-dessus'] },
  'reverse cowgirl': { en: ['rides you facing away, looking back over their shoulder', 'Looking back'], fr: ['vous chevauche de dos en vous regardant par-dessus l’épaule', 'Regard en arrière'] },
  'standing sex': { en: ['pins you against the wall', 'Against the wall'], fr: ['vous plaque contre le mur', 'Contre le mur'] },
  'sixty nine': { en: ['ends up in a sixty-nine with you', 'Sixty-nine'], fr: ['finit en soixante-neuf avec vous', 'Soixante-neuf'] },
  spooning: { en: ['slides in behind you on your side', 'Spooning'], fr: ['se glisse derrière vous, sur le côté', 'En cuillère'] },
  'prone bone': { en: ['pushes you flat on your stomach', 'Flat down'], fr: ['vous plaque à plat ventre', 'À plat ventre'] },
  'mating press': { en: ['holds your legs up and doesn’t stop', 'Legs up'], fr: ['vous relève les jambes et ne s’arrête plus', 'Jambes relevées'] },
  handjob: { en: ['strokes you slowly', 'Slow hands'], fr: ['vous branle lentement', 'Mains lentes'] },
  fingering: { en: ['works you open with their fingers', 'Fingers'], fr: ['vous ouvre avec ses doigts', 'Les doigts'] },
  toys: { en: ['pulls out a toy and uses it on you', 'Toy box'], fr: ['sort un jouet et l’utilise sur vous', 'Les jouets'] },
  titfuck: { en: ['lets you slide between their tits', 'Between them'], fr: ['vous laisse glisser entre ses seins', 'Entre ses seins'] },
  scissoring: { en: ['grinds against you until you both come', 'Grinding'], fr: ['se frotte contre vous jusqu’à ce que vous jouissiez toutes les deux', 'Ciseaux'] },
  'strap on': { en: ['straps on and takes charge', 'Strapped on'], fr: ['met un gode-ceinture et prend les choses en main', 'Gode-ceinture'] },
  bareback: { en: ['takes you raw', 'Raw'], fr: ['vous prend sans capote', 'Sans capote'] },
  breeding: { en: ['begs you to fill them up', 'Filled up'], fr: ['vous supplie de jouir en lui', 'Rempli'] },
  masturbation: { en: ['watches you touch yourself', 'Watching'], fr: ['vous regarde vous toucher', 'Regardé'] },
  edging: { en: ['keeps you on the edge for ages', 'On the edge'], fr: ['vous garde au bord pendant une éternité', 'Au bord'] },
  massage: { en: ['starts with a massage that slowly stops being one', 'Happy ending'], fr: ['commence par un massage qui n’en est bientôt plus un', 'Fin heureuse'] }
};
const FINISH = {
  creampie: { en: 'until you finish inside', fr: 'jusqu’à ce que vous jouissiez dedans' }, facial: { en: 'and you finish on their face', fr: 'et vous finissez sur son visage' },
  swallow: { en: 'and they swallow every drop', fr: 'et avale jusqu’à la dernière goutte' }, 'huge load': { en: 'until you shoot a huge load', fr: 'jusqu’à une énorme giclée' },
  dripping: { en: 'and leave them dripping', fr: 'et tout finit par dégouliner' }, precum: { en: 'with you leaking the whole time', fr: 'pendant que vous mouillez sans arrêt' }
};
const HOW = {
  rough: { en: 'rough and impatient', fr: 'brutal et impatient' }, sensual: { en: 'slow and sensual', fr: 'lent et sensuel' },
  dominant: { en: 'with them in full control', fr: 'en gardant le contrôle total' }, submissive: { en: 'letting you take full control', fr: 'en vous laissant tout le contrôle' },
  teasing: { en: 'after a long, slow tease', fr: 'après une longue taquinerie' }, 'dirty talk': { en: 'talking dirty the whole time', fr: 'en parlant cru tout du long' },
  moaning: { en: 'loud enough for the neighbours', fr: 'assez fort pour les voisins' }, bondage: { en: 'with your hands tied', fr: 'les mains attachées' },
  femdom: { en: 'with her in charge', fr: 'avec elle aux commandes' }, 'size difference': { en: 'and the size difference drives you both crazy', fr: 'et la différence de taille vous rend fous' }
};
const WEARS = {
  jockstrap: { en: 'in just a jockstrap', fr: 'en jockstrap' }, underwear: { en: 'in just their underwear', fr: 'en sous-vêtements' },
  lingerie: { en: 'in black lingerie', fr: 'en lingerie noire' }, heels: { en: 'in heels', fr: 'en talons' }, 'yoga pants': { en: 'in tight yoga pants', fr: 'en legging moulant' },
  socks: { en: 'still in their socks', fr: 'encore en chaussettes' }, uniform: { en: 'still in uniform', fr: 'encore en uniforme' }, jeans: { en: 'in tight jeans', fr: 'en jean moulant' },
  shorts: { en: 'in short shorts', fr: 'en short court' }, oiled: { en: 'covered in oil', fr: 'couvert d’huile' }, sweaty: { en: 'still sweaty', fr: 'encore en sueur' }
};
const PREMISE = {
  caught: { en: 'and you nearly get caught', fr: 'et vous manquez de vous faire surprendre' }, cheating: { en: 'while their partner is away', fr: 'pendant que son partenaire est absent' },
  'first time': { en: 'for their very first time', fr: 'pour sa toute première fois' }, casting: { en: 'at a casting that goes much further than planned', fr: 'à un casting qui va bien plus loin que prévu' },
  roleplay: { en: 'while you both pretend to be strangers', fr: 'en faisant semblant d’être des inconnus' }, pov: { en: 'and you film all of it', fr: 'et vous filmez tout' },
  threesome: { en: 'and then a third person joins in', fr: 'puis une troisième personne vous rejoint' }, 'group sex': { en: 'with more people joining one by one', fr: 'avec d’autres qui vous rejoignent un par un' }
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// gender: 'men', 'women' or 'both', from the balance you set.
export function fantasyIdeas(picked = [], { gender = 'both', max = 5 } = {}) {
  const L = lang() === 'fr' ? 'fr' : 'en';
  const has = (table) => picked.filter((c) => table[c]);
  const places = has(PLACES), whos = has(WHO), acts = has(ACTS), hows = has(HOW), wears = has(WEARS), premises = has(PREMISE), finishes = has(FINISH);
  if (!acts.length && !places.length && !whos.length) return [];
  const out = [];
  // Your places first, then a few everyday ones, so one picked place does not make every idea the same.
  const allPlaces = [...places.map((k) => ({ ...PLACES[k], key: k })), ...DEFAULT_PLACES];
  const actList = acts.length ? acts : ['kissing'];
  // Every place with every act, taken in an order where each idea changes both the place and the act when it can.
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
  for (let i = 0; i < order.length && out.length < max; i++) {
    const { place, actKey } = order[i];
    const whoKey = whos.length ? whos[(i + 1) % whos.length] : null;
    const who = whoKey ? WHO[whoKey][L] : DEFAULT_WHO[gender]?.[L] || DEFAULT_WHO.both[L];
    const act = ACTS[actKey][L];
    const extra = [i % 2 && wears.length ? wears[i % wears.length] : null, hows.length ? hows[i % hows.length] : null, premises.length && i % 3 !== 1 ? premises[i % premises.length] : null, finishes.length && i % 2 === 0 ? finishes[i % finishes.length] : null].filter(Boolean);
    const wear = extra.find((x) => WEARS[x]);
    const how = extra.find((x) => HOW[x]);
    const prem = extra.find((x) => PREMISE[x]);
    const fin = extra.find((x) => FINISH[x]);
    let text = `${cap(place[L][0])}, ${who}${wear ? ` ${WEARS[wear][L]}` : ''} ${act[0]}`;
    if (fin) text += ` ${FINISH[fin][L]}`;
    if (how) text += `, ${HOW[how][L]}`;
    if (prem) text += ` ${PREMISE[prem][L]}`;
    const concepts = [...new Set([place.key || null, whoKey, acts.length ? actKey : null, ...extra].filter(Boolean))];
    if (!concepts.length) continue;
    const name = place[L][1];
    if (out.some((f) => f.name === name)) { const alt = `${act[1]}, ${place[L][1].toLowerCase()}`; if (out.some((f) => f.name === alt)) continue; out.push({ name: alt, description: `${text}.`, concepts }); continue; }
    out.push({ name, description: `${text}.`, concepts });
  }
  return out;
}
