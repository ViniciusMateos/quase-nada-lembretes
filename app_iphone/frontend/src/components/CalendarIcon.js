import React from 'react';
import { View } from 'react-native';

// Ícone de calendário desenhado com Views (o app não tem @expo/vector-icons, e
// adicionar exigiria build). Mesma abordagem do HamburgerIcon.
export default function CalendarIcon({ color = '#94A3B8', size = 26 }) {
  const s = size;
  const legH = s * 0.16;
  const legW = 2.2;
  return (
    <View style={{ width: s, height: s, justifyContent: 'flex-end' }}>
      {/* argolas de cima */}
      <View style={{ position: 'absolute', top: 0, left: s * 0.26, width: legW, height: legH, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: 0, right: s * 0.26, width: legW, height: legH, borderRadius: 1, backgroundColor: color }} />
      {/* corpo */}
      <View style={{ width: s, height: s * 0.86, borderWidth: 2, borderColor: color, borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ height: s * 0.22, backgroundColor: color }} />
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: s * 0.12, paddingTop: s * 0.08, alignContent: 'flex-start' }}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={{ width: s * 0.13, height: s * 0.13, marginRight: s * 0.09, marginBottom: s * 0.09, borderRadius: 1, backgroundColor: color, opacity: 0.75 }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
