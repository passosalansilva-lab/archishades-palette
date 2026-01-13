import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, Loader2, AlertCircle, ArrowLeft, Clock, RefreshCw, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PicPayPaymentData {
  pendingId: string;
  paymentLinkId: string;
  qrCode: string;
  qrCodeBase64?: string | null;
  paymentUrl?: string | null;
  expiresAt: string;
  total: number;
  companyName: string;
  companySlug: string;
}

interface PicPayPaymentScreenProps {
  paymentData: PicPayPaymentData;
  companyId: string;
  onSuccess: (orderId: string) => void;
  onCancel: () => void;
  onExpired: () => void;
}

export function PicPayPaymentScreen({
  paymentData,
  companyId,
  onSuccess,
  onCancel,
  onExpired,
}: PicPayPaymentScreenProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [status, setStatus] = useState<'pending' | 'approved' | 'expired' | 'error'>('pending');
  const [checkCount, setCheckCount] = useState(0);

  // Calcular tempo restante - máximo 30 minutos
  useEffect(() => {
    let expiresAt = new Date(paymentData.expiresAt).getTime();
    
    // Fallback: se expiresAt é inválido, usar 30 min a partir de agora
    const maxExpiration = Date.now() + 30 * 60 * 1000;
    const minExpiration = Date.now() - 60 * 1000;
    
    if (isNaN(expiresAt) || expiresAt > maxExpiration || expiresAt < minExpiration) {
      console.warn('[PicPayPaymentScreen] Invalid expiresAt, using fallback:', paymentData.expiresAt);
      expiresAt = maxExpiration;
    }
    
    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(diff);
      
      if (diff <= 0) {
        setStatus('expired');
        onExpired();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [paymentData.expiresAt, onExpired]);

  // Formatar tempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Copiar código PIX
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paymentData.qrCode);
      setCopied(true);
      toast({ title: 'Código PIX copiado!' });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  // Verificar status do pagamento
  const checkPaymentStatus = useCallback(async () => {
    if (status !== 'pending') return;
    
    setChecking(true);
    setCheckCount(prev => prev + 1);
    
    console.log('[PicPayPaymentScreen] Checking payment status...', {
      pendingId: paymentData.pendingId,
      companyId,
      paymentLinkId: paymentData.paymentLinkId,
      checkCount: checkCount + 1,
    });
    
    try {
      const { data, error } = await supabase.functions.invoke('check-picpay-payment', {
        body: {
          pendingId: paymentData.pendingId,
          companyId,
          paymentLinkId: paymentData.paymentLinkId,
        },
      });

      console.log('[PicPayPaymentScreen] Check result:', { data, error });

      if (error) throw error;

      if (data?.approved) {
        console.log('[PicPayPaymentScreen] Payment APPROVED! Order:', data.orderId);
        setStatus('approved');
        toast({ title: 'Pagamento confirmado!', description: 'Seu pedido foi realizado com sucesso.' });
        onSuccess(data.orderId);
      } else {
        const normalizedStatus = String(data?.status || '').toLowerCase();
        
        if (['cancelled', 'canceled', 'refunded', 'expired', 'rejected', 'failed'].includes(normalizedStatus)) {
          console.log('[PicPayPaymentScreen] Payment cancelled/failed:', normalizedStatus);
          setStatus('error');
          toast({ title: 'Pagamento não aprovado', variant: 'destructive' });
        } else {
          console.log('[PicPayPaymentScreen] Payment still pending, status:', data?.status);
        }
      }
    } catch (err) {
      console.error('[PicPayPaymentScreen] Error checking payment:', err);
      // Não mostrar erro para o usuário em verificações automáticas
      if (checking) {
        toast({
          title: 'Falha ao verificar pagamento',
          description: 'Tentando novamente...',
          variant: 'destructive',
        });
      }
    } finally {
      setChecking(false);
    }
  }, [paymentData, companyId, status, onSuccess, toast, checkCount, checking]);

  // Auto-check a cada 5 segundos
  useEffect(() => {
    if (status !== 'pending') return;
    
    // Primeira verificação após 3 segundos
    const firstCheck = setTimeout(checkPaymentStatus, 3000);
    
    // Verificações subsequentes a cada 5 segundos
    const interval = setInterval(checkPaymentStatus, 5000);
    
    return () => {
      clearTimeout(firstCheck);
      clearInterval(interval);
    };
  }, [checkPaymentStatus, status]);

  // Abrir link de pagamento no PicPay
  const handleOpenPaymentLink = () => {
    if (paymentData.paymentUrl) {
      window.open(paymentData.paymentUrl, '_blank');
    }
  };

  if (status === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6 animate-in zoom-in duration-300">
          <Check className="w-12 h-12 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3">Pagamento Confirmado!</h2>
        <p className="text-muted-foreground mb-2">Seu pedido foi realizado com sucesso.</p>
        <p className="text-sm text-muted-foreground">Acompanhe o status do seu pedido na página de acompanhamento.</p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">PIX Expirado</h2>
        <p className="text-muted-foreground mb-6">O tempo para pagamento expirou.</p>
        <Button onClick={onCancel} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar ao checkout
        </Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Pagamento não aprovado</h2>
        <p className="text-muted-foreground mb-6">Houve um problema com o pagamento. Tente novamente.</p>
        <Button onClick={onCancel} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar ao checkout
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/1/11/PicPay.svg" 
              alt="PicPay" 
              className="h-5"
            />
            <h1 className="font-semibold">Pagamento PIX</h1>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {/* Timer */}
        <div className={cn(
          "flex items-center justify-center gap-2 py-3 px-4 rounded-lg mb-6",
          timeLeft <= 60 ? "bg-destructive/10 text-destructive" : "bg-muted"
        )}>
          <Clock className="w-4 h-4" />
          <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
          <span className="text-sm text-muted-foreground">para pagar</span>
        </div>

        {/* Valor */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">Valor a pagar</p>
          <p className="text-3xl font-bold text-[#21c25e]">
            R$ {paymentData.total.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{paymentData.companyName}</p>
        </div>

        {/* QR Code */}
        <div className="bg-card border border-border rounded-xl p-6 mb-4">
          <div className="flex flex-col items-center">
            {paymentData.qrCodeBase64 ? (
              <div className="bg-white p-4 rounded-lg mb-4">
                <img 
                  src={paymentData.qrCodeBase64.startsWith('data:') 
                    ? paymentData.qrCodeBase64 
                    : `data:image/png;base64,${paymentData.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-48 h-48"
                />
              </div>
            ) : (
              <div className="bg-muted p-6 rounded-lg mb-4 text-center">
                <Copy className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Use o código copia e cola abaixo
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              {paymentData.qrCodeBase64 
                ? "Escaneie o QR Code com o app do seu banco"
                : "Copie o código PIX e cole no app do seu banco"}
            </p>
          </div>
        </div>

        {/* Código Copia e Cola */}
        {paymentData.qrCode && (
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <p className="text-sm font-medium mb-2">Código PIX copia e cola:</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-muted rounded-lg p-3 font-mono text-xs break-all max-h-20 overflow-auto">
                {paymentData.qrCode}
              </div>
              <Button
                onClick={handleCopy}
                variant={copied ? "default" : "outline"}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Link para pagar no PicPay */}
        {paymentData.paymentUrl && (
          <Button
            onClick={handleOpenPaymentLink}
            variant="outline"
            className="w-full mb-2"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Pagar no site do PicPay
          </Button>
        )}

        {/* Verificação Manual */}
        <Button
          onClick={checkPaymentStatus}
          variant="outline"
          className="w-full"
          disabled={checking}
        >
          {checking ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {checking ? 'Verificando...' : 'Já paguei, verificar'}
        </Button>

        {/* Status de verificação */}
        {checkCount > 0 && (
          <p className="text-xs text-center text-muted-foreground mt-2">
            Verificações realizadas: {checkCount}
          </p>
        )}

        {/* Cancelar */}
        <Button
          onClick={onCancel}
          variant="ghost"
          className="w-full mt-2 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Cancelar e escolher outro pagamento
        </Button>

        {/* Instruções */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-medium mb-2">Como pagar:</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Abra o app do seu banco</li>
            <li>Escolha pagar via PIX</li>
            <li>Escaneie o QR Code ou cole o código</li>
            <li>Confirme o pagamento</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
