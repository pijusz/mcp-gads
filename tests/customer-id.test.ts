import { describe, expect, test } from "bun:test";
import { formatCustomerId } from "../src/utils/customer-id";

describe("formatCustomerId", () => {
  test("strips dashes", () => {
    expect(formatCustomerId("123-456-7890")).toBe("1234567890");
  });

  test("pads short IDs", () => {
    expect(formatCustomerId("123")).toBe("0000000123");
  });

  test("handles numbers", () => {
    expect(formatCustomerId(1234567890)).toBe("1234567890");
  });

  test("strips quotes and braces", () => {
    expect(formatCustomerId('"123-456-7890"')).toBe("1234567890");
  });

  test("passes through 10 digits unchanged", () => {
    expect(formatCustomerId("9876543210")).toBe("9876543210");
  });
});
