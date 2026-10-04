import { listKinks, kinkPairs, listFantasies } from './kinks.js';
import { affinityMap, topTags } from './profile.js';
import { kinkableTag, displayTag } from './tagquality.js';
import { getDb } from './db.js';

// "Right now": what you are into at the moment, as quick picks. Never tied to a kind of post (that is what the
// format chips are for), and each pick says what it is: a kink, a tag, a pair, a person, a creator or a fantasy.
export function presets() {
  const kinks = listKinks().filter((k) => !k.isGroup && k.status === 'active');
  const aff = affinityMap();
  const out = [];
  const byNow = kinks.slice().sort((a, b) => b.now + b.lately * 0.5 - a.now - a.lately * 0.5);
  for (const k of byNow.slice(0, 3)) out.push({ kind: 'kink', label: k.name, match: Math.round((k.now * 2 + k.lately) / 3), filters: { kink: k.id } });
  const inKinks = new Set(kinks.flatMap((k) => k.tags.map((t) => t.name)));
  const now = topTags({ by: 'short', limit: 20 }).filter((t) => t.name && t.short > 0.05 && kinkableTag(t.name) && !inKinks.has(t.name));
  for (const t of now.filter((x) => x.kind !== 'performer').slice(0, 3)) out.push({ kind: 'tag', label: displayTag(t.name), match: Math.round(50 + 49 * Math.tanh(t.short / 2)), filters: { tags: [t.name] } });
  const perf = getDb().prepare("SELECT id, name FROM tags WHERE kind = 'performer'").all()
    .map((p) => ({ ...p, v: (aff.get(`t:${p.id}`)?.short || 0) + 0.3 * (aff.get(`t:${p.id}`)?.lately || 0) }))
    .filter((p) => p.v > 0.2).sort((a, b) => b.v - a.v)[0];
  if (perf) out.push({ kind: 'person', label: displayTag(perf.name), match: Math.round(50 + 49 * Math.tanh(perf.v / 2)), filters: { tags: [perf.name] } });
  let creator = null;
  for (const [k, v] of aff) {
    if (!(k.startsWith('c:') || k.startsWith('a:'))) continue;
    const s = (v.short || 0) + 0.3 * (v.lately || 0);
    if (s > 0.3 && (!creator || s > creator.s)) creator = { k, s };
  }
  if (creator) {
    const isComm = creator.k.startsWith('c:');
    const name = isComm ? creator.k.slice(2) : creator.k.split(':').slice(2).join(':');
    if (name) out.push({ kind: 'creator', label: name, match: Math.round(50 + 49 * Math.tanh(creator.s / 2)), filters: isComm ? { community: name } : { author: name } });
  }
  const pair = kinkPairs(kinks)[0];
  if (pair) out.push({ kind: 'pair', label: `${pair.a.name} × ${pair.b.name}`, match: pair.score, filters: { pair: [pair.a.id, pair.b.id] } });
  const fan = listFantasies().filter((f) => f.saved).sort((a, b) => b.match - a.match)[0];
  if (fan) out.push({ kind: 'fantasy', label: fan.name, match: fan.match, filters: { fantasy: fan.id } });
  out.sort((a, b) => b.match - a.match);
  const list = out.slice(0, 9);
  list.push({ kind: 'new', label: 'New to you', match: null, filters: { onlyNew: true } });
  return list;
}
