import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const routerMocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
}));

const routeStoreRef = vi.hoisted(() => ({
    pathname: '/inbox',
}));

vi.mock('expo-router', () => ({
    router: routerMocks,
}));

vi.mock('expo-router/build/global-state/router-store', () => ({
    store: {
        getRouteInfo: () => ({
            pathname: routeStoreRef.pathname,
        }),
    },
}));

let openContextsScreen: typeof import('./task-meta-navigation').openContextsScreen;
let openProjectScreen: typeof import('./task-meta-navigation').openProjectScreen;

describe('task-meta-navigation', () => {
    beforeAll(async () => {
        ({ openContextsScreen, openProjectScreen } = await import('./task-meta-navigation'));
    });

    beforeEach(() => {
        vi.clearAllMocks();
        routeStoreRef.pathname = '/inbox';
    });

    it('pushes when navigating from a different screen', () => {
        openProjectScreen('project-1');

        expect(routerMocks.push).toHaveBeenCalledWith({
            pathname: '/projects-screen',
            params: { projectId: 'project-1' },
        });
        expect(routerMocks.replace).not.toHaveBeenCalled();
    });

    it('replaces when navigating within the same project screen', () => {
        routeStoreRef.pathname = '/projects-screen';

        openProjectScreen('project-2');

        expect(routerMocks.replace).toHaveBeenCalledWith({
            pathname: '/projects-screen',
            params: { projectId: 'project-2' },
        });
        expect(routerMocks.push).not.toHaveBeenCalled();
    });

    it('replaces when navigating within the same contexts screen', () => {
        routeStoreRef.pathname = '/contexts';

        openContextsScreen('@health');

        expect(routerMocks.replace).toHaveBeenCalledWith({
            pathname: '/contexts',
            params: { token: '@health' },
        });
        expect(routerMocks.push).not.toHaveBeenCalled();
    });
});
