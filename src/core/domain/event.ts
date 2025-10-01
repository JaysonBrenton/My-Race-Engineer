export type EventSourceIdentifiers = {
  eventId: string;
  url: string;
};

export type Event = {
  id: string;
  name: string;
  source: EventSourceIdentifiers;
  createdAt: Date;
  updatedAt: Date;
};
