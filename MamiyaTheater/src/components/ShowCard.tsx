import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';

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
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;

  // Image height scales with screen size
  const imageHeight = isMobile ? 200 : isTablet ? 170 : 160;

  return (
    <View style={[styles.card, isMobile && styles.cardMobile]}>
      {/* Image + Price Badge */}
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: show.image }}
          style={[styles.image, { height: imageHeight }]}
        />
        <View style={styles.priceBadge}>
          <Text style={styles.priceFrom}>from</Text>
          <Text style={styles.priceAmount}>${show.price}</Text>
        </View>
      </View>

      {/* Card Body */}
      <View style={styles.cardBody}>
        <Text style={[styles.showTitle, isMobile && styles.showTitleMobile]} numberOfLines={2}>
          {show.title}
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🎫</Text>
          <Text style={styles.infoText} numberOfLines={1}>{show.ticketStatus}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>⭐</Text>
          <Text style={styles.infoText} numberOfLines={1}>{show.admission}</Text>
        </View>

        <TouchableOpacity style={styles.bookBtn} activeOpacity={0.8}>
          <Text style={styles.bookBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 4,
  },
  // On mobile, card takes full width instead of flex: 1
  cardMobile: {
    flex: 0,
    width: '100%',
    marginBottom: 14,
  },
  imageWrapper: { position: 'relative' },
  image: {
    width: '100%',
    resizeMode: 'cover',
  },
  priceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  priceFrom: {
    fontSize: 8,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  cardBody: { padding: 12 },
  showTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    lineHeight: 20,
  },
  showTitleMobile: {
    fontSize: 16,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  infoIcon: { fontSize: 11 },
  infoText: { fontSize: 11, color: '#666', flex: 1 },
  bookBtn: {
    backgroundColor: '#C8102E',
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  bookBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});

export default ShowCard;