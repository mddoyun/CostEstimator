// websocket.js
let frontendSocket;
const PROGRESS_TOTAL_KEYS = [
    'total',
    'total_elements',
    'totalElements',
    'total_count',
    'element_count',
    'count',
];

function parseProgressTotal(payload) {
    if (!payload || typeof payload !== 'object') {
        return { hasTotal: false, total: null };
    }
    for (const key of PROGRESS_TOTAL_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) {
            continue;
        }
        const numeric = Number(payload[key]);
        if (Number.isFinite(numeric) && numeric >= 0) {
            return { hasTotal: true, total: numeric };
        }
    }
    return { hasTotal: false, total: null };
}

function setupWebSocket() {
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsPath = wsScheme + '://' + window.location.host + '/ws/frontend/';
    frontendSocket = new WebSocket(wsPath);

    frontendSocket.onopen = function (e) {
        document.getElementById('status').textContent = '서버에 연결됨.';
        console.log('[WebSocket] Frontend connected to server.'); // 디버깅
        if (currentProjectId) {
            console.log(
                '[WebSocket] Requesting initial tags for project:',
                currentProjectId
            ); // 디버깅
            frontendSocket.send(
                JSON.stringify({
                    type: 'get_tags',
                    payload: { project_id: currentProjectId },
                })
            );
        }
    };

    frontendSocket.onclose = function (e) {
        document.getElementById('status').textContent =
            '서버와 연결이 끊어졌습니다.';
        console.error(
            '[WebSocket] Frontend disconnected from server. Code:',
            e.code,
            'Reason:',
            e.reason
        ); // 디버깅
        showToast(
            '서버와 연결이 끊겼습니다. 페이지를 새로고침하세요.',
            'error',
            5000
        );
    };

    frontendSocket.onmessage = function (e) {
        const data = JSON.parse(e.data);
        const statusEl = document.getElementById('status');
        // 디버깅: 메시지 타입 포함 로그
        console.log(`[WebSocket] Message received: ${data.type}`, data);

        const progressContainer = document.getElementById('progress-container');
        const progressStatus = document.getElementById('progress-status-text');
        const progressBar = document.getElementById('data-fetch-progress');

        switch (data.type) {
            case 'revit_data_start':
            case 'fetch_progress_start': { // 두 경우 동일 처리
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                lowerValueCache?.clear?.();
                allRevitData = [];
                const payload = data.payload ?? {};
                const { hasTotal, total } = parseProgressTotal(payload);
                const clampedTotal = hasTotal && total > 0 ? total : 1;
                progressBar.dataset.totalKnown = hasTotal ? '1' : '0';
                progressBar.dataset.displayTotal = hasTotal ? String(total) : '';
                progressBar.max = clampedTotal;
                progressBar.value = 0;
                progressStatus.textContent = hasTotal
                    ? `0 / ${total}`
                    : '0 / ?';
                progressContainer.style.display = 'block';
                statusEl.textContent = hasTotal
                    ? `데이터 수신 시작. 총 ${total}개 객체.`
                    : '데이터 수신 시작. 총 개수를 파악 중입니다.';
                if (!hasTotal) {
                    console.warn(
                        `[WebSocket] ${data.type} payload missing valid total. Payload:`,
                        payload
                    );
                }
                console.log(
                    `[WebSocket] Data fetch/progress started. Total: ${hasTotal ? total : 'unknown'}`
                ); // 디버깅
                break;
            }

            case 'revit_data_chunk': {
                // console.log("[WebSocket] Received data chunk."); // 너무 빈번하여 주석 처리
                allRevitData.push(...data.payload);
                const totalKnown = progressBar.dataset.totalKnown === '1';
                const displayTotal = Number(
                    progressBar.dataset.displayTotal ?? progressBar.max
                );

                if (totalKnown && displayTotal > 0) {
                    const clampedValue = Math.min(
                        allRevitData.length,
                        displayTotal
                    );
                    progressBar.value = clampedValue;
                    progressStatus.textContent = `${allRevitData.length} / ${displayTotal} (${(
                        (allRevitData.length / displayTotal) *
                        100
                    ).toFixed(0)}%)`;
                } else if (totalKnown) {
                    progressBar.value = 0;
                    progressStatus.textContent = `${allRevitData.length} / ${displayTotal}`;
                } else {
                    const dynamicMax = Math.max(
                        Number(progressBar.max) || 1,
                        allRevitData.length || 1
                    );
                    progressBar.max = dynamicMax;
                    progressBar.value = allRevitData.length;
                    progressStatus.textContent = `${allRevitData.length} / ?`;
                }
                break;
            }
            case 'fetch_progress_update': {
                const processed = Number(
                    data?.payload?.processed_count ?? 0
                );
                const payload = data.payload ?? {};
                let totalKnown = progressBar.dataset.totalKnown === '1';
                if (!totalKnown) {
                    const { hasTotal, total } = parseProgressTotal(payload);
                    if (hasTotal) {
                        totalKnown = true;
                        progressBar.dataset.totalKnown = '1';
                        progressBar.dataset.displayTotal = String(total);
                        if (total > 0) {
                            progressBar.max = total;
                        }
                    }
                }
                const displayTotal = Number(
                    progressBar.dataset.displayTotal ?? progressBar.max
                );

                if (totalKnown && displayTotal > 0) {
                    const clampedValue = Math.min(processed, displayTotal);
                    progressBar.value = clampedValue;
                    progressStatus.textContent = `${processed} / ${displayTotal} (${(
                        (processed / displayTotal) *
                        100
                    ).toFixed(0)}%)`;
                } else if (totalKnown) {
                    progressBar.value = processed;
                    progressStatus.textContent = `${processed} / ${displayTotal}`;
                } else {
                    const dynamicMax = Math.max(
                        Number(progressBar.max) || 1,
                        processed || 0,
                        1
                    );
                    progressBar.max = dynamicMax;
                    progressBar.value = processed;
                    progressStatus.textContent = `처리됨: ${processed}개`;
                }
                // console.log(`[WebSocket] Fetch progress update: ${processed}/${totalUpdate}`); // 너무 빈번하여 주석 처리
                break;
            }

            case 'revit_data_complete':
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                statusEl.textContent = `데이터 로드 완료. 총 ${allRevitData.length}개의 객체.`;
                showToast(
                    `총 ${allRevitData.length}개의 객체 데이터를 받았습니다.`,
                    'success'
                );
                console.log(
                    "[WebSocket] 'revit_data_complete' received. Total elements:",
                    allRevitData.length
                ); // 디버깅

                populateFieldSelection();
                renderDataTable(
                    'data-management-data-table-container',
                    'data-management'
                );
                // 공간 관리 탭도 데이터 로드 시 테이블 갱신 필요 시 추가
                if (activeTab === 'space-management') {
                    renderDataTable(
                        'space-management-data-table-container',
                        'space-management'
                    );
                }

                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 1500);
                document.getElementById('project-selector').disabled = false;
                console.log(
                    '[UI] Project selector enabled after revit_data_complete.'
                ); // 디버깅
                break;

            case 'fetch_progress_complete': {
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                const totalKnown = progressBar.dataset.totalKnown === '1';
                if (totalKnown) {
                    const displayTotal = Number(
                        progressBar.dataset.displayTotal ?? progressBar.max
                    );
                    const finalMax = displayTotal > 0 ? displayTotal : 1;
                    progressBar.max = finalMax;
                    progressBar.value = finalMax;
                    progressStatus.textContent = 'DB 동기화 완료!';
                } else {
                    const fallbackMax = Math.max(
                        Number(progressBar.max) || 1,
                        progressBar.value || 0,
                        1
                    );
                    progressBar.max = fallbackMax;
                    progressBar.value = fallbackMax;
                    progressStatus.textContent =
                        'DB 동기화 완료 (총 개수 미확인)';
                }
                statusEl.textContent = `DB 동기화 완료. 최종 데이터 요청 중...`;
                console.log(
                    '[WebSocket] Fetch progress complete. Requesting final data...'
                ); // 디버깅
                if (currentProjectId) {
                    console.log(
                        '[WebSocket] Sending get_all_elements request after sync.'
                    ); // 디버깅
                    frontendSocket.send(
                        JSON.stringify({
                            type: 'get_all_elements',
                            payload: { project_id: currentProjectId },
                        })
                    );
                }
                break;
            }
            case 'all_elements': // fetch_progress_complete 후 서버가 보내는 최종 데이터
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                lowerValueCache?.clear?.();
                allRevitData = data.payload.elements;
                statusEl.textContent = `데이터 로드 완료. 총 ${allRevitData.length}개의 객체.`;
                showToast(
                    `총 ${allRevitData.length}개의 객체 데이터를 받았습니다.`,
                    'success'
                );
                console.log(
                    "[WebSocket] Received 'all_elements'. Total:",
                    allRevitData.length
                ); // 디버깅

                populateFieldSelection(); // 필드 선택 UI 업데이트
                // 현재 활성화된 탭의 테이블 렌더링
                const currentActiveTableContainerId = `${activeTab}-data-table-container`;
                const currentContext =
                    activeTab === 'space-management'
                        ? 'space-management'
                        : 'data-management';
                // 해당 ID의 테이블 컨테이너가 존재하는지 확인 후 렌더링
                if (document.getElementById(currentActiveTableContainerId)) {
                    console.log(
                        `[WebSocket] Rendering table for active tab: ${activeTab}`
                    ); // 디버깅
                    renderDataTable(
                        currentActiveTableContainerId,
                        currentContext
                    );
                } else {
                    console.warn(
                        `[WebSocket] Table container not found for active tab ${activeTab}: ${currentActiveTableContainerId}`
                    ); // 디버깅
                }

                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 1500);
                document.getElementById('project-selector').disabled = false;
                console.log(
                    '[UI] Project selector enabled after receiving all_elements.'
                ); // 디버깅
                break;

            case 'tags_updated':
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                updateTagLists(data.tags);
                allTags = data.tags; // 전역 변수 업데이트
                showToast('수량산출분류 목록이 업데이트되었습니다.', 'info');
                console.log(
                    '[WebSocket] Tags updated. Count:',
                    data.tags.length
                ); // 디버깅
                if (activeTab === 'ruleset-management') {
                    console.log(
                        '[WebSocket] Reloading classification rules after tags update.'
                    ); // 디버깅
                    loadClassificationRules(); // 룰셋 관리 탭이면 룰 목록 새로고침
                }
                break;

            case 'elements_updated':
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                lowerValueCache?.clear?.();
                console.log(
                    `[WebSocket] Received element updates for ${data.elements.length} items.`
                ); // 디버깅
                let updatedInCurrentView = false;
                data.elements.forEach((updatedElem) => {
                    const index = allRevitData.findIndex(
                        (elem) => elem.id === updatedElem.id
                    );
                    if (index !== -1) {
                        allRevitData[index] = updatedElem;
                        // 현재 보고 있는 뷰에 해당 요소가 포함되어 있는지 확인 (간단한 방식)
                        const currentState =
                            viewerStates[
                                activeTab === 'space-management'
                                    ? 'space-management'
                                    : 'data-management'
                            ];
                        if (
                            currentState &&
                            currentState.selectedElementIds.has(updatedElem.id)
                        ) {
                            updatedInCurrentView = true;
                        }
                    } else {
                        console.warn(
                            '[WebSocket] Received update for non-existing element ID:',
                            updatedElem.id
                        ); // 디버깅
                    }
                });
                // 현재 활성화된 탭의 테이블 및 관련 정보 업데이트
                const activeContext =
                    activeTab === 'space-management'
                        ? 'space-management'
                        : 'data-management';
                const activeTableContainerId = `${activeContext}-data-table-container`;
                if (document.getElementById(activeTableContainerId)) {
                    renderDataTable(activeTableContainerId, activeContext);
                    renderAssignedTagsTable(activeContext); // 태그 정보 갱신
                    renderBimPropertiesTable(activeContext); // BIM 속성 갱신
                    console.log(
                        `[WebSocket] Refreshed table and info panels for context: ${activeContext}`
                    ); // 디버깅
                }
                showToast(
                    `${data.elements.length}개 항목의 태그가 업데이트되었습니다.`,
                    'info'
                );
                break;

            case 'revit_selection_update': {
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                console.log(
                    `[WebSocket] Revit/Blender selection update received: ${data.unique_ids.length} items`
                ); // 디버깅
                const uniqueIds = new Set(data.unique_ids);

                if (activeTab === 'detailed-estimation-dd') {
                    boqFilteredRawElementIds.clear();
                    allRevitData.forEach((item) => {
                        if (uniqueIds.has(item.element_unique_id)) {
                            boqFilteredRawElementIds.add(item.id);
                        }
                    });
                    console.log(
                        `[WebSocket] Applying BOQ filter: ${boqFilteredRawElementIds.size} RawElement IDs`
                    ); // 디버깅
                    document.getElementById(
                        'boq-clear-selection-filter-btn'
                    ).style.display = 'inline-block';
                    generateBoqReport();
                    showToast(
                        `${boqFilteredRawElementIds.size}개 객체 기준으로 집계표를 필터링합니다.`,
                        'success'
                    );
                }
                // ▼▼▼ [수정] space-management 탭 처리 추가 ▼▼▼
                else if (activeTab === 'space-management') {
                    const state = viewerStates['space-management'];
                    state.selectedElementIds.clear();
                    state.revitFilteredIds.clear();
                    allRevitData.forEach((item) => {
                        if (uniqueIds.has(item.element_unique_id)) {
                            state.selectedElementIds.add(item.id);
                            state.revitFilteredIds.add(item.id); // 필터링용 ID도 저장
                        }
                    });
                    console.log(
                        `[WebSocket] Applying Space Management filter: ${state.selectedElementIds.size} elements`
                    ); // 디버깅
                    // state.isFilterToSelectionActive = true; // 공간 관리 탭에는 필터 버튼이 없으므로 주석 처리
                    // document.getElementById("clear-selection-filter-btn").style.display = "inline-block"; // 버튼 없음

                    renderDataTable(
                        'space-management-data-table-container',
                        'space-management'
                    );
                    renderBimPropertiesTable('space-management'); // BIM 속성 표시
                    showToast(
                        `${state.selectedElementIds.size}개의 객체를 연동 프로그램에서 선택했습니다.`, // 메시지 수정
                        'success'
                    );
                }
                // ▲▲▲ [수정] 여기까지 ▲▲▲
                else {
                    // 기본: 데이터 관리 탭 처리
                    const state = viewerStates['data-management'];
                    state.selectedElementIds.clear();
                    state.revitFilteredIds.clear();
                    allRevitData.forEach((item) => {
                        if (uniqueIds.has(item.element_unique_id)) {
                            state.selectedElementIds.add(item.id);
                            state.revitFilteredIds.add(item.id);
                        }
                    });
                    console.log(
                        `[WebSocket] Applying Data Management filter: ${state.selectedElementIds.size} elements`
                    ); // 디버깅

                    state.isFilterToSelectionActive = true;
                    document.getElementById(
                        'clear-selection-filter-btn'
                    ).style.display = 'inline-block';

                    renderDataTable(
                        'data-management-data-table-container',
                        'data-management'
                    );
                    renderAssignedTagsTable('data-management');
                    renderBimPropertiesTable('data-management');
                    showToast(
                        `${state.selectedElementIds.size}개의 객체를 연동 프로그램에서 가져와 필터링합니다.`,
                        'success'
                    );
                }
                break;
            }
            case 'training_progress_update':
                console.log(`[WebSocket][onmessage] Received: ${data.type}`); // <--- 추가
                console.log(
                    '[WebSocket] Received AI training progress update:',
                    data
                ); // 디버깅
                if (typeof handleTrainingProgressUpdate === 'function') {
                    handleTrainingProgressUpdate(data);
                } else {
                    console.warn(
                        "[WebSocket] Function 'handleTrainingProgressUpdate' not found."
                    ); // 디버깅
                }
                break;
            default:
                console.warn(
                    '[WebSocket] Received unknown message type:',
                    data.type
                ); // 디버깅
        }
    };

    frontendSocket.onerror = function (error) {
        console.error('[WebSocket] Frontend WebSocket Error:', error); // 디버깅
        showToast('WebSocket 연결 오류 발생.', 'error');
    };
}
