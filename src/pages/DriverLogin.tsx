import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Loader2, Truck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { applyCompanyBranding } from '@/hooks/useCompanyColors';

export default function DriverLogin() {
  const navigate = useNavigate();
  const { companySlug } = useParams<{ companySlug?: string }>();
  const { user, loading: authLoading, hasRole, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLoading, setCompanyLoading] = useState(!!companySlug);

  // Carrega nome da empresa se houver slug na URL
  useEffect(() => {
    const loadCompanyInfo = async () => {
      if (!companySlug) {
        setCompanyLoading(false);
        return;
      }

      try {
        const { data: company, error } = await supabase
          .from('companies')
          .select('id, name, logo_url, primary_color, secondary_color')
          .eq('slug', companySlug)
          .maybeSingle();

        if (error) throw error;

        if (company) {
          setCompanyName(company.name);
          setCompanyLogoUrl(company.logo_url || null);

          // Aplica branding da empresa já na tela de login
          applyCompanyBranding({
            primaryColor: company.primary_color || undefined,
            secondaryColor: company.secondary_color || undefined,
          });
        } else {
          toast.error('Empresa não encontrada', {
            description: 'O link de acesso pode estar incorreto.',
          });
        }
      } catch {
        toast.error('Link inválido', {
          description: 'O link de acesso está incorreto ou expirado.',
        });
      } finally {
        setCompanyLoading(false);
      }
    };

    loadCompanyInfo();
  }, [companySlug]);

  // Verifica se já está logado
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      const isDriver = hasRole('delivery_driver');
      const isStoreOwner = hasRole('store_owner');
      const isSuperAdmin = hasRole('super_admin');

      if (isDriver) {
        navigate('/driver', { replace: true });
        return;
      }

      if (isStoreOwner || isSuperAdmin) {
        toast.info('Você está logado como lojista', {
          description: 'Faça logout para acessar como entregador.',
        });
        signOut();
      }
    }
  }, [user, authLoading, hasRole, navigate, signOut]);

  if (authLoading || companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Digite seu email');
      return;
    }

    setLoading(true);

    try {
      const { data: loginData, error: invokeError } = await supabase.functions.invoke('driver-direct-login', {
        body: {
          email: email.toLowerCase().trim(),
          companySlug: companySlug || null,
        },
      });

      // Debug (sem vazar token)
      console.log('[DriverLogin] driver-direct-login result', {
        ok: !invokeError,
        keys: loginData ? Object.keys(loginData) : null,
        hasSession: !!loginData?.session,
        hasMagicLink: !!loginData?.magicLink,
        hasError: !!loginData?.error,
      });

      // Erro real de rede ou crash da função (500, timeout, etc.)
      if (invokeError) {
        toast.error('Falha ao logar', {
          description: 'Email pode não estar cadastrado. Acione o logista.',
        });
        return;
      }

      // Erros controlados pela função (status 400)
      if (loginData?.error) {
        let title = 'Não foi possível entrar';
        let description = loginData.error;

        if (loginData.error.includes('não cadastrado') || loginData.error.includes('desativada')) {
          title = 'Email não reconhecido';
          description = 'Este email não está cadastrado como entregador. Peça ao estabelecimento para cadastrá-lo.';
        } else if (loginData.error.includes('Empresa não encontrada')) {
          title = 'Link inválido';
          description = 'O link de acesso está incorreto. Peça um novo link ao estabelecimento.';
        }

        toast.error(title, { description });
        return;
      }

      // Sucesso: a função retorna session com tokens prontos
      if (loginData?.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: loginData.session.access_token,
          refresh_token: loginData.session.refresh_token,
        });

        if (sessionError) {
          console.error('[DriverLogin] setSession error', sessionError);
          toast.error('Erro ao salvar login', {
            description: 'Tente novamente ou reinicie o aplicativo.',
          });
          return;
        }

        const firstName = loginData.driverName?.split(' ')[0];
        toast.success('Login realizado com sucesso!', {
          description: firstName ? `Bem-vindo, ${firstName}!` : 'Bem-vindo!',
        });

        navigate('/driver', { replace: true });
        return;
      }

      // Fallback: magic link (legado)
      if (loginData?.magicLink) {
        toast.success('Entrando...', {
          description: 'Aguarde um instante, estamos validando seu acesso.',
        });
        window.location.assign(loginData.magicLink);
        return;
      }

      console.error('[DriverLogin] Unexpected response format', loginData);
      toast.error('Erro inesperado', {
        description: 'Resposta inválida do servidor.',
      });
    } catch (error) {
      console.error('Erro inesperado no login:', error);
      toast.error('Erro inesperado', {
        description: 'Tente novamente ou contate o suporte.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background using semantic tokens */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18)_0%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,hsl(var(--accent)/0.18)_0%,transparent_60%)]" />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass shadow-glow">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              {companyLogoUrl ? (
                <div className="h-16 w-16 rounded-2xl overflow-hidden border border-border/60 bg-card shadow-card">
                  <img
                    src={companyLogoUrl}
                    alt={companyName ? `Logo ${companyName}` : 'Logo da empresa'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/pwa-192x192.png';
                    }}
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                  <Truck className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>

            <CardTitle className="text-2xl font-display">Área do Entregador</CardTitle>
            <CardDescription>
              {companyName ? (
                <span className="flex items-center justify-center gap-2 mt-2">
                  <Store className="h-4 w-4" />
                  Acesso para <span className="font-medium text-foreground">{companyName}</span>
                </span>
              ) : (
                'Acesse com o email cadastrado pelo estabelecimento'
              )}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                  autoFocus
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground hover-lift"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>

            {!companySlug && (
              <p className="text-xs text-muted-foreground text-center mt-6">
                Se você trabalha em mais de uma empresa, peça o link de acesso específico ao estabelecimento.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}