import { useState } from 'react';
import { Users, Minus, Plus, User, Mail, Phone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TableCustomerData {
  name: string;
  email: string;
  phone: string;
  customerCount: number;
}

interface TableCustomerModalProps {
  open: boolean;
  onConfirm: (data: TableCustomerData) => void;
  tableNumber: number;
  isLoading?: boolean;
}

export function TableCustomerModal({ 
  open, 
  onConfirm, 
  tableNumber,
  isLoading = false 
}: TableCustomerModalProps) {
  const [step, setStep] = useState<'info' | 'count'>('info');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customerCount, setCustomerCount] = useState(1);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const validateInfo = () => {
    const newErrors: { name?: string; phone?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Nome deve ter pelo menos 2 caracteres';
    }
    
    if (!phone.trim()) {
      newErrors.phone = 'Telefone é obrigatório';
    } else if (phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Telefone inválido';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (validateInfo()) {
      setStep('count');
    }
  };

  const handleConfirm = () => {
    onConfirm({
      name: name.trim(),
      email: email.trim(),
      phone: phone.replace(/\D/g, ''),
      customerCount,
    });
  };

  const handleBack = () => {
    setStep('info');
  };

  // Format phone as user types
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[420px]" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            Bem-vindo à Mesa {tableNumber}! 🍽️
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === 'info' 
              ? 'Informe seus dados para começar' 
              : 'Quantas pessoas estão na mesa?'}
          </DialogDescription>
        </DialogHeader>

        {step === 'info' ? (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Nome *
              </Label>
              <Input
                id="customer-name"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={errors.name ? 'border-destructive' : ''}
                maxLength={100}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                E-mail (opcional)
              </Label>
              <Input
                id="customer-email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Telefone *
              </Label>
              <Input
                id="customer-phone"
                type="tel"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={handlePhoneChange}
                className={errors.phone ? 'border-destructive' : ''}
                maxLength={15}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone}</p>
              )}
            </div>

            <Button 
              onClick={handleNextStep} 
              className="w-full" 
              size="lg"
              disabled={isLoading}
            >
              Próximo
            </Button>
          </div>
        ) : (
          <div className="py-6">
            <div className="flex items-center justify-center gap-6 mb-6">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => setCustomerCount((c) => Math.max(1, c - 1))}
                disabled={customerCount <= 1 || isLoading}
              >
                <Minus className="h-5 w-5" />
              </Button>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  <span className="text-4xl font-bold text-primary">{customerCount}</span>
                </div>
                <span className="text-sm text-muted-foreground mt-1">
                  {customerCount === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => setCustomerCount((c) => Math.min(20, c + 1))}
                disabled={customerCount >= 20 || isLoading}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleBack} 
                className="flex-1" 
                size="lg"
                disabled={isLoading}
              >
                Voltar
              </Button>
              <Button 
                onClick={handleConfirm} 
                className="flex-1" 
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? 'Abrindo mesa...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
