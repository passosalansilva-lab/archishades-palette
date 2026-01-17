import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  Check,
  Search,
  Tag,
  X,
  AlertCircle,
  LogIn,
  LogOut,
  Plus,
  MessageCircle,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { CustomerAuthModal, CustomerData, ReferralDiscountData } from './CustomerAuthModal';
import { AddressSelector } from './AddressSelector';
import { PixPaymentScreen } from './PixPaymentScreen';
import { PicPayPaymentScreen } from './PicPayPaymentScreen';
import { CardPaymentScreen } from './CardPaymentScreen';
import { ReferralShareCard } from './ReferralShareCard';
import { LotteryTicketsCard } from './LotteryTicketsCard';
import { useAuth } from '@/hooks/useAuth';
import { GroupedOptionsDisplay } from '@/components/ui/grouped-options-display';
import { trackCartConversions } from '@/hooks/usePromotionTracking';

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number | null;
}

interface SavedAddress {
  id: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  reference: string | null;
  label: string | null;
  is_default: boolean | null;
  customer_id?: string | null;
}

// Base schema - address fields are optional when tableNumber is provided
const checkoutSchema = z.object({
  customerName: z.string().min(2, 'Nome é obrigatório'),
  customerPhone: z
    .string()
    .optional()
    .or(z.literal('')),
  customerEmail: z.string().email('Email inválido'),
  street: z.string().optional().or(z.literal('')),
  number: z.string().optional().or(z.literal('')),
  complement: z.string().optional(),
  neighborhood: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zipCode: z.string().optional().or(z.literal('')),
  reference: z.string().optional(),
  addressLabel: z.string().optional(),
  paymentMethod: z.enum(['cash', 'card_on_delivery', 'pix', 'card_online', 'pay_at_counter']),
  needsChange: z.boolean().optional(),
  changeFor: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

interface CheckoutPageProps {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyPhone?: string | null;
  deliveryFee: number;
  minOrderValue: number;
  onBack: () => void;
  isStoreOpen?: boolean;
  onlinePaymentEnabled?: boolean;
  pixEnabled?: boolean;
  cardEnabled?: boolean;
  activeGateway?: 'mercadopago' | 'picpay';
  showPixKeyOnMenu?: boolean;
  manualPixKey?: string | null;
  manualPixKeyType?: string | null;
  tableNumber?: number | null;
  tableSessionId?: string | null;
  referralCode?: string | null;
}

interface OrderSummary {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
}

export function CheckoutPage({ companyId, companyName, companySlug, companyPhone, deliveryFee, minOrderValue, onBack, isStoreOpen = true, onlinePaymentEnabled = false, pixEnabled = true, cardEnabled = true, activeGateway = 'mercadopago', showPixKeyOnMenu = false, manualPixKey = null, manualPixKeyType = null, tableNumber = null, tableSessionId = null, referralCode = null }: CheckoutPageProps) {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCart();
  const { toast } = useToast();

  // Debug logging for table orders
  useEffect(() => {
    if (tableNumber || tableSessionId) {
      console.log('[CheckoutPage] Table order mode:', { tableNumber, tableSessionId, companyId });
    }
  }, [tableNumber, tableSessionId, companyId]);
  
  const getCustomerStorageKey = (companyId: string | null | undefined) =>
    companyId ? `menupro_customer_${companyId}` : 'menupro_customer';

  // Helper to update localStorage with the correct customer_id after order
  const updateStoredCustomerId = useCallback((newCustomerId: string, customerData?: { name?: string; email?: string; phone?: string }) => {
    if (!companyId || !newCustomerId) return;
    
    try {
      const key = getCustomerStorageKey(companyId);
      const existing = localStorage.getItem(key);
      let updatedData: any = { id: newCustomerId };
      
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          updatedData = { ...parsed, id: newCustomerId };
        } catch {
          // If parse fails, just use the new data
        }
      }
      
      // Merge with any provided customer data
      if (customerData) {
        if (customerData.name) updatedData.name = customerData.name;
        if (customerData.email) updatedData.email = customerData.email;
        if (customerData.phone) updatedData.phone = customerData.phone;
      }
      
      localStorage.setItem(key, JSON.stringify(updatedData));
      console.log('[CheckoutPage] Updated stored customer ID:', newCustomerId);
    } catch (e) {
      console.error('Error updating stored customer:', e);
    }
  }, [companyId]);
  
  // Customer state (not auth - just lookup)
  const [loggedCustomer, setLoggedCustomer] = useState<CustomerData | null>(() => {
    try {
      const legacy = localStorage.getItem('menupro_customer');
      const scoped = companyId ? localStorage.getItem(getCustomerStorageKey(companyId)) : null;
      const stored = scoped || legacy;
      if (!stored) return null;
      return JSON.parse(stored) as CustomerData;
    } catch (e) {
      console.error('Error loading stored customer:', e);
      return null;
    }
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Address state
  const [selectedAddress, setSelectedAddress] = useState<SavedAddress | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  
  // Form state
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderCustomerId, setOrderCustomerId] = useState<string | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<typeof items>([]);
  const [ticketsEarnedInOrder, setTicketsEarnedInOrder] = useState(0);
  
  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Referral discount state
  const [referralDiscount, setReferralDiscount] = useState<{
    discountPercent: number;
    referrerName: string;
    referralCodeId: string;
    referrerId: string;
  } | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(false);
  const [referralFeatureEnabled, setReferralFeatureEnabled] = useState(true); // Assume enabled until checked
  // Customer referral credits state (for referrers who earned credits)
  const [customerCredits, setCustomerCredits] = useState<{
    totalAvailable: number;
    credits: Array<{ id: string; amount: number; remaining_amount: number }>;
  } | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // PIX Payment state
  const [pixPaymentData, setPixPaymentData] = useState<{
    paymentId: string;
    pendingId: string;
    qrCodeBase64: string;
    qrCode: string;
    ticketUrl?: string;
    expiresAt: string;
    total: number;
    companyName: string;
    companySlug: string;
    customerId?: string | null;
  } | null>(null);

  // Card Payment state
  const [cardPaymentData, setCardPaymentData] = useState<{
    addressId?: string;
    formData: CheckoutFormData;
    customerId?: string | null;
  } | null>(null);

  // PicPay Payment state
  const [picPayPaymentData, setPicPayPaymentData] = useState<{
    pendingId: string;
    paymentLinkId: string;
    qrCode: string;
    qrCodeBase64?: string | null;
    paymentUrl?: string | null;
    expiresAt: string;
    total: number;
    companyName: string;
    companySlug: string;
    customerId?: string | null;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      paymentMethod: onlinePaymentEnabled && pixEnabled ? 'pix' : onlinePaymentEnabled && cardEnabled ? 'card_online' : 'cash',
      addressLabel: 'Casa',
    },
  });

  const paymentMethod = watch('paymentMethod');
  const zipCode = watch('zipCode');

  // Prefill form when we already have a logged customer (from storage/auth)
  useEffect(() => {
    if (!loggedCustomer) return;

    setValue('customerName', loggedCustomer.name);
    setValue('customerPhone', loggedCustomer.phone);
    if (loggedCustomer.email) {
      setValue('customerEmail', loggedCustomer.email);
    }
  }, [loggedCustomer, setValue]);

  // When customer logs in via lookup, prefill form and persist session
  const handleCustomerLogin = (customer: CustomerData, referralDiscountData?: ReferralDiscountData) => {
    setLoggedCustomer(customer);
    try {
      const key = getCustomerStorageKey(companyId);
      localStorage.setItem(key, JSON.stringify(customer));
      // Também persistimos o identificador para "Meus pedidos"
      const identifier = (customer.email || customer.phone || '').toLowerCase().trim();
      if (identifier) {
        localStorage.setItem('menupro_last_customer_identifier', identifier);
      }
      // Clean legacy key para evitar conflitos antigos
      localStorage.removeItem('menupro_customer');
    } catch (e) {
      console.error('Error saving customer to storage:', e);
    }
    setValue('customerName', customer.name);
    setValue('customerPhone', customer.phone);
    if (customer.email) {
      setValue('customerEmail', customer.email);
    }

    // If referral discount was applied during registration, set it
    if (referralDiscountData) {
      setReferralDiscount(referralDiscountData);
      setPendingReferralCode(null);
      toast({
        title: 'Desconto de indicação aplicado!',
        description: `${referralDiscountData.referrerName} te indicou! Você ganha ${referralDiscountData.discountPercent}% de desconto.`,
      });
    }
  };

  const handleCustomerLogout = () => {
    // ========== LIMPEZA COMPLETA DE DADOS DO CLIENTE ==========
    // 1. Limpa estados do React
    setLoggedCustomer(null);
    setSelectedAddress(null);
    setShowAddressForm(false);
    setReferralDiscount(null);
    setLastValidatedEmail(undefined);
    setCustomerCredits(null); // Limpa créditos de indicação
    setAppliedCoupon(null); // Limpa cupom aplicado
    setCouponCode(''); // Limpa código do cupom
    setCouponError(null);
    
    if (referralCode) {
      setPendingReferralCode(referralCode);
    }
    
    // 2. Limpa TODOS os dados do localStorage relacionados ao cliente
    try {
      const key = getCustomerStorageKey(companyId);
      localStorage.removeItem(key);
      localStorage.removeItem('menupro_customer');
      localStorage.removeItem('menupro_last_customer_identifier');
      
      // Limpa também dados de todas as empresas (para garantir limpeza total)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith('menupro_customer_')) {
          keysToRemove.push(storageKey);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      
      console.log('[CheckoutPage] Customer logout - cleared all customer data');
    } catch (e) {
      console.error('Error clearing stored customer:', e);
    }
    
    // 3. Reseta o formulário completamente com valores vazios
    reset({
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
      reference: '',
      addressLabel: 'Casa',
      paymentMethod: onlinePaymentEnabled && pixEnabled ? 'pix' : onlinePaymentEnabled && cardEnabled ? 'card_online' : 'cash',
      needsChange: false,
      changeFor: undefined,
      notes: '',
    });
    
    toast({ title: 'Você saiu da sua conta', description: 'Todos os dados foram limpos.' });
  };
  // When address is selected, optionally show form if "new"
  useEffect(() => {
    if (selectedAddress && !showAddressForm) {
      setValue('street', selectedAddress.street);
      setValue('number', selectedAddress.number);
      setValue('complement', selectedAddress.complement || '');
      setValue('neighborhood', selectedAddress.neighborhood);
      setValue('city', selectedAddress.city);
      setValue('state', selectedAddress.state);
      setValue('zipCode', selectedAddress.zip_code);
      setValue('reference', selectedAddress.reference || '');
    }
  }, [selectedAddress, showAddressForm, setValue]);

  // Track the last validated email to detect when customer logs in
  const [lastValidatedEmail, setLastValidatedEmail] = useState<string | undefined>(undefined);
  // Track if we have a pending referral code (shows message to login)
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(referralCode);

  // Check if referral feature is enabled for this company
  useEffect(() => {
    const checkReferralFeature = async () => {
      try {
        const { data: featureData } = await supabase
          .from('company_features' as any)
          .select('is_active')
          .eq('company_id', companyId)
          .eq('feature_key', 'referrals')
          .maybeSingle() as { data: { is_active: boolean } | null };

        // If feature is explicitly disabled, hide referral UI
        if (featureData && !featureData.is_active) {
          setReferralFeatureEnabled(false);
          setPendingReferralCode(null);
          setReferralDiscount(null);
        }
      } catch (error) {
        // Keep enabled by default on error
      }
    };
    checkReferralFeature();
  }, [companyId]);

  // Validate referral ONLY when customer is logged in
  useEffect(() => {
    const validateReferralForLoggedCustomer = async () => {
      // If feature is disabled, don't validate
      if (!referralFeatureEnabled) return;
      
      // Only validate if we have a referral code AND customer is logged in
      if (!referralCode || !loggedCustomer?.email) {
        // If there's a code but no customer, keep it as pending
        if (referralCode && !loggedCustomer) {
          setPendingReferralCode(referralCode);
        }
        return;
      }

      // Skip if already validated for this email
      if (loggedCustomer.email === lastValidatedEmail) return;
      
      setLoadingReferral(true);
      try {
        const { data, error } = await supabase.functions.invoke('validate-referral-code', {
          body: {
            companyId,
            referralCode,
            customerEmail: loggedCustomer.email,
          },
        });

        if (error) {
          console.error('Error validating referral code:', error);
          setLastValidatedEmail(loggedCustomer.email);
          setPendingReferralCode(null);
          return;
        }

        if (data?.valid) {
          setReferralDiscount({
            discountPercent: data.discountPercent,
            referrerName: data.referrerName,
            referralCodeId: data.referralCodeId,
            referrerId: data.referrerId,
          });
          setPendingReferralCode(null);
          toast({
            title: 'Desconto de indicação aplicado!',
            description: `${data.referrerName} te indicou! Você ganha ${data.discountPercent}% de desconto.`,
          });
        } else if (data?.error) {
          // Customer already used referral, is trying to use own code, etc.
          setReferralDiscount(null);
          setPendingReferralCode(null);
          toast({
            title: 'Código de indicação inválido',
            description: data.error,
            variant: 'destructive',
          });
        }
        setLastValidatedEmail(loggedCustomer.email);
      } catch (err) {
        console.error('Error validating referral:', err);
        setLastValidatedEmail(loggedCustomer.email);
        setPendingReferralCode(null);
      } finally {
        setLoadingReferral(false);
      }
    };

    validateReferralForLoggedCustomer();
  }, [referralCode, companyId, loggedCustomer, lastValidatedEmail, toast]);

  // Clear referral discount when customer logs out
  useEffect(() => {
    if (!loggedCustomer && referralDiscount) {
      setReferralDiscount(null);
      setLastValidatedEmail(undefined);
      if (referralCode) {
        setPendingReferralCode(referralCode);
      }
    }
    // Also clear credits when customer logs out
    if (!loggedCustomer && customerCredits) {
      setCustomerCredits(null);
    }
  }, [loggedCustomer, referralDiscount, referralCode, customerCredits]);

  // Fetch customer credits when logged in
  useEffect(() => {
    const fetchCustomerCredits = async () => {
      if (!loggedCustomer?.id || !companyId) {
        setCustomerCredits(null);
        return;
      }

      setLoadingCredits(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-customer-credits', {
          body: {
            companyId,
            customerId: loggedCustomer.id,
          },
        });

        if (error) {
          console.error('Error fetching customer credits:', error);
          return;
        }

        if (data?.totalAvailable > 0) {
          setCustomerCredits({
            totalAvailable: data.totalAvailable,
            credits: data.credits || [],
          });
          toast({
            title: 'Crédito de indicação disponível!',
            description: `Você tem R$ ${data.totalAvailable.toFixed(2)} em créditos para usar neste pedido.`,
          });
        } else {
          setCustomerCredits(null);
        }
      } catch (err) {
        console.error('Error fetching credits:', err);
      } finally {
        setLoadingCredits(false);
      }
    };

    fetchCustomerCredits();
  }, [loggedCustomer?.id, companyId, toast]);
  
  // Calculate discount (coupon OR referral OR credits, not combined - coupon takes priority)
  const couponDiscount = appliedCoupon 
    ? appliedCoupon.discount_type === 'percentage'
      ? (subtotal * appliedCoupon.discount_value) / 100
      : appliedCoupon.discount_value
    : 0;
  
  const referralDiscountAmount = !appliedCoupon && referralDiscount
    ? (subtotal * referralDiscount.discountPercent) / 100
    : 0;

  // Customer credits (only apply if no coupon and no referral discount from URL)
  const creditsToApply = !appliedCoupon && !referralDiscount && customerCredits
    ? Math.min(customerCredits.totalAvailable, subtotal) // Can't exceed subtotal
    : 0;
  
  const discountAmount = couponDiscount || referralDiscountAmount || creditsToApply;
  
  // No delivery fee for table orders
  const effectiveDeliveryFee = tableNumber ? 0 : deliveryFee;
  const total = subtotal - discountAmount + effectiveDeliveryFee;

  // Helper to calculate lottery tickets earned
  const calculateTicketsEarned = useCallback(async (orderSubtotal: number) => {
    try {
      const { data: lotterySettings } = await supabase
        .from('lottery_settings')
        .select('is_enabled, tickets_per_order, tickets_per_amount')
        .eq('company_id', companyId)
        .eq('is_enabled', true)
        .maybeSingle();
      
      if (lotterySettings) {
        let tickets = 0;
        if (lotterySettings.tickets_per_order > 0) {
          tickets += lotterySettings.tickets_per_order;
        }
        if (lotterySettings.tickets_per_amount > 0 && orderSubtotal > 0) {
          tickets += Math.floor(orderSubtotal / lotterySettings.tickets_per_amount);
        }
        return tickets;
      }
      return 0;
    } catch (err) {
      console.error('Error fetching lottery settings:', err);
      return 0;
    }
  }, [companyId]);

  const searchCep = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data: ViaCepResponse = await response.json();

      if (data.erro) {
        toast({
          title: 'CEP não encontrado',
          description: 'Verifique o CEP e tente novamente',
          variant: 'destructive',
        });
        return;
      }

      setValue('street', data.logradouro || '');
      setValue('neighborhood', data.bairro || '');
      setValue('city', data.localidade || '');
      setValue('state', data.uf || '');
      if (data.complemento) {
        setValue('complement', data.complemento);
      }

      toast({
        title: 'Endereço encontrado',
        description: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`,
      });
    } catch (error) {
      console.error('Error fetching CEP:', error);
      toast({
        title: 'Erro ao buscar CEP',
        description: 'Tente novamente ou preencha manualmente',
        variant: 'destructive',
      });
    } finally {
      setLoadingCep(false);
    }
  }, [setValue, toast]);

  const handleCepBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value;
    if (cep.replace(/\D/g, '').length === 8) {
      searchCep(cep);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Digite um código de cupom');
      return;
    }

    setLoadingCoupon(true);
    setCouponError(null);

    try {
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('company_id', companyId)
        .eq('code', couponCode.toUpperCase().trim())
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!coupon) {
        setCouponError('Cupom não encontrado ou inválido');
        return;
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        setCouponError('Este cupom expirou');
        return;
      }

      if (coupon.min_order_value && subtotal < coupon.min_order_value) {
        setCouponError(`Pedido mínimo de R$ ${coupon.min_order_value.toFixed(2)} para este cupom`);
        return;
      }

      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
        setCouponError('Este cupom atingiu o limite de uso');
        return;
      }

      setAppliedCoupon(coupon);
      toast({
        title: 'Cupom aplicado!',
        description: coupon.discount_type === 'percentage' 
          ? `${coupon.discount_value}% de desconto` 
          : `R$ ${coupon.discount_value.toFixed(2)} de desconto`,
      });
    } catch (error) {
      console.error('Error applying coupon:', error);
      setCouponError('Erro ao aplicar cupom');
    } finally {
      setLoadingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
  };

  // Remove old handleLogout - replaced by handleCustomerLogout above

  const onSubmit = async (data: CheckoutFormData) => {
    if (!isStoreOpen) {
      toast({
        title: 'Loja fechada',
        description: 'Esta loja está fechada no momento. Tente novamente mais tarde.',
        variant: 'destructive',
      });
      return;
    }

    if (items.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione itens antes de finalizar',
        variant: 'destructive',
      });
      return;
    }

    // A table order requires both tableNumber and tableSessionId to be properly linked
    // If we have tableNumber but no tableSessionId, the order won't be linked to the session
    const isTableOrder = !!tableSessionId; // Use tableSessionId as the source of truth
    
    // Safety check: if tableNumber is set but tableSessionId is missing, block the order
    if (tableNumber && !tableSessionId) {
      console.error('[CheckoutPage] Table order blocked: tableNumber exists but tableSessionId is null');
      toast({
        title: 'Erro na sessão da mesa',
        description: 'Por favor, recarregue a página e tente novamente.',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate address fields only when NOT a table order
    if (!isTableOrder) {
      if (!data.street || data.street.length < 3) {
        toast({ title: 'Rua é obrigatória', variant: 'destructive' });
        return;
      }
      if (!data.number || data.number.length < 1) {
        toast({ title: 'Número é obrigatório', variant: 'destructive' });
        return;
      }
      if (!data.neighborhood || data.neighborhood.length < 2) {
        toast({ title: 'Bairro é obrigatório', variant: 'destructive' });
        return;
      }
      if (!data.city || data.city.length < 2) {
        toast({ title: 'Cidade é obrigatória', variant: 'destructive' });
        return;
      }
      if (!data.state || data.state.length < 2) {
        toast({ title: 'Estado é obrigatório', variant: 'destructive' });
        return;
      }
    }

    // Skip minimum order value check for table orders
    if (!tableNumber && minOrderValue > 0 && subtotal < minOrderValue) {
      toast({
        title: 'Pedido mínimo não atingido',
        description: `O valor mínimo do pedido é R$ ${minOrderValue.toFixed(2)}. Seu carrinho tem R$ ${subtotal.toFixed(2)}.`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // We'll track the order ID to clean up on any failure after creation
    let createdOrderId: string | null = null;

    try {
      const cleanPhone = (data.customerPhone || '').replace(/\D/g, '');

      // Verifica se já existe sessão autenticada
      const { data: authData } = await supabase.auth.getUser();

      // Se o cliente salvo localmente não bate com o email/telefone digitado,
      // não pode reutilizar o customer_id antigo (evita cair em outro cliente).
      const normalizedEmail = data.customerEmail?.toLowerCase().trim() || null;
      const storedPhone = (loggedCustomer?.phone || '').replace(/\D/g, '');
      const shouldResetCustomer =
        (!!normalizedEmail && (loggedCustomer?.email?.toLowerCase().trim() || null) !== normalizedEmail) ||
        (!!cleanPhone && storedPhone !== cleanPhone);

      if (loggedCustomer?.id && shouldResetCustomer) {
        try {
          const key = getCustomerStorageKey(companyId);
          localStorage.removeItem(key);
          localStorage.removeItem('menupro_customer');
          localStorage.removeItem('menupro_last_customer_identifier');
        } catch (e) {
          console.error('Error clearing customer storage after identifier change:', e);
        }
        setLoggedCustomer(null);
      }

      // Primeiro, obter ou criar o registro de cliente
      // IMPORTANTE: Sempre tentar criar/vincular cliente, mesmo sem email (pedidos de mesa)
      let customerId: string | null = (!shouldResetCustomer ? loggedCustomer?.id : null) || null;

      // Se já temos um customerId válido do loggedCustomer, verificar se os dados batem
      if (customerId && shouldResetCustomer) {
        customerId = null;
      }

      if (!customerId) {
        // Tenta encontrar cliente existente via função (RLS impede consulta direta)
        // Prioridade: email primeiro, depois telefone
        if (normalizedEmail) {
          try {
            const { data: lookupResult } = await supabase.functions.invoke('lookup-customer', {
              body: { email: normalizedEmail, companyId },
            });
            if (lookupResult?.customerId) {
              customerId = lookupResult.customerId;

              // Atualiza o cliente local para ficar consistente com o e-mail
              const customerData: CustomerData = {
                id: lookupResult.customerId,
                name: lookupResult.name || data.customerName,
                email: lookupResult.email || normalizedEmail,
                phone: lookupResult.phone || cleanPhone,
              };
              setLoggedCustomer(customerData);
              try {
                const key = getCustomerStorageKey(companyId);
                localStorage.setItem(key, JSON.stringify(customerData));
                localStorage.removeItem('menupro_customer');
                const identifier = customerData.email || customerData.phone;
                if (identifier) {
                  localStorage.setItem('menupro_last_customer_identifier', identifier);
                }
              } catch (e) {
                console.error('Error saving customer to storage after email lookup:', e);
              }
            }
          } catch (e) {
            console.error('Error looking up customer by email:', e);
            // Cliente não encontrado, será criado abaixo
          }
        }

        // Se NÃO encontrou por email, tenta pelo telefone
        if (!customerId && cleanPhone) {
          try {
            const { data: lookupResult } = await supabase.functions.invoke('lookup-customer', {
              body: { phone: cleanPhone, companyId },
            });
            if (lookupResult?.customerId) {
              customerId = lookupResult.customerId;
              
              // Atualiza o cliente local
              const customerData: CustomerData = {
                id: lookupResult.customerId,
                name: lookupResult.name || data.customerName,
                email: lookupResult.email || normalizedEmail,
                phone: lookupResult.phone || cleanPhone,
              };
              setLoggedCustomer(customerData);
              try {
                const key = getCustomerStorageKey(companyId);
                localStorage.setItem(key, JSON.stringify(customerData));
                localStorage.removeItem('menupro_customer');
                const identifier = customerData.email || customerData.phone;
                if (identifier) {
                  localStorage.setItem('menupro_last_customer_identifier', identifier);
                }
              } catch (e) {
                console.error('Error saving customer to storage after phone lookup:', e);
              }
            }
          } catch (e) {
            console.error('Error looking up customer by phone:', e);
            // Cliente não encontrado, será criado abaixo
          }
        }

        // Se ainda não encontrou, cria novo cliente (sempre, mesmo sem email)
        if (!customerId && (normalizedEmail || cleanPhone || data.customerName)) {
          console.log('[CheckoutPage] Creating new customer:', { name: data.customerName, email: normalizedEmail, phone: cleanPhone });
          
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              name: data.customerName,
              email: normalizedEmail,
              phone: cleanPhone,
            })
            .select()
            .single();

          if (customerError) {
            console.error('[CheckoutPage] Error creating customer:', customerError);
            
            // Se erro de duplicata, tenta buscar o cliente existente
            if (customerError.code === '23505') {
              console.log('[CheckoutPage] Customer already exists, trying to find...');
              
              // Tenta buscar por email ou telefone
              const { data: lookupResult } = await supabase.functions.invoke('lookup-customer', {
                body: { 
                  email: normalizedEmail || undefined, 
                  phone: cleanPhone || undefined,
                  companyId 
                },
              });
              
              if (lookupResult?.customerId) {
                customerId = lookupResult.customerId;
                console.log('[CheckoutPage] Found existing customer after duplicate error:', customerId);
              }
            }
          } else if (newCustomer) {
            customerId = newCustomer.id;
            console.log('[CheckoutPage] Created new customer:', customerId);

            // Persistir cliente localmente para próximos pedidos
            const customerData: CustomerData = {
              id: newCustomer.id,
              name: newCustomer.name,
              email: newCustomer.email,
              phone: newCustomer.phone,
            };

            setLoggedCustomer(customerData);
            try {
              const key = getCustomerStorageKey(companyId);
              localStorage.setItem(key, JSON.stringify(customerData));
              localStorage.removeItem('menupro_customer');
              const identifier = customerData.email || customerData.phone;
              if (identifier) {
                localStorage.setItem('menupro_last_customer_identifier', identifier);
              }
            } catch (e) {
              console.error('Error saving customer to storage after creation:', e);
            }
          }
        }

        // Se conseguimos um customerId (encontrado ou recém-criado),
        // garante que o perfil básico fique salvo localmente
        if (customerId && !loggedCustomer?.id) {
          const customerData: CustomerData = {
            id: customerId,
            name: data.customerName,
            email: normalizedEmail,
            phone: cleanPhone,
          };

          setLoggedCustomer(customerData);
          try {
            const key = getCustomerStorageKey(companyId);
            localStorage.setItem(key, JSON.stringify(customerData));
            localStorage.removeItem('menupro_customer');
            const identifier = customerData.email || customerData.phone;
            if (identifier) {
              localStorage.setItem('menupro_last_customer_identifier', identifier);
            }
          } catch (e) {
            console.error('Error saving customer to storage (first checkout):', e);
          }
        }
      }
      
      // Log final do customerId para debug
      console.log('[CheckoutPage] Final customerId for order:', customerId);

      let addressId: string | undefined = selectedAddress?.id;
      
      // For table orders, skip address creation
      // Use tableSessionId as the source of truth (already validated above)
      const isTableOrder = !!tableSessionId;

      // If using a new address or guest checkout, create address (not for table orders)
      if (!isTableOrder && (showAddressForm || !selectedAddress)) {
        // Se já temos um customerId, tenta reaproveitar um endereço igual antes de criar outro
        if (customerId) {
          const { data: existingAddress, error: existingAddressError } = await supabase
            .from('customer_addresses')
            .select('id')
            .eq('customer_id', customerId)
            .eq('street', data.street)
            .eq('number', data.number)
            .eq('neighborhood', data.neighborhood)
            .eq('city', data.city)
            .eq('state', data.state)
            .eq('zip_code', data.zipCode)
            .eq('complement', data.complement || null)
            .maybeSingle();

          if (existingAddressError) {
            console.error('Error checking existing address:', existingAddressError);
          }

          if (existingAddress) {
            // Já existe o mesmo endereço para este cliente, reaproveita o registro
            addressId = existingAddress.id;
          } else {
            const newAddressId = crypto.randomUUID();

            const { error: addressError } = await supabase
              .from('customer_addresses')
              .insert({
                id: newAddressId,
                customer_id: customerId, // Link directly to customer
                user_id: null,
                session_id: null,
                street: data.street,
                number: data.number,
                complement: data.complement || null,
                neighborhood: data.neighborhood,
                city: data.city,
                state: data.state,
                zip_code: data.zipCode,
                reference: data.reference || null,
                label: data.addressLabel || 'Casa',
                is_default: !selectedAddress,
              });

            if (addressError) throw addressError;
            addressId = newAddressId;
          }
        } else {
          // Cliente convidado (sem customerId): mantém comportamento atual usando sessão
          const newAddressId = crypto.randomUUID();

          const { error: addressError } = await supabase
            .from('customer_addresses')
            .insert({
              id: newAddressId,
              customer_id: null,
              user_id: null,
              session_id: `guest-${crypto.randomUUID()}`,
              street: data.street,
              number: data.number,
              complement: data.complement || null,
              neighborhood: data.neighborhood,
              city: data.city,
              state: data.state,
              zip_code: data.zipCode,
              reference: data.reference || null,
              label: data.addressLabel || 'Casa',
              is_default: !selectedAddress,
            });

          if (addressError) throw addressError;
          addressId = newAddressId;
        }
      } else if (selectedAddress && customerId && !selectedAddress.customer_id) {
        // Update existing address to link to customer if not already linked
        await supabase
          .from('customer_addresses')
          .update({ customer_id: customerId })
          .eq('id', selectedAddress.id);
      }

      // Calculate estimated preparation time based on products
      const productIds = items.map(item => item.productId);
      const { data: productsData } = await supabase
        .from('products')
        .select('id, preparation_time_minutes')
        .in('id', productIds);

      // If any cart item refers to a product that no longer exists, stop here
      if (productsData) {
        const existingProductIds = new Set(productsData.map((product) => product.id));
        const invalidItems = items.filter((item) => !existingProductIds.has(item.productId));

        if (invalidItems.length > 0) {
          console.warn('Carrinho contém itens com produtos inexistentes:', invalidItems);
          toast({
            title: 'Itens indisponíveis no cardápio',
            description:
              'Alguns itens do seu carrinho não existem mais no cardápio. Atualize o pedido e tente novamente.',
            variant: 'destructive',
          });
          clearCart();
          setLoading(false);
          return;
        }
      }

      // Get max preparation time from all products (parallel preparation)
      // Add 15 minutes base delivery time
      const maxPrepTime = productsData?.reduce((max, product) => {
        return Math.max(max, product.preparation_time_minutes || 30);
      }, 0) || 30;
      
      const estimatedDeliveryTime = new Date();
      estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + maxPrepTime + 15);

      // ==========================================
      // VALIDAÇÃO DE INVENTÁRIO ANTES DE CRIAR PEDIDO
      // O pedido só é criado se a validação passar
      // ==========================================
      const validationPayload = items.map((item) => {
        const halfHalfMeta = (item.options as any[]).find(
          (opt: any) => opt && Array.isArray(opt.halfHalfFlavorProductIds)
        );
        const halfHalfFlavorProductIds = halfHalfMeta?.halfHalfFlavorProductIds as string[] | undefined;

        return {
          productId: item.productId,
          quantity: item.quantity,
          isHalfHalf: !!halfHalfFlavorProductIds,
          halfHalfFlavorProductIds,
        };
      });

      const { data: validationResponse, error: validationError } = await supabase.functions.invoke('validate-inventory', {
        body: { items: validationPayload },
      });

      if (validationError) {
        throw validationError;
      }

      if (!validationResponse?.ok) {
        const msg = validationResponse?.message || 'Não há estoque suficiente para este pedido.';
        toast({
          title: 'Estoque insuficiente',
          description: msg,
          variant: 'destructive',
        });
        return;
      }

      // ==========================================
      // PAGAMENTO ONLINE (PIX): Criar PIX na própria tela
      // Mostra QR code e código copia-e-cola
      // ==========================================
      if (data.paymentMethod === 'pix') {
        if (!onlinePaymentEnabled || !pixEnabled) {
          toast({
            title: 'Pagamento PIX indisponível',
            description: 'Esta loja não aceita pagamento via PIX. Selecione outra forma de pagamento.',
            variant: 'destructive',
          });
          return;
        }

        try {
          // Preparar dados do pedido
          const orderPayload = {
            companyId,
            items: items.map((item) => ({
              product_name: item.productName,
              product_id: item.productId,
              quantity: item.quantity,
              unit_price: item.price + item.options.reduce((s, o) => s + o.priceModifier, 0),
              total_price:
                (item.price + item.options.reduce((s, o) => s + o.priceModifier, 0)) * item.quantity,
              notes: item.notes || null,
              options: item.options,
            })),
            customerName: data.customerName,
            customerPhone: data.customerPhone || '',
            customerEmail: data.customerEmail?.toLowerCase().trim() || '',
            deliveryAddressId: isTableOrder ? null : addressId,
            deliveryFee: effectiveDeliveryFee,
            subtotal,
            total,
            couponId: appliedCoupon?.id || null,
            discountAmount,
            notes: tableNumber 
              ? `🍽️ MESA ${tableNumber}${data.notes ? ` | ${data.notes}` : ''}`
              : (data.notes || null),
            needsChange: false,
            changeFor: null,
            // Table order fields
            tableSessionId: tableSessionId || null,
            tableNumber: tableNumber || null,
            source: isTableOrder ? 'table' : 'online',
          };

          // Usar o gateway correto
          if (activeGateway === 'picpay') {
            // PicPay - Payment Link com tela própria de PIX
            const response = await supabase.functions.invoke('create-picpay-pix', {
              body: orderPayload,
            });

            if (response.error) {
              // Evita o erro genérico "Edge Function returned a non-2xx status code"
              let details = response.error.message;
              if (response.error instanceof FunctionsHttpError) {
                try {
                  const body = await response.error.context.json();
                  const base = body?.error || body?.message;
                  const extra = body?.details || body?.detail;
                  const functionVersion = body?.functionVersion;
                  const sentPayload = body?.sentPayload;

                  // Prefer mostrar o motivo real vindo do backend (ex: validação do PicPay)
                  details = extra ? `${base || 'Erro'}: ${extra}` : (base || JSON.stringify(body));

                  if (functionVersion) details += ` | v=${functionVersion}`;
                  if (sentPayload) {
                    const payloadText = JSON.stringify(sentPayload);
                    details += ` | payload=${payloadText.slice(0, 800)}${payloadText.length > 800 ? '…' : ''}`;
                  }
                } catch {
                  try {
                    details = await response.error.context.text();
                  } catch {
                    // keep default
                  }
                }
              }
              throw new Error(details);
            }

            const picPayData = response.data;
            
            // Se temos QR code, mostrar tela própria de PIX (igual Mercado Pago)
            if (picPayData?.qrCodeBase64 && picPayData?.qrCode) {
              // Salvar dados para verificação do PicPay
              localStorage.setItem('picpay_pending_id', picPayData.pendingId);
              localStorage.setItem('picpay_company_id', companyId);
              localStorage.setItem('picpay_payment_link_id', picPayData.paymentLinkId || '');
              
              setPicPayPaymentData({
                pendingId: picPayData.pendingId,
                paymentLinkId: picPayData.paymentLinkId,
                qrCodeBase64: picPayData.qrCodeBase64,
                qrCode: picPayData.qrCode,
                paymentUrl: picPayData.paymentUrl,
                expiresAt: picPayData.expiresAt,
                total: picPayData.total,
                companyName: picPayData.companyName,
                companySlug: picPayData.companySlug,
                customerId: customerId,
              });
              setLoading(false);
              return;
            }
            
            // Fallback: redirecionar para checkout do PicPay se não tiver brcode
            if (picPayData?.paymentUrl) {
              localStorage.setItem('picpay_pending_id', picPayData.pendingId);
              localStorage.setItem('picpay_company_id', companyId);
              window.location.href = picPayData.paymentUrl;
              return;
            }

            throw new Error('Dados do PIX PicPay não retornados');
          } else {
            // Mercado Pago (padrão)
            const response = await supabase.functions.invoke('create-pix-payment', {
              body: orderPayload,
            });

            if (response.error) throw new Error(response.error.message);

            const pixData = response.data;
            if (pixData?.qrCodeBase64 && pixData?.qrCode) {
              setPixPaymentData({
                paymentId: pixData.paymentId,
                pendingId: pixData.pendingId,
                qrCodeBase64: pixData.qrCodeBase64,
                qrCode: pixData.qrCode,
                ticketUrl: pixData.ticketUrl,
                expiresAt: pixData.expiresAt,
                total: pixData.total,
                companyName: pixData.companyName,
                companySlug: pixData.companySlug,
                customerId: customerId,
              });
              setLoading(false);
              return;
            }

            throw new Error('Dados do PIX não retornados');
          }
        } catch (pixError: any) {
          console.error('PIX payment error:', pixError);
          toast({
            title: 'Erro no pagamento PIX',
            description:
              pixError.message ||
              'Não foi possível gerar o PIX. Tente outra forma de pagamento.',
            variant: 'destructive',
          });
          return;
        }
      }

      // ==========================================
      // PAGAMENTO COM CARTÃO ONLINE: Mostra tela personalizada
      // ==========================================
      if (data.paymentMethod === 'card_online') {
        if (!onlinePaymentEnabled || !cardEnabled) {
          toast({
            title: 'Pagamento com cartão indisponível',
            description: 'Esta loja não aceita cartão online. Selecione outra forma de pagamento.',
            variant: 'destructive',
          });
          return;
        }

        // Mostrar tela de cartão (processamento direto no backend)
        setCardPaymentData({
          addressId,
          formData: data,
          customerId: customerId,
        });
        setLoading(false);
        return;
      }

      // ==========================================
      // CRIAR PEDIDO (somente para cash/card_on_delivery)
      // ==========================================
      const newOrderId = crypto.randomUUID();
      createdOrderId = newOrderId;

      // Prepare order items first
      const orderItems = items.map((item) => ({
        order_id: newOrderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: (item.price + item.options.reduce((s, o) => s + o.priceModifier, 0)) * item.quantity,
        options: item.options,
        notes: item.notes || null,
        requires_preparation: item.requiresPreparation !== false,
      }));
      
      // Build notes with table info if applicable
      const orderNotes = tableNumber 
        ? `🍽️ MESA ${tableNumber}${data.notes ? ` | ${data.notes}` : ''}`
        : (data.notes || null);

      // Debug log for table order
      if (tableNumber || tableSessionId) {
        console.log('[CheckoutPage] Creating table order:', {
          tableNumber,
          tableSessionId,
          isTableOrder,
          source: isTableOrder ? 'table' : 'online',
        });
      }

      // Always log the full order data being inserted
      const orderInsertData = {
        id: newOrderId,
        company_id: companyId,
        customer_id: customerId,
        customer_name: data.customerName,
        customer_phone: data.customerPhone || '',
        customer_email: data.customerEmail.toLowerCase().trim(),
        delivery_address_id: isTableOrder ? null : addressId,
        payment_method: data.paymentMethod as any,
        subtotal,
        delivery_fee: effectiveDeliveryFee,
        total,
        notes: orderNotes,
        needs_change: data.paymentMethod === 'cash' ? data.needsChange : false,
        change_for: data.paymentMethod === 'cash' && data.needsChange ? data.changeFor : null,
        coupon_id: appliedCoupon?.id || null,
        referral_code_id: referralDiscount?.referralCodeId || null,
        discount_amount: discountAmount,
        estimated_delivery_time: estimatedDeliveryTime.toISOString(),
        source: isTableOrder ? 'table' : 'online',
        table_session_id: tableSessionId || null,
      };
      
      console.log('[CheckoutPage] Inserting order with data:', orderInsertData);

      const { error: orderError } = await supabase
        .from('orders')
        .insert(orderInsertData);

      if (orderError) {
        console.error('[CheckoutPage] Order insert error:', orderError);
        throw orderError;
      }
      
      console.log('[CheckoutPage] Order created successfully:', newOrderId);

      // Insert order items immediately after order creation
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Update table session with customer info if this is a table order
      if (tableSessionId && data.customerName) {
        await supabase
          .from('table_sessions')
          .update({
            customer_name: data.customerName,
            customer_phone: data.customerPhone || null,
          })
          .eq('id', tableSessionId);
      }

      // Update coupon usage
      if (appliedCoupon) {
        await supabase
          .from('coupons')
          .update({ current_uses: (appliedCoupon as any).current_uses + 1 })
          .eq('id', appliedCoupon.id);
      }

      // Process referral discount (give credit to referrer)
      if (referralDiscount && referralCode && customerId) {
        try {
          await supabase.functions.invoke('process-referral-discount', {
            body: {
              companyId,
              referralCode,
              referredCustomerId: customerId,
              orderId: newOrderId,
              orderTotal: subtotal,
            },
          });
          console.log('Referral discount processed successfully');
        } catch (referralError) {
          console.error('Error processing referral discount:', referralError);
          // Don't fail the order, just log
        }
      }

      // Consume customer credits if applied
      if (creditsToApply > 0 && customerId) {
        try {
          await supabase.functions.invoke('consume-customer-credits', {
            body: {
              companyId,
              customerId,
              amountToConsume: creditsToApply,
              orderId: newOrderId,
            },
          });
          console.log('Customer credits consumed successfully:', creditsToApply);
          // Clear credits state after consumption
          setCustomerCredits(null);
        } catch (creditsError) {
          console.error('Error consuming customer credits:', creditsError);
          // Don't fail the order, just log
        }
      }

      // Send confirmation email if customer provided email
      if (data.customerEmail) {
        try {
          // Get address details for email
          const { data: addressData } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('id', addressId)
            .single();

          if (addressData) {
            // Send email in background (don't wait)
            supabase.functions.invoke('send-order-confirmation', {
              body: {
                orderNumber: newOrderId.slice(0, 8).toUpperCase(),
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                items: orderItems.map(item => ({
                  product_name: item.product_name,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  total_price: item.total_price,
                  options: item.options || [],
                  notes: item.notes || undefined,
                })),
                subtotal,
                deliveryFee,
                discount: discountAmount,
                total,
                paymentMethod: data.paymentMethod,
                deliveryAddress: {
                  street: addressData.street,
                  number: addressData.number,
                  neighborhood: addressData.neighborhood,
                  city: addressData.city,
                  complement: addressData.complement || undefined,
                },
                companyName,
                companyPhone: companyPhone || undefined,
                trackingUrl: `${window.location.origin}/track/${newOrderId}`,
                estimatedDeliveryTime: estimatedDeliveryTime.toLocaleString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            }).catch(err => {
              console.error('Failed to send confirmation email:', err);
            });
          }
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }
      }

      // Success - save items before clearing cart
      setOrderItems([...items]);
      setOrderSummary({
        subtotal,
        discountAmount,
        deliveryFee,
        total,
      });
      setOrderId(newOrderId);
      setOrderCustomerId(customerId);
      setOrderPaymentMethod(data.paymentMethod);
      
      // Calculate tickets earned for lottery display
      const ticketsEarned = await calculateTicketsEarned(subtotal);
      setTicketsEarnedInOrder(ticketsEarned);
      
      // Update localStorage with the correct customer ID to ensure lottery tickets are visible
      if (customerId) {
        updateStoredCustomerId(customerId, {
          name: data.customerName,
          email: data.customerEmail,
          phone: data.customerPhone,
        });
      }
      
      setOrderComplete(true);
      clearCart();
      
      // Track promotion conversions
      console.log('[CheckoutPage] Tracking conversions for items:', items.map(i => ({ productId: i.productId, promotionId: i.promotionId })));
      trackCartConversions(items, companyId, newOrderId);

      toast({
        title: 'Pedido realizado!',
        description: `Pedido #${newOrderId.slice(0, 8)} enviado com sucesso`,
      });
    } catch (error: any) {
      console.error('Checkout error:', error);

      // If something failed after creating the order, clean it up so it doesn't
      // appear vazio para o lojista
      if (createdOrderId) {
        try {
          await supabase.from('order_items').delete().eq('order_id', createdOrderId);
          await supabase.from('orders').delete().eq('id', createdOrderId);
        } catch (cleanupError) {
          console.error('Error cleaning up order after checkout error:', cleanupError);
        }
      }

      toast({
        title: 'Erro ao finalizar pedido',
        description: error.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (orderComplete) {
    // Generate WhatsApp message
    const generateWhatsAppMessage = () => {
      const orderCode = orderId?.slice(0, 8).toUpperCase();
      const trackingUrl = `${window.location.origin}/track/${orderId}`;
      
      let message = `*PEDIDO #${orderCode}*\n\n`;
      message += `*Itens:*\n`;
      orderItems.forEach(item => {
        message += `- ${item.quantity}x ${item.productName}\n`;
        
        // Agrupar opções por groupName
        if (item.options.length > 0) {
          const hasGroupNames = item.options.some(o => o.groupName);
          
          if (hasGroupNames) {
            const grouped = item.options.reduce((acc, o) => {
              const group = o.groupName || 'Adicionais';
              if (!acc[group]) acc[group] = [];
              acc[group].push(o.name);
              return acc;
            }, {} as Record<string, string[]>);
            
            Object.entries(grouped).forEach(([groupName, names]) => {
              message += `  ${groupName}: ${names.join(', ')}\n`;
            });
          } else {
            // Legado: listar itens sem agrupamento
            message += `  ${item.options.map(o => o.name).join(', ')}\n`;
          }
        }
        
        if (item.notes) {
          message += `  Obs: ${item.notes}\n`;
        }
      });
      message += `\n*Total: R$ ${(orderSummary?.total ?? 0).toFixed(2)}*\n`;
      message += `\nAcompanhe seu pedido: ${trackingUrl}`;
      
      return encodeURIComponent(message);
    };

    const whatsappNumber = companyPhone?.replace(/\D/g, '') || '';
    const whatsappUrl = whatsappNumber 
      ? `https://wa.me/55${whatsappNumber}?text=${generateWhatsAppMessage()}`
      : null;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center animate-scale-in">
          <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow">
            <Check className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold font-display mb-2">Pedido Confirmado!</h1>
          <p className="text-muted-foreground mb-6">
            Seu pedido #{orderId?.slice(0, 8)} foi enviado para {companyName}
          </p>
          
          {/* Online Payment Info */}
          {orderPaymentMethod === 'online' && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-300">Pagamento em processamento</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                    Você foi redirecionado para o Mercado Pago. Após o pagamento, seu pedido será confirmado automaticamente.
                  </p>
                </div>
              </div>
            </div>
          )}


          <div className="bg-card rounded-xl border border-border p-6 mb-6 text-left">
            <h3 className="font-medium mb-4">Resumo do Pedido</h3>
            
            {/* Order Items */}
            <div className="space-y-2 mb-4 pb-4 border-b border-border">
              {orderItems.map((item, index) => (
                <div key={index} className="text-sm">
                  <div className="flex justify-between">
                    <span>
                      <span className="font-medium">{item.quantity}x</span> {item.productName}
                    </span>
                    <span className="text-muted-foreground">
                      R$ {((item.price + item.options.reduce((sum, o) => sum + o.priceModifier, 0)) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                  {item.options.length > 0 && (
                    <div className="text-xs text-muted-foreground ml-4 mt-0.5 space-y-0.5">
                      {(() => {
                        const grouped = item.options.reduce((acc, o) => {
                          const group = o.groupName || 'Adicionais';
                          if (!acc[group]) acc[group] = [];
                          acc[group].push(o.name);
                          return acc;
                        }, {} as Record<string, string[]>);
                        
                        return Object.entries(grouped).map(([groupName, names], idx) => (
                          <p key={idx}>
                            <span className="font-medium">{groupName}:</span> {names.join(', ')}
                          </p>
                        ));
                      })()}
                    </div>
                  )}
                  {item.notes && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 ml-4 italic">
                      Obs: {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            
            {/* Totals */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>R$ {(orderSummary?.subtotal ?? 0).toFixed(2)}</span>
              </div>
              {(orderSummary?.discountAmount ?? 0) > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto</span>
                  <span>-R$ {(orderSummary?.discountAmount ?? 0).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrega</span>
                <span>R$ {(orderSummary?.deliveryFee ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span className="text-primary">R$ {(orderSummary?.total ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Referral Share Card - show only if customer exists */}
          {orderCustomerId && (
            <div className="space-y-4">
              <LotteryTicketsCard
                customerId={orderCustomerId}
                companyId={companyId}
                newTicketsEarned={ticketsEarnedInOrder}
              />
              <ReferralShareCard
                customerId={orderCustomerId}
                companyId={companyId}
                companySlug={companySlug}
                companyName={companyName}
              />
            </div>
          )}
          
          <div className="flex flex-col gap-3">
            {/* WhatsApp Button */}
            {whatsappUrl && (
              <Button 
                asChild
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white"
              >
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  {orderPaymentMethod === 'pix' 
                    ? 'Enviar Comprovante via WhatsApp' 
                    : 'Acompanhar pelo WhatsApp'}
                </a>
              </Button>
            )}
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate(`/track/${orderId}`)}
            >
              Acompanhar Pedido Online
            </Button>
            
            <Button onClick={onBack} variant="ghost" className="w-full">
              Voltar ao Cardápio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Removed authLoading check - no longer needed

  // PIX Payment Screen
  if (pixPaymentData) {
    return (
      <PixPaymentScreen
        pixData={pixPaymentData}
        companyId={companyId}
        onSuccess={async (newOrderId) => {
          const paymentCustomerId = pixPaymentData.customerId;
          setPixPaymentData(null);
          setOrderId(newOrderId);
          setOrderCustomerId(paymentCustomerId || loggedCustomer?.id || null);
          setOrderPaymentMethod('online');
          setOrderSummary({ subtotal, discountAmount, deliveryFee, total });
          setOrderItems([...items]);
          const ticketsEarned = await calculateTicketsEarned(subtotal);
          setTicketsEarnedInOrder(ticketsEarned);
          setOrderComplete(true);
          clearCart();
          
          // Track promotion conversions
          trackCartConversions(items, companyId, newOrderId);
          
          // Update localStorage with the correct customer ID
          if (paymentCustomerId) {
            updateStoredCustomerId(paymentCustomerId);
          }
        }}
        onCancel={() => setPixPaymentData(null)}
        onExpired={() => {
          setPixPaymentData(null);
          toast({
            title: 'PIX expirado',
            description: 'O tempo para pagamento expirou. Tente novamente.',
            variant: 'destructive',
          });
        }}
      />
    );
  }

  // PicPay Payment Screen
  if (picPayPaymentData) {
    return (
      <PicPayPaymentScreen
        paymentData={picPayPaymentData}
        companyId={companyId}
        onSuccess={async (newOrderId) => {
          const paymentCustomerId = picPayPaymentData.customerId;
          setPicPayPaymentData(null);
          setOrderId(newOrderId);
          setOrderCustomerId(paymentCustomerId || loggedCustomer?.id || null);
          setOrderPaymentMethod('online');
          setOrderSummary({ subtotal, discountAmount, deliveryFee, total });
          setOrderItems([...items]);
          const ticketsEarned = await calculateTicketsEarned(subtotal);
          setTicketsEarnedInOrder(ticketsEarned);
          setOrderComplete(true);
          clearCart();
          
          // Track promotion conversions
          trackCartConversions(items, companyId, newOrderId);
          
          // Update localStorage with the correct customer ID
          if (paymentCustomerId) {
            updateStoredCustomerId(paymentCustomerId);
          }
        }}
        onCancel={() => setPicPayPaymentData(null)}
        onExpired={() => {
          setPicPayPaymentData(null);
          toast({
            title: 'PIX expirado',
            description: 'O tempo para pagamento expirou. Tente novamente.',
            variant: 'destructive',
          });
        }}
      />
    );
  }

  // Card Payment Screen
  if (cardPaymentData) {
    return (
      <CardPaymentScreen
        companyId={companyId}
        companyName={companyName}
        items={items.map((item) => ({
          product_name: item.productName,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.price + item.options.reduce((s, o) => s + o.priceModifier, 0),
          total_price: (item.price + item.options.reduce((s, o) => s + o.priceModifier, 0)) * item.quantity,
          notes: item.notes || null,
          options: item.options,
        }))}
        customerName={cardPaymentData.formData.customerName || ''}
        customerPhone={cardPaymentData.formData.customerPhone || ''}
        customerEmail={cardPaymentData.formData.customerEmail || ''}
        deliveryAddressId={cardPaymentData.addressId}
        deliveryFee={deliveryFee}
        subtotal={subtotal}
        total={total}
        couponId={appliedCoupon?.id}
        discountAmount={discountAmount}
        notes={cardPaymentData.formData.notes}
        onSuccess={async (newOrderId) => {
          const paymentCustomerId = cardPaymentData.customerId;
          setCardPaymentData(null);
          setOrderId(newOrderId);
          setOrderCustomerId(paymentCustomerId || loggedCustomer?.id || null);
          setOrderPaymentMethod('online');
          setOrderSummary({ subtotal, discountAmount, deliveryFee, total });
          setOrderItems([...items]);
          const ticketsEarned = await calculateTicketsEarned(subtotal);
          setTicketsEarnedInOrder(ticketsEarned);
          setOrderComplete(true);
          clearCart();
          
          // Track promotion conversions
          trackCartConversions(items, companyId, newOrderId);
          
          // Update localStorage with the correct customer ID
          if (paymentCustomerId) {
            updateStoredCustomerId(paymentCustomerId);
          }
        }}
        onCancel={() => setCardPaymentData(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display font-bold">Finalizar Pedido</h1>
        </div>
      </header>

      <div className="container py-4 sm:py-6 max-w-2xl px-4 sm:px-6">
        {/* Store Closed Warning */}
        {!isStoreOpen && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">
              A loja está fechada no momento. Não é possível finalizar pedidos.
            </p>
          </div>
        )}

        {/* Login/Account Section */}
        <section className="bg-card rounded-xl border border-border p-4 sm:p-6 mb-4 sm:mb-6">
          {loggedCustomer ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{loggedCustomer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {loggedCustomer.email || loggedCustomer.phone}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs text-primary underline underline-offset-2"
                        onClick={() => {
                          handleCustomerLogout();
                          setShowAuthModal(true);
                        }}
                      >
                        Logar em outra conta
                      </button>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleCustomerLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </Button>
                </div>

                {selectedAddress && (
                  <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-3 py-2 border border-border/70">
                    <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <div className="flex-1 text-xs sm:text-sm">
                      <p className="font-medium">
                        {selectedAddress.label || 'Endereço de entrega'}
                      </p>
                      <p className="text-muted-foreground">
                        {selectedAddress.street}, {selectedAddress.number}
                        {selectedAddress.complement && ` - ${selectedAddress.complement}`}
                      </p>
                      <p className="text-muted-foreground">
                        {selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-[11px] sm:text-xs text-primary underline underline-offset-2"
                        onClick={() => {
                          setShowAddressForm(true);
                        }}
                      >
                        Editar endereço
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pending referral code message - only show if feature is enabled */}
              {referralFeatureEnabled && pendingReferralCode && (
                <div className="bg-success/10 border border-success/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Tag className="h-5 w-5 text-success mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-success">🎁 Você ganhou um desconto de indicação!</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Cadastre-se ou faça login para ativar seu desconto especial.
                      </p>
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="mt-3"
                        onClick={() => setShowAuthModal(true)}
                      >
                        Cadastrar e Ganhar Desconto
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {!pendingReferralCode && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Já fez pedido antes?</p>
                    <p className="text-sm text-muted-foreground">
                      Entre para usar seus endereços salvos
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setShowAuthModal(true)}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Entrar
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Customer Info */}
          <section className="bg-card rounded-xl border border-border p-4 sm:p-6">
            <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Seus Dados
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customerName">Nome *</Label>
                <Input
                  id="customerName"
                  placeholder="Seu nome completo"
                  {...register('customerName')}
                />
                {errors.customerName && (
                  <p className="text-sm text-destructive">{errors.customerName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Telefone (opcional)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customerPhone"
                    placeholder="(00) 00000-0000"
                    className="pl-10"
                    {...register('customerPhone')}
                  />
                </div>
                {errors.customerPhone && (
                  <p className="text-sm text-destructive">{errors.customerPhone.message}</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="customerEmail">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customerEmail"
                    type="email"
                    placeholder="seu@email.com"
                    className="pl-10"
                    {...register('customerEmail')}
                    disabled={!!loggedCustomer?.email}
                  />
                </div>
                {errors.customerEmail && (
                  <p className="text-sm text-destructive">{errors.customerEmail.message}</p>
                )}
              </div>
            </div>
          </section>

          {/* Table Order Indicator or Address Selection */}
          {tableNumber ? (
            <section className="bg-primary/10 rounded-xl border border-primary/20 p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl">🍽️</span>
                </div>
                <div>
                  <h2 className="font-display font-semibold text-lg">Mesa {tableNumber}</h2>
                  <p className="text-sm text-muted-foreground">Pedido para consumo no local</p>
                </div>
              </div>
            </section>
          ) : (
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Endereço de Entrega
            </h2>

            {/* Show address selector for logged in customers */}
            {loggedCustomer && !showAddressForm && (
              <AddressSelector
                customerId={loggedCustomer.id}
                selectedAddressId={selectedAddress?.id || null}
                onSelect={setSelectedAddress}
                onAddNew={() => {
                  setSelectedAddress(null);
                  setShowAddressForm(true);
                }}
              />
            )}

            {/* Show address form for guests or when adding new */}
            {(!loggedCustomer || showAddressForm) && (
              <div className="space-y-4">
                {loggedCustomer && showAddressForm && (
                  <div className="flex items-center justify-between pb-4 border-b border-border">
                    <span className="font-medium">Novo Endereço</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddressForm(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="zipCode">CEP (opcional - preencha para buscar endereço)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="zipCode"
                        placeholder="00000-000"
                        {...register('zipCode')}
                        onBlur={handleCepBlur}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => searchCep(zipCode || '')}
                        disabled={loadingCep}
                      >
                        {loadingCep ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Digite o CEP para preencher o endereço automaticamente
                    </p>
                    {errors.zipCode && (
                      <p className="text-sm text-destructive">{errors.zipCode.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="street">Rua *</Label>
                    <Input
                      id="street"
                      placeholder="Nome da rua"
                      {...register('street')}
                    />
                    {errors.street && (
                      <p className="text-sm text-destructive">{errors.street.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number">Número *</Label>
                    <Input
                      id="number"
                      placeholder="123"
                      {...register('number')}
                    />
                    {errors.number && (
                      <p className="text-sm text-destructive">{errors.number.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="complement">Complemento</Label>
                    <Input
                      id="complement"
                      placeholder="Apto, bloco..."
                      {...register('complement')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="neighborhood">Bairro *</Label>
                    <Input
                      id="neighborhood"
                      placeholder="Nome do bairro"
                      {...register('neighborhood')}
                    />
                    {errors.neighborhood && (
                      <p className="text-sm text-destructive">{errors.neighborhood.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade *</Label>
                    <Input
                      id="city"
                      placeholder="Nome da cidade"
                      {...register('city')}
                    />
                    {errors.city && (
                      <p className="text-sm text-destructive">{errors.city.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado *</Label>
                    <Input
                      id="state"
                      placeholder="SP"
                      {...register('state')}
                    />
                    {errors.state && (
                      <p className="text-sm text-destructive">{errors.state.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressLabel">Apelido do endereço</Label>
                    <Input
                      id="addressLabel"
                      placeholder="Ex: Casa, Trabalho..."
                      {...register('addressLabel')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reference">Ponto de referência</Label>
                    <Input
                      id="reference"
                      placeholder="Próximo a..."
                      {...register('reference')}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
          )}

          {/* Coupon */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Cupom de Desconto
            </h2>
            
            {appliedCoupon ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  <span className="font-medium text-success">
                    {appliedCoupon.code}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({appliedCoupon.discount_type === 'percentage' 
                      ? `${appliedCoupon.discount_value}%` 
                      : `R$ ${appliedCoupon.discount_value.toFixed(2)}`} de desconto)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={removeCoupon}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : referralDiscount ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  <span className="font-medium text-success">
                    Indicação de {referralDiscount.referrerName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({referralDiscount.discountPercent}% de desconto)
                  </span>
                </div>
              </div>
            ) : customerCredits && customerCredits.totalAvailable > 0 ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  <span className="font-medium text-success">
                    Crédito de indicação disponível
                  </span>
                  <span className="text-sm text-muted-foreground">
                    (R$ {Math.min(customerCredits.totalAvailable, subtotal).toFixed(2)} de desconto)
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {loadingReferral && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Verificando indicação...</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite o código do cupom"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponError(null);
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyCoupon}
                    disabled={loadingCoupon}
                  >
                    {loadingCoupon ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Aplicar'
                    )}
                  </Button>
                </div>
                {couponError && (
                  <p className="text-sm text-destructive">{couponError}</p>
                )}
              </div>
            )}
          </section>

          {/* Payment Method */}
          <section className="bg-card rounded-xl border border-border p-4 sm:p-6">
            <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Forma de Pagamento
            </h2>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) => setValue('paymentMethod', value as any)}
              className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2"
            >
              {onlinePaymentEnabled && pixEnabled && (
                <Label
                  htmlFor="pix"
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === 'pix'
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="pix" id="pix" />
                  <Smartphone className="h-5 w-5 text-green-500" />
                  <div className="flex flex-col">
                    <span>PIX</span>
                    <span className="text-xs text-muted-foreground">Pagamento instantâneo</span>
                  </div>
                </Label>
              )}
              {onlinePaymentEnabled && cardEnabled && activeGateway === 'mercadopago' && (
                <Label
                  htmlFor="card_online"
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === 'card_online'
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="card_online" id="card_online" />
                  <CreditCard className="h-5 w-5 text-blue-500" />
                  <div className="flex flex-col">
                    <span>Cartão de Crédito</span>
                    <span className="text-xs text-muted-foreground">Pague online</span>
                  </div>
                </Label>
              )}
              {/* Opção "Pagar no balcão" apenas para pedidos de mesa */}
              {tableNumber && (
                <Label
                  htmlFor="pay_at_counter"
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === 'pay_at_counter'
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="pay_at_counter" id="pay_at_counter" />
                  <CreditCard className="h-5 w-5 text-orange-500" />
                  <div className="flex flex-col">
                    <span>Pagar no balcão</span>
                    <span className="text-xs text-muted-foreground">Pague ao finalizar</span>
                  </div>
                </Label>
              )}
              <Label
                htmlFor="cash"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  paymentMethod === 'cash'
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="cash" id="cash" />
                <Banknote className="h-5 w-5 text-primary" />
                <span>Dinheiro</span>
              </Label>
              <Label
                htmlFor="card_on_delivery"
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  paymentMethod === 'card_on_delivery'
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="card_on_delivery" id="card_on_delivery" />
                <CreditCard className="h-5 w-5 text-primary" />
                <span>{tableNumber ? 'Cartão' : 'Cartão na entrega'}</span>
              </Label>
            </RadioGroup>

            {/* PIX Payment Info */}
            {paymentMethod === 'pix' && (
              <div className="mt-4 p-4 rounded-lg border border-green-500/30 bg-green-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm">
                    Pagamento PIX seguro via {activeGateway === 'picpay' ? 'PicPay' : 'Mercado Pago'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Você verá um QR Code para pagar na próxima tela. O pedido será confirmado automaticamente após o pagamento.
                </p>
              </div>
            )}

            {/* Card Online Payment Info */}
            {paymentMethod === 'card_online' && (
              <div className="mt-4 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-sm">Pagamento seguro via Mercado Pago</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Você preencherá os dados do cartão na próxima tela para completar o pagamento.
                </p>
              </div>
            )}

            {/* Manual PIX Key display (when store shows their PIX key without online payment) */}
            {showPixKeyOnMenu && manualPixKey && (paymentMethod === 'cash' || paymentMethod === 'card_on_delivery') && (
              <div className="mt-4 p-4 rounded-lg border border-green-500/30 bg-green-500/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm">Pagar via PIX (transferência manual)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Você também pode pagar via PIX usando a chave abaixo e enviar o comprovante pelo WhatsApp:
                </p>
                <div className="bg-background rounded-md p-3 border">
                  <p className="text-xs text-muted-foreground mb-1">
                    Tipo: {manualPixKeyType === 'cpf' ? 'CPF' : manualPixKeyType === 'cnpj' ? 'CNPJ' : manualPixKeyType === 'email' ? 'Email' : manualPixKeyType === 'phone' ? 'Telefone' : 'Chave Aleatória'}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-muted px-2 py-1 rounded break-all">
                      {manualPixKey}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(manualPixKey);
                        toast({ title: 'Chave PIX copiada!' });
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Cash change option */}
            {paymentMethod === 'cash' && (
              <div className="mt-4 p-4 rounded-lg border border-border bg-muted/50 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="needsChange"
                    {...register('needsChange')}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="needsChange" className="cursor-pointer">
                    Preciso de troco
                  </Label>
                </div>
                {watch('needsChange') && (
                  <div className="space-y-2">
                    <Label htmlFor="changeFor">Troco para quanto?</Label>
                    <CurrencyInput
                      id="changeFor"
                      value={watch('changeFor') || ''}
                      onChange={(value) => setValue('changeFor', parseFloat(value) || 0)}
                      placeholder={`Mínimo R$ ${total.toFixed(2).replace('.', ',')}`}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="bg-card rounded-xl border border-border p-4 sm:p-6">
            <h2 className="font-display font-semibold mb-4">Observações do pedido</h2>
            <Textarea
              placeholder="Alguma observação para o restaurante?"
              {...register('notes')}
              rows={3}
            />
          </section>

          {/* Order Summary */}
          <section className="bg-card rounded-xl border border-border p-4 sm:p-6">
            <h2 className="font-display font-semibold mb-4">Resumo do Pedido</h2>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.quantity}x {item.productName}
                    {item.options.length > 0 && (
                      <GroupedOptionsDisplay 
                        options={item.options} 
                        variant="compact"
                        className="block"
                      />
                    )}
                  </span>
                  <span>
                    R$ {((item.price + item.options.reduce((s, o) => s + o.priceModifier, 0)) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R$ {subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-success">
                    <span>
                      Desconto {appliedCoupon ? `(${appliedCoupon.code})` : referralDiscount ? '(Indicação)' : creditsToApply > 0 ? '(Créditos)' : ''}
                    </span>
                    <span>-R$ {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de entrega</span>
                  <span>R$ {deliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2">
                  <span>Total</span>
                  <span className="text-primary">R$ {total.toFixed(2)}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Nas pizzas meio a meio, o valor é calculado pela média dos sabores (metade de cada),
                  nunca apenas pelo sabor mais caro, seguindo o Código de Defesa do Consumidor.
                </p>
              </div>
            </div>
          </section>

          {/* Lottery Tickets Teaser - always show if lottery is enabled */}
          <LotteryTicketsCard
            customerId={loggedCustomer?.id || ''}
            companyId={companyId}
            pendingOrderMode={true}
            orderSubtotal={subtotal}
          />

          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground"
            size="lg"
            disabled={loading || items.length === 0 || !isStoreOpen}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isStoreOpen ? `Confirmar Pedido - R$ ${total.toFixed(2)}` : 'Loja Fechada'}
          </Button>
        </form>
      </div>

      {/* Auth Modal */}
      <CustomerAuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleCustomerLogin}
        referralCode={referralCode}
        companyId={companyId}
      />
    </div>
  );
}
