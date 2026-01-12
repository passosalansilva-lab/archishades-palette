import { useState, useEffect } from 'react';
import { Download, Smartphone, X, Share, MoreVertical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDynamicManifest } from '@/hooks/useDynamicManifest';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallAppPromptProps {
  name?: string;
  short_name?: string;
  description?: string;
  scope?: string;
}

export function InstallAppPrompt({ 
  name, 
  short_name, 
  description,
  scope 
}: InstallAppPromptProps = {}) {
  // Use dynamic manifest based on current route
  // (start_url já é preenchido pelo hook via react-router)
  useDynamicManifest({
    name,
    short_name,
    description,
    scope,
  });
  const [showButton, setShowButton] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    const isAndroidDevice = /android/.test(userAgent);
    
    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    // Show button on mobile devices
    if (isIOSDevice || isAndroidDevice) {
      setShowButton(true);
    }

    // Listen for install prompt (Chrome/Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Chrome/Android - use native prompt
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowButton(false);
      }
      setDeferredPrompt(null);
    } else {
      // Show manual instructions
      setShowInstructions(true);
    }
  };

  if (isInstalled || !showButton) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleInstallClick}
        className="gap-2 h-9 px-3 bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10 hover:border-primary/40"
      >
        <Download className="h-4 w-4" />
        <span className="text-sm">Instalar App</span>
      </Button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Instalar na Tela Inicial
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {isIOS ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Siga os passos abaixo para adicionar o app à tela inicial do seu iPhone:
                </p>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Toque no ícone de compartilhar</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                          <Share className="h-4 w-4" />
                        </div>
                        <span className="text-xs">na barra inferior do Safari</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Deslize para baixo e toque em</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                          <Plus className="h-4 w-4" />
                        </div>
                        <span className="text-xs">"Adicionar à Tela de Início"</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Confirme tocando em "Adicionar"</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        O app aparecerá na sua tela inicial
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : isAndroid ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Siga os passos abaixo para adicionar o app à tela inicial do seu Android:
                </p>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Toque no menu do navegador</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                          <MoreVertical className="h-4 w-4" />
                        </div>
                        <span className="text-xs">os três pontinhos no canto</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Toque em "Instalar aplicativo"</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ou "Adicionar à tela inicial"
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Confirme a instalação</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        O app aparecerá na sua tela inicial
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Para instalar o app, acesse este site pelo navegador do seu celular.
              </p>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground text-center">
                💡 Com o app instalado, você acessa mais rápido e recebe notificações!
              </p>
            </div>
          </div>

          <Button onClick={() => setShowInstructions(false)} className="w-full">
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
