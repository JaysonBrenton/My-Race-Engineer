import type { UserEmailVerificationTokenRepository } from './userEmailVerificationTokenRepository';
import type { UserRepository } from './userRepository';
import type { UserSessionRepository } from './userSessionRepository';

export type RegistrationPersistencePorts = {
  userRepository: UserRepository;
  userSessionRepository: UserSessionRepository;
  emailVerificationTokens: UserEmailVerificationTokenRepository;
};

export interface RegistrationUnitOfWork {
  run<T>(work: (ports: RegistrationPersistencePorts) => Promise<T>): Promise<T>;
}
