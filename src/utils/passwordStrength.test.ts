import { describe, it, expect } from "vitest";
import {
  validatePassword,
  generateStrongPassword,
} from "./passwordStrength";

describe("passwordStrength utility", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const res = validatePassword("Ab1!xyz");
    expect(res.isValid).toBe(false);
    expect(res.rules.minLength).toBe(false);
  });

  it("rejects passwords missing uppercase", () => {
    const res = validatePassword("password123!");
    expect(res.isValid).toBe(false);
    expect(res.rules.hasUppercase).toBe(false);
  });

  it("rejects passwords missing lowercase", () => {
    const res = validatePassword("PASSWORD123!");
    expect(res.isValid).toBe(false);
    expect(res.rules.hasLowercase).toBe(false);
  });

  it("rejects passwords missing numbers", () => {
    const res = validatePassword("Password!@#");
    expect(res.isValid).toBe(false);
    expect(res.rules.hasNumber).toBe(false);
  });

  it("rejects passwords missing special characters", () => {
    const res = validatePassword("Password123");
    expect(res.isValid).toBe(false);
    expect(res.rules.hasSpecial).toBe(false);
  });

  it("accepts passwords fulfilling all rules", () => {
    const res = validatePassword("Password123!");
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.rules.minLength).toBe(true);
    expect(res.rules.hasUppercase).toBe(true);
    expect(res.rules.hasLowercase).toBe(true);
    expect(res.rules.hasNumber).toBe(true);
    expect(res.rules.hasSpecial).toBe(true);
  });

  it("generates passwords that strictly satisfy all strength rules", () => {
    for (let i = 0; i < 50; i++) {
      const generated = generateStrongPassword(16);
      expect(generated.length).toBe(16);
      const res = validatePassword(generated);
      expect(res.isValid).toBe(true);
    }
  });
});
