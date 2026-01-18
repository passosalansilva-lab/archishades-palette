import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { showSystemNotification } from '@/hooks/useElectronNotifications';

export function useWaiterCallNotifications() {
  const { toast } = useToast();
  const { user, staffCompany } = useAuth();
  const notifiedCallsRef = useRef<Set<string>>(new Set());
  const companyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Get company ID
    const getCompanyId = async () => {
      const companyQuery = staffCompany?.companyId
        ? supabase.from('companies').select('id').eq('id', staffCompany.companyId).maybeSingle()
        : supabase.from('companies').select('id').eq('owner_id', user.id).maybeSingle();

      const { data: company } = await companyQuery;
      if (company) {
        companyIdRef.current = company.id;
        subscribeToWaiterCalls(company.id);
      }
    };

    const subscribeToWaiterCalls = (companyId: string) => {
      console.log('[WaiterCalls] Subscribing to notifications for company:', companyId);

      const channel = supabase
        .channel('global-waiter-calls')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'waiter_calls',
            filter: `company_id=eq.${companyId}`
          },
          async (payload) => {
            console.log('[WaiterCalls] New call received:', payload);
            const call = payload.new as any;

            // Avoid duplicate notifications
            if (notifiedCallsRef.current.has(call.id)) {
              return;
            }
            notifiedCallsRef.current.add(call.id);

            // Get table info
            const { data: table } = await supabase
              .from('tables')
              .select('table_number, name')
              .eq('id', call.table_id)
              .single();

            const tableName = table?.name || `Mesa ${table?.table_number || '?'}`;
            const callType = call.call_type === 'bill' ? 'Pediu a conta' : 'Chamou garçom';

            // Show toast notification
            toast({
              title: `🔔 ${callType}`,
              description: `${tableName} está chamando!`,
              duration: 10000,
            });

            // Play notification sound
            try {
              const audio = new Audio('/sounds/default-notification.mp3');
              audio.volume = 0.7;
              await audio.play();
            } catch (e) {
              console.log('[WaiterCalls] Could not play sound:', e);
            }

            // Send system notification (works in Electron and browser)
            showSystemNotification({
              title: `${callType} - ${tableName}`,
              body: 'Clique para ver os detalhes',
              icon: '/favicon.png',
              tag: `waiter-call-${call.id}`,
              onClick: () => {
                window.location.href = '/dashboard/tables';
              },
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    getCompanyId();
  }, [user, staffCompany, toast]);
}
