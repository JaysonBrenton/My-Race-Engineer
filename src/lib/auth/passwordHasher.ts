import argon2 from 'argon2';

import type { PasswordHasher } from '@core/app';

const ARGON2_CONFIG: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plainText: string): Promise<string> {
    return argon2.hash(plainText, ARGON2_CONFIG);
  }

  async verify(hash: string, plainText: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainText, ARGON2_CONFIG);
    } catch {
      return false;
    }
  }
}
