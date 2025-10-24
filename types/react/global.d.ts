import type * as ReactTypes from 'react';

declare global {
  namespace React {
    // Re-export commonly used React types so Next.js generated types can resolve them
    type ReactNode = ReactTypes.ReactNode;
    type ComponentType<P = Record<string, unknown>> = ReactTypes.ComponentType<P>;
  }
}

export {};
