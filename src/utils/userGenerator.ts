/**
 * Bỏ dấu tiếng Việt để tạo username ASCII.
 */
export const removeVietnameseTones = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

/**
 * Tạo username từ họ tên: Tên + chữ cái đầu các từ còn lại + 4 số ngẫu nhiên.
 * Ví dụ: "Nguyễn quốc Khánh" → "KhanhNQ1234"
 */
export const generateUsername = (fullName: string, existingUsernames: string[] = []): string => {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error('Họ tên không hợp lệ');
  }

  const givenName = parts[parts.length - 1];
  const familyInitials = parts
    .slice(0, -1)
    .map((part) => removeVietnameseTones(part).charAt(0).toUpperCase())
    .join('');

  const givenNameAscii =
    removeVietnameseTones(givenName).charAt(0).toUpperCase() +
    removeVietnameseTones(givenName).slice(1).toLowerCase();

  const base = `${givenNameAscii}${familyInitials}`;
  const existing = new Set(existingUsernames.map((u) => u.toLowerCase()));

  for (let attempt = 0; attempt < 100; attempt++) {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const username = `${base}${digits}`;
    if (!existing.has(username.toLowerCase())) {
      return username;
    }
  }

  const fallbackDigits = String(Date.now()).slice(-4);
  return `${base}${fallbackDigits}`;
};

const PASSWORD_CHARS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghjkmnpqrstuvwxyz',
  digits: '23456789',
  special: '@#$!',
};

/**
 * Tạo mật khẩu ngẫu nhiên 12 ký tự (chữ hoa, thường, số, ký tự đặc biệt).
 */
export const generatePassword = (length = 12): string => {
  const allChars = Object.values(PASSWORD_CHARS).join('');
  const required = [
    PASSWORD_CHARS.upper[Math.floor(Math.random() * PASSWORD_CHARS.upper.length)],
    PASSWORD_CHARS.lower[Math.floor(Math.random() * PASSWORD_CHARS.lower.length)],
    PASSWORD_CHARS.digits[Math.floor(Math.random() * PASSWORD_CHARS.digits.length)],
    PASSWORD_CHARS.special[Math.floor(Math.random() * PASSWORD_CHARS.special.length)],
  ];

  const remaining = Array.from({ length: length - required.length }, () =>
    allChars.charAt(Math.floor(Math.random() * allChars.length)),
  );

  const password = [...required, ...remaining];
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
};
