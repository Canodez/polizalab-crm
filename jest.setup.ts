import '@testing-library/jest-dom';

// Mock ResizeObserver for Headless UI
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
