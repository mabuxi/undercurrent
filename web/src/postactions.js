import { useCallback, useRef } from 'react';
import { api } from './api.js';
import { t } from './i18n.js';
import { publishItem, useItemSync } from './tk.js';

export const AUTO_UP_HEAT = 2;

// What you can do to a post (like, dislike, save, heat, hide, kinks and tags), shared by the post in the feed and the
// same post in the full screen viewer. Each change shows in both right away.
// `fx` holds the visual and feedback hooks: play(kind) for the reaction in the middle, strong(why) when you were
// clearly into it, onDown(on) for the "what did you not like" note, onHide() when it is hidden.
export function usePostActions(item, setItem, fx) {
  const ref = useRef(item);
  ref.current = item;
  const cb = useRef(fx);
  cb.current = fx;
  const apply = useCallback((patch) => setItem((cur) => ({ ...cur, ...patch })), [setItem]);
  useItemSync(item.id, apply);
  const update = (patch) => {
    ref.current = { ...ref.current, ...patch };
    setItem((cur) => ({ ...cur, ...patch }));
    publishItem(item.id, patch, apply);
  };
  const toast = (m) => cb.current.toast?.(m);

  async function vote(dir) {
    const it = ref.current;
    const next = it.vote === dir ? 0 : dir;
    cb.current.play?.(next > 0 ? 'up' : next < 0 ? 'down' : it.vote > 0 ? 'unup' : 'undown');
    update({ vote: next, autoUp: false, score: (it.score || 0) - (it.vote || 0) + next, upvotes: it.upvotes != null ? it.upvotes - (it.vote > 0 ? 1 : 0) + (next > 0 ? 1 : 0) : null });
    if (next > 0) cb.current.strong?.('up');
    cb.current.onDown?.(next < 0);
    try {
      const r = await api(`/items/${it.id}/vote`, { method: 'POST', body: { dir: next } });
      if (r.synced && next) toast(next > 0 ? t('Upvoted on Reddit too.') : t('Downvoted on Reddit too.'));
      else if (!next && it.vote) toast(it.vote > 0 ? t('Like taken back. What it taught your feed is undone.') : t('Dislike taken back. What it taught your feed is undone.'));
    } catch (e) { toast(e.message); }
  }

  // A double tap likes; when it is already liked it only plays the heart again.
  function like() {
    if (ref.current.vote > 0) cb.current.play?.('up');
    else vote(1);
  }

  async function save() {
    const it = ref.current;
    const on = !it.saved;
    cb.current.play?.(on ? 'save' : 'unsave');
    update({ saved: on });
    if (on) cb.current.strong?.('save');
    try {
      const r = await api(`/items/${it.id}/save`, { method: 'POST', body: { on } });
      toast(on ? (r.synced ? t('Saved here and on Reddit.') : t('Saved.')) : t('Removed from saved. What saving it taught your feed is undone.'));
    } catch (e) { toast(e.message); }
  }

  async function less() {
    const it = ref.current;
    cb.current.play?.('hide');
    cb.current.onHide?.();
    publishItem(it.id, { hiddenNow: true }, apply);
    try {
      await api(`/items/${it.id}/less`, { method: 'POST', body: {} });
      toast(t('Hidden. Pick what you did not like, or leave it.'));
    } catch (e) { toast(e.message); }
  }

  // Finding something hot is liking it: a heat of 2 flames or more upvotes it too (also on Reddit when that is on).
  async function rate(n) {
    const it = ref.current;
    const autoUp = n >= AUTO_UP_HEAT && it.vote <= 0;
    // Heat taken back below two flames also takes back the upvote it gave.
    const autoDown = n < AUTO_UP_HEAT && it.vote > 0 && it.autoUp;
    update({ rating: n, ...(autoUp ? { vote: 1, autoUp: true, upvotes: it.upvotes != null ? it.upvotes + 1 - (it.vote > 0 ? 1 : 0) : null } : autoDown ? { vote: 0, autoUp: false, upvotes: it.upvotes != null ? it.upvotes - 1 : null } : {}) });
    if (n > 0) cb.current.strong?.('rate');
    try {
      await api(`/items/${it.id}/rate`, { method: 'POST', body: { value: n } });
      if (autoUp) await api(`/items/${it.id}/vote`, { method: 'POST', body: { dir: 1 } });
      if (autoDown) await api(`/items/${it.id}/vote`, { method: 'POST', body: { dir: 0 } });
      if (!n) { toast(autoDown ? t('Heat and upvote taken back. What they taught your feed is undone.') : t('Heat taken back. What it taught your feed is undone.')); return; }
      toast(n >= 4 ? (autoUp ? t('On fire and upvoted. Your feed goes deeper into this.') : t('On fire. Your feed goes deeper into this.')) : (autoUp ? t('Noted how hot this was, and upvoted it. It counts more than an upvote.') : t('Noted how hot this was. It counts more than an upvote.')));
    } catch (e) { toast(e.message); }
  }

  // Put this post in one of your kinks, or take it out when the tagging got it wrong.
  async function setKink(k, on) {
    try {
      const r = await api(`/items/${ref.current.id}/kinks`, { method: 'POST', body: { kink: k.id, on } });
      update({ kinks: r.item.kinks, tags: r.item.tags });
      toast(on ? t('Added to {name}.', { name: k.name }) : t('Taken out of {name}: the tags that put it there are removed from this post.', { name: k.name }));
      cb.current.refreshMeta?.();
    } catch (e) { toast(e.message); }
  }

  async function dropTag(tag) {
    update({ tags: (ref.current.tags || []).filter((x) => (typeof x === 'string' ? x : x.name) !== tag) });
    try {
      const r = await api(`/items/${ref.current.id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
      if (r.item) { const { vote: _v, ...rest } = r.item; update(rest); }
      toast(t('{tag} taken off this post. The tagger will use it more carefully.', { tag }));
    } catch (e) { toast(e.message); }
  }

  return { vote, like, save, less, rate, setKink, dropTag, update };
}
