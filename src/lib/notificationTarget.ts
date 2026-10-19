/**
 * Decides where a notification's "Open" button should go.
 * A notification only gets "Open" when it points at something real:
 * an event (event_id present) or a sender that is an actual member profile.
 */

export const SYSTEM_SENDER_IDS = ['moderator', 'system', 'organiser', 'organizer', 'host', 'admin'];

export type NotificationTarget = { kind: 'event'; id: string } | { kind: 'profile'; id: string } | null;

export function isSystemSender(fromId: unknown): boolean {
  return typeof fromId === 'string' && SYSTEM_SENDER_IDS.includes(fromId.trim().toLowerCase());
}

export function resolveNotificationTarget(
  notification: { event_id?: string | null; from_id?: string | null } | null | undefined,
  profiles: Array<{ id: string }>
): NotificationTarget {
  if (!notification) return null;
  if (notification.event_id) {
    return { kind: 'event', id: notification.event_id };
  }
  const fromId = notification.from_id;
  if (fromId && !isSystemSender(fromId) && profiles.some(p => p.id === fromId)) {
    return { kind: 'profile', id: fromId };
  }
  return null;
}
