import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

// Rede de segurança: se algo estourar no RENDER de uma tela, em vez do app fechar
// seco, mostra o erro na tela (dá pra ler/printar) e mantém o resto do app vivo.
// Erro de runtime NÃO aparece no bundle-check — só no device; então esta tela é
// o jeito de capturar a mensagem real sem precisar do Xcode.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.warn('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const msg = String(error?.message || error);
    const stack = String(error?.stack || '').split('\n').slice(0, 8).join('\n');
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Deu ruim ao abrir esta tela</Text>
        <Text style={styles.sub}>Manda um print desta mensagem pro dev:</Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text selectable style={styles.err}>{msg}</Text>
          {stack ? <Text selectable style={styles.stack}>{stack}</Text> : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0B0B0D', padding: 24, justifyContent: 'center' },
  title: { color: '#F1F5F9', fontSize: 17, fontWeight: '800', marginBottom: 6, fontFamily: 'System' },
  sub: { color: '#98989F', fontSize: 13, marginBottom: 14, fontFamily: 'System' },
  box: { maxHeight: 320, backgroundColor: '#1C1C1E', borderRadius: 12, borderWidth: 1, borderColor: '#3A3A3C' },
  err: { color: '#EF4444', fontSize: 13, fontWeight: '600', fontFamily: 'System' },
  stack: { color: '#98989F', fontSize: 11, marginTop: 10, fontFamily: 'System' },
});
