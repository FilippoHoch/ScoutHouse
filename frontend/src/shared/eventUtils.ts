import { EventAccommodation, EventBranch, EventParticipants } from "./types";

const DAY_MS = 86_400_000;

export interface NormalizedBranchSegment {
  branch: EventBranch;
  startDate: string;
  endDate: string;
  youthCount: number;
  leadersCount: number;
  kambusieriCount: number;
  accommodation: EventAccommodation;
  notes?: string;
}

const parseDateValue = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
};

export interface NormalizedParticipants {
  lc: number;
  eg: number;
  rs: number;
  leaders: number;
  lc_kambusieri: number;
  eg_kambusieri: number;
  rs_kambusieri: number;
  detached_leaders: number;
  detached_guests: number;
}

export const normalizeParticipants = (
  participants?: Partial<EventParticipants>,
): NormalizedParticipants => ({
  lc: participants?.lc ?? 0,
  eg: participants?.eg ?? 0,
  rs: participants?.rs ?? 0,
  leaders: participants?.leaders ?? 0,
  lc_kambusieri: participants?.lc_kambusieri ?? 0,
  eg_kambusieri: participants?.eg_kambusieri ?? 0,
  rs_kambusieri: participants?.rs_kambusieri ?? 0,
  detached_leaders: participants?.detached_leaders ?? 0,
  detached_guests: participants?.detached_guests ?? 0,
});

export const computeParticipantTotals = (
  segments: NormalizedBranchSegment[],
): NormalizedParticipants => {
  return segments.reduce<NormalizedParticipants>(
    (acc, segment) => {
      const youth = segment.youthCount;
      const leaders = segment.leadersCount;
      const kambusieri = segment.kambusieriCount;
      if (segment.branch === "LC") {
        acc.lc += youth;
        acc.lc_kambusieri = (acc.lc_kambusieri ?? 0) + kambusieri;
      } else if (segment.branch === "EG") {
        acc.eg += youth;
        acc.eg_kambusieri = (acc.eg_kambusieri ?? 0) + kambusieri;
      } else if (segment.branch === "RS") {
        acc.rs += youth;
        acc.rs_kambusieri = (acc.rs_kambusieri ?? 0) + kambusieri;
      }
      acc.leaders += leaders;
      return acc;
    },
    normalizeParticipants(),
  );
};

export const computeTotalParticipants = (participants: NormalizedParticipants): number =>
  participants.lc +
  participants.eg +
  participants.rs +
  participants.leaders +
  participants.lc_kambusieri +
  participants.eg_kambusieri +
  participants.rs_kambusieri +
  participants.detached_guests;

const maxConcurrentLoad = (segments: NormalizedBranchSegment[]): number => {
  if (segments.length === 0) {
    return 0;
  }
  const points: Array<{ time: number; delta: number }> = [];
  for (const segment of segments) {
    const startTime = parseDateValue(segment.startDate);
    const endTime = parseDateValue(segment.endDate);
    if (startTime === null || endTime === null) {
      continue;
    }
    const total = segment.youthCount + segment.leadersCount + segment.kambusieriCount;
    if (total <= 0) {
      continue;
    }
    points.push({ time: startTime, delta: total });
    points.push({ time: endTime + DAY_MS, delta: -total });
  }
  if (points.length === 0) {
    return 0;
  }
  points.sort((a, b) => a.time - b.time);
  let running = 0;
  let peak = 0;
  for (const point of points) {
    running += point.delta;
    if (running > peak) {
      peak = running;
    }
  }
  return peak;
};

export const computePeakParticipants = (
  segments: NormalizedBranchSegment[],
): number => maxConcurrentLoad(segments);

export interface AccommodationSummary {
  needsIndoor: boolean;
  needsTents: boolean;
  indoorCapacity: number;
  tentsCapacity: number;
}

export const computeAccommodationRequirements = (
  segments: NormalizedBranchSegment[],
): AccommodationSummary => {
  const indoorSegments = segments.filter((segment) => segment.accommodation === "indoor");
  const tentSegments = segments.filter((segment) => segment.accommodation === "tents");
  return {
    needsIndoor: indoorSegments.length > 0,
    needsTents: tentSegments.length > 0,
    indoorCapacity: maxConcurrentLoad(indoorSegments),
    tentsCapacity: maxConcurrentLoad(tentSegments),
  };
};
