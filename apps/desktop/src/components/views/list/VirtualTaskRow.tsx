import React, { useCallback, useLayoutEffect, useRef } from 'react';
import type { Project, Task } from '@mindwtr/core';
import { TaskItem } from '../../TaskItem';
import { cn } from '../../../lib/utils';

type VirtualTaskRowProps = {
    task: Task;
    project?: Project;
    index: number;
    top: number;
    isSelected?: boolean;
    selectionMode?: boolean;
    isMultiSelected?: boolean;
    onSelectIndex?: (index: number) => void;
    onToggleSelectId: (id: string) => void;
    onMeasure: (id: string, height: number) => void;
    showQuickDone?: boolean;
    readOnly?: boolean;
    compactMetaEnabled?: boolean;
    dense?: boolean;
    showProjectBadgeInActions?: boolean;
    gapClassName?: string;
    showDivider?: boolean;
};

export const VirtualTaskRow = React.memo(function VirtualTaskRow({
    task,
    project,
    index,
    top,
    isSelected,
    selectionMode = false,
    isMultiSelected = false,
    onSelectIndex,
    onToggleSelectId,
    onMeasure,
    showQuickDone = true,
    readOnly = false,
    compactMetaEnabled = true,
    dense = false,
    showProjectBadgeInActions = true,
    gapClassName,
    showDivider = true,
}: VirtualTaskRowProps) {
    const rowRef = useRef<HTMLDivElement | null>(null);
    const handleSelect = useCallback(() => onSelectIndex?.(index), [index, onSelectIndex]);
    const handleToggleSelect = useCallback(() => onToggleSelectId(task.id), [onToggleSelectId, task.id]);

    useLayoutEffect(() => {
        const node = rowRef.current;
        if (!node) return undefined;
        const measure = () => {
            const nextHeight = Math.ceil(node.getBoundingClientRect().height);
            onMeasure(task.id, nextHeight);
        };
        measure();
    }, [task.id, task.updatedAt, onMeasure]);

    return (
        <div ref={rowRef} style={{ position: 'absolute', top, left: 0, right: 0 }}>
            <div className={cn(gapClassName ?? (dense ? "pb-1" : "pb-1.5"))}>
                <TaskItem
                    key={task.id}
                    task={task}
                    project={project}
                    isSelected={isSelected}
                    onSelect={onSelectIndex ? handleSelect : undefined}
                    selectionMode={selectionMode}
                    isMultiSelected={isMultiSelected}
                    onToggleSelect={handleToggleSelect}
                    showQuickDone={showQuickDone}
                    readOnly={readOnly}
                    compactMetaEnabled={compactMetaEnabled}
                    showProjectBadgeInActions={showProjectBadgeInActions}
                />
                {showDivider ? <div className="mx-3 mt-1 h-px bg-border/30" /> : null}
            </div>
        </div>
    );
});
