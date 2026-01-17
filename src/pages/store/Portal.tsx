import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Newspaper,
  Heart,
  MessageCircle,
  Send,
  Pin,
  Video,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Search,
  Filter,
  Sparkles,
  Lightbulb,
  GraduationCap,
  RefreshCw,
  Percent,
  Tag,
  Play,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

interface PortalCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  company_name?: string;
}

interface PortalPost {
  id: string;
  title: string;
  content: string | null;
  video_url: string | null;
  video_type: "youtube" | "upload" | null;
  image_url: string | null;
  pinned: boolean;
  category_id: string | null;
  created_at: string;
  reaction_count: number;
  comment_count: number;
  user_reacted: boolean;
  comments?: Comment[];
  category?: PortalCategory;
}

const categoryIcons: Record<string, any> = {
  Sparkles,
  Lightbulb,
  GraduationCap,
  RefreshCw,
  Percent,
  Tag,
};

export default function Portal() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PortalPost[]>([]);
  const [categories, setCategories] = useState<PortalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Fetch categories
      const { data: categoriesData } = await (supabase as any)
        .from("portal_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      setCategories(categoriesData || []);

      // Fetch published posts with category
      const { data: postsData, error: postsError } = await (supabase as any)
        .from("portal_posts")
        .select("*, category:portal_categories(*)")
        .eq("is_published", true)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (postsError) throw postsError;

      // Get counts and user reactions for each post
      const postsWithDetails = await Promise.all(
        (postsData || []).map(async (post: any) => {
          const [
            { count: reactionCount },
            { count: commentCount },
            { data: userReaction },
          ] = await Promise.all([
            (supabase as any)
              .from("portal_post_reactions")
              .select("*", { count: "exact", head: true })
              .eq("post_id", post.id),
            (supabase as any)
              .from("portal_post_comments")
              .select("*", { count: "exact", head: true })
              .eq("post_id", post.id),
            (supabase as any)
              .from("portal_post_reactions")
              .select("id")
              .eq("post_id", post.id)
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);

          return {
            ...post,
            reaction_count: reactionCount || 0,
            comment_count: commentCount || 0,
            user_reacted: !!userReaction,
          };
        })
      );

      setPosts(postsWithDetails);
    } catch (error: any) {
      console.error("Error fetching posts:", error);
      toast.error("Erro ao carregar novidades");
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesCategory = !selectedCategory || post.category_id === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.content?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [posts, selectedCategory, searchQuery]);

  const pinnedPosts = useMemo(() => filteredPosts.filter((p) => p.pinned), [filteredPosts]);
  const regularPosts = useMemo(() => filteredPosts.filter((p) => !p.pinned), [filteredPosts]);

  const toggleReaction = async (postId: string) => {
    if (!user?.id) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              user_reacted: !p.user_reacted,
              reaction_count: p.user_reacted ? p.reaction_count - 1 : p.reaction_count + 1,
            }
          : p
      )
    );

    try {
      if (post.user_reacted) {
        await (supabase as any)
          .from("portal_post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);
      } else {
        await (supabase as any)
          .from("portal_post_reactions")
          .insert({ post_id: postId, user_id: user.id });
      }
    } catch (error: any) {
      console.error("Error toggling reaction:", error);
      // Revert on error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                user_reacted: post.user_reacted,
                reaction_count: post.reaction_count,
              }
            : p
        )
      );
    }
  };

  const toggleComments = async (postId: string) => {
    const isExpanded = expandedComments.has(postId);

    if (isExpanded) {
      setExpandedComments((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    } else {
      setExpandedComments((prev) => new Set(prev).add(postId));
      await loadComments(postId);
    }
  };

  const loadComments = async (postId: string) => {
    setLoadingComments((prev) => new Set(prev).add(postId));

    try {
      const { data: comments, error } = await (supabase as any)
        .from("portal_post_comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Get user info for comments
      const commentsWithUserInfo = await Promise.all(
        (comments || []).map(async (comment: Comment) => {
          const { data: company } = await supabase
            .from("companies")
            .select("name")
            .eq("owner_id", comment.user_id)
            .maybeSingle();

          return {
            ...comment,
            company_name: company?.name || "Usuário",
          };
        })
      );

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: commentsWithUserInfo } : p
        )
      );
    } catch (error: any) {
      console.error("Error loading comments:", error);
    } finally {
      setLoadingComments((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  const submitComment = async (postId: string) => {
    if (!user?.id) return;

    const content = newComment[postId]?.trim();
    if (!content) return;

    setSubmittingComment(postId);
    try {
      const { error } = await (supabase as any)
        .from("portal_post_comments")
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
        });

      if (error) throw error;

      setNewComment((prev) => ({ ...prev, [postId]: "" }));

      // Update comment count
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
        )
      );

      // Reload comments
      await loadComments(postId);
      toast.success("Comentário enviado!");
    } catch (error: any) {
      console.error("Error submitting comment:", error);
      toast.error("Erro ao enviar comentário");
    } finally {
      setSubmittingComment(null);
    }
  };

  const deleteComment = async (postId: string, commentId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("portal_post_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      // Update local state
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                comment_count: p.comment_count - 1,
                comments: p.comments?.filter((c) => c.id !== commentId),
              }
            : p
        )
      );
      toast.success("Comentário excluído");
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      toast.error("Erro ao excluir comentário");
    }
  };

  const extractYoutubeId = (url: string) => {
    const match = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    return match ? match[1] : null;
  };

  const getCategoryIcon = (iconName: string | null) => {
    return categoryIcons[iconName || "Tag"] || Tag;
  };

  const PostCard = ({ post, featured = false }: { post: PortalPost; featured?: boolean }) => {
    const CategoryIcon = post.category ? getCategoryIcon(post.category.icon) : null;
    const isCommentsExpanded = expandedComments.has(post.id);
    const isVideoPlaying = playingVideo === post.id;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <Card className={`overflow-hidden group ${featured ? "border-primary/30 bg-primary/5" : ""}`}>
          {/* Media Section */}
          {(post.image_url || post.video_url) && (
            <div className="relative aspect-video overflow-hidden bg-muted">
              {post.video_url && post.video_type === "youtube" && (
                <>
                  {isVideoPlaying ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYoutubeId(post.video_url)}?autoplay=1`}
                      className="w-full h-full"
                      allowFullScreen
                      allow="autoplay"
                    />
                  ) : (
                    <>
                      <img
                        src={post.image_url || `https://img.youtube.com/vi/${extractYoutubeId(post.video_url)}/maxresdefault.jpg`}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <button
                        onClick={() => setPlayingVideo(post.id)}
                        className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                      >
                        <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                          <Play className="h-8 w-8 text-primary ml-1" fill="currentColor" />
                        </div>
                      </button>
                    </>
                  )}
                </>
              )}

              {post.video_url && post.video_type === "upload" && (
                <video
                  src={post.video_url}
                  controls
                  poster={post.image_url || undefined}
                  className="w-full h-full object-cover"
                />
              )}

              {post.image_url && !post.video_url && (
                <img
                  src={post.image_url}
                  alt={post.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}

              {/* Badges overlay */}
              <div className="absolute top-3 left-3 flex gap-2">
                {post.pinned && (
                  <Badge className="bg-primary text-primary-foreground shadow-lg gap-1">
                    <Pin className="h-3 w-3" />
                    Destaque
                  </Badge>
                )}
                {post.category && CategoryIcon && (
                  <Badge
                    className="shadow-lg gap-1"
                    style={{
                      backgroundColor: post.category.color,
                      color: "white",
                    }}
                  >
                    <CategoryIcon className="h-3 w-3" />
                    {post.category.name}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <CardContent className={`${post.image_url || post.video_url ? "pt-4" : "pt-6"} space-y-3`}>
            {/* Category badge if no media */}
            {!post.image_url && !post.video_url && post.category && CategoryIcon && (
              <div className="flex items-center gap-2">
                {post.pinned && (
                  <Badge variant="secondary" className="gap-1">
                    <Pin className="h-3 w-3" />
                    Destaque
                  </Badge>
                )}
                <Badge
                  variant="secondary"
                  className="gap-1"
                  style={{
                    backgroundColor: `${post.category.color}20`,
                    color: post.category.color,
                    borderColor: `${post.category.color}40`,
                  }}
                >
                  <CategoryIcon className="h-3 w-3" />
                  {post.category.name}
                </Badge>
              </div>
            )}

            {/* Title */}
            <h3 className={`font-bold leading-tight ${featured ? "text-2xl" : "text-xl"}`}>
              {post.title}
            </h3>

            {/* Date */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(post.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </div>

            {/* Content */}
            {post.content && (
              <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4">
                {post.content}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-4 pt-0 pb-4">
            {/* Actions */}
            <div className="flex items-center gap-2 pt-3 border-t">
              <Button
                variant={post.user_reacted ? "default" : "ghost"}
                size="sm"
                onClick={() => toggleReaction(post.id)}
                className={`gap-2 ${post.user_reacted ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
              >
                <Heart
                  className={`h-4 w-4 ${post.user_reacted ? "fill-current" : ""}`}
                />
                {post.reaction_count}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleComments(post.id)}
                className="gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                {post.comment_count}
                {isCommentsExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Comments Section */}
            <AnimatePresence>
              {isCommentsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* New Comment Input */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Escreva um comentário..."
                      value={newComment[post.id] || ""}
                      onChange={(e) =>
                        setNewComment((prev) => ({
                          ...prev,
                          [post.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      className="flex-1 resize-none"
                    />
                    <Button
                      onClick={() => submitComment(post.id)}
                      disabled={!newComment[post.id]?.trim() || submittingComment === post.id}
                      size="icon"
                      className="shrink-0"
                    >
                      {submittingComment === post.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Comments List */}
                  {loadingComments.has(post.id) ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {post.comments?.map((comment) => (
                        <div
                          key={comment.id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {(comment.company_name || "U").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm truncate">
                                {comment.company_name}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(comment.created_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </span>
                                {comment.user_id === user?.id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => deleteComment(post.id, comment.id)}
                                  >
                                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {comment.content}
                            </p>
                          </div>
                        </div>
                      ))}
                      {post.comments?.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-4">
                          Nenhum comentário ainda. Seja o primeiro!
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardFooter>
        </Card>
      </motion.div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Newspaper className="h-8 w-8 text-primary" />
              Portal de Novidades
            </h1>
            <p className="text-muted-foreground mt-1">
              Fique por dentro das últimas atualizações e novidades do Cardápio On
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar novidades..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Category Filter */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="shrink-0"
            >
              <Filter className="h-4 w-4 mr-2" />
              Todas
            </Button>
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.icon);
              const isSelected = selectedCategory === category.id;
              return (
                <Button
                  key={category.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(isSelected ? null : category.id)}
                  className="shrink-0 gap-2"
                  style={
                    isSelected
                      ? { backgroundColor: category.color, borderColor: category.color }
                      : { borderColor: `${category.color}40`, color: category.color }
                  }
                >
                  <Icon className="h-4 w-4" />
                  {category.name}
                </Button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {searchQuery || selectedCategory
                  ? "Nenhuma novidade encontrada com os filtros selecionados."
                  : "Nenhuma novidade por enquanto. Volte em breve!"}
              </p>
              {(searchQuery || selectedCategory) && (
                <Button
                  variant="link"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory(null);
                  }}
                  className="mt-2"
                >
                  Limpar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Pinned/Featured Posts */}
            {pinnedPosts.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Pin className="h-5 w-5 text-primary" />
                  Destaques
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  {pinnedPosts.map((post) => (
                    <PostCard key={post.id} post={post} featured />
                  ))}
                </div>
              </div>
            )}

            {/* Regular Posts */}
            {regularPosts.length > 0 && (
              <div className="space-y-4">
                {pinnedPosts.length > 0 && (
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Newspaper className="h-5 w-5 text-muted-foreground" />
                    Todas as Novidades
                  </h2>
                )}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {regularPosts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
