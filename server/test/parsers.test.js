import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { normalizePost, classifyVideo } from '../src/sources/reddit.js';
import { normalizeBooru } from '../src/sources/booru.js';
import { normalizeGif } from '../src/sources/redgifs.js';

openDb(':memory:');

const base = { id: 'abc', title: 'Hello', author: 'someone', subreddit: 'test', permalink: '/r/test/comments/abc/hello/', ups: 120, num_comments: 7, created_utc: 1700000000, over_18: true };

test('reddit hosted video becomes a video with HLS and a format by duration', () => {
  const p = normalizePost({ ...base, is_video: true, secure_media: { reddit_video: { hls_url: 'https://v.redd.it/x/HLSPlaylist.m3u8', fallback_url: 'https://v.redd.it/x/DASH_720.mp4', duration: 412, width: 1280, height: 720 } }, preview: { images: [{ source: { url: 'https://preview.redd.it/p.jpg', width: 1280, height: 720 }, resolutions: [{ url: 'https://preview.redd.it/p640.jpg', width: 640 }] }] } });
  assert.equal(p.media.kind, 'video');
  assert.equal(p.format, 'long');
  assert.equal(p.media.hls, 'https://v.redd.it/x/HLSPlaylist.m3u8');
  assert.equal(p.media.poster, 'https://preview.redd.it/p640.jpg');
  assert.equal(p.community, 'r/test');
});

test('redgifs links are recognised and keep their id', () => {
  const p = normalizePost({ ...base, url: 'https://www.redgifs.com/watch/SomeFancyName', domain: 'redgifs.com' });
  assert.equal(p.media.kind, 'redgifs');
  assert.equal(p.media.redgifsId, 'somefancyname');
});

test('galleries keep order and animated items', () => {
  const p = normalizePost({ ...base, is_gallery: true, gallery_data: { items: [{ media_id: 'b' }, { media_id: 'a' }] }, media_metadata: {
    a: { status: 'valid', e: 'Image', s: { u: 'https://i.redd.it/a.jpg', x: 800, y: 1000 }, p: [{ u: 'https://preview.redd.it/a640.jpg', x: 640 }] },
    b: { status: 'valid', e: 'AnimatedImage', s: { mp4: 'https://i.redd.it/b.mp4', x: 500, y: 500 } }
  } });
  assert.equal(p.format, 'set');
  assert.equal(p.media.items[0].type, 'video');
  assert.equal(p.media.items[1].mid, 'https://preview.redd.it/a640.jpg');
});

test('gifs prefer the mp4 variant', () => {
  const p = normalizePost({ ...base, url: 'https://i.redd.it/x.gif', preview: { images: [{ source: { url: 'https://preview.redd.it/x.gif', width: 400, height: 300 }, variants: { mp4: { source: { url: 'https://preview.redd.it/x.mp4' } } } }] } });
  assert.equal(p.format, 'gif');
  assert.equal(p.media.src, 'https://preview.redd.it/x.mp4');
});

test('self posts split into stories and discussions by length', () => {
  const long = normalizePost({ ...base, is_self: true, selftext: 'word '.repeat(900) });
  const short = normalizePost({ ...base, is_self: true, selftext: 'What should I try next?' });
  assert.equal(long.format, 'story');
  assert.equal(long.media.readMin, 4);
  assert.equal(short.format, 'discussion');
});

test('crossposts use the parent media', () => {
  const p = normalizePost({ ...base, id: 'child', crosspost_parent_list: [{ ...base, id: 'parent', url: 'https://redgifs.com/watch/parentclip', domain: 'redgifs.com' }] });
  assert.equal(p.ext_id, 'child');
  assert.equal(p.media.redgifsId, 'parentclip');
});

test('video classification: short form, long form, gif', () => {
  assert.equal(classifyVideo(45, 720, 1280, true), 'short');
  assert.equal(classifyVideo(600, 1280, 720, true), 'long');
  assert.equal(classifyVideo(8, 500, 500, false), 'gif');
});

test('booru posts become image or video with readable tags', () => {
  const v = normalizeBooru('rule34', { id: 5, file_url: 'https://ws.rule34.xxx/images/x.mp4', preview_url: 'https://ws.rule34.xxx/thumb.jpg', tags: 'tag_one tag_two sound', score: 10, width: 1920, height: 1080, rating: 'explicit', owner: 'uploader' });
  assert.equal(v.media.kind, 'video');
  assert.equal(v.media.hasAudio, true);
  assert.equal(v.title, 'tag one, tag two, sound');
  const i = normalizeBooru('rule34', { id: 6, file_url: 'https://ws.rule34.xxx/images/y.png', sample_url: 'https://ws.rule34.xxx/s.jpg', tags: 'a b', rating: 'explicit' });
  assert.equal(i.format, 'image');
  assert.equal(i.media.mid, 'https://ws.rule34.xxx/s.jpg');
});

