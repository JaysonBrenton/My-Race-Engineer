export type LiveRcEntryListEntry = {
  entryId: string;
  displayName: string;
  carNumber?: string | null;
  withdrawn?: boolean;
  sourceTransponderId?: string | null;
};

export type LiveRcEntryListResponse = {
  eventId: string;
  eventName?: string;
  classId: string;
  className?: string;
  classCode?: string;
  entries: LiveRcEntryListEntry[];
};

export type LiveRcLapPenalty = {
  durationSeconds?: number;
  reason?: string;
};

export type LiveRcRaceResultLap = {
  entryId: string;
  driverName: string;
  lapNumber: number;
  lapTimeSeconds: number;
  isOutlap?: boolean;
  penalties?: LiveRcLapPenalty[];
};

export type LiveRcRaceResultResponse = {
  eventId: string;
  eventName?: string;
  classId: string;
  className?: string;
  classCode?: string;
  roundId?: string;
  roundName?: string;
  raceId: string;
  raceName: string;
  sessionType?: string;
  startTimeUtc?: string;
  laps: LiveRcRaceResultLap[];
};

export interface LiveRcClient {
  fetchEntryList(params: {
    eventSlug: string;
    classSlug: string;
  }): Promise<LiveRcEntryListResponse>;
  fetchRaceResult(params: {
    eventSlug: string;
    classSlug: string;
    roundSlug: string;
    raceSlug: string;
  }): Promise<LiveRcRaceResultResponse>;
}
