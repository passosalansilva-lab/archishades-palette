import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock, Eye, EyeOff, CheckCircle, KeyRound, Mail, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSystemLogo } from '@/hooks/useSystemLogo';
import { ChromaKeyImage } from '@/components/ui/chroma-key-image';

const emailSchema = z.object({
  email: z.string().email('Email inválido'),
});

const resetSchema = z.object({
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type EmailFormData = z.infer<typeof emailSchema>;
type ResetFormData = z.infer<typeof resetSchema>;

type Step = 'email' | 'code' | 'reset' | 'success';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { logoUrl } = useSystemLogo("landing");
  
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
  });

  const resetForm = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  // Check for token in URL (coming from Supabase email link)
  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const type = searchParams.get('type');
    
    if (accessToken && type === 'recovery') {
      // User clicked on the email link - skip to reset step
      setStep('reset');
    }
  }, [searchParams]);

  // Countdown timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleSendCode = async (data: EmailFormData) => {
    setLoading(true);
    try {
      // Call edge function to send password reset code
      const { data: response, error } = await supabase.functions.invoke('send-password-reset-code', {
        body: { email: data.email },
      });

      if (error) {
        // Try to extract error message from the response context
        let errorMessage = 'Tente novamente';
        if (error.context?.body) {
          try {
            const errorBody = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body) 
              : error.context.body;
            errorMessage = errorBody?.error || errorMessage;
          } catch {
            errorMessage = error.message || errorMessage;
          }
        } else {
          errorMessage = error.message || errorMessage;
        }
        
        toast({
          title: 'Erro ao enviar código',
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }

      if (response?.error) {
        toast({
          title: 'Erro ao enviar código',
          description: response.error,
          variant: 'destructive',
        });
        return;
      }

      setEmail(data.email);
      setStep('code');
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
    if (resendTimer > 0 || !email) return;
    
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('send-password-reset-code', {
        body: { email },
      });

      if (error) {
        let errorMessage = 'Tente novamente';
        if (error.context?.body) {
          try {
            const errorBody = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body) 
              : error.context.body;
            errorMessage = errorBody?.error || errorMessage;
          } catch {
            errorMessage = error.message || errorMessage;
          }
        } else {
          errorMessage = error.message || errorMessage;
        }
        
        toast({
          title: 'Erro ao reenviar código',
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }

      if (response?.error) {
        toast({
          title: 'Erro ao reenviar código',
          description: response.error,
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
    if (verificationCode.length !== 6) {
      toast({
        title: 'Código incompleto',
        description: 'Digite o código de 6 dígitos',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Verify the code
      const { data: response, error } = await supabase.functions.invoke('verify-password-reset-code', {
        body: { email, code: verificationCode },
      });

      if (error) {
        let errorMessage = 'Verifique o código e tente novamente';
        if (error.context?.body) {
          try {
            const errorBody = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body) 
              : error.context.body;
            errorMessage = errorBody?.error || errorMessage;
          } catch {
            errorMessage = error.message || errorMessage;
          }
        } else {
          errorMessage = error.message || errorMessage;
        }
        
        toast({
          title: 'Código inválido',
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }

      if (response?.error) {
        toast({
          title: 'Código inválido',
          description: response.error,
          variant: 'destructive',
        });
        return;
      }

      // Code verified, proceed to reset
      setStep('reset');
      toast({
        title: 'Código verificado!',
        description: 'Agora defina sua nova senha',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (data: ResetFormData) => {
    setLoading(true);
    try {
      // Update password using edge function
      const { data: response, error } = await supabase.functions.invoke('update-user-password', {
        body: { 
          email, 
          code: verificationCode,
          newPassword: data.password 
        },
      });

      if (error) {
        let errorMessage = 'Tente novamente';
        if (error.context?.body) {
          try {
            const errorBody = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body) 
              : error.context.body;
            errorMessage = errorBody?.error || errorMessage;
          } catch {
            errorMessage = error.message || errorMessage;
          }
        } else {
          errorMessage = error.message || errorMessage;
        }
        
        toast({
          title: 'Erro ao redefinir senha',
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }

      if (response?.error) {
        toast({
          title: 'Erro ao redefinir senha',
          description: response.error,
          variant: 'destructive',
        });
        return;
      }

      setStep('success');
      toast({
        title: 'Senha redefinida!',
        description: 'Sua senha foi alterada com sucesso',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'email':
        return (
          <form onSubmit={emailForm.handleSubmit(handleSendCode)} className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Esqueceu sua senha?</h2>
              <p className="text-sm text-muted-foreground">
                Digite seu email e enviaremos um código para redefinir sua senha
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10"
                  {...emailForm.register('email')}
                />
              </div>
              {emailForm.formState.errors.email && (
                <p className="text-sm text-destructive">{emailForm.formState.errors.email.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar código
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate('/auth')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao login
            </Button>
          </form>
        );

      case 'code':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Verifique seu email</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos um código de 6 dígitos para<br />
                <span className="font-medium text-foreground">{email}</span>
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
              onClick={handleVerifyCode}
              className="w-full"
              disabled={loading || verificationCode.length !== 6}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verificar código
            </Button>

            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">Não recebeu o código?</p>
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

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep('email');
                setVerificationCode('');
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Alterar email
            </Button>
          </div>
        );

      case 'reset':
        return (
          <form onSubmit={resetForm.handleSubmit(handleResetPassword)} className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Criar nova senha</h2>
              <p className="text-sm text-muted-foreground">
                Digite sua nova senha abaixo
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  {...resetForm.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {resetForm.formState.errors.password && (
                <p className="text-sm text-destructive">{resetForm.formState.errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  {...resetForm.register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {resetForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{resetForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Redefinir senha
            </Button>
          </form>
        );

      case 'success':
        return (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Senha redefinida!</h2>
              <p className="text-sm text-muted-foreground">
                Sua senha foi alterada com sucesso.<br />
                Agora você pode fazer login com sua nova senha.
              </p>
            </div>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Ir para o login
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      {/* Logo */}
      <div className="mb-8">
        <ChromaKeyImage
          src={logoUrl}
          alt="Logo"
          className="h-16 w-auto"
        />
      </div>

      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {renderStep()}
        </CardContent>
      </Card>
    </div>
  );
}
