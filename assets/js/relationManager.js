// relationsManager.js - 专门处理单词关系连线
import { state } from "./state.js";
import { updateWordFocus, zoomToWord } from "./wordFocus.js";
import { logEvent } from "/analytics.js";

const connectionLines = document.getElementById("connection-lines");
const universeCanvas = document.getElementById("universe-canvas");
const RELATION_TYPES = {
    concept: "\u6982\u5ff5\u76f8\u5173",
    conceptLegacy: "\u59d2\u509a\u5eb7\u9429\u7a3f\u53e7",
    proposer: "\u5171\u540c\u63d0\u51fa\u8005",
    proposerLegacy: "\u934f\u535e\u6093\u93bb\u611d\u5681\u9470"
};
const RELATION_WAVE = {
    samples: 72,
    amplitude: {
        conceptMin: 3.5,
        conceptMax: 42,
        defaultMin: 3,
        defaultMax: 22,
        distanceStart: 120,
        distanceFactor: 0.00075,
        distancePower: 1.6
    },
    phasePerSlot: Math.PI * 0.7,
    wavelength: {
        concept: 30,
        default: 56
    }
};

function isConceptRelation(relation) {
    return relation === RELATION_TYPES.concept || relation === RELATION_TYPES.conceptLegacy;
}

function isProposerRelation(relation) {
    return relation === RELATION_TYPES.proposer || relation === RELATION_TYPES.proposerLegacy;
}

function getLangText(value, lang) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "object") {
        return value[lang] || value.zh || value.en || "";
    }
    return "";
}

if (connectionLines && universeCanvas) {
    connectionLines.addEventListener("wheel", (e) => {
        const forwarded = new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true
        });
        universeCanvas.dispatchEvent(forwarded);
        e.preventDefault();
    }, { passive: false });

    const forwardMouseEvent = (type, e) => {
        const forwarded = new MouseEvent(type, {
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            button: e.button,
            buttons: e.buttons,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true
        });
        universeCanvas.dispatchEvent(forwarded);
    };

    connectionLines.addEventListener("mousedown", (e) => {
        forwardMouseEvent("mousedown", e);
    });

    connectionLines.addEventListener("mousemove", (e) => {
        forwardMouseEvent("mousemove", e);
    });

    connectionLines.addEventListener("mouseup", (e) => {
        forwardMouseEvent("mouseup", e);
    });
}

function getCenterPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function getRelationLabel(relation, lang) {
    const isEn = lang === "en";
    if (isConceptRelation(relation)) return isEn ? "Conceptually Related" : RELATION_TYPES.concept;
    if (isProposerRelation(relation)) return isEn ? "Same Proponent" : "\u540c\u4e00\u63d0\u51fa\u8005";
    return relation || "";
}

// 创建直线路径（hover时使用）
function createStraightPath(pos1, pos2) {
    return `M ${pos1.x} ${pos1.y} L ${pos2.x} ${pos2.y}`;
}

function getRectEdgePoint(element, center, dirX, dirY, padding = 2) {
    const rect = element.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    const safeDx = Math.abs(dirX) < 1e-6 ? 1e-6 : Math.abs(dirX);
    const safeDy = Math.abs(dirY) < 1e-6 ? 1e-6 : Math.abs(dirY);
    const t = Math.min(halfW / safeDx, halfH / safeDy);
    const edgeX = center.x + dirX * t;
    const edgeY = center.y + dirY * t;

    return {
        x: edgeX + dirX * padding,
        y: edgeY + dirY * padding
    };
}

