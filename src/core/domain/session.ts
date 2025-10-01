export type SessionSourceIdentifiers = {
  sessionId: string;
  url: string;
};

export type Session = {
  id: string;
  eventId: string;
  raceClassId: string;
  name: string;
  source: SessionSourceIdentifiers;
  scheduledStart?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
