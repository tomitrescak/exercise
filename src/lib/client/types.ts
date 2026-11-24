import type { Cursor, Profile, RoutineDraft } from "@/lib/schemas";
import type { RoutineSnapshot } from "@/lib/workout";
import type { ProfileProposal } from "@/lib/agent/tools";

export type { Profile, RoutineDraft, Cursor, ProfileProposal, RoutineSnapshot };

export type RoutineListItem = {
  id: string;
  name: string;
  description: string | null;
  goal: string;
  format: "CIRCUIT" | "STRAIGHT_SETS";
  rounds: number;
  estimatedMinutes: number;
  archived: boolean;
  starred: boolean;
  parentId: string | null;
  parentName: string | null;
  exerciseCount: number;
  lastPerformedAt: string | null;
  createdAt: string;
};

export type Exercise = RoutineDraft["exercises"][number] & {
  id: string;
  position: number;
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeChannel: string;
};

export type RoutineDetail = Omit<RoutineListItem, "exerciseCount" | "lastPerformedAt" | "parentName"> & {
  restBetweenRoundsSec: number;
  coachNotes: string | null;
  rating: RoutineDraft["rating"];
  exercises: Exercise[];
  parent: { id: string; name: string } | null;
  sessions: { id: string; status: string; startedAt: string; activeDurationSec: number | null; perceivedExertion: number | null }[];
};

export type ToolCallSummary = { id: string; name: string; label: string; ok: boolean | null };
export type Source = { title: string; url: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: { calls: ToolCallSummary[]; proposals: ProfileProposal[] } | null;
  sources: Source[] | null;
  draftVersion: number | null;
  createdAt: string;
};

export type ConversationView = {
  id: string;
  title: string | null;
  routine: { id: string; name: string } | null;
  draft: RoutineDraft | null;
  draftVersion: number;
  original: RoutineDraft | null;
  versions: { version: number; source: string; at: string; name: string }[];
  missingVideo: number[];
  savedRoutines: { id: string; name: string }[];
  messages: ChatMessage[];
};

export type SetLog = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  round: number;
  setIndex: number;
  side: "" | "left" | "right";
  targetReps: number | null;
  actualReps: number | null;
  loadKg: number | null;
  durationSec: number | null;
  skipped: boolean;
  completedAt: string;
};

export type SessionView = {
  id: string;
  routineId: string;
  routineSnapshot: RoutineSnapshot;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  pausedTotalSec: number;
  activeDurationSec: number | null;
  cursor: Cursor;
  perceivedExertion: number | null;
  notes: string | null;
  sets: SetLog[];
  serverNow?: string;
};

export type HistoryData = {
  sessions: {
    id: string;
    routineId: string;
    routineName: string;
    status: string;
    startedAt: string;
    activeDurationSec: number | null;
    perceivedExertion: number | null;
    setsCompleted: number;
    plannedSets: number;
  }[];
  total: number;
  page: number;
  pageSize: number;
  weekly: { weekStart: string; sessions: number; minutes: number }[];
  exerciseTrends: {
    exerciseName: string;
    points: { date: string; maxReps: number | null; maxLoadKg: number | null; totalReps: number }[];
  }[];
};

export type DashboardData = {
  inProgress: { id: string; routineName?: string; startedAt: string } | null;
  thisWeek: { sessions: number; minutes: number };
  quickStart: { id: string; name: string; estimatedMinutes: number; starred: boolean; lastPerformedAt: string | null }[];
  conversations: { id: string; title: string | null; routineId: string | null; draftVersion: number; updatedAt: string }[];
};

export type PhotoItem = {
  id: string;
  takenOn: string; // YYYY-MM-DD
  caption: string | null;
  width: number;
  height: number;
  createdAt: string;
};
