import { act, render, waitFor } from '@testing-library/react';
import type { Task } from '@mindwtr/core';
import { useTaskStore } from '@mindwtr/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../contexts/language-context';
import { KeybindingProvider } from '../../contexts/keybinding-context';
import { useUiStore } from '../../store/ui-store';
import { ListView } from './ListView';

const deferredMockState = vi.hoisted(() => ({
  lagData: false,
  lagFeedback: false,
  previousData: undefined as unknown,
  previousFeedback: undefined as unknown,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  const isDataInput = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && 'baseTasks' in value;

  const isFeedbackInput = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && 'normalizedSearchQuery' in value && !('baseTasks' in value);

  return {
    ...actual,
    useDeferredValue: <T,>(value: T) => {
      if (isDataInput(value)) {
        if (deferredMockState.previousData === undefined) {
          deferredMockState.previousData = value;
          return value;
        }
        if (deferredMockState.lagData) {
          return deferredMockState.previousData as T;
        }
        deferredMockState.previousData = value;
        return value;
      }

      if (isFeedbackInput(value)) {
        if (deferredMockState.previousFeedback === undefined) {
          deferredMockState.previousFeedback = value;
          return value;
        }
        if (deferredMockState.lagFeedback) {
          return deferredMockState.previousFeedback as T;
        }
        deferredMockState.previousFeedback = value;
        return value;
      }

      return value;
    },
  };
});

const initialTaskState = useTaskStore.getState();
const initialUiState = useUiStore.getState();
const now = new Date().toISOString();

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  status: 'next',
  tags: [],
  contexts: [],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const renderStaticListView = (statusFilter: 'inbox' | 'done', title: string) =>
  renderToStaticMarkup(
    <LanguageProvider>
      <KeybindingProvider currentView={statusFilter} onNavigate={() => {}}>
        <ListView title={title} statusFilter={statusFilter} />
      </KeybindingProvider>
    </LanguageProvider>
  );

const renderListView = (statusFilter: 'next' | 'done' = 'next', title = 'Next') =>
  render(
    <LanguageProvider>
      <KeybindingProvider currentView={statusFilter} onNavigate={() => {}}>
        <ListView title={title} statusFilter={statusFilter} />
      </KeybindingProvider>
    </LanguageProvider>
  );

describe('ListView', () => {
  beforeEach(() => {
    deferredMockState.lagData = false;
    deferredMockState.lagFeedback = false;
    deferredMockState.previousData = undefined;
    deferredMockState.previousFeedback = undefined;

    useTaskStore.setState(initialTaskState, true);
    useUiStore.setState(initialUiState, true);

    useTaskStore.setState({
      tasks: [],
      projects: [],
      areas: [],
      settings: {},
      lastDataChangeAt: 0,
    });
    useUiStore.setState((state) => ({
      ...state,
      listFilters: {
        tokens: [],
        priorities: [],
        estimates: [],
        open: false,
      },
      listOptions: {
        showDetails: false,
        nextGroupBy: 'none',
      },
      projectView: {
        selectedProjectId: null,
      },
      editingTaskId: null,
      expandedTaskIds: {},
    }));
  });

  it('renders the view title', () => {
    const html = renderStaticListView('inbox', 'Inbox');
    expect(html).toContain('Inbox');
  });

  it('does not render local search input in inbox view', () => {
    const html = renderStaticListView('inbox', 'Inbox');
    expect(html).not.toContain('data-view-filter-input');
  });

  it('renders local search input in done view', () => {
    const html = renderStaticListView('done', 'Done');
    expect(html).toContain('data-view-filter-input');
  });

  it('does not show filtering feedback for deferred background task refreshes', async () => {
    useTaskStore.setState({
      tasks: [makeTask('1')],
      lastDataChangeAt: 1,
    });

    const { queryByText } = renderListView();
    expect(queryByText('Filtering...')).not.toBeInTheDocument();

    deferredMockState.lagData = true;

    act(() => {
      useTaskStore.setState({
        tasks: [makeTask('1'), makeTask('2')],
        lastDataChangeAt: 2,
      });
    });

    await waitFor(() => {
      expect(queryByText('Filtering...')).not.toBeInTheDocument();
    });
  });

  it('shows filtering feedback while user filter changes are deferred', async () => {
    useTaskStore.setState({
      tasks: [makeTask('1', { contexts: ['@work'] })],
      lastDataChangeAt: 1,
    });

    const { queryByText } = renderListView();
    expect(queryByText('Filtering...')).not.toBeInTheDocument();

    deferredMockState.lagFeedback = true;

    act(() => {
      useUiStore.getState().setListFilters({ tokens: ['@work'] });
    });

    await waitFor(() => {
      expect(queryByText('Filtering...')).toBeInTheDocument();
    });
  });
});
