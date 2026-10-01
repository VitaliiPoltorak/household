import { defineConfig } from 'vitest/config';

// Pure-logic tests only (src/lib): anything importing react-native or Expo
// modules needs a native runtime and is out of scope here.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
