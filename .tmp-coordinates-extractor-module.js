    const uploadBtn = document.getElementById('uploadBtn');
    const pdfInput = document.getElementById('pdfInput');
    const uploadStep = document.getElementById('uploadStep');
    const viewerStep = document.getElementById('viewerStep');
    const coordinatesStep = document.getElementById('coordinatesStep');
    const pointsMapStep = document.getElementById('pointsMapStep');
    const viewerFileName = document.getElementById('viewerFileName');
    const pagesHost = document.getElementById('pagesHost');
    const pointsMapHost = document.getElementById('pointsMapHost');
    const viewerWrap = document.getElementById('viewerWrap');
    const handToolBtn = document.getElementById('handToolBtn');
    const selectToolBtn = document.getElementById('selectToolBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomLabel = document.getElementById('zoomLabel');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageLabel = document.getElementById('pageLabel');
    const fileHint = document.getElementById('fileHint');
    const extractBtn = document.getElementById('extractBtn');
    const backToViewerBtn = document.getElementById('backToViewerBtn');
    const exportBtn = document.getElementById('exportBtn');
    const backToCoordsBtn = document.getElementById('backToCoordsBtn');
    const toggleSatelliteBtn = document.getElementById('toggleSatelliteBtn');
    const resultsShell = document.getElementById('resultsShell');
    const resultsCount = document.getElementById('resultsCount');
    const resultsBody = document.getElementById('resultsBody');
    const exportModal = document.getElementById('exportModal');
    const closeExportModalBtn = document.getElementById('closeExportModalBtn');
    const showOnMapBtn = document.getElementById('showOnMapBtn');
    const sourceCrsSelect = document.getElementById('sourceCrsSelect');
    const exportFormatBtns = Array.from(document.querySelectorAll('[data-export-format]'));
    const currentStepValue = document.getElementById('currentStepValue');
    const fileStatusValue = document.getElementById('fileStatusValue');
    const selectionCountValue = document.getElementById('selectionCountValue');
    const rowsCountValue = document.getElementById('rowsCountValue');
    const stageMessage = document.getElementById('stageMessage');
    const workflowSteps = Array.from(document.querySelectorAll('[data-step-marker]'));

    let pdfDoc = null;
    let pdfApiModule = null;
    let zoom = 1;
    let toolMode = 'hand';
    let selections = [];
    let activeSelectionId = null;
    let selectionCounter = 0;
    let drawSession = null;
    let panSession = null;
    let extractedRows = [];
    let leafletMap = null;
    let leafletLayer = null;
    let pagePixelSize = { width: 1, height: 1 };
    let currentPageNumber = 1;
    let drawStartLatLng = null;
    let tempRectLayer = null;
    let isResizingSelection = false;
    let tesseractModule = null;
    let ocrWorker = null;
    let extractedSelectionIds = new Set();
    let lastExtractedRowId = 0;
    let pointsLeafletMap = null;
    let pointsLayerGroup = null;
    let pointsBaseLayer = null;
    let pointsSatelliteLayer = null;
    let isSatelliteMode = false;
    let activeStep = 'upload';
    let exportSuggestedBaseName = 'extracted-coordinates';
    const PDF_JS_MODULE_PATH = '../../LIP/vendor/pdfjs/pdf.min.mjs';
    const PDF_JS_WORKER_PATH = '../../LIP/vendor/pdfjs/pdf.worker.min.mjs';
    const TESSERACT_MODULE_PATH = '../../LIP/vendor/tesseract/tesseract.esm.min.js';
    const TESSERACT_WORKER_PATH = '../../LIP/vendor/tesseract/worker.min.js';
    const TESSERACT_CORE_PATH = '../../LIP/vendor/tesseract/tesseract-core.wasm.js';
    const TESSERACT_LANG_PATH = '../../LIP/vendor/tesseract/lang';
    const MAP_MIN_ZOOM = -5;
    const MAP_MAX_ZOOM = 0;
    const DEFAULT_ZOOM_PERCENT = 40;
    const MOBILE_DEFAULT_ZOOM_PERCENT = 28;
    const RESULTS_FIELDS = [
        { key: 'name', label: 'الاسم' },
        { key: 'northing', label: 'Northing' },
        { key: 'easting', label: 'Easting' },
        { key: 'elevation', label: 'Elevation' },
        { key: 'code', label: 'Code' }
    ];
    const CRS_OPTIONS = {
        DLTM: {
            label: 'DLTM',
            proj4: '+proj=tmerc +lat_0=0 +lon_0=55.3333333333333 +k=1 +x_0=500000 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs'
        },
        UTM40N: {
            label: 'UTM Z40N',
            proj4: '+proj=utm +zone=40 +datum=WGS84 +units=m +no_defs +type=crs'
        },
        UTM39N: {
            label: 'UTM Z39N',
            proj4: '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs +type=crs'
        }
    };

    function openCoordinatesExportForm() {
        if (!window.AtlasCoordinatesExport) {
            alert('تعذر فتح فورم التصدير الآن.');
            return;
        }
        window.AtlasCoordinatesExport.open(extractedRows, {
            sourceTitle: 'استخراج الإحداثيات من PDF',
            sourcePage: 'coordinates-extractor',
            sourceCrs: sourceCrsSelect?.value || 'DLTM',
            suggestedBaseName: exportSuggestedBaseName
        });
    }

    if (window.AtlasCoordinatesExport?.registerProvider) {
        window.AtlasCoordinatesExport.registerProvider(
            () => ({
                rows: extractedRows,
                meta: {
                    sourceTitle: 'استخراج الإحداثيات من PDF',
                    sourcePage: 'coordinates-extractor',
                    sourceCrs: sourceCrsSelect?.value || 'DLTM',
                    suggestedBaseName: exportSuggestedBaseName
                }
            }),
            { id: 'coordinates-extractor' }
        );
    }

    const STEP_DETAILS = {
        upload: {
            label: 'رفع الملف',
            message: 'ابدأ برفع ملف PDF الذي يحتوي على جدول الإحداثيات.'
        },
        viewer: {
            label: 'تحديد الجدول',
            message: 'حرّك الملف وحدد الجدول المطلوب قبل استخراج الإحداثيات.'
        },
        coordinates: {
            label: 'مراجعة النتائج',
            message: 'راجع الصفوف المستخرجة ثم اعرضها على الماب أو صدّرها.'
        },
        'points-map': {
            label: 'عرض النقاط',
            message: 'تحقق من مواقع النقاط على الماب قبل التصدير النهائي.'
        }
    };

    function isWorkflowStepComplete(stepName) {
        if (stepName === 'upload') return Boolean(pdfDoc);
        if (stepName === 'viewer') return selections.length > 0;
        if (stepName === 'coordinates') return extractedRows.length > 0;
        if (stepName === 'points-map') return activeStep === 'points-map';
        return false;
    }

    function updateWorkspaceSummary() {
        const details = STEP_DETAILS[activeStep] || STEP_DETAILS.upload;
        currentStepValue.textContent = details.label;
        fileStatusValue.textContent = pdfDoc ? 'جاهز' : 'غير مرفوع';
        selectionCountValue.textContent = String(selections.length);
        rowsCountValue.textContent = String(extractedRows.length);
        stageMessage.textContent = details.message;

        workflowSteps.forEach((item) => {
            const stepName = item.dataset.stepMarker;
            item.classList.toggle('active', stepName === activeStep);
            item.classList.toggle('done', isWorkflowStepComplete(stepName));
        });
    }

    function showStep(stepName) {
        activeStep = stepName;
        uploadStep.classList.toggle('hidden', stepName !== 'upload');
        viewerStep.classList.toggle('hidden', stepName !== 'viewer');
        coordinatesStep.classList.toggle('hidden', stepName !== 'coordinates');
        pointsMapStep.classList.toggle('hidden', stepName !== 'points-map');
        updateWorkspaceSummary();
        if (stepName === 'viewer') {
            setTimeout(() => leafletMap?.invalidateSize(), 0);
        }
        if (stepName === 'points-map') {
            setTimeout(() => pointsLeafletMap?.invalidateSize(), 0);
        }
    }

    function updateExtractActionState() {
        extractBtn.disabled = !pdfDoc || selections.length === 0;
        updateWorkspaceSummary();
    }

    function updateResultsCount() {
        resultsCount.textContent = `${extractedRows.length} سطر`;
        updateWorkspaceSummary();
    }

    function renderExtractedRows() {
        resultsBody.innerHTML = '';
        extractedRows.forEach((row) => {
            const tr = document.createElement('tr');

            RESULTS_FIELDS.forEach(({ key, label }) => {
                const td = document.createElement('td');
                td.dataset.label = label;
                td.textContent = row[key] ?? '';
                tr.appendChild(td);
            });

            const actionTd = document.createElement('td');
            actionTd.dataset.label = 'إجراء';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'row-del-btn';
            deleteBtn.dataset.rowId = String(row.id);
            deleteBtn.textContent = 'حذف';

            actionTd.appendChild(deleteBtn);
            tr.appendChild(actionTd);
            resultsBody.appendChild(tr);
        });
        updateResultsCount();
        resultsShell.classList.toggle('hidden', extractedRows.length === 0);
        exportBtn.disabled = extractedRows.length === 0;
        showOnMapBtn.disabled = extractedRows.length === 0;
        window.AtlasCoordinatesExport?.updateButtonState?.();
    }

    function getDefaultZoomPercent() {
        return window.matchMedia('(max-width: 640px)').matches
            ? MOBILE_DEFAULT_ZOOM_PERCENT
            : DEFAULT_ZOOM_PERCENT;
    }

    function removeExtractedRow(rowId) {
        extractedRows = extractedRows.filter((row) => row.id !== rowId);
        renderExtractedRows();
    }

    async function getPdfApi() {
        if (pdfApiModule) return pdfApiModule;
        const mod = await import(PDF_JS_MODULE_PATH);
        mod.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_PATH;
        pdfApiModule = mod;
        return mod;
    }

    async function getOcrWorker() {
        if (ocrWorker) return ocrWorker;
        if (!tesseractModule) {
            const loaded = await import(TESSERACT_MODULE_PATH);
            tesseractModule = loaded?.default ?? loaded;
        }
        if (!tesseractModule?.createWorker) {
            return null;
        }
        ocrWorker = await tesseractModule.createWorker('eng', 1, {
            workerPath: TESSERACT_WORKER_PATH,
            corePath: TESSERACT_CORE_PATH,
            langPath: `${TESSERACT_LANG_PATH}/`
        });
        await ocrWorker.setParameters({
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6',
            user_defined_dpi: '300'
        });
        return ocrWorker;
    }

    function setMode(mode) {
        toolMode = mode;
        handToolBtn.classList.toggle('active', mode === 'hand');
        selectToolBtn.classList.toggle('active', mode === 'select');
        viewerWrap.classList.toggle('hand-mode', mode === 'hand');
        if (leafletMap) {
            if (mode === 'hand') {
                leafletMap.dragging.enable();
                leafletMap.doubleClickZoom.enable();
                pagesHost.style.cursor = 'grab';
            } else {
                leafletMap.dragging.disable();
                leafletMap.doubleClickZoom.disable();
                pagesHost.style.cursor = 'crosshair';
            }
            renderAllSelections();
        }
    }

    function updateZoomLabel() {
        if (leafletMap) {
            const z = clamp(leafletMap.getZoom(), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
            const ratio = (z - MAP_MIN_ZOOM) / (MAP_MAX_ZOOM - MAP_MIN_ZOOM);
            const percent = Math.round(5 + (ratio * 50));
            zoomLabel.textContent = `${percent}%`;
            return;
        }
        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    function zoomLevelFromPercent(percent) {
        const clampedPercent = clamp(percent, 5, 55);
        const ratio = (clampedPercent - 5) / 50;
        return MAP_MIN_ZOOM + (ratio * (MAP_MAX_ZOOM - MAP_MIN_ZOOM));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function updatePageLabel() {
        const total = pdfDoc ? pdfDoc.numPages : 1;
        pageLabel.textContent = `${currentPageNumber} / ${total}`;
        prevPageBtn.disabled = currentPageNumber <= 1;
        nextPageBtn.disabled = currentPageNumber >= total;
    }

    function latLngFromPixel(x, y) {
        return L.latLng(y, x);
    }

    function ensureLeafletMap() {
        if (leafletMap) return;
        leafletMap = L.map(pagesHost, {
            crs: L.CRS.Simple,
            zoomControl: false,
            attributionControl: false,
            minZoom: MAP_MIN_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            zoomSnap: 0.25,
            zoomDelta: 0.25
        });
        leafletMap.setView([0, 0], 0);
        leafletMap.on('zoomend', updateZoomLabel);
    }

    function clearTempRect() {
        if (tempRectLayer) {
            leafletMap.removeLayer(tempRectLayer);
            tempRectLayer = null;
        }
    }

    function styleSelectionLayer(layer, isActive) {
        layer.setStyle({
            color: isActive ? '#f1873e' : '#0a7f8a',
            weight: 2,
            dashArray: '6,4',
            fillOpacity: isActive ? 0.18 : 0.12
        });
    }


    function createSelectionNode(pageEl, selectionId) {
        const box = document.createElement('div');
        box.className = 'table-selection';
        box.dataset.selectionId = String(selectionId);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'selection-delete';
        deleteBtn.type = 'button';
        deleteBtn.title = 'حذف التحديد';
        deleteBtn.setAttribute('aria-label', 'حذف التحديد');
        deleteBtn.textContent = '×';
        box.appendChild(deleteBtn);

        ['nw', 'ne', 'sw', 'se'].forEach((dir) => {
            const handle = document.createElement('span');
            handle.className = `selection-handle ${dir}`;
            handle.dataset.dir = dir;
            box.appendChild(handle);
        });
        pageEl.appendChild(box);
        return box;
    }

    function findSelectionById(selectionId) {
        return selections.find((item) => item.id === selectionId) || null;
    }

    function setActiveSelection(selectionId, rerender = true) {
        activeSelectionId = selectionId;
        selections.forEach((item) => {
            if (!item.layer) return;
            styleSelectionLayer(item.layer, item.id === selectionId);
        });
        if (rerender && leafletMap) {
            renderAllSelections();
        }
    }

    function removeSelectionById(selectionId) {
        const index = selections.findIndex((item) => item.id === selectionId);
        if (index === -1) return;

        const [removed] = selections.splice(index, 1);
        if (removed?.layer && leafletMap) leafletMap.removeLayer(removed.layer);
        if (removed?.deleteMarker && leafletMap) leafletMap.removeLayer(removed.deleteMarker);
        if (removed?.handleMarkers && leafletMap) {
            Object.values(removed.handleMarkers).forEach((marker) => leafletMap.removeLayer(marker));
        }

        if (!selections.length) {
            activeSelectionId = null;
            updateExtractActionState();
            return;
        }

        if (activeSelectionId === selectionId || !findSelectionById(activeSelectionId)) {
            activeSelectionId = selections[selections.length - 1].id;
        }
        setActiveSelection(activeSelectionId);
        updateExtractActionState();
    }

    function getSelectionPixels(selection) {
        const left = selection.leftRatio * pagePixelSize.width;
        const top = selection.topRatio * pagePixelSize.height;
        const right = left + (selection.widthRatio * pagePixelSize.width);
        const bottom = top + (selection.heightRatio * pagePixelSize.height);
        return { left, top, right, bottom };
    }

    function setSelectionPixels(selection, left, top, right, bottom) {
        const minSize = 12;
        const clampedLeft = clamp(left, 0, pagePixelSize.width - minSize);
        const clampedTop = clamp(top, 0, pagePixelSize.height - minSize);
        const clampedRight = clamp(right, clampedLeft + minSize, pagePixelSize.width);
        const clampedBottom = clamp(bottom, clampedTop + minSize, pagePixelSize.height);

        selection.leftRatio = clampedLeft / pagePixelSize.width;
        selection.topRatio = clampedTop / pagePixelSize.height;
        selection.widthRatio = (clampedRight - clampedLeft) / pagePixelSize.width;
        selection.heightRatio = (clampedBottom - clampedTop) / pagePixelSize.height;
    }

    function clearSelectionHandles(selection) {
        if (!selection?.handleMarkers || !leafletMap) return;
        Object.values(selection.handleMarkers).forEach((marker) => leafletMap.removeLayer(marker));
        selection.handleMarkers = null;
        isResizingSelection = false;
    }

    function updateSelectionVisual(selection) {
        if (!selection?.layer || selection.pageNumber !== currentPageNumber) return;
        const { left, top, right, bottom } = getSelectionPixels(selection);
        const bounds = L.latLngBounds(latLngFromPixel(left, top), latLngFromPixel(right, bottom));
        selection.layer.setBounds(bounds);
        if (selection.deleteMarker) {
            selection.deleteMarker.setLatLng(latLngFromPixel(left, top));
        }
        if (selection.handleMarkers) {
            selection.handleMarkers.nw.setLatLng(latLngFromPixel(left, top));
            selection.handleMarkers.ne.setLatLng(latLngFromPixel(right, top));
            selection.handleMarkers.sw.setLatLng(latLngFromPixel(left, bottom));
            selection.handleMarkers.se.setLatLng(latLngFromPixel(right, bottom));
        }
    }

    function resizeSelectionByCorner(selection, corner, latlng) {
        const pointX = clamp(latlng.lng, 0, pagePixelSize.width);
        const pointY = clamp(latlng.lat, 0, pagePixelSize.height);
        const minSize = 12;
        const current = getSelectionPixels(selection);
        let { left, top, right, bottom } = current;

        if (corner === 'nw') {
            left = Math.min(pointX, right - minSize);
            top = Math.min(pointY, bottom - minSize);
        } else if (corner === 'ne') {
            right = Math.max(pointX, left + minSize);
            top = Math.min(pointY, bottom - minSize);
        } else if (corner === 'sw') {
            left = Math.min(pointX, right - minSize);
            bottom = Math.max(pointY, top + minSize);
        } else if (corner === 'se') {
            right = Math.max(pointX, left + minSize);
            bottom = Math.max(pointY, top + minSize);
        }

        setSelectionPixels(selection, left, top, right, bottom);
        updateSelectionVisual(selection);
    }

    function createResizeHandles(selection) {
        if (!leafletMap || selection.pageNumber !== currentPageNumber) return;
        if (toolMode !== 'select' || selection.id !== activeSelectionId) return;
        const { left, top, right, bottom } = getSelectionPixels(selection);
        const makeHandle = (corner, x, y) => {
            const marker = L.marker(latLngFromPixel(x, y), {
                draggable: true,
                keyboard: false,
                icon: L.divIcon({
                    className: '',
                    html: '<div class="selection-resize-handle"></div>',
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                })
            }).addTo(leafletMap);

            marker.on('drag', (event) => {
                resizeSelectionByCorner(selection, corner, event.target.getLatLng());
            });
            marker.on('dragstart', () => {
                isResizingSelection = true;
                clearTempRect();
            });
            marker.on('dragend', () => {
                isResizingSelection = false;
            });
            marker.on('mousedown', (event) => {
                isResizingSelection = true;
                L.DomEvent.stopPropagation(event);
            });
            marker.on('mouseup', (event) => {
                L.DomEvent.stopPropagation(event);
                setTimeout(() => { isResizingSelection = false; }, 0);
            });
            marker.on('click', () => setActiveSelection(selection.id));
            return marker;
        };

        selection.handleMarkers = {
            nw: makeHandle('nw', left, top),
            ne: makeHandle('ne', right, top),
            sw: makeHandle('sw', left, bottom),
            se: makeHandle('se', right, bottom)
        };
    }

    function downloadText(data, fileName, mimeType = 'text/plain;charset=utf-8') {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function sanitizeExportBaseName(baseName, fallback = 'extracted-coordinates') {
        const cleaned = String(baseName || '')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/g, '')
            .trim();
        return cleaned || fallback;
    }

    function deriveSuggestedFileBaseName(fileName, fallback = 'extracted-coordinates') {
        const rawName = String(fileName || '').split(/[\\/]/).pop() || '';
        const withoutExt = rawName.replace(/\.[^.]+$/, '');
        return sanitizeExportBaseName(withoutExt, fallback);
    }

    function promptExportFileName(extension, suggestedBaseName) {
        const safeExt = String(extension || '').replace(/^\./, '').toLowerCase();
        const safeBase = sanitizeExportBaseName(suggestedBaseName, 'extracted-coordinates');
        const answer = window.prompt(`اكتب اسم الملف للتصدير (${safeExt.toUpperCase()})`, safeBase);
        if (answer === null) return null;
        const typedBase = sanitizeExportBaseName(answer, safeBase);
        if (typedBase.toLowerCase().endsWith(`.${safeExt}`)) {
            return typedBase;
        }
        return `${typedBase}.${safeExt}`;
    }

    function escapeCsvCell(value) {
        const text = String(value ?? '');
        if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
        return text;
    }

    function splitLineToColumns(lineText) {
        const cleaned = lineText
            .replace(/\u00A0/g, ' ')
            .replace(/[،]/g, ',')
            .trim();

        if (!cleaned) return [];

        let parts = cleaned
            .split(/\t+|\s{2,}|[|]+/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length <= 1) {
            parts = cleaned
                .split(/[;,]|(?<=\d)\s+(?=[-+]?\d)/)
                .map((part) => part.trim())
                .filter(Boolean);
        }

        if (parts.length <= 1) {
            parts = cleaned.split(/\s+/).filter(Boolean);
        }

        return parts;
    }

    function normalizeExtractedText(text) {
        return String(text || '')
            .replace(/\u00A0/g, ' ')
            .replace(/[،٬]/g, ',')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeNumberString(value) {
        return String(value || '').replace(/,/g, '.');
    }

    function parseNumeric(value) {
        const num = Number(normalizeNumberString(value));
        return Number.isFinite(num) ? num : null;
    }

    const NORTHING_INTEGER_DIGITS = 7;
    const EASTING_INTEGER_DIGITS = 6;

    function integerDigitLength(value) {
        const normalized = normalizeNumberString(value).replace(/^[-+]/, '');
        const integerPart = normalized.split('.')[0] || '';
        return integerPart.replace(/[^\d]/g, '').length;
    }

    function hasExpectedCoordinateDigits(northingValue, eastingValue) {
        return (
            integerDigitLength(northingValue) === NORTHING_INTEGER_DIGITS &&
            integerDigitLength(eastingValue) === EASTING_INTEGER_DIGITS
        );
    }

    function coordinatePairScore(northingValue, eastingValue) {
        const northingNum = parseNumeric(northingValue);
        const eastingNum = parseNumeric(eastingValue);
        if (!looksLikeCoord(northingNum) || !looksLikeCoord(eastingNum)) return Number.NEGATIVE_INFINITY;

        const northingDigits = integerDigitLength(northingValue);
        const eastingDigits = integerDigitLength(eastingValue);
        let score = 0;

        if (northingDigits === NORTHING_INTEGER_DIGITS) score += 16;
        else if (northingDigits >= NORTHING_INTEGER_DIGITS) score += 7;
        else if (northingDigits >= NORTHING_INTEGER_DIGITS - 1) score += 3;

        if (eastingDigits === EASTING_INTEGER_DIGITS) score += 16;
        else if (eastingDigits >= EASTING_INTEGER_DIGITS) score += 7;
        else if (eastingDigits >= EASTING_INTEGER_DIGITS - 1) score += 3;

        if (northingDigits === EASTING_INTEGER_DIGITS && eastingDigits === NORTHING_INTEGER_DIGITS) {
            score -= 12;
        }

        const magnitudeGap = Math.abs(Math.abs(northingNum) - Math.abs(eastingNum));
        if (magnitudeGap >= 100000) score += 3;
        else if (magnitudeGap >= 10000) score += 1;

        return score;
    }

    function isLikelyCoordinatePair(northingValue, eastingValue, requireExpectedDigits = false) {
        if (requireExpectedDigits && !hasExpectedCoordinateDigits(northingValue, eastingValue)) {
            return false;
        }
        const score = coordinatePairScore(northingValue, eastingValue);
        return Number.isFinite(score) && score >= 8;
    }

    function isLikelyHeaderLine(lineText) {
        const text = normalizeExtractedText(lineText).toLowerCase();
        if (!text) return true;
        const headerHints = [
            'point id',
            'point x',
            'point y',
            'northing',
            'easting',
            'elevation',
            'project',
            'application',
            'details',
            'coordinate format',
            'angle unit',
            'pressure unit',
            'tempurature unit'
        ];
        return headerHints.some((hint) => text.includes(hint));
    }

    function isPointIdToken(token) {
        const t = String(token || '').trim();
        if (!t) return false;
        if (t.length > 24) return false;
        if (!/[a-zA-Z0-9]/.test(t)) return false;
        // avoid treating decimal coordinate as point id
        if (/^-?\d+\.\d+$/.test(t)) return false;
        return true;
    }

    function looksLikeCoord(num) {
        return Number.isFinite(num) && Math.abs(num) >= 10000;
    }

    function looksLikeElevation(num) {
        return Number.isFinite(num) && Math.abs(num) <= 10000;
    }

    function extractCoordinateRowsFromLines(lines, tableId, pageNumber, nextIdFactory, nextRowFactory) {
        const sourceLines = Array.isArray(lines) ? lines : [];
        const rows = [];
        const signatures = new Set();

        sourceLines.forEach((lineText) => {
            if (!lineText || isLikelyHeaderLine(lineText)) return;
            const normalized = normalizeExtractedText(lineText);
            const tokens = normalized.split(/\s+/).filter(Boolean);
            if (tokens.length < 3) return;

            let i = 0;
            while (i <= tokens.length - 3) {
                const idToken = tokens[i];
                const nToken = tokens[i + 1];
                const eToken = tokens[i + 2];
                if (!isPointIdToken(idToken) || !isLikelyCoordinatePair(nToken, eToken, true)) {
                    i += 1;
                    continue;
                }

                let elevation = '';
                let code = '';
                let advance = 3;

                const zToken = tokens[i + 3];
                const z = parseNumeric(zToken);
                if (looksLikeElevation(z)) {
                    elevation = normalizeNumberString(zToken);
                    advance += 1;
                }

                const codeToken = tokens[i + advance];
                const startsNextPoint = (
                    isPointIdToken(codeToken) &&
                    isLikelyCoordinatePair(tokens[i + advance + 1], tokens[i + advance + 2], true)
                );
                if (codeToken && !startsNextPoint && !Number.isFinite(parseNumeric(codeToken)) && isPointIdToken(codeToken)) {
                    code = codeToken;
                    advance += 1;
                }

                const row = {
                    id: nextIdFactory(),
                    tableId,
                    pageNumber,
                    rowNumber: nextRowFactory(),
                    name: idToken,
                    northing: normalizeNumberString(nToken),
                    easting: normalizeNumberString(eToken),
                    elevation,
                    code,
                    cols: [idToken, nToken, eToken, elevation, code].filter(Boolean),
                    rawText: normalized
                };

                const signature = `${row.name}|${row.northing}|${row.easting}|${row.elevation}|${row.code}`;
                if (!signatures.has(signature)) {
                    signatures.add(signature);
                    rows.push(row);
                }

                i += advance;
            }
        });

        return rows;
    }

    function mapColumnsToCoordinateFields(lineText, cols) {
        const normalized = normalizeExtractedText(lineText);
        const fallbackCols = Array.isArray(cols) ? cols : [];

        const matches = [...normalized.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)].map((m) => ({
            raw: m[0],
            value: normalizeNumberString(m[0]),
            index: m.index ?? 0,
            end: (m.index ?? 0) + m[0].length
        }));

        if (matches.length >= 3) {
            // Score each 3-number window and pick the most coordinate-like one.
            let startIdx = 0;
            let bestScore = Number.NEGATIVE_INFINITY;
            for (let i = 0; i <= matches.length - 3; i += 1) {
                const a = matches[i];
                const b = matches[i + 1];
                const c = matches[i + 2];
                const aNum = parseNumeric(a.value);
                const bNum = parseNumeric(b.value);
                const cNum = parseNumeric(c.value);
                if (aNum === null || bNum === null || cNum === null) continue;

                const aDigits = integerDigitLength(a.value);
                const bDigits = integerDigitLength(b.value);
                let score = coordinatePairScore(a.value, b.value);
                if (!Number.isFinite(score)) continue;

                if (hasExpectedCoordinateDigits(a.value, b.value)) score += 30;
                if (hasExpectedCoordinateDigits(b.value, a.value)) score -= 10;

                // Elevation is usually much smaller than N/E magnitudes.
                if (Math.abs(cNum) <= 10000) score += 2;
                else if (Math.abs(cNum) <= 100000) score += 1;

                // Favor windows after an initial point/serial number.
                if (i > 0) score += 1;

                // Keep a soft fallback for near-matches when OCR drops one digit.
                if (Math.abs(aDigits - NORTHING_INTEGER_DIGITS) <= 1) score += 1;
                if (Math.abs(bDigits - EASTING_INTEGER_DIGITS) <= 1) score += 1;

                if (score > bestScore) {
                    bestScore = score;
                    startIdx = i;
                }
            }

            const n = matches[startIdx];
            const e = matches[startIdx + 1];
            const z = matches[startIdx + 2];

            const name = normalizeExtractedText(normalized.slice(0, n.index));
            const code = normalizeExtractedText(normalized.slice(z.end));

            return {
                name: name || (fallbackCols[0] ?? ''),
                northing: n.value,
                easting: e.value,
                elevation: z.value,
                code: code || (fallbackCols[4] ?? '')
            };
        }

        // Fallback to column split if regex-based extraction is insufficient.
        return {
            name: fallbackCols[0] ?? '',
            northing: normalizeNumberString(fallbackCols[1] ?? ''),
            easting: normalizeNumberString(fallbackCols[2] ?? ''),
            elevation: normalizeNumberString(fallbackCols[3] ?? ''),
            code: fallbackCols[4] ?? ''
        };
    }

    function isLikelyCoordinateRow(mapped, lineText) {
        const numericCount = (String(lineText || '').match(/[-+]?\d+(?:[.,]\d+)?/g) || []).length;
        if (numericCount < 3) return false;

        const n = parseNumeric(mapped?.northing);
        const e = parseNumeric(mapped?.easting);
        const z = parseNumeric(mapped?.elevation);
        if (n === null || e === null || z === null) return false;

        if (!isLikelyCoordinatePair(mapped?.northing, mapped?.easting, true)) return false;
        if (Math.abs(z) > 10000) return false;

        return true;
    }

    function buildCoordinateDraftFromLineText(lineText, tableId, pageNumber, rowNumber, id) {
        if (typeof lineText !== 'string' || !lineText.trim()) return null;
        const cols = splitLineToColumns(lineText);
        const mapped = mapColumnsToCoordinateFields(lineText, cols);

        if (isLikelyCoordinateRow(mapped, lineText)) {
            return {
                id,
                tableId,
                pageNumber,
                rowNumber,
                name: mapped.name,
                northing: mapped.northing,
                easting: mapped.easting,
                elevation: mapped.elevation,
                code: mapped.code,
                cols,
                rawText: lineText
            };
        }

        return null;
    }

    function buildPackedCoordinateDraftsFromLineText(lineText, tableId, pageNumber, nextIdFactory, nextRowFactory) {
        const normalized = normalizeExtractedText(lineText);
        if (!normalized) return [];

        const tokens = normalized.split(/\s+/).filter(Boolean);
        if (tokens.length < 6) return [];

        const rows = [];
        let i = 0;
        while (i <= tokens.length - 3) {
            const nameToken = tokens[i];
            const nToken = tokens[i + 1];
            const eToken = tokens[i + 2];

            // Packed pattern: [point-id/name] [northing] [easting]
            if (isLikelyCoordinatePair(nToken, eToken, true)) {
                let elevation = '';
                let advance = 3;

                // Optional elevation token if present and not starting next packed point.
                if (i + 3 < tokens.length) {
                    const zToken = tokens[i + 3];
                    const z = parseNumeric(zToken);
                    const nextLooksLikePacked = isLikelyCoordinatePair(tokens[i + 4], tokens[i + 5], true);
                    if (z !== null && Math.abs(z) < 10000 && !nextLooksLikePacked) {
                        elevation = normalizeNumberString(zToken);
                        advance = 4;
                    }
                }

                rows.push({
                    id: nextIdFactory(),
                    tableId,
                    pageNumber,
                    rowNumber: nextRowFactory(),
                    name: nameToken,
                    northing: normalizeNumberString(nToken),
                    easting: normalizeNumberString(eToken),
                    elevation,
                    code: '',
                    cols: [nameToken, nToken, eToken, elevation].filter(Boolean),
                    rawText: `${nameToken} ${nToken} ${eToken}${elevation ? ` ${elevation}` : ''}`
                });

                i += advance;
                continue;
            }

            i += 1;
        }

        // Only trust this parser when it detected multiple packed points.
        return rows.length >= 2 ? rows : [];
    }

    function buildRowsFromLineWindows(lines, tableId, pageNumber, nextIdFactory) {
        const normalizedLines = (Array.isArray(lines) ? lines : [])
            .map((line) => normalizeExtractedText(line))
            .filter(Boolean);
        const rows = [];
        const seenSignatures = new Set();

        for (let start = 0; start < normalizedLines.length; start += 1) {
            let bestDraft = null;
            let bestEnd = start;
            let bestScore = Number.NEGATIVE_INFINITY;

            for (let end = start; end < normalizedLines.length && end <= start + 3; end += 1) {
                const candidate = normalizedLines.slice(start, end + 1).join(' ').replace(/\s+/g, ' ').trim();
                const draft = buildCoordinateDraftFromLineText(
                    candidate,
                    tableId,
                    pageNumber,
                    rows.length + 1,
                    nextIdFactory()
                );
                if (!draft) continue;

                const numericCount = (candidate.match(/[-+]?\d+(?:[.,]\d+)?/g) || []).length;
                const score = (isLikelyCoordinateRow(draft, candidate) ? 1000 : 0) + (numericCount * 10) + candidate.length;
                if (score > bestScore) {
                    bestDraft = draft;
                    bestEnd = end;
                    bestScore = score;
                }
            }

            if (!bestDraft) continue;

            const signature = [
                normalizeNumberString(bestDraft.northing),
                normalizeNumberString(bestDraft.easting),
                normalizeNumberString(bestDraft.elevation),
                normalizeExtractedText(bestDraft.name)
            ].join('|');

            if (seenSignatures.has(signature)) {
                continue;
            }

            seenSignatures.add(signature);
            bestDraft.rowNumber = rows.length + 1;
            rows.push(bestDraft);
            start = bestEnd;
        }

        return rows;
    }

    function buildCsv(rows) {
        const lines = [];
        rows.forEach((row) => {
            const cells = [
                row.name ?? '',
                row.northing ?? '',
                row.easting ?? '',
                row.elevation ?? '',
                row.code ?? ''
            ];
            lines.push(cells.map(escapeCsvCell).join(','));
        });

        return lines.join('\n');
    }

    async function extractTextRowsFromSelection(selection) {
        const pdfApi = await getPdfApi();
        const page = await pdfDoc.getPage(selection.pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        const rect = {
            left: selection.leftRatio * viewport.width,
            top: selection.topRatio * viewport.height,
            width: selection.widthRatio * viewport.width,
            height: selection.heightRatio * viewport.height
        };
        rect.right = rect.left + rect.width;
        rect.bottom = rect.top + rect.height;
        const pointInsideRect = (x, y, targetRect) => (
            x >= targetRect.left &&
            x <= targetRect.right &&
            y >= targetRect.top &&
            y <= targetRect.bottom
        );

        const words = [];
        textContent.items.forEach((item) => {
            const text = String(item.str || '').trim();
            if (!text) return;

            const tx = pdfApi.Util.transform(viewport.transform, item.transform);
            const x = tx[4];
            const y = tx[5];
            const h = Math.max(1, item.height || Math.hypot(tx[2], tx[3]));
            const w = Math.max(1, item.width || Math.hypot(tx[0], tx[1]));

            const tokenRect = {
                left: x,
                top: y - h,
                right: x + w,
                bottom: y
            };
            const centerX = (tokenRect.left + tokenRect.right) / 2;
            const centerY = (tokenRect.top + tokenRect.bottom) / 2;
            if (!pointInsideRect(centerX, centerY, rect)) return;

            words.push({
                text,
                x: tokenRect.left,
                y: (tokenRect.top + tokenRect.bottom) / 2,
                h
            });
        });

        if (words.length === 0) {
            // Fallback: if we didn't capture anything, try a vertical-flip interpretation.
            const flippedRect = {
                left: rect.left,
                right: rect.right,
                top: viewport.height - rect.bottom,
                bottom: viewport.height - rect.top
            };

            textContent.items.forEach((item) => {
                const text = String(item.str || '').trim();
                if (!text) return;
                const tx = pdfApi.Util.transform(viewport.transform, item.transform);
                const x = tx[4];
                const y = tx[5];
                const h = Math.max(1, item.height || Math.hypot(tx[2], tx[3]));
                const w = Math.max(1, item.width || Math.hypot(tx[0], tx[1]));
                const tokenRect = {
                    left: x,
                    top: y - h,
                    right: x + w,
                    bottom: y
                };
                const centerX = (tokenRect.left + tokenRect.right) / 2;
                const centerY = (tokenRect.top + tokenRect.bottom) / 2;
                if (!pointInsideRect(centerX, centerY, flippedRect)) return;
                words.push({
                    text,
                    x: tokenRect.left,
                    y: (tokenRect.top + tokenRect.bottom) / 2,
                    h
                });
            });
        }

        if (!words.length) return [];

        words.sort((a, b) => (a.y - b.y) || (a.x - b.x));
        const lineBuckets = [];

        words.forEach((word) => {
            const yTolerance = Math.max(3, Math.min(12, word.h * 0.75));
            let bucket = lineBuckets.find((line) => Math.abs(line.y - word.y) <= yTolerance);
            if (!bucket) {
                bucket = { y: word.y, h: word.h, words: [] };
                lineBuckets.push(bucket);
            }
            bucket.words.push(word);
            bucket.h = Math.max(bucket.h || 0, word.h || 0);
        });

        lineBuckets.sort((a, b) => a.y - b.y);
        return lineBuckets.map((line) => {
            line.words.sort((a, b) => a.x - b.x);
            const text = line.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
            return text;
        }).filter(Boolean);
    }

    async function extractTextRowsFromSelectionOcr(selection) {
        const worker = await getOcrWorker();
        if (!tesseractModule) {
            const loaded = await import(TESSERACT_MODULE_PATH);
            tesseractModule = loaded?.default ?? loaded;
        }
        const page = await pdfDoc.getPage(selection.pageNumber);
        const smallSelectionBoost = Math.min(selection.widthRatio || 1, selection.heightRatio || 1) < 0.08 ? 2 : 1;
        const scale = 4 * smallSelectionBoost;
        const viewport = page.getViewport({ scale });

        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = Math.floor(viewport.width);
        fullCanvas.height = Math.floor(viewport.height);
        const fullCtx = fullCanvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: fullCtx, viewport }).promise;

        const left = clamp(selection.leftRatio * viewport.width, 0, viewport.width);
        const top = clamp(selection.topRatio * viewport.height, 0, viewport.height);
        const width = clamp(selection.widthRatio * viewport.width, 8, viewport.width - left);
        const height = clamp(selection.heightRatio * viewport.height, 8, viewport.height - top);

        let bestLines = [];
        let bestScore = -1;
        const cropRegions = [];
        cropRegions.push({ left, top, width, height, label: 'tight' });

        const padX = Math.max(24, width * 0.15);
        const padY = Math.max(24, height * 0.2);
        const expandedLeft = clamp(left - padX, 0, viewport.width);
        const expandedTop = clamp(top - padY, 0, viewport.height);
        const expandedRight = clamp(left + width + padX, 0, viewport.width);
        const expandedBottom = clamp(top + height + padY, 0, viewport.height);
        if ((expandedRight - expandedLeft) > width || (expandedBottom - expandedTop) > height) {
            cropRegions.push({
                left: expandedLeft,
                top: expandedTop,
                width: expandedRight - expandedLeft,
                height: expandedBottom - expandedTop,
                label: 'expanded'
            });
        }

        const canvasesToDispose = [];
        for (const region of cropRegions) {
            const cropCanvas = createCropCanvasFromRegion(fullCanvas, region);
            canvasesToDispose.push(cropCanvas);
            const variants = buildOcrVariants(cropCanvas);
            canvasesToDispose.push(...variants.map((variant) => variant.canvas));

            for (const variant of variants) {
                let result;
                try {
                    if (worker && typeof worker.setParameters === 'function') {
                        await worker.setParameters({
                            preserve_interword_spaces: '1',
                            tessedit_pageseg_mode: variant.psm,
                            user_defined_dpi: String(300 * smallSelectionBoost),
                            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-.,()[]/_ '
                        });
                    }

                    if (worker && typeof worker.recognize === 'function') {
                        result = await worker.recognize(variant.canvas);
                    } else if (tesseractModule && typeof tesseractModule.recognize === 'function') {
                        result = await tesseractModule.recognize(variant.canvas, 'eng', {
                            workerPath: TESSERACT_WORKER_PATH,
                            corePath: TESSERACT_CORE_PATH,
                            langPath: `${TESSERACT_LANG_PATH}/`
                        });
                    } else {
                        throw new Error('No OCR API available (createWorker/recognize) in local Tesseract module.');
                    }
                } catch (variantError) {
                    console.warn('OCR variant failed:', `${region.label}:${variant?.name}`, variantError);
                    continue;
                }

                const lines = String(result?.data?.text || '')
                    .split(/\r?\n/)
                    .map((line) => line.replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                const numericWeight = lines.reduce((sum, line) => sum + ((line.match(/\d/g) || []).length), 0);
                const score = (coordinateLikeScore(lines) * 100) + numericWeight;

                if (score > bestScore || (score === bestScore && lines.join('').length > bestLines.join('').length)) {
                    bestScore = score;
                    bestLines = lines;
                }
            }
        }

        fullCanvas.width = 0;
        fullCanvas.height = 0;
        canvasesToDispose.forEach((canvas) => {
            canvas.width = 0;
            canvas.height = 0;
        });

        return bestLines;
    }

    function coordinateLikeScore(lines) {
        return lines.reduce((score, line) => {
            const nums = line.match(/[-+]?\d+(?:[.,]\d+)?/g) || [];
            return score + (nums.length >= 3 ? 1 : 0);
        }, 0);
    }

    function buildOcrVariants(cropCanvas) {
        const width = Math.max(1, cropCanvas.width);
        const height = Math.max(1, cropCanvas.height);
        const minSide = Math.min(width, height);
        const scaleFactor = minSide <= 80 ? 5 : minSide <= 140 ? 4 : minSide <= 220 ? 3 : 2;
        const targetWidth = Math.max(32, Math.floor(width * scaleFactor));
        const targetHeight = Math.max(32, Math.floor(height * scaleFactor));

        const createBaseCanvas = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(cropCanvas, 0, 0, targetWidth, targetHeight);
            return { canvas, ctx };
        };

        const buildGrayscaleCanvas = () => {
            const { canvas, ctx } = createBaseCanvas();
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = img.data;
            for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            ctx.putImageData(img, 0, 0);
            return canvas;
        };

        const buildThresholdCanvas = () => {
            const { canvas, ctx } = createBaseCanvas();
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = img.data;
            let minGray = 255;
            let maxGray = 0;

            for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
                minGray = Math.min(minGray, gray);
                maxGray = Math.max(maxGray, gray);
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }

            const contrast = maxGray - minGray;
            const threshold = contrast < 40
                ? Math.round((minGray + maxGray) / 2)
                : Math.round(minGray + (contrast * 0.62));

            for (let i = 0; i < data.length; i += 4) {
                const gray = data[i];
                const value = gray > threshold ? 255 : 0;
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
            }

            ctx.putImageData(img, 0, 0);
            return canvas;
        };

        const buildSharpenedCanvas = () => {
            const { canvas, ctx } = createBaseCanvas();
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = img.data;
            let minGray = 255;
            let maxGray = 0;

            for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
                minGray = Math.min(minGray, gray);
                maxGray = Math.max(maxGray, gray);
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }

            const contrast = Math.max(1, maxGray - minGray);
            for (let i = 0; i < data.length; i += 4) {
                const normalized = (data[i] - minGray) / contrast;
                const boosted = clamp(Math.round((normalized ** 0.85) * 255), 0, 255);
                data[i] = boosted;
                data[i + 1] = boosted;
                data[i + 2] = boosted;
            }

            ctx.putImageData(img, 0, 0);
            return canvas;
        };

        return [
            { name: 'grayscale', canvas: buildGrayscaleCanvas(), psm: '6' },
            { name: 'threshold', canvas: buildThresholdCanvas(), psm: '6' },
            { name: 'sharpened', canvas: buildSharpenedCanvas(), psm: '11' }
        ];
    }

    function createCropCanvasFromRegion(sourceCanvas, region) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.max(1, Math.floor(region.width));
        cropCanvas.height = Math.max(1, Math.floor(region.height));
        const cropCtx = cropCanvas.getContext('2d', { alpha: false });
        cropCtx.drawImage(
            sourceCanvas,
            Math.floor(region.left), Math.floor(region.top), Math.floor(region.width), Math.floor(region.height),
            0, 0, Math.floor(region.width), Math.floor(region.height)
        );
        return cropCanvas;
    }

    function mergeCoordinateFragments(lines) {
        const normalizedLines = (Array.isArray(lines) ? lines : [])
            .map((line) => normalizeExtractedText(line))
            .filter(Boolean);

        if (!normalizedLines.length) return [];

        const merged = [];
        for (let i = 0; i < normalizedLines.length; i += 1) {
            let candidate = normalizedLines[i];
            const currentNumericCount = (candidate.match(/[-+]?\d+(?:[.,]\d+)?/g) || []).length;

            if (currentNumericCount >= 3) {
                merged.push(candidate);
                continue;
            }

            let bestCandidate = candidate;
            let bestNumericCount = currentNumericCount;

            for (let j = i + 1; j < normalizedLines.length && j <= i + 2; j += 1) {
                candidate = `${candidate} ${normalizedLines[j]}`.replace(/\s+/g, ' ').trim();
                const numericCount = (candidate.match(/[-+]?\d+(?:[.,]\d+)?/g) || []).length;
                if (numericCount > bestNumericCount) {
                    bestCandidate = candidate;
                    bestNumericCount = numericCount;
                }
                if (numericCount >= 3) {
                    bestCandidate = candidate;
                    i = j;
                    break;
                }
            }

            merged.push(bestCandidate);
        }

        return merged.filter(Boolean);
    }

    function shouldRunOcrForSelection(textRows, textScore) {
        const rows = Array.isArray(textRows) ? textRows : [];
        if (!rows.length) return true;

        // Good text-layer result: skip OCR for speed.
        const minGoodLines = Math.max(2, Math.floor(rows.length * 0.35));
        if (textScore >= minGoodLines) return false;

        const numericRichLines = rows.reduce((acc, line) => {
            const nums = (String(line || '').match(/[-+]?\d+(?:[.,]\d+)?/g) || []).length;
            return acc + (nums >= 2 ? 1 : 0);
        }, 0);
        if (numericRichLines >= Math.max(2, Math.floor(rows.length * 0.6))) return false;

        return true;
    }

    async function extractBestRowsFromSelection(selection) {
        const textRows = await extractTextRowsFromSelection(selection);
        const mergedTextRows = mergeCoordinateFragments(textRows);
        const textScore = coordinateLikeScore(mergedTextRows);

        if (!shouldRunOcrForSelection(mergedTextRows, textScore)) {
            return mergedTextRows;
        }

        let ocrRows = [];
        let ocrScore = 0;
        try {
            // OCR runs only when text-layer quality looks weak.
            ocrRows = mergeCoordinateFragments(await extractTextRowsFromSelectionOcr(selection));
            ocrScore = coordinateLikeScore(ocrRows);
        } catch (ocrError) {
            console.warn('OCR fallback failed for selection:', selection?.id, ocrError);
        }
        if (ocrRows.length && ocrScore >= textScore) return ocrRows;
        return mergedTextRows;
    }

    function applySelectionRect(selection) {
        const pageEl = pagesHost.querySelector(`.pdf-page[data-page-number="${selection.pageNumber}"]`);
        if (!pageEl || !selection.boxEl) return;
        const pageRect = pageEl.getBoundingClientRect();
        const left = selection.leftRatio * pageRect.width;
        const top = selection.topRatio * pageRect.height;
        const width = selection.widthRatio * pageRect.width;
        const height = selection.heightRatio * pageRect.height;
        selection.boxEl.style.left = `${left}px`;
        selection.boxEl.style.top = `${top}px`;
        selection.boxEl.style.width = `${width}px`;
        selection.boxEl.style.height = `${height}px`;
    }

    function setSelectionByPixels(selection, pageEl, left, top, width, height) {
        const pageRect = pageEl.getBoundingClientRect();
        const clampedWidth = clamp(width, 22, pageRect.width);
        const clampedHeight = clamp(height, 22, pageRect.height);
        const clampedLeft = clamp(left, 0, pageRect.width - clampedWidth);
        const clampedTop = clamp(top, 0, pageRect.height - clampedHeight);
        selection.leftRatio = clampedLeft / pageRect.width;
        selection.topRatio = clampedTop / pageRect.height;
        selection.widthRatio = clampedWidth / pageRect.width;
        selection.heightRatio = clampedHeight / pageRect.height;
        applySelectionRect(selection);
    }

    function getLocalPointer(pageEl, clientX, clientY) {
        const rect = pageEl.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top, rect };
    }

    function safeSetPointerCapture(target, pointerId) {
        if (!target || typeof target.setPointerCapture !== 'function') return;
        try {
            target.setPointerCapture(pointerId);
        } catch (_) {
            // Ignore capture failures on unsupported targets/browsers.
        }
    }

    function getCurrentVisiblePageNumber() {
        const pages = [...pagesHost.querySelectorAll('.pdf-page')];
        if (!pages.length) return 1;
        const scrollTop = viewerWrap.scrollTop;
        const midY = scrollTop + (viewerWrap.clientHeight / 2);

        let bestPage = pages[0];
        let bestDistance = Number.POSITIVE_INFINITY;
        pages.forEach((page) => {
            const pageMid = page.offsetTop + (page.offsetHeight / 2);
            const d = Math.abs(pageMid - midY);
            if (d < bestDistance) {
                bestDistance = d;
                bestPage = page;
            }
        });
        return Number(bestPage.dataset.pageNumber || 1);
    }

    function scrollToPage(pageNumber) {
        const page = pagesHost.querySelector(`.pdf-page[data-page-number="${pageNumber}"]`);
        if (!page) return;
        const maxTop = Math.max(0, viewerWrap.scrollHeight - viewerWrap.clientHeight);
        viewerWrap.scrollTop = clamp(page.offsetTop, 0, maxTop);
    }

    function renderAllSelections() {
        if (!leafletMap) return;
        selections.forEach((selection) => {
            if (selection.layer) {
                leafletMap.removeLayer(selection.layer);
                selection.layer = null;
            }
            if (selection.deleteMarker) {
                leafletMap.removeLayer(selection.deleteMarker);
                selection.deleteMarker = null;
            }
            clearSelectionHandles(selection);
            if (selection.pageNumber !== currentPageNumber) return;
            const x1 = selection.leftRatio * pagePixelSize.width;
            const y1 = selection.topRatio * pagePixelSize.height;
            const x2 = x1 + (selection.widthRatio * pagePixelSize.width);
            const y2 = y1 + (selection.heightRatio * pagePixelSize.height);
            const bounds = L.latLngBounds(latLngFromPixel(x1, y1), latLngFromPixel(x2, y2));
            const layer = L.rectangle(bounds);
            layer.addTo(leafletMap);
            selection.layer = layer;
            styleSelectionLayer(layer, selection.id === activeSelectionId);
            layer.on('click', () => {
                if (toolMode !== 'select') return;
                setActiveSelection(selection.id);
            });
            layer.on('contextmenu', () => {
                if (toolMode !== 'select') return;
                removeSelectionById(selection.id);
            });

            const deleteIcon = L.divIcon({
                className: '',
                html: '<div class="selection-delete-map" title="حذف التحديد">×</div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });
            const marker = L.marker(latLngFromPixel(x1, y1), {
                icon: deleteIcon,
                keyboard: false
            }).addTo(leafletMap);
            marker.on('click', () => removeSelectionById(selection.id));
            selection.deleteMarker = marker;
            createResizeHandles(selection);
        });
        if (!selections.length) {
            activeSelectionId = null;
            return;
        }
        if (!findSelectionById(activeSelectionId)) {
            activeSelectionId = selections[selections.length - 1].id;
        }
        setActiveSelection(activeSelectionId, false);
    }

    async function renderPdf(keepPageNumber = null) {
        if (!pdfDoc) return;
        ensureLeafletMap();
        if (keepPageNumber !== null) {
            currentPageNumber = clamp(keepPageNumber, 1, pdfDoc.numPages);
        }

        const page = await pdfDoc.getPage(currentPageNumber);
        const renderScale = 2;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: context, viewport }).promise;

        const url = canvas.toDataURL('image/png');
        const bounds = [[0, 0], [viewport.height, viewport.width]];
        pagePixelSize = { width: viewport.width, height: viewport.height };

        if (leafletLayer) leafletMap.removeLayer(leafletLayer);
        leafletLayer = L.imageOverlay(url, bounds).addTo(leafletMap);
        leafletMap.fitBounds(bounds, { animate: false, padding: [8, 8] });
        leafletMap.setZoom(clamp(zoomLevelFromPercent(getDefaultZoomPercent()), MAP_MIN_ZOOM, MAP_MAX_ZOOM), { animate: false });

        renderAllSelections();
        updatePageLabel();
        updateZoomLabel();
        setTimeout(() => leafletMap.invalidateSize(), 0);
    }

    function attachPointerEvents() {
        ensureLeafletMap();
        setMode(toolMode);

        leafletMap.on('mousedown', (event) => {
            if (isResizingSelection) return;
            if (toolMode !== 'select' || !pdfDoc) return;
            drawStartLatLng = event.latlng;
            clearTempRect();
            tempRectLayer = L.rectangle(L.latLngBounds(drawStartLatLng, drawStartLatLng), {
                color: '#f1873e',
                weight: 2,
                dashArray: '6,4',
                fillOpacity: 0.15
            }).addTo(leafletMap);
        });

        leafletMap.on('mousemove', (event) => {
            if (isResizingSelection) return;
            if (toolMode !== 'select' || !drawStartLatLng || !tempRectLayer) return;
            tempRectLayer.setBounds(L.latLngBounds(drawStartLatLng, event.latlng));
        });

        leafletMap.on('mouseup', (event) => {
            if (isResizingSelection) return;
            if (toolMode !== 'select' || !drawStartLatLng) return;
            const bounds = L.latLngBounds(drawStartLatLng, event.latlng);
            drawStartLatLng = null;
            if (!bounds.isValid()) {
                clearTempRect();
                return;
            }

            const x1 = clamp(Math.min(bounds.getWest(), bounds.getEast()), 0, pagePixelSize.width);
            const x2 = clamp(Math.max(bounds.getWest(), bounds.getEast()), 0, pagePixelSize.width);
            const y1 = clamp(Math.min(bounds.getNorth(), bounds.getSouth()), 0, pagePixelSize.height);
            const y2 = clamp(Math.max(bounds.getNorth(), bounds.getSouth()), 0, pagePixelSize.height);
            const width = x2 - x1;
            const height = y2 - y1;
            clearTempRect();
            if (width < 12 || height < 12) return;

            const selection = {
                id: ++selectionCounter,
                pageNumber: currentPageNumber,
                leftRatio: x1 / pagePixelSize.width,
                topRatio: y1 / pagePixelSize.height,
                widthRatio: width / pagePixelSize.width,
                heightRatio: height / pagePixelSize.height,
                layer: null,
                deleteMarker: null
            };
            selections.push(selection);
            setActiveSelection(selection.id);
            renderAllSelections();
            updateExtractActionState();
        });
    }

    function getSourceCrsFromSelection() {
        const key = sourceCrsSelect.value;
        return CRS_OPTIONS[key] ? key : 'DLTM';
    }

    function toWgs84(easting, northing, sourceCrsKey) {
        const opt = CRS_OPTIONS[sourceCrsKey];
        if (!opt || typeof window.proj4 !== 'function') return null;
        const eNum = parseNumeric(easting);
        const nNum = parseNumeric(northing);
        if (eNum === null || nNum === null) return null;
        try {
            const [lon, lat] = window.proj4(opt.proj4, 'EPSG:4326', [eNum, nNum]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return { lat, lon };
        } catch (_) {
            return null;
        }
    }

    function buildSdr(rows) {
        const fitNumber = (value, width, decimals = 8, padChar = ' ') => {
            const num = parseNumeric(value) ?? 0;
            let text = num.toFixed(decimals);

            // If number is longer than field, reduce decimals progressively.
            if (text.length > width) {
                for (let d = decimals - 1; d >= 0; d -= 1) {
                    const candidate = num.toFixed(d);
                    if (candidate.length <= width) {
                        text = candidate;
                        break;
                    }
                }
            }

            if (text.length > width) {
                text = text.slice(0, width);
            }

            return text.padEnd(width, padChar);
        };

        const fitText = (value, width) => {
            const raw = String(value ?? '').trim();
            if (raw.length >= width) return raw.slice(0, width);
            return raw.padEnd(width, ' ');
        };

        const fitTextRight = (value, width) => {
            const raw = String(value ?? '').trim();
            if (raw.length >= width) return raw.slice(raw.length - width);
            return raw.padStart(width, ' ');
        };

        const lines = [
            '00NMSDR33                               111111',
            '10NM>RED EXPORT 33  121111',
            '13NMAngle Unit: Degrees',
            '13DU1:Meters:',
            '13NMPressure Unit: MmHg',
            '13NMTempurature Unit: Celsius',
            '13NMCoordinate Format: N-E',
            '13CCPlane Curvature Correction: Yes'
        ];

        rows.forEach((row) => {
            const nameField = fitTextRight(row.name, 16);
            const northField = fitNumber(row.northing, 16, 8, '0');
            const eastField = `${fitNumber(row.easting, 15, 8, '0')} `; // 15 + trailing space
            const elevationField = fitNumber(row.elevation, 10, 8, ' ').padEnd(16, ' '); // e.g. "0.00000000      "
            const codeField = fitText(row.code, 16);

            // 4 + 16 + 16 + 16 + 16 + 16 = 84 chars total
            const line = `08KI${nameField}${northField}${eastField}${elevationField}${codeField}`;
            lines.push(line);
        });

        return lines.join('\r\n');
    }

    function buildDxf(rows) {
        const lines = ['0', 'SECTION', '2', 'ENTITIES'];
        rows.forEach((row) => {
            const e = parseNumeric(row.easting);
            const n = parseNumeric(row.northing);
            const z = parseNumeric(row.elevation) ?? 0;
            if (e === null || n === null) return;
            lines.push('0', 'POINT', '8', 'COORDS', '10', String(e), '20', String(n), '30', String(z));
        });
        lines.push('0', 'ENDSEC', '0', 'EOF');
        return lines.join('\n');
    }

    function buildKml(rows, sourceCrsKey) {
        const placemarks = [];
        rows.forEach((row) => {
            const wgs = toWgs84(row.easting, row.northing, sourceCrsKey);
            if (!wgs) return;
            const z = parseNumeric(row.elevation) ?? 0;
            const name = normalizeExtractedText(row.name || 'Point');
            const code = normalizeExtractedText(row.code || '');
            placemarks.push(`
    <Placemark>
      <name>${name}</name>
      <description>${code}</description>
      <Point><coordinates>${wgs.lon},${wgs.lat},${z}</coordinates></Point>
    </Placemark>`);
        });
        return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Extracted Coordinates</name>${placemarks.join('')}
  </Document>
</kml>`;
    }

    function ensurePointsMap() {
        if (pointsLeafletMap) return;
        pointsLeafletMap = L.map(pointsMapHost, {
            zoomControl: true,
            attributionControl: true
        });
        pointsBaseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        });
        pointsSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20,
            attribution: 'Tiles &copy; Esri'
        });
        pointsBaseLayer.addTo(pointsLeafletMap);
        pointsLayerGroup = L.layerGroup().addTo(pointsLeafletMap);
        pointsLeafletMap.setView([25.2048, 55.2708], 13);
    }

    function showPointsOnMap(sourceCrsKey) {
        ensurePointsMap();
        pointsLayerGroup.clearLayers();
        const bounds = [];
        extractedRows.forEach((row) => {
            const wgs = toWgs84(row.easting, row.northing, sourceCrsKey);
            if (!wgs) return;
            const marker = L.marker([wgs.lat, wgs.lon]);
            marker.bindTooltip(row.name || 'Point', {
                permanent: true,
                direction: 'top',
                offset: [0, -18],
                className: 'point-name-tooltip'
            });
            marker.bindPopup(
                `<b>${row.name || 'Point'}</b><br>` +
                `Northing: ${row.northing || '-'}<br>` +
                `Easting: ${row.easting || '-'}<br>` +
                `Elevation: ${row.elevation || '-'}<br>` +
                `Code: ${row.code || '-'}`
            );
            marker.addTo(pointsLayerGroup);
            bounds.push([wgs.lat, wgs.lon]);
        });
        if (!bounds.length) {
            alert('لا توجد نقاط صالحة للعرض على الماب حسب نظام الإحداثيات المختار.');
            return false;
        }
        pointsLeafletMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
        const currentZoom = pointsLeafletMap.getZoom();
        pointsLeafletMap.setZoom(Math.min(20, currentZoom + 1));
        showStep('points-map');
        return true;
    }

    function applyPointsMapStyle(isSatellite) {
        ensurePointsMap();
        if (isSatellite) {
            if (pointsLeafletMap.hasLayer(pointsBaseLayer)) pointsLeafletMap.removeLayer(pointsBaseLayer);
            if (!pointsLeafletMap.hasLayer(pointsSatelliteLayer)) pointsSatelliteLayer.addTo(pointsLeafletMap);
            toggleSatelliteBtn.textContent = 'عرض الشوارع';
        } else {
            if (pointsLeafletMap.hasLayer(pointsSatelliteLayer)) pointsLeafletMap.removeLayer(pointsSatelliteLayer);
            if (!pointsLeafletMap.hasLayer(pointsBaseLayer)) pointsBaseLayer.addTo(pointsLeafletMap);
            toggleSatelliteBtn.textContent = 'عرض القمر الصناعي';
        }
    }

    uploadBtn.addEventListener('click', () => pdfInput.click());
    handToolBtn.addEventListener('click', () => setMode('hand'));
    selectToolBtn.addEventListener('click', () => setMode('select'));

    zoomInBtn.addEventListener('click', async () => {
        if (!leafletMap) return;
        leafletMap.zoomIn(0.5);
    });

    zoomOutBtn.addEventListener('click', async () => {
        if (!leafletMap) return;
        leafletMap.zoomOut(0.5);
    });

    prevPageBtn.addEventListener('click', async () => {
        if (!pdfDoc) return;
        currentPageNumber = clamp(currentPageNumber - 1, 1, pdfDoc.numPages);
        await renderPdf(currentPageNumber);
    });

    nextPageBtn.addEventListener('click', async () => {
        if (!pdfDoc) return;
        currentPageNumber = clamp(currentPageNumber + 1, 1, pdfDoc.numPages);
        await renderPdf(currentPageNumber);
    });

    extractBtn.addEventListener('click', async () => {
        if (!pdfDoc) {
            alert('الرجاء رفع ملف PDF أولًا.');
            return;
        }
        if (!selections.length) {
            alert('لا يوجد أي تحديدات لاستخراجها.');
            return;
        }

        const pendingSelections = selections
            .filter((selection) => !extractedSelectionIds.has(selection.id))
            .sort((a, b) => (a.pageNumber - b.pageNumber) || (a.id - b.id));

        // If there are no new selections, re-extract from all current selections
        // so algorithm updates are reflected immediately.
        const targetSelections = pendingSelections.length
            ? pendingSelections
            : [...selections].sort((a, b) => (a.pageNumber - b.pageNumber) || (a.id - b.id));
        const replaceMode = pendingSelections.length === 0;

        const originalText = extractBtn.textContent;
        extractBtn.disabled = true;
        extractBtn.textContent = 'جاري العرض...';

        try {
            if (replaceMode) {
                extractedRows = [];
                extractedSelectionIds = new Set();
                lastExtractedRowId = 0;
            }

            const newRows = [];
            const baseTableId = replaceMode ? 0 : extractedSelectionIds.size;
            let detectedTextLineCount = 0;

            for (let i = 0; i < targetSelections.length; i += 1) {
                const selection = targetSelections[i];
                if (!selection || !Number.isFinite(selection.pageNumber)) {
                    continue;
                }
                const selectionTableId = baseTableId + i + 1;
                const selectionRowStart = newRows.length;
                let lines = [];
                try {
                    lines = await extractBestRowsFromSelection(selection);
                } catch (selectionError) {
                    console.warn('Failed to extract selection:', selection?.id, selectionError);
                    lines = [];
                }
                if (!Array.isArray(lines)) {
                    lines = String(lines ?? '')
                        .split(/\r?\n/)
                        .map((line) => String(line).trim())
                        .filter(Boolean);
                }
                detectedTextLineCount += lines.length;

                let nextId = lastExtractedRowId;
                let nextRow = newRows.length;
                const parsedRows = extractCoordinateRowsFromLines(
                    lines,
                    selectionTableId,
                    selection.pageNumber,
                    () => {
                        nextId += 1;
                        return nextId;
                    },
                    () => {
                        nextRow += 1;
                        return nextRow;
                    }
                );
                if (parsedRows.length) {
                    lastExtractedRowId = nextId;
                    newRows.push(...parsedRows);
                }

                extractedSelectionIds.add(selection.id);
            }

            if (!newRows.length && !extractedRows.length) {
                if (detectedTextLineCount > 0) {
                    alert('تم العثور على نص داخل المناطق المحددة، لكن لم أستطع تكوين صفوف إحداثيات صالحة منه. جرّب توسيع التحديد ليشمل الصف كاملًا أو حدّد الجدول بدقة أكبر.');
                } else {
                    alert('لم يتم العثور على نص داخل المناطق المحددة. تأكد أن الملف يحتوي نصًا أو أن منطقة التحديد تشمل الجدول بالكامل.');
                }
                return;
            }

            extractedRows = [...extractedRows, ...newRows];
            renderExtractedRows();
            showStep('coordinates');
        } catch (error) {
            console.error('Extraction failed:', error);
            const reason = (error && error.message) ? `\nالسبب: ${error.message}` : '';
            alert(`حدث خطأ أثناء استخراج البيانات.${reason}\nتأكد من تحميل ملفات OCR المحلية (worker/core/lang).`);
        } finally {
            updateExtractActionState();
            extractBtn.textContent = originalText;
        }
    });

    backToViewerBtn.addEventListener('click', () => showStep('viewer'));
    backToCoordsBtn.addEventListener('click', () => showStep('coordinates'));
    toggleSatelliteBtn.addEventListener('click', () => {
        isSatelliteMode = !isSatelliteMode;
        applyPointsMapStyle(isSatelliteMode);
    });

    exportBtn.addEventListener('click', () => {
        if (!extractedRows.length) {
            alert('لا توجد إحداثيات للتصدير.');
            return;
        }
        openCoordinatesExportForm();
    });

    closeExportModalBtn.addEventListener('click', () => {
        exportModal.classList.add('hidden');
    });

    exportModal.addEventListener('click', (event) => {
        if (event.target === exportModal) {
            exportModal.classList.add('hidden');
        }
    });

    showOnMapBtn.addEventListener('click', () => {
        const sourceCrsKey = getSourceCrsFromSelection();
        const shown = showPointsOnMap(sourceCrsKey);
        if (shown) exportModal.classList.add('hidden');
    });

    exportFormatBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!extractedRows.length) {
                alert('لا توجد إحداثيات للتصدير.');
                return;
            }
            const format = btn.dataset.exportFormat;
            if (format) {
                openCoordinatesExportForm();
                exportModal.classList.add('hidden');
                return;
            }
            if (format === 'csv') {
                const fileName = promptExportFileName('csv', exportSuggestedBaseName);
                if (!fileName) return;
                downloadText(buildCsv(extractedRows), fileName, 'text/csv;charset=utf-8');
                exportModal.classList.add('hidden');
                return;
            }
            if (format === 'sdr') {
                const fileName = promptExportFileName('sdr', exportSuggestedBaseName);
                if (!fileName) return;
                downloadText(buildSdr(extractedRows), fileName, 'text/plain;charset=utf-8');
                exportModal.classList.add('hidden');
                return;
            }
            if (format === 'dxf') {
                const fileName = promptExportFileName('dxf', exportSuggestedBaseName);
                if (!fileName) return;
                downloadText(buildDxf(extractedRows), fileName, 'application/dxf;charset=utf-8');
                exportModal.classList.add('hidden');
                return;
            }
            if (format === 'kml') {
                const defaultKey = getSourceCrsFromSelection();
                const answer = window.prompt('اختر نظام الإحداثيات المصدر لتصدير KML: DLTM أو UTM40N أو UTM39N', defaultKey);
                if (!answer) return;
                const normalized = answer.trim().toUpperCase();
                const map = { DLTM: 'DLTM', UTM40N: 'UTM40N', UTM39N: 'UTM39N', 'UTM Z40N': 'UTM40N', 'UTM Z39N': 'UTM39N' };
                const key = map[normalized];
                if (!key || !CRS_OPTIONS[key]) {
                    alert('نظام غير مدعوم حاليًا. استخدم DLTM أو UTM40N أو UTM39N.');
                    return;
                }
                const kmlContent = buildKml(extractedRows, key);
                const fileName = promptExportFileName('kml', exportSuggestedBaseName);
                if (!fileName) return;
                downloadText(kmlContent, fileName, 'application/vnd.google-earth.kml+xml;charset=utf-8');
                exportModal.classList.add('hidden');
            }
        });
    });

    async function loadSharedCoordinateFile() {
        if (!('caches' in window)) throw new Error('Cache API is not available.');
        const cache = await caches.open('atlas-shared-files-v1');
        const [fileResponse, metaResponse] = await Promise.all([
            cache.match('/__atlas_shared_file__'),
            cache.match('/__atlas_shared_file_meta__')
        ]);
        if (!fileResponse) throw new Error('Shared file was not found.');
        const blob = await fileResponse.blob();
        let meta = {};
        if (metaResponse) {
            try {
                meta = await metaResponse.json();
            } catch (_) {
                meta = {};
            }
        }
        return new File([blob], meta.name || 'shared-file', { type: meta.type || blob.type || 'application/octet-stream' });
    }

    async function handleIncomingCoordinateFile(file, source = 'manual') {
        if (!file) return;

        exportSuggestedBaseName = deriveSuggestedFileBaseName(file.name, 'extracted-coordinates');
        fileHint.textContent = source === 'share' ? `تم استقبال ملف المشاركة: ${file.name}` : `تم اختيار: ${file.name}`;
        viewerFileName.textContent = file.name;
        showStep('viewer');

        try {
            const fileBuffer = await file.arrayBuffer();
            const pdfApi = await getPdfApi();
            pdfDoc = await pdfApi.getDocument({
                data: fileBuffer,
                isEvalSupported: false,
                verbosity: pdfApi?.VerbosityLevel?.ERRORS ?? 0
            }).promise;
            currentPageNumber = 1;
            selections = [];
            activeSelectionId = null;
            selectionCounter = 0;
            extractedRows = [];
            extractedSelectionIds = new Set();
            lastExtractedRowId = 0;
            renderExtractedRows();
            updateZoomLabel();
            await renderPdf(currentPageNumber);
            updateExtractActionState();
        } catch (error) {
            console.error(error);
            showStep('upload');
            fileHint.textContent = 'حدث خطأ أثناء قراءة الملف. تأكد أن الملف PDF صالح.';
        }
    }

    async function initializeSharedFileIfRequested() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('shared') !== '1') return;

        try {
            const file = await loadSharedCoordinateFile();
            await handleIncomingCoordinateFile(file, 'share');
        } catch (error) {
            console.error(error);
            showStep('upload');
            fileHint.textContent = 'لم يتم العثور على ملف مشارك. جرّب المشاركة مرة أخرى من WhatsApp.';
        }
    }

    pdfInput.addEventListener('change', async () => {
        const file = pdfInput.files?.[0];
        if (file) await handleIncomingCoordinateFile(file, 'manual');
    });

    setMode('hand');
    updateZoomLabel();
    showStep('upload');
    attachPointerEvents();
    updateExtractActionState();
    applyPointsMapStyle(isSatelliteMode);
    initializeSharedFileIfRequested();
    window.addEventListener('resize', () => {
        leafletMap?.invalidateSize();
        pointsLeafletMap?.invalidateSize();
    });
    resultsBody.addEventListener('click', (event) => {
        const btn = event.target.closest('.row-del-btn');
        if (!btn) return;
        removeExtractedRow(Number(btn.dataset.rowId));
    });
