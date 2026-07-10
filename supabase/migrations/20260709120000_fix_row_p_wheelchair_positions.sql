UPDATE public.venue_seats
SET col_number = split_part(seat_identifier, '-', 2)::int + 2
WHERE row_label = 'P' AND is_accessible = false;

-- 2. Pin the four wheelchair spaces to the row ends.
UPDATE public.venue_seats SET col_number = 1  WHERE seat_identifier = 'P-WC1';
UPDATE public.venue_seats SET col_number = 2  WHERE seat_identifier = 'P-WC2';
UPDATE public.venue_seats SET col_number = 33 WHERE seat_identifier = 'P-WC3';
UPDATE public.venue_seats SET col_number = 34 WHERE seat_identifier = 'P-WC4';

-- 3. Assert Row P is now 34 contiguous positions, 2 accessible at each end.
DO $$
DECLARE
  v_min int; v_max int; v_count int; v_distinct int;
  v_left_acc int; v_right_acc int;
BEGIN
  SELECT min(col_number), max(col_number), count(*), count(DISTINCT col_number)
    INTO v_min, v_max, v_count, v_distinct
    FROM public.venue_seats WHERE row_label = 'P';
  SELECT count(*) FILTER (WHERE col_number IN (1,2)   AND is_accessible),
         count(*) FILTER (WHERE col_number IN (33,34) AND is_accessible)
    INTO v_left_acc, v_right_acc
    FROM public.venue_seats WHERE row_label = 'P';
  IF v_count <> 34 OR v_distinct <> 34 OR v_min <> 1 OR v_max <> 34
     OR v_left_acc <> 2 OR v_right_acc <> 2 THEN
    RAISE EXCEPTION
      'Row P reposition failed: count=%, distinct=%, min=%, max=%, left_acc=%, right_acc=% (expected 34/34/1/34/2/2)',
      v_count, v_distinct, v_min, v_max, v_left_acc, v_right_acc;
  END IF;
END $$;

-- 4. Refresh PostgREST.
NOTIFY pgrst, 'reload schema';
