import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { Task } from '@mindwtr/core';
import { useTaskStore } from '@mindwtr/core';

import { LanguageProvider } from '../../contexts/language-context';
import { TaskItemDisplay } from './TaskItemDisplay';

const initialTaskState = useTaskStore.getState();

const baseTask: Task = {
    id: 'task-1',
    title: 'Localized age',
    status: 'inbox',
    tags: [],
    contexts: [],
    createdAt: new Date(Date.now() - (15 * 24 * 60 * 60 * 1000)).toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
};

describe('TaskItemDisplay', () => {
    beforeEach(() => {
        act(() => {
            useTaskStore.setState(initialTaskState, true);
        });
    });

    it('renders task age in Chinese when language is zh', () => {
        const { getByText } = render(
            <LanguageProvider>
                <TaskItemDisplay
                    task={baseTask}
                    language="zh"
                    selectionMode={false}
                    isViewOpen={false}
                    actions={{
                        onToggleView: vi.fn(),
                        onEdit: vi.fn(),
                        onDelete: vi.fn(),
                        onDuplicate: vi.fn(),
                        onStatusChange: vi.fn(),
                        openAttachment: vi.fn(),
                    }}
                    visibleAttachments={[]}
                    recurrenceRule=""
                    recurrenceStrategy="strict"
                    prioritiesEnabled={false}
                    timeEstimatesEnabled={false}
                    isStagnant={false}
                    showQuickDone={false}
                    readOnly={false}
                    t={(key: string) => key}
                />
            </LanguageProvider>
        );

        expect(getByText('2周前')).toBeInTheDocument();
    });

    it('only renders the task description when the row is expanded', () => {
        const taskWithDescription: Task = {
            ...baseTask,
            description: 'Expanded task note',
        };

        const { queryByText, rerender } = render(
            <LanguageProvider>
                <TaskItemDisplay
                    task={taskWithDescription}
                    language="en"
                    selectionMode={false}
                    isViewOpen={false}
                    actions={{
                        onToggleView: vi.fn(),
                        onEdit: vi.fn(),
                        onDelete: vi.fn(),
                        onDuplicate: vi.fn(),
                        onStatusChange: vi.fn(),
                        openAttachment: vi.fn(),
                    }}
                    visibleAttachments={[]}
                    recurrenceRule=""
                    recurrenceStrategy="strict"
                    prioritiesEnabled={false}
                    timeEstimatesEnabled={false}
                    isStagnant={false}
                    showQuickDone={false}
                    readOnly={false}
                    t={(key: string) => key}
                />
            </LanguageProvider>
        );

        expect(queryByText('Expanded task note')).not.toBeInTheDocument();

        rerender(
            <LanguageProvider>
                <TaskItemDisplay
                    task={taskWithDescription}
                    language="en"
                    selectionMode={false}
                    isViewOpen
                    actions={{
                        onToggleView: vi.fn(),
                        onEdit: vi.fn(),
                        onDelete: vi.fn(),
                        onDuplicate: vi.fn(),
                        onStatusChange: vi.fn(),
                        openAttachment: vi.fn(),
                    }}
                    visibleAttachments={[]}
                    recurrenceRule=""
                    recurrenceStrategy="strict"
                    prioritiesEnabled={false}
                    timeEstimatesEnabled={false}
                    isStagnant={false}
                    showQuickDone={false}
                    readOnly={false}
                    t={(key: string) => key}
                />
            </LanguageProvider>
        );

        expect(queryByText('Expanded task note')).toBeInTheDocument();
    });

    it('renders internal markdown task links in expanded details', () => {
        act(() => {
            useTaskStore.setState((state) => ({
                ...state,
                tasks: [baseTask, {
                    ...baseTask,
                    id: 'task-2',
                    title: 'Referenced task',
                }],
                _allTasks: [baseTask, {
                    ...baseTask,
                    id: 'task-2',
                    title: 'Referenced task',
                }],
                projects: [],
                _allProjects: [],
            }));
        });

        const { getByRole } = render(
            <LanguageProvider>
                <TaskItemDisplay
                    task={{
                        ...baseTask,
                        description: 'See [[task:task-2|Referenced task]]',
                    }}
                    language="en"
                    selectionMode={false}
                    isViewOpen
                    actions={{
                        onToggleView: vi.fn(),
                        onEdit: vi.fn(),
                        onDelete: vi.fn(),
                        onDuplicate: vi.fn(),
                        onStatusChange: vi.fn(),
                        openAttachment: vi.fn(),
                    }}
                    visibleAttachments={[]}
                    recurrenceRule=""
                    recurrenceStrategy="strict"
                    prioritiesEnabled={false}
                    timeEstimatesEnabled={false}
                    isStagnant={false}
                    showQuickDone={false}
                    readOnly={false}
                    t={(key: string) => key}
                />
            </LanguageProvider>
        );

        expect(getByRole('button', { name: 'Referenced task' })).toBeInTheDocument();
    });
});
