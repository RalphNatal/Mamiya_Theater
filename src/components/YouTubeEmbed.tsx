import React from 'react';
import { View, Text, TouchableOpacity, Linking, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../theme';
import { parseYouTubeId, youTubeEmbedUrl, youTubeWatchUrl } from '../lib/youtube';

// Responsive 16:9 YouTube player for a production's video. Web renders an
// <iframe> that fills a 16:9 box (full width up to maxWidth); native has no
// iframe, so it shows a "Watch on YouTube" button instead. Renders nothing for
// a missing / unrecognised link.
const YouTubeEmbed = ({ url, title, maxWidth = 880 }: { url: string | null | undefined; title: string; maxWidth?: number }) => {
  const id = parseYouTubeId(url);
  if (!id) return null;

  if (Platform.OS !== 'web') {
    return (
      <TouchableOpacity style={styles.nativeBtn} onPress={() => Linking.openURL(youTubeWatchUrl(id))} activeOpacity={0.85}>
        <Icon name="logo-youtube" size={18} color="#fff" />
        <Text style={styles.nativeBtnText}>Watch the video on YouTube</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View testID="youtube-embed" style={[styles.frame, { maxWidth }]}>
      {React.createElement('iframe', {
        src: youTubeEmbedUrl(id),
        title: `${title} — video`,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        allowFullScreen: true,
        loading: 'lazy',
        referrerPolicy: 'strict-origin-when-cross-origin',
        style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 },
      })}
    </View>
  );
};

const styles = createStyles({
  frame: { width: '100%', aspectRatio: 16 / 9, position: 'relative', borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  nativeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12,
  },
  nativeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default YouTubeEmbed;
