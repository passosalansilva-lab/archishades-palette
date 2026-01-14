import { useState, useEffect } from 'react';
import {
  Bike,
  Car,
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  Truck,
  Package,
  MapPin,
  History,
  Clock,
  Navigation,
  DollarSign,
  Wallet,
  CreditCard,
  Copy,
  Link,
  ExternalLink,
  QrCode,
  RefreshCw,
  MessageCircle,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { FeatureGate } from '@/components/layout/FeatureGate';
import { PremiumBadge } from '@/components/layout/PremiumBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActivityLog } from '@/hooks/useActivityLog';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DriverHistoryModal } from '@/components/drivers/DriverHistoryModal';

type OrderStatus = Database['public']['Enums']['order_status'];

interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

interface Driver {
  id: string;
  user_id: string;
  company_id: string;
  vehicle_type: string | null;
  license_plate: string | null;
  is_available: boolean | null;
  is_active: boolean | null;
  driver_status: string | null;
  created_at: string;
  profile?: Profile;
  // For drivers without user account
  driver_name?: string;
  driver_phone?: string;
  email?: string;
  // Payment fields
  payment_type?: string;
  fixed_salary?: number;
  per_delivery_fee?: number;
  pending_earnings?: number;
  // Access token for direct login
  access_token?: string;
}

interface DriverDelivery {
  id: string;
  driver_id: string;
  created_at: string;
  delivered_at: string;
}

interface DriverMetrics {
  avgTimeBetweenDeliveries: number | null; // in minutes
  totalDeliveriesToday: number;
}

interface Order {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  total: number;
  delivery_driver_id: string | null;
  queue_position?: number | null;
  customer_addresses?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state?: string | null;
    complement?: string | null;
    reference?: string | null;
    zip_code?: string | null;
  };
}

const vehicleIcons: Record<string, typeof Car> = {
  moto: Bike,
  carro: Car,
  bicicleta: Bike,
};

