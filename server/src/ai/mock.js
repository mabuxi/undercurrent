const VOCAB = ['slow build', 'eye contact', 'teasing', 'outdoor', 'lingerie', 'roleplay', 'praise', 'dominant', 'submissive', 'couple', 'solo', 'amateur', 'cosplay', 'massage', 'shower', 'story driven', 'confession', 'first time', 'romantic', 'rough'];

function field(text, name) {
  const m = text.match(new RegExp(`^${name}:\\s*(.*)$`, 'mi'));
  return m ? m[1] : '';
}

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export async function mockChat({ kind, user, schema }) {
  await new Promise((r) => setTimeout(r, 30));
  if (kind === 'tag' && schema?.properties?.items) {
    const items = user.split('\n').map((line) => {
      const m = line.match(/^#(\d+) \[[^\]]*\] (?:\([^)]*\) )?(.*?)(?: \| |$)/);
      if (!m) return null;
      const h = hash(m[2]);
      const site = (line.match(/site tags: ([^|]*)/)?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
      return { id: Number(m[1]), tags: [...new Set([...site.slice(0, 3), VOCAB[h % VOCAB.length], VOCAB[(h >>> 3) % VOCAB.length], VOCAB[(h >>> 6) % VOCAB.length], 'soft lighting', 'eye contact', 'scene'])], scene: `mock scene for ${m[2].slice(0, 30)}`, people: [], minor_risk: false };
    }).filter(Boolean);
    return { items };
  }
  if (kind === 'tag' && !schema) {
    return user.split('\n').map((line) => {
      const m = line.match(/^#(\d+) \[[^\]]*\] (?:\([^)]*\) )?(.*?)(?: \| |$)/);
      if (!m) return '';
      const h = hash(m[2]);
      const site = (line.match(/site tags: ([^|]*)/)?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
      const tags = [...new Set([...site.slice(0, 3), VOCAB[h % VOCAB.length], VOCAB[(h >>> 3) % VOCAB.length], VOCAB[(h >>> 6) % VOCAB.length], 'soft lighting', 'eye contact', 'slow start'])];
      return `#${m[1]}: ${tags.join(', ')} || scene: mock scene for ${m[2].slice(0, 30)} || people: none || minor: no`;
    }).filter(Boolean).join('\n');
  }
  if (kind === 'tag' && schema?.properties?.items) {
    const items = user.split('\n').map((line) => {
      const m = line.match(/^#(\d+) \[[^\]]*\] (?:\([^)]*\) )?(.*?)(?: \| |$)/);
      if (!m) return null;
      const h = hash(m[2]);
      const site = (line.match(/site tags: ([^|]*)/)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
      return { id: Number(m[1]), tags: [...new Set([...site.slice(0, 4), VOCAB[h % VOCAB.length], VOCAB[(h >>> 3) % VOCAB.length], VOCAB[(h >>> 6) % VOCAB.length], 'soft lighting', 'eye contact'])], people: [], minor_risk: false };
    }).filter(Boolean);
    return { items };
  }
  if (kind === 'tag') {
    const tagsLine = (user.match(/site tags: ([^|]*)/)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const t0 = (user.match(/^#\d+ \[[^\]]*\] (?:\([^)]*\) )?(.*?)(?: \| |$)/)?.[1]) || field(user, 'Title');
    const h0 = hash(t0);
    if (schema?.properties?.scene) return { scene: `Mock scene: ${t0.slice(0, 40)}`, people: [], tags: [...new Set([...tagsLine.slice(0, 6), VOCAB[h0 % VOCAB.length], VOCAB[(h0 >>> 4) % VOCAB.length], 'close up', 'natural light', 'massage turns sexual'])], minor_risk: false };
    if (schema?.properties?.summary) return { tags: [...new Set([...tagsLine.slice(0, 6), VOCAB[h0 % VOCAB.length], VOCAB[(h0 >>> 4) % VOCAB.length], 'close up', 'natural light'])], summary: `Mock description of "${t0.slice(0, 60)}".`, minor_risk: false };
    const title = field(user, 'Title');
    const src = field(user, 'Source tags').split(',').map((s) => s.trim()).filter(Boolean);
    const h = hash(title);
    const extra = [VOCAB[h % VOCAB.length], VOCAB[(h >>> 3) % VOCAB.length], VOCAB[(h >>> 6) % VOCAB.length]];
    const tags = [...new Set([...src.slice(0, 4), ...extra])].map((name, i) => ({ name, kind: 'theme', weight: Math.max(0.3, 0.9 - i * 0.1) }));
    return { tags, summary: `Mock description of "${title.slice(0, 60)}".`, minor_risk: false };
  }
  if (kind === 'translate') return `[FR] ${user}`;
  if (kind === 'dislike') return { reasons: ['soft lighting', 'fake moaning'], note: 'Probably the lighting and the fake moaning.' };
  if (kind === 'ask-parse') return null;
  if (kind === 'search-parse' && schema?.properties?.concepts) {
    const found = (user.match(/quick split found: ([^(.\n]*)/) || [])[1] || '';
    const concepts = found.split(',').map((x) => x.trim()).filter((x) => x && x !== 'nothing').map((tag) => ({ tag, synonyms: [`${tag} pov`, `huge ${tag.split(' ').pop()}`] }));
    return { concepts, gender: 'none', people: [] };
  }
  if (kind === 'search-parse' && schema?.properties?.handles) return { handles: [] };
  if (kind === 'search-agent') {
    const q = user.toLowerCase();
    const actions = [];
    const rm = q.match(/remove (?:the )?(.+?) kink/);
    if (rm) actions.push({ type: 'kink_remove', name: rm[1] });
    const more = q.match(/more (.+?)$/);
    if (more) actions.push({ type: 'tags_like', tags: [more[1]] }, { type: 'search', terms: more[1] });
    const about = q.match(/videos about (.+)$/);
    if (about) actions.push({ type: 'search', terms: about[1], formats: ['long', 'short', 'gif'] });
    return { answer: actions.length ? 'Done, mock assistant.' : 'Mock answer to your question.', actions };
  }
  if (kind === 'like-reason') return { tags: user.toLowerCase().split(/,|\band\b|\bthe\b/).map((x) => x.replace(/[^a-z ]/g, '').trim()).filter((x) => x.length > 2).slice(0, 4) };
  if (kind === 'ask-item') return 'Mock answer: the local model would answer from this post’s title, tags, description and top comments.';
  if (kind === 'summary') return 'Mock summary: tonight you spent most time on a couple of themes and rated a few posts highly.';
  if (kind === 'reflect') {
    const lines = user.split('\n').filter((l) => l.startsWith('- rising:')).slice(0, 2);
    return { memories: [
      { category: 'Kinks and interests', content: 'Keeps coming back to slow, story-driven posts late in the evening.', evidence: 'mock evidence' },
      ...lines.map((l) => ({ category: 'Kinks and interests', content: `Lately more into ${l.replace('- rising:', '').split('(')[0].trim()}.`, evidence: 'rising over the last week' }))
    ] };
  }
  if (kind === 'name-kinks') {
    const groups = [...user.matchAll(/^\d+\.\s*(.*)$/gm)].map((m) => m[1]);
    return { kinks: groups.map((g) => ({ name: g.split(',')[0].trim().replace(/^\w/, (c) => c.toUpperCase()), description: `Built around ${g}.` })) };
  }
  return 'Mock reply.';
}
