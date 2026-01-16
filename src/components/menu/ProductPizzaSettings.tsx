import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Pizza, Settings, Pencil, Check } from 'lucide-react';
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
  productId: string;
  companyId: string;
  allowHalfHalf: boolean;
  onAllowHalfHalfChange: (value: boolean) => void;
}

interface OptionItem {
  id: string;
  name: string;
  price_modifier: number;
  sort_order: number;
  group_id: string;
}

interface OptionGroup {
  id: string;
  name: string;
  is_required: boolean;
  max_selections: number;
  selection_type: string;
}

interface ProductSettings {
  id?: string;
  product_id: string;
  allow_half_half: boolean;
  max_flavors: number;
  half_half_pricing_rule: string;
  half_half_discount_percentage: number;
  dough_max_selections: number;
  dough_is_required: boolean;
  crust_max_selections: number;
  crust_is_required: boolean;
}

export function ProductPizzaSettings({
  productId,
  companyId,
  allowHalfHalf,
  onAllowHalfHalfChange,
}: ProductPizzaSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sizes');
  
  // Data states
  const [sizes, setSizes] = useState<OptionItem[]>([]);
  const [doughs, setDoughs] = useState<OptionItem[]>([]);
  const [crusts, setCrusts] = useState<OptionItem[]>([]);
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  
  // Group references
  const [sizeGroup, setSizeGroup] = useState<OptionGroup | null>(null);
  const [doughGroup, setDoughGroup] = useState<OptionGroup | null>(null);
  const [crustGroup, setCrustGroup] = useState<OptionGroup | null>(null);
  
  // Form states
  const [newSize, setNewSize] = useState({ name: '', price_modifier: 0 });
  const [newDough, setNewDough] = useState({ name: '', price_modifier: 0 });
  const [newCrust, setNewCrust] = useState({ name: '', price_modifier: 0 });
  
  // Custom group names
  const [doughGroupName, setDoughGroupName] = useState('Massa');
  const [crustGroupName, setCrustGroupName] = useState('Borda');
  const [editingDoughName, setEditingDoughName] = useState(false);
  const [editingCrustName, setEditingCrustName] = useState(false);
  
  // Saving states
  const [saving, setSaving] = useState(false);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [groupsRes, optionsRes, settingsRes] = await Promise.all([
        supabase.from('product_option_groups').select('*').eq('product_id', productId).order('sort_order'),
        supabase.from('product_options').select('*').eq('product_id', productId).eq('is_available', true).order('sort_order'),
        supabase.from('pizza_product_settings').select('*').eq('product_id', productId).maybeSingle(),
      ]);
      
      if (groupsRes.error) throw groupsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      
      const groups = groupsRes.data || [];
      const options = optionsRes.data || [];
      
      // Find pizza-specific groups with broader matching
      const sizeG = groups.find(g => {
        const name = (g.name || '').toLowerCase().trim();
        return name === 'tamanho' || name === 'tamanhos' || name.includes('tamanho');
      });
      const doughG = groups.find(g => {
        const name = (g.name || '').toLowerCase().trim();
        return name.includes('massa') || name === 'massas' || name === 'tipo de massa';
      });
      const crustG = groups.find(g => {
        const name = (g.name || '').toLowerCase().trim();
        return name.includes('borda') || name === 'bordas';
      });
      
      setSizeGroup(sizeG || null);
      setDoughGroup(doughG || null);
      setCrustGroup(crustG || null);
      
      // Set custom group names from database
      if (doughG) setDoughGroupName(doughG.name);
      if (crustG) setCrustGroupName(crustG.name);
      
      // Map options to their groups
      setSizes(options.filter(o => o.group_id === sizeG?.id).map(o => ({
        id: o.id, name: o.name, price_modifier: o.price_modifier, sort_order: o.sort_order, group_id: o.group_id
      })));
      setDoughs(options.filter(o => o.group_id === doughG?.id).map(o => ({
        id: o.id, name: o.name, price_modifier: o.price_modifier, sort_order: o.sort_order, group_id: o.group_id
      })));
      setCrusts(options.filter(o => o.group_id === crustG?.id).map(o => ({
        id: o.id, name: o.name, price_modifier: o.price_modifier, sort_order: o.sort_order, group_id: o.group_id
      })));
      
      // Load settings
      if (settingsRes.data) {
        const d = settingsRes.data as any;
        setSettings({
          id: d.id, product_id: d.product_id,
          allow_half_half: d.allow_half_half ?? true,
          max_flavors: d.max_flavors ?? 2,
          half_half_pricing_rule: d.half_half_pricing_rule ?? 'average',
          half_half_discount_percentage: d.half_half_discount_percentage ?? 0,
          dough_max_selections: d.dough_max_selections ?? 1,
          dough_is_required: d.dough_is_required ?? true,
          crust_max_selections: d.crust_max_selections ?? 1,
          crust_is_required: d.crust_is_required ?? false,
        });
      } else {
        setSettings({
          product_id: productId, allow_half_half: true, max_flavors: 2,
          half_half_pricing_rule: 'average', half_half_discount_percentage: 0,
          dough_max_selections: 1, dough_is_required: true,
          crust_max_selections: 1, crust_is_required: false,
        });
      }
    } catch (error: any) {
      console.error('Error loading pizza config:', error);
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    if (productId) loadAllData();
  }, [productId, loadAllData]);

  // Create group if needed
  const ensureGroup = async (name: string, isRequired: boolean, maxSelections: number) => {
    const { data, error } = await supabase
      .from('product_option_groups')
      .insert({ product_id: productId, name, is_required: isRequired, max_selections: maxSelections, selection_type: maxSelections > 1 ? 'multiple' : 'single', sort_order: 0 })
      .select().single();
    if (error) throw error;
    return data;
  };

  // Update group name
  const updateGroupName = async (groupId: string, newName: string, type: 'dough' | 'crust') => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_option_groups')
        .update({ name: newName.trim() })
        .eq('id', groupId);
      if (error) throw error;
      
      if (type === 'dough') {
        setDoughGroup(prev => prev ? { ...prev, name: newName.trim() } : null);
        setDoughGroupName(newName.trim());
        setEditingDoughName(false);
      } else {
        setCrustGroup(prev => prev ? { ...prev, name: newName.trim() } : null);
        setCrustGroupName(newName.trim());
        setEditingCrustName(false);
      }
      toast({ title: 'Nome do grupo atualizado' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Add option
  const addOption = async (type: 'size' | 'dough' | 'crust', name: string, price: number) => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      let group = type === 'size' ? sizeGroup : type === 'dough' ? doughGroup : crustGroup;
      if (!group) {
        const groupName = type === 'size' ? 'Tamanho' : type === 'dough' ? 'Massa' : 'Borda';
        group = await ensureGroup(groupName, type === 'size', 1);
        if (type === 'size') setSizeGroup(group);
        else if (type === 'dough') setDoughGroup(group);
        else setCrustGroup(group);
      }
      
      const items = type === 'size' ? sizes : type === 'dough' ? doughs : crusts;
      const { data, error } = await supabase.from('product_options').insert({
        product_id: productId, group_id: group.id, name: name.trim(),
        price_modifier: price, is_available: true, sort_order: items.length,
      }).select().single();
      
      if (error) throw error;
      
      const newItem = { id: data.id, name: data.name, price_modifier: data.price_modifier, sort_order: data.sort_order, group_id: data.group_id };
      if (type === 'size') { setSizes([...sizes, newItem]); setNewSize({ name: '', price_modifier: 0 }); }
      else if (type === 'dough') { setDoughs([...doughs, newItem]); setNewDough({ name: '', price_modifier: 0 }); }
      else { setCrusts([...crusts, newItem]); setNewCrust({ name: '', price_modifier: 0 }); }
      
      toast({ title: 'Adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteOption = async (id: string, type: 'size' | 'dough' | 'crust') => {
    try {
      await supabase.from('product_options').update({ is_available: false }).eq('id', id);
      if (type === 'size') setSizes(sizes.filter(s => s.id !== id));
      else if (type === 'dough') setDoughs(doughs.filter(d => d.id !== id));
      else setCrusts(crusts.filter(c => c.id !== id));
      toast({ title: 'Removido' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const payload = { ...settings, product_id: productId };
      if (settings.id) {
        await supabase.from('pizza_product_settings').update(payload).eq('id', settings.id);
      } else {
        const { data } = await supabase.from('pizza_product_settings').insert(payload).select().single();
        if (data) setSettings({ ...settings, id: (data as any).id });
      }
      
      // Update group settings
      if (doughGroup) {
        await supabase.from('product_option_groups').update({
          is_required: settings.dough_is_required,
          max_selections: settings.dough_max_selections,
          selection_type: settings.dough_max_selections > 1 ? 'multiple' : 'single',
        }).eq('id', doughGroup.id);
      }
      if (crustGroup) {
        await supabase.from('product_option_groups').update({
          is_required: settings.crust_is_required,
          max_selections: settings.crust_max_selections,
          selection_type: settings.crust_max_selections > 1 ? 'multiple' : 'single',
        }).eq('id', crustGroup.id);
      }
      
      toast({ title: 'Regras salvas' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Pizza className="h-4 w-4" />
            Configurações desta Pizza
          </CardTitle>
          <p className="text-xs text-muted-foreground">Tamanhos, massas e bordas específicos para este produto</p>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sizes" className="text-xs">Tamanhos {sizes.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{sizes.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="doughs" className="text-xs">Massas {doughs.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{doughs.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="crusts" className="text-xs">Bordas {crusts.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{crusts.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="rules" className="text-xs">Regras</TabsTrigger>
            </TabsList>

            <TabsContent value="sizes" className="space-y-3 mt-3">
              {sizes.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  <span className="flex-1 text-sm">{s.name}</span>
                  <span className="text-sm text-muted-foreground">{s.price_modifier > 0 ? `+R$ ${s.price_modifier.toFixed(2)}` : 'Base'}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteOption(s.id, 'size')}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              ))}
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Input value={newSize.name} onChange={(e) => setNewSize(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Grande" className="flex-1 h-8 text-sm" />
                <div className="w-24"><CurrencyInput value={newSize.price_modifier} onChange={(v) => setNewSize(p => ({ ...p, price_modifier: parseFloat(String(v)) || 0 }))} className="h-8 text-sm" /></div>
                <Button size="sm" onClick={() => addOption('size', newSize.name, newSize.price_modifier)} disabled={saving || !newSize.name.trim()} className="h-8">{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}</Button>
              </div>
            </TabsContent>

            <TabsContent value="doughs" className="space-y-3 mt-3">
              {/* Group name editor */}
              <div className="flex items-center gap-2 mb-2">
                {editingDoughName ? (
                  <>
                    <Input 
                      value={doughGroupName} 
                      onChange={(e) => setDoughGroupName(e.target.value)} 
                      placeholder="Nome do grupo" 
                      className="h-8 text-sm flex-1" 
                    />
                    <Button 
                      size="sm" 
                      onClick={() => doughGroup && updateGroupName(doughGroup.id, doughGroupName, 'dough')} 
                      disabled={saving || !doughGroupName.trim()}
                      className="h-8"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{doughGroup ? doughGroupName : 'Criar grupo de Massa'}</span>
                    {doughGroup && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingDoughName(true)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </>
                )}
              </div>
              
              {settings && (
                <Card className="bg-muted/30 mb-3">
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-medium">Obrigatório</p><p className="text-xs text-muted-foreground">Cliente deve escolher</p></div>
                      <Switch checked={settings.dough_is_required} onCheckedChange={(v) => setSettings(p => p ? { ...p, dough_is_required: v } : null)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Tipo de seleção</Label>
                      <Select value={String(settings.dough_max_selections)} onValueChange={(v) => setSettings(p => p ? { ...p, dough_max_selections: parseInt(v) } : null)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Seleção única</SelectItem>
                          <SelectItem value="2">Múltipla (até 2)</SelectItem>
                          <SelectItem value="3">Múltipla (até 3)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}
              {doughs.map(d => (
                <div key={d.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  <span className="flex-1 text-sm">{d.name}</span>
                  <span className="text-sm text-muted-foreground">{d.price_modifier > 0 ? `+R$ ${d.price_modifier.toFixed(2)}` : 'Grátis'}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteOption(d.id, 'dough')}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              ))}
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Input value={newDough.name} onChange={(e) => setNewDough(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Tradicional" className="flex-1 h-8 text-sm" />
                <div className="w-24"><CurrencyInput value={newDough.price_modifier} onChange={(v) => setNewDough(p => ({ ...p, price_modifier: parseFloat(String(v)) || 0 }))} className="h-8 text-sm" /></div>
                <Button size="sm" onClick={() => addOption('dough', newDough.name, newDough.price_modifier)} disabled={saving || !newDough.name.trim()} className="h-8">{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}</Button>
              </div>
            </TabsContent>

            <TabsContent value="crusts" className="space-y-3 mt-3">
              {/* Group name editor */}
              <div className="flex items-center gap-2 mb-2">
                {editingCrustName ? (
                  <>
                    <Input 
                      value={crustGroupName} 
                      onChange={(e) => setCrustGroupName(e.target.value)} 
                      placeholder="Nome do grupo" 
                      className="h-8 text-sm flex-1" 
                    />
                    <Button 
                      size="sm" 
                      onClick={() => crustGroup && updateGroupName(crustGroup.id, crustGroupName, 'crust')} 
                      disabled={saving || !crustGroupName.trim()}
                      className="h-8"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{crustGroup ? crustGroupName : 'Criar grupo de Borda'}</span>
                    {crustGroup && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingCrustName(true)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </>
                )}
              </div>
              
              {settings && (
                <Card className="bg-muted/30 mb-3">
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-medium">Obrigatório</p><p className="text-xs text-muted-foreground">Cliente deve escolher</p></div>
                      <Switch checked={settings.crust_is_required} onCheckedChange={(v) => setSettings(p => p ? { ...p, crust_is_required: v } : null)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Tipo de seleção</Label>
                      <Select value={String(settings.crust_max_selections)} onValueChange={(v) => setSettings(p => p ? { ...p, crust_max_selections: parseInt(v) } : null)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Seleção única</SelectItem>
                          <SelectItem value="2">Múltipla (até 2)</SelectItem>
                          <SelectItem value="3">Múltipla (até 3)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}
              {crusts.map(c => (
                <div key={c.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="text-sm text-muted-foreground">{c.price_modifier > 0 ? `+R$ ${c.price_modifier.toFixed(2)}` : 'Grátis'}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteOption(c.id, 'crust')}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              ))}
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed">
                <Input value={newCrust.name} onChange={(e) => setNewCrust(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Catupiry" className="flex-1 h-8 text-sm" />
                <div className="w-24"><CurrencyInput value={newCrust.price_modifier} onChange={(v) => setNewCrust(p => ({ ...p, price_modifier: parseFloat(String(v)) || 0 }))} className="h-8 text-sm" /></div>
                <Button size="sm" onClick={() => addOption('crust', newCrust.name, newCrust.price_modifier)} disabled={saving || !newCrust.name.trim()} className="h-8">{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}</Button>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="space-y-4 mt-3">
              {settings && (
                <>
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4" />Meio a Meio</CardTitle></CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="flex items-center justify-between">
                        <div><p className="text-sm font-medium">Permitir meio a meio</p></div>
                        <Switch checked={settings.allow_half_half} onCheckedChange={(v) => setSettings(p => p ? { ...p, allow_half_half: v } : null)} />
                      </div>
                      {settings.allow_half_half && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-sm">Máximo de sabores</Label>
                            <Select value={String(settings.max_flavors)} onValueChange={(v) => setSettings(p => p ? { ...p, max_flavors: parseInt(v) } : null)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2 sabores</SelectItem>
                                <SelectItem value="3">3 sabores</SelectItem>
                                <SelectItem value="4">4 sabores</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Regra de preço</Label>
                            <Select value={settings.half_half_pricing_rule} onValueChange={(v) => setSettings(p => p ? { ...p, half_half_pricing_rule: v } : null)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="highest">Preço do maior</SelectItem>
                                <SelectItem value="average">Média</SelectItem>
                                <SelectItem value="sum">Soma proporcional</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Button onClick={saveSettings} disabled={saving} className="w-full">
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar regras
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
