import { useState, useEffect } from 'react';
import { Gift, Copy, Share2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReferralShareCardProps {
  customerId: string;
  companyId: string;
  companySlug: string;
  companyName: string;
}

interface ReferralSettings {
  is_enabled: boolean;
  referrer_discount_percent: number;
  referred_discount_percent: number;
}

export function ReferralShareCard({ 
  customerId, 
  companyId, 
  companySlug, 
  companyName 
}: ReferralShareCardProps) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadReferralData();
  }, [customerId, companyId]);

  const loadReferralData = async () => {
    try {
      // First check if the referrals feature is enabled for this company
      const { data: featureData } = await supabase
        .from('company_features' as any)
        .select('is_active')
        .eq('company_id', companyId)
        .eq('feature_key', 'referrals')
        .maybeSingle() as { data: { is_active: boolean } | null };

      // If feature is explicitly disabled, don't show anything
      if (featureData && !featureData.is_active) {
        setLoading(false);
        return;
      }

      // Check if referral is enabled for this company
      const { data: settingsData, error: settingsError } = await supabase.functions.invoke(
        'get-customer-referral',
        { body: { companyId, customerId } }
      );

      if (settingsError) {
        console.error('Error loading referral settings:', settingsError);
        setLoading(false);
        return;
      }

      if (!settingsData?.settings?.is_enabled) {
        setLoading(false);
        return;
      }

      setSettings(settingsData.settings);
      setReferralCode(settingsData.referralCode);
    } catch (error) {
      console.error('Error loading referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReferralLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/menu/${companySlug}?ref=${referralCode}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getReferralLink());
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar link');
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `Peça no ${companyName} e ganhe desconto!`,
      text: `Use meu link e ganhe ${settings?.referred_discount_percent}% de desconto no seu pedido!`,
      url: getReferralLink(),
    };

    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  // Don't show if loading, not enabled, or no code
  if (loading) {
    return (
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/20">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!settings?.is_enabled || !referralCode) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Gift className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Indique e Ganhe!</h3>
          <p className="text-sm text-muted-foreground">
            Compartilhe com amigos e ambos ganham desconto
          </p>
        </div>
      </div>

      <div className="bg-background/80 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">
            Seu código
          </span>
          <span className="font-mono font-bold text-lg text-primary">
            {referralCode}
          </span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            • Quem usar seu link ganha{' '}
            <span className="font-semibold text-foreground">
              {settings.referred_discount_percent}% de desconto
            </span>
          </p>
          <p>
            • Você ganha{' '}
            <span className="font-semibold text-foreground">
              {settings.referrer_discount_percent}% de crédito
            </span>{' '}
            no próximo pedido
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Link
            </>
          )}
        </Button>
        <Button
          className="flex-1"
          onClick={handleShare}
        >
          <Share2 className="h-4 w-4 mr-2" />
          Compartilhar
        </Button>
      </div>
    </div>
  );
}
