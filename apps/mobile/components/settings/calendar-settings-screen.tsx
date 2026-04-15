import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { generateUUID, type ExternalCalendarSubscription, useTaskStore } from '@mindwtr/core';

import {
    fetchExternalCalendarEvents,
    getExternalCalendars,
    getSystemCalendarPermissionStatus,
    getSystemCalendars,
    getSystemCalendarSettings,
    requestSystemCalendarPermission,
    saveExternalCalendars,
    saveSystemCalendarSettings,
    type SystemCalendarInfo,
    type SystemCalendarPermissionStatus,
} from '@/lib/external-calendar';
import {
    deleteMindwtrCalendar,
    getCalendarPushEnabled,
    getCalendarWritePermissionStatus,
    requestCalendarWritePermission,
    runFullCalendarSync,
    setCalendarPushEnabled,
    startCalendarPushSync,
    stopCalendarPushSync,
} from '@/lib/calendar-push-sync';
import { useToast } from '@/contexts/toast-context';
import { maskCalendarUrl } from '@/lib/settings-utils';
import { useThemeColors } from '@/hooks/use-theme-colors';

import { useSettingsLocalization, useSettingsScrollContent } from './settings.hooks';
import { SettingsTopBar, SubHeader } from './settings.shell';
import { styles } from './settings.styles';

