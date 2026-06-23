import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

const SearchBar = () => {
  const [title, setTitle] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [venue, setVenue] = useState<string>('');

  return (
    <View style={styles.container}>
      <View style={styles.fieldsRow}>
        <View style={styles.field}>
          <Text style={styles.label}>SEARCH BY TITLE</Text>
          <TextInput style={styles.input} placeholder="e.g. The Heirloom" placeholderTextColor="#bbb" value={title} onChangeText={setTitle} />
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Text style={styles.label}>DATE</Text>
          <TextInput style={styles.input} placeholder="📅" placeholderTextColor="#bbb" value={date} onChangeText={setDate} />
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Text style={styles.label}>VENUE</Text>
          <TextInput style={styles.input} placeholder="📍" placeholderTextColor="#bbb" value={venue} onChangeText={setVenue} />
        </View>
      </View>
      <TouchableOpacity style={styles.searchBtn} activeOpacity={0.8}>
        <Text style={styles.searchBtnText}>Find Tickets</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginHorizontal: 16, marginTop: -28, elevation: 6, zIndex: 10 },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  field: { flex: 1 },
  label: { fontSize: 9, fontWeight: '700', color: '#999', letterSpacing: 0.8, marginBottom: 4 },
  input: { fontSize: 13, color: '#333', paddingVertical: 4 },
  divider: { width: 1, height: 36, backgroundColor: '#e8e8e8', marginHorizontal: 10 },
  searchBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
});

export default SearchBar;