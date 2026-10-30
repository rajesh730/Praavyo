// Stub the shared auth config in native Node service integration tests.
// Authentication transport is outside these tests: actors are supplied
// explicitly, and loading the real config would drag in bcrypt and the
// credentials provider for no benefit.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@pravyo/auth') {
    return { url: 'data:text/javascript,export const authOptions = {};', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
