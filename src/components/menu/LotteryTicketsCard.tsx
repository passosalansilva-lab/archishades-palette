import { useState, useEffect } from 'react';
import { Ticket, Trophy, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LotteryTicketsCardProps {
  customerId?: string;
  companyId: string;
  /** If true, shows "you will earn" message instead of current count (for checkout before order) */
  pendingOrderMode?: boolean;
  /** Subtotal of the order (used to calculate potential tickets in pending mode) */
  orderSubtotal?: number;
  /** Tickets just earned in this order (to show immediately after confirmation) */
  newTicketsEarned?: number;
}

interface LotterySettings {
  is_enabled: boolean;
  prize_description: string | null;
  draw_frequency: string;
  tickets_per_order: number;
  tickets_per_amount: number;
}

interface LastDraw {
  winner_name: string | null;
  prize_description: string;
  drawn_at: string;
}

export function LotteryTicketsCard({ 
  customerId = '', 
  companyId, 
  pendingOrderMode = false,
  orderSubtotal = 0,
  newTicketsEarned = 0,
}: LotteryTicketsCardProps) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LotterySettings | null>(null);
  const [ticketCount, setTicketCount] = useState(0);
  const [lastDraw, setLastDraw] = useState<LastDraw | null>(null);

  useEffect(() => {
    loadData();
  }, [customerId, companyId]);

  const loadData = async () => {
    try {
      // First check if the lottery feature is enabled for this company
      const { data: featureData } = await supabase
        .from('company_features' as any)
        .select('is_active')
        .eq('company_id', companyId)
        .eq('feature_key', 'lottery')
        .maybeSingle() as { data: { is_active: boolean } | null };

      // If feature is explicitly disabled, don't show anything
      if (featureData && !featureData.is_active) {
        setLoading(false);
        return;
      }

      // Check if lottery is enabled in settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('lottery_settings')
        .select('is_enabled, prize_description, draw_frequency, tickets_per_order, tickets_per_amount')
        .eq('company_id', companyId)
        .eq('is_enabled', true)
        .maybeSingle();

      if (settingsError) throw settingsError;
      if (!settingsData) {
        setLoading(false);
        return;
      }

      setSettings(settingsData);

      // Get customer's ticket count (only if not in pending mode)
      if (!pendingOrderMode && customerId) {
        // Query tickets by customer_id - the trigger should properly link via user_id
        const ticketsResult = await supabase
          .from('lottery_tickets')
          .select('quantity')
          .eq('company_id', companyId)
          .eq('customer_id', customerId)
          .eq('is_used', false);

        if (!ticketsResult.error && ticketsResult.data) {
          const total = ticketsResult.data.reduce((sum, t) => sum + t.quantity, 0);
          setTicketCount(total);
        }
      }

      // Get last draw
      const { data: drawData, error: drawError } = await supabase
        .from('lottery_draws')
        .select('winner_name, prize_description, drawn_at')
        .eq('company_id', companyId)
        .order('drawn_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!drawError && drawData) {
        setLastDraw(drawData);
      }

    } catch (error) {
      console.error('Error loading lottery data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-xl p-4 border border-amber-500/20">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          <span className="text-sm text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!settings?.is_enabled) {
    return null;
  }

  const getFrequencyLabel = (freq: string) => {
    switch (freq) {
      case 'weekly': return 'semanal';
      case 'biweekly': return 'quinzenal';
      case 'monthly': return 'mensal';
      default: return freq;
    }
  };

  // Calculate potential tickets for pending order
  const calculatePotentialTickets = () => {
    let tickets = 0;
    if (settings.tickets_per_order > 0) {
      tickets += settings.tickets_per_order;
    }
    if (settings.tickets_per_amount > 0 && orderSubtotal > 0) {
      tickets += Math.floor(orderSubtotal / settings.tickets_per_amount);
    }
    return tickets;
  };

  const potentialTickets = pendingOrderMode ? calculatePotentialTickets() : 0;

  // Build the rule explanation text
  const getRuleText = () => {
    if (settings.tickets_per_amount > 0) {
      return `1 ticket a cada R$ ${settings.tickets_per_amount.toFixed(0)} em compras`;
    }
    if (settings.tickets_per_order > 0) {
      return `${settings.tickets_per_order} ticket${settings.tickets_per_order > 1 ? 's' : ''} por pedido`;
    }
    return '';
  };

  // In pending mode, show "you will earn" message
  if (pendingOrderMode) {
    const hasTickets = potentialTickets > 0;
    
    return (
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-xl p-4 border border-amber-500/20">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Sorteio {getFrequencyLabel(settings.draw_frequency)}!</h3>
            <p className="text-xs text-muted-foreground">
              {getRuleText()}
            </p>
          </div>
        </div>

        {hasTickets ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Ticket className="h-5 w-5 text-amber-600" />
            <span className="text-2xl font-bold text-amber-600">+{potentialTickets}</span>
            <span className="text-sm text-muted-foreground">
              {potentialTickets === 1 ? 'ticket' : 'tickets'}
            </span>
          </div>
        ) : (
          <div className="text-center py-2 text-sm text-muted-foreground">
            Adicione mais itens para ganhar tickets!
          </div>
        )}

        {settings.prize_description && (
          <div className="text-xs text-center text-muted-foreground pt-2 border-t border-amber-500/10">
            <span className="font-medium text-foreground">Prêmio:</span>{' '}
            {settings.prize_description}
          </div>
        )}
      </div>
    );
  }

  // Normal mode - show current ticket count (include newTicketsEarned)
  const displayCount = ticketCount + newTicketsEarned;
  
  return (
    <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-xl p-4 border border-amber-500/20">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Ticket className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Sorteio {getFrequencyLabel(settings.draw_frequency)}</h3>
          <p className="text-xs text-muted-foreground">
            {newTicketsEarned > 0 
              ? `Você ganhou +${newTicketsEarned} ticket${newTicketsEarned > 1 ? 's' : ''} neste pedido!`
              : 'Cada pedido = mais chances de ganhar!'}
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-400">
          <Ticket className="h-3 w-3" />
          {displayCount} {displayCount === 1 ? 'ticket' : 'tickets'}
        </Badge>
      </div>

      {settings.prize_description && (
        <div className="text-xs text-muted-foreground mb-2">
          <span className="font-medium text-foreground">Prêmio:</span>{' '}
          {settings.prize_description}
        </div>
      )}

      {lastDraw && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-amber-500/10">
          <Trophy className="h-3 w-3 text-amber-500" />
          <span>
            Último ganhador: <span className="font-medium text-foreground">{lastDraw.winner_name}</span>
            {' '}({format(new Date(lastDraw.drawn_at), 'dd/MM', { locale: ptBR })})
          </span>
        </div>
      )}
    </div>
  );
}
