import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Store,
  MapPin,
  Phone,
  Mail,
  Clock,
  DollarSign,
  Palette,
  Save,
  Loader2,
  ExternalLink,
  AlertCircle,
  Printer,
  Bell,
  Truck,
  CreditCard,
  FileText,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/image-upload';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OperatingHoursEditor, OperatingHours, DEFAULT_HOURS } from '@/components/store/OperatingHoursEditor';
import { DayPeriodsEditor } from '@/components/store/DayPeriodsEditor';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Json } from '@/integrations/supabase/types';
import { MercadoPagoConfig } from '@/components/store/MercadoPagoConfig';
import { PicPayConfig } from '@/components/store/PicPayConfig';
import { PaymentGatewaySelector } from '@/components/store/PaymentGatewaySelector';

interface StoreCategory {
  id: string;
  name: string;
}


const companySchema = z.object({
  name: z.string().min(2, 'Nome é obrigatório').max(100),
  slug: z
    .string()
    .min(2, 'Slug é obrigatório')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens'),
  description: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zipCode: z.string().max(10).optional(),
  niche: z.string().max(100).optional(),
  nicheCustom: z.string().max(100).optional(),
  deliveryFee: z.coerce.number().min(0).default(0),
  minOrderValue: z.coerce.number().min(0).default(0),
  primaryColor: z.string().default('#10B981'),
  secondaryColor: z.string().default('#059669'),
  pixKey: z.string().max(100).optional(),
  pixKeyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']).optional(),
  // Campos fiscais para NFe
  cnpj: z.string().max(18).optional(),
  razaoSocial: z.string().max(200).optional(),
  inscricaoEstadual: z.string().max(20).optional(),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface Company {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  logo_url: string | null;
  cover_url: string | null;
  delivery_fee: number;
  min_order_value: number;
  primary_color: string | null;
  secondary_color: string | null;
  is_open: boolean;
  status: string;
  pix_key: string | null;
  pix_key_type: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  monthly_order_count: number | null;
  opening_hours: Json | null;
  niche: string | null;
  auto_print_kitchen: boolean | null;
  auto_print_mode: string | null;
  show_floating_orders_button: boolean | null;
  whatsapp_notifications_enabled: boolean | null;
  // Campos fiscais
  cnpj: string | null;
  razao_social: string | null;
  inscricao_estadual: string | null;
}

export default function StoreSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(DEFAULT_HOURS);
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(false);
  const [autoPrintMode, setAutoPrintMode] = useState<'kitchen' | 'full' | 'both'>('kitchen');
  const [showFloatingOrdersButton, setShowFloatingOrdersButton] = useState(true);
  const [whatsappNotificationsEnabled, setWhatsappNotificationsEnabled] = useState(true);
  const [showPixKeyOnMenu, setShowPixKeyOnMenu] = useState(false);
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'geral');
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  
  // Ref para controlar se já carregou os dados iniciais
  const initialLoadDone = useRef(false);

  // Atualiza a aba quando o parâmetro de URL muda
  // Atualiza a aba quando o parâmetro de URL muda
  useEffect(() => {
    if (tabParam && ['geral', 'endereco', 'entrega', 'pagamento', 'horarios', 'aparencia', 'fiscal'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
    setValue,
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
  });

  const slug = watch('slug');
  const refCompanyId = searchParams.get('ref');

  // Carrega os dados apenas uma vez quando o user estiver disponível
  useEffect(() => {
    if (user?.id && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadCompany();
    }
  }, [user?.id]);

  const loadCompany = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCompany(data as Company);
        setLogoUrl(data.logo_url);
        setCoverUrl(data.cover_url);
        setIsOpen(!!data.is_open);
        setAutoPrintKitchen(!!data.auto_print_kitchen);
        setAutoPrintMode(((data.auto_print_mode as string) as 'kitchen' | 'full' | 'both') || 'kitchen');
        setShowFloatingOrdersButton(data.show_floating_orders_button ?? true);
        setWhatsappNotificationsEnabled(data.whatsapp_notifications_enabled ?? true);
        setShowPixKeyOnMenu(!!(data as any).show_pix_key_on_menu);
        if (data.opening_hours && typeof data.opening_hours === 'object') {
          setOperatingHours(data.opening_hours as unknown as OperatingHours);
        } else {
          setOperatingHours(DEFAULT_HOURS);
        }
        // Check if niche is a predefined value or custom
        const predefinedNiches = ['pizzaria', 'hamburgueria', 'restaurante', 'lanchonete', 'cafeteria', 'doceria', 'sorveteria', 'acaiteria', 'padaria', 'sushi', 'churrascaria', 'petiscaria', 'pastelaria', 'marmitaria', 'foodtruck', 'outro'];
        const isCustomNiche = data.niche && !predefinedNiches.includes(data.niche);
        
        reset({
          name: data.name,
          slug: data.slug,
          description: data.description || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zipCode: data.zip_code || '',
          niche: isCustomNiche ? 'outro' : (data.niche || undefined),
          nicheCustom: isCustomNiche ? data.niche : '',
          deliveryFee: Number(data.delivery_fee) || 0,
          minOrderValue: Number(data.min_order_value) || 0,
          primaryColor: data.primary_color || '#10B981',
          secondaryColor: data.secondary_color || '#059669',
          pixKey: data.pix_key || '',
          pixKeyType: (data.pix_key_type as any) || undefined,
          cnpj: data.cnpj || '',
          razaoSocial: data.razao_social || '',
          inscricaoEstadual: data.inscricao_estadual || '',
        });

        // Load categories for day periods editor
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('id, name')
          .eq('company_id', data.id)
          .order('sort_order');
        
        setStoreCategories(categoriesData || []);
      }
    } catch (error: any) {
      console.error('Error loading company:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
 
   const onSubmit = async (data: CompanyFormData) => {
    if (!user) return;

    setSaving(true);
    try {
      const companyData = {
        owner_id: user.id,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state ? data.state.toUpperCase() : null,
        zip_code: data.zipCode || null,
        logo_url: logoUrl,
        cover_url: coverUrl,
        delivery_fee: data.deliveryFee,
        min_order_value: data.minOrderValue,
        primary_color: data.primaryColor,
        secondary_color: data.secondaryColor,
        is_open: isOpen,
        pix_key: data.pixKey || null,
        pix_key_type: data.pixKeyType || null,
        opening_hours: operatingHours as unknown as Json,
        niche: data.niche === 'outro' && data.nicheCustom ? data.nicheCustom : (data.niche || null),
        auto_print_kitchen: autoPrintKitchen,
        auto_print_mode: autoPrintMode,
        show_floating_orders_button: showFloatingOrdersButton,
        whatsapp_notifications_enabled: whatsappNotificationsEnabled,
        show_pix_key_on_menu: showPixKeyOnMenu,
        cnpj: data.cnpj || null,
        razao_social: data.razaoSocial || null,
        inscricao_estadual: data.inscricaoEstadual || null,
      };

      if (company) {
        const { error } = await supabase
          .from('companies')
          .update(companyData)
          .eq('id', company.id);

        if (error) throw error;

        toast({
          title: 'Loja atualizada',
          description: 'As configurações foram salvas com sucesso',
        });
      } else {
        const { data: newCompany, error } = await supabase
          .from('companies')
          .insert(companyData)
          .select()
          .single();

        if (error) {
          if (error.message.includes('duplicate key') || error.message.includes('unique')) {
            toast({
              title: 'Slug já existe',
              description: 'Escolha outro nome para a URL da sua loja',
              variant: 'destructive',
            });
            return;
          }
          throw error;
        }

        await supabase.from('user_roles').insert({
          user_id: user.id,
          role: 'store_owner',
        });

        if (refCompanyId && refCompanyId !== (newCompany as any).id) {
          try {
            await supabase.from('referrals').insert({
              referrer_company_id: refCompanyId,
              referred_company_id: (newCompany as any).id,
            });
          } catch (refError: any) {
            console.error('Erro ao registrar indicação automática:', refError);
          }
        }

        setCompany(newCompany);
        toast({
          title: 'Loja criada!',
          description: 'Sua loja foi cadastrada e está aguardando aprovação',
        });
      }

      loadCompany();
    } catch (error: any) {
      console.error('Error saving company:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCepLookup = async () => {
    const cepRaw = watch('zipCode') || '';
    const cep = cepRaw.replace(/\D/g, '');

    if (cep.length !== 8) {
      toast({
        title: 'CEP inválido',
        description: 'Digite um CEP com 8 dígitos para buscar o endereço.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: 'CEP não encontrado',
          description: 'Verifique o CEP digitado e tente novamente.',
          variant: 'destructive',
        });
        return;
      }

      reset({
        name: watch('name'),
        slug: watch('slug'),
        description: watch('description'),
        phone: watch('phone'),
        email: watch('email'),
        address: `${data.logradouro}${data.bairro ? ' - ' + data.bairro : ''}`,
        city: data.localidade || '',
        state: (data.uf || '').toUpperCase(),
        zipCode: cepRaw,
        niche: watch('niche'),
        nicheCustom: watch('nicheCustom'),
        deliveryFee: watch('deliveryFee'),
        minOrderValue: watch('minOrderValue'),
        primaryColor: watch('primaryColor'),
        secondaryColor: watch('secondaryColor'),
        pixKey: watch('pixKey'),
        pixKeyType: watch('pixKeyType'),
      });

      toast({
        title: 'Endereço encontrado',
        description: 'Endereço preenchido automaticamente a partir do CEP.',
      });
    } catch (error: any) {
      console.error('Erro ao buscar CEP:', error);
      toast({
        title: 'Erro ao buscar CEP',
        description: 'Não foi possível buscar o endereço. Tente novamente mais tarde.',
        variant: 'destructive',
      });
    }
  };

  const toggleOpen = async () => {
    if (!company) return;

    const newValue = !isOpen;
    setIsOpen(newValue);

    try {
      const { error } = await supabase
        .from('companies')
        .update({ is_open: newValue })
        .eq('id', company.id);

      if (error) throw error;

      toast({
        title: newValue ? 'Loja aberta' : 'Loja fechada',
        description: newValue
          ? 'Sua loja está recebendo pedidos'
          : 'Sua loja não está recebendo pedidos',
      });
    } catch (error: any) {
      setIsOpen(!newValue);
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">
              {company ? 'Configurações da Loja' : 'Cadastrar Loja'}
            </h1>
            <p className="text-muted-foreground">
              {company
                ? 'Gerencie as informações da sua loja'
                : 'Preencha os dados para criar sua loja'}
            </p>
          </div>
          {company && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Loja</span>
                <Switch checked={isOpen} onCheckedChange={toggleOpen} />
                <span className="text-sm font-medium">
                  {isOpen ? 'Aberta' : 'Fechada'}
                </span>
              </div>
              {company.status === 'approved' && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/menu/${company.slug}`} target="_blank">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver Cardápio
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Status Alert */}
        {company && company.status === 'pending' && (
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium text-warning">Aguardando aprovação</p>
                <p className="text-sm text-muted-foreground">
                  Sua loja está em análise e será aprovada em breve
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={(e) => { 
          setSubmitAttempted(true); 
          handleSubmit(onSubmit, () => {
            // When validation fails, show toast
            toast({
              title: 'Campos obrigatórios',
              description: 'Verifique as abas marcadas em vermelho para corrigir os erros.',
              variant: 'destructive',
            });
          })(e); 
        }} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 h-auto">
              <TabsTrigger value="geral" className="relative flex items-center gap-2 py-2.5">
                <Store className="h-4 w-4" />
                <span className="hidden sm:inline">Geral</span>
                {submitAttempted && (errors.name || errors.slug || errors.description || errors.phone || errors.email || errors.niche) && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="endereco" className="relative flex items-center gap-2 py-2.5">
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Endereço</span>
                {submitAttempted && (errors.address || errors.city || errors.state || errors.zipCode) && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="entrega" className="relative flex items-center gap-2 py-2.5">
                <Truck className="h-4 w-4" />
                <span className="hidden sm:inline">Entrega</span>
                {submitAttempted && (errors.deliveryFee || errors.minOrderValue) && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pagamento" className="relative flex items-center gap-2 py-2.5">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Pagamento</span>
                {submitAttempted && (errors.pixKey || errors.pixKeyType) && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="fiscal" className="relative flex items-center gap-2 py-2.5">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Fiscal</span>
                {submitAttempted && (errors.cnpj || errors.razaoSocial || errors.inscricaoEstadual) && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="horarios" className="relative flex items-center gap-2 py-2.5">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Horários</span>
              </TabsTrigger>
              <TabsTrigger value="aparencia" className="relative flex items-center gap-2 py-2.5">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Aparência</span>
                {submitAttempted && (errors.primaryColor || errors.secondaryColor) && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tab: Geral */}
            <TabsContent value="geral" forceMount className="space-y-6 mt-6">
              {/* Visual Store Preview */}
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Store className="h-5 w-5 text-primary" />
                    Identidade Visual
                  </CardTitle>
                  <CardDescription>Logo e capa da sua loja - veja como ficará no cardápio</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative">
                    <div className="relative h-32 sm:h-40 bg-gradient-to-br from-primary/20 to-secondary/20">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt="Capa da loja"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
                          <span className="text-muted-foreground text-sm">Capa da loja</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                    </div>

                    <div className="absolute -bottom-10 left-6">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Logo da loja"
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-4 border-card shadow-lg bg-card"
                        />
                      ) : (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-primary/10 flex items-center justify-center border-4 border-card shadow-lg">
                          <Store className="h-8 w-8 text-primary" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-6 pt-14 pb-6 space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Logo da Loja</Label>
                          <span className="text-xs text-muted-foreground">Recomendado: 200x200px</span>
                        </div>
                        <ImageUpload
                          value={logoUrl}
                          onChange={setLogoUrl}
                          folder={user?.id || 'temp'}
                          aspectRatio="square"
                          className="max-w-[180px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Formato quadrado, aparece no cardápio e pedidos
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Capa / Banner</Label>
                          <span className="text-xs text-muted-foreground">Recomendado: 1200x400px</span>
                        </div>
                        <ImageUpload
                          value={coverUrl}
                          onChange={setCoverUrl}
                          folder={user?.id || 'temp'}
                          aspectRatio="video"
                        />
                        <p className="text-xs text-muted-foreground">
                          Imagem de destaque no topo do cardápio
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Informações Básicas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome da Loja *</Label>
                      <Input
                        id="name"
                        placeholder="Nome da sua loja"
                        {...register('name')}
                      />
                      {errors.name && (
                        <p className="text-sm text-destructive">{errors.name.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slug">URL da Loja *</Label>
                      <div className="flex">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                          /menu/
                        </span>
                        <Input
                          id="slug"
                          placeholder="minha-loja"
                          className="rounded-l-none"
                          {...register('slug')}
                        />
                      </div>
                      {errors.slug && (
                        <p className="text-sm text-destructive">{errors.slug.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      placeholder="Descreva sua loja..."
                      rows={3}
                      {...register('description')}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    Contato e Nicho
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="niche">Nicho / Setor</Label>
                      <select
                        id="niche"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        {...register('niche')}
                      >
                        <option value="">Selecione...</option>
                        <option value="pizzaria">Pizzaria</option>
                        <option value="hamburgueria">Hamburgueria</option>
                        <option value="restaurante">Restaurante</option>
                        <option value="lanchonete">Lanchonete</option>
                        <option value="cafeteria">Cafeteria</option>
                        <option value="doceria">Doceria</option>
                        <option value="sorveteria">Sorveteria</option>
                        <option value="acaiteria">Açaíteria</option>
                        <option value="padaria">Padaria</option>
                        <option value="sushi">Sushi / Japonês</option>
                        <option value="churrascaria">Churrascaria</option>
                        <option value="petiscaria">Petiscaria / Bar</option>
                        <option value="pastelaria">Pastelaria</option>
                        <option value="marmitaria">Marmitaria</option>
                        <option value="foodtruck">Food Truck</option>
                        <option value="outro">Outro (personalizado)</option>
                      </select>
                      {errors.niche && (
                        <p className="text-sm text-destructive">{errors.niche.message}</p>
                      )}
                    </div>
                    {watch('niche') === 'outro' && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="nicheCustom">Nome do nicho personalizado</Label>
                        <Input
                          id="nicheCustom"
                          placeholder="Ex: Comida Árabe, Temakeria, etc."
                          {...register('nicheCustom')}
                        />
                      </div>
                    )}
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        placeholder="(00) 00000-0000"
                        {...register('phone')}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="loja@email.com"
                        {...register('email')}
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email.message}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Interface Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    Configurações da Interface
                  </CardTitle>
                  <CardDescription>
                    Personalize a experiência do dashboard da sua loja.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Botão flutuante de pedidos</p>
                      <p className="text-xs text-muted-foreground">
                        Exibe um botão flutuante em todas as telas do dashboard mostrando o número de pedidos pendentes em tempo real.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Oculto</span>
                      <Switch
                        checked={showFloatingOrdersButton}
                        onCheckedChange={setShowFloatingOrdersButton}
                      />
                      <span className="text-xs font-medium">Visível</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Endereço */}
            <TabsContent value="endereco" forceMount className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Endereço da Loja
                  </CardTitle>
                  <CardDescription>
                    Informe o endereço para que os clientes saibam onde você está localizado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="address">Endereço</Label>
                      <Input
                        id="address"
                        placeholder="Rua, número"
                        {...register('address')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        placeholder="Cidade"
                        {...register('city')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="state">Estado</Label>
                        <Input
                          id="state"
                          placeholder="SP"
                          maxLength={2}
                          {...register('state')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">CEP</Label>
                        <Input
                          id="zipCode"
                          placeholder="00000-000"
                          {...register('zipCode')}
                          onBlur={(e) => {
                            register('zipCode').onBlur(e);
                            handleCepLookup();
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Entrega */}
            <TabsContent value="entrega" forceMount className="space-y-6 mt-6">
              {/* Delivery Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    Configurações de Entrega
                  </CardTitle>
                  <CardDescription>
                    Defina as taxas e valores mínimos para pedidos de entrega.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="deliveryFee">Taxa de Entrega</Label>
                      <CurrencyInput
                        id="deliveryFee"
                        value={watch('deliveryFee') || 0}
                        onChange={(value) => setValue('deliveryFee', parseFloat(value) || 0)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minOrderValue">Pedido Mínimo</Label>
                      <CurrencyInput
                        id="minOrderValue"
                        value={watch('minOrderValue') || 0}
                        onChange={(value) => setValue('minOrderValue', parseFloat(value) || 0)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Kitchen Print Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Printer className="h-5 w-5 text-primary" />
                    Impressão da Cozinha
                  </CardTitle>
                  <CardDescription>
                    Defina se e o que deve ser impresso automaticamente ao confirmar o pedido.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Imprimir automaticamente ao confirmar</p>
                      <p className="text-xs text-muted-foreground">
                        Quando ativado, ao mudar o pedido para <strong>Confirmado</strong>, a comanda será enviada para impressão.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Manual</span>
                      <Switch
                        checked={autoPrintKitchen}
                        onCheckedChange={setAutoPrintKitchen}
                      />
                      <span className="text-xs font-medium">Automático</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">O que imprimir automaticamente?</p>
                    <div className="grid gap-2 sm:grid-cols-3 text-xs">
                      <button
                        type="button"
                        className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition ${
                          autoPrintMode === 'kitchen'
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background'
                        }`}
                        onClick={() => setAutoPrintMode('kitchen')}
                      >
                        <span className="font-medium">Só cozinha</span>
                        <span className="text-muted-foreground">Imprime apenas a comanda da cozinha.</span>
                      </button>
                      <button
                        type="button"
                        className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition ${
                          autoPrintMode === 'full'
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background'
                        }`}
                        onClick={() => setAutoPrintMode('full')}
                      >
                        <span className="font-medium">Só comanda completa</span>
                        <span className="text-muted-foreground">Imprime a via detalhada do pedido.</span>
                      </button>
                      <button
                        type="button"
                        className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition ${
                          autoPrintMode === 'both'
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background'
                        }`}
                        onClick={() => setAutoPrintMode('both')}
                      >
                        <span className="font-medium">As duas vias</span>
                        <span className="text-muted-foreground">Imprime comanda completa e cozinha.</span>
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* WhatsApp Notification Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    Notificações por WhatsApp
                  </CardTitle>
                  <CardDescription>
                    Controle se deseja ver a opção de notificar clientes via WhatsApp ao mudar status do pedido.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Mostrar opção de enviar WhatsApp</p>
                      <p className="text-xs text-muted-foreground">
                        Quando ativado, ao mudar o status de um pedido, aparecerá um diálogo perguntando se deseja notificar o cliente via WhatsApp.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Desativado</span>
                      <Switch
                        checked={whatsappNotificationsEnabled}
                        onCheckedChange={setWhatsappNotificationsEnabled}
                      />
                      <span className="text-xs font-medium">Ativado</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Pagamento */}
            <TabsContent value="pagamento" forceMount className="space-y-6 mt-6">
              {/* Gateway Selector */}
              {company && <PaymentGatewaySelector companyId={company.id} />}

              {/* Mercado Pago Online Payment */}
              {company && <MercadoPagoConfig companyId={company.id} />}

              {/* PicPay */}
              {company && <PicPayConfig companyId={company.id} />}

              {/* PIX Manual */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    PIX Manual (Copia e Cola)
                  </CardTitle>
                  <CardDescription>
                    Chave PIX exibida ao cliente para pagamento manual (caso não use pagamento online)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pixKeyType">Tipo de Chave</Label>
                      <select
                        id="pixKeyType"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        {...register('pixKeyType')}
                      >
                        <option value="">Selecione...</option>
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">Email</option>
                        <option value="phone">Telefone</option>
                        <option value="random">Chave Aleatória</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pixKey">Chave PIX</Label>
                      <Input
                        id="pixKey"
                        placeholder="Sua chave PIX"
                        {...register('pixKey')}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-4 border-t">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Mostrar chave PIX no cardápio</p>
                      <p className="text-xs text-muted-foreground">
                        Exibe sua chave PIX para o cliente durante o checkout, permitindo pagamento manual via PIX (sem usar gateway de pagamento online).
                      </p>
                    </div>
                    <Switch
                      checked={showPixKeyOnMenu}
                      onCheckedChange={setShowPixKeyOnMenu}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Fiscal */}
            <TabsContent value="fiscal" forceMount className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Dados Fiscais
                  </CardTitle>
                  <CardDescription>
                    Preencha os dados fiscais para habilitar a emissão de Nota Fiscal Eletrônica (NF-e) nos pedidos entregues.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <div className="flex gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">Importante</p>
                        <p className="text-xs mt-1">
                          O CNPJ é obrigatório para emitir notas fiscais. Sem ele, a opção de emitir NF-e não aparecerá nos pedidos entregues.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ *</Label>
                      <Input
                        id="cnpj"
                        placeholder="00.000.000/0001-00"
                        {...register('cnpj')}
                      />
                      <p className="text-xs text-muted-foreground">
                        CNPJ da sua empresa para emissão de NF-e
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inscricaoEstadual">Inscrição Estadual</Label>
                      <Input
                        id="inscricaoEstadual"
                        placeholder="000.000.000.000"
                        {...register('inscricaoEstadual')}
                      />
                      <p className="text-xs text-muted-foreground">
                        IE para contribuintes de ICMS
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="razaoSocial">Razão Social</Label>
                    <Input
                      id="razaoSocial"
                      placeholder="Nome empresarial completo"
                      {...register('razaoSocial')}
                    />
                    <p className="text-xs text-muted-foreground">
                      Nome oficial da empresa conforme registro na Receita Federal
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Horários */}
            <TabsContent value="horarios" forceMount className="space-y-6 mt-6">
              <OperatingHoursEditor
                value={operatingHours}
                onChange={setOperatingHours}
              />

              {/* Day Periods Editor */}
              {company && (
                <DayPeriodsEditor
                  companyId={company.id}
                  categories={storeCategories}
                />
              )}
            </TabsContent>

            {/* Tab: Aparência */}
            <TabsContent value="aparencia" forceMount className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <Palette className="h-5 w-5 text-primary" />
                    Cores do Cardápio
                  </CardTitle>
                  <CardDescription>
                    Personalize as cores do seu cardápio. A cor principal é usada em botões e preços, 
                    a secundária em tags e detalhes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Preview em tempo real */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Prévia das cores
                    </p>
                    <div className="rounded-xl border border-border overflow-hidden bg-card">
                      <div className="p-4 flex items-center gap-4">
                        <div 
                          className="w-16 h-16 rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-xl"
                          style={{ backgroundColor: watch('primaryColor') || '#10B981' }}
                        >
                          Aa
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span 
                              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: watch('primaryColor') || '#10B981' }}
                            >
                              Promoção
                            </span>
                            <span 
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ 
                                backgroundColor: `${watch('secondaryColor') || '#059669'}20`,
                                color: watch('secondaryColor') || '#059669'
                              }}
                            >
                              Categoria
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span 
                              className="text-lg font-bold"
                              style={{ color: watch('primaryColor') || '#10B981' }}
                            >
                              R$ 29,90
                            </span>
                            <button 
                              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white shadow-md"
                              style={{ backgroundColor: watch('primaryColor') || '#10B981' }}
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Paletas prontas para alimentação - Expandido */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Paletas recomendadas
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        {
                          id: 'classic-red',
                          name: 'Clássico Vermelho',
                          description: 'Estilo iFood, forte e chamativo',
                          primary: '#EF4444',
                          secondary: '#FDBA74',
                        },
                        {
                          id: 'pizza-rustic',
                          name: 'Pizzaria Rústica',
                          description: 'Vermelho queimado com verde oliva',
                          primary: '#B91C1C',
                          secondary: '#15803D',
                        },
                        {
                          id: 'burger-urban',
                          name: 'Hamburgueria Urbana',
                          description: 'Amarelo cheddar com carvão',
                          primary: '#FBBF24',
                          secondary: '#111827',
                        },
                        {
                          id: 'coffee-warm',
                          name: 'Cafeteria Aconchegante',
                          description: 'Marrom café com creme',
                          primary: '#78350F',
                          secondary: '#FBBF77',
                        },
                        {
                          id: 'fresh-green',
                          name: 'Saudável / Salad',
                          description: 'Verde fresco com detalhes claros',
                          primary: '#16A34A',
                          secondary: '#DCFCE7',
                        },
                        {
                          id: 'night-delivery',
                          name: 'Delivery Noturno',
                          description: 'Roxo escuro com destaque neon',
                          primary: '#7C3AED',
                          secondary: '#22D3EE',
                        },
                        {
                          id: 'acai-tropical',
                          name: 'Açaí Tropical',
                          description: 'Roxo açaí com verde folha',
                          primary: '#6B21A8',
                          secondary: '#22C55E',
                        },
                        {
                          id: 'sushi-zen',
                          name: 'Japonês Zen',
                          description: 'Vermelho sakura com preto elegante',
                          primary: '#DC2626',
                          secondary: '#1F2937',
                        },
                        {
                          id: 'mexican-fiesta',
                          name: 'Mexicano Festa',
                          description: 'Laranja picante com verde limão',
                          primary: '#EA580C',
                          secondary: '#84CC16',
                        },
                        {
                          id: 'ice-cream-pastel',
                          name: 'Sorveteria Pastel',
                          description: 'Rosa suave com azul céu',
                          primary: '#EC4899',
                          secondary: '#38BDF8',
                        },
                        {
                          id: 'steakhouse-premium',
                          name: 'Churrascaria Premium',
                          description: 'Dourado elegante com bordô',
                          primary: '#B45309',
                          secondary: '#7F1D1D',
                        },
                        {
                          id: 'bakery-sweet',
                          name: 'Padaria Doce',
                          description: 'Marrom chocolate com rosa suave',
                          primary: '#92400E',
                          secondary: '#FCA5A5',
                        },
                      ].map((palette) => {
                        const isSelected = 
                          watch('primaryColor') === palette.primary && 
                          watch('secondaryColor') === palette.secondary;
                        
                        return (
                          <button
                            key={palette.id}
                            type="button"
                            onClick={() => {
                              setValue('primaryColor', palette.primary, { shouldDirty: true });
                              setValue('secondaryColor', palette.secondary, { shouldDirty: true });
                            }}
                            className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all ${
                              isSelected 
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                                : 'border-border bg-card hover:border-primary/60 hover:bg-accent/10'
                            }`}
                          >
                            <div className="flex h-9 w-9 overflow-hidden rounded-full border border-border bg-muted shadow-inner">
                              <div
                                className="h-full w-1/2"
                                style={{ backgroundColor: palette.primary }}
                              />
                              <div
                                className="h-full w-1/2"
                                style={{ backgroundColor: palette.secondary }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'group-hover:text-primary'}`}>
                                {palette.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {palette.description}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ajuste fino das cores */}
                  <div className="border-t border-border/60 pt-5 space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Personalização avançada
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="primaryColor" className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: watch('primaryColor') || '#10B981' }} />
                          Cor Principal
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="primaryColor"
                            type="color"
                            className="w-14 h-10 p-1 cursor-pointer rounded-md border border-border bg-background"
                            value={watch('primaryColor') || '#10B981'}
                            onChange={(e) => setValue('primaryColor', e.target.value, { shouldDirty: true })}
                          />
                          <Input
                            {...register('primaryColor')}
                            placeholder="#10B981"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Botões, preços, destaques e ações principais
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="secondaryColor" className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: watch('secondaryColor') || '#059669' }} />
                          Cor Secundária
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="secondaryColor"
                            type="color"
                            className="w-14 h-10 p-1 cursor-pointer rounded-md border border-border bg-background"
                            value={watch('secondaryColor') || '#059669'}
                            onChange={(e) => setValue('secondaryColor', e.target.value, { shouldDirty: true })}
                          />
                          <Input
                            {...register('secondaryColor')}
                            placeholder="#059669"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tags de categoria, badges e elementos de apoio
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dica */}
                  <div className="rounded-lg bg-muted/50 border border-border/50 p-4">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">💡 Dica:</strong> O cliente pode alternar entre tema claro e escuro no cardápio. 
                      As cores escolhidas aqui são aplicadas automaticamente em ambos os temas.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Button
            type="submit"
            size="lg"
            className="w-full gradient-primary text-primary-foreground"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {company ? 'Salvar Alterações' : 'Criar Loja'}
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
