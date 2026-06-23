import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

type Show = {
  id: string;
  title: string;
  price: number;
  ticketStatus: string;
  admission: string;
  image: string;
};

type Props = { show: Show };

const ShowCard = ({ show }: Props) => {
  return (
    <View style={styles.card}>
      <View style={styles.imageWrapper}>
        <Image source={{ uri: show.image }} style={styles.image} />
        <View style={styles.priceBadge}>
          <Text style={styles.priceFrom}>from</Text>
          <Text style={styles.priceAmount}>${show.price}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.showTitle} numberOfLines={2}>{show.title}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🎫</Text>
          <Text style={styles.infoText}>{show.ticketStatus}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>⭐</Text>
          <Text style={styles.infoText}>{show.admission}</Text>
        </View>
        <TouchableOpacity style={styles.bookBtn} activeOpacity={0.8}>
          <Text style={styles.bookBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', marginBottom: 16, flex: 1, elevation: 3 },
  imageWrapper: { position: 'relative' },
  image: { width: '100%', height: 160, resizeMode: 'cover' },
  priceBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', elevation: 2 },
  priceFrom: { fontSize: 9, color: '#888', textTransform: 'uppercase' },
  priceAmount: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  cardBody: { padding: 12 },
  showTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  infoIcon: { fontSize: 11, marginRight: 5 },
  infoText: { fontSize: 11, color: '#666' },
  bookBtn: { backgroundColor: '#C8102E', borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

export default ShowCard;