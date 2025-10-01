export type EntrantSourceIdentifiers = {
  entrantId?: string | null;
  transponderId?: string | null;
};

export type Entrant = {
  id: string;
  eventId: string;
  raceClassId: string;
  sessionId: string;
  displayName: string;
  carNumber?: string | null;
  source: EntrantSourceIdentifiers;
  createdAt: Date;
  updatedAt: Date;
};
