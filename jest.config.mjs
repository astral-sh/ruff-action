import { createDefaultEsmPreset } from "ts-jest";

const preset = createDefaultEsmPreset();

/** @type {import('jest').Config} */
export default {
  ...preset,
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  moduleFileExtensions: ["ts", "js", "mjs"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
};
