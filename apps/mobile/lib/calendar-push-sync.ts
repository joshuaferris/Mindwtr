/**
 * Calendar push sync service.
 *
 * One-way push of tasks with due dates into a dedicated "Mindwtr" calendar on
 * the device (iOS EventKit via expo-calendar). Creates, updates, or removes
 * calendar events as task due dates change. Mapping between task IDs and
 * calendar event IDs is persisted in the SQLite calendar_sync table.
 */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTaskStore, type Task } from '@mindwtr/core';

import { logInfo, logWarn, logError } from './app-log';
import {
    getCalendarSyncEntry,
    upsertCalendarSyncEntry,
    deleteCalendarSyncEntry,
} from './storage-adapter';

// MARK: - Constants

const CALENDAR_PUSH_ENABLED_KEY = 'mindwtr:calendar-push-sync:enabled';
const CALENDAR_ID_KEY = 'mindwtr:calendar-push-sync:calendar-id';
const PLATFORM = Platform.OS;
const SYNC_DEBOUNCE_MS = 2500;

// MARK: - Settings

export const getCalendarPushEnabled = async (): Promise<boolean> => {
    const val = await AsyncStorage.getItem(CALENDAR_PUSH_ENABLED_KEY);
    return val === '1';
};

export const setCalendarPushEnabled = async (enabled: boolean): Promise<void> => {
    await AsyncStorage.setItem(CALENDAR_PUSH_ENABLED_KEY, enabled ? '1' : '0');
};

// MARK: - Permission

export const requestCalendarWritePermission = async (): Promise<boolean> => {
    try {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        return status === 'granted';
    } catch {
        return false;
    }
};

export const getCalendarWritePermissionStatus = async (): Promise<'granted' | 'denied' | 'undetermined'> => {
    try {
        const { status } = await Calendar.getCalendarPermissionsAsync();
        if (status === 'granted') return 'granted';
        if (status === 'denied') return 'denied';
        return 'undetermined';
    } catch {
        return 'undetermined';
    }
};

// MARK: - Managed Calendar

const getStoredCalendarId = (): Promise<string | null> =>
    AsyncStorage.getItem(CALENDAR_ID_KEY);

const setStoredCalendarId = (id: string): Promise<void> =>
    AsyncStorage.setItem(CALENDAR_ID_KEY, id);

/**
 * Returns the ID of the managed "Mindwtr" calendar, creating it if needed.
 * Returns null if the calendar cannot be created (e.g. no permission, no source).
 */
export const ensureMindwtrCalendar = async (): Promise<string | null> => {
    try {
        const storedId = await getStoredCalendarId();
        if (storedId) {
            const allCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            if (allCalendars.some((c) => c.id === storedId)) return storedId;
            // Calendar was deleted externally — fall through to recreate
        }

        // Find best available calendar source
        const sources = await Calendar.getSourcesAsync();
        const source =
            sources.find((s) => s.type === Calendar.SourceType.LOCAL) ??
            sources.find((s) => s.type === Calendar.SourceType.CALDAV) ??
            sources[0];

        if (!source) {
            void logWarn('No calendar source available; cannot create Mindwtr calendar', {
                scope: 'calendar-push',
            });
            return null;
        }

        const newId = await Calendar.createCalendarAsync({
            title: 'Mindwtr',
            color: '#3B82F6',
            entityType: Calendar.EntityTypes.EVENT,
            sourceId: source.id,
            source,
        });

        await setStoredCalendarId(newId);
        void logInfo('Created Mindwtr calendar', {
            scope: 'calendar-push',
            extra: { calendarId: newId },
        });
        return newId;
    } catch (error) {
        void logError(error, { scope: 'calendar-push', extra: { operation: 'ensureMindwtrCalendar' } });
        return null;
    }
};

/**
 * Deletes the managed Mindwtr calendar and removes the stored ID.
 * Called when the user disables calendar push sync and chooses to clean up.
 */
export const deleteMindwtrCalendar = async (): Promise<void> => {
    const storedId = await getStoredCalendarId();
    if (!storedId) return;
    try {
        await Calendar.deleteCalendarAsync(storedId);
    } catch {
        // Already deleted or not found — ignore
    }
    await AsyncStorage.removeItem(CALENDAR_ID_KEY);
    void logInfo('Deleted Mindwtr calendar', { scope: 'calendar-push' });
};

// MARK: - Per-task sync

function buildEventDetails(task: Task) {
    const dueDate = new Date(task.dueDate!);
    // For all-day events, end at 23:59:59 on the same day
    const endDate = new Date(dueDate);
    endDate.setHours(23, 59, 59, 999);
    return {
        title: task.title,
        startDate: dueDate,
        endDate,
        allDay: true,
        notes: task.description ?? '',
    };
}

