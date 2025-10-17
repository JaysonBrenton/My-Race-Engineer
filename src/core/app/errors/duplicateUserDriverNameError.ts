export class DuplicateUserDriverNameError extends Error {
  constructor(public readonly driverName: string) {
    super(`A user with driver name ${driverName} already exists.`);
    this.name = 'DuplicateUserDriverNameError';
  }
}
