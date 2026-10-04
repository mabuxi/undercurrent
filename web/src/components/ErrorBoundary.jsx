import { Component } from 'react';

export function reportError(message, stack) {
  try {
    fetch('/api/client-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, stack }), keepalive: true }).catch(() => {});
  } catch {}
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(`${this.props.name || 'Component'}: ${error?.message}`, `${error?.stack || ''}\n${info?.componentStack || ''}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className={this.props.big ? 'empty' : 'post gone'}>
        {this.props.big ? 'This part of the page ran into a problem. ' : 'This post could not be shown. '}
        <button type="button" className="linkbtn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
