import React from 'react';
import { Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  avatarUrl?: string | null;
  size?: number;
  /** Fallback icon color when there's no avatar to show. */
  color?: string;
};

const NavAvatar = ({ avatarUrl, size = 26, color = '#fff' }: Props) => {
  if (avatarUrl && avatarUrl.trim()) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return <Icon name="person-circle-outline" size={size} color={color} />;
};

export default NavAvatar;
