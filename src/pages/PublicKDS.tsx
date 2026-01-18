import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  ChefHat, 
  CheckCircle, 
  Maximize2, 
  Minimize2,
  RefreshCw,
  Timer,
  AlertTriangle,
  Hand,
  MousePointer2,
  Utensils,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Package,
  User,
  FileText,
  ArrowRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const KDS_THEME_KEY = "kds-theme-mode";
const KDS_SOUND_ENABLED_KEY = "kds-sound-enabled";
const DEFAULT_NOTIFICATION_SOUND = "/sounds/default-notification.mp3";

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
  options: any;
  requires_preparation: boolean;
}

interface KDSOrder {
  id: string;
  created_at: string;
  customer_name: string;
  status: string;
  source: string;
  notes: string | null;
  order_items: OrderItem[];
  table_session_id: string | null;
}

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
}

const statusConfig = {
  pending: { label: "Pendente", color: "bg-yellow-500", textColor: "text-yellow-500", bgLight: "bg-yellow-500/10", icon: Clock },
  confirmed: { label: "Aguardando", color: "bg-blue-500", textColor: "text-blue-500", bgLight: "bg-blue-500/10", icon: Clock },
  preparing: { label: "Preparando", color: "bg-orange-500", textColor: "text-orange-500", bgLight: "bg-orange-500/10", icon: ChefHat },
  ready: { label: "Pronto", color: "bg-green-500", textColor: "text-green-500", bgLight: "bg-green-500/10", icon: CheckCircle },
};

