const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateEmail(email) {
  return EMAIL_PATTERN.test(email);
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}
