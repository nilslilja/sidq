import { Component, type ErrorInfo, type ReactNode } from 'react';

/*
 * The last line of defence.
 *
 * Without one of these a single throw anywhere in the tree unmounts everything
 * and leaves a blank window with no message. In a browser you at least have the
 * console; in a packaged desktop app with devtools disabled there is nothing at
 * all, and "it crashes" is the only report anyone can give.
 *
 * So this shows the actual error, on screen, in the app. It is not a friendly
 * apology page — it is the message and the stack, because the person most likely
 * to read it is whoever has to fix it.
 */

interface Props {
  children: ReactNode;
  /** Dark surfaces need the light treatment, e.g. the overlay and onboarding. */
  tone?: 'light' | 'dark';
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept so it is also visible anywhere logs are captured, not only on screen.
    console.error('Sidq crashed:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const dark = this.props.tone !== 'light';

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          padding: '2rem',
          background: dark ? '#0B0B10' : '#F7F6F3',
          color: dark ? '#FFFFFF' : '#12121A',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          overflow: 'auto',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Sidq hit an error</h1>
        <p style={{ opacity: 0.6, fontSize: '0.875rem', marginTop: '0.5rem' }}>
          This is the actual message. Copy it, it says what broke.
        </p>

        <pre
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: 10,
            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(18,18,26,0.05)',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error.name}: {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
          {info ? `\n\nComponent stack:${info}` : ''}
        </pre>

        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1.5rem',
            minHeight: '2.75rem',
            padding: '0 1.25rem',
            borderRadius: 10,
            border: 'none',
            background: '#4F46E5',
            color: '#FFFFFF',
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