export default function PublicKDS() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [company, setCompany] = useState<Company | null>(null);
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [interactionMode, setInteractionMode] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem(KDS_THEME_KEY);
    return saved ? saved === "dark" : true;
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem(KDS_SOUND_ENABLED_KEY);
    return saved ? saved === "true" : true;
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  // Persist theme to localStorage
  useEffect(() => {
    localStorage.setItem(KDS_THEME_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // Persist sound setting to localStorage
  useEffect(() => {
    localStorage.setItem(KDS_SOUND_ENABLED_KEY, String(soundEnabled));
  }, [soundEnabled]);

  // Play notification sound for new orders
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      
      const audio = new Audio(DEFAULT_NOTIFICATION_SOUND);
      audio.volume = 0.7;
      audioRef.current = audio;
      
      audio.play().catch((err) => {
        console.warn("Could not play notification sound:", err);
      });
    } catch (err) {
      console.warn("Error playing sound:", err);
    }
  }, [soundEnabled]);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Validate token and get company
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError("Token inválido");
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("companies")
          .select("id, name, logo_url")
          .eq("kds_token", token)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (!data) {
          setError("Link do KDS inválido ou expirado");
          setLoading(false);
          return;
        }

        setCompany(data);
      } catch (err) {
        console.error("Error validating KDS token:", err);
        setError("Erro ao validar acesso");
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  // Fetch orders for kitchen display
  const fetchOrders = async () => {
    if (!company?.id) return;

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          created_at,
          customer_name,
          status,
          source,
          notes,
          table_session_id,
          order_items (
            id,
            product_name,
            quantity,
            notes,
            options,
            requires_preparation
          )
        `)
        .eq("company_id", company.id)
        .in("status", ["confirmed", "preparing"])
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      const newOrders = data || [];
      
      // Check for new orders and play sound
      if (!isFirstLoadRef.current && newOrders.length > 0) {
        const previousIds = previousOrderIdsRef.current;
        const hasNewOrder = newOrders.some(order => 
          !previousIds.has(order.id) && order.status === 'confirmed'
        );
        
        if (hasNewOrder) {
          playNotificationSound();
        }
      }
      
      // Update refs
      previousOrderIdsRef.current = new Set(newOrders.map(o => o.id));
      isFirstLoadRef.current = false;
      
      setOrders(newOrders);
      
      // Auto-select first order if none selected
      if (newOrders.length > 0 && !selectedOrderId) {
        setSelectedOrderId(newOrders[0].id);
      }
    } catch (err) {
      console.error("Error fetching KDS orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (company?.id) {
      fetchOrders();
    }
  }, [company?.id]);

  // Real-time subscription
  useEffect(() => {
    if (!company?.id) return;

    const channel = supabase
      .channel("public-kds-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `company_id=eq.${company.id}`,
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company?.id]);

  // Update order status
  const updateOrderStatus = async (orderId: string, newStatus: "preparing" | "ready") => {
    if (!interactionMode) return;
    
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Pedido marcado como ${statusConfig[newStatus]?.label || newStatus}`,
      });

      // If order is no longer in KDS view, select next order
      if (newStatus === "ready") {
        const remainingOrders = orders.filter(o => o.id !== orderId);
        if (remainingOrders.length > 0) {
          setSelectedOrderId(remainingOrders[0].id);
        } else {
          setSelectedOrderId(null);
        }
      }

      fetchOrders();
    } catch (err) {
      console.error("Error updating order status:", err);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status",
        variant: "destructive",
      });
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Calculate time since order
  const getTimeSince = (createdAt: string) => {
    return formatDistanceToNow(new Date(createdAt), { 
      locale: ptBR, 
      addSuffix: false 
    });
  };

  // Check if order is taking too long (> 15 min)
  const isOrderLate = (createdAt: string) => {
    const orderTime = new Date(createdAt).getTime();
    const now = Date.now();
    const diffMinutes = (now - orderTime) / 1000 / 60;
    return diffMinutes > 15;
  };

  // Format options for display - with grouping
  const formatOptions = (options: any): { groupName: string; items: string[] }[] => {
    if (!options) return [];
    const grouped: Record<string, string[]> = {};
    let hasAnyGroupName = false;

    if (Array.isArray(options)) {
      options.forEach((opt: any) => {
        if (opt.groupName && opt.selectedOptions) {
          hasAnyGroupName = true;
          if (!grouped[opt.groupName]) grouped[opt.groupName] = [];
          opt.selectedOptions.forEach((sel: any) => {
            grouped[opt.groupName].push(sel.name);
          });
        } else if (opt.name) {
          const group = opt.groupName || 'Itens';
          if (opt.groupName) hasAnyGroupName = true;
          if (!grouped[group]) grouped[group] = [];
          grouped[group].push(opt.name);
        }
        if (opt.half_half_flavors) {
          hasAnyGroupName = true;
          if (!grouped['Pizza']) grouped['Pizza'] = [];
          grouped['Pizza'].push(`½ ${opt.half_half_flavors.join(" + ½ ")}`);
        }
      });
    }

    const entries = Object.entries(grouped);
    if (!hasAnyGroupName && entries.length === 1 && entries[0][0] === 'Itens') {
      return entries.map(([groupName, items]) => ({ groupName: '', items }));
    }

    return entries.map(([groupName, items]) => ({ groupName, items }));
  };

  const confirmedOrders = orders.filter((o) => o.status === "confirmed");
  const preparingOrders = orders.filter((o) => o.status === "preparing");
  const allQueueOrders = [...confirmedOrders, ...preparingOrders];
  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  if (loading) {
    return (
      <div className={cn(
        "min-h-screen flex items-center justify-center",
        isDarkMode ? "bg-slate-950" : "bg-slate-100"
      )}>
        <RefreshCw className={cn(
          "h-12 w-12 animate-spin",
          isDarkMode ? "text-slate-400" : "text-slate-600"
        )} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        "min-h-screen flex items-center justify-center p-4",
        isDarkMode ? "bg-slate-950" : "bg-slate-100"
      )}>
        <div className={cn(
          "rounded-2xl p-8 text-center max-w-md",
          isDarkMode 
            ? "bg-slate-900 border border-slate-800" 
            : "bg-white border border-slate-200 shadow-lg"
        )}>
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className={cn(
            "text-2xl font-bold mb-2",
            isDarkMode ? "text-white" : "text-slate-900"
          )}>Acesso Negado</h2>
          <p className={isDarkMode ? "text-slate-400" : "text-slate-600"}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen flex flex-col transition-colors duration-300",
      isDarkMode ? "bg-slate-950" : "bg-slate-100"
    )}>
      {/* Header */}
      <header className={cn(
        "border-b px-4 md:px-6 py-3 transition-colors duration-300 shrink-0",
        isDarkMode 
          ? "bg-slate-900 border-slate-800" 
          : "bg-white border-slate-200 shadow-sm"
      )}>
        <div className="flex items-center justify-between">
          {/* Left: Logo & Title */}
          <div className="flex items-center gap-3">
            {company?.logo_url && (
              <img 
                src={company.logo_url} 
                alt={company.name} 
                className={cn(
                  "h-10 w-10 rounded-xl object-cover border-2",
                  isDarkMode ? "border-slate-700" : "border-slate-200"
                )}
              />
            )}
            <div>
              <h1 className={cn(
                "text-xl font-bold flex items-center gap-2",
                isDarkMode ? "text-white" : "text-slate-900"
              )}>
                <ChefHat className="h-6 w-6 text-orange-500" />
                Cozinha
              </h1>
              <p className={cn("text-xs", isDarkMode ? "text-slate-400" : "text-slate-600")}>
                {company?.name}
              </p>
            </div>
          </div>

          {/* Center: Stats */}
          <div className="hidden md:flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg",
              isDarkMode ? "bg-blue-500/20" : "bg-blue-100"
            )}>
              <Clock className={isDarkMode ? "h-4 w-4 text-blue-400" : "h-4 w-4 text-blue-600"} />
              <span className={cn(
                "text-xl font-bold",
                isDarkMode ? "text-blue-400" : "text-blue-600"
              )}>{confirmedOrders.length}</span>
              <span className={cn("text-xs", isDarkMode ? "text-blue-300" : "text-blue-600")}>aguardando</span>
            </div>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg",
              isDarkMode ? "bg-orange-500/20" : "bg-orange-100"
            )}>
              <ChefHat className={isDarkMode ? "h-4 w-4 text-orange-400" : "h-4 w-4 text-orange-600"} />
              <span className={cn(
                "text-xl font-bold",
                isDarkMode ? "text-orange-400" : "text-orange-600"
              )}>{preparingOrders.length}</span>
              <span className={cn("text-xs", isDarkMode ? "text-orange-300" : "text-orange-600")}>preparando</span>
            </div>
            {orders.filter(o => isOrderLate(o.created_at)).length > 0 && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                isDarkMode ? "bg-red-500/20" : "bg-red-100"
              )}>
                <Timer className={isDarkMode ? "h-4 w-4 text-red-400" : "h-4 w-4 text-red-600"} />
                <span className={cn(
                  "text-xl font-bold",
                  isDarkMode ? "text-red-400" : "text-red-600"
                )}>
                  {orders.filter(o => isOrderLate(o.created_at)).length}
                </span>
                <span className={cn("text-xs", isDarkMode ? "text-red-300" : "text-red-600")}>atrasados</span>
              </div>
            )}
          </div>

          {/* Right: Clock & Controls */}
          <div className="flex items-center gap-2">
            <div className="text-right mr-2 hidden sm:block">
              <p className={cn(
                "text-2xl font-mono font-bold",
                isDarkMode ? "text-white" : "text-slate-900"
              )}>
                {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            
            {/* Sound Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(
                "h-9 w-9",
                soundEnabled
                  ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
                  : isDarkMode 
                    ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" 
                    : "border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            
            {/* Theme Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "h-9 w-9",
                isDarkMode 
                  ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" 
                  : "border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            
            {/* Interaction Mode Toggle */}
            <Button
              variant={interactionMode ? "default" : "outline"}
              size="sm"
              onClick={() => setInteractionMode(!interactionMode)}
              className={cn(
                "gap-1 h-9",
                interactionMode 
                  ? "bg-green-600 hover:bg-green-700 text-white" 
                  : isDarkMode
                    ? "border-slate-600 text-slate-400 hover:text-white"
                    : "border-slate-300 text-slate-600 hover:text-slate-900"
              )}
            >
              {interactionMode ? <Hand className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{interactionMode ? "Touch" : "Ver"}</span>
            </Button>

            <Button 
              variant="outline" 
              size="icon" 
              onClick={fetchOrders}
              className={cn(
                "h-9 w-9",
                isDarkMode 
                  ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" 
                  : "border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={toggleFullscreen}
              className={cn(
                "h-9 w-9",
                isDarkMode 
                  ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" 
                  : "border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Stats */}
      <div className={cn(
        "md:hidden flex items-center justify-center gap-4 p-2 border-b shrink-0",
        isDarkMode 
          ? "bg-slate-900/50 border-slate-800" 
          : "bg-white/50 border-slate-200"
      )}>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg",
          isDarkMode ? "bg-blue-500/20" : "bg-blue-100"
        )}>
          <Clock className={isDarkMode ? "h-4 w-4 text-blue-400" : "h-4 w-4 text-blue-600"} />
          <span className={cn(
            "text-lg font-bold",
            isDarkMode ? "text-blue-400" : "text-blue-600"
          )}>{confirmedOrders.length}</span>
        </div>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg",
          isDarkMode ? "bg-orange-500/20" : "bg-orange-100"
        )}>
          <ChefHat className={isDarkMode ? "h-4 w-4 text-orange-400" : "h-4 w-4 text-orange-600"} />
          <span className={cn(
            "text-lg font-bold",
            isDarkMode ? "text-orange-400" : "text-orange-600"
          )}>{preparingOrders.length}</span>
        </div>
      </div>

      {/* Main Content - Queue + Details */}
      <main className="flex-1 p-4 md:p-6 min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Side - Order Queue */}
          <div className={cn(
            "lg:col-span-4 flex flex-col min-h-0 rounded-2xl border overflow-hidden",
            isDarkMode 
              ? "bg-slate-900 border-slate-800" 
              : "bg-white border-slate-200 shadow-sm"
          )}>
            <div className={cn(
              "flex items-center gap-2 p-4 border-b shrink-0",
              isDarkMode ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-slate-50"
            )}>
              <Package className={isDarkMode ? "h-5 w-5 text-blue-400" : "h-5 w-5 text-blue-600"} />
              <h2 className={cn("font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                Fila de Pedidos
              </h2>
              <Badge variant="secondary" className="ml-auto">
                {allQueueOrders.length}
              </Badge>
            </div>
            
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 p-3">
                <AnimatePresence>
                  {allQueueOrders.length === 0 ? (
                    <div className={cn(
                      "text-center py-12",
                      isDarkMode ? "text-slate-500" : "text-slate-400"
                    )}>
                      <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Nenhum pedido na fila</p>
                    </div>
                  ) : (
                    allQueueOrders.map((order, index) => (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                      >
                        <div
                          className={cn(
                            "cursor-pointer transition-all rounded-xl p-3 border-l-4",
                            selectedOrderId === order.id 
                              ? isDarkMode
                                ? "ring-2 ring-blue-500 bg-slate-700"
                                : "ring-2 ring-blue-500 bg-blue-50"
                              : isDarkMode
                                ? "bg-slate-800 hover:bg-slate-700"
                                : "bg-white hover:bg-slate-50",
                            order.status === "confirmed" 
                              ? "border-l-blue-500" 
                              : "border-l-orange-500",
                            isOrderLate(order.created_at) && "border-l-red-500"
                          )}
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "font-mono font-bold text-sm",
                                  isDarkMode ? "text-white" : "text-slate-900"
                                )}>
                                  #{order.id.slice(0, 6).toUpperCase()}
                                </span>
                                {order.table_session_id && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                                    <Utensils className="h-3 w-3 mr-1" />
                                    Mesa
                                  </Badge>
                                )}
                              </div>
                              <p className={cn(
                                "text-sm truncate",
                                isDarkMode ? "text-slate-400" : "text-slate-600"
                              )}>
                                {order.customer_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge 
                                  variant="secondary"
                                  className={cn(
                                    "text-xs px-1.5 py-0",
                                    statusConfig[order.status as keyof typeof statusConfig]?.bgLight,
                                    statusConfig[order.status as keyof typeof statusConfig]?.textColor
                                  )}
                                >
                                  {statusConfig[order.status as keyof typeof statusConfig]?.label}
                                </Badge>
                                <span className={cn(
                                  "text-xs",
                                  isDarkMode ? "text-slate-500" : "text-slate-500"
                                )}>
                                  {order.order_items.filter(i => i.requires_preparation).length} itens
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  isOrderLate(order.created_at)
                                    ? "border-red-500 text-red-500"
                                    : isDarkMode
                                      ? "border-slate-600 text-slate-400"
                                      : "border-slate-300 text-slate-500"
                                )}
                              >
                                <Timer className="h-3 w-3 mr-1" />
                                {getTimeSince(order.created_at)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </div>

          {/* Right Side - Order Details */}
          <div className="lg:col-span-8 flex flex-col min-h-0">
            {selectedOrder ? (
              <motion.div
                key={selectedOrder.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col h-full"
              >
                <div className={cn(
                  "flex-1 flex flex-col rounded-2xl border overflow-hidden",
                  isDarkMode 
                    ? "bg-slate-900 border-slate-800" 
                    : "bg-white border-slate-200 shadow-sm"
                )}>
                  {/* Order Header */}
                  <div className={cn(
                    "p-4 border-b shrink-0",
                    isDarkMode ? "border-slate-800" : "border-slate-200"
                  )}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className={cn(
                            "text-xl font-bold",
                            isDarkMode ? "text-white" : "text-slate-900"
                          )}>
                            Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}
                          </h2>
                          <Badge 
                            className={cn(
                              "text-sm",
                              statusConfig[selectedOrder.status as keyof typeof statusConfig]?.bgLight,
                              statusConfig[selectedOrder.status as keyof typeof statusConfig]?.textColor
                            )}
                          >
                            {statusConfig[selectedOrder.status as keyof typeof statusConfig]?.label}
                          </Badge>
                          {selectedOrder.table_session_id && (
                            <Badge variant="outline">
                              <Utensils className="h-3 w-3 mr-1" />
                              Mesa
                            </Badge>
                          )}
                        </div>
                        <div className={cn(
                          "flex items-center gap-4 mt-2 text-sm",
                          isDarkMode ? "text-slate-400" : "text-slate-600"
                        )}>
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {selectedOrder.customer_name}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {getTimeSince(selectedOrder.created_at)} atrás
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-lg px-3 py-1",
                          isOrderLate(selectedOrder.created_at)
                            ? "border-red-500 text-red-500 bg-red-500/10"
                            : isDarkMode
                              ? "border-slate-600 text-slate-400"
                              : "border-slate-300 text-slate-600"
                        )}
                      >
                        <Timer className="h-4 w-4 mr-2" />
                        {getTimeSince(selectedOrder.created_at)}
                      </Badge>
                    </div>
                  </div>

                  {/* Order Items */}
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4 space-y-4">
                      {selectedOrder.order_items
                        .filter((item) => item.requires_preparation)
                        .map((item, idx) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={cn(
                              "flex gap-4 p-4 rounded-xl border",
                              isDarkMode 
                                ? "bg-slate-800 border-slate-700" 
                                : "bg-slate-50 border-slate-200"
                            )}
                          >
                            <div className={cn(
                              "flex items-center justify-center w-12 h-12 rounded-lg font-bold text-xl shrink-0",
                              isDarkMode 
                                ? "bg-blue-500/20 text-blue-400" 
                                : "bg-blue-100 text-blue-600"
                            )}>
                              {item.quantity}x
                            </div>
                            <div className="flex-1">
                              <h4 className={cn(
                                "font-semibold text-lg",
                                isDarkMode ? "text-white" : "text-slate-900"
                              )}>
                                {item.product_name}
                              </h4>
                              {formatOptions(item.options).map((group, i) => (
                                <div key={i} className={cn(
                                  "text-sm mt-1",
                                  isDarkMode ? "text-slate-400" : "text-slate-600"
                                )}>
                                  {group.groupName ? (
                                    <>
                                      <span className="font-medium">{group.groupName}:</span>{" "}
                                      {group.items.join(', ')}
                                    </>
                                  ) : (
                                    group.items.map((itemName, idx) => (
                                      <span key={idx} className="inline-block mr-2">
                                        • {itemName}
                                      </span>
                                    ))
                                  )}
                                </div>
                              ))}
                              {item.notes && (
                                <div className="mt-2 p-2 rounded bg-amber-500/10 text-amber-600 text-sm flex items-start gap-2">
                                  <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                                  {item.notes}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}

                      {selectedOrder.order_items.filter(i => i.requires_preparation).length === 0 && (
                        <div className={cn(
                          "text-center py-8",
                          isDarkMode ? "text-slate-500" : "text-slate-400"
                        )}>
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-20" />
                          <p>Nenhum item requer preparo</p>
                        </div>
                      )}

                      {selectedOrder.notes && (
                        <div className={cn(
                          "p-3 rounded-lg border",
                          isDarkMode 
                            ? "bg-yellow-500/10 border-yellow-500/20" 
                            : "bg-yellow-50 border-yellow-200"
                        )}>
                          <div className="flex items-start gap-2 text-yellow-600">
                            <FileText className="h-5 w-5 shrink-0" />
                            <div>
                              <p className="font-medium">Observações do pedido:</p>
                              <p className="text-sm">{selectedOrder.notes}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Action Buttons */}
                  {interactionMode && (
                    <div className={cn(
                      "p-4 border-t shrink-0",
                      isDarkMode ? "border-slate-800" : "border-slate-200"
                    )}>
                      {selectedOrder.status === "confirmed" ? (
                        <Button
                          className="w-full h-14 text-lg bg-orange-500 hover:bg-orange-600"
                          onClick={() => updateOrderStatus(selectedOrder.id, "preparing")}
                        >
                          <ChefHat className="h-6 w-6 mr-3" />
                          Iniciar Preparo
                          <ArrowRight className="h-5 w-5 ml-3" />
                        </Button>
                      ) : (
                        <Button
                          className="w-full h-14 text-lg bg-green-600 hover:bg-green-700"
                          onClick={() => updateOrderStatus(selectedOrder.id, "ready")}
                        >
                          <CheckCircle className="h-6 w-6 mr-3" />
                          Marcar como Pronto
                          <ArrowRight className="h-5 w-5 ml-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className={cn(
                "flex-1 flex items-center justify-center rounded-2xl border",
                isDarkMode 
                  ? "bg-slate-900 border-slate-800" 
                  : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className={cn(
                  "text-center",
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                )}>
                  <Package className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg">Selecione um pedido na fila</p>
                  <p className="text-sm">para ver os detalhes e gerenciar</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
