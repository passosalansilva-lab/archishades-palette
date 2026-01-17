-- Tabela de categorias do portal
CREATE TABLE IF NOT EXISTS public.portal_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- nome do ícone lucide
  color TEXT DEFAULT '#6366f1', -- cor em hex
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir categorias padrão
INSERT INTO public.portal_categories (name, slug, description, icon, color, sort_order) VALUES
  ('Novidades', 'novidades', 'Novas funcionalidades e recursos', 'Sparkles', '#22c55e', 1),
  ('Dicas', 'dicas', 'Dicas para melhorar seu negócio', 'Lightbulb', '#f59e0b', 2),
  ('Tutoriais', 'tutoriais', 'Passo a passo de como usar', 'GraduationCap', '#3b82f6', 3),
  ('Atualizações', 'atualizacoes', 'Correções e melhorias do sistema', 'RefreshCw', '#8b5cf6', 4),
  ('Promoções', 'promocoes', 'Ofertas especiais para lojistas', 'Percent', '#ef4444', 5)
ON CONFLICT (slug) DO NOTHING;

-- Adicionar coluna category_id na tabela de posts
ALTER TABLE public.portal_posts
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.portal_categories(id) ON DELETE SET NULL;

-- Índice para busca por categoria
CREATE INDEX IF NOT EXISTS idx_portal_posts_category ON public.portal_posts(category_id);

-- Enable RLS na tabela de categorias
ALTER TABLE public.portal_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can view active categories" ON public.portal_categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.portal_categories;

-- RLS: todos autenticados podem ver categorias ativas
CREATE POLICY "Anyone can view active categories"
ON public.portal_categories FOR SELECT
TO authenticated
USING (is_active = true);

-- RLS: apenas admins podem gerenciar categorias
CREATE POLICY "Admins can manage categories"
ON public.portal_categories FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Tabela de posts do portal (gerenciado pelo admin)
CREATE TABLE IF NOT EXISTS public.portal_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  video_url TEXT, -- link do YouTube ou URL pública do vídeo
  video_type TEXT CHECK (video_type IN ('youtube', 'upload', NULL)),
  image_url TEXT,
  is_published BOOLEAN DEFAULT true,
  pinned BOOLEAN DEFAULT false, -- para destacar no topo
  category_id UUID REFERENCES public.portal_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_portal_posts_published ON public.portal_posts(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_posts_pinned ON public.portal_posts(pinned DESC, created_at DESC);

-- Tabela de reações (curtidas) nos posts
CREATE TABLE IF NOT EXISTS public.portal_post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.portal_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT DEFAULT 'like' CHECK (reaction_type IN ('like', 'love', 'celebrate')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_reactions_post ON public.portal_post_reactions(post_id);

-- Tabela de comentários nos posts
CREATE TABLE IF NOT EXISTS public.portal_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.portal_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_comments_post ON public.portal_post_comments(post_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.portal_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_post_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies para portal_posts
-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can view published posts" ON public.portal_posts;
DROP POLICY IF EXISTS "Admins can manage posts" ON public.portal_posts;

-- Todos autenticados podem ver posts publicados
CREATE POLICY "Anyone can view published posts"
ON public.portal_posts FOR SELECT
TO authenticated
USING (is_published = true);

-- Apenas admins podem inserir/atualizar/deletar
CREATE POLICY "Admins can manage posts"
ON public.portal_posts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies para portal_post_reactions
-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.portal_post_reactions;
DROP POLICY IF EXISTS "Users can manage own reactions" ON public.portal_post_reactions;

-- Todos autenticados podem ver reações
CREATE POLICY "Anyone can view reactions"
ON public.portal_post_reactions FOR SELECT
TO authenticated
USING (true);

-- Usuários podem adicionar/remover suas próprias reações
CREATE POLICY "Users can manage own reactions"
ON public.portal_post_reactions FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS Policies para portal_post_comments
-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can view comments" ON public.portal_post_comments;
DROP POLICY IF EXISTS "Users can insert own comments" ON public.portal_post_comments;
DROP POLICY IF EXISTS "Users can manage own comments" ON public.portal_post_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.portal_post_comments;
DROP POLICY IF EXISTS "Admins can delete any comment" ON public.portal_post_comments;

-- Todos autenticados podem ver comentários
CREATE POLICY "Anyone can view comments"
ON public.portal_post_comments FOR SELECT
TO authenticated
USING (true);

-- Usuários podem adicionar seus próprios comentários
CREATE POLICY "Users can insert own comments"
ON public.portal_post_comments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Usuários podem atualizar/deletar seus próprios comentários
CREATE POLICY "Users can manage own comments"
ON public.portal_post_comments FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
ON public.portal_post_comments FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Admins podem deletar qualquer comentário
CREATE POLICY "Admins can delete any comment"
ON public.portal_post_comments FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Bucket para vídeos do portal
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('portal-videos', 'portal-videos', true, 524288000) -- 500MB limit
ON CONFLICT (id) DO NOTHING;

-- Storage policies para portal-videos
-- Drop existing storage policies first (using unique names)
DROP POLICY IF EXISTS "portal_videos_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "portal_videos_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "portal_videos_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "portal_videos_delete_policy" ON storage.objects;
-- Also drop old policy names if they exist
DROP POLICY IF EXISTS "Anyone can view portal videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload portal videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update portal videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete portal videos" ON storage.objects;

CREATE POLICY "portal_videos_select_policy"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'portal-videos');

CREATE POLICY "portal_videos_insert_policy"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'portal-videos' 
  AND public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "portal_videos_update_policy"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'portal-videos' 
  AND public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "portal_videos_delete_policy"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'portal-videos' 
  AND public.has_role(auth.uid(), 'super_admin')
);

-- Função para notificar lojistas quando um post é publicado
CREATE OR REPLACE FUNCTION public.notify_portal_post()
RETURNS TRIGGER AS $$
DECLARE
  owner_record RECORD;
BEGIN
  -- Só notifica se o post está sendo publicado (is_published = true)
  -- E é uma inserção ou o status mudou de não publicado para publicado
  IF NEW.is_published = true AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_published = false)) THEN
    -- Buscar todos os donos de empresa
    FOR owner_record IN 
      SELECT DISTINCT owner_id 
      FROM public.companies 
      WHERE status = 'approved' AND owner_id IS NOT NULL
    LOOP
      -- Inserir notificação para cada lojista
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        owner_record.owner_id,
        '📢 Nova publicação no Portal',
        NEW.title,
        'info',
        '/dashboard/portal'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para notificar quando post é publicado
DROP TRIGGER IF EXISTS trigger_notify_portal_post ON public.portal_posts;
CREATE TRIGGER trigger_notify_portal_post
  AFTER INSERT OR UPDATE ON public.portal_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_portal_post();
