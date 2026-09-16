export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  rules: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export const PASSWORD_REQUIREMENTS_SUMMARY =
  "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.";

export function validatePassword(password: string): PasswordValidationResult {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const errors: string[] = [];
  if (!minLength) errors.push("At least 8 characters long");
  if (!hasUppercase) errors.push("At least one uppercase letter (A-Z)");
  if (!hasLowercase) errors.push("At least one lowercase letter (a-z)");
  if (!hasNumber) errors.push("At least one number (0-9)");
  if (!hasSpecial) errors.push("At least one special character (e.g. !@#$%^&*)");

  return {
    isValid: minLength && hasUppercase && hasLowercase && hasNumber && hasSpecial,
    errors,
    rules: {
      minLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      hasSpecial,
    },
  };
}

/**
 * Generates a high-entropy password guaranteed to meet all strength criteria:
 * - 16 characters
 * - Uppercase, lowercase, digits, and special characters
 */
export function generateStrongPassword(length = 16): string {
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const specials = "!@#$%^&*()_+~=";
  const all = uppers + lowers + digits + specials;

  // Ensure at least one from each required pool
  const getRandom = (chars: string) => {
    const bytes = crypto.getRandomValues(new Uint8Array(1));
    return chars[bytes[0] % chars.length];
  };

  const initial = [
    getRandom(uppers),
    getRandom(lowers),
    getRandom(digits),
    getRandom(specials),
  ];

  const remainingLength = Math.max(0, length - initial.length);
  const randomBytes = crypto.getRandomValues(new Uint8Array(remainingLength));
  for (let i = 0; i < remainingLength; i++) {
    initial.push(all[randomBytes[i] % all.length]);
  }

  // Shuffle using Fisher-Yates with crypto random values
  for (let i = initial.length - 1; i > 0; i--) {
    const randomByte = crypto.getRandomValues(new Uint8Array(1))[0];
    const j = randomByte % (i + 1);
    [initial[i], initial[j]] = [initial[j], initial[i]];
  }

  return initial.join("");
}
