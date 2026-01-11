import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Mail, Lock, User, Eye, EyeOff, Store, Phone, Building2, ArrowLeft, ArrowRight, KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

// Step 1: Company info
const step1Schema = z.object({
  companyName: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres').max(120, 'Nome da empresa deve ter no máximo 120 caracteres'),
  cnpj: z
    .string()
    .max(18, 'CNPJ deve ter no máximo 18 caracteres')
    .refine((val) => !val || /^[\d./-]+$/.test(val), {
      message: 'CNPJ deve conter apenas números, pontos, barras e hífens',
    })
    .optional()
    .or(z.literal('')),
});

// Step 2: Personal info + credentials
const step2Schema = z.object({
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome deve ter no máximo 100 caracteres'),
  phone: z
    .string()
    .min(8, 'Telefone deve ter pelo menos 8 dígitos')
    .max(20, 'Telefone deve ter no máximo 20 caracteres')
    .regex(/^[0-9()+\s-]+$/, 'Telefone deve conter apenas números e símbolos válidos'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type LoginFormData = z.infer<typeof loginSchema>;
type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

interface AuthFormProps {
  mode: 'login' | 'signup';
  onToggleMode: () => void;
}

export function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupStep, setSignupStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const isLogin = mode === 'login';

  // Form for login
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Form for signup step 1
  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: step1Data || {},
  });

  // Form for signup step 2
  const step2Form = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
  });

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const linkDriverAccount = async (userId: string, email: string) => {
    try {
      const { data: driver, error: driverError } = await supabase
        .from('delivery_drivers')
        .select('id')
        .eq('email', email.toLowerCase())
        .is('user_id', null)
        .maybeSingle();

      if (driverError) {
        console.error('Error checking driver:', driverError);
        return;
      }

      if (driver) {
        await supabase
          .from('delivery_drivers')
          .update({ user_id: userId })
          .eq('id', driver.id);

        await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'delivery_driver' })
          .select()
          .maybeSingle();
      }
    } catch (error) {
      console.error('Error linking driver account:', error);
    }
  };

  const handleLogin = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: 'Erro no login',
            description: 'Email ou senha incorretos',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro no login',
            description: error.message,
            variant: 'destructive',
          });
        }
        return;
      }
      
      const { data: { user: loggedUser } } = await supabase.auth.getUser();
      if (loggedUser) {
        await linkDriverAccount(loggedUser.id, data.email);
        
        const { data: driverCheck } = await supabase
          .from('delivery_drivers')
          .select('id')
          .eq('user_id', loggedUser.id)
          .eq('is_active', true)
          .maybeSingle();

        if (driverCheck) {
          toast({
            title: 'Bem-vindo, entregador!',
            description: 'Você será redirecionado para suas entregas',
          });
          navigate('/driver');
          return;
        }
      }
      
      toast({
        title: 'Bem-vindo!',
        description: 'Login realizado com sucesso',
      });
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Submit = (data: Step1Data) => {
    setStep1Data(data);
    setSignupStep(2);
  };

  const handleStep2Submit = async (data: Step2Data) => {
    if (!step1Data) return;
    
    setLoading(true);
    try {
      // Send verification code
      const { data: response, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: data.email },
      });

       
      if (error || response?.error) {
        toast({
          title: 'Erro ao enviar código',
          description: "Empresa já registrada",
          variant: 'destructive',
        });
        return;
      }

      setStep2Data(data);
      setCodeSent(true);
      setSignupStep(3);
      setResendTimer(60);
      
      toast({
        title: 'Código enviado!',
        description: 'Verifique sua caixa de entrada e spam',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!step2Data || resendTimer > 0) return;
    
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: step2Data.email },
      });

      if (error || response?.error) {
        toast({
          title: 'Erro ao reenviar código',
          description: response?.error || error?.message || 'Tente novamente',
          variant: 'destructive',
        });
        return;
      }

      setResendTimer(60);
      toast({
        title: 'Código reenviado!',
        description: 'Verifique sua caixa de entrada',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!step1Data || !step2Data || verificationCode.length !== 6) {
      toast({
        title: 'Código incompleto',
        description: 'Digite os 6 dígitos do código',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Verify the code
      const { data: verifyResponse, error: verifyError } = await supabase.functions.invoke('verify-email-code', {
        body: { 
          email: step2Data.email, 
          code: verificationCode 
        },
      });

      if (verifyError || verifyResponse?.error) {
        toast({
          title: 'Código inválido',
          description: verifyResponse?.error || 'O código está incorreto ou expirado',
          variant: 'destructive',
        });
        return;
      }

      // Create user after verification
      const { data: createResponse, error: createError } = await supabase.functions.invoke('create-verified-user', {
        body: {
          email: step2Data.email,
          password: step2Data.password,
          fullName: step2Data.fullName,
          phone: step2Data.phone,
          companyName: step1Data.companyName,
          cnpj: step1Data.cnpj,
        },
      });

      if (createError || createResponse?.error) {
        toast({
          title: 'Erro ao criar conta',
          description: createResponse?.error || createError?.message || 'Tente novamente',
          variant: 'destructive',
        });
        return;
      }

      // Login the user
      const { error: loginError } = await signIn(step2Data.email, step2Data.password);
      
      if (loginError) {
        toast({
          title: 'Conta criada!',
          description: 'Faça login para continuar',
        });
        handleToggleMode();
        return;
      }

      toast({
        title: 'Conta criada com sucesso!',
        description: 'Sua empresa foi cadastrada e está aguardando aprovação.',
      });
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToStep1 = () => {
    setSignupStep(1);
  };

  const handleBackToStep2 = () => {
    setSignupStep(2);
    setCodeSent(false);
    setVerificationCode('');
  };

  const handleToggleMode = () => {
    setSignupStep(1);
    setStep1Data(null);
    setStep2Data(null);
    setCodeSent(false);
    setVerificationCode('');
    onToggleMode();
  };

  // Login Form
  if (isLogin) {
    return (
      <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              className="pl-10"
              {...loginForm.register('email')}
            />
          </div>
          {loginForm.formState.errors.email && (
            <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground">Senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="pl-10 pr-10"
              autoComplete="current-password"
              {...loginForm.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {loginForm.formState.errors.password && (
            <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={async () => {
              const email = loginForm.getValues('email')?.trim();
              if (!email) {
                toast({
                  title: 'Informe seu email',
                  description: 'Preencha o campo de email para redefinir a senha.',
                  variant: 'destructive',
                });
                return;
              }
              try {
                setLoading(true);
                const redirectUrl = `${window.location.origin}/auth`;
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: redirectUrl,
                });
                if (error) {
                  toast({
                    title: 'Erro ao enviar email',
                    description: 'Tente novamente em alguns instantes.',
                    variant: 'destructive',
                  });
                  return;
                }
                toast({
                  title: 'Confira seu email',
                  description: 'Se o email existir, enviaremos um link para redefinir sua senha.',
                });
              } finally {
                setLoading(false);
              }
            }}
            className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Esqueci minha senha
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={handleToggleMode}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Não tem uma conta? Cadastre-se
          </button>
        </div>
      </form>
    );
  }

  // Signup Step 3: Verification Code
  if (signupStep === 3) {
    return (
      <div className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-success text-success-foreground flex items-center justify-center text-sm font-semibold">
              ✓
            </div>
            <span className="text-sm text-muted-foreground">Empresa</span>
          </div>
          <div className="w-8 h-px bg-success" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-success text-success-foreground flex items-center justify-center text-sm font-semibold">
              ✓
            </div>
            <span className="text-sm text-muted-foreground">Dados</span>
          </div>
          <div className="w-8 h-px bg-primary" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              3
            </div>
            <span className="text-sm font-medium text-foreground">Verificar</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Verifique seu email</h3>
          <p className="text-sm text-muted-foreground">
            Enviamos um código de 6 dígitos para<br />
            <span className="font-medium text-foreground">{step2Data?.email}</span>
          </p>
        </div>

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={verificationCode}
            onChange={(value) => setVerificationCode(value)}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          type="button"
          onClick={handleVerifyCode}
          className="w-full gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
          disabled={loading || verificationCode.length !== 6}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verificar e criar conta
        </Button>

        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Não recebeu o código?
          </p>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resendTimer > 0 || loading}
            className="text-sm text-primary hover:text-primary/80 transition-colors disabled:text-muted-foreground disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {resendTimer > 0 ? `Reenviar em ${resendTimer}s` : 'Reenviar código'}
          </button>
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={handleBackToStep2}
            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <button
            type="button"
            onClick={handleToggleMode}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Já tem conta? Login
          </button>
        </div>
      </div>
    );
  }

  // Signup Step 1: Company Info
  if (signupStep === 1) {
    return (
      <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-5">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              1
            </div>
            <span className="text-sm font-medium text-foreground">Empresa</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-semibold">
              2
            </div>
            <span className="text-sm text-muted-foreground">Seus dados</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-semibold">
              3
            </div>
            <span className="text-sm text-muted-foreground">Verificar</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="companyName" className="text-foreground">Nome da Empresa</Label>
          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="companyName"
              type="text"
              placeholder="Nome do seu negócio"
              className="pl-10"
              {...step1Form.register('companyName')}
            />
          </div>
          {step1Form.formState.errors.companyName && (
            <p className="text-sm text-destructive">{step1Form.formState.errors.companyName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cnpj" className="text-foreground">
            CNPJ <span className="text-muted-foreground text-xs">(opcional)</span>
          </Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="cnpj"
              type="text"
              placeholder="00.000.000/0000-00"
              className="pl-10"
              {...step1Form.register('cnpj')}
            />
          </div>
          {step1Form.formState.errors.cnpj && (
            <p className="text-sm text-destructive">{step1Form.formState.errors.cnpj.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Continuar
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleToggleMode}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Já tem uma conta? Faça login
          </button>
        </div>
      </form>
    );
  }

  // Signup Step 2: Personal Info + Credentials
  return (
    <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-success text-success-foreground flex items-center justify-center text-sm font-semibold">
            ✓
          </div>
          <span className="text-sm text-muted-foreground">Empresa</span>
        </div>
        <div className="w-8 h-px bg-primary" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
            2
          </div>
          <span className="text-sm font-medium text-foreground">Seus dados</span>
        </div>
        <div className="w-8 h-px bg-border" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-semibold">
            3
          </div>
          <span className="text-sm text-muted-foreground">Verificar</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName" className="text-foreground">Seu Nome</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="fullName"
            type="text"
            placeholder="Seu nome completo"
            className="pl-10"
            {...step2Form.register('fullName')}
          />
        </div>
        {step2Form.formState.errors.fullName && (
          <p className="text-sm text-destructive">{step2Form.formState.errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-foreground">WhatsApp</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            placeholder="(00) 00000-0000"
            className="pl-10"
            {...step2Form.register('phone')}
          />
        </div>
        {step2Form.formState.errors.phone && (
          <p className="text-sm text-destructive">{step2Form.formState.errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signupEmail" className="text-foreground">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signupEmail"
            type="email"
            placeholder="seu@email.com"
            className="pl-10"
            {...step2Form.register('email')}
          />
        </div>
        {step2Form.formState.errors.email && (
          <p className="text-sm text-destructive">{step2Form.formState.errors.email.message}</p>
        )}

       <p className="text-sm text-red-600">⚠️ não use e-mail temporário, aprovação da empresa é necessária.</p>

      </div>

      <div className="space-y-2">
        <Label htmlFor="signupPassword" className="text-foreground">Senha</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signupPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            className="pl-10 pr-10"
            autoComplete="new-password"
            {...step2Form.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {step2Form.formState.errors.password && (
          <p className="text-sm text-destructive">{step2Form.formState.errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-foreground">Confirmar Senha</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            className="pl-10"
            autoComplete="new-password"
            {...step2Form.register('confirmPassword')}
          />
        </div>
        {step2Form.formState.errors.confirmPassword && (
          <p className="text-sm text-destructive">{step2Form.formState.errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleBackToStep1}
          className="flex-1"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button
          type="submit"
          className="flex-1 gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continuar
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={handleToggleMode}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Já tem uma conta? Faça login
        </button>
      </div>
    </form>
  );
}
