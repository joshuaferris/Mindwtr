import type { ReactElement } from 'react';
import type { AppData } from '@mindwtr/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockAsyncStorageGetItem,
    mockRequestWidgetUpdate,
} = vi.hoisted(() => ({
    mockAsyncStorageGetItem: vi.fn(),
    mockRequestWidgetUpdate: vi.fn(),
}));

vi.mock('react-native', () => ({
    Platform: {
        OS: 'android',
    },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: mockAsyncStorageGetItem,
    },
}));

vi.mock('react-native-android-widget', () => ({
    FlexWidget: 'FlexWidget',
    TextWidget: 'TextWidget',
    requestWidgetUpdate: mockRequestWidgetUpdate,
}));

import { updateMobileWidgetFromData } from './widget-service';

type WidgetElement = ReactElement<{
    children?: WidgetElement | WidgetElement[];
    text?: string;
}>;

const asWidgetChildren = (children: WidgetElement['props']['children']): WidgetElement[] => {
    if (!children) return [];
    return Array.isArray(children) ? children : [children];
};

const buildData = (): AppData => {
    const now = new Date().toISOString();
    return {
        tasks: [
            { id: '1', title: 'Focused 1', status: 'next', isFocusedToday: true, tags: [], contexts: [], createdAt: now, updatedAt: now },
            { id: '2', title: 'Focused 2', status: 'next', isFocusedToday: true, tags: [], contexts: [], createdAt: now, updatedAt: now },
            { id: '3', title: 'Focused 3', status: 'next', isFocusedToday: true, tags: [], contexts: [], createdAt: now, updatedAt: now },
            { id: '4', title: 'Focused 4', status: 'next', isFocusedToday: true, tags: [], contexts: [], createdAt: now, updatedAt: now },
            { id: '5', title: 'Focused 5', status: 'next', isFocusedToday: true, tags: [], contexts: [], createdAt: now, updatedAt: now },
        ],
        projects: [],
        areas: [],
        sections: [],
        settings: {},
    };
};

const countRenderedTaskRows = (tree: WidgetElement): number => {
    const [content] = asWidgetChildren(tree.props.children);
    const contentChildren = content ? asWidgetChildren(content.props.children) : [];
    return contentChildren.filter((child) => {
        const text = child.props.text;
        return typeof text === 'string' && text.startsWith('• ');
    }).length;
};

describe('widget-service', () => {
    beforeEach(() => {
        mockAsyncStorageGetItem.mockReset();
        mockAsyncStorageGetItem.mockResolvedValue(null);
        mockRequestWidgetUpdate.mockReset();
    });

    it('uses Android widget height to render more rows during app-driven updates', async () => {
        let renderedTree: WidgetElement | null = null;
        mockRequestWidgetUpdate.mockImplementation(async ({ renderWidget }) => {
            renderedTree = await renderWidget({
                widgetName: 'TasksWidget',
                widgetId: 1,
                height: 320,
                width: 180,
                screenInfo: {
                    screenHeightDp: 800,
                    screenWidthDp: 400,
                    density: 2,
                    densityDpi: 320,
                },
            });
        });

        const didUpdate = await updateMobileWidgetFromData(buildData());

        expect(didUpdate).toBe(true);
        expect(mockRequestWidgetUpdate).toHaveBeenCalledTimes(1);
        expect(renderedTree).not.toBeNull();
        if (!renderedTree) {
            throw new Error('Expected Android widget render tree');
        }
        expect(countRenderedTaskRows(renderedTree)).toBe(5);
    });
});
