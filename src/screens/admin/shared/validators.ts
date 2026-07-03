// Field validators shared by the showtime + movie/production forms.
export const validateMovieField = (movieId: string): string | null => {
  if (!movieId) return 'Please select a movie.';
  return null;
};
export const validateStartFields = (dateStr: string, timeStr: string): string | null => {
  if (!dateStr || !timeStr) return 'Date and time are both required.';
  const ms = new Date(`${dateStr}T${timeStr}`).getTime();
  if (Number.isNaN(ms)) return 'Please enter a valid date & time.';
  if (ms <= Date.now()) return 'Start time must be in the future.';
  return null;
};
export const validatePriceField = (value: string): string | null => {
  if (!value.trim()) return 'Price is required.';
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 'Price must be a number 0 or greater.';
  return null;
};
export const validateSeatsField = (value: string): string | null => {
  if (!value.trim()) return 'Available seats is required.';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 'Seats must be a whole number 0 or greater.';
  return null;
};
export const validateDefaultShowtimeField = (value: string): string | null => {
  if (!value.trim()) return 'A daily showtime is required to schedule the run.';
  return null;
};

// ── MOVIE FORM VALIDATION ──────────────────────────────
export const validateMovieTitleField = (value: string): string | null => {
  if (!value.trim()) return 'Title is required.';
  return null;
};
export const validateMovieDurationField = (value: string): string | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return 'Duration must be a whole number of minutes greater than 0.';
  return null;
};
export const validateRunDateField = (value: string, label: string): string | null => {
  if (!value.trim()) return null;
  if (Number.isNaN(new Date(value).getTime())) return `Please enter a valid ${label}.`;
  return null;
};
export const validateRunDates = (opening: string, closing: string): string | null => {
  if (!opening.trim() || !closing.trim()) return null;
  if (new Date(closing).getTime() < new Date(opening).getTime()) {
    return 'Closing night cannot be before opening night.';
  }
  return null;
};
export const validateIntermissionField = (value: string): string | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 'Intermission must be a whole number of minutes 0 or greater.';
  return null;
};
// Seating capacity caps total tickets sold across every showtime of the show,
// so it must be a whole number of at least 1 (never negative or zero).
export const validateCapacityField = (value: string): string | null => {
  if (!value.trim()) return 'Seating capacity is required.';
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return 'Capacity must be a whole number greater than 0.';
  return null;
};
export const MAX_MOVIE_IMAGE_BYTES = 5 * 1024 * 1024;
export const validateMovieImageFile = (file: any): string | null => {
  if (!file.type || !file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.size > MAX_MOVIE_IMAGE_BYTES) return 'Image must be 5 MB or smaller.';
  return null;
};
