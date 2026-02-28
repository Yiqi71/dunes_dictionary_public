import { state } from "./state.js";

const ZOOM_WHEEL_STEP = 0.28;

export function getMinScaleForCurrentPath(pathname = window.location.pathname) {
    const isPreview = pathname.endsWith("index.html");
    return isPreview ? 1.2 : 1;
}

export function getScaleFromSliderPercent(percent) {
    return (percent * 19) / 100 + 1;
}

export function getIndicatorScaleValue(scaleValue, scaleThreshold = state.scaleThreshold) {
    return (scaleValue - 1) * 4 / (scaleThreshold - 1) + 1;
}

export function getIndicatorPercent(scaleValue) {
    return (scaleValue - 1) * 25;
}

export function clampIndicatorScaleValue(scaleValue) {
    if (scaleValue < 1) return 1;
    if (scaleValue > 5) return 5;
    return scaleValue;
}

export function getSnappedScale(scale) {
    if (scale < 1.5) return 1;
    if (scale < 5) return 2;
    if (scale < 10) return 3;
    if (scale < 11) return 4;
    return 5;
}

export function updateScaleForNodes(newScale) {
    const snapped = getSnappedScale(newScale);
    document.body.dataset.scale = snapped;
}

export function resolveWheelScale(scale, deltaY, options = {}) {
    const minScale = options.minScale ?? getMinScaleForCurrentPath();
    const maxScale = options.maxScale ?? state.scaleThreshold;
    const zoomStep = options.zoomStep ?? ZOOM_WHEEL_STEP;

    const delta = deltaY > 0 ? -zoomStep : zoomStep;
    let newScale = Math.min(maxScale, Math.max(minScale, scale + delta));

    const currentSnapped = getSnappedScale(scale);

    // Keep legacy jump behavior between snapped levels 4 and 5.
    if (currentSnapped === 4 || currentSnapped === 5) {
        if (delta > 0) {
            newScale = maxScale;
        } else if (currentSnapped === 5) {
            newScale = 10;
        } else {
            newScale = scale + delta;
        }
    }

    return { delta, newScale };
}
