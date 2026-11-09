// Only the bundled single-user desktop delegates authentication to its host.
export const workbenchAuth = import.meta.env.VITE_WORKBENCH_AUTH === "1";
const removedPaths = new Set(['/wallet', '/admin/announcements', '/admin/banner-announcements', '/admin/feedbacks', '/admin/credit-operations', '/admin/payments', '/admin/redemption-codes']);
export const isRemovedWorkbenchPath = (path: string) => workbenchAuth && removedPaths.has(path.replace(/\/$/, ''));