function getFannedEndpointPositions(node1, node2, index, total) {
    const center1 = getCenterPosition(node1);
    const center2 = getCenterPosition(node2);
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 1) {
        return { start: center1, end: center2, slotOffset: 0 };
    }

    const baseAngle = Math.atan2(dy, dx);
    const hasFan = total > 1;
    const normalizedSlot = hasFan ? (index - (total - 1) / 2) : 0;
    const spreadStep = Math.min(0.2, 0.65 / Math.max(1, total - 1));
    const angleOffset = normalizedSlot * spreadStep;

    const startDirX = Math.cos(baseAngle + angleOffset);
    const startDirY = Math.sin(baseAngle + angleOffset);
    const endDirX = Math.cos(baseAngle - angleOffset * 0.35);
    const endDirY = Math.sin(baseAngle - angleOffset * 0.35);

    return {
        start: getRectEdgePoint(node1, center1, startDirX, startDirY, 2),
        end: getRectEdgePoint(node2, center2, -endDirX, -endDirY, 2),
        slotOffset: normalizedSlot
    };
}

function createCurvedPath(pos1, pos2, relation, slotOffset) {
    return createCurvedPathGeometry(pos1, pos2, relation, slotOffset).path;
}

function createCurvedPathGeometry(pos1, pos2, relation, slotOffset) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 30) {
        return {
            path: createStraightPath(pos1, pos2),
            points: [pos1, pos2],
            distance
        };
    }

    const ux = dx / distance;
    const uy = dy / distance;
    const perpX = -uy;
    const perpY = ux;

    const baseCurve = isConceptRelation(relation) ? 0.14 : 0.1;
    const longDistanceBoost = 1 + Math.min(0.35, Math.max(0, distance - 420) / 1400);
    const rawCurve = distance * baseCurve * longDistanceBoost;
    const dynamicMaxCurve = Math.max(40, distance * 0.1);
    const curveMagnitude = Math.min(dynamicMaxCurve, Math.max(24, rawCurve));
    const direction = slotOffset === 0 ? (isConceptRelation(relation) ? 1 : -1) : Math.sign(slotOffset);
    const slotBoost = 1 + Math.min(0.9, Math.abs(slotOffset) * 0.2);
    const bulge = curveMagnitude * direction * slotBoost;

    const c1x = pos1.x + ux * distance * 0.25 + perpX * bulge;
    const c1y = pos1.y + uy * distance * 0.25 + perpY * bulge;
    const c2x = pos1.x + ux * distance * 0.75 + perpX * bulge;
    const c2y = pos1.y + uy * distance * 0.75 + perpY * bulge;

    return {
        path: `M ${pos1.x} ${pos1.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${pos2.x} ${pos2.y}`,
        points: [
            pos1,
            { x: c1x, y: c1y },
            { x: c2x, y: c2y },
            pos2
        ],
        distance
    };
}

function cubicPoint(points, t) {
    const [p0, p1, p2, p3] = points;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    return {
        x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
        y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y
    };
}

function cubicTangent(points, t) {
    const [p0, p1, p2, p3] = points;
    const mt = 1 - t;

    return {
        x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
        y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
    };
}

function getRelationWaveConfig(relation) {
    const isConcept = isConceptRelation(relation);
    return {
        ...RELATION_WAVE,
        amplitudeMin: isConcept
            ? RELATION_WAVE.amplitude.conceptMin
            : RELATION_WAVE.amplitude.defaultMin,
        amplitudeMax: isConcept
            ? RELATION_WAVE.amplitude.conceptMax
            : RELATION_WAVE.amplitude.defaultMax,
        wavelength: isConcept
            ? RELATION_WAVE.wavelength.concept
            : RELATION_WAVE.wavelength.default
    };
}

