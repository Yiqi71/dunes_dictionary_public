// wordColor.js - shared word/year color mapping.
// Extracted from main.preview.js so other modules (e.g. the mobile
// related-words chip arrays) can color things the same way as the word
// nodes on the canvas without creating a circular import.
import { yearPeriods } from "./menu.js";

export const yearPeriodColors = [
    "#F9D67A",
    "#FADD91",
    "#FAE2A5",
    "#FAE8BA",
    "#FAEED0",
    "#F9F3E3"
];

export function getWordColor(wordYear) {
    if (isNaN(wordYear)) {
        return yearPeriodColors[0];
    }
    let periodIndex = 0;

    for (let i = yearPeriods.length - 2; i >= 0; i--) {
        const period = yearPeriods[i];
        if (period.year !== null && wordYear >= period.year) {
            periodIndex = i;
            break;
        }
    }
    if (periodIndex >= yearPeriodColors.length) {
        periodIndex = yearPeriodColors.length - 1;
    }
    return yearPeriodColors[periodIndex];
}
