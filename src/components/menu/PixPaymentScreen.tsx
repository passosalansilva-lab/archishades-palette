import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, Loader2, AlertCircle, ArrowLeft, Clock, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PixPaymentData {
  paymentId: string;
  pendingId: string;
  qrCodeBase64: string;
  qrCode: string; // copia e cola
  ticketUrl?: string;
  expiresAt: string;
  total: number;
  companyName: string;
  companySlug: string;
}

interface PixPaymentScreenProps {
  pixData: PixPaymentData;
  companyId: string;
  onSuccess: (orderId: string) => void;
  onCancel: () => void;
  onExpired: () => void;
}

export function PixPaymentScreen({
  pixData,
  companyId,
  onSuccess,
  onCancel,
  onExpired,
}: PixPaymentScreenProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [status, setStatus] = useState<'pending' | 'approved' | 'expired' | 'error'>('pending');

  // Calculate time left - max 30 minutes (1800 seconds)
  useEffect(() => {
    let expiresAt = new Date(pixData.expiresAt).getTime();
    
    // Fallback: if expiresAt is invalid or too far in the future, use 30 min from now
    const maxExpiration = Date.now() + 30 * 60 * 1000;
    const minExpiration = Date.now() - 60 * 1000; // Allow 1 min in the past for clock skew
    
    if (isNaN(expiresAt) || expiresAt > maxExpiration || expiresAt < minExpiration) {
      console.warn('[PixPaymentScreen] Invalid expiresAt, using fallback:', pixData.expiresAt);
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
  }, [pixData.expiresAt, onExpired]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Copy PIX code
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setCopied(true);
      toast({ title: 'Código PIX copiado!' });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  // Check payment status
  const checkPaymentStatus = useCallback(async () => {
    if (status !== 'pending') return;
    
    setChecking(true);
    console.log('[PixPaymentScreen] Checking payment status...', {
      paymentId: pixData.paymentId,
      pendingId: pixData.pendingId,
      companyId,
    });
    
    try {
      const { data, error } = await supabase.functions.invoke('check-pix-payment', {
        body: {
          paymentId: pixData.paymentId,
          pendingId: pixData.pendingId,
          companyId,
        },
      });

      console.log('[PixPaymentScreen] Check result:', { data, error });

      if (error) throw error;

      if (data?.approved) {
        console.log('[PixPaymentScreen] Payment APPROVED! Order:', data.orderId);
        setStatus('approved');
        toast({ title: 'Pagamento confirmado!', description: 'Seu pedido foi realizado com sucesso.' });
        onSuccess(data.orderId);
      } else if (data?.status === 'rejected' || data?.status === 'cancelled') {
        console.log('[PixPaymentScreen] Payment rejected/cancelled:', data?.status);
        setStatus('error');
        toast({ title: 'Pagamento não aprovado', variant: 'destructive' });
      } else {
        console.log('[PixPaymentScreen] Payment still pending, status:', data?.status);
      }
    } catch (err) {
      console.error('[PixPaymentScreen] Error checking payment:', err);
    } finally {
      setChecking(false);
    }
  }, [pixData, companyId, status, onSuccess, toast]);

  // Cancel payment
  const handleCancelPayment = async () => {
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-mercadopago-payment', {
        body: {
          paymentId: pixData.paymentId,
          pendingId: pixData.pendingId,
          companyId,
        },
      });

      if (error) throw error;

      toast({ 
        title: 'Pagamento cancelado', 
        description: 'Você pode escolher outra forma de pagamento.' 
      });
      onCancel();
    } catch (err) {
      console.error('Error cancelling payment:', err);
      toast({ 
        title: 'Erro ao cancelar', 
        description: 'Tente novamente ou volte ao checkout.',
        variant: 'destructive' 
      });
    } finally {
      setCancelling(false);
    }
  };

  // Auto-check every 5 seconds
  useEffect(() => {
    if (status !== 'pending') return;
    
    const interval = setInterval(checkPaymentStatus, 5000);
    return () => clearInterval(interval);
  }, [checkPaymentStatus, status]);

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

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold">Pagamento PIX</h1>
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

        {/* Amount */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">Valor a pagar</p>
          <p className="text-3xl font-bold text-primary">
            R$ {pixData.total.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{pixData.companyName}</p>
        </div>

        {/* QR Code */}
        <div className="bg-card border border-border rounded-xl p-6 mb-4">
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-lg mb-4">
              <img 
                src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Escaneie o QR Code com o app do seu banco
            </p>
          </div>
        </div>

        {/* Copy and Paste */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <p className="text-sm font-medium mb-2">Ou copie o código PIX:</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-muted rounded-lg p-3 font-mono text-xs break-all max-h-20 overflow-auto">
              {pixData.qrCode}
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

        {/* Manual Check */}
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

        {/* Cancel Payment */}
        <Button
          onClick={handleCancelPayment}
          variant="ghost"
          className="w-full mt-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={cancelling}
        >
          {cancelling ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <XCircle className="w-4 h-4 mr-2" />
          )}
          {cancelling ? 'Cancelando...' : 'Cancelar e escolher outro pagamento'}
        </Button>

        {/* Instructions */}
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
