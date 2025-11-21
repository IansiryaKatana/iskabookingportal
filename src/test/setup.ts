import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
import.meta.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-key';