test('redgifs gifs normalise with their tags and silent loops as GIFs', () => {
  const g = normalizeGif({ id: 'abc', type: 1, duration: 9, width: 500, height: 900, hasAudio: false, tags: ['one', 'two'], userName: 'creator', likes: 50, createDate: 1700000000 });
  assert.equal(g.format, 'gif');
  assert.deepEqual(g.tags, ['one', 'two']);
  assert.equal(g.author, 'creator');
});

import { pornhub, redtube, eporner } from '../src/sources/tubes.js';

test('tube APIs normalise to long-form embeds with tags', () => {
  const ph = pornhub.normalize({ duration: '6:26', views: 4210054, video_id: 'abc123', rating: 90.2, ratings: 10700, title: 'A title', url: 'https://www.pornhub.com/view_video.php?viewkey=abc123', default_thumb: 'https://ei.phncdn.com/d.jpg', thumb: 'https://ei.phncdn.com/t.jpg', publish_date: '2025-04-30 03:17:10', thumbs: [{ src: 'https://ei.phncdn.com/1.jpg' }, { src: 'https://ei.phncdn.com/2.jpg' }], tags: [{ tag_name: 'pov' }], categories: [{ category: 'big-ass' }], pornstars: [{ pornstar_name: 'Someone' }] });
  assert.equal(ph.format, 'long');
  assert.equal(ph.duration, 386);
  assert.equal(ph.media.kind, 'embed');
  assert.equal(ph.media.embed, 'https://www.pornhub.com/embed/abc123');
  assert.deepEqual(ph.tags, ['pov', 'big ass']);
  assert.deepEqual(ph.performers, ['Someone']);
  assert.deepEqual(ph.media.performers, ['Someone']);
  const rt = redtube.normalize({ duration: '23:08', views: 427527, video_id: '191071671', title: 'T', url: 'https://www.redtube.com/191071671', embed_url: 'https://embed.redtube.com/?id=191071671', thumb: 'https://ei-ph.rdtcdn.com/x.jpg', publish_date: '2025-04-21 15:56:55', thumbs: [], tags: [{ tag_name: 'HD' }, { tag_name: 'facial' }] });
  assert.deepEqual(rt.tags, ['facial']);
  assert.equal(rt.media.embed, 'https://embed.redtube.com/?id=191071671');
  const ep = eporner.normalize({ id: 'UWg', title: 'Some title', keywords: 'Some title, amateur, big tits', views: 3, rate: '4.41', url: 'https://www.eporner.com/video-UWg/x/', added: '2026-07-23 18:30:17', length_sec: 136, embed: 'https://www.eporner.com/embed/UWg/', default_thumb: { src: 'https://static-ca-cdn.eporner.com/1.jpg' }, thumbs: [{ src: 'https://static-ca-cdn.eporner.com/1.jpg' }] });
  assert.equal(ep.format, 'short');
  assert.deepEqual(ep.tags, ['amateur', 'big tits']);
});

import { goodThumb } from '../src/sources/tubes.js';
import * as lemmy from '../src/sources/lemmy.js';

test('broken tube thumbnails are recognised', () => {
  assert.equal(goodThumb('https://ei-ph.rdtcdn.com/videos//original/(m=e0YH8f)0.jpg'), false);
  assert.equal(goodThumb('https://ei-ph.rdtcdn.com/videos/202102/18/383852472/original/(m=e0YH8f)6.jpg'), true);
  assert.equal(goodThumb(''), false);
  assert.equal(goodThumb(null), false);
});

