// main.js
let allRevitData = [];
let currentProjectId = null;
let columnFilters = {};
let selectedElementIds = new Set();
let csrftoken;
let isFilterToSelectionActive = false;
let revitFilteredIds = new Set();
let activeTab = 'data-management';
let activeView = 'raw-data-view';
let collapsedGroups = {};
let currentGroupByFields = [];
let lastSelectedRowIndex = -1;
let loadedQuantityMembers = []; // ▼▼▼ [추가] 이 줄을 추가합니다. ▼▼▼
let loadedPropertyMappingRules = []; // ▼▼▼ [추가] 이 줄을 추가합니다. ▼▼▼
let qmColumnFilters = {};
let selectedQmIds = new Set();
let qmCollapsedGroups = {};
let currentQmGroupByFields = [];
let lastSelectedQmRowIndex = -1;
let loadedCostCodes = []; // ▼▼▼ [추가] 이 줄을 추가합니다. ▼▼▼
let loadedMemberMarks = [];
let activeQmView = 'quantity-member-view'; // ▼▼▼ [추가] 이 줄을 추가합니다. ▼▼▼

let loadedCostItems = [];
let ciColumnFilters = {};
let selectedCiIds = new Set();
let ciCollapsedGroups = {};
let currentCiGroupByFields = [];
let lastSelectedCiRowIndex = -1;
let loadedCostCodeRules = [];
let loadedMemberMarkAssignmentRules = [];
let loadedCostCodeAssignmentRules = [];
let allTags = []; // 프로젝트의 모든 태그를 저장해 둘 변수
let boqFilteredRawElementIds = new Set(); // BOQ 탭에서 Revit 선택 필터링을 위한 ID 집합


document.addEventListener('DOMContentLoaded', () => {
    csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;
    setupWebSocket();

    // --- 이벤트 리스너 설정 ---
    const projectSelector = document.getElementById('project-selector');
    projectSelector.addEventListener('change', handleProjectChange);

    // --- 메인 네비게이션 버튼 (데이터 관리, 룰셋 관리 등) ---
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', handleMainNavClick);
    });

    // --- Revit 데이터 연동 버튼 ---
    document.getElementById('fetchDataBtn').addEventListener('click', fetchDataFromRevit);
    document.getElementById('get-from-revit-btn').addEventListener('click', getSelectionFromRevit);
    document.getElementById('select-in-revit-btn').addEventListener('click', selectInRevit);
    
    // --- 수량산출분류 관리 버튼 ---
    document.getElementById('create-project-btn').addEventListener('click', createNewProject);
    document.getElementById('create-tag-btn').addEventListener('click', createNewTag);
    document.getElementById('tag-list').addEventListener('click', handleTagListActions);
    document.getElementById('import-tags-btn').addEventListener('click', () => document.getElementById('tag-file-input').click());
    document.getElementById('tag-file-input').addEventListener('change', importTags);
    document.getElementById('export-tags-btn').addEventListener('click', exportTags);
    
    // --- 테이블 및 데이터 뷰 관련 버튼 ---
    document.getElementById('render-table-btn').addEventListener('click', () => renderDataTable());
    
    document.querySelectorAll('#data-management .view-tab-button').forEach(button => {
        button.addEventListener('click', handleViewTabClick);
    });

    document.getElementById('add-group-level-btn').addEventListener('click', addGroupingLevel);

    document.getElementById('grouping-controls').addEventListener('change', () => renderDataTable());
    document.getElementById('clear-selection-filter-btn').addEventListener('click', clearSelectionFilter);
    document.getElementById('assign-tag-btn').addEventListener('click', assignTagsToSelection);
    
    // ▼▼▼ [추가] 이 줄을 추가합니다. ▼▼▼
    document.getElementById('apply-rules-btn').addEventListener('click', applyClassificationRules);
    
    document.getElementById('clear-tags-btn').addEventListener('click', clearTagsFromSelection);

    
    // --- 테이블 컨테이너 이벤트 ---
    const tableContainer = document.getElementById('data-table-container');
    tableContainer.addEventListener('keyup', handleColumnFilter);
    tableContainer.addEventListener('click', handleTableClick);

    // --- '룰셋 관리' 탭 내부의 서브-네비게이션 버튼 이벤트 리스너 ---
    document.querySelectorAll('.ruleset-nav-button').forEach(button => {
        button.addEventListener('click', handleRulesetNavClick);
    });

    document.getElementById('create-qm-manual-btn').addEventListener('click', createManualQuantityMember);
 
    document.getElementById('create-qm-auto-btn').addEventListener('click', createAutoQuantityMembers);

    document.getElementById('qm-table-container').addEventListener('click', handleQuantityMemberActions);

    document.getElementById('qm-clear-cost-codes-btn').addEventListener('click', clearCostCodesFromQm);


    document.getElementById('add-mapping-rule-btn').addEventListener('click', () => {
        const existingEditRow = document.querySelector('#mapping-ruleset-table-container .rule-edit-row');
        if (existingEditRow) {
            showToast('이미 편집 중인 규칙이 있습니다.', 'error');
            return;
        }
        renderPropertyMappingRulesetTable(loadedPropertyMappingRules, 'new');
    });

    document.getElementById('mapping-ruleset-table-container').addEventListener('click', handlePropertyMappingRuleActions);
    document.getElementById('add-qm-group-level-btn').addEventListener('click', addQmGroupingLevel);
    document.getElementById('qm-grouping-controls').addEventListener('change', () => renderActiveQmView());
    document.getElementById('qm-properties-container').parentElement.addEventListener('click', handleQmPropertiesActions);
    document.getElementById('add-cost-code-btn').addEventListener('click', () => {
        if (document.querySelector('#cost-codes-table-container .rule-edit-row')) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error');
            return;
        }
        renderCostCodesTable(loadedCostCodes, 'new');
    });
    document.getElementById('cost-codes-table-container').addEventListener('click', handleCostCodeActions);

    document.getElementById('qm-assign-cost-code-btn').addEventListener('click', assignCostCodeToQm);
    document.getElementById('qm-assign-member-mark-btn').addEventListener('click', assignMemberMarkToQm);
    document.getElementById('qm-clear-member-marks-btn').addEventListener('click', clearMemberMarksFromQm);
    
    document.getElementById('add-member-mark-btn').addEventListener('click', () => {
        if (document.querySelector('#member-marks-table-container .rule-edit-row')) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error'); return;
        }
        renderMemberMarksTable(loadedMemberMarks, 'new');
    });
    document.getElementById('member-marks-table-container').addEventListener('click', handleMemberMarkActions);
    document.getElementById('create-ci-manual-btn').addEventListener('click', createManualCostItem);
    document.getElementById('create-ci-auto-btn').addEventListener('click', createAutoCostItems);
    document.getElementById('ci-table-container').addEventListener('click', handleCostItemActions);
    document.getElementById('ci-table-container').addEventListener('keyup', handleCiColumnFilter);
    document.getElementById('add-ci-group-level-btn').addEventListener('click', addCiGroupingLevel);
    document.getElementById('ci-grouping-controls').addEventListener('change', () => renderCostItemsTable(loadedCostItems));

    document.getElementById('add-costcode-rule-btn').addEventListener('click', () => {
        if (document.querySelector('#costcode-ruleset-table-container .rule-edit-row')) {
            showToast('이미 편집 중인 규칙이 있습니다.', 'error'); return;
        }
        renderCostCodeRulesetTable(loadedCostCodeRules, 'new');
    });
    document.getElementById('costcode-ruleset-table-container').addEventListener('click', handleCostCodeRuleActions);
    document.getElementById('add-member-mark-assignment-rule-btn').addEventListener('click', () => renderMemberMarkAssignmentRulesetTable(loadedMemberMarkAssignmentRules, 'new'));
    document.getElementById('member-mark-assignment-ruleset-table-container').addEventListener('click', handleMemberMarkAssignmentRuleActions);
    document.getElementById('add-cost-code-assignment-rule-btn').addEventListener('click', () => renderCostCodeAssignmentRulesetTable(loadedCostCodeAssignmentRules, 'new'));
    document.getElementById('cost-code-assignment-ruleset-table-container').addEventListener('click', handleCostCodeAssignmentRuleActions);

    document.querySelector('#quantity-members .view-tabs').addEventListener('click', handleQmViewTabClick);
    document.getElementById('apply-assignment-rules-btn').addEventListener('click', applyAssignmentRules);
    document.querySelector('#quantity-members .details-panel').addEventListener('click', handleQmDetailTabClick);
    document.getElementById('add-boq-group-level-btn').addEventListener('click', addBoqGroupingLevel);
    document.getElementById('generate-boq-btn').addEventListener('click', generateBoqReport);
    document.getElementById('boq-reset-columns-btn').addEventListener('click', resetBoqColumnsAndRegenerate);

    document.getElementById('boq-select-in-revit-btn').addEventListener('click', handleBoqSelectInRevit);
    document.getElementById('boq-get-from-revit-btn').addEventListener('click', handleBoqGetFromRevit);
    document.getElementById('boq-clear-selection-filter-btn').addEventListener('click', handleBoqClearFilter);





// '분류 할당 룰셋'의 '새 규칙 추가' 버튼 이벤트 리스너
document.getElementById('add-classification-rule-btn').addEventListener('click', () => {
    // 테이블에 이미 편집중인 행이 있는지 확인
    const existingEditRow = document.querySelector('#classification-ruleset .rule-edit-row');
    if (existingEditRow) {
        showToast('이미 편집 중인 규칙이 있습니다.', 'error');
        return;
    }
    // 'new'를 편집 ID로 전달하여 새 규칙 추가 행을 렌더링
    renderClassificationRulesetTable(loadedClassificationRules, 'new');
});

// ▼▼▼ [추가] 룰셋 테이블의 버튼 클릭 이벤트를 위임하여 처리합니다. ▼▼▼
document.getElementById('classification-ruleset').addEventListener('click', handleClassificationRuleActions);


// --- 초기 상태 설정 ---
    currentProjectId = projectSelector.value;
    initializeBoqUI();
});

// --- 핸들러 함수들 ---


// handleProjectChange 함수에 태그 로드 로직 추가
// main.js

function handleProjectChange(e) {
    currentProjectId = e.target.value;
    allRevitData = []; selectedElementIds.clear(); revitFilteredIds.clear();
    columnFilters = {}; isFilterToSelectionActive = false; collapsedGroups = {};
    currentGroupByFields = [];
    document.getElementById('grouping-controls').innerHTML = '';
    document.getElementById('clear-selection-filter-btn').style.display = 'none';
    renderDataTable(); renderAssignedTagsTable();
    document.getElementById('tag-list').innerHTML = '프로젝트를 선택하세요.';
    
    allTags = []; 
    
    if (currentProjectId) {
        showToast(`프로젝트 '${e.target.options[e.target.selectedIndex].text}' 선택됨.`, 'info');
        // ▼▼▼ [수정] 아래 두 줄의 순서를 바꾸고, get_all_elements 요청을 추가합니다. ▼▼▼
        frontendSocket.send(JSON.stringify({ type: 'get_tags', payload: { project_id: currentProjectId } }));
        frontendSocket.send(JSON.stringify({ type: 'get_all_elements', payload: { project_id: currentProjectId } }));
    }
}

function createNewProject() {
    const projectNameInput = document.getElementById('new-project-name');
    const projectName = projectNameInput.value.trim();
    if (!projectName) { showToast('프로젝트 이름을 입력하세요.', 'error'); return; }
    fetch('/connections/create-project/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': csrftoken},
        body: JSON.stringify({ name: projectName })
    }).then(res => res.json()).then(data => {
        if (data.status === 'success') {
            showToast(`프로젝트 '${data.project_name}' 생성 완료.`, 'success');
            const selector = document.getElementById('project-selector');
            const newOption = new Option(data.project_name, data.project_id, true, true);
            selector.add(newOption, selector.options[1]);
            selector.dispatchEvent(new Event('change'));
            projectNameInput.value = '';
        } else { showToast('프로젝트 생성 실패: ' + data.message, 'error'); }
    });
}

// --- 핸들러 함수들 ---

function handleMainNavClick(e) {
    const clickedButton = e.currentTarget;
    if (clickedButton.classList.contains('active')) {
        return; 
    }
    document.querySelector('.nav-button.active').classList.remove('active');
    clickedButton.classList.add('active');
    activeTab = clickedButton.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(activeTab).classList.add('active');

    if (activeTab === 'ruleset-management') {
        loadClassificationRules();
        loadPropertyMappingRules(); // 속성 맵핑 룰셋 로드 함수 호출 추가
        loadCostCodeRules(); // 공사코드 룰셋 로드 함수 호출
        loadMemberMarkAssignmentRules();
        loadCostCodeAssignmentRules();
    }
        
    if (activeTab === 'quantity-members') {
        loadQuantityMembers();
        loadCostCodes(); // 공사코드 목록을 함께 로드합니다.
        loadMemberMarks(); // 일람부호 목록을 함께 로드합니다.
    }
    if (activeTab === 'cost-item-management') {
        loadCostItems();
        loadQuantityMembers(); // 연관 부재 속성을 표시하기 위해 부재 목록도 함께 로드합니다.
        loadMemberMarks(); // 연관 부재의 일람부호 속성을 표시하기 위해 함께 로드합니다.
    }
    if (activeTab === 'cost-code-management') {
        loadQuantityMembers();
        loadCostCodes(); // [추가] 공사코드 목록을 함께 로드합니다.
        loadMemberMarks(); // [추가] 일람부호 목록을 함께 로드합니다.
    }
    if (activeTab === 'member-mark-management') {
        loadQuantityMembers();
        loadCostCodes(); // [추가] 공사코드 목록을 함께 로드합니다.
        loadMemberMarks(); // [추가] 일람부호 목록을 함께 로드합니다.

    }
    if (activeTab === 'boq') {
        // [수정] 상세 정보 표시에 필요한 모든 데이터를 불러옵니다.
        loadCostItems();
        loadQuantityMembers();
        // allRevitData가 비어있을 경우에만 요청하여 불필요한 로딩을 방지합니다.
        if(allRevitData.length === 0) {
            fetchDataFromRevit();
        }
        loadBoqGroupingFields();
    }
}

