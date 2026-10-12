/** Same rules as backend `forms.validate_submission` (email part, shared by every widget). */
export const EMAIL_RE = /^[A-Za-z0-9._%+\-']+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function validateEmail(value: string): 'required' | 'invalid_email' | null {
  const text = value.trim();
  if (!text) return 'required';
  if (text.length > 254 || !EMAIL_RE.test(text)) return 'invalid_email';
  return null;
}