export default function DriversManagement() {
  const { user, staffCompany } = useAuth();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [companySlug, setCompanySlug] = useState<string>('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [driverMetrics, setDriverMetrics] = useState<Record<string, DriverMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('drivers');

  // Dialog states
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);
  const [showDeleteDriver, setShowDeleteDriver] = useState(false);
  const [showAssignOrder, setShowAssignOrder] = useState(false);
  const [showDriverHistory, setShowDriverHistory] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Form states
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverEmail, setNewDriverEmail] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverVehicle, setNewDriverVehicle] = useState('moto');
  const [newDriverPlate, setNewDriverPlate] = useState('');
  const [newDriverPaymentType, setNewDriverPaymentType] = useState('per_delivery');
  const [newDriverFixedSalary, setNewDriverFixedSalary] = useState('0');
  const [newDriverPerDeliveryFee, setNewDriverPerDeliveryFee] = useState('5');
  const [saving, setSaving] = useState(false);
  
  // Payment dialog states
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  
  // QR Code dialog states
  const [showQrCodeDialog, setShowQrCodeDialog] = useState(false);
  const [qrCodeDriver, setQrCodeDriver] = useState<Driver | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get company
      const companyQuery = staffCompany?.companyId
        ? supabase.from('companies').select('id, name, slug').eq('id', staffCompany.companyId).maybeSingle()
        : supabase.from('companies').select('id, name, slug').eq('owner_id', user.id).maybeSingle();

      const { data: company, error: companyError } = await companyQuery;

      if (companyError) throw companyError;
      if (!company) {
        setLoading(false);
        return;
      }

      setCompanyId(company.id);
      setCompanyName(company.name);
      setCompanySlug(company.slug || '');

      // Load drivers
      const { data: driversData, error: driversError } = await supabase
        .from('delivery_drivers')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });

      if (driversError) throw driversError;

      // Load profiles for each driver
      const driverUserIds = driversData?.map(d => d.user_id) || [];
      let profilesMap: Record<string, Profile> = {};

      if (driverUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', driverUserIds);

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {} as Record<string, Profile>);
        }
      }

      const driversWithProfiles = (driversData || []).map(driver => ({
        ...driver,
        profile: profilesMap[driver.user_id],
      }));

      setDrivers(driversWithProfiles);

      // Load orders ready for delivery, awaiting driver, or out for delivery
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id, created_at, customer_name, customer_phone, status, total, delivery_driver_id, queue_position,
            customer_addresses:delivery_address_id (
              street,
              number,
              neighborhood,
              city,
              state,
              complement,
              reference,
              zip_code
            )
          `)
          .eq('company_id', company.id)
          .in('status', ['ready', 'awaiting_driver', 'queued', 'out_for_delivery'])
          .order('created_at', { ascending: true }); // FIFO - oldest first

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      // Load driver deliveries for metrics calculation
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: deliveriesData } = await supabase
        .from('driver_deliveries')
        .select('id, driver_id, created_at, delivered_at')
        .eq('company_id', company.id)
        .gte('delivered_at', today.toISOString())
        .order('delivered_at', { ascending: true });

      // Calculate metrics per driver
      const metrics: Record<string, DriverMetrics> = {};
      
      if (deliveriesData && deliveriesData.length > 0) {
        // Group deliveries by driver
        const deliveriesByDriver: Record<string, DriverDelivery[]> = {};
        deliveriesData.forEach((d) => {
          if (!deliveriesByDriver[d.driver_id]) {
            deliveriesByDriver[d.driver_id] = [];
          }
          deliveriesByDriver[d.driver_id].push(d);
        });

        // Calculate average time between deliveries for each driver
        Object.entries(deliveriesByDriver).forEach(([driverId, deliveries]) => {
          const totalDeliveriesToday = deliveries.length;
          
          // Need at least 2 deliveries to calculate time between
          if (deliveries.length >= 2) {
            const timeGaps: number[] = [];
            
            // Sort by delivered_at to ensure correct order
            deliveries.sort((a, b) => 
              new Date(a.delivered_at).getTime() - new Date(b.delivered_at).getTime()
            );
            
            for (let i = 1; i < deliveries.length; i++) {
              const prevDeliveredAt = new Date(deliveries[i - 1].delivered_at);
              const currentStartedAt = new Date(deliveries[i].created_at);
              
              // Time between previous delivery completed and current delivery started
              const gapMs = currentStartedAt.getTime() - prevDeliveredAt.getTime();
              const gapMinutes = gapMs / (1000 * 60);
              
              // Only count positive gaps (ignore if data is out of order)
              if (gapMinutes > 0 && gapMinutes < 120) { // Max 2 hours gap
                timeGaps.push(gapMinutes);
              }
            }
            
            if (timeGaps.length > 0) {
              const avgTime = timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length;
              metrics[driverId] = { avgTimeBetweenDeliveries: avgTime, totalDeliveriesToday };
            } else {
              metrics[driverId] = { avgTimeBetweenDeliveries: null, totalDeliveriesToday };
            }
          } else {
            metrics[driverId] = { avgTimeBetweenDeliveries: null, totalDeliveriesToday };
          }
        });
      }
      
      setDriverMetrics(metrics);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDriver = async () => {
    if (!companyId || !newDriverName || !newDriverEmail) return;

    setSaving(true);
    try {
      // Create driver record with email for future linking
      const { error: driverError } = await supabase.from('delivery_drivers').insert({
        company_id: companyId,
        driver_name: newDriverName,
        email: newDriverEmail.toLowerCase().trim(),
        driver_phone: newDriverPhone || null,
        vehicle_type: newDriverVehicle,
        license_plate: newDriverPlate || null,
        is_active: true,
        is_available: true,
        driver_status: 'available',
        payment_type: newDriverPaymentType,
        fixed_salary: parseFloat(newDriverFixedSalary) || 0,
        per_delivery_fee: parseFloat(newDriverPerDeliveryFee) || 5,
        pending_earnings: 0,
      });

      if (driverError) throw driverError;

      await logActivity({
        actionType: 'create',
        entityType: 'driver',
        entityName: newDriverName,
        description: `Entregador "${newDriverName}" cadastrado`,
      });

      toast({
        title: 'Entregador adicionado',
        description: `${newDriverName} foi cadastrado com sucesso.`,
      });

      setShowAddDriver(false);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error adding driver:', error);
      toast({
        title: 'Erro ao adicionar entregador',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDriver = async () => {
    if (!selectedDriver) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('delivery_drivers')
        .update({
          vehicle_type: newDriverVehicle,
          license_plate: newDriverPlate || null,
          is_active: selectedDriver.is_active,
          payment_type: newDriverPaymentType,
          fixed_salary: parseFloat(newDriverFixedSalary) || 0,
          per_delivery_fee: parseFloat(newDriverPerDeliveryFee) || 5,
        })
        .eq('id', selectedDriver.id);

      if (error) throw error;

      const driverName = selectedDriver.driver_name || selectedDriver.profile?.full_name || 'Entregador';
      await logActivity({
        actionType: 'update',
        entityType: 'driver',
        entityId: selectedDriver.id,
        entityName: driverName,
        description: `Entregador "${driverName}" atualizado`,
      });

      toast({
        title: 'Entregador atualizado',
        description: 'Dados do entregador atualizados com sucesso',
      });

      setShowEditDriver(false);
      loadData();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDriver = async () => {
    if (!selectedDriver) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('delivery_drivers')
        .delete()
        .eq('id', selectedDriver.id);

      if (error) throw error;

      const driverName = selectedDriver.driver_name || selectedDriver.profile?.full_name || 'Entregador';
      await logActivity({
        actionType: 'delete',
        entityType: 'driver',
        entityId: selectedDriver.id,
        entityName: driverName,
        description: `Entregador "${driverName}" removido`,
      });

      toast({
        title: 'Entregador removido',
        description: 'O entregador foi removido com sucesso',
      });

      setShowDeleteDriver(false);
      setSelectedDriver(null);
      loadData();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (driver: Driver) => {
    try {
      const newIsAvailable = !driver.is_available;
      const newStatus = newIsAvailable ? 'available' : 'offline';

      const { error } = await supabase
        .from('delivery_drivers')
        .update({ is_available: newIsAvailable, driver_status: newStatus })
        .eq('id', driver.id);

      if (error) throw error;

      setDrivers((prev) =>
        prev.map((d) =>
          d.id === driver.id
            ? { ...d, is_available: newIsAvailable, driver_status: newStatus }
            : d
        )
      );

      toast({
        title: driver.is_available ? 'Entregador indisponível' : 'Entregador disponível',
        description: `${driver.profile?.full_name || 'Entregador'} agora está ${
          driver.is_available ? 'indisponível' : 'disponível'
        }`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAssignOrder = async (order: Order, driverId: string) => {
    if (!companyId) return;
    
    setSaving(true);
    try {
      // Use edge function for proper assignment with validations
      const { data, error } = await supabase.functions.invoke('assign-driver', {
        body: {
          orderId: order.id,
          driverId: driverId,
          companyId: companyId,
        },
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.message || data.error);
      }

      const driverName = data?.driverName || 'Entregador';
      toast({
        title: 'Pedido atribuído',
        description: `${driverName} foi atribuído ao pedido e receberá uma notificação.`,
      });

      setShowAssignOrder(false);
      setSelectedOrder(null);
      loadData();
    } catch (error: any) {
      console.error('Error assigning order:', error);
      toast({
        title: 'Erro ao atribuir',
        description: error.message || 'Não foi possível atribuir o entregador',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };
  const handleUnassignOrder = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          delivery_driver_id: null,
          status: 'ready',
        })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Atribuição removida',
        description: 'O pedido voltou para "Pronto para entrega"',
      });

      loadData();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover atribuição',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setNewDriverName('');
    setNewDriverEmail('');
    setNewDriverPhone('');
    setNewDriverVehicle('moto');
    setNewDriverPlate('');
    setNewDriverPaymentType('per_delivery');
    setNewDriverFixedSalary('0');
    setNewDriverPerDeliveryFee('5');
    setSelectedDriver(null);
  };

  const openEditDriver = (driver: Driver) => {
    setSelectedDriver(driver);
    setNewDriverVehicle(driver.vehicle_type || 'moto');
    setNewDriverPlate(driver.license_plate || '');
    setNewDriverPaymentType(driver.payment_type || 'per_delivery');
    setNewDriverFixedSalary(String(driver.fixed_salary || 0));
    setNewDriverPerDeliveryFee(String(driver.per_delivery_fee || 5));
    setShowEditDriver(true);
  };
  
  const handlePayDriver = async () => {
    if (!selectedDriver || !companyId) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      // Create payment record
      const { error: paymentError } = await supabase.from('driver_payments').insert({
        driver_id: selectedDriver.id,
        company_id: companyId,
        amount,
        payment_type: 'deliveries',
        description: paymentDescription || 'Pagamento de entregas',
        delivery_count: 0, // Will be updated if we want to track
      });
      
      if (paymentError) throw paymentError;
      
      // Update pending earnings
      const { error: updateError } = await supabase
        .from('delivery_drivers')
        .update({ 
          pending_earnings: Math.max(0, (selectedDriver.pending_earnings || 0) - amount),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedDriver.id);
      
      if (updateError) throw updateError;
      
      // Mark deliveries as paid
      await supabase
        .from('driver_deliveries')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('driver_id', selectedDriver.id)
        .eq('status', 'pending');
      
      toast({ title: 'Pagamento registrado com sucesso!' });
      setShowPaymentDialog(false);
      setPaymentAmount('');
      setPaymentDescription('');
      loadData();
    } catch (error: any) {
      toast({ title: 'Erro ao registrar pagamento', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyDriverLink = () => {
    if (!companySlug) {
      toast({ title: 'Slug da empresa não encontrado', variant: 'destructive' });
      return;
    }
    const driverLoginLink = `${window.location.origin}/driver/login/${companySlug}`;
    navigator.clipboard.writeText(driverLoginLink);
    toast({ title: 'Link copiado!', description: 'Envie para seus entregadores acessarem.' });
  };

  const generateDriverToken = async (driver: Driver): Promise<string | null> => {
    try {
      // Generate a URL-safe random token
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      
      const { error } = await supabase
        .from('delivery_drivers')
        .update({ access_token: token } as any)
        .eq('id', driver.id);
      
      if (error) throw error;
      
      // Update local state
      setDrivers(prev => prev.map(d => 
        d.id === driver.id ? { ...d, access_token: token } : d
      ));
      
      return token;
    } catch (error: any) {
      console.error('Error generating token:', error);
      toast({ title: 'Erro ao gerar token', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const getDriverAccessLink = async (driver: Driver): Promise<string | null> => {
    let token = driver.access_token;
    
    if (!token) {
      setGeneratingToken(true);
      token = await generateDriverToken(driver);
      setGeneratingToken(false);
    }
    
    if (token) {
      return `${window.location.origin}/driver/access/${token}`;
    }
    return null;
  };

  const copyDriverAccessLink = async (driver: Driver) => {
    const accessLink = await getDriverAccessLink(driver);
    
    if (accessLink) {
      navigator.clipboard.writeText(accessLink);
      toast({ 
        title: 'Link único copiado!', 
        description: `Envie para ${driver.driver_name || 'o entregador'} acessar diretamente.` 
      });
    }
  };

  const sendDriverLinkViaWhatsApp = async (driver: Driver) => {
    const phone = driver.driver_phone || driver.profile?.phone;
    
    if (!phone) {
      toast({ 
        title: 'Telefone não cadastrado', 
        description: 'Adicione um telefone para este entregador primeiro.',
        variant: 'destructive' 
      });
      return;
    }
    
    const accessLink = await getDriverAccessLink(driver);
    
    if (accessLink) {
      // Remove non-numeric characters and ensure it starts with country code
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
      }
      if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
      
      const driverName = driver.driver_name || driver.profile?.full_name || 'Entregador';
      const message = `Olá ${driverName}! 🛵\n\nAcesse seu painel de entregas da *${companyName}* pelo link abaixo:\n\n${accessLink}\n\nEste link é exclusivo para você. Guarde-o para acessar sempre que precisar!`;
      
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      
      toast({ 
        title: 'Abrindo WhatsApp...', 
        description: `Enviando link de acesso para ${driverName}` 
      });
    }
  };

  const openQrCodeDialog = async (driver: Driver) => {
    if (!driver.access_token) {
      setGeneratingToken(true);
      const token = await generateDriverToken(driver);
      setGeneratingToken(false);
      if (token) {
        setQrCodeDriver({ ...driver, access_token: token });
        setShowQrCodeDialog(true);
      }
    } else {
      setQrCodeDriver(driver);
      setShowQrCodeDialog(true);
    }
  };

  const regenerateDriverToken = async () => {
    if (!qrCodeDriver) return;
    
    setGeneratingToken(true);
    const token = await generateDriverToken(qrCodeDriver);
    setGeneratingToken(false);
    
    if (token) {
      setQrCodeDriver({ ...qrCodeDriver, access_token: token });
      toast({ title: 'Novo link gerado!', description: 'O link anterior foi invalidado.' });
    }
  };

  const availableDrivers = drivers.filter((d) => d.is_available && d.is_active);
  const ordersWithoutDriver = orders.filter((o) => !o.delivery_driver_id);
  const ordersWithDriver = orders.filter((o) => o.delivery_driver_id);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Truck className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Nenhuma loja encontrada</h2>
            <p className="text-muted-foreground text-center mb-4">
              Você precisa cadastrar sua loja antes de gerenciar entregadores
            </p>
            <Button asChild>
              <a href="/dashboard/store">Cadastrar Loja</a>
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold font-display">Entregadores</h1>
              <p className="text-muted-foreground">
                Gerencie seus motoboys e atribua pedidos
              </p>
            </div>
            <PremiumBadge featureKey="drivers" />
          </div>
          <Button onClick={() => setShowAddDriver(true)} className="gradient-primary text-primary-foreground">
            <UserPlus className="h-4 w-4 mr-2" />
            Adicionar Entregador
          </Button>
        </div>

        {/* Driver Access Link */}
        {companySlug && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Link className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Link de Acesso para Entregadores</p>
                    <p className="text-sm text-muted-foreground">
                      Compartilhe este link para seus entregadores acessarem o painel exclusivo da sua loja
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="px-3 py-1.5 bg-muted rounded-lg text-sm font-mono hidden lg:block max-w-xs truncate">
                    {window.location.origin}/driver/login/{companySlug}
                  </code>
                  <Button onClick={copyDriverLink} variant="outline" size="sm" className="gap-2">
                    <Copy className="h-4 w-4" />
                    Copiar Link
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{drivers.length}</div>
              <p className="text-xs text-muted-foreground">entregadores cadastrados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Disponíveis</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{availableDrivers.length}</div>
              <p className="text-xs text-muted-foreground">prontos para entrega</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
              <Package className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ordersWithoutDriver.length}</div>
              <p className="text-xs text-muted-foreground">pedidos sem entregador</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Em Entrega</CardTitle>
              <Bike className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ordersWithDriver.length}</div>
              <p className="text-xs text-muted-foreground">pedidos em rota</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="drivers" className="gap-2">
              <Truck className="h-4 w-4" />
              Entregadores
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <Package className="h-4 w-4" />
              Fila de Entregas
              {ordersWithDriver.length > 0 && (
                <Badge variant="default" className="ml-1 bg-blue-500">
                  {ordersWithDriver.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="assign" className="gap-2">
              <Clock className="h-4 w-4" />
              Aguardando
              {ordersWithoutDriver.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {ordersWithoutDriver.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="demo" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Como Funciona
            </TabsTrigger>
          </TabsList>

          {/* Auto-assign alert when only 1 active driver */}
          {drivers.filter(d => d.is_active).length === 1 && ordersWithoutDriver.length > 0 && (
            <Card className="mt-4 border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Bike className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Atribuição Rápida</p>
                      <p className="text-sm text-muted-foreground">
                        Você tem apenas 1 entregador ativo. Atribua todos os {ordersWithoutDriver.length} pedidos automaticamente?
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      const activeDriver = drivers.find(d => d.is_active);
                      if (!activeDriver) {
                        toast({ title: 'Nenhum entregador ativo', variant: 'destructive' });
                        return;
                      }
                      setSaving(true);
                      try {
                        for (const order of ordersWithoutDriver) {
                          await handleAssignOrder(order, activeDriver.id);
                        }
                        toast({ title: `${ordersWithoutDriver.length} pedidos atribuídos!` });
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving || !drivers.find(d => d.is_active)}
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Atribuir Todos
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <TabsContent value="drivers" className="mt-6">
            {drivers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum entregador</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Adicione entregadores para gerenciar suas entregas
                  </p>
                  <Button onClick={() => setShowAddDriver(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Entregador
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {drivers.map((driver) => {
                  const VehicleIcon = vehicleIcons[driver.vehicle_type || 'moto'] || Bike;
                  const activeOrders = orders.filter(
                    (o) => o.delivery_driver_id === driver.id
                  );

                  return (
                    <Card key={driver.id} className={!driver.is_active ? 'opacity-60' : ''}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-primary/10">
                              <VehicleIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">
                                {driver.driver_name || driver.profile?.full_name || 'Sem nome'}
                              </CardTitle>
                              <p className="text-sm text-muted-foreground capitalize">
                                {driver.vehicle_type || 'Moto'}
                                {driver.license_plate && ` - ${driver.license_plate}`}
                              </p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDriver(driver)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedDriver(driver);
                                  setShowDriverHistory(true);
                                }}
                              >
                                <History className="h-4 w-4 mr-2" />
                                Histórico
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedDriver(driver);
                                  setPaymentAmount(String(driver.pending_earnings || 0));
                                  setShowPaymentDialog(true);
                                }}
                              >
                                <DollarSign className="h-4 w-4 mr-2" />
                                Registrar Pagamento
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyDriverAccessLink(driver)}>
                                <Link className="h-4 w-4 mr-2" />
                                Copiar Link de Acesso
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => sendDriverLinkViaWhatsApp(driver)}>
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Enviar Link via WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openQrCodeDialog(driver)}>
                                <QrCode className="h-4 w-4 mr-2" />
                                Ver QR Code
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedDriver(driver);
                                  setShowDeleteDriver(true);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {driver.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            <span>{driver.email}</span>
                            {driver.user_id ? (
                              <Badge variant="default" className="text-xs bg-green-500">Ativo</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Pronto para acessar</Badge>
                            )}
                          </div>
                        )}
                        {(driver.driver_phone || driver.profile?.phone) && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <a href={`tel:${driver.driver_phone || driver.profile?.phone}`} className="hover:underline">
                              {driver.driver_phone || driver.profile?.phone}
                            </a>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {driver.is_available ? (
                              <Badge variant="default" className="bg-green-500">
                                Disponível
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Indisponível</Badge>
                            )}
                            {activeOrders.length > 0 && (
                              <Badge variant="outline">
                                {activeOrders.length} entrega(s)
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={driver.is_available || false}
                            onCheckedChange={() => handleToggleAvailability(driver)}
                          />
                        </div>
                        
                        {/* Payment Info */}
                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Wallet className="h-3 w-3" />
                              Ganhos pendentes
                            </span>
                            <span className="font-bold text-primary">
                              R$ {(driver.pending_earnings || 0).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {driver.payment_type === 'fixed' ? 'Salário fixo' : 
                               driver.payment_type === 'fixed_plus_delivery' ? 'Fixo + entrega' : 
                               'Por entrega'}
                            </span>
                            <span>
                              {driver.payment_type !== 'fixed' && `R$ ${(driver.per_delivery_fee || 5).toFixed(2).replace('.', ',')}/entrega`}
                              {driver.payment_type === 'fixed_plus_delivery' && driver.fixed_salary ? ` + R$ ${driver.fixed_salary.toFixed(2).replace('.', ',')} fixo` : ''}
                              {driver.payment_type === 'fixed' && driver.fixed_salary ? `R$ ${driver.fixed_salary.toFixed(2).replace('.', ',')}` : ''}
                            </span>
                          </div>
                          {(driver.pending_earnings || 0) > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => {
                                setSelectedDriver(driver);
                                setPaymentAmount(String(driver.pending_earnings || 0));
                                setShowPaymentDialog(true);
                              }}
                            >
                              <DollarSign className="h-3 w-3 mr-1" />
                              Pagar
                            </Button>
                          )}
                        </div>

                        {/* Performance Metrics */}
                        {(driverMetrics[driver.id]?.totalDeliveriesToday ?? 0) > 0 && (
                          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="h-4 w-4 text-blue-500" />
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Desempenho Hoje</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Entregas</p>
                                <p className="text-lg font-bold">{driverMetrics[driver.id]?.totalDeliveriesToday ?? 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  Tempo médio entre
                                </p>
                                <p className="text-lg font-bold">
                                  {driverMetrics[driver.id]?.avgTimeBetweenDeliveries != null
                                    ? `${Math.round(driverMetrics[driver.id].avgTimeBetweenDeliveries!)} min`
                                    : '-'
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeOrders.length > 0 && (
                          <div className="pt-2 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Entregas ativas:
                            </p>
                            {activeOrders.map((order) => (
                              <div
                                key={order.id}
                                className="flex items-center justify-between text-sm p-2 bg-muted rounded"
                              >
                                <div>
                                  <span className="font-medium">#{order.id.slice(0, 8)}</span>
                                  {order.customer_addresses && (
                                    <p className="text-xs text-muted-foreground">
                                      {order.customer_addresses.street}, {order.customer_addresses.number} - {order.customer_addresses.neighborhood} - {order.customer_addresses.city}{order.customer_addresses.state ? ` / ${order.customer_addresses.state}` : ''}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnassignOrder(order.id)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Delivery Queue Tab */}
          <TabsContent value="queue" className="mt-6">
            {ordersWithDriver.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma entrega em andamento</h3>
                  <p className="text-muted-foreground text-center">
                    Os pedidos atribuídos aos entregadores aparecerão aqui
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {drivers
                  .filter((d) => d.is_active)
                  .map((driver) => {
                    const driverOrders = ordersWithDriver.filter(
                      (o) => o.delivery_driver_id === driver.id
                    );
                    if (driverOrders.length === 0) return null;

                    const VehicleIcon = vehicleIcons[driver.vehicle_type || 'moto'] || Bike;
                    const driverStatusLabel = driver.driver_status === 'in_delivery' 
                      ? 'Em entrega' 
                      : driver.driver_status === 'available' 
                        ? 'Disponível' 
                        : 'Offline';
                    const driverStatusColor = driver.driver_status === 'in_delivery'
                      ? 'bg-blue-500'
                      : driver.driver_status === 'available'
                        ? 'bg-green-500'
                        : 'bg-gray-500';

                    return (
                      <Card key={driver.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-primary/10">
                                <VehicleIcon className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-base">
                                  {driver.driver_name || driver.profile?.full_name || 'Sem nome'}
                                </CardTitle>
                                <p className="text-sm text-muted-foreground">
                                  {driverOrders.length} entrega(s) na fila
                                </p>
                              </div>
                            </div>
                            <Badge className={driverStatusColor}>
                              {driverStatusLabel}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {driverOrders.map((order, index) => (
                              <div
                                key={order.id}
                                className={`p-3 rounded-lg border ${
                                  index === 0 ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      {index === 0 && (
                                        <Badge variant="destructive" className="text-xs">Próxima</Badge>
                                      )}
                                      <span className="font-medium">#{order.id.slice(0, 8)}</span>
                                      <Badge variant={order.status === 'out_for_delivery' ? 'default' : order.status === 'awaiting_driver' ? 'destructive' : 'secondary'}>
                                        {order.status === 'out_for_delivery' ? 'Em entrega' : order.status === 'awaiting_driver' ? 'Aguardando Aceite' : 'Pronto'}
                                      </Badge>
                                    </div>
                                    <p className="text-sm font-medium">{order.customer_name}</p>
                                    <a
                                      href={`tel:${order.customer_phone}`}
                                      className="text-sm text-primary hover:underline flex items-center gap-1"
                                    >
                                      <Phone className="h-3 w-3" />
                                      {order.customer_phone}
                                    </a>
                                    {order.customer_addresses && (
                                      <div className="mt-2 p-2 bg-muted rounded text-sm">
                                        <div className="flex items-start gap-2">
                                          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                          <div>
                                            <p className="font-medium">
                                              {order.customer_addresses.street}, {order.customer_addresses.number}
                                            </p>
                                            <p className="text-muted-foreground">
                                              {order.customer_addresses.neighborhood} - {order.customer_addresses.city}{order.customer_addresses.state ? ` / ${order.customer_addresses.state}` : ''}
                                            </p>
                                            {order.customer_addresses.complement && (
                                              <p className="text-muted-foreground text-xs mt-1">
                                                <span className="font-medium">Complemento:</span> {order.customer_addresses.complement}
                                              </p>
                                            )}
                                            {order.customer_addresses.reference && (
                                              <p className="text-muted-foreground text-xs">
                                                <span className="font-medium">Referência:</span> {order.customer_addresses.reference}
                                              </p>
                                            )}
                                            {order.customer_addresses.zip_code && (
                                              <p className="text-muted-foreground text-[11px] mt-1">
                                                CEP: {order.customer_addresses.zip_code}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="mt-2 w-full"
                                          onClick={() => {
                                            const address = `${order.customer_addresses!.street}, ${order.customer_addresses!.number}, ${order.customer_addresses!.neighborhood}, ${order.customer_addresses!.city}${order.customer_addresses!.state ? `, ${order.customer_addresses!.state}` : ''}`;
                                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,'_blank');
                                          }}
                                        >
                                          <Navigation className="h-4 w-4 mr-2" />
                                          Abrir no Maps
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-lg">
                                      R$ {order.total.toFixed(2).replace('.', ',')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDistanceToNow(new Date(order.created_at), { 
                                        addSuffix: true, 
                                        locale: ptBR 
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                  .filter(Boolean)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assign" className="mt-6">
            {ordersWithoutDriver.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Tudo certo!</h3>
                  <p className="text-muted-foreground text-center">
                    Todos os pedidos prontos já têm entregadores atribuídos
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {ordersWithoutDriver.map((order) => (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">#{order.id.slice(0, 8)}</span>
                            <Badge variant="outline">Pronto</Badge>
                          </div>
                          <p className="text-sm">{order.customer_name}</p>
                          {order.customer_addresses && (
                            <div className="text-sm text-muted-foreground flex flex-col gap-0.5">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {order.customer_addresses.street}, {order.customer_addresses.number} - {order.customer_addresses.neighborhood}
                              </span>
                              <span className="text-xs">
                                {order.customer_addresses.city}{order.customer_addresses.state ? ` / ${order.customer_addresses.state}` : ''}
                                {order.customer_addresses.zip_code ? ` • CEP: ${order.customer_addresses.zip_code}` : ''}
                              </span>
                            </div>
                          )}
                          <p className="text-sm font-medium">
                            R$ {order.total.toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            onValueChange={(driverId) => {
                              handleAssignOrder(order, driverId);
                            }}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Atribuir entregador" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDrivers.length === 0 ? (
                                <div className="p-2 text-sm text-muted-foreground text-center">
                                  Nenhum entregador disponível
                                </div>
                              ) : (
                                availableDrivers.map((driver) => (
                                  <SelectItem key={driver.id} value={driver.id}>
                                    {driver.driver_name || driver.profile?.full_name || 'Sem nome'}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Demo Tab - How it works */}
          <TabsContent value="demo" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Phone Mockup */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
                  <CardTitle className="flex items-center gap-2">
                    <Bike className="h-5 w-5" />
                    App do Entregador - Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative bg-background">
                    {/* Phone frame */}
                    <div className="mx-auto max-w-[320px] p-4">
                      {/* Status bar mockup */}
                      <div className="rounded-t-2xl bg-card border border-b-0 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                              <Bike className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">João M.</p>
                              <p className="text-xs text-muted-foreground">Entregador</p>
                            </div>
                          </div>
                          <Badge className="bg-green-500 text-white text-xs">Online</Badge>
                        </div>
                      </div>

                      {/* Control card */}
                      <div className="bg-card border-x p-3 space-y-3">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                              <CheckCircle className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-sm">Disponível para entregas</span>
                          </div>
                          <div className="w-10 h-5 rounded-full bg-green-500 relative">
                            <div className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow" />
                          </div>
                        </div>
                      </div>

                      {/* Financial card */}
                      <div className="bg-card border-x p-3">
                        <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Wallet className="h-4 w-4 text-primary" />
                            Meu Financeiro
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                              <p className="text-xs text-muted-foreground">A receber</p>
                              <p className="font-bold text-green-600">R$ 85,00</p>
                            </div>
                            <div className="p-2 rounded bg-primary/10 border border-primary/20">
                              <p className="text-xs text-muted-foreground">Já recebido</p>
                              <p className="font-bold text-primary">R$ 420,00</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Order card */}
                      <div className="bg-card border-x p-3 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Minhas Entregas (2)
                        </p>
                        
                        {/* Order 1 - Priority */}
                        <div className="p-3 rounded-lg border-2 border-primary bg-primary/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] border-primary text-primary">Próxima</Badge>
                              <span className="text-xs font-medium">Pizzaria Bella</span>
                            </div>
                            <Badge className="text-[10px] bg-blue-500">Em Entrega</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">Maria Silva</span>
                            <span className="font-bold text-primary">R$ 58,90</span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>Av. Brasil, 1250 - Centro</span>
                          </div>
                          <Button size="sm" className="w-full h-8 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Concluir Entrega
                          </Button>
                        </div>

                        {/* Order 2 - Queue */}
                        <div className="p-3 rounded-lg border bg-muted/30 space-y-2 opacity-70">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Pizzaria Bella</span>
                            <Badge variant="secondary" className="text-[10px]">Na Fila #2</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">Pedro Santos</span>
                            <span className="font-bold">R$ 42,50</span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>R. das Flores, 88 - Jardim</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom rounded */}
                      <div className="rounded-b-2xl bg-card border border-t-0 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Instructions */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Como Funciona a Fila</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-bold text-primary">1</span>
                      </div>
                      <div>
                        <p className="font-medium">Atribuição Automática</p>
                        <p className="text-sm text-muted-foreground">
                          Quando há apenas 1 entregador ativo, você pode atribuir todos os pedidos automaticamente.
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-bold text-primary">2</span>
                      </div>
                      <div>
                        <p className="font-medium">Fila com Prioridade (FIFO)</p>
                        <p className="text-sm text-muted-foreground">
                          Os pedidos são ordenados por ordem de chegada. O primeiro a entrar é o primeiro a ser entregue.
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-bold text-primary">3</span>
                      </div>
                      <div>
                        <p className="font-medium">Interface Sem Refresh</p>
                        <p className="text-sm text-muted-foreground">
                          O app do entregador atualiza em tempo real sem recarregar a página, evitando perder a posição.
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-bold text-primary">4</span>
                      </div>
                      <div>
                        <p className="font-medium">Próxima Entrega Automática</p>
                        <p className="text-sm text-muted-foreground">
                          Ao concluir uma entrega, a próxima da fila já aparece automaticamente para o entregador.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ExternalLink className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Testar App do Entregador</p>
                        <p className="text-sm text-muted-foreground">
                          Compartilhe o link com seus entregadores para que acessem
                        </p>
                      </div>
                      <Button onClick={copyDriverLink} variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Driver Dialog */}
      <Dialog open={showAddDriver} onOpenChange={setShowAddDriver}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Entregador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="driver-name">Nome completo *</Label>
              <Input
                id="driver-name"
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                placeholder="Nome do entregador"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-email">Email *</Label>
              <Input
                id="driver-email"
                type="email"
                value={newDriverEmail}
                onChange={(e) => setNewDriverEmail(e.target.value)}
                placeholder="entregador@email.com"
              />
              <p className="text-xs text-muted-foreground">
                O entregador usará este email para acessar o sistema
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-phone">Telefone</Label>
              <Input
                id="driver-phone"
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de veículo</Label>
                <Select value={newDriverVehicle} onValueChange={setNewDriverVehicle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moto">Moto</SelectItem>
                    <SelectItem value="carro">Carro</SelectItem>
                    <SelectItem value="bicicleta">Bicicleta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-plate">Placa</Label>
                <Input
                  id="driver-plate"
                  value={newDriverPlate}
                  onChange={(e) => setNewDriverPlate(e.target.value.toUpperCase())}
                  placeholder="ABC-1234"
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Forma de pagamento
              </Label>
              <Select value={newDriverPaymentType} onValueChange={setNewDriverPaymentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_delivery">Por entrega</SelectItem>
                  <SelectItem value="fixed">Salário fixo</SelectItem>
                  <SelectItem value="fixed_plus_delivery">Fixo + por entrega</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {(newDriverPaymentType === 'fixed' || newDriverPaymentType === 'fixed_plus_delivery') && (
                <div className="space-y-2">
                  <Label htmlFor="driver-fixed-salary">Salário fixo (R$)</Label>
                  <Input
                    id="driver-fixed-salary"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newDriverFixedSalary}
                    onChange={(e) => setNewDriverFixedSalary(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
              {(newDriverPaymentType === 'per_delivery' || newDriverPaymentType === 'fixed_plus_delivery') && (
                <div className="space-y-2">
                  <Label htmlFor="driver-per-delivery">Valor por entrega (R$)</Label>
                  <Input
                    id="driver-per-delivery"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newDriverPerDeliveryFee}
                    onChange={(e) => setNewDriverPerDeliveryFee(e.target.value)}
                    placeholder="5.00"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDriver(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddDriver}
              disabled={saving || !newDriverName || !newDriverEmail}
              className="gradient-primary text-primary-foreground"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Driver Dialog */}
      <Dialog open={showEditDriver} onOpenChange={setShowEditDriver}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Entregador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de veículo</Label>
                <Select value={newDriverVehicle} onValueChange={setNewDriverVehicle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moto">Moto</SelectItem>
                    <SelectItem value="carro">Carro</SelectItem>
                    <SelectItem value="bicicleta">Bicicleta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-plate">Placa</Label>
                <Input
                  id="edit-plate"
                  value={newDriverPlate}
                  onChange={(e) => setNewDriverPlate(e.target.value.toUpperCase())}
                  placeholder="ABC-1234"
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Forma de pagamento
              </Label>
              <Select value={newDriverPaymentType} onValueChange={setNewDriverPaymentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_delivery">Por entrega</SelectItem>
                  <SelectItem value="fixed">Salário fixo</SelectItem>
                  <SelectItem value="fixed_plus_delivery">Fixo + por entrega</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {(newDriverPaymentType === 'fixed' || newDriverPaymentType === 'fixed_plus_delivery') && (
                <div className="space-y-2">
                  <Label htmlFor="edit-fixed-salary">Salário fixo (R$)</Label>
                  <Input
                    id="edit-fixed-salary"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newDriverFixedSalary}
                    onChange={(e) => setNewDriverFixedSalary(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
              {(newDriverPaymentType === 'per_delivery' || newDriverPaymentType === 'fixed_plus_delivery') && (
                <div className="space-y-2">
                  <Label htmlFor="edit-per-delivery">Valor por entrega (R$)</Label>
                  <Input
                    id="edit-per-delivery"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newDriverPerDeliveryFee}
                    onChange={(e) => setNewDriverPerDeliveryFee(e.target.value)}
                    placeholder="5.00"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDriver(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateDriver}
              disabled={saving}
              className="gradient-primary text-primary-foreground"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDriver} onOpenChange={setShowDeleteDriver}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover entregador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O entregador será removido da sua equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDriver}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Registrar Pagamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Entregador</p>
              <p className="font-medium">{selectedDriver?.driver_name || selectedDriver?.profile?.full_name || 'Sem nome'}</p>
              <p className="text-sm text-muted-foreground mt-2">Ganhos pendentes</p>
              <p className="text-xl font-bold text-primary">
                R$ {(selectedDriver?.pending_earnings || 0).toFixed(2).replace('.', ',')}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Valor do pagamento (R$) *</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="payment-description">Descrição (opcional)</Label>
              <Input
                id="payment-description"
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                placeholder="Ex: Pagamento semanal, bônus, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handlePayDriver}
              disabled={saving || !paymentAmount || parseFloat(paymentAmount) <= 0}
              className="gradient-primary text-primary-foreground"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Driver History Modal */}
      <DriverHistoryModal
        open={showDriverHistory}
        onOpenChange={setShowDriverHistory}
        driver={selectedDriver}
        companyId={companyId || ''}
      />

      {/* QR Code Dialog */}
      <Dialog open={showQrCodeDialog} onOpenChange={setShowQrCodeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code de Acesso
            </DialogTitle>
          </DialogHeader>
          {qrCodeDriver && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <p className="font-medium">{qrCodeDriver.driver_name || 'Entregador'}</p>
                <p className="text-sm text-muted-foreground">{qrCodeDriver.email}</p>
              </div>
              
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-xl shadow-inner">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/driver/access/${qrCodeDriver.access_token}`)}`}
                    alt="QR Code de acesso"
                    className="w-48 h-48"
                  />
                </div>
              </div>
              
              <p className="text-xs text-center text-muted-foreground">
                O entregador pode escanear este QR Code para acessar diretamente, sem precisar digitar email.
              </p>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    const link = `${window.location.origin}/driver/access/${qrCodeDriver.access_token}`;
                    navigator.clipboard.writeText(link);
                    toast({ title: 'Link copiado!' });
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Link
                </Button>
                <Button
                  variant="outline"
                  onClick={regenerateDriverToken}
                  disabled={generatingToken}
                >
                  {generatingToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
