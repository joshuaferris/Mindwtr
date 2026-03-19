import { router } from 'expo-router';
import { store } from 'expo-router/build/global-state/router-store';

const normalizePathname = (value?: string | null): string => {
    if (!value) return '';
    const normalized = value.replace(/\/+$/, '');
    return normalized || '/';
};

const navigateToTaskMetaScreen = (
    pathname: '/projects-screen' | '/contexts',
    params: { projectId?: string; token?: string }
) => {
    const href = { pathname, params };
    const currentPathname = normalizePathname(store.getRouteInfo().pathname);
    if (currentPathname === pathname) {
        router.replace(href);
        return;
    }
    router.push(href);
};

export function openProjectScreen(projectId: string) {
    if (!projectId) return;
    navigateToTaskMetaScreen('/projects-screen', { projectId });
}

export function openContextsScreen(token: string) {
    if (!token) return;
    navigateToTaskMetaScreen('/contexts', { token });
}
