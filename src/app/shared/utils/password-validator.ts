import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export interface PasswordComplexityRequirements {
  readonly hasMinLength: boolean;
  readonly hasUpperCase: boolean;
  readonly hasLowerCase: boolean;
  readonly hasNumber: boolean;
  readonly hasSpecialChar: boolean;
  readonly isValid: boolean;
}

export function checkPasswordComplexity(password: string): PasswordComplexityRequirements {
  const val = password || '';
  const hasMinLength = val.length >= 8;
  const hasUpperCase = /[A-Z]/.test(val);
  const hasLowerCase = /[a-z]/.test(val);
  const hasNumber = /[0-9]/.test(val);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-+=~/[\]\\;']/.test(val);
  const isValid = hasMinLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;

  return {
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecialChar,
    isValid,
  };
}

export function passwordComplexityValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) return null;
    const req = checkPasswordComplexity(value);
    return req.isValid ? null : { passwordComplexity: req };
  };
}

