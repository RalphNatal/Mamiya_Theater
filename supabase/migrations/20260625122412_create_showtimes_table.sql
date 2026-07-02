CREATE TABLE public.showtimes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        movie_id UUID REFERENCES public.movies(id) ON DELETE CASCADE,
        start_time TIMESTAMPTZ NOT NULL,
        price NUMERIC NOT NULL,
        available_seats INTEGER DEFAULT 100,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE public.showtimes ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Showtimes are viewable by everyone" 
        ON public.showtimes FOR SELECT USING ( true );