function createWavedPath(geometry, relation, slotOffset) {
    const { points, distance } = geometry;
    const waveConfig = getRelationWaveConfig(relation);
    if (!points || points.length < 2) return geometry.path;

    const sampleCount = waveConfig.samples;
    const amplitude = Math.min(
        waveConfig.amplitudeMax,
        waveConfig.amplitudeMin + Math.pow(
            Math.max(0, distance - RELATION_WAVE.amplitude.distanceStart),
            RELATION_WAVE.amplitude.distancePower
        ) * RELATION_WAVE.amplitude.distanceFactor
    );
    const wavelength = waveConfig.wavelength;
    const phase = (slotOffset || 0) * waveConfig.phasePerSlot;
    const wavedPoints = [];

    for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const base = points.length === 4
            ? cubicPoint(points, t)
            : {
                x: points[0].x + (points[1].x - points[0].x) * t,
                y: points[0].y + (points[1].y - points[0].y) * t
            };
        const tangent = points.length === 4
            ? cubicTangent(points, t)
            : {
                x: points[1].x - points[0].x,
                y: points[1].y - points[0].y
            };
        const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
        const normalX = -tangent.y / tangentLength;
        const normalY = tangent.x / tangentLength;
        const taper = Math.sin(Math.PI * t);
        const wave = Math.sin((distance * t / wavelength) * Math.PI * 2 + phase);

        wavedPoints.push({
            x: base.x + normalX * wave * amplitude * taper,
            y: base.y + normalY * wave * amplitude * taper
        });
    }

    if (wavedPoints.length < 3) {
        return `M ${wavedPoints[0].x.toFixed(2)} ${wavedPoints[0].y.toFixed(2)} L ${wavedPoints[1].x.toFixed(2)} ${wavedPoints[1].y.toFixed(2)}`;
    }

    const segments = [`M ${wavedPoints[0].x.toFixed(2)} ${wavedPoints[0].y.toFixed(2)}`];
    for (let i = 1; i < wavedPoints.length - 1; i++) {
        const current = wavedPoints[i];
        const next = wavedPoints[i + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        segments.push(`Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`);
    }

    const last = wavedPoints[wavedPoints.length - 1];
    segments.push(`T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`);

    return segments.join(" ");
}

// 画线svg relations
function drawLine(id1, id2, relation, fanIndex = 0, fanTotal = 1) {
    const svg = document.getElementById('connection-lines');
    const node1 = document.getElementById(id1);
    const node2 = document.getElementById(id2);
    if (!node1 || !node2) return;

    const word1 = window.allWords.find(w => w.id == id1);
    const word2 = window.allWords.find(w => w.id == id2);

    const { start: pos1, end: pos2, slotOffset } = getFannedEndpointPositions(node1, node2, fanIndex, fanTotal);

    // 使用平滑弧线，按线序号做分流
    const pathGeometry = createCurvedPathGeometry(pos1, pos2, relation, slotOffset);
    const mainPath = pathGeometry.path;
    const visualPath = createWavedPath(pathGeometry, relation, slotOffset);

    // 视觉线 - 使用path元素
    const visualLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    visualLine.setAttribute('d', visualPath);
    visualLine.setAttribute('fill', 'none');
    visualLine.setAttribute('stroke-linecap', 'round');
    visualLine.setAttribute('stroke-linejoin', 'round');
    visualLine.setAttribute('pointer-events', 'none');
    
    // 添加平滑过渡效果
    visualLine.style.transition = 'all 0.3s ease';

    // 根据关系类型设置不同样式
    if (isConceptRelation(relation)) {
        visualLine.setAttribute('stroke', '#FFFCF4');
        visualLine.setAttribute('stroke-width', '1.8');
        visualLine.setAttribute('stroke-dasharray', '6,5');
    } else if (isProposerRelation(relation)) {
        visualLine.setAttribute('stroke', '#FFFCF4');
        visualLine.setAttribute('stroke-width', '1.4');
    } else {
        visualLine.setAttribute('stroke', '#FFFCF4');
        visualLine.setAttribute('stroke-width', '1.5');
    }

    // 点击/hover hitbox - 也使用相同路径但更粗
    const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitbox.setAttribute('d', mainPath);
    hitbox.setAttribute('fill', 'none');
    hitbox.setAttribute('stroke', 'transparent');
    hitbox.setAttribute('stroke-width', '15');
    hitbox.setAttribute('pointer-events', 'stroke');
    hitbox.setAttribute('stroke-linecap', 'round');
    hitbox.style.cursor = 'pointer';

    // 添加交互事件
    addLineInteractions(hitbox, visualLine, word1, word2, relation, id2, visualPath);

    // 保证 hitbox 在上面，视觉线在下面
    svg.appendChild(visualLine);
    svg.appendChild(hitbox);
}

