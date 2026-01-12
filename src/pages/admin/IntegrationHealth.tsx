import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  RefreshCw, 
  Search, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Filter,
  Activity,
  Mail,
  CreditCard,
  Smartphone,
  Zap,
  CheckCheck,
  XCircle,
  AlertTriangle,
  TrendingUp
} from "lucide-react";
import { format, formatDistanceToNow, subDays, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface IntegrationEvent {
  id: string;
  created_at: string;
  provider: string;
  source: string;
  level: "info" | "warn" | "error";
  message: string;
  company_id: string | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
  resolved: boolean;
}

interface ProviderHealth {
  provider: string;
  label: string;
  icon: React.ReactNode;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastError: IntegrationEvent | null;
  errorCount24h: number;
  warnCount24h: number;
  successCount24h: number;
  lastSuccess: IntegrationEvent | null;
}

const PROVIDER_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  resend: { label: "Resend (E-mail)", icon: <Mail className="h-5 w-5" /> },
  stripe: { label: "Stripe (Pagamentos)", icon: <CreditCard className="h-5 w-5" /> },
  mercadopago: { label: "Mercado Pago", icon: <Smartphone className="h-5 w-5" /> },
  picpay: { label: "PicPay", icon: <Smartphone className="h-5 w-5" /> },
  mapbox: { label: "Mapbox (Mapas)", icon: <Activity className="h-5 w-5" /> },
  supabase: { label: "Supabase", icon: <Zap className="h-5 w-5" /> },
};

