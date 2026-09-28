export const EVENT_ACTIONS = [
    "create",
    "update",
    "complete",
    "cancel",
    "mention",
] as const;

export const EVENT_STATUSES = [
    "planned",
    "ongoing",
    "completed",
    "cancelled",
] as const;

export const EVENT_TYPES = [
    "travel",
    "education",
    "work",
    "project",
    "social",
    "family",
    "appointment",
    "health",
    "purchase",
    "milestone",
    "deadline",
    "exam",
    "interview",
    "celebration",
    "routine",
    "other",
] as const;

export const TIME_PRECISIONS = [
    "exact",
    "date",
    "day",
    "relative",
    "approximate",
    "unknown",
] as const;