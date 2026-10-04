/**
 * Event content: the optional YouTube video (productions.youtube_url) and the
 * recommended image sizes shown on the admin upload form.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { parseYouTubeId, youTubeEmbedUrl, youTubeWatchUrl } from '../src/lib/youtube';
import YouTubeEmbed from '../src/components/YouTubeEmbed';
import { POSTER_HINT, BANNER_HINT } from '../src/screens/admin/sections/ProductionsSection';

const ID = 'dQw4w9WgXcQ';

test('accepts every common YouTube link shape', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `youtu.be/${ID}`,
    `  www.youtube.com/watch?v=${ID}  `,
  ]) {
    expect(parseYouTubeId(url)).toBe(ID);
  }
});

test('rejects non-YouTube or malformed links', () => {
  for (const url of [
    '', null, undefined, 'not a url', `https://vimeo.com/${ID}`,
    `https://evil.example/watch?v=${ID}`, `https://youtube.com.evil.example/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short', `javascript:alert(1)//youtube.com/watch?v=${ID}`,
  ]) {
    expect(parseYouTubeId(url as any)).toBeNull();
  }
});

test('embeds the privacy-enhanced player and saves a canonical watch URL', () => {
  expect(youTubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&modestbranding=1`);
  // The canonical form the editor saves passes the DB CHECK
  // ^https://((www|m)\.)?(youtube\.com|youtu\.be)/[^\s]+$ (20261004150000).
  expect(youTubeWatchUrl(ID)).toMatch(/^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\/[^\s]+$/i);
});

test('renders a responsive 16:9 iframe on web, nothing for a bad link', async () => {
  const prev = Platform.OS;
  (Platform as any).OS = 'web';
  try {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<YouTubeEmbed url={`https://youtu.be/${ID}`} title="Hamlet" />); });
    const iframe = r.root.findByType('iframe' as any);
    expect(iframe.props.src).toBe(youTubeEmbedUrl(ID));
    expect(iframe.props.title).toBe('Hamlet — video');
    expect(iframe.props.style).toMatchObject({ width: '100%', height: '100%' });

    await act(async () => { r.update(<YouTubeEmbed url="https://vimeo.com/1" title="Hamlet" />); });
    expect(r.toJSON()).toBeNull();
  } finally {
    (Platform as any).OS = prev;
  }
});

test('upload form states the recommended image sizes', () => {
  expect(POSTER_HINT).toContain('1200 × 1800');
  expect(POSTER_HINT).toContain('2:3');
  expect(BANNER_HINT).toContain('1920 × 720');
});
