import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false
    }
  }

  static getDerivedStateFromError() {
    return {
      hasError: true
    }
  }

  componentDidCatch(error) {
    console.error('Unhandled frontend error', error)
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page-shell">
          <div className="page-backdrop" aria-hidden="true" />
          <section className="status-panel status-panel-centered">
            <p className="eyebrow">Care Minutes AI</p>
            <h1>Unexpected application error</h1>
            <p>The dashboard hit an unexpected problem. Reload the page and try again.</p>
            <button className="ghost-button" type="button" onClick={this.handleReload}>
              Reload page
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
