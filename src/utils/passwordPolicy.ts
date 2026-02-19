export const PASSWORD_MIN_LENGTH = 8;

export type PasswordPolicyResult = {
  minLength: boolean;
  hasUppercase: boolean;
  hasDigit: boolean;
};

export const evaluatePasswordPolicy = (value: string): PasswordPolicyResult => ({
  minLength: value.length >= PASSWORD_MIN_LENGTH,
  hasUppercase: /[A-Z]/.test(value),
  hasDigit: /\d/.test(value),
});

export const isPasswordPolicySatisfied = (value: string) => {
  const policy = evaluatePasswordPolicy(value);
  return policy.minLength && policy.hasUppercase && policy.hasDigit;
};