export function CalendarSettingsScreen() {
    const tc = useThemeColors();
    const { showToast } = useToast();
    const { isChineseLanguage, localize, t } = useSettingsLocalization();
    const { settings, updateSettings } = useTaskStore();
    const scrollContentStyle = useSettingsScrollContent();
    const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSubscription[]>([]);
    const [newCalendarName, setNewCalendarName] = useState('');
    const [newCalendarUrl, setNewCalendarUrl] = useState('');
    const [systemCalendarEnabled, setSystemCalendarEnabled] = useState(false);
    const [systemCalendarSelectAll, setSystemCalendarSelectAll] = useState(true);
    const [systemCalendarSelectedIds, setSystemCalendarSelectedIds] = useState<string[]>([]);
    const [systemCalendarPermission, setSystemCalendarPermission] = useState<SystemCalendarPermissionStatus>('undetermined');
    const [systemCalendars, setSystemCalendars] = useState<SystemCalendarInfo[]>([]);
    const [isSystemCalendarLoading, setIsSystemCalendarLoading] = useState(false);

    // Push-to-calendar state
    const [calendarPushEnabled, setCalendarPushEnabledState] = useState(false);
    const [calendarPushPermission, setCalendarPushPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

    useEffect(() => {
        void (async () => {
            const [enabled, permission] = await Promise.all([
                getCalendarPushEnabled(),
                getCalendarWritePermissionStatus(),
            ]);
            setCalendarPushEnabledState(enabled);
            setCalendarPushPermission(permission);
        })();
    }, []);

    const handleToggleCalendarPush = async (enabled: boolean) => {
        if (enabled) {
            const granted = calendarPushPermission === 'granted'
                ? true
                : await requestCalendarWritePermission();
            if (!granted) {
                setCalendarPushPermission('denied');
                showToast({
                    title: localize('Permission Required', '需要权限'),
                    message: localize('Calendar access is required to push tasks to your calendar.', '需要日历访问权限才能将任务推送到您的日历。'),
                    tone: 'warning',
                    durationMs: 4200,
                });
                return;
            }
            setCalendarPushPermission('granted');
            await setCalendarPushEnabled(true);
            setCalendarPushEnabledState(true);
            startCalendarPushSync();
            void runFullCalendarSync();
        } else {
            await setCalendarPushEnabled(false);
            setCalendarPushEnabledState(false);
            stopCalendarPushSync();
            showToast({
                title: localize('Calendar sync disabled', '日历同步已禁用'),
                message: localize('Tasks will no longer be pushed to your calendar. Existing events were kept.', '任务将不再推送到您的日历。已创建的日程已保留。'),
                tone: 'info',
                durationMs: 4200,
            });
        }
    };

    const handleDeleteMindwtrCalendar = async () => {
        // Disable push sync first so the calendar is not recreated on the next
        // startup or task change.
        await setCalendarPushEnabled(false);
        setCalendarPushEnabledState(false);
        stopCalendarPushSync();
        await deleteMindwtrCalendar();
        showToast({
            title: localize('Calendar deleted', '日历已删除'),
            message: localize('The Mindwtr calendar and all its events have been removed.', 'Mindwtr 日历及其所有日程已删除。'),
            tone: 'success',
            durationMs: 3500,
        });
    };

    const loadSystemCalendarState = useCallback(async (requestAccess = false) => {
        setIsSystemCalendarLoading(true);
        try {
            const stored = await getSystemCalendarSettings();
            setSystemCalendarEnabled(stored.enabled);
            setSystemCalendarSelectAll(stored.selectAll);
            setSystemCalendarSelectedIds(stored.selectedCalendarIds);

            const permission = requestAccess
                ? await requestSystemCalendarPermission()
                : await getSystemCalendarPermissionStatus();
            setSystemCalendarPermission(permission);

            if (permission !== 'granted') {
                setSystemCalendars([]);
                return;
            }

            const calendars = await getSystemCalendars();
            setSystemCalendars(calendars);
            if (stored.selectAll) return;

            const validIds = new Set(calendars.map((calendar) => calendar.id));
            const filteredSelection = stored.selectedCalendarIds.filter((id) => validIds.has(id));
            if (
                filteredSelection.length === stored.selectedCalendarIds.length &&
                filteredSelection.every((id, index) => id === stored.selectedCalendarIds[index])
            ) {
                return;
            }

            setSystemCalendarSelectedIds(filteredSelection);
            await saveSystemCalendarSettings({
                enabled: stored.enabled,
                selectAll: false,
                selectedCalendarIds: filteredSelection,
            });
        } catch (error) {
            console.error(error);
            showToast({
                title: localize('Error', '错误'),
                message: localize('Failed to load device calendar settings', '加载系统日历设置失败'),
                tone: 'warning',
                durationMs: 4200,
            });
        } finally {
            setIsSystemCalendarLoading(false);
        }
    }, [localize, showToast]);

    useEffect(() => {
        void loadSystemCalendarState();
    }, [loadSystemCalendarState]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const stored = await getExternalCalendars();
                if (cancelled) return;
                if (Array.isArray(settings.externalCalendars)) {
                    setExternalCalendars(settings.externalCalendars);
                    if (settings.externalCalendars.length || stored.length) {
                        await saveExternalCalendars(settings.externalCalendars);
                    }
                    return;
                }
                setExternalCalendars(stored);
            } catch (error) {
                console.error(error);
                showToast({
                    title: localize('Error', '错误'),
                    message: localize('Failed to load saved calendars', '加载已保存的日历失败'),
                    tone: 'warning',
                    durationMs: 4200,
                });
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [localize, settings.externalCalendars, showToast]);

    const persistSystemCalendarState = async (next: {
        enabled?: boolean;
        selectAll?: boolean;
        selectedCalendarIds?: string[];
    }) => {
        const payload = {
            enabled: next.enabled ?? systemCalendarEnabled,
            selectAll: next.selectAll ?? systemCalendarSelectAll,
            selectedCalendarIds: next.selectedCalendarIds ?? systemCalendarSelectedIds,
        };
        setSystemCalendarEnabled(payload.enabled);
        setSystemCalendarSelectAll(payload.selectAll);
        setSystemCalendarSelectedIds(payload.selectedCalendarIds);
        await saveSystemCalendarSettings(payload);
    };

    const handleToggleSystemCalendarEnabled = async (enabled: boolean) => {
        await persistSystemCalendarState({ enabled });
        if (enabled && systemCalendarPermission !== 'granted') {
            await loadSystemCalendarState(true);
        }
    };

    const handleToggleSystemCalendarSelection = async (calendarId: string, enabled: boolean) => {
        const allIds = systemCalendars.map((calendar) => calendar.id);
        if (allIds.length === 0) return;

        const currentSelection = systemCalendarSelectAll
            ? allIds
            : Array.from(new Set(systemCalendarSelectedIds.filter((id) => allIds.includes(id))));
        const nextSelection = enabled
            ? Array.from(new Set([...currentSelection, calendarId]))
            : currentSelection.filter((id) => id !== calendarId);
        const selectAll = nextSelection.length === allIds.length;

        await persistSystemCalendarState({
            selectAll,
            selectedCalendarIds: selectAll ? [] : nextSelection,
        });
    };

    const handleAddCalendar = async () => {
        const url = newCalendarUrl.trim();
        if (!url) return;

        const name = (newCalendarName.trim() || localize('Calendar', '日历')).trim();
        const next: ExternalCalendarSubscription[] = [...externalCalendars, { id: generateUUID(), name, url, enabled: true }];

        setExternalCalendars(next);
        setNewCalendarName('');
        setNewCalendarUrl('');
        await saveExternalCalendars(next);
        await updateSettings({ externalCalendars: next });
    };

    const handleToggleCalendar = async (id: string, enabled: boolean) => {
        const next = externalCalendars.map((c) => (c.id === id ? { ...c, enabled } : c));
        setExternalCalendars(next);
        await saveExternalCalendars(next);
        await updateSettings({ externalCalendars: next });
    };

    const handleRemoveCalendar = async (id: string) => {
        const next = externalCalendars.filter((c) => c.id !== id);
        setExternalCalendars(next);
        await saveExternalCalendars(next);
        await updateSettings({ externalCalendars: next });
    };

    const handleTestFetch = async () => {
        try {
            const now = new Date();
            const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            const { events } = await fetchExternalCalendarEvents(rangeStart, rangeEnd);
            showToast({
                title: localize('Success', '成功'),
                message: isChineseLanguage ? `已加载 ${events.length} 个日程` : `Loaded ${events.length} events`,
                tone: 'success',
            });
        } catch (error) {
            console.error(error);
            showToast({
                title: localize('Error', '错误'),
                message: localize('Failed to load events', '加载失败'),
                tone: 'warning',
            });
        }
    };

    const selectedSystemCalendarSet = new Set(systemCalendarSelectedIds);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
            <SettingsTopBar />
            <SubHeader title={t('settings.calendar')} />
            <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                <Text style={[styles.description, { color: tc.secondaryText }]}>{t('settings.calendarDesc')}</Text>

                {/* Push tasks to calendar */}
                <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginBottom: 16 }]}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>
                                {localize('Push tasks to calendar', '将任务推送到日历')}
                            </Text>
                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                {localize(
                                    'Tasks with due dates are added to a dedicated "Mindwtr" calendar on your device.',
                                    '有截止日期的任务将添加到设备上专用的"Mindwtr"日历中。'
                                )}
                            </Text>
                        </View>
                        <Switch
                            value={calendarPushEnabled}
                            onValueChange={(v) => void handleToggleCalendarPush(v)}
                            trackColor={{ false: '#767577', true: '#3B82F6' }}
                        />
                    </View>

                    {calendarPushEnabled && calendarPushPermission === 'denied' && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: tc.border }}>
                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                {localize(
                                    'Calendar access was denied. Please grant access in Settings.',
                                    '日历访问被拒绝。请在设置中授予访问权限。'
                                )}
                            </Text>
                        </View>
                    )}

                    {calendarPushEnabled && calendarPushPermission === 'granted' && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: tc.border }}>
                            <TouchableOpacity
                                onPress={() => void handleDeleteMindwtrCalendar()}
                                style={{ alignSelf: 'flex-start' }}
                            >
                                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>
                                    {localize('Delete Mindwtr calendar…', '删除 Mindwtr 日历…')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.deviceCalendars')}</Text>
                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{t('settings.deviceCalendarsDesc')}</Text>
                        </View>
                        <Switch
                            value={systemCalendarEnabled}
                            onValueChange={handleToggleSystemCalendarEnabled}
                            trackColor={{ false: '#767577', true: '#3B82F6' }}
                        />
                    </View>

                    {systemCalendarEnabled && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: tc.border }}>
                            {systemCalendarPermission !== 'granted' ? (
                                <View>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {systemCalendarPermission === 'denied'
                                            ? t('settings.calendarAccessDenied')
                                            : t('settings.calendarAccessRequired')}
                                    </Text>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: tc.filterBg, marginTop: 12, alignSelf: 'flex-start' },
                                        ]}
                                        onPress={() => void loadSystemCalendarState(true)}
                                    >
                                        <Text style={[styles.backendOptionText, { color: tc.text }]}>{t('settings.grantCalendarAccess')}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : isSystemCalendarLoading ? (
                                <View style={{ paddingVertical: 8 }}>
                                    <ActivityIndicator color={tc.tint} />
                                </View>
                            ) : systemCalendars.length === 0 ? (
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{t('settings.noDeviceCalendars')}</Text>
                            ) : (
                                <View>
                                    {systemCalendars.map((calendar, idx) => {
                                        const selected = systemCalendarSelectAll || selectedSystemCalendarSet.has(calendar.id);
                                        return (
                                            <View
                                                key={calendar.id}
                                                style={[styles.settingRow, idx > 0 && { borderTopWidth: 1, borderTopColor: tc.border }]}
                                            >
                                                <View style={styles.settingInfo}>
                                                    <Text style={[styles.settingLabel, { color: tc.text }]} numberOfLines={1}>
                                                        {calendar.name}
                                                    </Text>
                                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]} numberOfLines={1}>
                                                        {t('settings.deviceCalendar')}
                                                    </Text>
                                                </View>
                                                <Switch
                                                    value={selected}
                                                    onValueChange={(value) => void handleToggleSystemCalendarSelection(calendar.id, value)}
                                                    trackColor={{ false: '#767577', true: '#3B82F6' }}
                                                />
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    )}
                </View>

                <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 16 }]}>
                    <View style={styles.inputGroup}>
                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.externalCalendarName')}</Text>
                        <TextInput
                            style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                            placeholder={localize('Optional', '可选')}
                            placeholderTextColor={tc.secondaryText}
                            value={newCalendarName}
                            onChangeText={setNewCalendarName}
                        />

                        <Text style={[styles.settingLabel, { color: tc.text, marginTop: 12 }]}>{t('settings.externalCalendarUrl')}</Text>
                        <TextInput
                            style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                            placeholder={t('settings.externalCalendarUrlPlaceholder')}
                            placeholderTextColor={tc.secondaryText}
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={newCalendarUrl}
                            onChangeText={setNewCalendarUrl}
                        />

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                            <TouchableOpacity
                                style={[
                                    styles.backendOption,
                                    { borderColor: tc.border, backgroundColor: newCalendarUrl.trim() ? tc.tint : tc.filterBg },
                                ]}
                                onPress={() => void handleAddCalendar()}
                                disabled={!newCalendarUrl.trim()}
                            >
                                <Text style={[styles.backendOptionText, { color: newCalendarUrl.trim() ? '#FFFFFF' : tc.secondaryText }]}>
                                    {t('settings.externalCalendarAdd')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.backendOption, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                onPress={() => void handleTestFetch()}
                            >
                                <Text style={[styles.backendOptionText, { color: tc.text }]}>{localize('Test', '测试')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {externalCalendars.length > 0 && (
                    <View style={{ marginTop: 16 }}>
                        <Text style={[styles.sectionTitle, { color: tc.secondaryText }]}>{t('settings.externalCalendars')}</Text>
                        <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                            {externalCalendars.map((calendar, idx) => (
                                <View
                                    key={calendar.id}
                                    style={[styles.settingRow, idx > 0 && { borderTopWidth: 1, borderTopColor: tc.border }]}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]} numberOfLines={1}>
                                            {calendar.name}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]} numberOfLines={1}>
                                            {maskCalendarUrl(calendar.url)}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', gap: 10 }}>
                                        <Switch
                                            value={calendar.enabled}
                                            onValueChange={(value) => void handleToggleCalendar(calendar.id, value)}
                                            trackColor={{ false: '#767577', true: '#3B82F6' }}
                                        />
                                        <TouchableOpacity onPress={() => void handleRemoveCalendar(calendar.id)}>
                                            <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>
                                                {t('settings.externalCalendarRemove')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
