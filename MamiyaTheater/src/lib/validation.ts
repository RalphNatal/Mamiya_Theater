export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email.trim());

// Loose sanity check: digits with optional spaces/+/-/() separators, 7-15 digits total.
export const MOBILE_NUMBER_REGEX = /^[0-9+\-() ]+$/;

export const isValidMobileNumber = (mobileNumber: string): boolean => {
  const trimmed = mobileNumber.trim();
  if (!trimmed || !MOBILE_NUMBER_REGEX.test(trimmed)) return false;
  const digitCount = trimmed.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15;
};
