import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary capturou um erro:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
          <div className="max-w-lg w-full">
            {/* Animated error icon */}
            <div className="relative mx-auto w-32 h-32 mb-8">
              <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping" />
              <div className="relative flex items-center justify-center w-32 h-32 bg-gradient-to-br from-destructive/10 to-destructive/5 rounded-full border border-destructive/20">
                <AlertTriangle className="w-16 h-16 text-destructive animate-pulse" />
              </div>
            </div>

            {/* Error content */}
            <div className="text-center space-y-4">
              <h1 className="text-3xl font-bold text-foreground">
                Ops! Algo deu errado
              </h1>
              <p className="text-muted-foreground text-lg">
                Encontramos um problema inesperado. Não se preocupe, nossa equipe já foi notificada.
              </p>

              {/* Error details (collapsible) */}
              {this.state.error && (
                <details className="mt-6 text-left bg-muted/50 rounded-lg border border-border overflow-hidden">
                  <summary className="px-4 py-3 cursor-pointer hover:bg-muted/70 transition-colors flex items-center gap-2 text-sm text-muted-foreground">
                    <Bug className="w-4 h-4" />
                    Detalhes técnicos
                  </summary>
                  <div className="px-4 py-3 border-t border-border bg-background/50">
                    <pre className="text-xs text-destructive overflow-auto max-h-32 font-mono">
                      {this.state.error.message}
                    </pre>
                    {this.state.errorInfo && (
                      <pre className="text-xs text-muted-foreground overflow-auto max-h-48 mt-2 font-mono">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6">
                <Button
                  onClick={this.handleReload}
                  className="gap-2"
                  size="lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar novamente
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="gap-2"
                  size="lg"
                >
                  <Home className="w-4 h-4" />
                  Voltar ao início
                </Button>
              </div>
            </div>

            {/* Footer help text */}
            <p className="text-center text-xs text-muted-foreground mt-8">
              Se o problema persistir, entre em contato com o suporte.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