function fetchDataFromRevit() {
    document.getElementById('project-selector').disabled = true;
    if (!currentProjectId) { showToast('먼저 프로젝트를 선택하세요.', 'error'); return; }
    selectedElementIds.clear(); revitFilteredIds.clear(); isFilterToSelectionActive = false;
    document.getElementById('clear-selection-filter-btn').style.display = 'none';


    // ▼▼▼ [추가] 프로그레스바 UI를 표시하고 초기화합니다. ▼▼▼
    const progressContainer = document.getElementById('progress-container');
    const progressStatus = document.getElementById('progress-status-text');
    const progressBar = document.getElementById('data-fetch-progress');
    
    progressContainer.style.display = 'block';
    progressStatus.textContent = 'Revit에 데이터 요청 중...';
    progressBar.value = 0;
    progressBar.removeAttribute('max');
    // ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

    frontendSocket.send(JSON.stringify({
        'type': 'command_to_revit',
        'payload': {
            'command': 'fetch_all_elements_chunked',
            'project_id': currentProjectId
        }
    }));
    document.getElementById('status').textContent = '명령 전송 성공! Revit에서 데이터를 보내는 중입니다.';
    showToast('Revit에 데이터 요청 명령을 보냈습니다.', 'info');
}

function getSelectionFromRevit() {
    frontendSocket.send(JSON.stringify({'type': 'command_to_revit', 'payload': {'command': 'get_selection'}}));
    showToast('Revit에 선택 정보 가져오기를 요청했습니다.', 'info');
}

function selectInRevit() {
    if (selectedElementIds.size === 0) { showToast('테이블에서 Revit으로 보낼 객체를 먼저 선택하세요.', 'error'); return; }
    const uniqueIdsToSend = allRevitData.filter(item => selectedElementIds.has(item.id)).map(item => item.element_unique_id);
    frontendSocket.send(JSON.stringify({'type': 'command_to_revit', 'payload': { 'command': 'select_elements', 'unique_ids': uniqueIdsToSend }}));
    showToast(`${uniqueIdsToSend.length}개 객체의 선택 명령을 Revit으로 보냈습니다.`, 'info');
}

function createNewTag() {
    if (!currentProjectId) { showToast('먼저 프로젝트를 선택하세요.', 'error'); return; }
    const newTagNameInput = document.getElementById('new-tag-name');
    const newTagName = newTagNameInput.value.trim();
    if (!newTagName) { showToast('분류 이름을 입력하세요.', 'error'); return; }
    frontendSocket.send(JSON.stringify({ type: 'create_tag', payload: { project_id: currentProjectId, name: newTagName } }));
    newTagNameInput.value = '';
}

function handleTagListActions(event) {
    const target = event.target;
    const tagId = target.dataset.id;
    if (!tagId) return;
    if (target.classList.contains('delete-tag-btn')) {
        if (confirm('이 분류를 삭제하시겠습니까?')) {
            frontendSocket.send(JSON.stringify({ type: 'delete_tag', payload: { project_id: currentProjectId, tag_id: tagId } }));
        }
    } else if (target.classList.contains('rename-tag-btn')) {
        const currentName = target.dataset.name;
        const newName = prompt('새 분류 이름을 입력하세요:', currentName);
        if (newName && newName.trim() !== '' && newName !== currentName) {
            frontendSocket.send(JSON.stringify({ type: 'update_tag', payload: { project_id: currentProjectId, tag_id: tagId, new_name: newName.trim() } }));
        }
    }
}

function importTags(event) {
    if (!currentProjectId) { showToast('먼저 프로젝트를 선택하세요.', 'error'); return; }
    const file = event.target.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('tag_file', file);
        fetch(`/connections/import-tags/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData
        }).then(res => res.json()).then(data => {
            showToast(data.status === 'success' ? '태그 파일을 성공적으로 가져왔습니다.' : '파일 업로드에 실패했습니다.', data.status === 'success' ? 'success' : 'error');
            event.target.value = '';
        });
    }
}

function exportTags() {
    if (!currentProjectId) { showToast('먼저 프로젝트를 선택하세요.', 'error'); return; }
    window.location.href = `/connections/export-tags/${currentProjectId}/`;
}

function handleViewTabClick(e) {
    document.querySelector('.view-tab-button.active').classList.remove('active');
    e.currentTarget.classList.add('active');
    activeView = e.currentTarget.dataset.view;
    collapsedGroups = {};
    columnFilters = {};
    renderDataTable();
}

function clearSelectionFilter() {
    isFilterToSelectionActive = false;
    revitFilteredIds.clear();
    document.getElementById('clear-selection-filter-btn').style.display = 'none';
    renderDataTable();
    showToast('선택 필터를 해제하고 전체 목록을 표시합니다.', 'info');
}

function assignTagsToSelection() {
    const tagId = document.getElementById('tag-assign-select').value;
    if (!tagId) { showToast('적용할 분류를 선택하세요.', 'error'); return; }
    if (selectedElementIds.size === 0) { showToast('분류를 적용할 객체를 테이블에서 선택하세요.', 'error'); return; }
    frontendSocket.send(JSON.stringify({
        type: 'assign_tags',
        payload: { project_id: currentProjectId, tag_id: tagId, element_ids: Array.from(selectedElementIds) }
    }));
}

function clearTagsFromSelection() {
    if (selectedElementIds.size === 0) { showToast('분류를 제거할 객체를 테이블에서 선택하세요.', 'error'); return; }
    if (confirm(`${selectedElementIds.size}개 항목의 모든 수량산출분류를 제거하시겠습니까?`)) {
        frontendSocket.send(JSON.stringify({
            type: 'clear_tags',
            payload: { project_id: currentProjectId, element_ids: Array.from(selectedElementIds) }
        }));
    }
}

function handleColumnFilter(event) {
    if (event.target.classList.contains('column-filter') && event.key === 'Enter') {
        columnFilters[event.target.dataset.field] = event.target.value.toLowerCase();
        renderDataTable();
    }
}

function handleTableClick(event) {
    const row = event.target.closest('tr');
    if (!row) return;
    if (row.classList.contains('group-header')) {
        const groupPath = row.dataset.groupPath;
        if (groupPath) {
            collapsedGroups[groupPath] = !collapsedGroups[groupPath];
            renderDataTable();
        }
    } else if (row.dataset.id) {
        handleRowSelection(event, row);
        if (isFilterToSelectionActive) {
            document.querySelectorAll('#data-table-container tr[data-id]').forEach(tr => {
                const currentId = allRevitData.find(d => d.element_unique_id === tr.dataset.id)?.id;
                tr.classList.toggle('selected-row', selectedElementIds.has(currentId));
            });
        } else {
            renderDataTable();
        }
        renderAssignedTagsTable();
    }
}

function handleRulesetNavClick(e) {
    const targetButton = e.currentTarget;
    if (targetButton.classList.contains('active')) {
        return; // 이미 활성화된 버튼이면 아무것도 안함
    }

    // 모든 서브 탭 버튼 비활성화
    document.querySelectorAll('.ruleset-nav-button.active').forEach(btn => btn.classList.remove('active'));
    // 클릭된 버튼 활성화
    targetButton.classList.add('active');

    const targetRulesetId = targetButton.dataset.ruleset;

    // 모든 룰셋 컨텐츠 숨기기
    document.querySelectorAll('.ruleset-content').forEach(content => content.classList.remove('active'));
    // 해당 룰셋 컨텐츠 보여주기
    document.getElementById(targetRulesetId).classList.add('active');
    
    showToast(`${targetButton.querySelector('strong').innerText} 탭으로 전환합니다.`, 'info');
}

let loadedClassificationRules = []; // 전역 변수는 그대로 둡니다.


// 룰셋 테이블의 모든 동작(저장, 수정, 취소, 삭제)을 처리하는 함수

// 룰셋 테이블의 모든 동작(저장, 수정, 취소, 삭제)을 처리하는 함수
async function handleClassificationRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;

    const ruleId = ruleRow.dataset.ruleId;

    // --- 수정 버튼 클릭 ---
    if (target.classList.contains('edit-rule-btn')) {
        const existingEditRow = document.querySelector('#classification-ruleset .rule-edit-row');
        if (existingEditRow) {
            showToast('이미 편집 중인 규칙이 있습니다.', 'error');
            return;
        }
        // loadedClassificationRules에서 현재 데이터를 찾아 편집 모드로 렌더링
        const ruleToEdit = loadedClassificationRules.find(r => r.id === parseInt(ruleId));
        renderClassificationRulesetTable(loadedClassificationRules, ruleToEdit.id);
    }

    // --- 삭제 버튼 클릭 ---
    else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('이 규칙을 정말 삭제하시겠습니까?')) return;
        await deleteClassificationRule(ruleId);
    }

    // --- 저장 버튼 클릭 ---
    else if (target.classList.contains('save-rule-btn')) {
        const priority = ruleRow.querySelector('.rule-priority-input').value;
        const description = ruleRow.querySelector('.rule-description-input').value;
        const target_tag_id = ruleRow.querySelector('.rule-tag-select').value;
        const conditionsStr = ruleRow.querySelector('.rule-conditions-input').value;

        if (!target_tag_id) {
            showToast('대상 분류를 선택하세요.', 'error');
            return;
        }

        let conditions;
        try {
            conditions = JSON.parse(conditionsStr || '[]'); // 비어있으면 빈 배열로 처리
            if (!Array.isArray(conditions)) throw new Error();
        } catch (e) {
            showToast('조건이 유효한 JSON 배열 형식이 아닙니다.', 'error');
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? parseInt(ruleId) : null,
            // ▼▼▼ [핵심 수정] parseInt()를 제거하여 ID를 문자열 그대로 전달합니다. ▼▼▼
            target_tag_id: target_tag_id,
            conditions: conditions,
            priority: parseInt(priority) || 0,
            description: description,
        };
        
        await saveClassificationRule(ruleData);
    }

    // --- 취소 버튼 클릭 ---
    else if (target.classList.contains('cancel-edit-btn')) {
        renderClassificationRulesetTable(loadedClassificationRules);
    }
}
/**
 * '분류 할당 룰셋'을 서버에 저장(생성/업데이트)합니다.
 * @param {Object} ruleData - 저장할 규칙 데이터
 */

async function saveClassificationRule(ruleData) {
    try {
        // ▼▼▼ [수정] URL 앞에 '/connections'를 추가합니다. ▼▼▼
        const response = await fetch(`/connections/api/rules/classification/${currentProjectId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            body: JSON.stringify(ruleData)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || '규칙 저장에 실패했습니다.');
        }

        showToast(result.message, 'success');
        await loadClassificationRules(); // 성공 후 목록 새로고침

    } catch (error) {
        console.error('Error saving rule:', error);
        showToast(error.message, 'error');
    }
}


/**
 * 서버에서 '분류 할당 룰셋'을 삭제합니다.
 * @param {Number} ruleId - 삭제할 규칙의 ID
 */

async function deleteClassificationRule(ruleId) {
    try {
        // ▼▼▼ [수정] URL 앞에 '/connections'를 추가합니다. ▼▼▼
        const response = await fetch(`/connections/api/rules/classification/${currentProjectId}/${ruleId}/`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': csrftoken
            }
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || '규칙 삭제에 실패했습니다.');
        }

        showToast(result.message, 'success');
        await loadClassificationRules(); // 성공 후 목록 새로고침

    } catch (error) {
        console.error('Error deleting rule:', error);
        showToast(error.message, 'error');
    }
}

// ui.js에서 loadClassificationRules 함수를 main.js로 이동하고 수정합니다.
/**
 * 프로젝트의 모든 '분류 할당 룰셋'을 서버에서 불러와 전역 변수에 저장하고 화면을 다시 그립니다.
 */

async function loadClassificationRules() {
    if (!currentProjectId) {
        loadedClassificationRules = [];
        renderClassificationRulesetTable(loadedClassificationRules);
        return;
    }
    try {
        // ▼▼▼ [수정] URL 앞에 '/connections'를 추가합니다. ▼▼▼
        const response = await fetch(`/connections/api/rules/classification/${currentProjectId}/`);
        if (!response.ok) {
            throw new Error('룰셋 데이터를 불러오는데 실패했습니다.');
        }
        loadedClassificationRules = await response.json(); // 불러온 데이터를 전역 변수에 저장
        renderClassificationRulesetTable(loadedClassificationRules); // 저장된 데이터로 테이블 렌더링
    } catch (error) {
        console.error('Error loading classification rules:', error);
        loadedClassificationRules = [];
        renderClassificationRulesetTable(loadedClassificationRules); // 에러 시 빈 테이블 표시
        showToast(error.message, 'error');
    }
}
/**
 * '룰셋 일괄적용' 버튼 클릭 시 실행되는 함수
 */
