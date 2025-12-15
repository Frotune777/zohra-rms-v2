import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error to console in development
        console.error('Error Boundary caught an error:', error, errorInfo);

        this.setState({
            error,
            errorInfo
        });

        // You can also log the error to an error reporting service here
        // logErrorToService(error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-midnight to-midnight/95 flex items-center justify-center p-8">
                    <div className="glass-panel p-8 max-w-2xl w-full rounded-xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-red-500/20 rounded-full">
                                <FiAlertTriangle className="text-red-400 text-3xl" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
                                <p className="text-gray-400 mt-1">
                                    We're sorry, but something unexpected happened.
                                </p>
                            </div>
                        </div>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="bg-black/30 p-4 rounded-lg mb-6 overflow-auto">
                                <p className="text-red-400 font-mono text-sm mb-2">
                                    {this.state.error.toString()}
                                </p>
                                <pre className="text-gray-400 font-mono text-xs overflow-auto max-h-64">
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button
                                onClick={this.handleReset}
                                className="flex-1 bg-zohra-blue hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition"
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="flex-1 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-lg font-medium transition"
                            >
                                Go to Dashboard
                            </button>
                        </div>

                        <p className="text-gray-500 text-sm mt-6 text-center">
                            If this problem persists, please contact support.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
