import { getDb, now, normalizeTag } from '../db.js';
import { chat, fastModel } from './ollama.js';
import { extractFromText } from './extract.js';
import { listKinks, listFantasies, createKink } from '../kinks.js';
import { topTags, applyEvent, boostTags } from '../profile.js';
import { memoryForPrompt, addMemory, CATEGORIES, logPrompt } from '../memory.js';
import { getItem, itemTags, recheckBlocks, addTags } from '../store.js';
import { follow, rememberSearch } from '../ingest.js';
import { PROVIDERS } from '../sources/providers.js';
import { sourcesForTopic } from '../discover.js';
import { tr, trn, replyIn } from '../i18n.js';

const FORMATS = ['long', 'short', 'gif', 'image', 'set', 'story', 'discussion'];

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['filter', 'open', 'journey', 'remember', 'block', 'stop_showing', 'into_now', 'create_kink', 'save_item', 'rate_item', 'follow', 'hide_item', 'more_like_item', 'like', 'dislike', 'like_reason'] },
          formats: { type: 'array', items: { type: 'string', enum: FORMATS } },
          length: { type: 'string', enum: ['any', 'quick', 'medium', 'long'] },
          tags: { type: 'array', items: { type: 'string' } },
          search: { type: 'string' },
          kink: { type: 'string' },
          fantasy: { type: 'string' },
          only_new: { type: 'boolean' },
          following: { type: 'boolean' },
          saved: { type: 'boolean' },
          view: { type: 'string', enum: ['feed', 'map', 'memory', 'settings'] },
          mode: { type: 'string', enum: ['close', 'branch', 'surprise', 'genre'] },
          category: { type: 'string', enum: CATEGORIES },
          text: { type: 'string' },
          name: { type: 'string' },
          rating: { type: 'number' }
        },
        required: ['type']
      }
    }
  },
  required: ['reply', 'actions']
};

function words(s) { return s.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean); }

function knownTagsIn(s) {
  const known = new Set(topTags({ by: 'long', limit: 500 }).map((t) => t.name).filter(Boolean));
  for (const r of getDb().prepare('SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id GROUP BY t.id ORDER BY COUNT(*) DESC LIMIT 800').all()) known.add(r.name);
  const w = words(s);
  const hits = [];
  for (let i = 0; i < w.length; i++) for (const len of [3, 2, 1]) {
    const phrase = w.slice(i, i + len).join(' ');
    if (phrase.length > 2 && known.has(phrase) && !hits.some((h) => h.includes(phrase))) hits.push(phrase);
  }
  return hits;
}