async function applyClassificationRules() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    if (!confirm('정의된 모든 분류 할당 룰셋을 전체 객체에 적용하시겠습니까?\n기존에 할당된 분류는 유지되며, 규칙에 맞는 새로운 분류가 추가됩니다.')) {
        return;
    }

    showToast('룰셋을 적용하고 있습니다... 잠시만 기다려주세요.', 'info', 5000);

    try {
        const response = await fetch(`/connections/api/rules/apply-classification/${currentProjectId}/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrftoken,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || '룰셋 적용에 실패했습니다.');
        }

        showToast(result.message, 'success');
        
        // 변경사항을 화면에 즉시 반영하기 위해 Revit 데이터 전체를 다시 불러옵니다.
        fetchDataFromRevit();

    } catch (error) {
        console.error('Error applying rules:', error);
        showToast(error.message, 'error');
    }
}


// ▼▼▼ [추가] 파일의 이 위치에 아래 함수들을 모두 추가해주세요. ▼▼▼

/**
 * 프로젝트의 모든 '속성 맵핑 룰셋'을 서버에서 불러와 전역 변수에 저장하고 화면을 다시 그립니다.
 */
async function loadPropertyMappingRules() {
    if (!currentProjectId) {
        loadedPropertyMappingRules = [];
        renderPropertyMappingRulesetTable(loadedPropertyMappingRules);
        return;
    }
    try {
        const response = await fetch(`/connections/api/rules/property-mapping/${currentProjectId}/`);
        if (!response.ok) {
            throw new Error('속성 맵핑 룰셋 데이터를 불러오는데 실패했습니다.');
        }
        loadedPropertyMappingRules = await response.json();
        renderPropertyMappingRulesetTable(loadedPropertyMappingRules);
    } catch (error) {
        console.error('Error loading property mapping rules:', error);
        loadedPropertyMappingRules = [];
        renderPropertyMappingRulesetTable(loadedPropertyMappingRules); // 에러 시 빈 테이블 표시
        showToast(error.message, 'error');
    }
}

/**
 * '속성 맵핑 룰셋' 데이터를 기반으로 테이블을 렌더링합니다.
 * @param {Array} rules - 렌더링할 규칙 데이터 배열
 * @param {String|null} editId - 현재 편집 중인 규칙의 ID ('new'일 경우 새 규칙 추가)
 */
function renderPropertyMappingRulesetTable(rules, editId = null) {
    const container = document.getElementById('mapping-ruleset-table-container');
    const tags = Array.from(document.getElementById('tag-assign-select').options)
        .filter(opt => opt.value)
        .map(opt => ({ id: opt.value, name: opt.text }));

    if (!rules.length && editId !== 'new') {
        container.innerHTML = '<p>정의된 속성 맵핑 규칙이 없습니다. "새 규칙 추가" 버튼으로 시작하세요.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'ruleset-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>이름</th>
                <th>설명</th>
                <th>대상 분류</th>
                <th>객체 조건 (JSON)</th>
                <th>맵핑 스크립트 (JSON)</th>
                <th>우선순위</th>
                <th>작업</th>
            </tr>
        </thead>
        <tbody>
        </tbody>
    `;
    const tbody = table.querySelector('tbody');

    const renderRow = (rule) => {
        const isEditMode = editId && (editId === 'new' ? rule.id === 'new' : rule.id === editId);
        const row = document.createElement('tr');
        row.dataset.ruleId = rule.id;

        if (isEditMode) {
            row.classList.add('rule-edit-row');
            const tagOptions = tags.map(t => `<option value="${t.id}" ${rule.target_tag_id === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
            row.innerHTML = `
                <td><input type="text" class="rule-name-input" value="${rule.name || '새 규칙'}" placeholder="규칙 이름"></td>
                <td><input type="text" class="rule-description-input" value="${rule.description || ''}" placeholder="규칙 설명"></td>
                <td><select class="rule-tag-select"><option value="">-- 분류 선택 --</option>${tagOptions}</select></td>
                <td><textarea class="rule-conditions-input" rows="3" placeholder='[{"parameter":"Category", "operator":"equals", "value":"벽"}]'>${JSON.stringify(rule.conditions || [], null, 2)}</textarea></td>
                <td><textarea class="rule-mapping-input" rows="3" placeholder='{"체적": "{Volume}", "면적": "{Area} * 2"}'>${JSON.stringify(rule.mapping_script || {}, null, 2)}</textarea></td>
                <td><input type="number" class="rule-priority-input" value="${rule.priority || 0}"></td>
                <td>
                    <button class="save-rule-btn">💾 저장</button>
                    <button class="cancel-edit-btn">❌ 취소</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${rule.name}</td>
                <td>${rule.description}</td>
                <td>${rule.target_tag_name}</td>
                <td><pre>${JSON.stringify(rule.conditions, null, 2)}</pre></td>
                <td><pre>${JSON.stringify(rule.mapping_script, null, 2)}</pre></td>
                <td>${rule.priority}</td>
                <td>
                    <button class="edit-rule-btn">✏️ 수정</button>
                    <button class="delete-rule-btn">🗑️ 삭제</button>
                </td>
            `;
        }
        return row;
    };

    if (editId === 'new') {
        const newRule = { id: 'new', conditions: [], mapping_script: {}, priority: 0 };
        tbody.appendChild(renderRow(newRule));
    }

    rules.forEach(rule => {
        // 편집 중인 행은 다시 그리지 않도록 필터링
        if (rule.id !== editId) {
            tbody.appendChild(renderRow(rule));
        } else {
            tbody.appendChild(renderRow(rules.find(r => r.id === editId)));
        }
    });
    
    // 편집 모드일 때, 새 규칙 행이 아닌 경우 기존 규칙 목록을 다시 그림
    if (editId && editId !== 'new') {
        const otherRules = rules.filter(r => r.id !== editId);
        tbody.innerHTML = ''; // tbody 초기화
        rules.forEach(rule => {
            tbody.appendChild(renderRow(rule));
        });
    }


    container.innerHTML = '';
    container.appendChild(table);
}


/**
 * '속성 맵핑 룰셋' 테이블의 액션(저장, 수정, 취소, 삭제)을 처리합니다.
 * @param {Event} event
 */
async function handlePropertyMappingRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;

    const ruleId = ruleRow.dataset.ruleId;

    // --- 수정 버튼 ---
    if (target.classList.contains('edit-rule-btn')) {
        if (document.querySelector('#mapping-ruleset-table-container .rule-edit-row')) {
            showToast('이미 편집 중인 규칙이 있습니다.', 'error');
            return;
        }
        renderPropertyMappingRulesetTable(loadedPropertyMappingRules, ruleId);
    }

    // --- 삭제 버튼 ---
    else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('이 속성 맵핑 규칙을 정말 삭제하시겠습니까?')) return;
        await deletePropertyMappingRule(ruleId);
    }

    // --- 저장 버튼 ---
    else if (target.classList.contains('save-rule-btn')) {
        const name = ruleRow.querySelector('.rule-name-input').value;
        const description = ruleRow.querySelector('.rule-description-input').value;
        const target_tag_id = ruleRow.querySelector('.rule-tag-select').value;
        const conditionsStr = ruleRow.querySelector('.rule-conditions-input').value;
        const mappingStr = ruleRow.querySelector('.rule-mapping-input').value;
        const priority = ruleRow.querySelector('.rule-priority-input').value;

        if (!target_tag_id) {
            showToast('대상 분류를 선택하세요.', 'error');
            return;
        }
        if (!name.trim()) {
            showToast('규칙 이름을 입력하세요.', 'error');
            return;
        }

        let conditions, mapping_script;
        try {
            conditions = JSON.parse(conditionsStr || '[]');
            if (!Array.isArray(conditions)) throw new Error("객체 조건이 배열 형식이 아닙니다.");
        } catch (e) {
            showToast(`객체 조건이 유효한 JSON 형식이 아닙니다: ${e.message}`, 'error');
            return;
        }
        try {
            mapping_script = JSON.parse(mappingStr || '{}');
            if (typeof mapping_script !== 'object' || Array.isArray(mapping_script)) {
                throw new Error("맵핑 스크립트가 객체(Object) 형식이 아닙니다.");
            }
        } catch (e) {
            showToast(`맵핑 스크립트가 유효한 JSON 형식이 아닙니다: ${e.message}`, 'error');
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            name: name,
            description: description,
            target_tag_id: target_tag_id,
            conditions: conditions,
            mapping_script: mapping_script,
            priority: parseInt(priority) || 0,
        };
        
        await savePropertyMappingRule(ruleData);
    }

    // --- 취소 버튼 ---
    else if (target.classList.contains('cancel-edit-btn')) {
        renderPropertyMappingRulesetTable(loadedPropertyMappingRules);
    }
}

/**
 * '속성 맵핑 룰셋'을 서버에 저장(생성/업데이트)합니다.
 * @param {Object} ruleData - 저장할 규칙 데이터
 */
async function savePropertyMappingRule(ruleData) {
    try {
        const response = await fetch(`/connections/api/rules/property-mapping/${currentProjectId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            body: JSON.stringify(ruleData)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || '규칙 저장에 실패했습니다.');
        }

        showToast(result.message, 'success');
        await loadPropertyMappingRules(); // 성공 후 목록 새로고침
    } catch (error) {
        console.error('Error saving property mapping rule:', error);
        showToast(error.message, 'error');
    }
}

/**
 * 서버에서 '속성 맵핑 룰셋'을 삭제합니다.
 * @param {String} ruleId - 삭제할 규칙의 ID
 */
async function deletePropertyMappingRule(ruleId) {
    try {
        const response = await fetch(`/connections/api/rules/property-mapping/${currentProjectId}/${ruleId}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': csrftoken }
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || '규칙 삭제에 실패했습니다.');
        }

        showToast(result.message, 'success');
        await loadPropertyMappingRules(); // 성공 후 목록 새로고침
    } catch (error) {
        console.error('Error deleting property mapping rule:', error);
        showToast(error.message, 'error');
    }
}
// ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

// ... (기존 createAutoQuantityMembers 함수 아래)

async function loadQuantityMembers() {
    if (!currentProjectId) {
        renderActiveQmView(); // ▼▼▼ [수정] 이 부분을 수정합니다. ▼▼▼
        return;
    }
    try {
        const response = await fetch(`/connections/api/quantity-members/${currentProjectId}/`);
        if (!response.ok) throw new Error('수량산출부재 목록을 불러오는데 실패했습니다.');
        
        loadedQuantityMembers = await response.json();
        renderActiveQmView(); // ▼▼▼ [수정] 이 부분을 수정합니다. ▼▼▼
        
        populateQmFieldSelection(loadedQuantityMembers);

    } catch (error) {
        console.error("Error loading quantity members:", error);
        showToast(error.message, 'error');
    }
}

async function createManualQuantityMember() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    try {
        const response = await fetch(`/connections/api/quantity-members/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadQuantityMembers(); // 목록 새로고침
    } catch (error) {
        console.error("Error creating manual quantity member:", error);
        showToast(error.message, 'error');
    }
}

// main.js 파일 가장 하단에 추가

// ▼▼▼ [추가] 수량산출부재 자동 생성 관련 함수 ▼▼▼
async function createAutoQuantityMembers() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    if (!confirm('정말로 모든 수량산출부재를 자동으로 다시 생성하시겠습니까?\n이 작업은 기존에 있던 모든 수량산출부재를 삭제하고, 현재의 수량산출분류를 기준으로 새로 생성합니다.')) {
        return;
    }

    showToast('수량산출부재를 자동으로 생성하고 있습니다...', 'info', 5000);

    try {
        const response = await fetch(`/connections/api/quantity-members/auto-create/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadQuantityMembers(); // 성공 후 목록 새로고침
    } catch (error) {
        console.error("Error creating auto quantity members:", error);
        showToast(error.message, 'error');
    }
}
// connections/static/connections/main.js 파일 가장 하단에 추가
// aibim_quantity_takeoff_web/connections/static/connections/main.js

// ... (파일의 다른 부분은 그대로 유지합니다) ...


function addQmGroupingLevel() {
    const container = document.getElementById('qm-grouping-controls');
    const newIndex = container.children.length + 1;
    const newLevelDiv = document.createElement('div');
    newLevelDiv.className = 'group-level';
    newLevelDiv.innerHTML = `
        <label>${newIndex}차:</label>
        <select class="qm-group-by-select"></select>
        <button class="remove-group-level-btn">-</button>
    `;
    container.appendChild(newLevelDiv);
    populateQmFieldSelection(loadedQuantityMembers); // QM 필드 목록으로 채웁니다.

    newLevelDiv.querySelector('.remove-group-level-btn').addEventListener('click', function() {
        this.parentElement.remove();
        renderActiveQmView(); // ▼▼▼ [수정] 이 부분을 수정합니다. ▼▼▼
    });
}
/**
 * '수량산출부재' 테이블의 컬럼 필터 입력을 처리합니다.
 */
function handleQmColumnFilter(event) {
    if (event.target.classList.contains('column-filter') && event.key === 'Enter') {
        qmColumnFilters[event.target.dataset.field] = event.target.value.toLowerCase();
        renderActiveQmView(); // ▼▼▼ [수정] 이 부분을 수정합니다. ▼▼▼
    }
}

/**
 * '수량산출부재' 테이블의 행 선택 로직을 처리합니다. (Ctrl, Shift 키 조합)
 * @param {Event} event - 클릭 이벤트 객체
 * @param {HTMLElement} clickedRow - 클릭된 <tr> 요소
 */
function handleQmRowSelection(event, clickedRow) {
    const tableContainer = document.getElementById('qm-table-container');
    const allVisibleRows = Array.from(tableContainer.querySelectorAll('tr[data-id]'));
    const clickedRowIndex = allVisibleRows.findIndex(r => r.dataset.id === clickedRow.dataset.id);
    const memberId = clickedRow.dataset.id;
    if (!memberId) return;

    if (event.shiftKey && lastSelectedQmRowIndex > -1) {
        const start = Math.min(lastSelectedQmRowIndex, clickedRowIndex);
        const end = Math.max(lastSelectedQmRowIndex, clickedRowIndex);
        if (!event.ctrlKey) selectedQmIds.clear();
        for (let i = start; i <= end; i++) {
            const rowId = allVisibleRows[i].dataset.id;
            if (rowId) selectedQmIds.add(rowId);
        }
    } else if (event.ctrlKey) {
        if (selectedQmIds.has(memberId)) selectedQmIds.delete(memberId);
        else selectedQmIds.add(memberId);
    } else {
        selectedQmIds.clear();
        selectedQmIds.add(memberId);
    }
    lastSelectedQmRowIndex = clickedRowIndex;
}
// main.js
// main.js

async function handleQuantityMemberActions(event) {
    const target = event.target;
    const actionRow = target.closest('tr');
    
    if (actionRow && actionRow.classList.contains('group-header')) {
        const groupPath = actionRow.dataset.groupPath;
        if (groupPath) toggleQmGroup(groupPath);
        return;
    }
    
    if (!actionRow) return;

    const memberId = actionRow.dataset.id;
    const isEditRow = document.querySelector('#qm-table-container .qm-edit-row');

    if (target.matches('input, select, textarea')) {
        return; 
    }

    if (!target.closest('button') && actionRow.dataset.id) {
        handleQmRowSelection(event, actionRow);
        renderActiveQmView(isEditRow?.dataset.id);
        renderQmPropertiesTable(isEditRow?.dataset.id); 
        renderQmCostCodesList();
        renderQmMemberMarkDetails();
        renderQmLinkedRawElementPropertiesTable();
        return;
    }
    
    if (!memberId) return;

    // --- 수정 버튼 ---
    if (target.classList.contains('edit-qm-btn')) {
        if (activeQmView !== 'quantity-member-view') {
            showToast("'수량산출부재 뷰'에서만 항목을 수정할 수 있습니다.", 'error');
            return;
        }
        if (isEditRow) {
            showToast('이미 편집 중인 부재가 있습니다.', 'error');
            return;
        }
        renderActiveQmView(memberId);
        renderQmPropertiesTable(memberId);
    }
    
    // --- 취소 버튼 ---
    else if (target.classList.contains('cancel-qm-btn')) {
        renderActiveQmView(); // 편집 모드를 해제하고 테이블을 다시 그립니다.
        renderQmPropertiesTable(); // 속성 테이블도 원래대로 되돌립니다.
    }

    // --- 저장 버튼 ---
    else if (target.classList.contains('save-qm-btn')) {
        const nameInput = actionRow.querySelector('.qm-name-input');
        const tagSelect = actionRow.querySelector('.qm-tag-select');
        const properties = {};
        const propRows = document.querySelectorAll('#qm-properties-container .property-edit-row');
        let hasError = false;

        propRows.forEach(row => {
            const keyInput = row.querySelector('.prop-key-input');
            const valueInput = row.querySelector('.prop-value-input');
            const key = keyInput.value.trim();
            if (key && properties.hasOwnProperty(key)) {
                showToast(`속성 이름 "${key}"이(가) 중복되었습니다.`, 'error');
                hasError = true;
            }
            if(key) properties[key] = valueInput.value;
        });
        if (hasError) return;
        
        let mapping_expression, costCodeExpressions;
        try {
            const rawMappingExpr = actionRow.querySelector('.qm-mapping-expression-input').value;
            mapping_expression = rawMappingExpr.trim() === '' ? {} : JSON.parse(rawMappingExpr);
        } catch (e) {
            showToast('맵핑식(JSON) 형식이 올바르지 않습니다.', 'error'); return;
        }
        
        const markExpression = actionRow.querySelector('.qm-mark-expr-input').value;

        try {
            const rawCcExpr = actionRow.querySelector('.qm-cc-expr-input').value;
            costCodeExpressions = rawCcExpr.trim() === '' ? [] : JSON.parse(rawCcExpr);
            if (!Array.isArray(costCodeExpressions)) throw new Error("개별 공사코드 룰은 반드시 배열(list) 형식이어야 합니다.");
        } catch(e) {
            showToast(e.message || '개별 공사코드 룰(JSON)이 올바른 목록 형식이 아닙니다.', 'error'); return;
        }

        const memberData = {
            name: nameInput.value,
            classification_tag_id: tagSelect.value,
            properties: properties,
            mapping_expression: mapping_expression,
            member_mark_expression: markExpression,
            cost_code_expressions: costCodeExpressions,
        };
        
        try {
            const response = await fetch(`/connections/api/quantity-members/${currentProjectId}/${memberId}/`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify(memberData),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `저장에 실패했습니다: ${response.status}`);
            showToast(result.message, 'success');
            
            // ▼▼▼ [핵심] 저장 성공 후, 서버에서 데이터를 다시 불러와 화면 전체를 갱신합니다. ▼▼▼
            await loadQuantityMembers(); 
            
            renderQmPropertiesTable();
            renderQmCostCodesList();
            renderQmMemberMarkDetails();
            renderQmLinkedRawElementPropertiesTable();

        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    // --- 삭제 버튼 ---
    else if (target.classList.contains('delete-qm-btn')) {
        if (activeQmView !== 'quantity-member-view') {
            showToast("'수량산출부재 뷰'에서만 항목을 삭제할 수 있습니다.", 'error');
            return;
        }
        if (confirm('이 수량산출부재를 정말 삭제하시겠습니까?')) {
            try {
                const response = await fetch(`/connections/api/quantity-members/${currentProjectId}/${memberId}/`, {
                    method: 'DELETE', headers: { 'X-CSRFToken': csrftoken },
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                showToast(result.message, 'success');
                
                selectedQmIds.delete(memberId);
                await loadQuantityMembers();
                
                renderQmPropertiesTable();
                renderQmCostCodesList();
                renderQmMemberMarkDetails();
                renderQmLinkedRawElementPropertiesTable();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
    }
}

/**
 * '수량산출부재 속성' 테이블의 액션(추가, 삭제)을 처리합니다.
 * 이벤트 위임을 사용하여 #qm-properties-container 에 리스너를 설정합니다.
 */
function handleQmPropertiesActions(event) {
    const target = event.target;

    // '속성 추가' 버튼 클릭
    if (target.id === 'add-property-btn') {
        const tableBody = document.querySelector('#qm-properties-container .properties-table tbody');
        if (tableBody) {
            const newRow = document.createElement('tr');
            newRow.className = 'property-edit-row';
            newRow.innerHTML = `
                <td><input type="text" class="prop-key-input" placeholder="새 속성 이름"></td>
                <td><input type="text" class="prop-value-input" placeholder="값"></td>
                <td><button class="delete-prop-btn">삭제</button></td>
            `;
            tableBody.appendChild(newRow);
        }
    }
    // '삭제' 버튼 클릭
    else if (target.classList.contains('delete-prop-btn')) {
        target.closest('tr').remove();
    }
}
/**
 * 현재 프로젝트의 모든 공사코드를 서버에서 불러옵니다.
 */
async function loadCostCodes() {
    if (!currentProjectId) {
        renderCostCodesTable([]);
        return;
    }
    try {
        const response = await fetch(`/connections/api/cost-codes/${currentProjectId}/`);
        if (!response.ok) throw new Error('공사코드 목록을 불러오는데 실패했습니다.');

        loadedCostCodes = await response.json();
        renderCostCodesTable(loadedCostCodes);

        // ▼▼▼ [추가] 수량산출부재 탭의 공사코드 드롭다운도 채웁니다. ▼▼▼
        const select = document.getElementById('qm-cost-code-assign-select');
        select.innerHTML = '<option value="">-- 공사코드 선택 --</option>'; // 초기화
        loadedCostCodes.forEach(code => {
            const option = document.createElement('option');
            option.value = code.id;
            option.textContent = `${code.code} - ${code.name}`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error("Error loading cost codes:", error);
        showToast(error.message, 'error');
    }
}

/**
 * 공사코드 데이터를 기반으로 테이블을 렌더링합니다.
 * @param {Array} codes - 렌더링할 공사코드 데이터 배열
 * @param {String|null} editId - 현재 편집 중인 코드의 ID ('new'일 경우 새 코드 추가)
 */
function renderCostCodesTable(codes, editId = null) {
    const container = document.getElementById('cost-codes-table-container');
    if (!codes.length && editId !== 'new') {
        container.innerHTML = '<p>정의된 공사코드가 없습니다. "새 공사코드 추가" 버튼으로 시작하세요.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'ruleset-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>코드</th>
                <th>품명</th>
                <th>규격</th>
                <th>단위</th>
                <th>카테고리</th>
                <th>설명</th>
                <th>작업</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    const renderRow = (code) => {
        const isEditMode = editId && (editId === 'new' ? code.id === 'new' : code.id === editId);
        const row = document.createElement('tr');
        row.dataset.codeId = code.id;

        if (isEditMode) {
            row.classList.add('rule-edit-row');
            row.innerHTML = `
                <td><input type="text" class="cost-code-input" value="${code.code || ''}" placeholder="C-001"></td>
                <td><input type="text" class="cost-name-input" value="${code.name || ''}" placeholder="필수 항목"></td>
                <td><input type="text" class="cost-spec-input" value="${code.spec || ''}"></td>
                <td><input type="text" class="cost-unit-input" value="${code.unit || ''}" placeholder="m2"></td>
                <td><input type="text" class="cost-category-input" value="${code.category || ''}" placeholder="마감공사"></td>
                <td><input type="text" class="cost-description-input" value="${code.description || ''}"></td>
                <td>
                    <button class="save-cost-code-btn">💾 저장</button>
                    <button class="cancel-cost-code-btn">❌ 취소</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${code.code}</td>
                <td>${code.name}</td>
                <td>${code.spec}</td>
                <td>${code.unit}</td>
                <td>${code.category}</td>
                <td>${code.description}</td>
                <td>
                    <button class="edit-cost-code-btn">✏️ 수정</button>
                    <button class="delete-cost-code-btn">🗑️ 삭제</button>
                </td>
            `;
        }
        return row;
    };

    if (editId === 'new') {
        tbody.appendChild(renderRow({ id: 'new' }));
    }

    codes.forEach(code => {
        tbody.appendChild(renderRow(code.id === editId ? codes.find(c => c.id === editId) : code));
    });

    container.innerHTML = '';
    container.appendChild(table);
}

/**
 * 공사코드 테이블의 액션(저장, 수정, 취소, 삭제)을 처리합니다.
 * @param {Event} event
 */
async function handleCostCodeActions(event) {
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow) return;

    const codeId = actionRow.dataset.codeId;

    // --- 수정 버튼 ---
    if (target.classList.contains('edit-cost-code-btn')) {
        if (document.querySelector('#cost-codes-table-container .rule-edit-row')) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error');
            return;
        }
        renderCostCodesTable(loadedCostCodes, codeId);
    }
    // --- 삭제 버튼 ---
    else if (target.classList.contains('delete-cost-code-btn')) {
        if (!confirm('이 공사코드를 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(`/connections/api/cost-codes/${currentProjectId}/${codeId}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadCostCodes();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
    // --- 저장 버튼 ---
    else if (target.classList.contains('save-cost-code-btn')) {
        const codeData = {
            code: actionRow.querySelector('.cost-code-input').value,
            name: actionRow.querySelector('.cost-name-input').value,
            spec: actionRow.querySelector('.cost-spec-input').value,
            unit: actionRow.querySelector('.cost-unit-input').value,
            category: actionRow.querySelector('.cost-category-input').value,
            description: actionRow.querySelector('.cost-description-input').value,
        };

        if (!codeData.code || !codeData.name) {
            showToast('코드와 품명은 반드시 입력해야 합니다.', 'error');
            return;
        }

        const isNew = codeId === 'new';
        const url = isNew ? `/connections/api/cost-codes/${currentProjectId}/` : `/connections/api/cost-codes/${currentProjectId}/${codeId}/`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify(codeData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadCostCodes();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
    // --- 취소 버튼 ---
    else if (target.classList.contains('cancel-cost-code-btn')) {
        renderCostCodesTable(loadedCostCodes);
    }
}


// ▼▼▼ [추가] 파일의 맨 아래에 아래 함수들을 모두 추가해주세요. ▼▼▼

/**
 * 선택된 수량산출부재에 할당된 공사코드 목록을 화면 우측에 표시합니다.
 */
function renderQmCostCodesList() {
    const container = document.getElementById('qm-cost-codes-list');
    if (selectedQmIds.size === 0) {
        container.innerHTML = '공사코드를 보려면 부재를 선택하세요.';
        return;
    }

    // 선택된 모든 부재에 공통적으로 할당된 공사코드 ID를 찾습니다.
    const selectedMembers = loadedQuantityMembers.filter(m => selectedQmIds.has(m.id));
    if (selectedMembers.length === 0) {
        container.innerHTML = '선택된 부재를 찾을 수 없습니다.';
        return;
    }

    const firstMemberCodes = new Set(selectedMembers[0].cost_code_ids);
    const commonCodeIds = [...firstMemberCodes].filter(codeId => 
        selectedMembers.every(member => member.cost_code_ids.includes(codeId))
    );

    if (commonCodeIds.length === 0) {
        container.innerHTML = '선택된 부재들에 공통으로 할당된 공사코드가 없습니다.';
        if (selectedQmIds.size > 1) {
            container.innerHTML += '<br><small>(개별 부재에는 할당되어 있을 수 있습니다)</small>';
        }
        return;
    }

    container.innerHTML = '<ul>' + commonCodeIds.map(codeId => {
        const costCode = loadedCostCodes.find(c => c.id === codeId);
        return costCode ? `<li>${costCode.code} - ${costCode.name}</li>` : `<li>알 수 없는 코드: ${codeId}</li>`;
    }).join('') + '</ul>';
}

/**
 * 선택된 부재들에 공사코드를 할당합니다.
 */
async function assignCostCodeToQm() {
    const costCodeId = document.getElementById('qm-cost-code-assign-select').value;
    if (!costCodeId) {
        showToast('적용할 공사코드를 선택하세요.', 'error');
        return;
    }
    if (selectedQmIds.size === 0) {
        showToast('공사코드를 적용할 부재를 테이블에서 선택하세요.', 'error');
        return;
    }

    try {
        const response = await fetch(`/connections/api/quantity-members/manage-cost-codes/${currentProjectId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            body: JSON.stringify({
                member_ids: Array.from(selectedQmIds),
                cost_code_id: costCodeId,
                action: 'assign'
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 업데이트
        loadedQuantityMembers.forEach(member => {
            if (selectedQmIds.has(member.id)) {
                if (!member.cost_code_ids.includes(costCodeId)) {
                    member.cost_code_ids.push(costCodeId);
                }
            }
        });
        renderQmCostCodesList(); // 화면 새로고침
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * 선택된 부재들에서 모든 공사코드를 제거합니다.
 */
async function clearCostCodesFromQm() {
    if (selectedQmIds.size === 0) {
        showToast('공사코드를 제거할 부재를 테이블에서 선택하세요.', 'error');
        return;
    }
    if (!confirm(`${selectedQmIds.size}개 부재의 모든 공사코드를 제거하시겠습니까?`)) {
        return;
    }

    try {
        const response = await fetch(`/connections/api/quantity-members/manage-cost-codes/${currentProjectId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            body: JSON.stringify({
                member_ids: Array.from(selectedQmIds),
                action: 'clear'
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 업데이트
        loadedQuantityMembers.forEach(member => {
            if (selectedQmIds.has(member.id)) {
                member.cost_code_ids = [];
            }
        });
        renderQmCostCodesList(); // 화면 새로고침

    } catch (error) {
        showToast(error.message, 'error');
    }
}
// ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

/**
 * 현재 프로젝트의 모든 일람부호를 서버에서 불러옵니다.
 */
async function loadMemberMarks() {
    if (!currentProjectId) {
        renderMemberMarksTable([]);
        return;
    }
    try {
        const response = await fetch(`/connections/api/member-marks/${currentProjectId}/`);
        if (!response.ok) throw new Error('일람부호 목록을 불러오는데 실패했습니다.');

        loadedMemberMarks = await response.json();
        renderMemberMarksTable(loadedMemberMarks);
        
        // 수량산출부재 탭의 일람부호 드롭다운도 채웁니다.
        const select = document.getElementById('qm-member-mark-assign-select');
        select.innerHTML = '<option value="">-- 일람부호 선택 --</option>'; // 초기화
        loadedMemberMarks.forEach(mark => {
            const option = document.createElement('option');
            option.value = mark.id;
            option.textContent = mark.mark;
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading member marks:", error);
        showToast(error.message, 'error');
    }
}

/**
 * 일람부호 데이터를 기반으로 테이블을 렌더링합니다.
 */
function renderMemberMarksTable(marks, editId = null) {
    const container = document.getElementById('member-marks-table-container');
    if (!marks.length && editId !== 'new') {
        container.innerHTML = '<p>정의된 일람부호가 없습니다. "새 일람부호 추가" 버튼으로 시작하세요.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'ruleset-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>일람부호</th>
                <th>설명</th>
                <th>속성 (JSON)</th>
                <th>작업</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    const renderRow = (mark) => {
        const isEditMode = editId && (editId === 'new' ? mark.id === 'new' : mark.id === editId);
        const row = document.createElement('tr');
        row.dataset.markId = mark.id;

        if (isEditMode) {
            row.classList.add('rule-edit-row');
            row.innerHTML = `
                <td><input type="text" class="mark-mark-input" value="${mark.mark || ''}" placeholder="C1"></td>
                <td><input type="text" class="mark-description-input" value="${mark.description || ''}"></td>
                <td><textarea class="mark-properties-input" rows="3" placeholder='{"철근": "HD13", "간격": 200}'>${JSON.stringify(mark.properties || {}, null, 2)}</textarea></td>
                <td>
                    <button class="save-member-mark-btn">💾 저장</button>
                    <button class="cancel-member-mark-btn">❌ 취소</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${mark.mark}</td>
                <td>${mark.description}</td>
                <td><pre>${JSON.stringify(mark.properties, null, 2)}</pre></td>
                <td>
                    <button class="edit-member-mark-btn">✏️ 수정</button>
                    <button class="delete-member-mark-btn">🗑️ 삭제</button>
                </td>
            `;
        }
        return row;
    };
    if (editId === 'new') tbody.appendChild(renderRow({ id: 'new' }));
    marks.forEach(mark => {
        tbody.appendChild(renderRow(mark.id === editId ? marks.find(c => c.id === editId) : mark));
    });

    container.innerHTML = '';
    container.appendChild(table);
}

/**
 * 일람부호 테이블의 액션을 처리합니다.
 */
async function handleMemberMarkActions(event) {
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow) return;

    const markId = actionRow.dataset.markId;

    if (target.classList.contains('edit-member-mark-btn')) {
        if (document.querySelector('#member-marks-table-container .rule-edit-row')) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error'); return;
        }
        renderMemberMarksTable(loadedMemberMarks, markId);
    }
    else if (target.classList.contains('delete-member-mark-btn')) {
        if (!confirm('이 일람부호를 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(`/connections/api/member-marks/${currentProjectId}/${markId}/`, {
                method: 'DELETE', headers: { 'X-CSRFToken': csrftoken },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadMemberMarks();
        } catch (error) { showToast(error.message, 'error'); }
    }
    else if (target.classList.contains('save-member-mark-btn')) {
        let properties;
        try {
            properties = JSON.parse(actionRow.querySelector('.mark-properties-input').value || '{}');
            if (typeof properties !== 'object' || Array.isArray(properties)) throw new Error();
        } catch (e) {
            showToast('속성이 유효한 JSON 객체 형식이 아닙니다.', 'error'); return;
        }
        const markData = {
            mark: actionRow.querySelector('.mark-mark-input').value,
            description: actionRow.querySelector('.mark-description-input').value,
            properties: properties,
        };
        if (!markData.mark) { showToast('일람부호는 반드시 입력해야 합니다.', 'error'); return; }

        const isNew = markId === 'new';
        const url = isNew ? `/connections/api/member-marks/${currentProjectId}/` : `/connections/api/member-marks/${currentProjectId}/${markId}/`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify(markData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadMemberMarks();
        } catch (error) { showToast(error.message, 'error'); }
    }
    else if (target.classList.contains('cancel-member-mark-btn')) {
        renderMemberMarksTable(loadedMemberMarks);
    }
}

/**
 * 선택된 수량산출부재에 할당된 일람부호 목록을 화면 우측에 표시합니다.
 */
function renderQmMemberMarksList() {
    const container = document.getElementById('qm-member-marks-list');
    if (selectedQmIds.size === 0) {
        container.innerHTML = '일람부호를 보려면 부재를 선택하세요.'; return;
    }
    const selectedMembers = loadedQuantityMembers.filter(m => selectedQmIds.has(m.id));
    if (selectedMembers.length === 0) {
        container.innerHTML = '선택된 부재를 찾을 수 없습니다.'; return;
    }

    const firstMemberMarks = new Set(selectedMembers[0].member_mark_ids);
    const commonMarkIds = [...firstMemberMarks].filter(markId => 
        selectedMembers.every(member => member.member_mark_ids.includes(markId))
    );

    if (commonMarkIds.length === 0) {
        container.innerHTML = '선택된 부재들에 공통으로 할당된 일람부호가 없습니다.';
        if (selectedQmIds.size > 1) {
            container.innerHTML += '<br><small>(개별 부재에는 할당되어 있을 수 있습니다)</small>';
        }
        return;
    }
    container.innerHTML = '<ul>' + commonMarkIds.map(markId => {
        const mark = loadedMemberMarks.find(m => m.id === markId);
        return mark ? `<li>${mark.mark}</li>` : `<li>알 수 없는 부호: ${markId}</li>`;
    }).join('') + '</ul>';
}
/**
 * 선택된 부재들에 일람부호를 할당합니다.
 */
async function assignMemberMarkToQm() {
    const markId = document.getElementById('qm-member-mark-assign-select').value;
    if (!markId) { showToast('적용할 일람부호를 선택하세요.', 'error'); return; }
    if (selectedQmIds.size === 0) { showToast('일람부호를 적용할 부재를 선택하세요.', 'error'); return; }

    try {
        const response = await fetch(`/connections/api/quantity-members/manage-member-marks/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
            body: JSON.stringify({ member_ids: Array.from(selectedQmIds), mark_id: markId, action: 'assign' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        showToast(result.message, 'success');
        
        // 로컬 데이터 즉시 업데이트
        loadedQuantityMembers.forEach(member => {
            if (selectedQmIds.has(member.id)) {
                member.member_mark_id = markId; // [수정] 단일 ID로 설정
            }
        });
        renderQmMemberMarkDetails(); // [수정] 화면 새로고침
        
    } catch (error) { showToast(error.message, 'error'); }
}
/**
 * 선택된 부재들에서 일람부호를 제거합니다.
 */
async function clearMemberMarksFromQm() {
    if (selectedQmIds.size === 0) { showToast('일람부호를 제거할 부재를 선택하세요.', 'error'); return; }
    if (!confirm(`${selectedQmIds.size}개 부재의 일람부호를 제거하시겠습니까?`)) return;

    try {
        const response = await fetch(`/connections/api/quantity-members/manage-member-marks/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
            body: JSON.stringify({ member_ids: Array.from(selectedQmIds), action: 'clear' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 즉시 업데이트
        loadedQuantityMembers.forEach(member => {
            if (selectedQmIds.has(member.id)) {
                member.member_mark_id = null; // [수정] null로 설정
            }
        });
        renderQmMemberMarkDetails(); // [수정] 화면 새로고침

    } catch (error) { showToast(error.message, 'error'); }
}

// =====================================================================
// 산출항목(CostItem) 관리 관련 함수들
// =====================================================================

// connections/static/connections/main.js 파일에서 loadCostItems 함수를 찾아 아래 코드로 교체하세요.
// connections/static/connections/main.js 파일에서
// 기존 loadCostItems 함수를 찾아 아래 코드로 교체하세요.

async function loadCostItems() {
    if (!currentProjectId) {
        renderCostItemsTable([]);
        return;
    }
    try {
        const response = await fetch(`/connections/api/cost-items/${currentProjectId}/`);
        if (!response.ok) throw new Error('산출항목 목록을 불러오는데 실패했습니다.');
        
        loadedCostItems = await response.json();
        renderCostItemsTable(loadedCostItems);
        
        // 이 부분이 그룹핑 목록을 채우는 핵심 코드입니다.
        populateCiFieldSelection(loadedCostItems);

    } catch (error) { // 'ca'를 'catch (error)'로 올바르게 수정했습니다.
        console.error("Error loading cost items:", error);
        showToast(error.message, 'error');
    }
}
// ▼▼▼ [교체] 이 함수 전체를 아래 코드로 교체해주세요. ▼▼▼
async function createManualCostItem() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    try {
        // 새로 만든 모달을 띄우고 사용자의 선택을 기다립니다.
        const selectedCostCodeId = await openCostCodeSelectionModal();
        
        // 사용자가 공사코드를 선택하고 '선택 완료'를 눌렀을 경우에만 아래 코드가 실행됩니다.
        const response = await fetch(`/connections/api/cost-items/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
            body: JSON.stringify({ cost_code_id: selectedCostCodeId }),
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '산출항목 생성에 실패했습니다.');

        showToast(result.message, 'success');
        await loadCostItems(); // 성공 후 목록 새로고침

    } catch (error) {
        // 사용자가 모달을 그냥 닫거나(error=null), 실제 에러가 발생한 경우를 처리합니다.
        if (error) {
            console.error("Error creating manual cost item:", error);
            showToast(error.message, 'error');
        } else {
            showToast('산출항목 생성이 취소되었습니다.', 'info');
        }
    }
}
// ▲▲▲ [교체] 여기까지 입니다. ▲▲▲

async function createAutoCostItems() {
    if (!currentProjectId) { showToast('먼저 프로젝트를 선택하세요.', 'error'); return; }
    if (!confirm('정말로 모든 산출항목을 자동으로 다시 생성하시겠습니까?\n이 작업은 기존 자동생성된 항목을 삭제하고, 현재의 공사코드 룰셋 기준으로 새로 생성합니다.')) return;

    showToast('산출항목을 자동으로 생성하고 있습니다...', 'info', 5000);
    try {
        const response = await fetch(`/connections/api/cost-items/auto-create/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadCostItems();
    } catch (error) {
        showToast(error.message, 'error');
    }
}
/**
 * '산출항목' 테이블의 행 선택 로직을 처리합니다. (Ctrl, Shift 키 조합)
 * @param {Event} event - 클릭 이벤트 객체
 * @param {HTMLElement} clickedRow - 클릭된 <tr> 요소
 */
function handleCiRowSelection(event, clickedRow) {
    const tableContainer = document.getElementById('ci-table-container');
    const allVisibleRows = Array.from(tableContainer.querySelectorAll('tr[data-id]'));
    const clickedRowIndex = allVisibleRows.findIndex(r => r.dataset.id === clickedRow.dataset.id);
    const itemId = clickedRow.dataset.id;
    if (!itemId) return;

    if (event.shiftKey && lastSelectedCiRowIndex > -1) {
        const start = Math.min(lastSelectedCiRowIndex, clickedRowIndex);
        const end = Math.max(lastSelectedCiRowIndex, clickedRowIndex);
        if (!event.ctrlKey) selectedCiIds.clear();
        for (let i = start; i <= end; i++) {
            const rowId = allVisibleRows[i].dataset.id;
            if (rowId) selectedCiIds.add(rowId);
        }
    } else if (event.ctrlKey) {
        if (selectedCiIds.has(itemId)) selectedCiIds.delete(itemId);
        else selectedCiIds.add(itemId);
    } else {
        selectedCiIds.clear();
        selectedCiIds.add(itemId);
    }
    lastSelectedCiRowIndex = clickedRowIndex;
}

async function handleCostItemActions(event) {
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow || target.matches('input, select, textarea')) return;

    const itemId = actionRow.dataset.id;
    const isEditRow = document.querySelector('#ci-table-container .ci-edit-row');

    // [수정] 버튼이 아닌 행의 데이터 영역을 클릭했을 때 선택 로직을 실행합니다.
    if (!target.closest('button') && itemId) {
        handleCiRowSelection(event, actionRow);
        renderCostItemsTable(loadedCostItems, isEditRow?.dataset.id); // 테이블을 다시 그려 선택된 행을 강조합니다.
        renderCiLinkedMemberPropertiesTable(); // [핵심] 연관 부재 속성 테이블을 업데이트합니다.
        return;
    }
    
    if (!itemId) return;

    if (target.classList.contains('edit-ci-btn')) {
        if (isEditRow) { showToast('이미 편집 중인 항목이 있습니다.', 'error'); return; }
        renderCostItemsTable(loadedCostItems, itemId);
    } else if (target.classList.contains('cancel-ci-btn')) {
        renderCostItemsTable(loadedCostItems);
        renderCiLinkedMemberPropertiesTable(); // [추가] 취소 시 속성 테이블도 초기화합니다.
    } else if (target.classList.contains('save-ci-btn')) {
        let mapping_expression;
        try {
            const rawMappingExpr = actionRow.querySelector('.ci-mapping-expression-input').value;
            mapping_expression = rawMappingExpr.trim() === '' ? {} : JSON.parse(rawMappingExpr);
        } catch (e) {
            showToast('수량 맵핑식(JSON) 형식이 올바르지 않습니다.', 'error'); return;
        }

        const itemData = {
            quantity: parseFloat(actionRow.querySelector('.ci-quantity-input').value),
            description: actionRow.querySelector('.ci-description-input').value,
            quantity_mapping_expression: mapping_expression,
        };
        
        try {
            const response = await fetch(`/connections/api/cost-items/${currentProjectId}/${itemId}/`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify(itemData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            
            showToast(result.message, 'success');
            // 로컬 데이터 즉시 업데이트
            const itemIndex = loadedCostItems.findIndex(i => i.id === itemId);
            if (itemIndex > -1) {
                const updatedItem = result.updated_item;
                loadedCostItems[itemIndex].quantity = updatedItem.quantity;
                loadedCostItems[itemIndex].description = itemData.description;
                loadedCostItems[itemIndex].quantity_mapping_expression = itemData.quantity_mapping_expression;
            }
            renderCostItemsTable(loadedCostItems);
            renderCiLinkedMemberPropertiesTable(); // [추가] 저장 후 속성 테이블도 업데이트합니다.
        } catch (error) {
            showToast(error.message, 'error');
        }
    } else if (target.classList.contains('delete-ci-btn')) {
        if (!confirm('이 산출항목을 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(`/connections/api/cost-items/${currentProjectId}/${itemId}/`, {
                method: 'DELETE', headers: { 'X-CSRFToken': csrftoken },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            
            showToast(result.message, 'success');
            loadedCostItems = loadedCostItems.filter(i => i.id !== itemId);
            selectedCiIds.delete(itemId); // [추가] 선택 목록からも 삭제합니다.
            renderCostItemsTable(loadedCostItems);
            renderCiLinkedMemberPropertiesTable(); // [추가] 삭제 후 속성 테이블도 업데이트합니다.
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
}
function addCiGroupingLevel() {
    const container = document.getElementById('ci-grouping-controls');
    const newIndex = container.children.length + 1;
    const newLevelDiv = document.createElement('div');
    newLevelDiv.className = 'group-level';
    newLevelDiv.innerHTML = `<label>${newIndex}차:</label><select class="ci-group-by-select"></select><button class="remove-group-level-btn">-</button>`;
    container.appendChild(newLevelDiv);
    populateCiFieldSelection(loadedCostItems);
    newLevelDiv.querySelector('.remove-group-level-btn').addEventListener('click', function() {
        this.parentElement.remove();
        renderCostItemsTable(loadedCostItems);
    });
}

function handleCiColumnFilter(event) {
    if (event.target.classList.contains('column-filter') && event.key === 'Enter') {
        ciColumnFilters[event.target.dataset.field] = event.target.value.toLowerCase();
        renderCostItemsTable(loadedCostItems);
    }
}

// =====================================================================
// 공사코드 룰셋(CostCodeRule) 관리 관련 함수들
// =====================================================================

async function loadCostCodeRules() {
    if (!currentProjectId) { renderCostCodeRulesetTable([]); return; }
    try {
        const response = await fetch(`/connections/api/rules/cost-code/${currentProjectId}/`);
        if (!response.ok) throw new Error('공사코드 룰셋을 불러오는데 실패했습니다.');
        loadedCostCodeRules = await response.json();
        renderCostCodeRulesetTable(loadedCostCodeRules);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleCostCodeRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        if (document.querySelector('#costcode-ruleset-table-container .rule-edit-row')) { showToast('이미 편집 중인 규칙이 있습니다.', 'error'); return; }
        renderCostCodeRulesetTable(loadedCostCodeRules, ruleId);
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderCostCodeRulesetTable(loadedCostCodeRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('이 규칙을 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(`/connections/api/rules/cost-code/${currentProjectId}/${ruleId}/`, {
                method: 'DELETE', headers: { 'X-CSRFToken': csrftoken }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadCostCodeRules();
        } catch (error) { showToast(error.message, 'error'); }
    } else if (target.classList.contains('save-rule-btn')) {
        let conditions, quantity_mapping_script;
        try { conditions = JSON.parse(ruleRow.querySelector('.rule-conditions-input').value || '[]'); } 
        catch (e) { showToast('적용 조건이 유효한 JSON 형식이 아닙니다.', 'error'); return; }
        try { quantity_mapping_script = JSON.parse(ruleRow.querySelector('.rule-quantity-mapping-input').value || '{}'); } 
        catch (e) { showToast('수량 계산식이 유효한 JSON 형식이 아닙니다.', 'error'); return; }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            priority: parseInt(ruleRow.querySelector('.rule-priority-input').value) || 0,
            name: ruleRow.querySelector('.rule-name-input').value,
            target_cost_code_id: ruleRow.querySelector('.rule-cost-code-select').value,
            conditions: conditions,
            quantity_mapping_script: quantity_mapping_script,
        };

        if (!ruleData.target_cost_code_id) { showToast('대상 공사코드를 선택하세요.', 'error'); return; }
        if (!ruleData.name) { showToast('규칙 이름을 입력하세요.', 'error'); return; }

        try {
            const response = await fetch(`/connections/api/rules/cost-code/${currentProjectId}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
                body: JSON.stringify(ruleData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadCostCodeRules();
        } catch (error) { showToast(error.message, 'error'); }
    }
}



// ▼▼▼ [추가] 이 함수 블록을 추가해주세요. ▼▼▼
/**
 * '수량산출부재' 탭 내부의 뷰 탭('수량산출부재 뷰', '공사코드별 뷰') 클릭을 처리합니다.
 */
function handleQmViewTabClick(event) {
    const clickedButton = event.target.closest('.view-tab-button');
    if (!clickedButton || clickedButton.classList.contains('active')) {
        return;
    }
    
    // 모든 탭 버튼에서 active 클래스 제거
    document.querySelectorAll('#quantity-members .view-tab-button.active').forEach(btn => {
        btn.classList.remove('active');
    });

    // 클릭된 버튼에 active 클래스 추가
    clickedButton.classList.add('active');
    
    // 전역 상태 업데이트 및 테이블 다시 그리기
    activeQmView = clickedButton.dataset.view;
    qmCollapsedGroups = {}; // 뷰가 바뀌면 그룹 접힘 상태 초기화
    qmColumnFilters = {};   // 뷰가 바뀌면 컬럼 필터 초기화
    renderActiveQmView();
}
// ▲▲▲ 여기까지 입니다. ▲▲▲



// ▼▼▼ [추가] 공사코드 선택 모달을 제어하는 함수 블록 ▼▼▼
function openCostCodeSelectionModal() {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('cost-code-selection-modal');
        const searchInput = document.getElementById('cost-code-search-input');
        const listContainer = document.getElementById('cost-code-list-container');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const closeBtn = modal.querySelector('.modal-close-btn');

        let selectedCostCodeId = null;

        // 목록 렌더링 함수
        function renderList(filterText = '') {
            listContainer.innerHTML = '';
            const filteredCodes = loadedCostCodes.filter(code => 
                code.code.toLowerCase().includes(filterText) || 
                code.name.toLowerCase().includes(filterText)
            );

            if (filteredCodes.length === 0) {
                listContainer.innerHTML = '<div class="modal-list-item">검색 결과가 없습니다.</div>';
                return;
            }

            filteredCodes.forEach(code => {
                const item = document.createElement('div');
                item.className = 'modal-list-item';
                item.dataset.id = code.id;
                item.innerHTML = `<span class="item-code">${code.code}</span> <span class="item-name">${code.name}</span>`;
                
                item.addEventListener('click', () => {
                    // 기존 선택 해제
                    const currentSelected = listContainer.querySelector('.selected');
                    if (currentSelected) currentSelected.classList.remove('selected');
                    
                    // 새 항목 선택
                    item.classList.add('selected');
                    selectedCostCodeId = code.id;
                    confirmBtn.disabled = false;
                });

                listContainer.appendChild(item);
            });
        }

        // 검색 이벤트 리스너
        searchInput.addEventListener('input', () => renderList(searchInput.value.toLowerCase()));

        // 모달 닫기 함수
        function closeModal() {
            modal.style.display = 'none';
            // 메모리 누수 방지를 위해 이벤트 리스너 정리
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            closeBtn.onclick = null;
            searchInput.oninput = null;
        }

        // 확인 버튼 클릭
        confirmBtn.onclick = () => {
            if (selectedCostCodeId) {
                resolve(selectedCostCodeId);
                closeModal();
            }
        };

        // 취소 또는 닫기 버튼 클릭
        cancelBtn.onclick = () => {
            reject(null); // 사용자가 취소했음을 알림
            closeModal();
        };
        closeBtn.onclick = () => {
            reject(null);
            closeModal();
        };

        // 초기화 및 모달 열기
        searchInput.value = '';
        selectedCostCodeId = null;
        confirmBtn.disabled = true;
        renderList();
        modal.style.display = 'flex';
    });
}


// =====================================================================
// 할당 룰셋 (MemberMark, CostCode) 관리 및 적용 함수들
// =====================================================================

async function loadMemberMarkAssignmentRules() {
    if (!currentProjectId) { renderMemberMarkAssignmentRulesetTable([]); return; }
    try {
        const response = await fetch(`/connections/api/rules/member-mark-assignment/${currentProjectId}/`);
        if (!response.ok) throw new Error('일람부호 할당 룰셋 로딩 실패');
        loadedMemberMarkAssignmentRules = await response.json();
        renderMemberMarkAssignmentRulesetTable(loadedMemberMarkAssignmentRules);
    } catch (error) { showToast(error.message, 'error'); }
}

async function handleMemberMarkAssignmentRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        renderMemberMarkAssignmentRulesetTable(loadedMemberMarkAssignmentRules, ruleId);
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderMemberMarkAssignmentRulesetTable(loadedMemberMarkAssignmentRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('정말 이 규칙을 삭제하시겠습니까?')) return;
        const response = await fetch(`/connections/api/rules/member-mark-assignment/${currentProjectId}/${ruleId}/`, {
            method: 'DELETE', headers: { 'X-CSRFToken': csrftoken }
        });
        if (response.ok) { showToast('규칙이 삭제되었습니다.', 'success'); loadMemberMarkAssignmentRules(); }
        else { showToast('삭제 실패', 'error'); }
    } else if (target.classList.contains('save-rule-btn')) {
        let conditions;
        try { conditions = JSON.parse(ruleRow.querySelector('.rule-conditions-input').value || '[]'); }
        catch (e) { showToast('적용 조건이 유효한 JSON 형식이 아닙니다.', 'error'); return; }
        
        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            name: ruleRow.querySelector('.rule-name-input').value,
            priority: parseInt(ruleRow.querySelector('.rule-priority-input').value) || 0,
            conditions: conditions,
            mark_expression: ruleRow.querySelector('.rule-expression-input').value,
        };
        
        const response = await fetch(`/connections/api/rules/member-mark-assignment/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
            body: JSON.stringify(ruleData)
        });
        const result = await response.json();
        if (response.ok) { showToast(result.message, 'success'); loadMemberMarkAssignmentRules(); }
        else { showToast(result.message, 'error'); }
    }
}

async function loadCostCodeAssignmentRules() {
    if (!currentProjectId) { renderCostCodeAssignmentRulesetTable([]); return; }
    try {
        const response = await fetch(`/connections/api/rules/cost-code-assignment/${currentProjectId}/`);
        if (!response.ok) throw new Error('공사코드 할당 룰셋 로딩 실패');
        loadedCostCodeAssignmentRules = await response.json();
        renderCostCodeAssignmentRulesetTable(loadedCostCodeAssignmentRules);
    } catch (error) { showToast(error.message, 'error'); }
}

async function handleCostCodeAssignmentRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        renderCostCodeAssignmentRulesetTable(loadedCostCodeAssignmentRules, ruleId);
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderCostCodeAssignmentRulesetTable(loadedCostCodeAssignmentRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('정말 이 규칙을 삭제하시겠습니까?')) return;
        const response = await fetch(`/connections/api/rules/cost-code-assignment/${currentProjectId}/${ruleId}/`, {
            method: 'DELETE', headers: { 'X-CSRFToken': csrftoken }
        });
        if (response.ok) { showToast('규칙이 삭제되었습니다.', 'success'); loadCostCodeAssignmentRules(); }
        else { showToast('삭제 실패', 'error'); }
    } else if (target.classList.contains('save-rule-btn')) {
        let conditions, expressions;
        try { conditions = JSON.parse(ruleRow.querySelector('.rule-conditions-input').value || '[]'); }
        catch (e) { showToast('적용 조건이 유효한 JSON 형식이 아닙니다.', 'error'); return; }
        try { expressions = JSON.parse(ruleRow.querySelector('.rule-expression-input').value || '{}'); }
        catch (e) { showToast('CostCode 표현식이 유효한 JSON 형식이 아닙니다.', 'error'); return; }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            name: ruleRow.querySelector('.rule-name-input').value,
            priority: parseInt(ruleRow.querySelector('.rule-priority-input').value) || 0,
            conditions: conditions,
            cost_code_expressions: expressions,
        };
        
        const response = await fetch(`/connections/api/rules/cost-code-assignment/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
            body: JSON.stringify(ruleData)
        });
        const result = await response.json();
        if (response.ok) { showToast(result.message, 'success'); loadCostCodeAssignmentRules(); }
        else { showToast(result.message, 'error'); }
    }
}
// 기존의 applyAssignmentRules 함수를 찾아서 아래 코드로 전체를 교체해주세요.

async function applyAssignmentRules() {
    if (!currentProjectId) { showToast('프로젝트를 선택하세요.', 'error'); return; }
    if (!confirm('정의된 모든 할당 룰셋(일람부호, 공사코드)을 전체 부재에 적용하시겠습니까?\n이 작업은 기존 할당 정보를 덮어쓰거나 추가할 수 있습니다.')) return;

    showToast('룰셋을 적용하고 있습니다. 잠시만 기다려주세요...', 'info', 5000);
    try {
        const response = await fetch(`/connections/api/quantity-members/apply-assignment-rules/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        showToast(result.message, 'success');
        
        // [핵심 수정]
        // 1. 룰셋 적용으로 인해 새로 생성될 수 있는 공사코드와 일람부호 목록을 다시 불러옵니다.
        //    이렇게 해야 프론트엔드가 최신 목록을 가지게 됩니다.
        await loadCostCodes();
        await loadMemberMarks();
        
        // 2. 변경된 수량산출부재 목록을 다시 불러옵니다. 
        //    (이 함수는 내부적으로 왼쪽의 메인 테이블을 다시 그립니다)
        await loadQuantityMembers();
        
        // 3. 마지막으로, 업데이트된 모든 데이터를 기반으로 오른쪽 상세 정보 패널들을 명시적으로 다시 렌더링합니다.
        //    이렇게 해야 선택된 부재의 최신 할당 정보를 즉시 확인할 수 있습니다.
        renderQmCostCodesList();
        renderQmMemberMarkDetails();

    } catch (error) {
        showToast(`룰셋 적용 실패: ${error.message}`, 'error');
    }
}
/**
 * '수량산출부재' 탭의 오른쪽 상세 정보 패널의 탭 클릭을 처리합니다.
 */
function handleQmDetailTabClick(event) {
    const clickedButton = event.target.closest('.detail-tab-button');
    if (!clickedButton || clickedButton.classList.contains('active')) {
        return; // 버튼이 아니거나 이미 활성화된 버튼이면 무시
    }

    const targetTab = clickedButton.dataset.tab;
    const detailsPanel = clickedButton.closest('.details-panel');

    // 모든 탭 버튼과 컨텐츠에서 'active' 클래스 제거
    detailsPanel.querySelectorAll('.detail-tab-button.active').forEach(btn => btn.classList.remove('active'));
    detailsPanel.querySelectorAll('.detail-tab-content.active').forEach(content => content.classList.remove('active'));

    // 클릭된 버튼과 그에 맞는 컨텐츠에 'active' 클래스 추가
    clickedButton.classList.add('active');
    const targetContent = detailsPanel.querySelector(`.detail-tab-content[data-tab="${targetTab}"]`);
    if (targetContent) {
        targetContent.classList.add('active');
    }
}


// ▼▼▼ [추가] 파일의 맨 아래에 아래 이벤트 리스너와 함수들을 추가해주세요. ▼▼▼

// --- '집계' 탭 이벤트 리스너 ---


// --- '집계' 탭 관련 함수들 ---
let availableBoqFields = []; // BOQ 그룹핑 필드 목록을 저장할 전역 변수

let currentBoqColumns = []; // 현재 테이블에 표시된 열의 순서와 정보 저장
let boqColumnAliases = {};  // 사용자가 수정한 열 이름(별칭) 저장
let lastBoqItemIds = []; // BOQ 상세 목록으로 돌아가기 위해 마지막으로 선택한 Item ID 목록을 저장
let currentBoqDetailItemId = null;

async function loadBoqGroupingFields() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    // 이미 필드를 불러왔으면 다시 불러오지 않도록 하여 성능을 개선합니다.
    if (availableBoqFields.length > 0) return;

    try {
        const response = await fetch(`/connections/api/boq/grouping-fields/${currentProjectId}/`);
        if (!response.ok) throw new Error('그룹핑 필드 목록을 불러오는데 실패했습니다.');
        
        availableBoqFields = await response.json();
        
        // [핵심 수정]
        // 1. 가져온 필드 목록으로 '표시할 필드' 체크박스 UI를 먼저 렌더링합니다.
        renderBoqDisplayFieldControls(availableBoqFields); 
        // 2. 기본 그룹핑 레벨을 하나 추가합니다. (내부적으로 availableBoqFields를 사용)
        addBoqGroupingLevel(); 

    } catch (error) {
        console.error("Error loading BOQ grouping fields:", error);
        showToast(error.message, 'error');
    }
}

/**
 * '집계' 탭에 그룹핑 레벨 Select Box를 추가합니다.
 */
function addBoqGroupingLevel() {
    const container = document.getElementById('boq-grouping-controls');
    const newIndex = container.children.length;

    if (availableBoqFields.length === 0) {
        showToast('그룹핑 필드 정보를 먼저 불러와야 합니다.', 'info');
        return;
    }

    const newLevelDiv = document.createElement('div');
    newLevelDiv.className = 'boq-group-level';
    
    let optionsHtml = availableBoqFields.map(field => `<option value="${field.value}">${field.label}</option>`).join('');

    newLevelDiv.innerHTML = `
        <label>${newIndex + 1}차:</label>
        <select class="boq-group-by-select">${optionsHtml}</select>
        <button class="remove-boq-group-level-btn" style="padding: 2px 6px; font-size: 12px;">-</button>
    `;
    container.appendChild(newLevelDiv);

    newLevelDiv.querySelector('.remove-boq-group-level-btn').addEventListener('click', function() {
        this.parentElement.remove();
        // 삭제 후 순서를 다시 매겨줍니다.
        container.querySelectorAll('.boq-group-level label').forEach((label, index) => {
            label.textContent = `${index + 1}차:`;
        });
    });
}

async function generateBoqReport() {
    /* ▼▼▼ [수정] 열 순서와 별칭을 초기화하는 아래 두 줄을 삭제합니다. ▼▼▼ */
    // currentBoqColumns = [];  <-- 이 줄 삭제
    // boqColumnAliases = {}; <-- 이 줄 삭제
    /* ▲▲▲ 여기까지 수정 ▲▲▲ */

    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    const groupBySelects = document.querySelectorAll('.boq-group-by-select');
    if (groupBySelects.length === 0) {
        showToast('하나 이상의 그룹핑 기준을 추가하세요.', 'error');
        return;
    }
    
    const params = new URLSearchParams();
    groupBySelects.forEach(select => params.append('group_by', select.value));
    
    const displayByCheckboxes = document.querySelectorAll('.boq-display-field-cb:checked');
    displayByCheckboxes.forEach(cb => params.append('display_by', cb.value));

    if (boqFilteredRawElementIds.size > 0) {
        boqFilteredRawElementIds.forEach(id => params.append('raw_element_ids', id));
    }

    const tableContainer = document.getElementById('boq-table-container');
    tableContainer.innerHTML = '<p style="padding: 20px;">집계 데이터를 생성 중입니다...</p>';
    showToast('집계표 생성 중...', 'info');

    try {
        const response = await fetch(`/connections/api/boq/report/${currentProjectId}/?${params.toString()}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`서버 오류 (${response.status})`);
        }
        
        const data = await response.json();
        
        renderBoqTable(data.report, data.summary); 
        setupBoqTableInteractions();

    } catch (error) {
        console.error("최종 오류 발생:", error);
        tableContainer.innerHTML = `<p style="padding: 20px; color: red;">오류: ${error.message}</p>`;
        showToast(error.message, 'error');
    }
}

/**
 * 집계 테이블과 상세 정보 패널의 모든 상호작용을 위한 이벤트 리스너를 설정합니다.
 * (수정됨: 탭 클릭 리스너는 initializeBoqUI 함수로 이동)
 */
function setupBoqTableInteractions() {
    const tableContainer = document.getElementById('boq-table-container');
    const table = tableContainer.querySelector('.boq-table');
    if (!table) return;

    // --- 1. 메인 BOQ 테이블 상호작용 (열 이름 변경, 드래그앤드롭 등) ---
    const headers = table.querySelectorAll('thead th');
    let draggedColumnId = null;
    table.querySelector('thead').addEventListener('click', (e) => {
        if (e.target.classList.contains('col-edit-btn')) {
            const th = e.target.closest('th');
            const columnId = th.dataset.columnId;
            const column = currentBoqColumns.find(c => c.id === columnId);
            if (column) {
                const currentName = boqColumnAliases[columnId] || column.label;
                const newName = prompt(`'${column.label}' 열의 새 이름을 입력하세요:`, currentName);
                if (newName && newName.trim() !== "") {
                    boqColumnAliases[columnId] = newName.trim();
                    const tableData = JSON.parse(table.dataset.tableData);
                    renderBoqTable(tableData.report, tableData.summary);
                    setupBoqTableInteractions();
                }
            }
        }
    });
    headers.forEach(th => {
        th.addEventListener('dragstart', (e) => {
            draggedColumnId = th.dataset.columnId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedColumnId);
            setTimeout(() => th.classList.add('dragging'), 0);
        });
        th.addEventListener('dragend', () => th.classList.remove('dragging'));
        th.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetTh = e.currentTarget;
            const rect = targetTh.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            headers.forEach(h => h.classList.remove('drag-over-left', 'drag-over-right'));
            if (e.clientX < midpoint) targetTh.classList.add('drag-over-left');
            else targetTh.classList.add('drag-over-right');
        });
        th.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('drag-over-left', 'drag-over-right'));
        th.addEventListener('drop', (e) => {
            e.preventDefault();
            headers.forEach(h => h.classList.remove('drag-over-left', 'drag-over-right'));
            const targetColumnId = e.currentTarget.dataset.columnId;
            if (draggedColumnId === targetColumnId) return;
            const draggedIndex = currentBoqColumns.findIndex(c => c.id === draggedColumnId);
            const [draggedItem] = currentBoqColumns.splice(draggedIndex, 1);
            const targetIndex = currentBoqColumns.findIndex(c => c.id === targetColumnId);
            const rect = e.currentTarget.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            if (e.clientX < midpoint) {
                 currentBoqColumns.splice(targetIndex, 0, draggedItem);
            } else {
                 currentBoqColumns.splice(targetIndex + 1, 0, draggedItem);
            }
            const tableData = JSON.parse(table.dataset.tableData);
            renderBoqTable(tableData.report, tableData.summary);
            setupBoqTableInteractions();
        });
    });

    // --- 2. 메인 BOQ 테이블 '행' 클릭 시 -> 중앙 하단 목록 업데이트 ---
    table.querySelector('tbody').addEventListener('click', (e) => {
        const row = e.target.closest('tr.boq-group-header');
        if (row) {
            const currentSelected = table.querySelector('tr.selected-boq-row');
            if (currentSelected) currentSelected.classList.remove('selected-boq-row');
            row.classList.add('selected-boq-row');
            const itemIds = JSON.parse(row.dataset.itemIds || '[]');
            updateBoqDetailsPanel(itemIds);
        }
    });

    // --- 3. 중앙 하단 '포함된 산출항목' 목록 클릭 시 -> 왼쪽 상세 패널 업데이트 ---
    document.getElementById('boq-item-list-container').addEventListener('click', (e) => {
        const itemRow = e.target.closest('tr[data-item-id]');
        if (itemRow) {
            const itemId = itemRow.dataset.itemId;
            if (itemId !== currentBoqDetailItemId) {
                renderBoqItemProperties(itemId);
            }
        }
    });
    
    // 탭 클릭 리스너는 여기서 제거되고 initializeBoqUI 함수로 이동했습니다.
}
/**
 * [수정됨] 중앙 하단 패널에 포함된 산출항목 목록을 3열 테이블로 렌더링하고, 첫 항목의 상세 정보를 표시합니다.
 * @param {Array<String>} itemIds - 표시할 CostItem의 ID 배열
 */
function updateBoqDetailsPanel(itemIds) {
    const listContainer = document.getElementById('boq-item-list-container');
    
    if (!itemIds || itemIds.length === 0) {
        listContainer.innerHTML = '<p style="padding: 10px;">이 그룹에 포함된 산출항목이 없습니다.</p>';
        renderBoqItemProperties(null); 
        return;
    }

    const itemsToRender = loadedCostItems.filter(item => itemIds.includes(item.id));
    if (itemsToRender.length === 0) {
        listContainer.innerHTML = '<p style="padding: 10px;">산출항목 데이터를 찾을 수 없습니다.</p>';
        renderBoqItemProperties(null);
        return;
    }
    
    // 요청대로 3열 테이블 구조로 복원
    let tableHtml = `<table class="boq-item-list-table">
        <thead>
            <tr>
                <th>산출항목</th>
                <th>연관 부재</th>
                <th>BIM 원본 객체</th>
            </tr>
        </thead>
        <tbody>`;

    itemsToRender.forEach(item => {
        let memberName = '(연관 부재 없음)';
        let rawElementName = '(BIM 원본 없음)';

        if (item.quantity_member_id) {
            const member = loadedQuantityMembers.find(m => m.id === item.quantity_member_id);
            if (member) {
                memberName = member.name || '(이름 없는 부재)';
                if (member.raw_element_id) {
                    const rawElement = allRevitData.find(re => re.id === member.raw_element_id);
                    rawElementName = rawElement?.raw_data?.Name || '(이름 없는 원본)';
                }
            }
        }
        const costItemName = item.cost_code_name || '(이름 없는 항목)';

        tableHtml += `<tr data-item-id="${item.id}">
                        <td>${costItemName}</td>
                        <td>${memberName}</td>
                        <td>${rawElementName}</td>
                    </tr>`;
    });

    tableHtml += '</tbody></table>';
    listContainer.innerHTML = tableHtml;

    // 첫 번째 항목을 자동으로 선택하고 오른쪽 상세 정보 렌더링
    const firstItemId = itemsToRender[0].id;
    renderBoqItemProperties(firstItemId);
}

// ▼▼▼ [수정] 이 함수 전체를 아래 코드로 교체해주세요. ▼▼▼
/**
 * [수정됨] ID에 해당하는 CostItem의 상세 속성을 오른쪽 상세정보 패널에 렌더링합니다.
 * @param {String | null} itemId - 상세 정보를 표시할 CostItem의 ID
 */
function renderBoqItemProperties(itemId) {
    currentBoqDetailItemId = itemId;

    // 중앙 하단 목록에서 현재 선택된 행에 'selected' 클래스 적용
    const listContainer = document.getElementById('boq-item-list-container');
    listContainer.querySelectorAll('tr').forEach(row => {
        row.classList.toggle('selected', row.dataset.itemId === itemId);
    });

    const memberContainer = document.getElementById('boq-details-member-container');
    const markContainer = document.getElementById('boq-details-mark-container');
    const rawContainer = document.getElementById('boq-details-raw-container');

    // 오른쪽 패널 초기화
    if (!itemId) {
        memberContainer.innerHTML = '<p>항목을 선택하세요.</p>';
        markContainer.innerHTML = '<p>항목을 선택하세요.</p>';
        rawContainer.innerHTML = '<p>항목을 선택하세요.</p>';
        return;
    }

    const costItem = loadedCostItems.find(item => item.id.toString() === itemId.toString());
    if (!costItem) {
        memberContainer.innerHTML = '<p>항목 정보를 찾을 수 없습니다.</p>';
        markContainer.innerHTML = ''; rawContainer.innerHTML = '';
        return;
    }
    
    const member = costItem.quantity_member_id ? loadedQuantityMembers.find(m => m.id.toString() === costItem.quantity_member_id.toString()) : null;
    
    // 1. 부재 속성 렌더링
    if (member && member.properties && Object.keys(member.properties).length > 0) {
        let tableHtml = '<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>';
        Object.keys(member.properties).sort().forEach(key => {
            tableHtml += `<tr><td>${key}</td><td>${member.properties[key]}</td></tr>`;
        });
        memberContainer.innerHTML = tableHtml + '</tbody></table>';
    } else {
        memberContainer.innerHTML = '<p>연관된 부재 속성이 없습니다.</p>';
    }

    // 2. 일람부호 속성 렌더링 (핵심 수정 부분)
    if (member && member.member_mark_id) {
        const mark = loadedMemberMarks.find(m => m.id.toString() === member.member_mark_id.toString());
        if (mark) {
            let header = `<h5>${mark.mark} (일람부호 속성)</h5>`;
            let tableHtml = '<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>';
            if (mark.properties && Object.keys(mark.properties).length > 0) {
                Object.keys(mark.properties).sort().forEach(key => {
                    tableHtml += `<tr><td>${key}</td><td>${mark.properties[key]}</td></tr>`;
                });
            } else {
                tableHtml += '<tr><td colspan="2">정의된 속성이 없습니다.</td></tr>';
            }
            markContainer.innerHTML = header + tableHtml + '</tbody></table>';
        } else {
            markContainer.innerHTML = '<p>연결된 일람부호 정보를 찾을 수 없습니다.</p>';
        }
    } else {
        markContainer.innerHTML = '<p>연관된 일람부호가 없습니다.</p>';
    }

    // 3. BIM 원본 데이터 렌더링
    const rawElement = member?.raw_element_id ? allRevitData.find(el => el.id.toString() === member.raw_element_id.toString()) : null;
    if (rawElement?.raw_data) {
        let header = `<h5>${rawElement.raw_data.Name || '이름 없음'}</h5>`;
        let tableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;
        const allKeys = new Set();
        Object.keys(rawElement.raw_data).forEach(k => allKeys.add(k));
        Object.keys(rawElement.raw_data.Parameters || {}).forEach(k => allKeys.add(k));
        Object.keys(rawElement.raw_data.TypeParameters || {}).forEach(k => allKeys.add(k));
        Array.from(allKeys).sort().forEach(key => {
            const value = getValueForItem(rawElement, key);
            if (value !== undefined && typeof value !== 'object') {
                tableHtml += `<tr><td>${key}</td><td>${value}</td></tr>`;
            }
        });
        rawContainer.innerHTML = header + tableHtml + '</tbody></table>';
    } else {
        rawContainer.innerHTML = '<p>연관된 BIM 원본 데이터가 없습니다.</p>';
    }
}
// ▲▲▲ 여기까지 교체해주세요. ▲▲▲

// =====================================================================
// '집계' 탭 동적 UI 최종 완성본 (리사이저, 접기/펴기, 탭 클릭)
// =====================================================================
/* ▼▼▼ [교체] 기존 initializeBoqUI 함수를 아래의 최종 코드로 교체해주세요. ▼▼▼ */
function initializeBoqUI() {
    const boqTab = document.getElementById('boq');
    if (!boqTab) return;

    // UI 요소들을 선택합니다.
    const leftToggleBtn = boqTab.querySelector('#boq-left-panel-toggle-btn');
    const bottomToggleBtn = boqTab.querySelector('#boq-bottom-panel-toggle-btn');
    const boqContainer = boqTab.querySelector('.boq-container');
    const bottomPanel = boqTab.querySelector('.boq-details-wrapper');
    const boqDetailsPanel = boqTab.querySelector('#boq-item-details-panel');

    // --- 1. 왼쪽 패널 접기/펴기 기능 ---
    if (leftToggleBtn && boqContainer) {
        leftToggleBtn.addEventListener('click', () => {
            boqContainer.classList.toggle('left-panel-collapsed');
        });
    }

    // --- 2. 하단 패널 접기/펴기 기능 (복원) ---
    if (bottomToggleBtn && bottomPanel) {
        bottomToggleBtn.addEventListener('click', () => {
            const isCollapsing = !bottomPanel.classList.contains('collapsed');
            bottomPanel.classList.toggle('collapsed');
            // 버튼의 아이콘을 상태에 따라 변경합니다 (▼ 또는 ▲)
            bottomToggleBtn.textContent = isCollapsing ? '▲' : '▼';
        });
    }

    // --- 3. 왼쪽 상세 정보 패널 탭 클릭 기능 ---
    if (boqDetailsPanel) {
        boqDetailsPanel.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.detail-tab-button');
            if (!clickedButton || !clickedButton.closest('.details-panel-tabs')) return;
            if (clickedButton.classList.contains('active')) return;

            const targetTab = clickedButton.dataset.tab;
            
            boqDetailsPanel.querySelectorAll('.detail-tab-button.active').forEach(btn => btn.classList.remove('active'));
            boqDetailsPanel.querySelectorAll('.detail-tab-content.active').forEach(content => content.classList.remove('active'));

            clickedButton.classList.add('active');
            const targetContent = boqDetailsPanel.querySelector(`.detail-tab-content[data-tab="${targetTab}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    }
}

// main.js 파일 맨 아래에 추가

/**
 * '집계' 탭에서 'Revit에서 선택 확인' 버튼 클릭을 처리합니다.
 * 선택된 집계표 행에 연결된 모든 BIM 객체를 Revit에서 하이라이트합니다.
 */
function handleBoqSelectInRevit() {
    const selectedRow = document.querySelector('.boq-table tr.selected-boq-row');
    if (!selectedRow) {
        showToast('먼저 집계표에서 확인할 행을 선택하세요.', 'error');
        return;
    }

    const itemIds = JSON.parse(selectedRow.dataset.itemIds || '[]');
    if (itemIds.length === 0) {
        showToast('선택된 행에 연관된 산출항목이 없습니다.', 'info');
        return;
    }

    const rawElementIds = new Set();
    itemIds.forEach(itemId => {
        const costItem = loadedCostItems.find(ci => ci.id === itemId);
        if (costItem && costItem.quantity_member_id) {
            const member = loadedQuantityMembers.find(qm => qm.id === costItem.quantity_member_id);
            if (member && member.raw_element_id) {
                rawElementIds.add(member.raw_element_id);
            }
        }
    });

    if (rawElementIds.size === 0) {
        showToast('선택된 항목들은 Revit 객체와 직접 연관되어 있지 않습니다.', 'info');
        return;
    }

    const uniqueIdsToSend = [];
    rawElementIds.forEach(rawId => {
        const rawElement = allRevitData.find(re => re.id === rawId);
        if (rawElement) {
            uniqueIdsToSend.push(rawElement.element_unique_id);
        }
    });

/* 수정 코드 (handleBoqSelectInRevit 함수 내부) */
    if (uniqueIdsToSend.length > 0) {
        // [수정] payload의 command와 내용을 올바르게 변경합니다.
        frontendSocket.send(JSON.stringify({
            'type': 'command_to_revit',
            'payload': { 
                'command': 'select_elements', 
                'unique_ids': uniqueIdsToSend 
            }
        }));
        // [삭제] 불필요한 status 메시지 업데이트 라인을 제거합니다.

        showToast(`${uniqueIdsToSend.length}개 객체의 선택 명령을 Revit으로 보냈습니다.`, 'success');
    } else {
        showToast('Revit으로 보낼 유효한 객체를 찾지 못했습니다.', 'error');
    }
}

/**
 * '집계' 탭에서 '선택 객체 가져오기' 버튼 클릭을 처리합니다.
 * Revit에서 현재 선택된 객체 정보를 가져오도록 요청합니다.
 */
function handleBoqGetFromRevit() {
    frontendSocket.send(JSON.stringify({
        'type': 'command_to_revit',
        'payload': {'command': 'get_selection'}
    }));
    showToast('Revit에 선택 정보 가져오기를 요청했습니다.', 'info');
}

/**
 * '집계' 탭에서 '선택 필터 해제' 버튼 클릭을 처리합니다.
 */
function handleBoqClearFilter() {
    boqFilteredRawElementIds.clear();
    document.getElementById('boq-clear-selection-filter-btn').style.display = 'none';
    generateBoqReport(); // 필터 없이 전체 집계표를 다시 생성
    showToast('Revit 선택 필터를 해제하고 전체 집계표를 표시합니다.', 'info');
}

/* ▼▼▼ [추가] 이 함수 블록을 파일 맨 아래에 추가해주세요. ▼▼▼ */

/**
 * '집계' 탭의 열 순서와 이름을 초기화하고 집계표를 다시 생성합니다.
 */
function resetBoqColumnsAndRegenerate() {
    if (!confirm('테이블의 열 순서와 이름을 기본값으로 초기화하시겠습니까?')) {
        return;
    }
    
    // 전역 변수를 초기화합니다.
    currentBoqColumns = [];
    boqColumnAliases = {};
    
    showToast('열 상태를 초기화하고 집계표를 다시 생성합니다.', 'info');
    
    // 집계표를 다시 생성하여 변경사항을 적용합니다.
    generateBoqReport();
}