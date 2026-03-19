import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import renderer from 'react-test-renderer';
import { Alert } from 'react-native';

import { SwipeableTaskItem } from './swipeable-task-item';

const { updateTask, storeState } = vi.hoisted(() => ({
  updateTask: vi.fn(),
  storeState: {
    updateTask: vi.fn(),
    projects: [] as any[],
    areas: [] as any[],
    settings: { features: {} },
    getDerivedState: () => ({ focusedCount: 0 }),
    tasks: [] as any[],
  },
}));

vi.mock('@mindwtr/core', () => {
  storeState.updateTask = updateTask;
  const useTaskStore = Object.assign(
    (selector?: (state: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState,
    {
      getState: () => storeState,
    }
  );

  return {
    useTaskStore,
    shallow: (value: unknown) => value,
    getChecklistProgress: () => null,
    getTaskAgeLabel: () => '',
    getTaskStaleness: () => 'fresh',
    getStatusColor: () => ({ bg: '#111111', border: '#222222', text: '#333333' }),
    hasTimeComponent: () => false,
    safeFormatDate: () => '',
    safeParseDueDate: () => null,
    resolveTaskTextDirection: () => 'ltr',
  };
});

vi.mock('../contexts/language-context', () => ({
  useLanguage: () => ({
    language: 'en',
    t: (key: string) =>
      ({
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'status.inbox': 'Inbox',
        'status.next': 'Next',
        'task.aria.delete': 'Delete task',
        'task.deleteConfirmBody': 'Move this task to Trash?',
      }[key] ?? key),
  }),
}));

vi.mock('react-native-gesture-handler', () => ({
  Swipeable: ({ renderLeftActions, renderRightActions, children }: any) =>
    React.createElement(
      'Swipeable',
      {},
      renderLeftActions ? renderLeftActions() : null,
      renderRightActions ? renderRightActions() : null,
      children
    ),
}));

vi.mock('lucide-react-native', () => ({
  ArrowRight: (props: any) => React.createElement('ArrowRight', props),
  Check: (props: any) => React.createElement('Check', props),
  RotateCcw: (props: any) => React.createElement('RotateCcw', props),
  Trash2: (props: any) => React.createElement('Trash2', props),
}));

describe('SwipeableTaskItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.projects = [];
  });

  it('confirms deletion before invoking onDelete', () => {
    const alertSpy = vi.spyOn(Alert, 'alert');
    const onDelete = vi.fn();

    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SwipeableTaskItem
          task={{
            id: 'task-1',
            title: 'Pay rent',
            status: 'inbox',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } as any}
          isDark={false}
          tc={{
            taskItemBg: '#111111',
            border: '#222222',
            text: '#ffffff',
            secondaryText: '#999999',
            tint: '#3b82f6',
            warning: '#f59e0b',
          } as any}
          onPress={vi.fn()}
          onStatusChange={vi.fn()}
          onDelete={onDelete}
        />
      );
    });

    const deleteAction = tree.root.find(
      (node) => node.props.accessibilityLabel === 'Delete task' && typeof node.props.onPress === 'function'
    );

    renderer.act(() => {
      deleteAction.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Pay rent',
      'Move this task to Trash?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive', onPress: expect.any(Function) }),
      ]),
      { cancelable: true }
    );
    expect(onDelete).not.toHaveBeenCalled();

    const alertButtons = alertSpy.mock.calls[0]?.[2] as { text?: string; onPress?: () => void }[];
    const destructiveAction = alertButtons.find((button) => button.text === 'Delete');
    expect(destructiveAction?.onPress).toBeTypeOf('function');

    renderer.act(() => {
      destructiveAction?.onPress?.();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('navigates from project, context, and tag meta labels', () => {
    const onProjectPress = vi.fn();
    const onContextPress = vi.fn();
    const onTagPress = vi.fn();
    storeState.projects = [
      { id: 'project-1', title: 'Mindwtr', areaId: undefined },
    ];

    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SwipeableTaskItem
          task={{
            id: 'task-1',
            title: 'Plan release',
            status: 'inbox',
            projectId: 'project-1',
            contexts: ['@work'],
            tags: ['#urgent'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } as any}
          isDark={false}
          tc={{
            taskItemBg: '#111111',
            border: '#222222',
            text: '#ffffff',
            secondaryText: '#999999',
            tint: '#3b82f6',
            warning: '#f59e0b',
          } as any}
          onPress={vi.fn()}
          onStatusChange={vi.fn()}
          onDelete={vi.fn()}
          onProjectPress={onProjectPress}
          onContextPress={onContextPress}
          onTagPress={onTagPress}
        />
      );
    });

    const projectButton = tree.root.find((node) => node.props.accessibilityLabel === 'Open project Mindwtr');
    const contextButton = tree.root.find((node) => node.props.accessibilityLabel === 'Open context @work');
    const tagButton = tree.root.find((node) => node.props.accessibilityLabel === 'Open tag #urgent');

    renderer.act(() => {
      projectButton.props.onPress({ stopPropagation: vi.fn() });
      contextButton.props.onPress({ stopPropagation: vi.fn() });
      tagButton.props.onPress({ stopPropagation: vi.fn() });
    });

    expect(onProjectPress).toHaveBeenCalledWith('project-1');
    expect(onContextPress).toHaveBeenCalledWith('@work');
    expect(onTagPress).toHaveBeenCalledWith('#urgent');
  });
});
