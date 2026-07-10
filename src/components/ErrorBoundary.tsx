import React from 'react';
import { Text, ScrollView, TouchableOpacity } from 'react-native';
import { logger } from '../lib/logger';

type Props = { children: React.ReactNode };
type State = { error: Error | null; stack: string | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('App crashed:', error, info?.componentStack);
    this.setState({ stack: info?.componentStack ?? null });
  }

  handleReload = () => {
    const g = globalThis as any;
    if (g.location?.reload) g.location.reload();
    else this.setState({ error: null, stack: null });
  };

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#0a0a0a' }}
                  contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>
          Something went wrong
        </Text>
        <Text style={{ color: '#9a9a9a', fontSize: 14, marginBottom: 20 }}>
          This page hit an error and couldn't load. Try reloading.
        </Text>
        <TouchableOpacity onPress={this.handleReload}
          style={{ backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Reload</Text>
        </TouchableOpacity>

        {/* DEBUG-ONLY — remove once the crash is fixed. Shows the real error on-device. */}
        <Text selectable style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 10 }}>
          {String(error?.message ?? error)}
        </Text>
        {!!stack && (
          <Text selectable style={{ color: '#8a8a8a', fontSize: 11 }}>{stack}</Text>
        )}
      </ScrollView>
    );
  }
}
