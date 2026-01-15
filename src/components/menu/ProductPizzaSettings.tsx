import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Pizza } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ProductPizzaSettingsProps {
  categoryId: string;
  companyId: string;
  productId: string | null;
  allowHalfHalf: boolean;
  onAllowHalfHalfChange: (value: boolean) => void;
}

interface PizzaSize {
  id: string;
  name: string;
  base_price: number;
  max_flavors: number;
  slices: number;
  sort_order: number;
}

interface PizzaDough {
  id: string;
  name: string;
  extra_price: number;
  active: boolean;
}

interface PizzaCrustType {
  id: string;
  name: string;
  active: boolean;
}

interface PizzaCrustFlavor {
  id: string;
  name: string;
  type_id: string;
  extra_price: number;
  active: boolean;
}

interface CategorySettings {
  id?: string;
  category_id: string;
  allow_half_half: boolean;
  max_flavors: number;
  half_half_pricing_rule: string;
  half_half_discount_percentage: number;
  allow_repeated_flavors: boolean;
}

export function ProductPizzaSettings({
  categoryId,
  companyId,
  productId,
  allowHalfHalf,
  onAllowHalfHalfChange,
}: ProductPizzaSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sizes');
  
  // Data states
  const [sizes, setSizes] = useState<PizzaSize[]>([]);
  const [doughs, setDoughs] = useState<PizzaDough[]>([]);
  const [crustTypes, setCrustTypes] = useState<PizzaCrustType[]>([]);
  const [crustFlavors, setCrustFlavors] = useState<PizzaCrustFlavor[]>([]);
  const [categorySettings, setCategorySettings] = useState<CategorySettings | null>(null);
  
  // Form states
  const [newSize, setNewSize] = useState({ name: '', base_price: 0, max_flavors: 2, slices: 8 });
  const [newDough, setNewDough] = useState({ name: '', extra_price: 0 });
  const [newCrustType, setNewCrustType] = useState('');
  const [newCrustFlavor, setNewCrustFlavor] = useState({ name: '', type_id: '', extra_price: 0 });
  
  // Saving states
  const [savingSizes, setSavingSizes] = useState(false);
  const [savingDoughs, setSavingDoughs] = useState(false);
  const [savingCrusts, setSavingCrusts] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (categoryId && companyId) {
      loadAllData();
    }
  }, [categoryId, companyId]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      
      const [sizesRes, doughsRes, crustTypesRes, crustFlavorsRes, settingsRes] = await Promise.all([
        supabase.from('pizza_category_sizes').select('*').eq('category_id', categoryId).order('sort_order'),
        supabase.from('pizza_dough_types').select('*').eq('active', true).order('name'),
        supabase.from('pizza_crust_types').select('*').eq('active', true).order('name'),
        supabase.from('pizza_crust_flavors').select('*').eq('active', true).order('name'),
        supabase.from('pizza_category_settings').select('*').eq('category_id', categoryId).maybeSingle(),
      ]);
      
      if (sizesRes.error) throw sizesRes.error;
      if (doughsRes.error) throw doughsRes.error;
      if (crustTypesRes.error) throw crustTypesRes.error;
      if (crustFlavorsRes.error) throw crustFlavorsRes.error;
      
      setSizes(sizesRes.data || []);
      setDoughs(doughsRes.data || []);
      setCrustTypes(crustTypesRes.data || []);
      setCrustFlavors(crustFlavorsRes.data || []);
      
      if (settingsRes.data) {
        setCategorySettings(settingsRes.data);
      } else {
        setCategorySettings({
          category_id: categoryId,
          allow_half_half: true,
          max_flavors: 2,
          half_half_pricing_rule: 'average',
          half_half_discount_percentage: 0,
          allow_repeated_flavors: false,
        });
      }
    } catch (error: any) {
      console.error('Error loading pizza data:', error);
      toast({ title: 'Erro ao carregar configurações', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Size management
  const addSize = async () => {
    if (!newSize.name.trim()) return;
    
    try {
      setSavingSizes(true);
      const { data, error } = await supabase
        .from('pizza_category_sizes')
        .insert({
          category_id: categoryId,
          name: newSize.name.trim(),
          base_price: newSize.base_price,
          max_flavors: newSize.max_flavors,
          slices: newSize.slices,
          sort_order: sizes.length,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setSizes([...sizes, data]);
      setNewSize({ name: '', base_price: 0, max_flavors: 2, slices: 8 });
      toast({ title: 'Tamanho adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar tamanho', description: error.message, variant: 'destructive' });
    } finally {
      setSavingSizes(false);
    }
  };

  const updateSize = async (id: string, updates: Partial<PizzaSize>) => {
    try {
      const { error } = await supabase.from('pizza_category_sizes').update(updates).eq('id', id);
      if (error) throw error;
      
      setSizes(sizes.map(s => s.id === id ? { ...s, ...updates } : s));
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    }
  };

  const deleteSize = async (id: string) => {
    try {
      const { error } = await supabase.from('pizza_category_sizes').delete().eq('id', id);
      if (error) throw error;
      
      setSizes(sizes.filter(s => s.id !== id));
      toast({ title: 'Tamanho removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    }
  };

  // Dough management
  const addDough = async () => {
    if (!newDough.name.trim()) return;
    
    try {
      setSavingDoughs(true);
      const { data, error } = await supabase
        .from('pizza_dough_types')
        .insert({
          name: newDough.name.trim(),
          extra_price: newDough.extra_price,
          active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setDoughs([...doughs, data]);
      setNewDough({ name: '', extra_price: 0 });
      toast({ title: 'Massa adicionada' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar massa', description: error.message, variant: 'destructive' });
    } finally {
      setSavingDoughs(false);
    }
  };

  const deleteDough = async (id: string) => {
    try {
      const { error } = await supabase.from('pizza_dough_types').update({ active: false }).eq('id', id);
      if (error) throw error;
      
      setDoughs(doughs.filter(d => d.id !== id));
      toast({ title: 'Massa removida' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    }
  };

  // Crust management
  const addCrustType = async () => {
    if (!newCrustType.trim()) return;
    
    try {
      setSavingCrusts(true);
      const { data, error } = await supabase
        .from('pizza_crust_types')
        .insert({ name: newCrustType.trim(), active: true })
        .select()
        .single();
      
      if (error) throw error;
      
      setCrustTypes([...crustTypes, data]);
      setNewCrustType('');
      toast({ title: 'Tipo de borda adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCrusts(false);
    }
  };

  const addCrustFlavor = async () => {
    if (!newCrustFlavor.name.trim() || !newCrustFlavor.type_id) return;
    
    try {
      setSavingCrusts(true);
      const { data, error } = await supabase
        .from('pizza_crust_flavors')
        .insert({
          name: newCrustFlavor.name.trim(),
          type_id: newCrustFlavor.type_id,
          extra_price: newCrustFlavor.extra_price,
          active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setCrustFlavors([...crustFlavors, data]);
      setNewCrustFlavor({ name: '', type_id: '', extra_price: 0 });
      toast({ title: 'Sabor de borda adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCrusts(false);
    }
  };

  const deleteCrustFlavor = async (id: string) => {
    try {
      const { error } = await supabase.from('pizza_crust_flavors').update({ active: false }).eq('id', id);
      if (error) throw error;
      
      setCrustFlavors(crustFlavors.filter(f => f.id !== id));
      toast({ title: 'Sabor removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    }
  };

  // Settings management
  const saveSettings = async () => {
    if (!categorySettings) return;
    
    try {
      setSavingSettings(true);
      
      if (categorySettings.id) {
        const { error } = await supabase
          .from('pizza_category_settings')
          .update({
            allow_half_half: categorySettings.allow_half_half,
            max_flavors: categorySettings.max_flavors,
            half_half_pricing_rule: categorySettings.half_half_pricing_rule,
            half_half_discount_percentage: categorySettings.half_half_discount_percentage,
            allow_repeated_flavors: categorySettings.allow_repeated_flavors,
          })
          .eq('id', categorySettings.id);
        
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('pizza_category_settings')
          .insert({
            category_id: categoryId,
            allow_half_half: categorySettings.allow_half_half,
            max_flavors: categorySettings.max_flavors,
            half_half_pricing_rule: categorySettings.half_half_pricing_rule,
            half_half_discount_percentage: categorySettings.half_half_discount_percentage,
            allow_repeated_flavors: categorySettings.allow_repeated_flavors,
          })
          .select()
          .single();
        
        if (error) throw error;
        setCategorySettings(data);
      }
      
      toast({ title: 'Regras salvas' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar regras', description: error.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Product-specific toggle */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Usar em pizza meio a meio</p>
              <p className="text-xs text-muted-foreground">Este sabor aparece na montagem de meio a meio</p>
            </div>
            <Switch checked={allowHalfHalf} onCheckedChange={onAllowHalfHalfChange} />
          </div>
        </CardContent>
      </Card>

      {/* Category-level pizza settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Pizza className="h-4 w-4" />
            Configurações da Categoria Pizza
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Essas configurações valem para todos os produtos desta categoria
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sizes" className="text-xs">
                Tamanhos
                {sizes.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{sizes.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="doughs" className="text-xs">
                Massas
                {doughs.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{doughs.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="crusts" className="text-xs">
                Bordas
                {crustFlavors.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{crustFlavors.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="rules" className="text-xs">Regras</TabsTrigger>
            </TabsList>

            {/* Sizes Tab */}
            <TabsContent value="sizes" className="space-y-3 mt-3">
              {/* Header labels */}
              <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <span className="w-24">Tamanho</span>
                <span className="w-24 text-center">Preço</span>
                <span className="w-14 text-center">Fatias</span>
                <span className="w-14 text-center">Sabores</span>
                <span className="w-8"></span>
              </div>
              
              {sizes.length > 0 && (
                <div className="space-y-2">
                  {sizes.map(size => (
                    <div key={size.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                      <Input
                        value={size.name}
                        onChange={(e) => updateSize(size.id, { name: e.target.value })}
                        className="w-24 h-8 text-sm"
                        placeholder="Ex: G"
                      />
                      <div className="w-24">
                        <CurrencyInput
                          value={size.base_price}
                          onChange={(v) => updateSize(size.id, { base_price: parseFloat(String(v)) || 0 })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={size.slices}
                        onChange={(e) => updateSize(size.id, { slices: parseInt(e.target.value) || 8 })}
                        className="w-14 h-8 text-sm text-center"
                        placeholder="8"
                      />
                      <Input
                        type="number"
                        min={1}
                        max={4}
                        value={size.max_flavors}
                        onChange={(e) => updateSize(size.id, { max_flavors: parseInt(e.target.value) || 1 })}
                        className="w-14 h-8 text-sm text-center"
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteSize(size.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Input
                  value={newSize.name}
                  onChange={(e) => setNewSize(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: G"
                  className="w-24 h-8 text-sm"
                />
                <div className="w-24">
                  <CurrencyInput
                    value={newSize.base_price}
                    onChange={(v) => setNewSize(prev => ({ ...prev, base_price: parseFloat(String(v)) || 0 }))}
                    className="h-8 text-sm"
                  />
                </div>
                <Input
                  type="number"
                  min={1}
                  value={newSize.slices}
                  onChange={(e) => setNewSize(prev => ({ ...prev, slices: parseInt(e.target.value) || 8 }))}
                  className="w-14 h-8 text-sm text-center"
                  placeholder="8"
                />
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={newSize.max_flavors}
                  onChange={(e) => setNewSize(prev => ({ ...prev, max_flavors: parseInt(e.target.value) || 1 }))}
                  className="w-14 h-8 text-sm text-center"
                />
                <Button size="sm" onClick={addSize} disabled={savingSizes || !newSize.name.trim()} className="h-8">
                  {savingSizes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Fatias:</strong> quantidade de pedaços • <strong>Sabores:</strong> máx. para meio a meio
              </p>
            </TabsContent>

            {/* Doughs Tab */}
            <TabsContent value="doughs" className="space-y-3 mt-3">
              {doughs.length > 0 && (
                <div className="space-y-2">
                  {doughs.map(dough => (
                    <div key={dough.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                      <span className="flex-1 text-sm">{dough.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {dough.extra_price > 0 ? `+R$ ${dough.extra_price.toFixed(2)}` : 'Grátis'}
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteDough(dough.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Input
                  value={newDough.name}
                  onChange={(e) => setNewDough(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Tradicional, Fina"
                  className="flex-1 h-8 text-sm"
                />
                <div className="w-24">
                  <CurrencyInput
                    value={newDough.extra_price}
                    onChange={(v) => setNewDough(prev => ({ ...prev, extra_price: parseFloat(String(v)) || 0 }))}
                    className="h-8 text-sm"
                    placeholder="+ Preço"
                  />
                </div>
                <Button size="sm" onClick={addDough} disabled={savingDoughs || !newDough.name.trim()} className="h-8">
                  {savingDoughs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Massas disponíveis para todas as pizzas (global)</p>
            </TabsContent>

            {/* Crusts Tab */}
            <TabsContent value="crusts" className="space-y-3 mt-3">
              {crustTypes.length > 0 && (
                <div className="space-y-3">
                  {crustTypes.map(type => (
                    <div key={type.id} className="space-y-2">
                      <p className="text-sm font-medium">{type.name}</p>
                      <div className="space-y-1 pl-3">
                        {crustFlavors.filter(f => f.type_id === type.id).map(flavor => (
                          <div key={flavor.id} className="flex items-center gap-2 p-1.5 rounded border bg-muted/30">
                            <span className="flex-1 text-sm">{flavor.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {flavor.extra_price > 0 ? `+R$ ${flavor.extra_price.toFixed(2)}` : 'Grátis'}
                            </span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteCrustFlavor(flavor.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add crust type */}
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Input
                  value={newCrustType}
                  onChange={(e) => setNewCrustType(e.target.value)}
                  placeholder="Novo tipo (ex: Recheada)"
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={addCrustType} disabled={savingCrusts || !newCrustType.trim()} className="h-8">
                  {savingCrusts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
              
              {/* Add crust flavor */}
              {crustTypes.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                  <Select
                    value={newCrustFlavor.type_id}
                    onValueChange={(v) => setNewCrustFlavor(prev => ({ ...prev, type_id: v }))}
                  >
                    <SelectTrigger className="w-28 h-8 text-sm">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {crustTypes.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newCrustFlavor.name}
                    onChange={(e) => setNewCrustFlavor(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Sabor (ex: Catupiry)"
                    className="flex-1 h-8 text-sm"
                  />
                  <div className="w-24">
                    <CurrencyInput
                      value={newCrustFlavor.extra_price}
                      onChange={(v) => setNewCrustFlavor(prev => ({ ...prev, extra_price: parseFloat(String(v)) || 0 }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button size="sm" onClick={addCrustFlavor} disabled={savingCrusts || !newCrustFlavor.name.trim() || !newCrustFlavor.type_id} className="h-8">
                    {savingCrusts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Bordas disponíveis para todas as pizzas (global)</p>
            </TabsContent>

            {/* Rules Tab */}
            <TabsContent value="rules" className="space-y-4 mt-3">
              {categorySettings && (
                <>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">Permitir meio a meio</p>
                      <p className="text-xs text-muted-foreground">Clientes podem montar pizzas com múltiplos sabores</p>
                    </div>
                    <Switch
                      checked={categorySettings.allow_half_half}
                      onCheckedChange={(v) => setCategorySettings(prev => prev ? { ...prev, allow_half_half: v } : null)}
                    />
                  </div>
                  
                  {categorySettings.allow_half_half && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm">Máximo de sabores</Label>
                        <Select
                          value={String(categorySettings.max_flavors)}
                          onValueChange={(v) => setCategorySettings(prev => prev ? { ...prev, max_flavors: parseInt(v) } : null)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 sabores</SelectItem>
                            <SelectItem value="3">3 sabores</SelectItem>
                            <SelectItem value="4">4 sabores</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Regra de preço</Label>
                        <Select
                          value={categorySettings.half_half_pricing_rule}
                          onValueChange={(v) => setCategorySettings(prev => prev ? { ...prev, half_half_pricing_rule: v } : null)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="highest">Preço do maior sabor</SelectItem>
                            <SelectItem value="average">Média dos preços</SelectItem>
                            <SelectItem value="sum">Soma proporcional</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Desconto meio a meio (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={categorySettings.half_half_discount_percentage}
                          onChange={(e) => setCategorySettings(prev => prev ? { ...prev, half_half_discount_percentage: parseFloat(e.target.value) || 0 } : null)}
                          className="h-9"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">Permitir sabores repetidos</p>
                          <p className="text-xs text-muted-foreground">Ex: Calabresa + Calabresa</p>
                        </div>
                        <Switch
                          checked={categorySettings.allow_repeated_flavors}
                          onCheckedChange={(v) => setCategorySettings(prev => prev ? { ...prev, allow_repeated_flavors: v } : null)}
                        />
                      </div>
                    </>
                  )}
                  
                  <Button onClick={saveSettings} disabled={savingSettings} className="w-full">
                    {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Salvar regras
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