function addLineInteractions(hitbox, visualLine, word1, word2, relation, targetId, mainPath) {
    let tooltipDiv = document.getElementById("tooltipDiv");

    hitbox.addEventListener('mouseenter', (e) => {
        // 强制隐藏任何之前的tooltip
        hideTooltip();
        
        // 高亮效果：变粗、变亮
        const currentWidth = parseFloat(visualLine.getAttribute('stroke-width'));
        visualLine.setAttribute('stroke-width', currentWidth * 1.8);
        visualLine.setAttribute('stroke', '#F9D67A'); // 高亮颜色
        
        // hover时取消虚线效果，显示为实线
        visualLine.setAttribute('stroke-dasharray', 'none');
        
        visualLine.style.filter = 'drop-shadow(0 0 4px rgba(249, 214, 122, 0.6))'; // 发光效果
        
        // 显示tooltip
        const wordLabel = getLangText(word2?.term, state.currentLang) || String(targetId || "");
        const relationLabel = getRelationLabel(relation, state.currentLang);
        tooltipDiv.textContent = `${relationLabel}: ${wordLabel}`;
        tooltipDiv.style.position = 'fixed';
        tooltipDiv.style.background = '#1E1C16';
        tooltipDiv.style.color = '#F9D67A';
        tooltipDiv.style.padding = '6px 10px';
        tooltipDiv.style.borderRadius = '6px';
        tooltipDiv.style.fontSize = '13px';
        tooltipDiv.style.fontWeight = '500';
        tooltipDiv.style.pointerEvents = 'none';
        tooltipDiv.style.zIndex = '9999';
        tooltipDiv.style.display = 'block';
        tooltipDiv.style.opacity = "1";
        tooltipDiv.style.border = '1px solid #F9D67A';
        tooltipDiv.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        tooltipDiv.style.left = (e.clientX + 12) + 'px';
        tooltipDiv.style.top = (e.clientY + 12) + 'px';
    });

    hitbox.addEventListener('mousemove', (e) => {
        if (tooltipDiv && tooltipDiv.style.opacity === '1') {
            tooltipDiv.style.left = (e.clientX + 12) + 'px';
            tooltipDiv.style.top = (e.clientY + 12) + 'px';
        }
    });

    hitbox.addEventListener('mouseleave', () => {
        // 恢复原始路径
        visualLine.setAttribute('d', mainPath);
        visualLine.style.filter = 'none'; // 移除发光
        
        // 恢复原始颜色和粗细
        if (isConceptRelation(relation)) {
            visualLine.setAttribute('stroke', '#FFFCF4');
            visualLine.setAttribute('stroke-width', '1.8');
            visualLine.setAttribute('stroke-dasharray', '6,5');
        } else if (isProposerRelation(relation)) {
            visualLine.setAttribute('stroke', '#FFFCF4');
            visualLine.setAttribute('stroke-width', '1.4');
            visualLine.setAttribute('stroke-dasharray', '1,1');
        } else {
            visualLine.setAttribute('stroke', '#FFFCF4');
            visualLine.setAttribute('stroke-width', '1.5');
        }
        
        hideTooltip();
    });

    hitbox.addEventListener('pointerdown', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const fromWordId = state.focusedNodeId;
        console.log("[relation click]", { from: fromWordId, to: targetId, relation });
        hideTooltip();
        await zoomToWord(targetId, state.currentScale, { animated: true, duration: 800 });
        updateWordFocus(targetId);
        logEvent("link_click", {
            fromWordId,
            toWordId: targetId,
            relation
        });
    });
}

