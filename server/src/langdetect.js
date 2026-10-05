// Which language a title or text is written in, from its most common little words. Quick enough to run on every
// post, careful enough to say nothing when it is not sure (short titles full of tags and names often are not).

const WORDS = {
  en: 'the and you that was for with this have are but not they his her she what all were when your can there been one would will just like about out them then some could into than him only also back after how our these over first well even because any most where why who now did really know got its very said going me my is it in on at to of be do so if or an by up no as we us am',
  fr: 'un à j qu c n s m l d le la les des une est que qui pas pour dans avec sur mais elle il ils nous vous je tu son sa ses ce cette sont ont été être avoir fait comme plus tout très aussi bien mon ma mes ton ta tes leur leurs du au aux en et ou où quand moi toi lui ça cela alors après avant encore jamais toujours rien chez parce suis était avait peu même',
  nl: 'de het een en van ik je dat die niet is in op te met voor zijn was maar ook als er aan bij nog dan wat om hij zij we wij mijn naar heb heeft hebben werd geen kan wel zo al uit nu toen maar door over dit deze jij jullie ze hem haar',
  de: 'der die das und ist nicht ein eine ich du er sie es wir ihr mit für auf aber auch wie noch nach wenn dass bei sich vom zum zur oder haben hat hatte war waren wird sein mein dein kein schon doch nur mal sehr',
  es: 'el la los las un una que de y en es por con para no se lo como pero más sus su al del me mi muy ya cuando también fue era hay este esta eso todo nos le les sí',
  it: 'il lo la gli le un una che di e è non per con su ma come più anche sono era suo sua mi ti ci si questo questa quando molto tutto dei degli delle nel nella alla al',
  pt: 'o a os as um uma que de e é não para com por mas como mais seu sua ele ela eu você nós me muito já quando também foi era tem são isso esta este do da dos das no na'
};
const SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(/\s+/))]));
// Letters that belong to one language only.
const MARKS = { fr: /[àâçèêëîïôûùœ]/g, de: /[äöüß]/g, es: /[ñ¿¡]/g, pt: /[ãõ]/g, it: /\b(?:è|perché|però)\b/g };

export function detectLang(text, { min = 3 } = {}) {
  const s = String(text || '').slice(0, 1200).toLowerCase();
  if (!s.trim()) return null;
  const words = s.replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}' ]+/gu, ' ').split(/[\s']+/).filter(Boolean);
  if (words.length < 3) return null;
  const score = {};
  for (const [k, set] of Object.entries(SETS)) score[k] = words.reduce((a, w) => a + (set.has(w) ? 1 : 0), 0);
  for (const [k, re] of Object.entries(MARKS)) score[k] += Math.min(3, (s.match(re) || []).length * 0.5);
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [best, top] = ranked[0];
  const second = ranked[1][1];
  // Enough little words, and clearly more of one language than of the next.
  if (top < min || top - second < 1 || top < second * 1.3) return null;
  return best;
}

// The language of a post's title and of its text, or null when it cannot be told.
export function postLangs(item) {
  const title = detectLang(item.title, { min: 2 });
  const body = item.body ? detectLang(item.body) : null;
  return { title: title || (body && detectLang(`${item.title} ${String(item.body).slice(0, 300)}`) === body ? body : null), body };
}
