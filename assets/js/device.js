// device.js - shared "is this the mobile (phone) layout" detection.
//
// A plain (max-width: 768px) check misclassifies large-screen or landscape
// phones (e.g. ~820-926px wide) as desktop, which breaks the touch UI: the
// full-screen detail panel never activates, so users land on the
// hover-dependent desktop sidebar (which gets stuck mid-peek since there's
// no hover on touch) with the canvas relation lines still showing.
// Treat any touch device without hover as mobile too, capped at 1024px so
// touch-enabled desktop monitors aren't swept in along with phones/tablets.
export const MOBILE_MEDIA_QUERY = "(max-width: 768px), (hover: none) and (pointer: coarse) and (max-width: 1024px)";

export function isMobileLayout() {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}