// 统一的tooltip隐藏函数
function hideTooltip() {
    const tooltipDiv = document.getElementById("tooltipDiv");
    if (tooltipDiv) {
        tooltipDiv.style.opacity = '0';
        tooltipDiv.style.display = 'none';
        tooltipDiv.textContent = '';
        // 清除可能的样式
        tooltipDiv.style.border = '';
        tooltipDiv.style.boxShadow = '';
        tooltipDiv.style.color = '';
        tooltipDiv.style.background = '';
    }
}

// 更新所有关系连线
export function updateRelations() {
    const svg = document.getElementById('connection-lines');
    svg.innerHTML = '';

    // 每次更新关系时都隐藏tooltip，防止滞留
    hideTooltip();

    if (!state.focusedNodeId) return;

    const thisWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!thisWord) return;
    
    const lineSpecs = [];
    const drawn = new Set();
    const addLineSpec = (id1, id2, relation, key) => {
        if (key && drawn.has(key)) return;
        if (key) drawn.add(key);
        lineSpecs.push({ id1, id2, relation });
    };

    // 1. 收集概念相关关系

    if (Array.isArray(thisWord.related_terms)) {
        thisWord.related_terms.forEach(relation => {
            const key = `${state.focusedNodeId}->${relation.id}:concept`;
            addLineSpec(state.focusedNodeId, relation.id, RELATION_TYPES.concept, key);
        });
    }

    // 1b. 收集反向相关：其他词条指向当前词条
    window.allWords.forEach(otherWord => {
        if (!otherWord || otherWord.id === thisWord.id) return;
        if (!Array.isArray(otherWord.related_terms)) return;
        const hits = otherWord.related_terms.some(r => r && r.id == thisWord.id);
        if (!hits) return;
        const key = `${state.focusedNodeId}->${otherWord.id}:concept`;
        addLineSpec(state.focusedNodeId, otherWord.id, RELATION_TYPES.concept, key);
    });

    // 2. 收集共同提出者关系
    if (Array.isArray(thisWord.proposers)) {
        const proposerNames = thisWord.proposers
            .map(p => p?.name?.zh)
            .filter(Boolean);

        window.allWords.forEach(otherWord => {
            if (otherWord.id === thisWord.id) return; // 跳过自己
            if (!Array.isArray(otherWord.proposers)) return;

            // 判断是否有共同 proposer
            const hasCommon = otherWord.proposers.some(p => {
                const otherName = p?.name?.zh;
                return otherName && proposerNames.includes(otherName);
            });
            if (hasCommon) {
                const key = `${thisWord.id}->${otherWord.id}:proposer`;
                addLineSpec(thisWord.id, otherWord.id, RELATION_TYPES.proposer, key);
            }
        });
    }

    if (lineSpecs.length === 0) return;

    const nodeCenterCache = new Map();
    const getNodeCenter = (id) => {
        if (nodeCenterCache.has(id)) return nodeCenterCache.get(id);
        const node = document.getElementById(String(id));
        const center = node ? getCenterPosition(node) : null;
        nodeCenterCache.set(id, center);
        return center;
    };

    const grouped = new Map();
    lineSpecs.forEach(spec => {
        const groupKey = String(spec.id1);
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey).push(spec);
    });

    grouped.forEach((specs) => {
        const sourceCenter = getNodeCenter(specs[0].id1);
        if (sourceCenter) {
            specs.sort((a, b) => {
                const aCenter = getNodeCenter(a.id2);
                const bCenter = getNodeCenter(b.id2);
                const angleA = aCenter ? Math.atan2(aCenter.y - sourceCenter.y, aCenter.x - sourceCenter.x) : 0;
                const angleB = bCenter ? Math.atan2(bCenter.y - sourceCenter.y, bCenter.x - sourceCenter.x) : 0;
                return angleA - angleB;
            });
        }

        const total = specs.length;
        specs.forEach((spec, index) => {
            drawLine(spec.id1, spec.id2, spec.relation, index, total);
        });
    });
}

// 导出隐藏tooltip函数，供其他模块使用
export { hideTooltip };
