import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Task } from '@mindwtr/core';

import { TaskItemDisplay } from './TaskItemDisplay';

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
    it('renders task age in Chinese when language is zh', () => {
        const { getByText } = render(
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
        );

        expect(getByText('2周前')).toBeInTheDocument();
    });

    it('only renders the task description when the row is expanded', () => {
        const taskWithDescription: Task = {
            ...baseTask,
            description: 'Expanded task note',
        };

        const { queryByText, rerender } = render(
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
        );

        expect(queryByText('Expanded task note')).not.toBeInTheDocument();

        rerender(
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
        );

        expect(queryByText('Expanded task note')).toBeInTheDocument();
    });
});
