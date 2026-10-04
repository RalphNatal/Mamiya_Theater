// YouTube links on productions (productions.youtube_url). Admins paste whatever
// link YouTube gave them; we accept the common shapes and embed by video id.
//   https://www.youtube.com/watch?v=ID[&t=…]   https://youtu.be/ID
//   https://www.youtube.com/embed/ID            https://www.youtube.com/shorts/ID
//   https://www.youtube.com/live/ID             https://m.youtube.com/watch?v=ID
// The DB CHECK (20261004150000) only allows youtube.com / youtu.be URLs; this
// parser is the stricter, client-side half.

const ID = /^[A-Za-z0-9_-]{11}$/;

export const parseYouTubeId = (input: string | null | undefined): string | null => {
  let raw = (input ?? '').trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`; // "youtu.be/ID" pasted bare
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[2] : null;
    }
  }
  return id && ID.test(id) ? id : null;
};

// Privacy-enhanced embed (no YouTube cookies until the visitor presses play).
export const youTubeEmbedUrl = (id: string): string =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;

export const youTubeWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
