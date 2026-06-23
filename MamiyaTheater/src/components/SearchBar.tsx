import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';

const SearchBar = () => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [title, setTitle] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [venue, setVenue] = useState<string>('');

  if (!isMobile) {
    // ── DESKTOP: all fields in one horizontal row ──
    return (
      <View style={styles.desktopContainer}>
        <View style={styles.desktopRow}>
          {/* Title */}
          <View style={styles.desktopField}>
            <Text style={styles.label}>SEARCH BY TITLE</Text>
            <View style={styles.desktopInputRow}>
              <Text style={styles.fieldIcon}>🔍</Text>
              <TextInput
                style={styles.desktopInput}
                placeholder="e.g. The Lion King..."
                placeholderTextColor="#bbb"
                value={title}
                onChangeText={setTitle}
              />
            </View>
          </View>

          <View style={styles.desktopDivider} />

          {/* Date */}
          <View style={styles.desktopField}>
            <Text style={styles.label}>DATE</Text>
            <View style={styles.desktopInputRow}>
              <Text style={styles.fieldIcon}>📅</Text>
              <TextInput
                style={styles.desktopInput}
                placeholder="Select date"
                placeholderTextColor="#bbb"
                value={date}
                onChangeText={setDate}
              />
            </View>
          </View>

          <View style={styles.desktopDivider} />

          {/* Venue */}
          <View style={styles.desktopField}>
            <Text style={styles.label}>VENUE</Text>
            <View style={styles.desktopInputRow}>
              <Text style={styles.fieldIcon}>📍</Text>
              <TextInput
                style={styles.desktopInput}
                placeholder="Select venue"
                placeholderTextColor="#bbb"
                value={venue}
                onChangeText={setVenue}
              />
            </View>
          </View>

          {/* Button */}
          <TouchableOpacity style={styles.desktopBtn} activeOpacity={0.8}>
            <Text style={styles.btnText}>Find Tickets</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── MOBILE: stacked layout ──
  return (
    <View style={styles.mobileContainer}>
      <Text style={styles.mobileHeading}>Find your next show</Text>

      {/* Title field — full width */}
      <View style={styles.mobileFieldGroup}>
        <Text style={styles.label}>SEARCH BY TITLE</Text>
        <View style={styles.mobileInputBox}>
          <Text style={styles.fieldIcon}>🔍</Text>
          <TextInput
            style={styles.mobileInput}
            placeholder="e.g. The Lion King..."
            placeholderTextColor="#bbb"
            value={title}
            onChangeText={setTitle}
          />
        </View>
      </View>

      {/* Date + Venue — side by side */}
      <View style={styles.mobileRow}>
        <View style={[styles.mobileFieldGroup, { flex: 1 }]}>
          <Text style={styles.label}>DATE</Text>
          <View style={styles.mobileInputBox}>
            <Text style={styles.fieldIcon}>📅</Text>
            <TextInput
              style={styles.mobileInput}
              placeholder="Select"
              placeholderTextColor="#bbb"
              value={date}
              onChangeText={setDate}
            />
          </View>
        </View>

        <View style={[styles.mobileFieldGroup, { flex: 1 }]}>
          <Text style={styles.label}>VENUE</Text>
          <View style={styles.mobileInputBox}>
            <Text style={styles.fieldIcon}>📍</Text>
            <TextInput
              style={styles.mobileInput}
              placeholder="Select"
              placeholderTextColor="#bbb"
              value={venue}
              onChangeText={setVenue}
            />
          </View>
        </View>
      </View>

      {/* Button — full width */}
      <TouchableOpacity style={styles.mobileBtn} activeOpacity={0.8}>
        <Text style={styles.btnText}>Find Tickets</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  // ── DESKTOP ──
  desktopContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 60,
    marginTop: -28,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 10,
  },
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  desktopField: { flex: 1 },
  label: {
    fontSize: 8,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  desktopInputRow: { flexDirection: 'row', alignItems: 'center' },
  fieldIcon: { fontSize: 13, marginRight: 6 },
  desktopInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    paddingVertical: 3,
    outlineStyle: 'none',
  } as any,
  desktopDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#eee',
    marginHorizontal: 6,
  },
  desktopBtn: {
    backgroundColor: '#C8102E',
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── MOBILE ──
  mobileContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -20,
    borderRadius: 12,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
  mobileHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  mobileFieldGroup: { marginBottom: 12 },
  mobileRow: { flexDirection: 'row', gap: 12 },
  mobileInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
  },
  mobileInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    outlineStyle: 'none',
  } as any,
  mobileBtn: {
    backgroundColor: '#C8102E',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});

export default SearchBar;