async function removeTaskFromCalendar(taskId: string): Promise<void> {
    const entry = await getCalendarSyncEntry(taskId, PLATFORM);
    if (!entry) return;
    try {
        await Calendar.deleteEventAsync(entry.calendarEventId);
    } catch {
        // Event may already be deleted
    }
    await deleteCalendarSyncEntry(taskId, PLATFORM);
}

async function syncTaskToCalendar(task: Task, calendarId: string): Promise<void> {
    // Remove from calendar if no due date or soft-deleted
    if (!task.dueDate || task.deletedAt) {
        await removeTaskFromCalendar(task.id);
        return;
    }

    const details = buildEventDetails(task);
    const existing = await getCalendarSyncEntry(task.id, PLATFORM);

    if (existing && existing.calendarId === calendarId) {
        try {
            await Calendar.updateEventAsync(existing.calendarEventId, details);
            await upsertCalendarSyncEntry({
                taskId: task.id,
                calendarEventId: existing.calendarEventId,
                calendarId,
                platform: PLATFORM,
                lastSyncedAt: new Date().toISOString(),
            });
            return;
        } catch {
            // Event deleted externally — fall through to create
        }
    }

    const eventId = await Calendar.createEventAsync(calendarId, { ...details, calendarId });
    await upsertCalendarSyncEntry({
        taskId: task.id,
        calendarEventId: eventId,
        calendarId,
        platform: PLATFORM,
        lastSyncedAt: new Date().toISOString(),
    });
}

// MARK: - Full sync

export const runFullCalendarSync = async (): Promise<void> => {
    const enabled = await getCalendarPushEnabled();
    if (!enabled) return;

    const calendarId = await ensureMindwtrCalendar();
    if (!calendarId) return;

    const { tasks } = useTaskStore.getState();
    const results = await Promise.allSettled(
        tasks.map((task) => syncTaskToCalendar(task, calendarId))
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    void logInfo('Full calendar sync complete', {
        scope: 'calendar-push',
        extra: { total: String(tasks.length), failed: String(failed) },
    });
};

// MARK: - Debounced partial sync

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export const scheduleSyncDebounced = (taskIds: string[]): void => {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null;
        void runPartialCalendarSync(taskIds);
    }, SYNC_DEBOUNCE_MS);
};

const runPartialCalendarSync = async (taskIds: string[]): Promise<void> => {
    const enabled = await getCalendarPushEnabled();
    if (!enabled) return;

    const calendarId = await ensureMindwtrCalendar();
    if (!calendarId) return;

    const { tasks } = useTaskStore.getState();
    const targets = tasks.filter((t) => taskIds.includes(t.id));

    // Also handle tasks that were removed from the store (deleted)
    const storeIds = new Set(tasks.map((t) => t.id));
    const removedIds = taskIds.filter((id) => !storeIds.has(id));

    await Promise.allSettled([
        ...targets.map((t) => syncTaskToCalendar(t, calendarId)),
        ...removedIds.map((id) => removeTaskFromCalendar(id)),
    ]);
};

// MARK: - Store subscription

let unsubscribeStore: (() => void) | null = null;

/**
 * Starts watching the task store for changes and syncing due-date tasks to
 * the device calendar. Returns an unsubscribe function.
 */
export const startCalendarPushSync = (): (() => void) => {
    if (unsubscribeStore) return unsubscribeStore;

    let previousTaskMap = new Map(
        useTaskStore.getState().tasks.map((t) => [t.id, t])
    );

    unsubscribeStore = useTaskStore.subscribe((state) => {
        const changedIds: string[] = [];
        const currentMap = new Map(state.tasks.map((t) => [t.id, t]));

        // Changed or new tasks
        for (const task of state.tasks) {
            const prev = previousTaskMap.get(task.id);
            if (
                !prev ||
                prev.updatedAt !== task.updatedAt ||
                prev.dueDate !== task.dueDate ||
                prev.deletedAt !== task.deletedAt ||
                prev.title !== task.title
            ) {
                changedIds.push(task.id);
            }
        }

        // Tasks removed from store entirely
        for (const id of previousTaskMap.keys()) {
            if (!currentMap.has(id)) {
                changedIds.push(id);
            }
        }

        previousTaskMap = currentMap;

        if (changedIds.length > 0) {
            scheduleSyncDebounced(changedIds);
        }
    });

    return () => {
        unsubscribeStore?.();
        unsubscribeStore = null;
        if (syncDebounceTimer) {
            clearTimeout(syncDebounceTimer);
            syncDebounceTimer = null;
        }
    };
};

export const stopCalendarPushSync = (): void => {
    unsubscribeStore?.();
    unsubscribeStore = null;
    if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = null;
    }
};
