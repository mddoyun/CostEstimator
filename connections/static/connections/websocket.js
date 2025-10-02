// websocket.js
let frontendSocket;

function setupWebSocket() {
    const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
    const wsPath = wsScheme + '://' + window.location.host + '/ws/frontend/';
    frontendSocket = new WebSocket(wsPath);

    frontendSocket.onopen = function(e) {
        document.getElementById('status').textContent = '서버에 연결됨.';
        if (currentProjectId) {
            frontendSocket.send(JSON.stringify({ type: 'get_tags', payload: { project_id: currentProjectId } }));
        }
    };

    frontendSocket.onclose = function(e) {
        document.getElementById('status').textContent = '서버와 연결이 끊어졌습니다.';
        showToast('서버와 연결이 끊겼습니다. 페이지를 새로고침하세요.', 'error', 5000);
    };

    frontendSocket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        const statusEl = document.getElementById('status');
        // ▼▼▼ [추가] 프로그레스바 UI 요소들을 미리 찾아둡니다. ▼▼▼
        const progressContainer = document.getElementById('progress-container');
        const progressStatus = document.getElementById('progress-status-text');
        const progressBar = document.getElementById('data-fetch-progress');
        const progressTitle = document.getElementById('progress-title');

        switch (data.type) {
            case 'revit_data_start':
                allRevitData = []; // 데이터 배열을 깨끗하게 초기화합니다.
                progressTitle.textContent = '서버 DB에서 데이터 수신 중...';
                progressBar.max = data.payload.total;
                progressBar.value = 0;
                progressStatus.textContent = `0 / ${data.payload.total}`;
                progressContainer.style.display = 'block'; // 프로그레스바를 다시 보여줍니다.
                break;

            case 'revit_data_chunk':
                allRevitData.push(...data.payload); // 수신된 데이터 조각을 배열에 추가합니다.
                
                // 프로그레스바 상태를 업데이트합니다.
                progressBar.value = allRevitData.length;
                progressStatus.textContent = `${allRevitData.length} / ${progressBar.max} (${(allRevitData.length / progressBar.max * 100).toFixed(0)}%)`;
                break;

            case 'revit_data_complete':
                progressTitle.textContent = '데이터 로딩 완료!';
                statusEl.textContent = `데이터 로드 완료. 총 ${allRevitData.length}개의 객체.`;
                showToast(`총 ${allRevitData.length}개의 객체 데이터를 받았습니다.`, 'success');
                
                // 모든 데이터 수신이 완료되었으므로, 최종적으로 화면을 그립니다.
                populateFieldSelection();
                renderDataTable();
                
                // 1.5초 후 프로그레스바를 숨깁니다.
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 1500);
                break;
            case 'fetch_progress_start':
                allRevitData = []; // 데이터 배열 초기화
                const total = data.payload.total_elements;
                progressBar.max = total;
                progressBar.value = 0;
                progressStatus.textContent = `0 / ${total}`;
                progressTitle.textContent = '데이터 수신 중...';
                progressContainer.style.display = 'block';
                statusEl.textContent = `데이터 수신 시작. 총 ${total}개 객체.`;
                break;
            case 'fetch_progress_update':
                const processed = data.payload.processed_count;
                const totalElements = progressBar.max;
                
                progressBar.value = processed;
                progressStatus.textContent = `${processed} / ${totalElements} (${(processed / totalElements * 100).toFixed(0)}%)`;
                
                // [삭제] 더 이상 프론트엔드에서 직접 데이터를 쌓지 않습니다.
                // const newElements = data.payload.elements.map(s => JSON.parse(s));
                // allRevitData.push(...newElements);
                break;

            case 'fetch_progress_complete':
                progressBar.value = progressBar.max;
                progressTitle.textContent = 'DB 동기화 완료!';
                statusEl.textContent = `DB 동기화 완료. 최종 데이터 요청 중...`;

                // [핵심] DB 저장이 완료되었으므로, 백엔드에 최종 데이터를 요청합니다.
                if (currentProjectId) {
                    frontendSocket.send(JSON.stringify({
                        type: 'get_all_elements',
                        payload: { project_id: currentProjectId }
                    }));
                }
                break; // setTimeout 블록이 완전히 삭제되었습니다.
            // ▲▲▲ [추가] 여기까지 입니다. ▲▲▲                
            case 'tags_list':
                // ▼▼▼ [수정] 이 부분을 아래 코드로 교체해주세요. ▼▼▼
                updateTagLists(data.payload.tags);
                allTags = data.payload.tags; // 전역 변수에 현재 태그 목록 저장
                
                // [참고] 아래 코드는 이미 존재하므로 그대로 유지합니다.
                if (activeTab === 'ruleset-management') {
                    loadClassificationRules();
                }
                // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
                break;
            case 'sync_result':
                const summary = data.summary;
                if (summary.status === 'success') {
                    statusEl.textContent = '동기화 완료!';
                    showToast(`동기화 완료! 생성: ${summary.created}, 수정: ${summary.updated}, 삭제: ${summary.deleted}`, 'success', 5000);
                } else {
                    statusEl.textContent = '동기화 오류';
                    showToast(`동기화 오류: ${summary.error}`, 'error', 5000);
                }
                break;
            case 'tags_updated':
                // ▼▼▼ [수정] 이 부분을 아래 코드로 교체해주세요. ▼▼▼
                updateTagLists(data.tags);
                allTags = data.tags; // 전역 변수에 현재 태그 목록 저장
                showToast('수량산출분류 목록이 업데이트되었습니다.', 'info');
                // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
                break;
            case 'elements_updated':
                data.elements.forEach(updatedElem => {
                    const index = allRevitData.findIndex(elem => elem.id === updatedElem.id);
                    if (index !== -1) allRevitData[index] = updatedElem;
                });
                renderDataTable();
                renderAssignedTagsTable();
                showToast(`${data.elements.length}개 항목의 태그가 업데이트되었습니다.`, 'info');
                break;
case 'revit_selection_update':
                const uniqueIds = new Set(data.unique_ids);

                if (activeTab === 'boq') {
                    // '집계' 탭이 활성화된 경우
                    boqFilteredRawElementIds.clear();
                    allRevitData.forEach(item => {
                        if (uniqueIds.has(item.element_unique_id)) {
                            boqFilteredRawElementIds.add(item.id);
                        }
                    });

                    if (boqFilteredRawElementIds.size > 0) {
                        document.getElementById('boq-clear-selection-filter-btn').style.display = 'block';
                        generateBoqReport(); // 필터링된 ID로 집계표 재생성
                        showToast(`${boqFilteredRawElementIds.size}개 객체 기준으로 집계표를 필터링합니다.`, 'success');
                    } else {
                        showToast('선택된 객체와 연관된 산출 항목이 없습니다.', 'info');
                    }

                } else {
                    // 기존 'BIM 원본데이터' 탭의 동작
                    selectedElementIds.clear();
                    revitFilteredIds.clear(); // 필터 ID Set 초기화

                    allRevitData.forEach(item => {
                        if (uniqueIds.has(item.element_unique_id)) {
                            selectedElementIds.add(item.id);
                            revitFilteredIds.add(item.id); // 필터링의 기준이 될 ID Set에도 추가
                        }
                    });
                    
                    isFilterToSelectionActive = true;
                    document.getElementById('clear-selection-filter-btn').style.display = 'inline-block';
                    renderDataTable();
                    renderAssignedTagsTable();
                    showToast(`${selectedElementIds.size}개의 객체를 Revit에서 가져와 필터링합니다.`, 'success');
                }
                break;
        }
    };
}