export default function IntegrationHealth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  // Fetch events
  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ["integration-events", showResolved],
    queryFn: async () => {
      let query = supabase
        .from("integration_events" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!showResolved) {
        query = query.eq("resolved", false);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching integration events:", error);
        return [];
      }

      return (data || []) as unknown as IntegrationEvent[];
    },
    refetchInterval: 30000,
  });

  // Mark as resolved mutation
  const markResolvedMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("integration_events" as any)
        .update({ resolved: true })
        .eq("id", eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-events"] });
      toast({ title: "Evento marcado como resolvido" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calculate provider health status
  const providerHealth = useMemo<ProviderHealth[]>(() => {
    const now = new Date();
    const oneDayAgo = subDays(now, 1);
    const oneHourAgo = subHours(now, 1);

    const providers = Object.keys(PROVIDER_CONFIG);

    return providers.map((provider) => {
      const providerEvents = (events || []).filter((e) => e.provider === provider);
      const events24h = providerEvents.filter((e) => new Date(e.created_at) >= oneDayAgo);
      const events1h = providerEvents.filter((e) => new Date(e.created_at) >= oneHourAgo);

      const errorCount24h = events24h.filter((e) => e.level === "error").length;
      const warnCount24h = events24h.filter((e) => e.level === "warn").length;
      const successCount24h = events24h.filter((e) => e.level === "info").length;
      const errors1h = events1h.filter((e) => e.level === "error").length;

      const lastError = providerEvents
        .filter((e) => e.level === "error")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

      const lastSuccess = providerEvents
        .filter((e) => e.level === "info")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

      let status: ProviderHealth["status"] = "unknown";

      if (events24h.length === 0) {
        status = "unknown";
      } else if (errors1h >= 3) {
        status = "down";
      } else if (errorCount24h >= 5 || warnCount24h >= 10) {
        status = "degraded";
      } else {
        status = "healthy";
      }

      const config = PROVIDER_CONFIG[provider];

      return {
        provider,
        label: config.label,
        icon: config.icon,
        status,
        lastError,
        errorCount24h,
        warnCount24h,
        successCount24h,
        lastSuccess,
      };
    });
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return (events || []).filter((event) => {
      const matchesProvider = selectedProvider === "all" || event.provider === selectedProvider;
      const matchesLevel = selectedLevel === "all" || event.level === selectedLevel;
      const matchesSearch =
        searchQuery === "" ||
        event.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.provider.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesProvider && matchesLevel && matchesSearch;
    });
  }, [events, selectedProvider, selectedLevel, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const all = events || [];
    return {
      total: all.length,
      errors: all.filter((e) => e.level === "error" && !e.resolved).length,
      warnings: all.filter((e) => e.level === "warn" && !e.resolved).length,
      resolved: all.filter((e) => e.resolved).length,
    };
  }, [events]);

  const getStatusBadge = (status: ProviderHealth["status"]) => {
    switch (status) {
      case "healthy":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1">
            <CheckCircle className="h-3 w-3" />
            Operacional
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Degradado
          </Badge>
        );
      case "down":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/30 gap-1">
            <XCircle className="h-3 w-3" />
            Indisponível
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Sem dados
          </Badge>
        );
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      case "warn":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Aviso</Badge>;
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warn":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Saúde das Integrações</h1>
            <p className="text-muted-foreground">
              Monitore o status de Resend, Stripe e outros serviços
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Erros Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.errors}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Avisos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">{stats.warnings}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <CheckCheck className="h-4 w-4 text-green-500" />
                Resolvidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.resolved}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="health" className="space-y-4">
          <TabsList>
            <TabsTrigger value="health" className="gap-2">
              <Activity className="h-4 w-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-2">
              <Clock className="h-4 w-4" />
              Eventos
            </TabsTrigger>
          </TabsList>

          {/* Health Tab */}
          <TabsContent value="health" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providerHealth.map((provider) => (
                <Card
                  key={provider.provider}
                  className={`transition-all ${
                    provider.status === "down"
                      ? "border-red-500/50 bg-red-500/5"
                      : provider.status === "degraded"
                      ? "border-yellow-500/50 bg-yellow-500/5"
                      : ""
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            provider.status === "healthy"
                              ? "bg-green-500/10 text-green-600"
                              : provider.status === "degraded"
                              ? "bg-yellow-500/10 text-yellow-600"
                              : provider.status === "down"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {provider.icon}
                        </div>
                        <CardTitle className="text-base">{provider.label}</CardTitle>
                      </div>
                      {getStatusBadge(provider.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <div className="text-lg font-semibold text-green-600">{provider.successCount24h}</div>
                        <div className="text-xs text-muted-foreground">Sucesso</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-yellow-600">{provider.warnCount24h}</div>
                        <div className="text-xs text-muted-foreground">Avisos</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-red-600">{provider.errorCount24h}</div>
                        <div className="text-xs text-muted-foreground">Erros</div>
                      </div>
                    </div>

                    {provider.lastError && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">Último erro:</p>
                        <p className="text-xs truncate">{provider.lastError.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(provider.lastError.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    )}

                    {!provider.lastError && provider.lastSuccess && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Última atividade:{" "}
                          {formatDistanceToNow(new Date(provider.lastSuccess.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar nos eventos..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos providers</SelectItem>
                      {Object.entries(PROVIDER_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                    <SelectTrigger className="w-full md:w-[140px]">
                      <SelectValue placeholder="Nível" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos níveis</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warn">Aviso</SelectItem>
                      <SelectItem value="error">Erro</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-resolved"
                      checked={showResolved}
                      onCheckedChange={setShowResolved}
                    />
                    <Label htmlFor="show-resolved" className="text-sm">
                      Mostrar resolvidos
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Events List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Eventos de Integração
                </CardTitle>
                <CardDescription>
                  {filteredEvents.length} evento(s) encontrado(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p className="text-lg font-medium">Nenhum evento encontrado</p>
                    <p className="text-sm">
                      {showResolved
                        ? "Não há eventos com os filtros selecionados."
                        : "Ótimo! Não há erros ou avisos pendentes."}
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {filteredEvents.map((event) => (
                        <div
                          key={event.id}
                          className={`p-4 rounded-lg border transition-all ${
                            event.resolved
                              ? "opacity-60 bg-muted/30"
                              : event.level === "error"
                              ? "border-destructive/50 bg-destructive/5"
                              : event.level === "warn"
                              ? "border-yellow-500/50 bg-yellow-500/5"
                              : "border-border bg-muted/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {getLevelIcon(event.level)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {event.provider}
                                  </Badge>
                                  <Badge variant="secondary" className="font-mono text-xs">
                                    {event.source}
                                  </Badge>
                                  {getLevelBadge(event.level)}
                                  {event.resolved && (
                                    <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
                                      Resolvido
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium">{event.message}</p>
                                {event.details && (
                                  <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto max-w-full">
                                    {JSON.stringify(event.details, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                                <Clock className="h-3 w-3" />
                                {format(new Date(event.created_at), "dd/MM HH:mm:ss", {
                                  locale: ptBR,
                                })}
                              </div>
                              {!event.resolved && event.level !== "info" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => markResolvedMutation.mutate(event.id)}
                                  disabled={markResolvedMutation.isPending}
                                >
                                  <CheckCheck className="h-3 w-3 mr-1" />
                                  Resolver
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
