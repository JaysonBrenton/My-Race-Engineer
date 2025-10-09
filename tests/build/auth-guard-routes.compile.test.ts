import test from 'node:test';

// These imports will throw at evaluation time if the route modules contain any
// disallowed exports or invalid top-level directives.  Keeping the smoke test
// ensures the build catches regressions when guard files drift.
test('auth guard routes compile without invalid exports', async () => {
  await Promise.all([
    import('../../src/app/(auth)/auth/register/(guard)/route'),
    import('../../src/app/(auth)/auth/login/(guard)/route'),
  ]);
});
