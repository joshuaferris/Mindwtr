import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useTaskStore } from '@mindwtr/core';
import type { Task } from '@mindwtr/core';
import { useLanguage } from '../../contexts/language-context';

import { useMobileAreaFilter } from '@/hooks/use-mobile-area-filter';
import { useThemeColors, ThemeColors } from '@/hooks/use-theme-colors';
import { taskMatchesAreaFilter } from '@/lib/area-filter';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Archive } from 'lucide-react-native';
import { useEffect, useRef, useMemo, useCallback } from 'react';

function ArchivedTaskItem({
    task,
    tc,
    onRestore,
    onDelete,
    isHighlighted
}: {
    task: Task;
    tc: ThemeColors;
    onRestore: () => void;
    onDelete: () => void;
    isHighlighted?: boolean;
}) {
    const swipeableRef = useRef<Swipeable>(null);

    const renderLeftActions = () => (
        <Pressable
            style={styles.swipeActionRestore}
            onPress={() => {
                swipeableRef.current?.close();
                onRestore();
            }}
        >
            <Text style={styles.swipeActionText}>↩️ Restore</Text>
        </Pressable>
    );

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeActionDelete}
            onPress={() => {
                swipeableRef.current?.close();
                onDelete();
            }}
        >
            <Text style={styles.swipeActionText}>🗑️ Delete</Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderLeftActions={renderLeftActions}
            renderRightActions={renderRightActions}
            overshootLeft={false}
            overshootRight={false}
        >
            <View style={[
                styles.taskItem,
                { backgroundColor: tc.taskItemBg },
                isHighlighted && { borderWidth: 2, borderColor: tc.tint }
            ]}>
                <View style={styles.taskContent}>
                    <Text style={[styles.taskTitle, { color: tc.secondaryText }]} numberOfLines={2}>
                        {task.title}
                    </Text>
                    {task.description && (
                        <Text style={[styles.taskDescription, { color: tc.secondaryText }]} numberOfLines={1}>
                            {task.description}
                        </Text>
                    )}
                    <Text style={[styles.archivedDate, { color: tc.secondaryText }]}>
                        Completed: {(task.completedAt || task.updatedAt) ? new Date(task.completedAt || task.updatedAt!).toLocaleDateString() : 'Unknown'}
                    </Text>
                </View>
                <View style={[styles.statusIndicator, { backgroundColor: '#6B7280' }]} />
            </View>
        </Swipeable>
    );
}

export default function ArchivedScreen() {
    const { _allTasks, projects, updateTask, purgeTask, highlightTaskId, setHighlightTask } = useTaskStore();
    const { t } = useLanguage();

    const tc = useThemeColors();
    const { areaById, resolvedAreaFilter } = useMobileAreaFilter();
    const projectById = useMemo(
        () => new Map(projects.map((project) => [project.id, project])),
        [projects],
    );

    const archivedTasks = useMemo(
        () => _allTasks.filter((task) => (
            task.status === 'archived'
            && !task.deletedAt
            && taskMatchesAreaFilter(task, resolvedAreaFilter, projectById, areaById)
        )),
        [_allTasks, resolvedAreaFilter, projectById, areaById],
    );

    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!highlightTaskId) return;
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
        }
        highlightTimerRef.current = setTimeout(() => {
            setHighlightTask(null);
        }, 3500);
        return () => {
            if (highlightTimerRef.current) {
                clearTimeout(highlightTimerRef.current);
            }
        };
    }, [highlightTaskId, setHighlightTask]);

    const handleRestore = useCallback((taskId: string) => {
        updateTask(taskId, { status: 'inbox' });
    }, [updateTask]);

    const handleDelete = useCallback((taskId: string) => {
        Alert.alert(
            'Delete Permanently?',
            'This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => purgeTask(taskId)
                },
            ]
        );
    }, [purgeTask]);

    const renderArchivedTask = useCallback(({ item }: { item: Task }) => (
        <ArchivedTaskItem
            task={item}
            tc={tc}
            onRestore={() => handleRestore(item.id)}
            onDelete={() => handleDelete(item.id)}
            isHighlighted={item.id === highlightTaskId}
        />
    ), [tc, handleDelete, handleRestore, highlightTaskId]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={[styles.container, { backgroundColor: tc.bg }]}>
                {archivedTasks.length > 0 && (
                    <View style={styles.summaryRow}>
                        <Text style={[styles.summaryText, { color: tc.secondaryText }]}>
                            {archivedTasks.length} {t('common.tasks') || 'tasks'}
                        </Text>
                    </View>
                )}
                <FlatList
                    data={archivedTasks}
                    renderItem={renderArchivedTask}
                    keyExtractor={(item) => item.id}
                    extraData={highlightTaskId}
                    style={styles.taskList}
                    contentContainerStyle={[
                        styles.taskListContent,
                        archivedTasks.length === 0 && styles.emptyContent,
                    ]}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    windowSize={5}
                    updateCellsBatchingPeriod={50}
                    removeClippedSubviews={archivedTasks.length >= 25}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Archive size={48} color={tc.secondaryText} strokeWidth={1.5} style={styles.emptyIcon} />
                            <Text style={[styles.emptyTitle, { color: tc.text }]}>
                                {t('archived.empty') || 'No archived tasks'}
                            </Text>
                            <Text style={[styles.emptyText, { color: tc.secondaryText }]}>
                                {t('archived.emptyHint') || 'Tasks you archive will appear here'}
                            </Text>
                        </View>
                    }
                />
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    summaryRow: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 2,
    },
    summaryText: {
        fontSize: 13,
        fontWeight: '500',
    },
    taskList: {
        flex: 1,
    },
    taskListContent: {
        padding: 16,
    },
    emptyContent: {
        flexGrow: 1,
    },
    taskItem: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    taskContent: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
        textDecorationLine: 'line-through',
    },
    taskDescription: {
        fontSize: 14,
        marginBottom: 4,
    },
    archivedDate: {
        fontSize: 12,
        fontStyle: 'italic',
    },
    statusIndicator: {
        width: 4,
        borderRadius: 2,
        marginLeft: 12,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
    },
    swipeActionRestore: {
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
        width: 100,
        borderRadius: 12,
        marginBottom: 12,
        marginRight: 8,
    },
    swipeActionDelete: {
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 100,
        borderRadius: 12,
        marginBottom: 12,
        marginLeft: 8,
    },
    swipeActionText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
});
