CREATE TABLE public.movies (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        poster_url TEXT,
        duration_minutes INTEGER,
        genre TEXT,
        status TEXT DEFAULT 'upcoming',
        created_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Movies are viewable by everyone" 
        ON public.movies FOR SELECT USING ( true );