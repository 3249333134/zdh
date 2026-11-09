import { workbenchAuth } from "./workbench-auth";
import { useLocaleStore } from "@/stores/use-locale-store";
import { useThemeStore } from "@/stores/use-theme-store";
import "@/styles/workbench-shell.css";
import { installWorkbenchAgent } from './workbench-agent';
import { useConfigStore, encodeChannelModel } from '@/stores/use-config-store';

if (workbenchAuth && window.parent !== window) {
    installWorkbenchAgent();
    document.body.classList.add("media-workbench-embedded");
    const settingsPanel = new URLSearchParams(window.location.search).has("workbenchSettings");
    if (settingsPanel) document.body.classList.add("media-workbench-settings");
    window.addEventListener("message", (event) => {
        if (event.source !== window.parent || event.origin !== "http://127.0.0.1:33280" || event.data?.type !== "media-workbench:preferences") return;
        if (["zh", "en"].includes(event.data.language)) useLocaleStore.getState().setLocale(event.data.language === "en" ? "en-US" : "zh-CN");
        if (typeof event.data.dark === "boolean") useThemeStore.getState().setTheme(event.data.dark ? "dark" : "light");
        const ai = event.data.ai;
        if (ai && typeof ai.canvasChannelId === 'string' && typeof ai.textModel === 'string') {
            const applySharedModels = () => {
                const { config, replaceConfig } = useConfigStore.getState();
                if (!config.channels.some(channel => channel.id === ai.canvasChannelId)) return false;
                const selected = (model: unknown) => typeof model === 'string' && model ? encodeChannelModel(ai.canvasChannelId, model) : '';
                replaceConfig({ ...config, textModel: selected(ai.textModel), imageModel: selected(ai.imageModel), model: selected(ai.imageModel), videoModel: selected(ai.videoModel) });
                return true;
            };
            if (!applySharedModels()) {
                const unsubscribe = useConfigStore.subscribe(() => {
                    if (useConfigStore.getState().config.channels.some(channel => channel.id === ai.canvasChannelId)) { unsubscribe(); applySharedModels(); }
                });
                setTimeout(unsubscribe, 15000);
            }
        }
    });
    // Configuration links in the creative module open the workbench-wide hub.
    if (!settingsPanel) document.addEventListener("click", (event) => {
        const link = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!link || link.origin !== window.location.origin) return;
        if (link.pathname === "/settings" || link.pathname === "/wallet" || link.pathname === "/admin" || link.pathname.startsWith("/admin/")) {
            event.preventDefault(); event.stopPropagation();
            window.parent.postMessage({ type: "media-workbench:settings", path: link.pathname }, "http://127.0.0.1:33280");
        }
    }, true);
}