test('lemmy posts become stories, image sets and videos', () => {
  const base = { creator: { name: 'amber', actor_id: 'https://lemmynsfw.com/u/amber' }, community: { name: 'gonewildstories', title: 'Stories', actor_id: 'https://lemmit.online/c/gonewildstories', nsfw: true }, counts: { score: 40, comments: 5 } };
  const story = lemmy.normalize({ ...base, post: { id: 1, name: 'A night', body: 'word '.repeat(600), published: '2026-09-01T10:00:00Z', ap_id: 'https://lemmit.online/post/1', nsfw: true } });
  assert.equal(story.format, 'story');
  assert.equal(story.community, 'gonewildstories@lemmit.online');
  assert.equal(story.media.lemmyId, 1);
  const set = lemmy.normalize({ ...base, post: { id: 2, name: 'Set', body: '![](https://x.test/a.jpg) ![](https://x.test/b.jpg)', url: 'https://x.test/c.jpg', url_content_type: 'image/jpeg', published: '2026-09-01T10:00:00Z', nsfw: true } });
  assert.equal(set.media.kind, 'gallery');
  assert.equal(set.media.items.length, 3);
  const vid = lemmy.normalize({ ...base, post: { id: 3, name: 'Clip', url: 'https://x.test/v.mp4', published: '2026-09-01T10:00:00Z', nsfw: true } });
  assert.equal(vid.media.kind, 'video');
});

import { extractFromText } from '../src/ai/extract.js';
import { parseAtom, normalizeEntry } from '../src/sources/redditRss.js';
import { signalFor } from '../src/profile.js';

test('titles turn into tags without the model', () => {
  const r = extractFromText('Busty redhead gets an oiled massage, then reverse cowgirl POV');
  const names = r.tags.map((t) => t.name);
  for (const t of ['big tits', 'redhead', 'oil', 'massage', 'reverse cowgirl', 'pov']) assert.ok(names.includes(t), `missing ${t}: ${names.join(', ')}`);
  assert.ok(!names.includes('cowgirl'), 'reverse cowgirl should not also count as cowgirl');
  assert.equal(extractFromText('schoolgirl teen').tags.length, 0);
});

test('reddit RSS entries become image, gallery, video and text posts', () => {
  const entry = (id, link, extra = '') => `<entry><author><name>/u/someone</name></author><category term="RealGirls" label="r/RealGirls"/><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;img src=&quot;https://preview.redd.it/abc123.jpg?width=140&amp;amp;s=x&quot; /&gt;${extra} submitted by &lt;a href=&quot;https://www.reddit.com/user/someone&quot;&gt; /u/someone &lt;/a&gt; &lt;span&gt;&lt;a href=&quot;${link}&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content><id>${id}</id><media:thumbnail url="https://preview.redd.it/abc123.jpg?width=140&amp;crop=1" /><link href="https://www.reddit.com/r/RealGirls/comments/x/" /><published>2026-09-27T17:03:34+00:00</published><title>A title &amp;amp; more</title></entry>`;
  const xml = `<feed>${entry('t3_a1', 'https://i.redd.it/zzz.jpg')}${entry('t3_a2', 'https://www.reddit.com/gallery/a2')}${entry('t3_a3', 'https://v.redd.it/vid9')}${entry('t3_a4', 'https://www.reddit.com/r/RealGirls/comments/a4/x/', '&lt;div class=&quot;md&quot;&gt;&lt;p&gt;hello there&lt;/p&gt;&lt;/div&gt;')}${entry('t3_a5', 'https://www.redgifs.com/watch/happyredcat')}</feed>`;
  const list = parseAtom(xml).map(normalizeEntry);
  assert.equal(list[0].media.kind, 'image');
  assert.equal(list[0].author, 'someone');
  assert.equal(list[0].community, 'r/RealGirls');
  assert.equal(list[1].media.src, 'https://i.redd.it/abc123.jpg');
  assert.equal(list[2].media.hls, 'https://v.redd.it/vid9/HLSPlaylist.m3u8');
  assert.equal(list[3].format, 'discussion');
  assert.equal(list[3].body, 'hello there');
  assert.equal(list[4].media.redgifsId, 'happyredcat');
});

test('even the lowest heat counts more than an upvote', () => {
  assert.ok(signalFor('rate', 0.5) > signalFor('up'));
  assert.ok(signalFor('rate', 5) > signalFor('rate', 1));
});

import { parseLines } from '../src/ai/tagger.js';

test('compact tagger lines parse into tags, scene and people', () => {
  const m = parseLines('#12: massage turns sexual, oil, reverse cowgirl || scene: masseuse seduces client || people: Riley Reid, none || minor: no\n#13 - pov, glasses || scene: quick tease\ngarbage line');
  assert.deepEqual(m.get(12).tags, ['massage turns sexual', 'oil', 'reverse cowgirl']);
  assert.equal(m.get(12).scene, 'masseuse seduces client');
  assert.deepEqual(m.get(12).people, ['Riley Reid']);
  assert.equal(m.get(12).minor_risk, false);
  assert.deepEqual(m.get(13).tags, ['pov', 'glasses']);
  assert.equal(m.size, 2);
});