export function rulesParse(q, item) {
  const s = q.toLowerCase().trim();
  const kinks = listKinks({ includeHidden: true });
  const fantasies = listFantasies();
  const kink = kinks.find((k) => s.includes(k.name.toLowerCase()) || (k.label && s.includes(k.label.toLowerCase())));
  const fan = fantasies.find((f) => s.includes(f.name.toLowerCase()));
  const actions = [];
  let m;
  if ((m = s.match(/^(?:remember|note|save (?:a )?memory|keep in mind)(?: that)?[:,]?\s+(.+)/i))) {
    const text = q.slice(q.length - m[1].length);
    const cat = /never|hate|don'?t like|dislike|turn.?off/i.test(text) ? 'Turn-offs and limits' : /fantas/i.test(text) ? 'Fantasies' : /video|story|stories|short|long|gif/i.test(text) ? 'Formats and moods' : 'Kinks and interests';
    return { actions: [{ type: 'remember', category: cat, text }] };
  }
  if ((m = s.match(/^(?:please\s+)?(?:stop|quit)\s+showing(?:\s+me)?\s+(.+)|^(?:don'?t|do not)\s+show(?:\s+me)?(?:\s+any(?:\s+more)?)?\s+(.+)/))) return { actions: [{ type: 'stop_showing', name: (m[1] || m[2]).replace(/^(any|all|more)\s+/, '').replace(/\s+(anymore|any more|please)$/, '').trim() }] };
  if ((m = s.match(/^(?:i'?m|i am)?\s*(?:really|so|super)?\s*into\s+(.+?)\s+(?:right now|lately|tonight|at the moment)$|^(?:right now|lately|tonight)[, ]+i'?m\s+(?:really\s+)?into\s+(.+)$/))) {
    const what = (m[1] || m[2]).trim();
    if (/^(this|that|it)$/.test(what) && item) return { actions: [{ type: 'into_now', text: '', fromItem: true }] };
    return { actions: [{ type: 'into_now', text: what }] };
  }
  if (item && (m = s.match(/^(?:i\s+)?(?:really\s+)?(?:liked|loved|like|love|enjoyed|dug|was into)(?:\s+(?:this|it|that))?(?:\s+(?:because|for|cause|since))?(?:\s+of)?[:,]?\s+(.+)/))) return { actions: [{ type: 'like_reason', text: q.trim().slice(q.trim().length - m[1].length) }] };
  if ((m = s.match(/^(?:i\s+)?(?:don'?t|do not|didn'?t)\s+(?:really\s+)?(?:like|want|enjoy|care for)\s+(.+)|^i\s+(?:hate|dislike)\s+(.+)|^(?:not into|no more of)\s+(.+)/))) return { actions: [{ type: 'dislike', text: (m[1] || m[2] || m[3]).trim() }] };
  if (!item && (m = s.match(/^(?:i\s+)?(?:want|wanna|would like|'d like|need)\s+(?:to\s+(?:see|watch|get|have)\s+)?more(?:\s+of)?\s+(.+)|^(?:show|give)\s+me\s+more(?:\s+of)?\s+(.+)|^more\s+(?!like\b)(.+?)(?:\s+please)?$/))) return { actions: [{ type: 'like', text: (m[1] || m[2] || m[3]).replace(/\s+please$/, '').trim() }] };
  if ((m = s.match(/^(?:i\s+)?(?:really\s+)?(?:like|love|enjoy|adore|prefer|want more(?: of)?|am into|'m into)\s+(.+)|^i'?m\s+(?:really\s+)?into\s+(.+)/))) return { actions: [{ type: 'like', text: (m[1] || m[2]).trim() }] };
  if ((m = s.match(/^(?:block|never show(?: me)?|hide all|no more)\s+(.+)/i))) return { actions: [{ type: 'block', name: m[1].replace(/^(any|all)\s+/, '').trim() }] };
  if ((m = s.match(/^(?:create|make|add)(?: a)?(?: new)? kink(?: called| named)?\s+["']?([^"',]+?)["']?(?:\s+(?:with|from)(?: tags?)?\s+(.+))?$/i))) {
    return { actions: [{ type: 'create_kink', name: m[1].trim(), tags: (m[2] || m[1]).split(/,|\band\b/).map((x) => x.trim()).filter(Boolean) }] };
  }
  if (item) {
    if (/^(save|bookmark)( this| it)?$/.test(s)) return { actions: [{ type: 'save_item' }] };
    if ((m = s.match(/^(?:rate|give)(?: this| it)?\s*(\d)/))) return { actions: [{ type: 'rate_item', rating: Number(m[1]) }] };
    if (/^(hide|less like this|not for me|skip)( this)?$/.test(s)) return { actions: [{ type: 'hide_item' }] };
    if (/more like (this|that|it)|similar/.test(s)) return { actions: [{ type: 'more_like_item' }] };
    if ((m = s.match(/^follow(?: this)?(?: (performer|creator|person|her|him|them))?\s*(.*)$/))) return { actions: [{ type: 'follow', name: m[2]?.trim() || '' }] };
  }
  if ((m = s.match(/^follow\s+(.+)/))) return { actions: [{ type: 'follow', name: q.trim().slice(q.trim().length - m[1].length).trim() }] };
  if (/journey|guide me|take me (on|through)/.test(s)) {
    return { actions: [{ type: 'journey', kink: kink?.name, fantasy: fan?.name, mode: /branch|new|different|explore/.test(s) ? 'branch' : fan || kink ? 'close' : 'surprise' }] };
  }
  if (/^(open |show |go to )?(my )?(map|lately|patterns?)$/.test(s) || /what (am i|have i been) (into|watching)/.test(s)) return { actions: [{ type: 'open', view: 'map' }] };
  if (/^(open |show )?(my )?memor(y|ies)$/.test(s)) return { actions: [{ type: 'open', view: 'memory' }] };
  if (/^(open )?settings$/.test(s)) return { actions: [{ type: 'open', view: 'settings' }] };
  const f = { type: 'filter' };
  if (fan) f.fantasy = fan.name;
  if (kink) f.kink = kink.name;
  const fm = [];
  if (/\bgifs?\b|loops?/.test(s)) fm.push('gif');
  if (/short[- ]?form|shorts\b|clips?/.test(s)) fm.push('short');
  if (/long[- ]?form|full videos?|long videos?/.test(s)) fm.push('long');
  if (/\bvideos?\b/.test(s) && !fm.length) fm.push('long', 'short');
  if (/image sets?|galler|albums?/.test(s)) fm.push('set');
  else if (/images?|photos?|pictures?|pics/.test(s)) fm.push('image', 'set');
  if (/stor(y|ies)|to read|written|erotica/.test(s)) fm.push('story');
  if (/discussion|threads?|conversations?/.test(s)) fm.push('discussion');
  if (fm.length) f.formats = [...new Set(fm)];
  if (/\blong\b/.test(s) && !fm.includes('long')) f.length = 'long';
  if (/\bquick\b|\bshort\b(?!-)/.test(s) && !fm.includes('short')) f.length = 'quick';
  if (/\bnew\b|discover|surprise|something different/.test(s)) f.only_new = true;
  if (/\bfollow(ing|ed)\b/.test(s)) f.following = true;
  if (/\bsaved\b/.test(s)) f.saved = true;
  const kn = kink ? kink.name.toLowerCase() : '';
  const tags = knownTagsIn(s).filter((t) => !kn.includes(t));
  if (tags.length) f.tags = tags;
  const sm = s.match(/^(?:search|find|look for|look up)\s+(?:for\s+)?(.+)$/);
  if (sm && !kink && !fan) {
    delete f.tags;
    const rest = sm[1].replace(/\b(videos?|clips?|gifs?|images?|photos?|pictures?|stories|threads?|posts?|long form|short form)\b/g, '').trim();
    if (rest) f.search = rest;
  }
  const sm2 = !sm && s.match(/^(?:show me|show)\s+(.+)$/);
  if (sm2 && !tags.length && !kink && !fan) {
    const rest = sm2[1].replace(/\b(videos?|clips?|gifs?|images?|photos?|pictures?|stories|threads?|posts?|long form|short form|some|more)\b/g, '').trim();
    if (rest) f.search = rest;
  }
  if (Object.keys(f).length > 1) return { actions: [f] };
  return null;
}

const REASON_SCHEMA = { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] };

async function textToTags(text, item) {
  const found = extractFromText(text).tags.map((t) => t.name);
  const ctx = item ? ` The post: "${item.title}". Its tags: ${itemTags(item.id).slice(0, 25).map((t) => t.name).join(', ')}.` : '';
  try {
    const out = await chat({ kind: 'like-reason', model: fastModel(), schema: REASON_SCHEMA, temperature: 0.1, numPredict: 160,
      system: `Turn what an adult user says he likes (or dislikes) about adult content into 1 to 6 short, specific lowercase tags (1 to 3 words each) that can be matched against posts. Reuse the post's tags when they fit.${ctx}`,
      user: text });
    return [...new Set([...found, ...(out?.tags || []).map((t) => normalizeTag(t)).filter((t) => t && t.length < 40)])].slice(0, 8);
  } catch {
    return found.length ? found : [normalizeTag(text)].filter((t) => t && t.split(' ').length <= 4);
  }
}

async function llmParse(q, item) {
  const kinks = listKinks().map((k) => k.name);
  const fantasies = listFantasies().map((f) => f.name);
  const tags = topTags({ by: 'long', limit: 80 }).map((t) => t.name).filter(Boolean);
  const ctx = item ? `\nThe user is looking at this post: "${item.title}" by ${item.author || item.community} on ${item.source}. Tags: ${itemTags(item.id).slice(0, 20).map((t) => t.name).join(', ')}.${item.aiSummary ? ` Description: ${item.aiSummary}` : ''}` : '';
  const system = `You operate a private, local adult-content browser for one adult user. Turn what they say into actions and do them. Never just explain.
Actions: like (text: something they say they like in general, saved to memory), dislike (text: something they are not into, softer than a limit), into_now (text: something they are into right now, a current mood; empty text means the current post), stop_showing (name: something they never want to see again; it becomes a hard limit), like_reason (text: why they liked the current post; this is feedback on one post, not memory), filter (set the feed: formats, length, tags, search text, kink, fantasy, only_new, following, saved), open (view: feed, map, memory, settings), journey (kink or fantasy, mode close/branch/surprise), remember (category + text, a note about their taste), block (name: a tag to never show), create_kink (name + tags), save_item, rate_item (rating 1-5), follow (name of a performer or creator; empty to follow the current post's), hide_item, more_like_item.
Formats: long = long-form video, short = short-form video, gif, image, set = image sets, story, discussion.
Their kinks: ${kinks.join(', ') || 'none yet'}. Fantasies: ${fantasies.join(', ') || 'none yet'}. Tags they know: ${tags.join(', ') || 'none yet'}.
Memory:
${memoryForPrompt(25) || '- nothing yet'}${ctx}
Searches, questions and one-off requests are never memory: only use like, dislike, into_now, stop_showing or remember when they state something about their taste.
If they only ask a question about the post, answer it in reply with no actions. reply is one short, plain sentence saying what you did or the answer. ${replyIn()}`;
  return chat({ kind: 'ask-parse', system, user: q, schema: SCHEMA, temperature: 0.1, model: fastModel() });
}

function performerOf(item) {
  const perf = item?.media?.performers || [];
  return perf[0] || item?.author || null;
}

function sourcesFor(name, item) {
  const out = [];
  if (item?.author && PROVIDERS[item.source]?.can?.creator && name === item.author) out.push({ kind: 'creator', value: `${item.source}|${name}` });
  else {
    for (const id of ['pornhub', 'redtube']) out.push({ kind: 'creator', value: `${id}|${name}` });
    for (const id of ['eporner', 'redgifs']) out.push({ kind: 'search', value: `${id}|${name}` });
  }
  return out;
}

export async function runCommand(q, { itemId = null, sessionId = null } = {}) {
  const item = itemId ? getItem(Number(itemId)) : null;
  let parsed = rulesParse(q, item);
  let engine = 'rules';
  let reply = null;
  if (!parsed) {
    try {
      parsed = await llmParse(q, item);
      engine = 'model';
      reply = parsed?.reply || null;
    } catch (err) {
      return { reply: tr("I couldn't reach the local model ({error}). Try a simpler command like \"long form videos\", \"search latex\" or \"remember I like slow builds\".", { error: err.message }), client: [], engine: 'none' };
    }
  }
  const client = [];
  const done = [];
  let memoryNote = false;
  for (const a of parsed?.actions || []) {
    if (a.type === 'filter') {
      const f = {};
      if (a.formats?.length) f.formats = a.formats.filter((x) => FORMATS.includes(x));
      if (a.length && a.length !== 'any') f.length = a.length;
      if (a.tags?.length) f.tags = a.tags.map(normalizeTag).filter(Boolean);
      if (a.search) f.q = a.search;
      if (a.kink) f.kink = a.kink;
      if (a.fantasy) f.fantasy = a.fantasy;
      if (a.only_new) f.onlyNew = true;
      if (a.following) f.following = true;
      if (a.saved) f.saved = true;
      client.push({ type: 'filter', filters: f });
      if (f.q || f.tags?.length) {
        rememberSearch(f.q || f.tags.join(' '));
        const learn = [...(f.tags || []), ...(f.q ? extractFromText(f.q).tags.map((t) => t.name) : [])];
        if (learn.length) boostTags(learn, 0.35);
        applyEvent({ itemId: null, type: 'search', value: null, sessionId });
      }
      done.push(tr('showing {what}', { what: [a.search && `"${a.search}"`, a.kink, a.fantasy, ...(a.tags || []), ...(a.formats || []).map((x) => ({ long: tr('long form'), short: tr('short form'), set: tr('image sets') }[x] || tr(`${x}s`))), a.length && a.length !== 'any' && ({ quick: tr('quick ones'), medium: tr('medium ones'), long: tr('long ones') }[a.length] || `${a.length} ones`), a.only_new && tr('new to you'), a.following && tr('following'), a.saved && tr('saved')].filter(Boolean).join(', ') || tr('your mixed feed') }));
    } else if (a.type === 'open') {
      client.push({ type: 'open', view: a.view || 'feed' });
      done.push({ feed: tr('opened the feed'), map: tr('opened your map'), memory: tr('opened memory'), settings: tr('opened settings') }[a.view] || tr('opened {view}', { view: a.view }));
    } else if (a.type === 'journey') {
      client.push({ type: 'journey', kink: a.kink || null, fantasy: a.fantasy || null, mode: a.mode || 'surprise' });
      done.push(tr('started a journey'));
    } else if (a.type === 'remember' && a.text) {
      addMemory({ category: CATEGORIES.includes(a.category) ? a.category : 'Notes', content: a.text, origin: 'user' });
      memoryNote = true;
      done.push(tr('saved that to your memory'));
    } else if ((a.type === 'block' || a.type === 'stop_showing') && a.name) {
      // Hidden completely: a hard limit plus a memory, as asked.
      const t = normalizeTag(a.name);
      const also = a.type === 'stop_showing' ? (await textToTags(a.name, null)).filter((x) => x !== t && x.split(' ').length <= 2).slice(0, 2) : [];
      for (const x of [t, ...also]) getDb().prepare('INSERT OR IGNORE INTO limits(tag, created) VALUES(?, ?)').run(x, now());
      const r = recheckBlocks();
      boostTags([t, ...also], -2);
      addMemory({ category: 'Turn-offs and limits', content: tr('Never show {what}', { what: a.name.trim() }), origin: 'user', status: 'active' });
      memoryNote = true;
      const list = `"${[t, ...also].join('", "')}"`;
      done.push(tr('{what}{hidden}; it is a hard limit now and saved to memory', { what: a.type === 'block' ? tr('blocked {list}', { list }) : tr("you won't see {list} anymore", { list }), hidden: r.blocked ? ` ${trn(r.blocked, '({n} post hidden)', '({n} posts hidden)')}` : '' }));
      client.push({ type: 'refresh' });
    } else if (a.type === 'into_now') {
      const tags = a.fromItem || !a.text ? (item ? itemTags(item.id).filter((t) => t.kind !== 'performer' && t.weight >= 0.45).slice(0, 4).map((t) => t.name) : []) : await textToTags(a.text, item);
      if (!tags.length) { done.push(tr('couldn’t tell what you mean')); continue; }
      boostTags(tags, 1.2);
      addMemory({ category: 'Right now', content: tr('Into {what} right now', { what: a.text || tags.slice(0, 3).join(', ') }), origin: 'user', status: 'active' });
      memoryNote = true;
      let srcs = [];
      try { srcs = await sourcesForTopic(a.text || tags[0], tags, { origin: 'ask' }); } catch {}
      if (srcs.length) client.push({ type: 'fetch' });
      client.push({ type: 'filter', filters: { tags: tags.slice(0, 2) } });
      done.push(tr('noted you are into {tags} right now; saved under "Right now"{sources} and showing more of it', { tags: tags.slice(0, 3).join(', '), sources: srcs.length ? tr(', added {list} as sources', { list: srcs.slice(0, 3).join(', ') }) : '' }));
    } else if (a.type === 'create_kink' && a.name) {
      createKink({ name: a.name, tags: (a.tags?.length ? a.tags : [a.name]).map(normalizeTag), origin: 'user' });
      done.push(tr('created the kink "{name}"', { name: a.name }));
      client.push({ type: 'meta' });
    } else if (a.type === 'save_item' && item) {
      applyEvent({ itemId: item.id, type: 'save', sessionId });
      client.push({ type: 'item', patch: { saved: true } });
      done.push(tr('saved it'));
    } else if (a.type === 'rate_item' && item && a.rating) {
      const v = Math.max(1, Math.min(5, Math.round(a.rating)));
      applyEvent({ itemId: item.id, type: 'rate', value: v, sessionId });
      client.push({ type: 'item', patch: { rating: v } });
      done.push(trn(v, 'rated it {n} flame', 'rated it {n} flames'));
    } else if (a.type === 'hide_item' && item) {
      applyEvent({ itemId: item.id, type: 'less', sessionId });
      client.push({ type: 'item', patch: { hidden: true } });
      done.push(tr('hid it and will show less like it'));
    } else if (a.type === 'more_like_item' && item) {
      const tags = itemTags(item.id).filter((t) => t.kind !== 'performer').slice(0, 3).map((t) => t.name);
      applyEvent({ itemId: item.id, type: 'more', sessionId });
      client.push({ type: 'filter', filters: { tags }, focus: item.id });
      done.push(tr('showing more with {tags}', { tags: tags.join(', ') }));
    } else if ((a.type === 'like' || a.type === 'dislike') && a.text) {
      const tags = await textToTags(a.text, null);
      const pos = a.type === 'like';
      boostTags(tags, pos ? 1.5 : -1.5);
      addMemory({ category: pos ? 'Kinks and interests' : 'Turn-offs and limits', content: pos ? tr('Likes {what}', { what: a.text }) : tr('Not really into {what}', { what: a.text }), origin: 'user', status: 'active' });
      memoryNote = true;
      let srcs = [];
      if (pos && tags.length) {
        try { srcs = await sourcesForTopic(a.text, tags, { origin: 'ask' }); } catch {}
        if (srcs.length) client.push({ type: 'fetch' });
      }
      if (pos && tags.length) client.push({ type: 'filter', filters: { tags } });
      else client.push({ type: 'refresh' });
      done.push(pos ? tr('noted that you like {what}, saved it to memory{sources} and showing it now', { what: tags.join(', ') || a.text, sources: srcs.length ? tr(', added {list} as sources', { list: srcs.slice(0, 4).join(', ') }) : '' }) : tr('noted, less {what} from now on (say "block {tag}" to never see it)', { what: tags.join(', ') || a.text, tag: tags[0] || a.text }));
    } else if (a.type === 'like_reason' && item && a.text) {
      const tags = await textToTags(a.text, item);
      if (tags.length) addTags(item.id, tags.map((name) => ({ name, weight: 1 })), 'user');
      applyEvent({ itemId: item.id, type: 'reason', value: null, sessionId });
      boostTags(tags, 1.2);
      client.push({ type: 'item', patch: { reasonTags: tags } });
      done.push(tags.length ? tr('got it: {tags}. That counts for your feed now', { tags: tags.join(', ') }) : tr('noted'));
    } else if (a.type === 'follow') {
      const name = a.name || performerOf(item);
      if (!name) { done.push(tr('couldn’t tell who to follow')); continue; }
      for (const f of sourcesFor(name, item)) follow(f.kind, f.value, { label: name });
      done.push(tr('following {name}', { name }));
      client.push({ type: 'fetch' });
    }
  }
  const text = reply || (done.length ? `${done[0][0].toUpperCase()}${done.join(', ').slice(1)}.` : tr('I couldn’t turn that into an action. Try "search latex", "long form videos", "remember I like slow builds" or "block feet".'));
  const types = (parsed?.actions || []).map((a) => a.type);
  const kind = memoryNote ? 'memory' : types.includes('filter') ? 'search' : !types.length ? 'question' : types.includes('like_reason') ? 'feedback' : 'command';
  try { logPrompt({ text: q, kind, result: text, itemId: item?.id }); } catch {}
  return { reply: text, client, engine, kind };
}
