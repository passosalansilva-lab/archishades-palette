import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Gift, Ticket, Trophy, Users, Sparkles, PartyPopper, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LotteryDrawAnimation } from '@/components/lottery/LotteryDrawAnimation';

interface LotterySettings {
  id?: string;
  is_enabled: boolean;
  tickets_per_order: number;
  tickets_per_amount: number | null;
  prize_description: string;
  draw_frequency: string;
}

interface DrawParticipant {
  customer_name: string;
  customer_phone: string;
  total_tickets: number;
}

interface LotteryDraw {
  id: string;
  winner_name: string | null;
  winner_phone: string | null;
  prize_description: string;
  total_tickets_in_draw: number;
  winner_tickets_count: number | null;
  drawn_at: string;
  participants?: DrawParticipant[];
}

interface TicketHolder {
  customer_id: string;
  user_id: string | null;
  customer_name: string;
  customer_phone: string;
  total_tickets: number;
  total_spent: number; // Total gasto pelo cliente
  weighted_score: number; // Pontuação ponderada (tickets * multiplicador)
  chance_percent: number; // Probabilidade de ganhar em %
}

export default function LotteryManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [settings, setSettings] = useState<LotterySettings>({
    is_enabled: false,
    tickets_per_order: 1,
    tickets_per_amount: null,
    prize_description: '',
    draw_frequency: 'monthly',
  });

  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [totalActiveTickets, setTotalActiveTickets] = useState(0);
  const [draws, setDraws] = useState<LotteryDraw[]>([]);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [drawPrize, setDrawPrize] = useState('');
  const [lastWinner, setLastWinner] = useState<{ name: string; phone: string } | null>(null);
  const [showDrawAnimation, setShowDrawAnimation] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<TicketHolder | null>(null);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      // Get company ID
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', user?.id)
        .maybeSingle();

      if (companyError) throw companyError;
      if (!company) {
        setLoading(false);
        return;
      }

      setCompanyId(company.id);

      // Load settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('lottery_settings')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

      if (settingsData) {
        setSettings({
          id: settingsData.id,
          is_enabled: settingsData.is_enabled,
          tickets_per_order: settingsData.tickets_per_order,
          tickets_per_amount: settingsData.tickets_per_amount,
          prize_description: settingsData.prize_description || '',
          draw_frequency: settingsData.draw_frequency,
        });
        setDrawPrize(settingsData.prize_description || '');
      }

      // Load ticket holders with their total tickets - group by user_id when available
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('lottery_tickets')
        .select(`
          customer_id,
          user_id,
          quantity,
          customers!inner(name, phone, user_id)
        `)
        .eq('company_id', company.id)
        .eq('is_used', false);

      if (ticketsError) throw ticketsError;

      // Aggregate tickets by user_id (preferred) or customer_id (fallback)
      // IMPORTANT: When user_id is null, we MUST use customer_id as the unique key
      const holdersMap = new Map<string, Omit<TicketHolder, 'weighted_score' | 'chance_percent'>>();
      let total = 0;

      ticketsData?.forEach((ticket: any) => {
        // Use user_id as key if available and not null, otherwise use customer_id
        const userId = ticket.user_id || ticket.customers?.user_id;
        const key = userId || `customer_${ticket.customer_id}`;
        
        const existing = holdersMap.get(key);
        if (existing) {
          existing.total_tickets += ticket.quantity;
        } else {
          holdersMap.set(key, {
            customer_id: ticket.customer_id,
            user_id: userId || null,
            customer_name: ticket.customers.name,
            customer_phone: ticket.customers.phone,
            total_tickets: ticket.quantity,
            total_spent: 0,
          });
        }
        total += ticket.quantity;
      });

      // Buscar total gasto por cada cliente (pedidos completados)
      const customerIds = Array.from(holdersMap.values()).map(h => h.customer_id);
      
      if (customerIds.length > 0) {
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('customer_id, total')
          .eq('company_id', company.id)
          .in('customer_id', customerIds)
          .in('status', ['delivered', 'ready']);

        if (!ordersError && ordersData) {
          // Somar totais por customer_id
          const spentByCustomer = new Map<string, number>();
          ordersData.forEach((order: any) => {
            const current = spentByCustomer.get(order.customer_id) || 0;
            spentByCustomer.set(order.customer_id, current + (order.total || 0));
          });

          // Atualizar total_spent nos holders
          holdersMap.forEach((holder) => {
            holder.total_spent = spentByCustomer.get(holder.customer_id) || 0;
          });
        }
      }

      // Calcular pesos ponderados: tickets * (1 + bônus por valor gasto)
      // Bônus: a cada R$100 gastos = +10% de multiplicador (0.1)
      const BONUS_PER_100_REAIS = 0.1; // 10% de bônus a cada R$100

      const holdersWithWeights: TicketHolder[] = Array.from(holdersMap.values()).map(holder => {
        const spentBonus = (holder.total_spent / 100) * BONUS_PER_100_REAIS;
        const multiplier = 1 + spentBonus;
        const weighted_score = holder.total_tickets * multiplier;
        return {
          ...holder,
          weighted_score,
          chance_percent: 0, // Será calculado depois
        };
      });

      // Calcular probabilidade % de cada participante
      const totalWeightedScore = holdersWithWeights.reduce((sum, h) => sum + h.weighted_score, 0);
      holdersWithWeights.forEach(holder => {
        holder.chance_percent = totalWeightedScore > 0 
          ? (holder.weighted_score / totalWeightedScore) * 100 
          : 0;
      });

      // Ordenar por probabilidade (maior primeiro)
      holdersWithWeights.sort((a, b) => b.weighted_score - a.weighted_score);

      setTicketHolders(holdersWithWeights);
      setTotalActiveTickets(total);

      // Load past draws
      const { data: drawsData, error: drawsError } = await supabase
        .from('lottery_draws')
        .select('*')
        .eq('company_id', company.id)
        .order('drawn_at', { ascending: false })
        .limit(10);

      if (drawsError) throw drawsError;

      // Load participants for each draw
      const drawsWithParticipants: LotteryDraw[] = [];
      for (const draw of drawsData || []) {
        const { data: ticketsInDraw } = await supabase
          .from('lottery_tickets')
          .select(`
            quantity,
            customers!inner(name, phone)
          `)
          .eq('used_in_draw_id', draw.id);

        // Aggregate participants
        const participantsMap = new Map<string, DrawParticipant>();
        ticketsInDraw?.forEach((ticket: any) => {
          const key = ticket.customers.phone;
          const existing = participantsMap.get(key);
          if (existing) {
            existing.total_tickets += ticket.quantity;
          } else {
            participantsMap.set(key, {
              customer_name: ticket.customers.name,
              customer_phone: ticket.customers.phone,
              total_tickets: ticket.quantity,
            });
          }
        });

        drawsWithParticipants.push({
          ...draw,
          participants: Array.from(participantsMap.values()).sort((a, b) => b.total_tickets - a.total_tickets),
        });
      }

      setDraws(drawsWithParticipants);

    } catch (error) {
      console.error('Error loading lottery data:', error);
      toast.error('Erro ao carregar dados do sorteio');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!companyId) return;

    setSaving(true);
    try {
      const data = {
        company_id: companyId,
        is_enabled: settings.is_enabled,
        tickets_per_order: settings.tickets_per_order,
        tickets_per_amount: settings.tickets_per_amount,
        prize_description: settings.prize_description,
        draw_frequency: settings.draw_frequency,
      };

      if (settings.id) {
        const { error } = await supabase
          .from('lottery_settings')
          .update(data)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('lottery_settings')
          .insert(data)
          .select()
          .single();

        if (error) throw error;
        setSettings((prev) => ({ ...prev, id: inserted.id }));
      }

      toast.success('Configurações salvas!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleDraw = async () => {
    if (!companyId || ticketHolders.length === 0) return;

    setDrawing(true);
    try {
      // Seleção aleatória ponderada baseada no weighted_score (tickets * multiplicador por gastos)
      const totalWeightedScore = ticketHolders.reduce((sum, h) => sum + h.weighted_score, 0);
      let random = Math.random() * totalWeightedScore;
      let winner: TicketHolder | null = null;

      for (const holder of ticketHolders) {
        random -= holder.weighted_score;
        if (random <= 0) {
          winner = holder;
          break;
        }
      }

      if (!winner) {
        winner = ticketHolders[0];
      }

      const totalTickets = ticketHolders.reduce((sum, h) => sum + h.total_tickets, 0);

      // Record the draw
      const { data: drawData, error: drawError } = await supabase
        .from('lottery_draws')
        .insert({
          company_id: companyId,
          winner_customer_id: winner.customer_id,
          winner_name: winner.customer_name,
          winner_phone: winner.customer_phone,
          prize_description: drawPrize || settings.prize_description || 'Prêmio do sorteio',
          total_tickets_in_draw: totalTickets,
          winner_tickets_count: winner.total_tickets,
        })
        .select('id')
        .single();

      if (drawError) throw drawError;

      // Mark all current tickets as used and link to this draw
      const { error: updateError } = await supabase
        .from('lottery_tickets')
        .update({ is_used: true, used_in_draw_id: drawData.id })
        .eq('company_id', companyId)
        .eq('is_used', false);

      if (updateError) throw updateError;

      // Get company name and winner email for notification
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();

      // Get winner's email from customers table
      const { data: customerData } = await supabase
        .from('customers')
        .select('email')
        .eq('id', winner.customer_id)
        .single();

      // Send email to winner (non-blocking)
      if (customerData?.email) {
        const prizeDesc = drawPrize || settings.prize_description || 'Prêmio do sorteio';
        
        supabase.functions.invoke('send-lottery-winner-email', {
          body: {
            winner_name: winner.customer_name,
            winner_email: customerData.email,
            winner_phone: winner.customer_phone,
            prize_description: prizeDesc,
            company_name: companyData?.name || 'Nossa loja',
            company_id: companyId,
            draw_id: drawData.id,
          },
        }).then(({ error }) => {
          if (error) {
            console.error('Error sending winner email:', error);
          } else {
            console.log('Winner email sent successfully');
          }
        });
      }

      // Set winner and show animation
      setCurrentWinner(winner);
      setShowDrawModal(false);
      setShowDrawAnimation(true);

    } catch (error) {
      console.error('Error performing draw:', error);
      toast.error('Erro ao realizar sorteio');
      setDrawing(false);
    }
  };

  const handleAnimationClose = () => {
    setShowDrawAnimation(false);
    setCurrentWinner(null);
    if (currentWinner) {
      setLastWinner({ name: currentWinner.customer_name, phone: currentWinner.customer_phone });
    }
    setDrawing(false);
    loadData();
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gift className="h-6 w-6 text-primary" />
              Sorteios
            </h1>
            <p className="text-muted-foreground">
              Engaje seus clientes com sorteios periódicos
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Ticket className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tickets Ativos</p>
                  <p className="text-2xl font-bold">{totalActiveTickets}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10">
                  <Users className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Participantes</p>
                  <p className="text-2xl font-bold">{ticketHolders.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-500/10">
                  <Trophy className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sorteios Realizados</p>
                  <p className="text-2xl font-bold">{draws.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Last Winner Banner */}
        {lastWinner && (
          <Card className="bg-gradient-to-r from-primary/10 to-amber-500/10 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <PartyPopper className="h-10 w-10 text-primary" />
                <div>
                  <p className="text-lg font-semibold">Último Ganhador</p>
                  <p className="text-muted-foreground">
                    {lastWinner.name} - {lastWinner.phone}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
              <CardDescription>Configure as regras do sorteio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ativar Sorteio</Label>
                  <p className="text-sm text-muted-foreground">
                    Clientes ganham tickets a cada pedido
                  </p>
                </div>
                <Switch
                  checked={settings.is_enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, is_enabled: checked }))
                  }
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Regra de Tickets</Label>
                  <Select
                    value={settings.tickets_per_amount && settings.tickets_per_amount > 0 ? 'by_amount' : 'by_order'}
                    onValueChange={(value) => {
                      if (value === 'by_order') {
                        setSettings((prev) => ({
                          ...prev,
                          tickets_per_order: prev.tickets_per_order || 1,
                          tickets_per_amount: 0,
                        }));
                      } else {
                        setSettings((prev) => ({
                          ...prev,
                          tickets_per_order: 0,
                          tickets_per_amount: prev.tickets_per_amount || 50,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="by_order">Por pedido</SelectItem>
                      <SelectItem value="by_amount">Por valor de compra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.tickets_per_amount && settings.tickets_per_amount > 0 ? (
                  <div className="space-y-2">
                    <Label>1 ticket a cada R$</Label>
                    <Input
                      type="number"
                      min={1}
                      step={5}
                      value={settings.tickets_per_amount}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          tickets_per_amount: parseFloat(e.target.value) || 50,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Ex: R$ 50 = cliente ganha 1 ticket a cada R$ 50 gastos
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Tickets por pedido</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.tickets_per_order}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          tickets_per_order: parseInt(e.target.value) || 1,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Cada pedido concluído gera essa quantidade de tickets
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Frequência do Sorteio</Label>
                  <Select
                    value={settings.draw_frequency}
                    onValueChange={(value) =>
                      setSettings((prev) => ({ ...prev, draw_frequency: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="biweekly">Quinzenal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Descrição do Prêmio</Label>
                  <Textarea
                    placeholder="Ex: 1 Pizza Grande + Refrigerante 2L"
                    value={settings.prize_description}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        prize_description: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Configurações'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Participantes</CardTitle>
                  <CardDescription>
                    Clientes com tickets para o próximo sorteio
                  </CardDescription>
                  <p className="text-xs text-muted-foreground mt-1">
                    💡 Quem compra mais tem mais chance! A cada R$100 gastos = +10% de bônus na probabilidade.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setDrawPrize(settings.prize_description);
                    setShowDrawModal(true);
                  }}
                  disabled={ticketHolders.length === 0}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Realizar Sorteio
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ticketHolders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum participante ainda</p>
                  <p className="text-sm">
                    Os clientes ganharão tickets ao fazer pedidos
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {ticketHolders.slice(0, 20).map((holder, index) => (
                    <div
                      key={holder.customer_id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{holder.customer_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {holder.customer_phone}
                          </p>
                          {holder.total_spent > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Total gasto: R$ {holder.total_spent.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                          <Ticket className="h-3 w-3" />
                          {holder.total_tickets}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="gap-1 bg-primary/10 text-primary border-primary/20"
                          title="Probabilidade de ganhar"
                        >
                          {holder.chance_percent.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Draw History */}
        {draws.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Histórico de Sorteios</h2>
            {draws.map((draw, index) => (
              <Card key={draw.id} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          Sorteio #{draws.length - index}
                        </CardTitle>
                        <CardDescription>
                          {format(new Date(draw.drawn_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <Gift className="h-3 w-3" />
                      {draw.prize_description}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {/* Winner */}
                  <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
                        <Trophy className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-yellow-600 dark:text-yellow-400">
                          🎉 Ganhador: {draw.winner_name || 'N/A'}
                        </p>
                        <p className="text-sm text-muted-foreground">{draw.winner_phone}</p>
                      </div>
                      <Badge className="bg-yellow-500 text-white">
                        {draw.winner_tickets_count || 1} ticket{(draw.winner_tickets_count || 1) > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  {/* Participants */}
                  {draw.participants && draw.participants.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        Participantes ({draw.participants.length})
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {draw.participants.map((participant, pIndex) => (
                          <div
                            key={pIndex}
                            className={`flex items-center justify-between p-2 rounded-lg ${
                              participant.customer_phone === draw.winner_phone
                                ? 'bg-yellow-500/5 border border-yellow-500/20'
                                : 'bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                                {pIndex + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{participant.customer_name}</p>
                                <p className="text-xs text-muted-foreground">{participant.customer_phone}</p>
                              </div>
                            </div>
                            <Badge variant="secondary" className="gap-1 flex-shrink-0 ml-2">
                              <Ticket className="h-3 w-3" />
                              {participant.total_tickets}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No participants linked (old draws) */}
                  {(!draw.participants || draw.participants.length === 0) && (
                    <p className="text-sm text-muted-foreground italic">
                      Total de {draw.total_tickets_in_draw} ticket{draw.total_tickets_in_draw > 1 ? 's' : ''} neste sorteio
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Draw Modal */}
        <Dialog open={showDrawModal} onOpenChange={setShowDrawModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Realizar Sorteio
              </DialogTitle>
              <DialogDescription>
                O ganhador será escolhido aleatoriamente com base no número de tickets.
                Clientes com mais tickets têm mais chances de ganhar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Participantes:</span>
                  <span className="font-medium">{ticketHolders.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total de tickets:</span>
                  <span className="font-medium">{totalActiveTickets}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Prêmio deste sorteio</Label>
                <Textarea
                  value={drawPrize}
                  onChange={(e) => setDrawPrize(e.target.value)}
                  placeholder="Descreva o prêmio..."
                />
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">
                  Após o sorteio, todos os tickets serão zerados e os clientes começarão a
                  acumular novamente.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDrawModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleDraw} disabled={drawing || !drawPrize.trim()}>
                {drawing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sorteando...
                  </>
                ) : (
                  <>
                    <PartyPopper className="h-4 w-4 mr-2" />
                    Sortear Agora
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Draw Animation */}
        <LotteryDrawAnimation
          isOpen={showDrawAnimation}
          onClose={handleAnimationClose}
          participants={ticketHolders}
          winner={currentWinner}
          prizeName={drawPrize || settings.prize_description || 'Prêmio do sorteio'}
        />
      </div>
    </DashboardLayout>
  );
}
