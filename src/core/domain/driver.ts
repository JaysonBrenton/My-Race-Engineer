export type Driver = {
  id: string;
  displayName: string;
  provider: string;
  sourceDriverId?: string | null;
  transponder?: string | null;
  createdAt: Date;
  updatedAt: Date;
};
