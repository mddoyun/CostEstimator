// ▼▼▼ [교체] 파일 최상단의 전역 변수 선언 영역 전체를 아래 코드로 교체 ▼▼▼
// main.js
let allRevitData = [];
let currentProjectId = null;
let currentMode = 'revit';

// CSRF 토큰 헬퍼
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2)
        return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}
let csrftoken =
    document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
    getCookie('csrftoken');

// --- 탭 및 상태 관리 ---
let activeTab = 'ruleset-management'; // 초기 활성 탭 변경 (관리->룰셋)
const viewerStates = {
    'data-management': {
        selectedElementIds: new Set(),
        columnFilters: {},
        isFilterToSelectionActive: false,
        revitFilteredIds: new Set(),
        activeView: 'raw-data-view',
        collapsedGroups: {},
        currentGroupByFields: [],
        lastSelectedRowIndex: -1,
    },
    'space-management': {
        selectedElementIds: new Set(),
        columnFilters: {},
        isFilterToSelectionActive: false,
        revitFilteredIds: new Set(),
        activeView: 'raw-data-view',
        collapsedGroups: {},
        currentGroupByFields: [],
        lastSelectedRowIndex: -1,
    },
};

// --- 데이터 로딩 상태 ---
let allTags = [];
let loadedCostCodes = [];
let loadedMemberMarks = [];
let loadedSpaceClassifications = [];
let loadedQuantityMembers = [];
let loadedCostItems = [];
let loadedUnitPriceTypes = [];
let loadedUnitPrices = [];
// 룰셋 데이터
let loadedClassificationRules = [];
let loadedPropertyMappingRules = [];
let loadedCostCodeRules = [];
let loadedMemberMarkAssignmentRules = [];
let loadedCostCodeAssignmentRules = [];
let loadedSpaceClassificationRules = [];
let loadedSpaceAssignmentRules = [];

// --- UI 상태 (Quantity Members) ---
let qmColumnFilters = {};
let selectedQmIds = new Set();
let qmCollapsedGroups = {};
let currentQmGroupByFields = [];
let lastSelectedQmRowIndex = -1;
let activeQmView = 'quantity-member-view';

// --- UI 상태 (Cost Items) ---
let ciColumnFilters = {};
let selectedCiIds = new Set();
let ciCollapsedGroups = {};
let currentCiGroupByFields = [];
let lastSelectedCiRowIndex = -1;

// --- UI 상태 (Unit Price Management) ---
let selectedCostCodeIdForUnitPrice = null;
let currentUnitPriceEditState = { id: null, originalData: null };

// --- UI 상태 (BOQ - DD) ---
let boqFilteredRawElementIds = new Set();
let availableBoqFields = [];
let currentBoqColumns = [];
let boqColumnAliases = {};
let lastBoqItemIds = []; // BOQ 상세에서 이전 그룹으로 돌아가기 위한 ID 저장 (미사용 시 제거 가능)
let currentBoqDetailItemId = null; // BOQ 상세에서 현재 선택된 Item ID
let loadedUnitPriceTypesForBoq = [];
let lastSelectedUnitPriceTypeId = null;

// --- 기타 상태 ---
let currentCsvImportUrl = null; // CSV 가져오기 시 사용할 URL 임시 저장
let spaceMappingState = { active: false, spaceId: null, spaceName: '' }; // 공간 매핑 모드 상태

// --- [신규] AI 모델 및 학습 관련 전역 변수 ---
let loadedAiModels = []; // 로드된 AI 모델 목록
let currentTrainingTaskId = null; // 현재 진행 중인 학습 작업 ID
let currentTrainingStatus = {}; // 현재 학습 상태 정보 (WebSocket 업데이트용)
let trainingChartInstance = null; // Chart.js 인스턴스 (학습 그래프)
let uploadedCsvFilename = null; // 학습용으로 업로드된 CSV 파일명 (서버 임시 저장 이름)
let csvHeaders = []; // 업로드된 CSV 헤더 목록
let trainedModelTempFilename = null; // 학습 완료 후 임시 저장된 h5 파일명 (DB 저장/다운로드용)
let trainedModelMetadata = null; // 학습 완료 후 생성된 메타데이터

// --- [신규] 개산견적(SD) 관련 전역 변수 ---
let sdEnabledCostCodes = []; // SD용 공사코드 목록 (수량 포함)
let selectedSdModelId = null; // SD 탭에서 선택된 AI 모델 ID
let sdPredictionChartInstance = null; // Chart.js 인스턴스 (SD 결과 그래프)
let loadedSdCostItems = []; // SD 탭 하단 테이블용 데이터
let sdColumnFilters = {}; // SD 테이블 필터
let selectedSdItemIds = new Set(); // SD 테이블 선택 ID
let sdCollapsedGroups = {}; // SD 테이블 그룹 상태
let currentSdGroupByFields = []; // SD 테이블 그룹 필드
// ▲▲▲ [교체] 여기까지 ▲▲▲

// ▼▼▼ [교체] 기존 DOMContentLoaded 이벤트 리스너 함수 전체를 아래 코드로 교체 ▼▼▼
document.addEventListener('DOMContentLoaded', () => {
    console.log(
        '[DEBUG] DOMContentLoaded start - Setting up event listeners...'
    ); // 디버깅

    // BOQ 컬럼 설정 로드 (초기 로드 시)
    loadBoqColumnSettings();

    // CSRF 토큰 설정
    const tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
    if (tokenInput && tokenInput.value) {
        csrftoken = tokenInput.value;
        console.log('[DEBUG] CSRF token updated from input field.');
    } else {
        console.warn(
            '[DEBUG] CSRF token input field not found, using cookie value.'
        );
    }

    // 웹소켓 설정
    setupWebSocket();

    // --- 기본 UI 요소 리스너 ---
    const projectSelector = document.getElementById('project-selector');
    projectSelector?.addEventListener('change', handleProjectChange);
    document
        .getElementById('create-project-btn')
        ?.addEventListener('click', createNewProject);
    document
        .getElementById('project-export-btn')
        ?.addEventListener('click', exportCurrentProject);
    document
        .getElementById('project-import-btn')
        ?.addEventListener('click', () =>
            document.getElementById('project-import-input').click()
        );
    document
        .getElementById('project-import-input')
        ?.addEventListener('change', handleProjectImport);
    document
        .getElementById('batch-auto-update-btn')
        ?.addEventListener('click', runBatchAutoUpdate);
    document
        .querySelectorAll('input[name="connector_mode"]')
        .forEach((radio) =>
            radio.addEventListener('change', handleConnectorModeChange)
        );

    // --- 네비게이션 리스너 ---
    document
        .querySelectorAll('.main-nav .nav-button')
        .forEach((button) =>
            button.addEventListener('click', handleMainNavClick)
        );
    document
        .querySelectorAll('.sub-nav-button')
        .forEach((button) =>
            button.addEventListener('click', handleSubNavClick)
        );

    // --- CSV 파일 입력 리스너 (공통) ---
    document
        .getElementById('csv-file-input')
        ?.addEventListener('change', handleCsvFileSelect);

    // --- 각 탭별 UI 요소 리스너 설정 (헬퍼 함수 호출) ---
    setupDataManagementListeners();
    setupTagManagementListeners();
    setupSpaceManagementListeners();
    setupRulesetManagementListeners();
    setupCostCodeManagementListeners();
    setupMemberMarkManagementListeners();
    setupQuantityMembersListeners();
    setupCostItemsListeners();
    setupDetailedEstimationListeners(); // DD 탭
    setupUnitPriceManagementListeners();
    setupAiModelManagementListeners(); // [신규] AI 탭
    setupSchematicEstimationListeners(); // [신규] SD 탭

    console.log('[DEBUG] All specific tab listeners setup complete.');

    // --- 초기 프로젝트 로드 ---
    currentProjectId = projectSelector ? projectSelector.value : null;
    if (currentProjectId) {
        console.log(
            `[DEBUG] Initial project ID: ${currentProjectId}. Preparing to load initial data based on default tab...`
        );
        // 초기 데이터 로드는 아래 기본 탭 활성화 로직에서 처리
    } else {
        console.log('[DEBUG] No initial project selected.');
        clearAllTabData(); // 프로젝트 없으면 초기화
    }

    // --- 기본 탭 강제 활성화 (관리 -> 룰셋 관리) ---
    // 페이지 로드 시 기본적으로 보여줄 탭을 설정합니다.
    const defaultPrimaryTabButton = document.querySelector(
        '.main-nav .nav-button[data-primary-tab="management"]'
    );
    const defaultSubTabButton = document.querySelector(
        '#secondary-nav-management .sub-nav-button[data-tab="ruleset-management"]'
    );

    if (defaultPrimaryTabButton && defaultSubTabButton) {
        // 이미 활성화된 보조 탭이 있는지 확인 (예: 새로고침 후 브라우저가 상태 유지)
        const alreadyActiveSubTab = document.querySelector(
            '.secondary-nav.active .sub-nav-button.active'
        );

        if (
            !alreadyActiveSubTab ||
            !alreadyActiveSubTab.closest('#secondary-nav-management')
        ) {
            console.log(
                '[DEBUG] No relevant active sub-tab found. Forcing activation of default: Management -> Ruleset Management'
            );
            // 주 탭 클릭 -> 보조 탭 자동 클릭 순서로 진행 (약간의 지연 추가)
            setTimeout(() => {
                defaultPrimaryTabButton.click();
                // handleMainNavClick 함수가 자동으로 첫 번째 보조 탭(룰셋 관리)을 클릭해줍니다.
            }, 150); // DOM 렌더링 및 다른 스크립트 실행 시간 확보
        } else {
            console.log(
                '[DEBUG] Default tab activation skipped, an active sub-tab already exists in Management:',
                alreadyActiveSubTab.dataset.tab
            );
            // 이미 활성 탭이 있으면 해당 탭 데이터 로드
            activeTab = alreadyActiveSubTab.dataset.tab;
            loadDataForActiveTab();
        }
    } else {
        console.warn(
            '[WARN] Could not find default tab buttons (Management -> Ruleset) for initial activation.'
        );
        // 기본 탭 로드가 안될 경우 대비, 프로젝트가 있으면 데이터 관리 탭이라도 로드 시도
        if (currentProjectId) {
            activeTab = 'data-management'; // 임시 기본값
            loadDataForActiveTab();
        }
    }

    console.log('[DEBUG] DOMContentLoaded end - Initial setup finished.');
});

// --- 리스너 설정 헬퍼 함수들 (기존 함수들 포함) ---

function setupDataManagementListeners() {
    document
        .getElementById('fetchDataBtn')
        ?.addEventListener('click', fetchDataFromClient);
    document
        .getElementById('get-from-client-btn')
        ?.addEventListener('click', getSelectionFromClient);
    document
        .getElementById('select-in-client-btn')
        ?.addEventListener('click', selectInClient);
    document
        .getElementById('render-table-btn')
        ?.addEventListener('click', () =>
            renderDataTable(
                'data-management-data-table-container',
                'data-management'
            )
        );
    document
        .querySelectorAll('#data-management .view-tab-button')
        .forEach((button) =>
            button.addEventListener('click', handleViewTabClick)
        );
    document
        .getElementById('add-group-level-btn')
        ?.addEventListener('click', () => addGroupingLevel('data-management'));
    document
        .getElementById('data-management-grouping-controls')
        ?.addEventListener('change', () =>
            renderDataTable(
                'data-management-data-table-container',
                'data-management'
            )
        ); // 그룹핑 변경 시 렌더
    document
        .getElementById('clear-selection-filter-btn')
        ?.addEventListener('click', clearSelectionFilter);
    document
        .getElementById('assign-tag-btn')
        ?.addEventListener('click', assignTagsToSelection);
    document
        .getElementById('apply-rules-btn')
        ?.addEventListener('click', () => applyClassificationRules(false)); // 확인창 표시
    document
        .getElementById('clear-tags-btn')
        ?.addEventListener('click', clearTagsFromSelection);
    const dmTableContainer = document.getElementById(
        'data-management-data-table-container'
    );
    if (dmTableContainer) {
        dmTableContainer.addEventListener('keyup', (e) =>
            handleColumnFilter(e, 'data-management')
        ); // 필터 입력
        dmTableContainer.addEventListener('click', (e) =>
            handleTableClick(e, 'data-management')
        ); // 행 선택, 그룹 토글
    }
    // 좌측 패널 탭 (필드선택, 분류, BIM속성)
    document
        .querySelector('#data-management .left-panel-tabs')
        ?.addEventListener('click', handleLeftPanelTabClick);
    console.log('[DEBUG] Data Management listeners setup complete.');
}

function setupTagManagementListeners() {
    document
        .getElementById('create-tag-btn')
        ?.addEventListener('click', createNewTag);
    document
        .getElementById('tag-list')
        ?.addEventListener('click', handleTagListActions); // 수정, 삭제 위임
    document
        .getElementById('import-tags-btn')
        ?.addEventListener('click', () =>
            document.getElementById('tag-file-input').click()
        );
    document
        .getElementById('tag-file-input')
        ?.addEventListener('change', importTags);
    document
        .getElementById('export-tags-btn')
        ?.addEventListener('click', exportTags);
    console.log('[DEBUG] Tag Management listeners setup complete.');
}

function setupSpaceManagementListeners() {
    document
        .getElementById('add-root-space-btn')
        ?.addEventListener('click', () => handleSpaceActions('add_root'));
    document
        .getElementById('apply-space-rules-btn')
        ?.addEventListener('click', applySpaceClassificationRules);
    document
        .getElementById('export-space-classifications-btn')
        ?.addEventListener('click', exportSpaceClassifications);
    document
        .getElementById('import-space-classifications-btn')
        ?.addEventListener('click', triggerSpaceClassificationsImport);

    const spaceTreeContainer = document.getElementById('space-tree-container');
    if (spaceTreeContainer && !spaceTreeContainer.dataset.listenerAttached) {
        spaceTreeContainer.addEventListener('click', handleSpaceTreeActions); // 트리 내 버튼 위임
        spaceTreeContainer.dataset.listenerAttached = 'true';
    }
    const smPanel = document.getElementById('space-management');
    if (smPanel) {
        smPanel
            .querySelector('.left-panel-tabs')
            ?.addEventListener('click', handleLeftPanelTabClick); // 좌측 패널 탭
        document
            .getElementById('sm-render-table-btn')
            ?.addEventListener('click', () =>
                renderDataTable(
                    'space-management-data-table-container',
                    'space-management'
                )
            );
        document
            .getElementById('add-space-management-group-level-btn')
            ?.addEventListener('click', () =>
                addGroupingLevel('space-management')
            );
        document
            .getElementById('space-management-grouping-controls')
            ?.addEventListener('change', () =>
                renderDataTable(
                    'space-management-data-table-container',
                    'space-management'
                )
            ); // 그룹핑 변경
        const smTableContainer = document.getElementById(
            'space-management-data-table-container'
        );
        if (smTableContainer) {
            smTableContainer.addEventListener('keyup', (e) =>
                handleColumnFilter(e, 'space-management')
            ); // 필터
            smTableContainer.addEventListener('click', (e) =>
                handleTableClick(e, 'space-management')
            ); // 행 선택, 그룹 토글
        }
    }
    // 할당된 객체 모달 리스너
    const assignedElementsModal = document.getElementById(
        'assigned-elements-modal'
    );
    if (assignedElementsModal) {
        assignedElementsModal
            .querySelector('.modal-close-btn')
            ?.addEventListener('click', closeAssignedElementsModal);
        document
            .getElementById('modal-close-assigned-elements')
            ?.addEventListener('click', closeAssignedElementsModal);
        document
            .getElementById('modal-unassign-btn')
            ?.addEventListener('click', handleUnassignElements);
        assignedElementsModal
            .querySelector('#assigned-elements-table-container')
            ?.addEventListener('click', handleAssignedElementsTableClick); // 전체 선택 등
    }
    console.log('[DEBUG] Space Management listeners setup complete.');
}

function setupRulesetManagementListeners() {
    document
        .querySelectorAll('.ruleset-nav-button')
        .forEach((button) =>
            button.addEventListener('click', handleRulesetNavClick)
        ); // 룰셋 종류 탭
    // 각 룰셋 '새 규칙 추가' 버튼
    document
        .getElementById('add-classification-rule-btn')
        ?.addEventListener('click', () =>
            renderClassificationRulesetTable(loadedClassificationRules, 'new')
        );
    document
        .getElementById('add-mapping-rule-btn')
        ?.addEventListener('click', () =>
            renderPropertyMappingRulesetTable(loadedPropertyMappingRules, 'new')
        );
    document
        .getElementById('add-costcode-rule-btn')
        ?.addEventListener('click', () =>
            renderCostCodeRulesetTable(loadedCostCodeRules, 'new')
        );
    document
        .getElementById('add-member-mark-assignment-rule-btn')
        ?.addEventListener('click', () =>
            renderMemberMarkAssignmentRulesetTable(
                loadedMemberMarkAssignmentRules,
                'new'
            )
        );
    document
        .getElementById('add-cost-code-assignment-rule-btn')
        ?.addEventListener('click', () =>
            renderCostCodeAssignmentRulesetTable(
                loadedCostCodeAssignmentRules,
                'new'
            )
        );
    document
        .getElementById('add-space-classification-rule-btn')
        ?.addEventListener('click', () =>
            renderSpaceClassificationRulesetTable(
                loadedSpaceClassificationRules,
                'new'
            )
        );
    document
        .getElementById('add-space-assignment-rule-btn')
        ?.addEventListener('click', () =>
            renderSpaceAssignmentRulesetTable(loadedSpaceAssignmentRules, 'new')
        );
    // 각 룰셋 테이블 이벤트 위임 (수정, 삭제, 저장, 취소)
    document
        .getElementById('classification-ruleset')
        ?.addEventListener('click', handleClassificationRuleActions);
    document
        .getElementById('mapping-ruleset-table-container')
        ?.addEventListener('click', handlePropertyMappingRuleActions);
    document
        .getElementById('costcode-ruleset-table-container')
        ?.addEventListener('click', handleCostCodeRuleActions);
    document
        .getElementById('member-mark-assignment-ruleset-table-container')
        ?.addEventListener('click', handleMemberMarkAssignmentRuleActions);
    document
        .getElementById('cost-code-assignment-ruleset-table-container')
        ?.addEventListener('click', handleCostCodeAssignmentRuleActions);
    document
        .getElementById('space-classification-ruleset-table-container')
        ?.addEventListener('click', handleSpaceClassificationRuleActions);
    document
        .getElementById('space-assignment-ruleset-table-container')
        ?.addEventListener('click', handleSpaceAssignmentRuleActions);
    // CSV 가져오기/내보내기 버튼 (동적 설정)
    setupRulesetCsvButtons();
    console.log('[DEBUG] Ruleset Management listeners setup complete.');
}

function setupCostCodeManagementListeners() {
    document
        .getElementById('add-cost-code-btn')
        ?.addEventListener('click', () =>
            renderCostCodesTable(loadedCostCodes, 'new')
        );
    document
        .getElementById('cost-codes-table-container')
        ?.addEventListener('click', handleCostCodeActions); // 수정, 삭제, 저장, 취소 위임
    document
        .getElementById('export-cost-codes-btn')
        ?.addEventListener('click', exportCostCodes);
    document
        .getElementById('import-cost-codes-btn')
        ?.addEventListener('click', triggerCostCodesImport);
    console.log('[DEBUG] Cost Code Management listeners setup complete.');
}

function setupMemberMarkManagementListeners() {
    document
        .getElementById('add-member-mark-btn')
        ?.addEventListener('click', () =>
            renderMemberMarksTable(loadedMemberMarks, 'new')
        );
    document
        .getElementById('member-marks-table-container')
        ?.addEventListener('click', handleMemberMarkActions); // 수정, 삭제, 저장, 취소 위임
    document
        .getElementById('export-member-marks-btn')
        ?.addEventListener('click', exportMemberMarks);
    document
        .getElementById('import-member-marks-btn')
        ?.addEventListener('click', triggerMemberMarksImport);
    console.log('[DEBUG] Member Mark Management listeners setup complete.');
}

function setupQuantityMembersListeners() {
    document
        .getElementById('create-qm-manual-btn')
        ?.addEventListener('click', createManualQuantityMember);
    document
        .getElementById('create-qm-auto-btn')
        ?.addEventListener('click', () => createAutoQuantityMembers(false)); // 확인창 표시
    document
        .getElementById('apply-assignment-rules-btn')
        ?.addEventListener('click', () => applyAssignmentRules(false)); // 확인창 표시
    const qmTableContainer = document.getElementById('qm-table-container');
    if (qmTableContainer) {
        qmTableContainer.addEventListener('click', handleQuantityMemberActions); // 수정, 삭제, 저장, 취소, 행 선택, 그룹 토글 위임
        qmTableContainer.addEventListener('keyup', handleQmColumnFilter); // 필터
    }
    document
        .getElementById('qm-properties-container')
        ?.closest('.control-box')
        ?.addEventListener('click', handleQmPropertiesActions); // 속성 추가/삭제 위임
    // 할당 버튼들
    document
        .getElementById('qm-assign-cost-code-btn')
        ?.addEventListener('click', assignCostCodeToQm);
    document
        .getElementById('qm-clear-cost-codes-btn')
        ?.addEventListener('click', clearCostCodesFromQm);
    document
        .getElementById('qm-assign-member-mark-btn')
        ?.addEventListener('click', assignMemberMarkToQm);
    document
        .getElementById('qm-clear-member-marks-btn')
        ?.addEventListener('click', clearMemberMarksFromQm);
    document
        .getElementById('qm-assign-space-btn')
        ?.addEventListener('click', assignSpaceToQm);
    document
        .getElementById('qm-clear-spaces-btn')
        ?.addEventListener('click', clearSpacesFromQm);
    document
        .getElementById('add-qm-group-level-btn')
        ?.addEventListener('click', addQmGroupingLevel);
    document
        .querySelector('#quantity-members .details-panel-tabs')
        ?.addEventListener('click', handleQmDetailTabClick); // 오른쪽 상세 탭
    document
        .querySelector('#quantity-members .view-tabs')
        ?.addEventListener('click', handleQmViewTabClick); // 테이블 뷰 전환 탭
    console.log('[DEBUG] Quantity Members listeners setup complete.');
}

function setupCostItemsListeners() {
    document
        .getElementById('create-ci-manual-btn')
        ?.addEventListener('click', createManualCostItem);
    document
        .getElementById('create-ci-auto-btn')
        ?.addEventListener('click', () => createAutoCostItems(false)); // 확인창 표시
    document
        .getElementById('add-ci-group-level-btn')
        ?.addEventListener('click', addCiGroupingLevel);
    const ciTableContainer = document.getElementById('ci-table-container');
    if (ciTableContainer) {
        ciTableContainer.addEventListener('click', handleCostItemActions); // 수정, 삭제, 저장, 취소, 행 선택, 그룹 토글 위임
        ciTableContainer.addEventListener('keyup', handleCiColumnFilter); // 필터
    }
    console.log('[DEBUG] Cost Items listeners setup complete.');
}

function setupDetailedEstimationListeners() {
    document
        .getElementById('generate-boq-btn')
        ?.addEventListener('click', generateBoqReport);
    document
        .getElementById('boq-reset-columns-btn')
        ?.addEventListener('click', () => resetBoqColumnsAndRegenerate(false)); // 확인창 표시
    document
        .getElementById('export-boq-btn')
        ?.addEventListener('click', exportBoqReportToExcel);
    document
        .getElementById('boq-get-from-client-btn')
        ?.addEventListener('click', handleBoqGetFromClient);
    document
        .getElementById('boq-select-in-client-btn')
        ?.addEventListener('click', handleBoqSelectInClient);
    document
        .getElementById('boq-clear-selection-filter-btn')
        ?.addEventListener('click', handleBoqClearFilter);
    document
        .getElementById('add-boq-group-level-btn')
        ?.addEventListener('click', addBoqGroupingLevel);
    // 필터 체크박스
    document
        .getElementById('boq-filter-ai')
        ?.addEventListener('change', generateBoqReport);
    document
        .getElementById('boq-filter-dd')
        ?.addEventListener('change', generateBoqReport);
    // DD 탭 UI 초기화 (토글 버튼, 탭 등)
    initializeBoqUI(); // 패널 토글, 상세 탭 리스너 설정
    console.log('[DEBUG] Detailed Estimation (DD) listeners setup complete.');
}

function setupUnitPriceManagementListeners() {
    document.getElementById('unit-price-cost-code-search')?.addEventListener(
        'input',
        debounce(() => renderCostCodeListForUnitPrice(loadedCostCodes), 300)
    ); // 공사코드 검색
    document
        .getElementById('unit-price-cost-code-list')
        ?.addEventListener('click', handleCostCodeSelectionForUnitPrice); // 공사코드 선택
    document
        .getElementById('add-unit-price-type-btn')
        ?.addEventListener('click', () =>
            renderUnitPriceTypesTable(loadedUnitPriceTypes, 'new')
        ); // 단가 구분 추가
    document
        .getElementById('unit-price-type-table-container')
        ?.addEventListener('click', handleUnitPriceTypeActions); // 단가 구분 수정/삭제/저장/취소
    document
        .getElementById('add-unit-price-btn')
        ?.addEventListener('click', () =>
            renderUnitPricesTable(loadedUnitPrices, 'new')
        ); // 단가 추가
    const priceTableContainer = document.getElementById(
        'unit-price-table-container'
    );
    if (priceTableContainer) {
        priceTableContainer.addEventListener('click', handleUnitPriceActions); // 단가 수정/삭제/저장/취소
        priceTableContainer.addEventListener(
            'input',
            handleUnitPriceInputChange
        ); // 단가 입력 시 합계 계산
    }
    console.log('[DEBUG] Unit Price Management listeners setup complete.');
}

function setupAiModelManagementListeners() {
    // 내부 탭 전환
    document
        .querySelector('#ai-model-manager .inner-tab-nav')
        ?.addEventListener('click', handleAiInnerTabClick);
    // 모델 업로드 관련
    document
        .getElementById('upload-ai-model-files-btn')
        ?.addEventListener('click', triggerAiFileUpload);
    document
        .getElementById('confirm-upload-ai-model-btn')
        ?.addEventListener('click', uploadAiModel);
    document
        .getElementById('ai-model-h5-input')
        ?.addEventListener('change', () =>
            displaySelectedFileName(
                'ai-model-h5-input',
                'upload-ai-model-files-btn'
            )
        );
    document
        .getElementById('ai-model-json-input')
        ?.addEventListener('change', () =>
            displaySelectedFileName(
                'ai-model-json-input',
                'upload-ai-model-files-btn'
            )
        );
    // 모델 목록 테이블 액션 (수정, 삭제, 다운로드)
    document
        .getElementById('ai-model-list-container')
        ?.addEventListener('click', handleAiModelListActions);
    // 모델 학습 관련
    document
        .getElementById('upload-csv-btn')
        ?.addEventListener('click', uploadAndAnalyzeCsv);
    document
        .getElementById('training-csv-input')
        ?.addEventListener('change', () =>
            displaySelectedFileName('training-csv-input', 'upload-csv-btn')
        );
    document
        .getElementById('start-training-btn')
        ?.addEventListener('click', startTraining);
    document
        .getElementById('save-trained-model-btn')
        ?.addEventListener('click', saveTrainedModel); // DB 저장 버튼
    document
        .getElementById('download-trained-model-h5-btn')
        ?.addEventListener('click', () => downloadTrainedModelFile('h5')); // H5 다운로드
    document
        .getElementById('download-trained-model-json-btn')
        ?.addEventListener('click', () => downloadTrainedModelFile('json')); // JSON 다운로드
    document
        .getElementById('reset-training-btn')
        ?.addEventListener('click', resetTrainingUI); // 학습 리셋
    // 피처 선택 리스너 (체크박스 변경 감지)
    document
        .getElementById('input-feature-list')
        ?.addEventListener('change', handleFeatureSelection);
    document
        .getElementById('output-feature-list')
        ?.addEventListener('change', handleFeatureSelection);

    document
        .getElementById('add-hidden-layer-btn')
        ?.addEventListener('click', addHiddenLayerRow);

    // 제거 버튼은 동적으로 추가되므로 이벤트 위임 사용 (컨테이너에 리스너 추가)
    const layersContainer = document.getElementById('hidden-layers-config');
    if (layersContainer && !layersContainer.dataset.listenerAttached) {
        // 중복 방지
        layersContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-layer-btn')) {
                removeHiddenLayerRow(event);
            }
        });
        layersContainer.dataset.listenerAttached = 'true'; // 리스너 추가됨 표시
    }

    // 데이터 분할 비율 변경 시 Test 비율 업데이트
    const trainRatioInput = document.getElementById('train-ratio');
    const valRatioInput = document.getElementById('val-ratio');
    const testRatioDisplay = document.getElementById('test-ratio-display');
    const updateTestRatio = () => {
        const trainR = parseInt(trainRatioInput?.value) || 0;
        const valR = parseInt(valRatioInput?.value) || 0;
        const testR = 100 - trainR - valR;
        if (testRatioDisplay) {
            testRatioDisplay.textContent = `Test 비율(%): ${
                testR >= 0 ? testR : '오류'
            }`;
        }
    };
    trainRatioInput?.addEventListener('input', updateTestRatio);
    valRatioInput?.addEventListener('input', updateTestRatio);

    // 랜덤 시드 고정 옵션 변경 시 입력 필드 표시/숨김
    const useRandomSeedCheckbox = document.getElementById('use-random-seed');
    const randomSeedValueInput = document.getElementById('random-seed-value');
    useRandomSeedCheckbox?.addEventListener('change', (event) => {
        if (randomSeedValueInput) {
            randomSeedValueInput.style.display = event.target.checked
                ? 'inline-block'
                : 'none';
        }
    });

    // 설정 초기화 버튼
    document
        .getElementById('reset-training-config-btn')
        ?.addEventListener('click', () => {
            if (
                confirm(
                    '모델 구조, 하이퍼파라미터, 데이터 분할 설정을 기본값으로 초기화하시겠습니까?'
                )
            ) {
                resetTrainingUI(false); // UI만 리셋 (CSV는 유지)
                // resetTrainingUI 함수 내부에서 UI 요소들 초기화
                // resetHiddenLayersConfig() 호출 불필요 (resetTrainingUI에서 처리)
                showToast('학습 설정을 초기화했습니다.', 'info');
            }
        });

    console.log('[DEBUG] AI Model Management listeners setup complete.');
}

function setupSchematicEstimationListeners() {
    // --- 상단 패널 (모델 선택, 입력, 예측) ---
    document
        .getElementById('sd-model-select')
        ?.addEventListener('change', handleSdModelSelection);
    document
        .getElementById('sd-input-fields')
        ?.addEventListener('input', handleSdInputChange);
    document
        .getElementById('sd-predict-btn')
        ?.addEventListener('click', runSdPrediction);

    // --- 하단 패널 (BOQ 테이블 및 컨트롤) ---
    // 그룹핑 추가 버튼
    document
        .getElementById('add-sd-group-level-btn')
        ?.addEventListener('click', addSdGroupingLevel);
    // 그룹핑 레벨 변경/제거 시 테이블 다시 그리기 (이벤트 위임)
    const sdGroupingControls = document.getElementById('sd-grouping-controls');
    if (sdGroupingControls && !sdGroupingControls.dataset.listenerAttached) {
        sdGroupingControls.addEventListener('change', generateSdBoqReport);
        sdGroupingControls.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-sd-group-level-btn')) {
                // 제거 후에는 자동으로 change 이벤트가 발생하지 않으므로 직접 호출
                generateSdBoqReport();
            }
        });
        sdGroupingControls.dataset.listenerAttached = 'true';
    }

    // 표시 필드 선택 변경 시 (리스너는 이제 필요 없음, generateSdBoqReport에서 처리)
    // document.getElementById('sd-display-fields-container')?.addEventListener('change', ...);

    // BIM 연동 버튼 (왼쪽 테이블 헤더)
    document
        .getElementById('sd-select-in-client-btn')
        ?.addEventListener('click', handleSdBoqSelectInClient); // SD용 함수 호출

    // 하단 왼쪽 테이블 자체의 클릭 이벤트 (행 선택 -> 중간 목록 업데이트)
    const sdTableContainer = document.getElementById('sd-table-container');
    if (sdTableContainer && !sdTableContainer.dataset.clickListenerAttached) {
        sdTableContainer.addEventListener('click', handleSdBoqTableClick); // SD용 핸들러 호출
        sdTableContainer.dataset.clickListenerAttached = 'true';
    }

    // ▼▼▼ [추가] 하단 중간 목록 클릭 이벤트 리스너 ▼▼▼
    const sdItemListContainer = document.getElementById(
        'sd-item-list-container'
    );
    if (
        sdItemListContainer &&
        !sdItemListContainer.dataset.clickListenerAttached
    ) {
        sdItemListContainer.addEventListener(
            'click',
            handleSdAssociatedItemClick
        ); // 새로 추가된 핸들러 호출
        sdItemListContainer.dataset.clickListenerAttached = 'true';
    }
    // ▲▲▲ [추가] 여기까지 ▲▲▲

    // ▼▼▼ [추가] 하단 오른쪽 상세 속성 패널 탭 클릭 리스너 ▼▼▼
    const sdDetailsPanel = document.getElementById('sd-item-details-panel');
    if (sdDetailsPanel) {
        const tabsContainer = sdDetailsPanel.querySelector(
            '.details-panel-tabs'
        );
        if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
            tabsContainer.addEventListener('click', (e) => {
                // DD와 동일한 로직 사용
                const clickedButton = e.target.closest('.detail-tab-button');
                if (
                    !clickedButton ||
                    clickedButton.classList.contains('active')
                )
                    return;
                const targetTab = clickedButton.dataset.tab; // 예: "sd-member-prop"
                console.log(`[DEBUG] SD Detail tab clicked: ${targetTab}`);

                sdDetailsPanel
                    .querySelectorAll('.detail-tab-button.active')
                    .forEach((btn) => btn.classList.remove('active'));
                sdDetailsPanel
                    .querySelectorAll('.detail-tab-content.active')
                    .forEach((content) => content.classList.remove('active'));

                clickedButton.classList.add('active');
                const targetContent = sdDetailsPanel.querySelector(
                    `.detail-tab-content[data-tab="${targetTab}"]`
                );
                if (targetContent) targetContent.classList.add('active');
            });
            tabsContainer.dataset.listenerAttached = 'true';
        }
    }
    // ▲▲▲ [추가] 여기까지 ▲▲▲

    console.log('[DEBUG] Schematic Estimation (SD) listeners setup complete.');
}
function handleSdAssociatedItemClick(event) {
    const itemRow = event.target.closest('tr[data-item-id]');
    const bimButton = event.target.closest(
        'button.select-in-client-btn-detail'
    );

    if (bimButton) {
        // BIM 연동 버튼 클릭 시 (기존 DD 함수 재사용)
        const costItemId = bimButton.dataset.costItemId;
        console.log(
            `[DEBUG][Event] SD BIM link button clicked for CostItem ID: ${costItemId}`
        );
        handleBoqSelectInClientFromDetail(costItemId); // DD와 동일 함수 사용
    } else if (itemRow) {
        // 행의 다른 부분 클릭 시 (오른쪽 상세 정보 표시)
        const itemId = itemRow.dataset.itemId;
        console.log(
            `[DEBUG][Event] SD associated item row clicked. Item ID: ${itemId}`
        );

        // 오른쪽 상세 속성 패널 업데이트 함수 호출
        renderSdItemProperties(itemId);
    }
}

// ▲▲▲ [교체] 여기까지 ▲▲▲

// ▼▼▼ [교체] 기존 handleProjectChange 함수 전체를 아래 코드로 교체 ▼▼▼
function handleProjectChange(e) {
    currentProjectId = e.target.value;
    console.log(
        `[DEBUG][handleProjectChange] Project changed to: ${currentProjectId}`
    ); // 디버깅

    // BOQ 컬럼 설정 로드 (프로젝트 변경 시)
    loadBoqColumnSettings();

    // --- 상태 초기화 ---
    allRevitData = []; // BIM 데이터 초기화
    // 각 뷰어 상태 초기화
    Object.keys(viewerStates).forEach((context) => {
        const state = viewerStates[context];
        state.selectedElementIds.clear();
        state.revitFilteredIds.clear();
        state.columnFilters = {};
        state.isFilterToSelectionActive = false;
        state.collapsedGroups = {};
        state.currentGroupByFields = [];
        state.lastSelectedRowIndex = -1;
    });
    // QM 상태 초기화
    loadedQuantityMembers = [];
    qmColumnFilters = {};
    selectedQmIds.clear();
    qmCollapsedGroups = {};
    currentQmGroupByFields = [];
    lastSelectedQmRowIndex = -1;
    activeQmView = 'quantity-member-view';
    // CI 상태 초기화
    loadedCostItems = [];
    ciColumnFilters = {};
    selectedCiIds.clear();
    ciCollapsedGroups = {};
    currentCiGroupByFields = [];
    lastSelectedCiRowIndex = -1;
    // BOQ(DD) 상태 초기화
    boqFilteredRawElementIds.clear();
    // currentBoqColumns = []; // loadBoqColumnSettings에서 처리
    // boqColumnAliases = {}; // loadBoqColumnSettings에서 처리
    lastBoqItemIds = [];
    currentBoqDetailItemId = null;
    loadedUnitPriceTypesForBoq = [];
    document.getElementById('boq-clear-selection-filter-btn').style.display =
        'none';
    // 룰셋 데이터 초기화
    loadedClassificationRules = [];
    loadedPropertyMappingRules = [];
    loadedCostCodeRules = [];
    loadedMemberMarkAssignmentRules = [];
    loadedCostCodeAssignmentRules = [];
    loadedSpaceClassificationRules = [];
    loadedSpaceAssignmentRules = [];
    // 기타 데이터 초기화
    allTags = [];
    loadedCostCodes = [];
    loadedMemberMarks = [];
    loadedSpaceClassifications = [];
    loadedUnitPriceTypes = [];
    loadedUnitPrices = [];
    selectedCostCodeIdForUnitPrice = null;
    currentUnitPriceEditState = { id: null, originalData: null };
    spaceMappingState = { active: false, spaceId: null, spaceName: '' };

    // --- [신규] AI 및 SD 관련 상태 초기화 ---
    loadedAiModels = [];
    currentTrainingTaskId = null;
    currentTrainingStatus = {};
    uploadedCsvFilename = null;
    csvHeaders = [];
    trainedModelTempFilename = null;
    trainedModelMetadata = null;
    sdEnabledCostCodes = [];
    selectedSdModelId = null;
    loadedSdCostItems = [];
    sdColumnFilters = {};
    selectedSdItemIds.clear();
    sdCollapsedGroups = {};
    currentSdGroupByFields = [];
    // 차트 인스턴스 파기
    if (trainingChartInstance) {
        trainingChartInstance.destroy();
        trainingChartInstance = null;
    }
    if (sdPredictionChartInstance) {
        sdPredictionChartInstance.destroy();
        sdPredictionChartInstance = null;
    }
    console.log('[DEBUG][handleProjectChange] AI and SD states reset.'); // 디버깅
    // --- 상태 초기화 끝 ---

    if (currentProjectId) {
        showToast(
            `프로젝트 '${
                e.target.options[e.target.selectedIndex].text
            }' 선택됨.`,
            'info'
        );
        console.log(
            `[DEBUG][handleProjectChange] Project selected: ${
                e.target.options[e.target.selectedIndex].text
            }. Loading initial data...`
        ); // 디버깅
        // --- 초기 웹소켓 요청 ---
        if (frontendSocket && frontendSocket.readyState === WebSocket.OPEN) {
            console.log(
                '[DEBUG][handleProjectChange] Sending initial WebSocket requests (get_tags, get_all_elements)...'
            ); // 디버깅
            frontendSocket.send(
                JSON.stringify({
                    type: 'get_tags',
                    payload: { project_id: currentProjectId },
                })
            );
            frontendSocket.send(
                JSON.stringify({
                    type: 'get_all_elements',
                    payload: { project_id: currentProjectId },
                })
            ); // BIM 데이터 요청
        } else {
            console.error(
                '[ERROR][handleProjectChange] WebSocket not open. Cannot send initial requests.'
            ); // 디버깅
            showToast('웹소켓 연결 오류. 페이지 새로고침 필요.', 'error');
        }
        // --- 초기 웹소켓 요청 끝 ---

        // --- 현재 활성 탭 데이터 로드 ---
        // (주의: WebSocket 응답(all_elements)이 오기 전에 실행될 수 있음)
        // loadDataForActiveTab 함수는 allRevitData가 비어있어도 UI 초기화 등을 수행함
        console.log(
            `[DEBUG][handleProjectChange] Calling loadDataForActiveTab() for active tab: ${activeTab}`
        ); // 디버깅
        loadDataForActiveTab();
    } else {
        // --- 프로젝트 선택 해제 시 UI 초기화 ---
        console.log(
            '[DEBUG][handleProjectChange] Project deselected. Clearing UI.'
        ); // 디버깅
        showToast('프로젝트 선택이 해제되었습니다.', 'info');
        clearAllTabData(); // UI 초기화 함수 호출
    }
}
// ▲▲▲ [교체] 여기까지 ▲▲▲

function createNewProject() {
    const projectNameInput = document.getElementById('new-project-name');
    const projectName = projectNameInput.value.trim();
    if (!projectName) {
        showToast('프로젝트 이름을 입력하세요.', 'error');
        return;
    }
    fetch('/connections/create-project/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify({ name: projectName }),
    })
        .then((res) => res.json())
        .then((data) => {
            if (data.status === 'success') {
                showToast(
                    `프로젝트 '${data.project_name}' 생성 완료.`,
                    'success'
                );
                const selector = document.getElementById('project-selector');
                const newOption = new Option(
                    data.project_name,
                    data.project_id,
                    true,
                    true
                );
                selector.add(newOption, selector.options[1]);
                selector.dispatchEvent(new Event('change'));
                projectNameInput.value = '';
            } else {
                showToast('프로젝트 생성 실패: ' + data.message, 'error');
            }
        });
}

// --- 핸들러 함수들 ---
// ▼▼▼ [교체] 기존 handleMainNavClick 함수 전체를 아래 코드로 교체 ▼▼▼
function handleMainNavClick(e) {
    const clickedButton = e.currentTarget;
    const primaryTabId = clickedButton.dataset.primaryTab; // 예: "management", "takeoff", "schematic-estimation-sd"
    console.log(
        `[DEBUG][handleMainNavClick] Clicked main tab button: ${primaryTabId}`
    );

    if (clickedButton.classList.contains('active')) {
        console.log(
            `[DEBUG][handleMainNavClick] Tab '${primaryTabId}' is already active.`
        );
        return;
    }

    // --- UI 상태 변경 ---
    document
        .querySelectorAll('.main-nav .nav-button.active')
        .forEach((btn) => btn.classList.remove('active'));
    document
        .querySelectorAll('.secondary-nav.active')
        .forEach((nav) => nav.classList.remove('active'));
    document
        .querySelectorAll('.main-content > .tab-content.active')
        .forEach((content) => content.classList.remove('active'));

    clickedButton.classList.add('active');
    console.log(
        `[DEBUG][handleMainNavClick] Main button '${primaryTabId}' activated.`
    );

    // --- 해당 주 탭에 맞는 보조 탭 또는 컨텐츠 활성화 ---
    const secondaryNav = document.getElementById(
        `secondary-nav-${primaryTabId}`
    );
    const targetContent = document.getElementById(primaryTabId); // DD, SD 탭은 ID가 동일

    if (secondaryNav) {
        // '관리', '산출' 탭처럼 보조 네비게이션이 있는 경우
        console.log(
            `[DEBUG][handleMainNavClick] Activating secondary nav: secondary-nav-${primaryTabId}`
        );
        secondaryNav.classList.add('active');

        let subNavButtonToClick = secondaryNav.querySelector(
            '.sub-nav-button.active'
        );
        if (!subNavButtonToClick) {
            subNavButtonToClick = secondaryNav.querySelector('.sub-nav-button'); // 첫 번째 버튼
            console.log(
                '[DEBUG][handleMainNavClick] No active sub-tab found, will activate the first one.'
            );
        } else {
            console.log(
                `[DEBUG][handleMainNavClick] Found previously active sub-tab: ${subNavButtonToClick.dataset.tab}`
            );
        }

        if (subNavButtonToClick) {
            console.log(
                `[DEBUG][handleMainNavClick] Programmatically clicking sub-tab: ${subNavButtonToClick.dataset.tab}`
            );
            subNavButtonToClick.click(); // 하위 탭 클릭 핸들러가 컨텐츠 활성화 및 데이터 로드 담당
        } else {
            console.warn(
                `[WARN][handleMainNavClick] No sub-tab buttons found in secondary nav: secondary-nav-${primaryTabId}.`
            );
            // 보조 탭 버튼이 없으면, 해당 ID의 메인 컨텐츠를 직접 활성화 시도 (예외 케이스)
            if (targetContent) {
                console.log(
                    `[DEBUG][handleMainNavClick] Activating content directly as fallback: ${primaryTabId}`
                );
                targetContent.classList.add('active');
                activeTab = primaryTabId;
                loadDataForActiveTab();
            } else {
                activeTab = null;
            }
        }
        // [수정] DD, SD 탭처럼 보조 네비게이션이 없는 경우 명시적 처리
    } else if (
        targetContent &&
        (primaryTabId === 'detailed-estimation-dd' ||
            primaryTabId === 'schematic-estimation-sd')
    ) {
        console.log(
            `[DEBUG][handleMainNavClick] Activating content directly for tab without secondary nav: ${primaryTabId}`
        );
        targetContent.classList.add('active');
        activeTab = primaryTabId; // 전역 activeTab 업데이트
        loadDataForActiveTab(); // 해당 탭 데이터 로드
    } else {
        // [추가] SD, DD 탭은 보조 네비게이션이 없는 것이 정상이므로 경고 제외
        const noSecondaryNavTabs = [
            'detailed-estimation-dd',
            'schematic-estimation-sd',
        ];
        if (!noSecondaryNavTabs.includes(primaryTabId)) {
            console.warn(
                `[WARN][handleMainNavClick] No sub-tab buttons found in secondary nav: secondary-nav-${primaryTabId}.`
            );
        }
        // ▲▲▲ [추가] 여기까지 ▲▲▲
        // 보조 탭 버튼이 없으면, 해당 ID의 메인 컨텐츠를 직접 활성화 시도 (예외 케이스)
        if (targetContent) {
            console.log(
                `[DEBUG][handleMainNavClick] Activating content directly as fallback: ${primaryTabId}`
            );
            targetContent.classList.add('active');
            activeTab = primaryTabId;
            loadDataForActiveTab();
        } else {
            activeTab = null;
        }
    }
    console.log(
        `[DEBUG][handleMainNavClick] Function end. Current activeTab: ${activeTab}`
    );
}
// ▲▲▲ [교체] 여기까지 ▲▲▲
function fetchDataFromClient() {
    document.getElementById('project-selector').disabled = true;
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    // ▼▼▼ [수정] data-management 뷰어의 상태를 초기화합니다. ▼▼▼
    const state = viewerStates['data-management'];
    state.selectedElementIds.clear();
    state.revitFilteredIds.clear();
    state.isFilterToSelectionActive = false;
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
    document.getElementById('clear-selection-filter-btn').style.display =
        'none';

    const progressContainer = document.getElementById('progress-container');
    const progressStatus = document.getElementById('progress-status-text');
    const progressBar = document.getElementById('data-fetch-progress');

    progressContainer.style.display = 'block';
    progressStatus.textContent = `${
        currentMode === 'revit' ? 'Revit' : 'Blender'
    }에 데이터 요청 중...`;
    progressBar.value = 0;
    progressBar.removeAttribute('max');

    const targetGroup =
        currentMode === 'revit'
            ? 'revit_broadcast_group'
            : 'blender_broadcast_group';

    frontendSocket.send(
        JSON.stringify({
            type: 'command_to_client',
            payload: {
                command: 'fetch_all_elements_chunked',
                project_id: currentProjectId,
                target_group: targetGroup,
            },
        })
    );
    document.getElementById('status').textContent = `명령 전송 성공! ${
        currentMode === 'revit' ? 'Revit' : 'Blender'
    }에서 데이터를 보내는 중입니다.`;
    showToast(
        `${
            currentMode === 'revit' ? 'Revit' : 'Blender'
        }에 데이터 요청 명령을 보냈습니다.`,
        'info'
    );
}
function getSelectionFromClient() {
    const targetGroup =
        currentMode === 'revit'
            ? 'revit_broadcast_group'
            : 'blender_broadcast_group';
    frontendSocket.send(
        JSON.stringify({
            type: 'command_to_client',
            payload: {
                command: 'get_selection',
                target_group: targetGroup,
            },
        })
    );
    showToast(
        `${
            currentMode === 'revit' ? 'Revit' : 'Blender'
        }에 선택 정보 가져오기를 요청했습니다.`,
        'info'
    );
}
function selectInClient() {
    // ▼▼▼ [수정] 현재 활성화된 탭에 따라 올바른 선택 ID 집합을 사용합니다. ▼▼▼
    const state = getCurrentViewerState();
    const selectedIds = state.selectedElementIds;

    if (selectedIds.size === 0) {
        // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
        showToast(
            `테이블에서 ${
                currentMode === 'revit' ? 'Revit' : 'Blender'
            }으로 보낼 객체를 먼저 선택하세요.`,
            'error'
        );
        return;
    }
    // ▼▼▼ [수정] selectedElementIds를 selectedIds로 변경합니다. ▼▼▼
    const uniqueIdsToSend = allRevitData
        .filter((item) => selectedIds.has(item.id))
        .map((item) => item.element_unique_id);
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
    const targetGroup =
        currentMode === 'revit'
            ? 'revit_broadcast_group'
            : 'blender_broadcast_group';
    frontendSocket.send(
        JSON.stringify({
            type: 'command_to_client',
            payload: {
                command: 'select_elements',
                unique_ids: uniqueIdsToSend,
                target_group: targetGroup,
            },
        })
    );
    showToast(
        `${uniqueIdsToSend.length}개 객체의 선택 명령을 ${
            currentMode === 'revit' ? 'Revit' : 'Blender'
        }으로 보냈습니다.`,
        'info'
    );
}
function createNewTag() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    const newTagNameInput = document.getElementById('new-tag-name');
    const newTagName = newTagNameInput.value.trim();
    if (!newTagName) {
        showToast('분류 이름을 입력하세요.', 'error');
        return;
    }
    frontendSocket.send(
        JSON.stringify({
            type: 'create_tag',
            payload: { project_id: currentProjectId, name: newTagName },
        })
    );
    newTagNameInput.value = '';
}

function handleTagListActions(event) {
    const target = event.target;
    const tagId = target.dataset.id;
    if (!tagId) return;
    if (target.classList.contains('delete-tag-btn')) {
        if (confirm('이 분류를 삭제하시겠습니까?')) {
            frontendSocket.send(
                JSON.stringify({
                    type: 'delete_tag',
                    payload: { project_id: currentProjectId, tag_id: tagId },
                })
            );
        }
    } else if (target.classList.contains('rename-tag-btn')) {
        const currentName = target.dataset.name;
        const newName = prompt('새 분류 이름을 입력하세요:', currentName);
        if (newName && newName.trim() !== '' && newName !== currentName) {
            frontendSocket.send(
                JSON.stringify({
                    type: 'update_tag',
                    payload: {
                        project_id: currentProjectId,
                        tag_id: tagId,
                        new_name: newName.trim(),
                    },
                })
            );
        }
    }
}

function importTags(event) {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    const file = event.target.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('tag_file', file);
        fetch(`/connections/import-tags/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData,
        })
            .then((res) => res.json())
            .then((data) => {
                showToast(
                    data.status === 'success'
                        ? '태그 파일을 성공적으로 가져왔습니다.'
                        : '파일 업로드에 실패했습니다.',
                    data.status === 'success' ? 'success' : 'error'
                );
                event.target.value = '';
            });
    }
}

function exportTags() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    window.location.href = `/connections/export-tags/${currentProjectId}/`;
}

function handleViewTabClick(e) {
    const clickedButton = e.currentTarget;
    const contextPrefix = clickedButton.closest('#data-management')
        ? 'data-management'
        : 'space-management';
    const state = viewerStates[contextPrefix];

    const viewTabsContainer = clickedButton.closest('.view-tabs');
    viewTabsContainer
        .querySelector('.view-tab-button.active')
        .classList.remove('active');
    clickedButton.classList.add('active');

    // ▼▼▼ [수정] viewerStates의 상태를 업데이트합니다. ▼▼▼
    state.activeView = clickedButton.dataset.view;
    state.collapsedGroups = {};
    state.columnFilters = {};
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

    const containerId = `${contextPrefix}-data-table-container`;
    renderDataTable(containerId, contextPrefix);
}

function clearSelectionFilter() {
    // ▼▼▼ [수정] viewerStates의 상태를 업데이트합니다. ▼▼▼
    const state = viewerStates['data-management'];
    state.isFilterToSelectionActive = false;
    state.revitFilteredIds.clear();
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

    document.getElementById('clear-selection-filter-btn').style.display =
        'none';
    renderDataTable('data-management-data-table-container', 'data-management');
    showToast('선택 필터를 해제하고 전체 목록을 표시합니다.', 'info');
}

function assignTagsToSelection() {
    const tagId = document.getElementById('tag-assign-select').value;
    if (!tagId) {
        showToast('적용할 분류를 선택하세요.', 'error');
        return;
    }

    // ▼▼▼ [수정] viewerStates에서 현재 컨텍스트의 선택된 ID를 가져옵니다. ▼▼▼
    const state = viewerStates['data-management']; // 이 버튼은 'data-management' 탭에만 존재합니다.
    const selectedElementIds = state.selectedElementIds;
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

    if (selectedElementIds.size === 0) {
        showToast('분류를 적용할 객체를 테이블에서 선택하세요.', 'error');
        return;
    }
    frontendSocket.send(
        JSON.stringify({
            type: 'assign_tags',
            payload: {
                project_id: currentProjectId,
                tag_id: tagId,
                element_ids: Array.from(selectedElementIds),
            },
        })
    );
}

function clearTagsFromSelection() {
    // ▼▼▼ [수정] viewerStates에서 현재 컨텍스트의 선택된 ID를 가져옵니다. ▼▼▼
    const state = viewerStates['data-management'];
    const selectedElementIds = state.selectedElementIds;
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

    if (selectedElementIds.size === 0) {
        showToast('분류를 제거할 객체를 테이블에서 선택하세요.', 'error');
        return;
    }
    if (
        confirm(
            `${selectedElementIds.size}개 항목의 모든 수량산출분류를 제거하시겠습니까?`
        )
    ) {
        frontendSocket.send(
            JSON.stringify({
                type: 'clear_tags',
                payload: {
                    project_id: currentProjectId,
                    element_ids: Array.from(selectedElementIds),
                },
            })
        );
    }
}

// [교체] 기존 handleColumnFilter를 아래처럼 교체 (소문자 저장 + 디바운스 대상)
function handleColumnFilter(e, contextPrefix) {
    const input = e.target;
    if (!input.classList || !input.classList.contains('column-filter')) return;

    const field = input.dataset.field;
    const state = viewerStates[contextPrefix];
    if (!state) return;

    // 필터값은 항상 소문자로 저장 (비교 비용 절감)
    const v = (input.value || '').toLowerCase();
    state.columnFilters[field] = v;

    // 디바운스로 렌더 호출
    debouncedRender(contextPrefix)();
}
// main.js의 기존 handleTableClick 함수를 아래 코드로 교체

function handleTableClick(event, contextPrefix) {
    const row = event.target.closest('tr');
    if (!row) return;

    const state = viewerStates[contextPrefix];
    if (!state) return;

    const containerId = `${contextPrefix}-data-table-container`;

    if (row.classList.contains('group-header')) {
        const groupPath = row.dataset.groupPath;
        if (groupPath) {
            state.collapsedGroups[groupPath] =
                !state.collapsedGroups[groupPath];
            renderDataTable(containerId, contextPrefix);
        }
    } else if (row.dataset.dbId) {
        // ▼▼▼ [수정] data-dbId를 사용하도록 변경 ▼▼▼
        handleRowSelection(event, row, contextPrefix);
        renderDataTable(containerId, contextPrefix);
        // ▼▼▼ [수정] 함수 호출 시 contextPrefix 인자 전달 ▼▼▼
        renderBimPropertiesTable(contextPrefix);
        renderAssignedTagsTable(contextPrefix);
    }
}
function handleRulesetNavClick(e) {
    const targetButton = e.currentTarget;
    if (targetButton.classList.contains('active')) return;

    // 현재 활성화된 버튼/컨텐츠 비활성화
    const currentActiveButton = document.querySelector(
        '.ruleset-nav-button.active'
    );
    if (currentActiveButton) currentActiveButton.classList.remove('active');
    document
        .querySelectorAll('.ruleset-content.active')
        .forEach((content) => content.classList.remove('active'));

    // 클릭된 버튼/컨텐츠 활성화
    targetButton.classList.add('active');
    const targetRulesetId = targetButton.dataset.ruleset; // e.g., "classification-ruleset"
    const targetContent = document.getElementById(targetRulesetId);
    if (targetContent) targetContent.classList.add('active');

    const buttonText =
        targetButton.querySelector('strong')?.innerText || '선택된 룰셋';
    showToast(`${buttonText} 탭으로 전환합니다.`, 'info');

    // --- [핵심] 여기서 해당 룰셋 데이터 로드 함수 호출 ---
    loadSpecificRuleset(targetRulesetId);
}

// 룰셋 테이블의 모든 동작(저장, 수정, 취소, 삭제)을 처리하는 함수

// 룰셋 테이블의 모든 동작(저장, 수정, 취소, 삭제)을 처리하는 함수
async function handleClassificationRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;

    const ruleId = ruleRow.dataset.ruleId;

    // --- 수정 버튼 클릭 ---
    if (target.classList.contains('edit-rule-btn')) {
        const existingEditRow = document.querySelector(
            '#classification-ruleset .rule-edit-row'
        );
        if (existingEditRow) {
            showToast('이미 편집 중인 규칙이 있습니다.', 'error');
            return;
        }
        // loadedClassificationRules에서 현재 데이터를 찾아 편집 모드로 렌더링
        const ruleToEdit = loadedClassificationRules.find(
            (r) => r.id === parseInt(ruleId)
        );
        renderClassificationRulesetTable(
            loadedClassificationRules,
            ruleToEdit.id
        );
    }

    // --- 삭제 버튼 클릭 ---
    else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('이 규칙을 정말 삭제하시겠습니까?')) return;
        await deleteClassificationRule(ruleId);
    }

    // --- 저장 버튼 클릭 ---
    else if (target.classList.contains('save-rule-btn')) {
        const priority = ruleRow.querySelector('.rule-priority-input').value;
        const description = ruleRow.querySelector(
            '.rule-description-input'
        ).value;
        const target_tag_id = ruleRow.querySelector('.rule-tag-select').value;
        const conditionsStr = ruleRow.querySelector(
            '.rule-conditions-input'
        ).value;

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
        const response = await fetch(
            `/connections/api/rules/classification/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(ruleData),
            }
        );

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
        const response = await fetch(
            `/connections/api/rules/classification/${currentProjectId}/${ruleId}/`,
            {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': csrftoken,
                },
            }
        );

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
        const response = await fetch(
            `/connections/api/rules/classification/${currentProjectId}/`
        );
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
async function applyClassificationRules(skipConfirmation = false) {
    // [변경] 파라미터 추가
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    // [변경] skipConfirmation이 false일 때만 확인 창을 띄우도록 수정
    if (
        !skipConfirmation &&
        !confirm(
            '정의된 모든 분류 할당 룰셋을 전체 객체에 적용하시겠습니까?\n기존에 할당된 분류는 유지되며, 규칙에 맞는 새로운 분류가 추가됩니다.'
        )
    ) {
        return;
    }

    console.log("[DEBUG] '룰셋 일괄적용' 시작. 서버에 API 요청을 보냅니다.");
    showToast('룰셋을 적용하고 있습니다... 잠시만 기다려주세요.', 'info', 5000);

    try {
        const response = await fetch(
            `/connections/api/rules/apply-classification/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrftoken,
                    'Content-Type': 'application/json',
                },
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || '룰셋 적용에 실패했습니다.');
        }

        showToast(result.message, 'success');
        console.log(
            '[DEBUG] 서버에서 룰셋 적용 성공. 결과 메시지:',
            result.message
        );

        console.log(
            '[DEBUG] Revit/Blender 재호출 없이, 서버에 최신 객체 데이터 재요청을 보냅니다.'
        );
        if (frontendSocket && frontendSocket.readyState === WebSocket.OPEN) {
            frontendSocket.send(
                JSON.stringify({
                    type: 'get_all_elements',
                    payload: { project_id: currentProjectId },
                })
            );
        } else {
            console.error(
                '[ERROR] 웹소켓이 연결되어 있지 않아 최신 데이터를 가져올 수 없습니다.'
            );
            showToast('웹소켓 연결 오류. 페이지를 새로고침해주세요.', 'error');
        }
    } catch (error) {
        console.error('[ERROR] 룰셋 적용 중 오류 발생:', error);
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
        const response = await fetch(
            `/connections/api/rules/property-mapping/${currentProjectId}/`
        );
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
    const container = document.getElementById(
        'mapping-ruleset-table-container'
    );
    const tags = Array.from(
        document.getElementById('tag-assign-select').options
    )
        .filter((opt) => opt.value)
        .map((opt) => ({ id: opt.value, name: opt.text }));

    if (!rules.length && editId !== 'new') {
        container.innerHTML =
            '<p>정의된 속성 맵핑 규칙이 없습니다. "새 규칙 추가" 버튼으로 시작하세요.</p>';
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
        const isEditMode =
            editId &&
            (editId === 'new' ? rule.id === 'new' : rule.id === editId);
        const row = document.createElement('tr');
        row.dataset.ruleId = rule.id;

        if (isEditMode) {
            row.classList.add('rule-edit-row');
            const tagOptions = tags
                .map(
                    (t) =>
                        `<option value="${t.id}" ${
                            rule.target_tag_id === t.id ? 'selected' : ''
                        }>${t.name}</option>`
                )
                .join('');
            row.innerHTML = `
                <td><input type="text" class="rule-name-input" value="${
                    rule.name || '새 규칙'
                }" placeholder="규칙 이름"></td>
                <td><input type="text" class="rule-description-input" value="${
                    rule.description || ''
                }" placeholder="규칙 설명"></td>
                <td><select class="rule-tag-select"><option value="">-- 분류 선택 --</option>${tagOptions}</select></td>
                <td><textarea class="rule-conditions-input" rows="3" placeholder='[{"parameter":"Category", "operator":"equals", "value":"벽"}]'>${JSON.stringify(
                    rule.conditions || [],
                    null,
                    2
                )}</textarea></td>
                <td><textarea class="rule-mapping-input" rows="3" placeholder='{"체적": "{Volume}", "면적": "{Area} * 2"}'>${JSON.stringify(
                    rule.mapping_script || {},
                    null,
                    2
                )}</textarea></td>
                <td><input type="number" class="rule-priority-input" value="${
                    rule.priority || 0
                }"></td>
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
                <td><pre>${JSON.stringify(
                    rule.mapping_script,
                    null,
                    2
                )}</pre></td>
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
        const newRule = {
            id: 'new',
            conditions: [],
            mapping_script: {},
            priority: 0,
        };
        tbody.appendChild(renderRow(newRule));
    }

    rules.forEach((rule) => {
        // 편집 중인 행은 다시 그리지 않도록 필터링
        if (rule.id !== editId) {
            tbody.appendChild(renderRow(rule));
        } else {
            tbody.appendChild(renderRow(rules.find((r) => r.id === editId)));
        }
    });

    // 편집 모드일 때, 새 규칙 행이 아닌 경우 기존 규칙 목록을 다시 그림
    if (editId && editId !== 'new') {
        const otherRules = rules.filter((r) => r.id !== editId);
        tbody.innerHTML = ''; // tbody 초기화
        rules.forEach((rule) => {
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
        if (
            document.querySelector(
                '#mapping-ruleset-table-container .rule-edit-row'
            )
        ) {
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
        const description = ruleRow.querySelector(
            '.rule-description-input'
        ).value;
        const target_tag_id = ruleRow.querySelector('.rule-tag-select').value;
        const conditionsStr = ruleRow.querySelector(
            '.rule-conditions-input'
        ).value;
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
            if (!Array.isArray(conditions))
                throw new Error('객체 조건이 배열 형식이 아닙니다.');
        } catch (e) {
            showToast(
                `객체 조건이 유효한 JSON 형식이 아닙니다: ${e.message}`,
                'error'
            );
            return;
        }
        try {
            mapping_script = JSON.parse(mappingStr || '{}');
            if (
                typeof mapping_script !== 'object' ||
                Array.isArray(mapping_script)
            ) {
                throw new Error(
                    '맵핑 스크립트가 객체(Object) 형식이 아닙니다.'
                );
            }
        } catch (e) {
            showToast(
                `맵핑 스크립트가 유효한 JSON 형식이 아닙니다: ${e.message}`,
                'error'
            );
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
        const response = await fetch(
            `/connections/api/rules/property-mapping/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(ruleData),
            }
        );

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
        const response = await fetch(
            `/connections/api/rules/property-mapping/${currentProjectId}/${ruleId}/`,
            {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );

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
        const response = await fetch(
            `/connections/api/quantity-members/${currentProjectId}/`
        );
        if (!response.ok)
            throw new Error('수량산출부재 목록을 불러오는데 실패했습니다.');

        loadedQuantityMembers = await response.json();
        renderActiveQmView(); // ▼▼▼ [수정] 이 부분을 수정합니다. ▼▼▼

        populateQmFieldSelection(loadedQuantityMembers);
    } catch (error) {
        console.error('Error loading quantity members:', error);
        showToast(error.message, 'error');
    }
}

async function createManualQuantityMember() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/quantity-members/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadQuantityMembers(); // 목록 새로고침
    } catch (error) {
        console.error('Error creating manual quantity member:', error);
        showToast(error.message, 'error');
    }
}

// main.js 파일 가장 하단에 추가

// ▼▼▼ [추가] 수량산출부재 자동 생성 관련 함수 ▼▼▼
async function createAutoQuantityMembers(skipConfirmation = false) {
    // [변경] 파라미터 추가
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    // [변경] skipConfirmation이 false일 때만 확인 창을 띄우도록 수정
    if (
        !skipConfirmation &&
        !confirm(
            '정말로 모든 수량산출부재를 자동으로 다시 생성하시겠습니까?\n이 작업은 기존에 있던 모든 수량산출부재를 삭제하고, 현재의 수량산출분류를 기준으로 새로 생성합니다.'
        )
    ) {
        return;
    }

    showToast('수량산출부재를 자동으로 생성하고 있습니다...', 'info', 5000);

    try {
        const response = await fetch(
            `/connections/api/quantity-members/auto-create/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadQuantityMembers(); // 성공 후 목록 새로고침
    } catch (error) {
        console.error('Error creating auto quantity members:', error);
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

    newLevelDiv
        .querySelector('.remove-group-level-btn')
        .addEventListener('click', function () {
            this.parentElement.remove();
            renderActiveQmView(); // ▼▼▼ [수정] 이 부분을 수정합니다. ▼▼▼
        });
}
/**
 * '수량산출부재' 테이블의 컬럼 필터 입력을 처리합니다.
 */
function handleQmColumnFilter(event) {
    if (
        event.target.classList.contains('column-filter') &&
        event.key === 'Enter'
    ) {
        qmColumnFilters[event.target.dataset.field] =
            event.target.value.toLowerCase();
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
    const allVisibleRows = Array.from(
        tableContainer.querySelectorAll('tr[data-id]')
    );
    const clickedRowIndex = allVisibleRows.findIndex(
        (r) => r.dataset.id === clickedRow.dataset.id
    );
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
    const isEditRow = document.querySelector(
        '#qm-table-container .qm-edit-row'
    );

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
        renderQmSpacesList(); // <<< [추가] 이 함수 호출을 추가합니다.

        return;
    }

    if (!memberId) return;

    // --- 수정 버튼 ---
    if (target.classList.contains('edit-qm-btn')) {
        if (activeQmView !== 'quantity-member-view') {
            showToast(
                "'수량산출부재 뷰'에서만 항목을 수정할 수 있습니다.",
                'error'
            );
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
        const propRows = document.querySelectorAll(
            '#qm-properties-container .property-edit-row'
        );
        let hasError = false;

        propRows.forEach((row) => {
            const keyInput = row.querySelector('.prop-key-input');
            const valueInput = row.querySelector('.prop-value-input');
            const key = keyInput.value.trim();
            if (key && properties.hasOwnProperty(key)) {
                showToast(`속성 이름 "${key}"이(가) 중복되었습니다.`, 'error');
                hasError = true;
            }
            if (key) properties[key] = valueInput.value;
        });
        if (hasError) return;

        let mapping_expression, costCodeExpressions;
        try {
            const rawMappingExpr = actionRow.querySelector(
                '.qm-mapping-expression-input'
            ).value;
            mapping_expression =
                rawMappingExpr.trim() === '' ? {} : JSON.parse(rawMappingExpr);
        } catch (e) {
            showToast('맵핑식(JSON) 형식이 올바르지 않습니다.', 'error');
            return;
        }

        const markExpression = actionRow.querySelector(
            '.qm-mark-expr-input'
        ).value;

        try {
            const rawCcExpr =
                actionRow.querySelector('.qm-cc-expr-input').value;
            costCodeExpressions =
                rawCcExpr.trim() === '' ? [] : JSON.parse(rawCcExpr);
            if (!Array.isArray(costCodeExpressions))
                throw new Error(
                    '개별 공사코드 룰은 반드시 배열(list) 형식이어야 합니다.'
                );
        } catch (e) {
            showToast(
                e.message ||
                    '개별 공사코드 룰(JSON)이 올바른 목록 형식이 아닙니다.',
                'error'
            );
            return;
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
            const response = await fetch(
                `/connections/api/quantity-members/${currentProjectId}/${memberId}/`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrftoken,
                    },
                    body: JSON.stringify(memberData),
                }
            );

            const result = await response.json();
            if (!response.ok)
                throw new Error(
                    result.message || `저장에 실패했습니다: ${response.status}`
                );
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
            showToast(
                "'수량산출부재 뷰'에서만 항목을 삭제할 수 있습니다.",
                'error'
            );
            return;
        }
        if (confirm('이 수량산출부재를 정말 삭제하시겠습니까?')) {
            try {
                const response = await fetch(
                    `/connections/api/quantity-members/${currentProjectId}/${memberId}/`,
                    {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': csrftoken },
                    }
                );
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
        const tableBody = document.querySelector(
            '#qm-properties-container .properties-table tbody'
        );
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
        const response = await fetch(
            `/connections/api/cost-codes/${currentProjectId}/`
        );
        if (!response.ok)
            throw new Error('공사코드 목록을 불러오는데 실패했습니다.');

        loadedCostCodes = await response.json();
        renderCostCodesTable(loadedCostCodes);

        // ▼▼▼ [추가] 수량산출부재 탭의 공사코드 드롭다운도 채웁니다. ▼▼▼
        const select = document.getElementById('qm-cost-code-assign-select');
        select.innerHTML = '<option value="">-- 공사코드 선택 --</option>'; // 초기화
        loadedCostCodes.forEach((code) => {
            const option = document.createElement('option');
            option.value = code.id;
            option.textContent = `${code.code} - ${code.name}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading cost codes:', error);
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
        container.innerHTML =
            '<p>정의된 공사코드가 없습니다. "새 공사코드 추가" 버튼으로 시작하세요.</p>';
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
                <!-- [ADD] 새 컬럼 2개 -->
                <th>AI개략견적</th>
                <th>상세견적</th>
                <th>작업</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    // 개별 행 렌더
    const renderRow = (code) => {
        const isEditMode =
            editId &&
            (editId === 'new' ? code.id === 'new' : code.id === editId);

        const row = document.createElement('tr');
        row.dataset.codeId = code.id;

        if (isEditMode) {
            row.classList.add('rule-edit-row');
            row.innerHTML = `
                <td><input type="text" class="cost-code-input" value="${
                    code.code || ''
                }" placeholder="C-001"></td>
                <td><input type="text" class="cost-name-input" value="${
                    code.name || ''
                }" placeholder="품명"></td>
                <td><input type="text" class="cost-spec-input" value="${
                    code.spec || ''
                }" placeholder="규격"></td>
                <td><input type="text" class="cost-unit-input" value="${
                    code.unit || ''
                }" placeholder="단위"></td>
                <td><input type="text" class="cost-category-input" value="${
                    code.category || ''
                }" placeholder="카테고리"></td>
                <td><input type="text" class="cost-description-input" value="${
                    code.description || ''
                }" placeholder="설명"></td>
                <!-- [ADD] 편집모드 체크박스 2개 -->
                <td><input type="checkbox" class="cost-ai-sd-input" ${
                    code.ai_sd_enabled ? 'checked' : ''
                }></td>
                <td><input type="checkbox" class="cost-dd-input" ${
                    code.dd_enabled ? 'checked' : ''
                }></td>
                <td>
                    <button class="save-cost-code-btn">💾 저장</button>
                    <button class="cancel-cost-code-btn">↩ 취소</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${code.code}</td>
                <td>${code.name}</td>
                <td>${code.spec || ''}</td>
                <td>${code.unit || ''}</td>
                <td>${code.category || ''}</td>
                <td>${code.description || ''}</td>
                <!-- [ADD] 보기모드 표시 2개 -->
                <td>${code.ai_sd_enabled ? '✅' : '—'}</td>
                <td>${code.dd_enabled ? '✅' : '—'}</td>
                <td>
                    <button class="edit-cost-code-btn">✏️ 수정</button>
                    <button class="delete-cost-code-btn">🗑️ 삭제</button>
                </td>
            `;
        }
        return row;
    };

    // 새 항목 편집행
    if (editId === 'new') {
        tbody.appendChild(
            renderRow({ id: 'new', ai_sd_enabled: false, dd_enabled: false })
        );
    }

    // 목록 행
    codes.forEach((code) => {
        tbody.appendChild(
            renderRow(
                code.id === editId ? codes.find((c) => c.id === editId) : code
            )
        );
    });

    container.innerHTML = '';
    container.appendChild(table);
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
    const selectedMembers = loadedQuantityMembers.filter((m) =>
        selectedQmIds.has(m.id)
    );
    if (selectedMembers.length === 0) {
        container.innerHTML = '선택된 부재를 찾을 수 없습니다.';
        return;
    }

    const firstMemberCodes = new Set(selectedMembers[0].cost_code_ids);
    const commonCodeIds = [...firstMemberCodes].filter((codeId) =>
        selectedMembers.every((member) => member.cost_code_ids.includes(codeId))
    );

    if (commonCodeIds.length === 0) {
        container.innerHTML =
            '선택된 부재들에 공통으로 할당된 공사코드가 없습니다.';
        if (selectedQmIds.size > 1) {
            container.innerHTML +=
                '<br><small>(개별 부재에는 할당되어 있을 수 있습니다)</small>';
        }
        return;
    }

    container.innerHTML =
        '<ul>' +
        commonCodeIds
            .map((codeId) => {
                const costCode = loadedCostCodes.find((c) => c.id === codeId);
                return costCode
                    ? `<li>${costCode.code} - ${costCode.name}</li>`
                    : `<li>알 수 없는 코드: ${codeId}</li>`;
            })
            .join('') +
        '</ul>';
}

/**
 * 선택된 부재들에 공사코드를 할당합니다.
 */
async function assignCostCodeToQm() {
    const costCodeId = document.getElementById(
        'qm-cost-code-assign-select'
    ).value;
    if (!costCodeId) {
        showToast('적용할 공사코드를 선택하세요.', 'error');
        return;
    }
    if (selectedQmIds.size === 0) {
        showToast('공사코드를 적용할 부재를 테이블에서 선택하세요.', 'error');
        return;
    }

    try {
        const response = await fetch(
            `/connections/api/quantity-members/manage-cost-codes/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    member_ids: Array.from(selectedQmIds),
                    cost_code_id: costCodeId,
                    action: 'assign',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 업데이트
        loadedQuantityMembers.forEach((member) => {
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
    if (
        !confirm(
            `${selectedQmIds.size}개 부재의 모든 공사코드를 제거하시겠습니까?`
        )
    ) {
        return;
    }

    try {
        const response = await fetch(
            `/connections/api/quantity-members/manage-cost-codes/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    member_ids: Array.from(selectedQmIds),
                    action: 'clear',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 업데이트
        loadedQuantityMembers.forEach((member) => {
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
        const response = await fetch(
            `/connections/api/member-marks/${currentProjectId}/`
        );
        if (!response.ok)
            throw new Error('일람부호 목록을 불러오는데 실패했습니다.');

        loadedMemberMarks = await response.json();
        renderMemberMarksTable(loadedMemberMarks);

        // 수량산출부재 탭의 일람부호 드롭다운도 채웁니다.
        const select = document.getElementById('qm-member-mark-assign-select');
        select.innerHTML = '<option value="">-- 일람부호 선택 --</option>'; // 초기화
        loadedMemberMarks.forEach((mark) => {
            const option = document.createElement('option');
            option.value = mark.id;
            option.textContent = mark.mark;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading member marks:', error);
        showToast(error.message, 'error');
    }
}

/**
 * 일람부호 데이터를 기반으로 테이블을 렌더링합니다.
 */
function renderMemberMarksTable(marks, editId = null) {
    const container = document.getElementById('member-marks-table-container');
    if (!marks.length && editId !== 'new') {
        container.innerHTML =
            '<p>정의된 일람부호가 없습니다. "새 일람부호 추가" 버튼으로 시작하세요.</p>';
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
        const isEditMode =
            editId &&
            (editId === 'new' ? mark.id === 'new' : mark.id === editId);
        const row = document.createElement('tr');
        row.dataset.markId = mark.id;

        if (isEditMode) {
            row.classList.add('rule-edit-row');
            row.innerHTML = `
                <td><input type="text" class="mark-mark-input" value="${
                    mark.mark || ''
                }" placeholder="C1"></td>
                <td><input type="text" class="mark-description-input" value="${
                    mark.description || ''
                }"></td>
                <td><textarea class="mark-properties-input" rows="3" placeholder='{"철근": "HD13", "간격": 200}'>${JSON.stringify(
                    mark.properties || {},
                    null,
                    2
                )}</textarea></td>
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
    marks.forEach((mark) => {
        tbody.appendChild(
            renderRow(
                mark.id === editId ? marks.find((c) => c.id === editId) : mark
            )
        );
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
        if (
            document.querySelector(
                '#member-marks-table-container .rule-edit-row'
            )
        ) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error');
            return;
        }
        renderMemberMarksTable(loadedMemberMarks, markId);
    } else if (target.classList.contains('delete-member-mark-btn')) {
        if (!confirm('이 일람부호를 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(
                `/connections/api/member-marks/${currentProjectId}/${markId}/`,
                {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': csrftoken },
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadMemberMarks();
        } catch (error) {
            showToast(error.message, 'error');
        }
    } else if (target.classList.contains('save-member-mark-btn')) {
        let properties;
        try {
            properties = JSON.parse(
                actionRow.querySelector('.mark-properties-input').value || '{}'
            );
            if (typeof properties !== 'object' || Array.isArray(properties))
                throw new Error();
        } catch (e) {
            showToast('속성이 유효한 JSON 객체 형식이 아닙니다.', 'error');
            return;
        }
        const markData = {
            mark: actionRow.querySelector('.mark-mark-input').value,
            description: actionRow.querySelector('.mark-description-input')
                .value,
            properties: properties,
        };
        if (!markData.mark) {
            showToast('일람부호는 반드시 입력해야 합니다.', 'error');
            return;
        }

        const isNew = markId === 'new';
        const url = isNew
            ? `/connections/api/member-marks/${currentProjectId}/`
            : `/connections/api/member-marks/${currentProjectId}/${markId}/`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(markData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadMemberMarks();
        } catch (error) {
            showToast(error.message, 'error');
        }
    } else if (target.classList.contains('cancel-member-mark-btn')) {
        renderMemberMarksTable(loadedMemberMarks);
    }
}

/**
 * 선택된 수량산출부재에 할당된 일람부호 목록을 화면 우측에 표시합니다.
 */
function renderQmMemberMarksList() {
    const container = document.getElementById('qm-member-marks-list');
    if (selectedQmIds.size === 0) {
        container.innerHTML = '일람부호를 보려면 부재를 선택하세요.';
        return;
    }
    const selectedMembers = loadedQuantityMembers.filter((m) =>
        selectedQmIds.has(m.id)
    );
    if (selectedMembers.length === 0) {
        container.innerHTML = '선택된 부재를 찾을 수 없습니다.';
        return;
    }

    const firstMemberMarks = new Set(selectedMembers[0].member_mark_ids);
    const commonMarkIds = [...firstMemberMarks].filter((markId) =>
        selectedMembers.every((member) =>
            member.member_mark_ids.includes(markId)
        )
    );

    if (commonMarkIds.length === 0) {
        container.innerHTML =
            '선택된 부재들에 공통으로 할당된 일람부호가 없습니다.';
        if (selectedQmIds.size > 1) {
            container.innerHTML +=
                '<br><small>(개별 부재에는 할당되어 있을 수 있습니다)</small>';
        }
        return;
    }
    container.innerHTML =
        '<ul>' +
        commonMarkIds
            .map((markId) => {
                const mark = loadedMemberMarks.find((m) => m.id === markId);
                return mark
                    ? `<li>${mark.mark}</li>`
                    : `<li>알 수 없는 부호: ${markId}</li>`;
            })
            .join('') +
        '</ul>';
}
/**
 * 선택된 부재들에 일람부호를 할당합니다.
 */
async function assignMemberMarkToQm() {
    const markId = document.getElementById(
        'qm-member-mark-assign-select'
    ).value;
    if (!markId) {
        showToast('적용할 일람부호를 선택하세요.', 'error');
        return;
    }
    if (selectedQmIds.size === 0) {
        showToast('일람부호를 적용할 부재를 선택하세요.', 'error');
        return;
    }

    try {
        const response = await fetch(
            `/connections/api/quantity-members/manage-member-marks/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    member_ids: Array.from(selectedQmIds),
                    mark_id: markId,
                    action: 'assign',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 즉시 업데이트
        loadedQuantityMembers.forEach((member) => {
            if (selectedQmIds.has(member.id)) {
                member.member_mark_id = markId; // [수정] 단일 ID로 설정
            }
        });
        renderQmMemberMarkDetails(); // [수정] 화면 새로고침
    } catch (error) {
        showToast(error.message, 'error');
    }
}
/**
 * 선택된 부재들에서 일람부호를 제거합니다.
 */
async function clearMemberMarksFromQm() {
    if (selectedQmIds.size === 0) {
        showToast('일람부호를 제거할 부재를 선택하세요.', 'error');
        return;
    }
    if (!confirm(`${selectedQmIds.size}개 부재의 일람부호를 제거하시겠습니까?`))
        return;

    try {
        const response = await fetch(
            `/connections/api/quantity-members/manage-member-marks/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    member_ids: Array.from(selectedQmIds),
                    action: 'clear',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        // 로컬 데이터 즉시 업데이트
        loadedQuantityMembers.forEach((member) => {
            if (selectedQmIds.has(member.id)) {
                member.member_mark_id = null; // [수정] null로 설정
            }
        });
        renderQmMemberMarkDetails(); // [수정] 화면 새로고침
    } catch (error) {
        showToast(error.message, 'error');
    }
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
        const response = await fetch(
            `/connections/api/cost-items/${currentProjectId}/`
        );
        if (!response.ok)
            throw new Error('산출항목 목록을 불러오는데 실패했습니다.');

        loadedCostItems = await response.json();
        renderCostItemsTable(loadedCostItems);

        // 이 부분이 그룹핑 목록을 채우는 핵심 코드입니다.
        populateCiFieldSelection(loadedCostItems);
    } catch (error) {
        // 'ca'를 'catch (error)'로 올바르게 수정했습니다.
        console.error('Error loading cost items:', error);
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
        const response = await fetch(
            `/connections/api/cost-items/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({ cost_code_id: selectedCostCodeId }),
            }
        );

        const result = await response.json();
        if (!response.ok)
            throw new Error(result.message || '산출항목 생성에 실패했습니다.');

        showToast(result.message, 'success');
        await loadCostItems(); // 성공 후 목록 새로고침
    } catch (error) {
        // 사용자가 모달을 그냥 닫거나(error=null), 실제 에러가 발생한 경우를 처리합니다.
        if (error) {
            console.error('Error creating manual cost item:', error);
            showToast(error.message, 'error');
        } else {
            showToast('산출항목 생성이 취소되었습니다.', 'info');
        }
    }
}
// ▲▲▲ [교체] 여기까지 입니다. ▲▲▲

async function createAutoCostItems(skipConfirmation = false) {
    // [변경] 파라미터 추가
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    // [변경] skipConfirmation이 false일 때만 확인 창을 띄우도록 수정
    if (
        !skipConfirmation &&
        !confirm(
            '정말로 모든 산출항목을 자동으로 다시 생성하시겠습니까?\n이 작업은 기존 자동생성된 항목을 삭제하고, 현재의 공사코드 룰셋 기준으로 새로 생성합니다.'
        )
    ) {
        return;
    }

    showToast('산출항목을 자동으로 생성하고 있습니다...', 'info', 5000);
    try {
        const response = await fetch(
            `/connections/api/cost-items/auto-create/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
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
    const allVisibleRows = Array.from(
        tableContainer.querySelectorAll('tr[data-id]')
    );
    const clickedRowIndex = allVisibleRows.findIndex(
        (r) => r.dataset.id === clickedRow.dataset.id
    );
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
/**
 * '산출항목' 테이블의 모든 동작(수정, 삭제, 저장, 취소, 행 선택, 그룹 토글)을 처리합니다.
 * @param {Event} event
 */
async function handleCostItemActions(event) {
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow) return;

    // 그룹 헤더 클릭 시 토글
    if (actionRow.classList.contains('group-header')) {
        const groupPath = actionRow.dataset.groupPath;
        if (groupPath) {
            ciCollapsedGroups[groupPath] = !ciCollapsedGroups[groupPath];
            renderCostItemsTable(
                loadedCostItems,
                document.querySelector('#ci-table-container .ci-edit-row')
                    ?.dataset.id
            );
        }
        return;
    }

    const itemId = actionRow.dataset.id;
    const isEditRow = document.querySelector(
        '#ci-table-container .ci-edit-row'
    );

    // 버튼이 아닌 행의 데이터 영역 클릭 시 선택 로직 실행
    if (!target.closest('button') && itemId) {
        handleCiRowSelection(event, actionRow);
        renderCostItemsTable(loadedCostItems, isEditRow?.dataset.id);
        renderCiLinkedMemberPropertiesTable();
        return;
    }

    if (!itemId) return;

    // '수정' 버튼 클릭
    if (target.classList.contains('edit-ci-btn')) {
        if (isEditRow) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error');
            return;
        }
        renderCostItemsTable(loadedCostItems, itemId);
    }
    // '취소' 버튼 클릭
    else if (target.classList.contains('cancel-ci-btn')) {
        renderCostItemsTable(loadedCostItems);
        renderCiLinkedMemberPropertiesTable();
    }
    // '저장' 버튼 클릭
    else if (target.classList.contains('save-ci-btn')) {
        let mapping_expression;
        try {
            const rawMappingExpr = actionRow.querySelector(
                '.ci-mapping-expression-input'
            ).value;
            mapping_expression =
                rawMappingExpr.trim() === '' ? {} : JSON.parse(rawMappingExpr);
        } catch (e) {
            showToast('수량 맵핑식(JSON) 형식이 올바르지 않습니다.', 'error');
            return;
        }

        const itemData = {
            quantity: parseFloat(
                actionRow.querySelector('.ci-quantity-input').value
            ),
            description: actionRow.querySelector('.ci-description-input').value,
            quantity_mapping_expression: mapping_expression,
        };

        try {
            const response = await fetch(
                `/connections/api/cost-items/${currentProjectId}/${itemId}/`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrftoken,
                    },
                    body: JSON.stringify(itemData),
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            showToast(result.message, 'success');
            await loadCostItems(); // 전체 데이터 다시 로드하여 갱신
            renderCiLinkedMemberPropertiesTable();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
    // '삭제' 버튼 클릭
    else if (target.classList.contains('delete-ci-btn')) {
        if (!confirm('이 산출항목을 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(
                `/connections/api/cost-items/${currentProjectId}/${itemId}/`,
                {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': csrftoken },
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            showToast(result.message, 'success');
            selectedCiIds.delete(itemId);
            await loadCostItems(); // 전체 데이터 다시 로드
            renderCiLinkedMemberPropertiesTable();
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
    newLevelDiv
        .querySelector('.remove-group-level-btn')
        .addEventListener('click', function () {
            this.parentElement.remove();
            renderCostItemsTable(loadedCostItems);
        });
}

function handleCiColumnFilter(event) {
    if (
        event.target.classList.contains('column-filter') &&
        event.key === 'Enter'
    ) {
        ciColumnFilters[event.target.dataset.field] =
            event.target.value.toLowerCase();
        renderCostItemsTable(loadedCostItems);
    }
}

// =====================================================================
// 공사코드 룰셋(CostCodeRule) 관리 관련 함수들
// =====================================================================

async function loadCostCodeRules() {
    if (!currentProjectId) {
        renderCostCodeRulesetTable([]);
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/rules/cost-code/${currentProjectId}/`
        );
        if (!response.ok)
            throw new Error('공사코드 룰셋을 불러오는데 실패했습니다.');
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
        if (
            document.querySelector(
                '#costcode-ruleset-table-container .rule-edit-row'
            )
        ) {
            showToast('이미 편집 중인 규칙이 있습니다.', 'error');
            return;
        }
        renderCostCodeRulesetTable(loadedCostCodeRules, ruleId);
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderCostCodeRulesetTable(loadedCostCodeRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('이 규칙을 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(
                `/connections/api/rules/cost-code/${currentProjectId}/${ruleId}/`,
                {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': csrftoken },
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadCostCodeRules();
        } catch (error) {
            showToast(error.message, 'error');
        }
    } else if (target.classList.contains('save-rule-btn')) {
        let conditions, quantity_mapping_script;
        try {
            conditions = JSON.parse(
                ruleRow.querySelector('.rule-conditions-input').value || '[]'
            );
        } catch (e) {
            showToast('적용 조건이 유효한 JSON 형식이 아닙니다.', 'error');
            return;
        }
        try {
            quantity_mapping_script = JSON.parse(
                ruleRow.querySelector('.rule-quantity-mapping-input').value ||
                    '{}'
            );
        } catch (e) {
            showToast('수량 계산식이 유효한 JSON 형식이 아닙니다.', 'error');
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            priority:
                parseInt(ruleRow.querySelector('.rule-priority-input').value) ||
                0,
            name: ruleRow.querySelector('.rule-name-input').value,
            target_cost_code_id: ruleRow.querySelector('.rule-cost-code-select')
                .value,
            conditions: conditions,
            quantity_mapping_script: quantity_mapping_script,
        };

        if (!ruleData.target_cost_code_id) {
            showToast('대상 공사코드를 선택하세요.', 'error');
            return;
        }
        if (!ruleData.name) {
            showToast('규칙 이름을 입력하세요.', 'error');
            return;
        }

        try {
            const response = await fetch(
                `/connections/api/rules/cost-code/${currentProjectId}/`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrftoken,
                    },
                    body: JSON.stringify(ruleData),
                }
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            showToast(result.message, 'success');
            await loadCostCodeRules();
        } catch (error) {
            showToast(error.message, 'error');
        }
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
    document
        .querySelectorAll('#quantity-members .view-tab-button.active')
        .forEach((btn) => {
            btn.classList.remove('active');
        });

    // 클릭된 버튼에 active 클래스 추가
    clickedButton.classList.add('active');

    // 전역 상태 업데이트 및 테이블 다시 그리기
    activeQmView = clickedButton.dataset.view;
    qmCollapsedGroups = {}; // 뷰가 바뀌면 그룹 접힘 상태 초기화
    qmColumnFilters = {}; // 뷰가 바뀌면 컬럼 필터 초기화
    renderActiveQmView();
}
// ▲▲▲ 여기까지 입니다. ▲▲▲

// ▼▼▼ [추가] 공사코드 선택 모달을 제어하는 함수 블록 ▼▼▼
function openCostCodeSelectionModal() {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('cost-code-selection-modal');
        const searchInput = document.getElementById('cost-code-search-input');
        const listContainer = document.getElementById(
            'cost-code-list-container'
        );
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const closeBtn = modal.querySelector('.modal-close-btn');

        let selectedCostCodeId = null;

        // 목록 렌더링 함수
        function renderList(filterText = '') {
            listContainer.innerHTML = '';
            const filteredCodes = loadedCostCodes.filter(
                (code) =>
                    code.code.toLowerCase().includes(filterText) ||
                    code.name.toLowerCase().includes(filterText)
            );

            if (filteredCodes.length === 0) {
                listContainer.innerHTML =
                    '<div class="modal-list-item">검색 결과가 없습니다.</div>';
                return;
            }

            filteredCodes.forEach((code) => {
                const item = document.createElement('div');
                item.className = 'modal-list-item';
                item.dataset.id = code.id;
                item.innerHTML = `<span class="item-code">${code.code}</span> <span class="item-name">${code.name}</span>`;

                item.addEventListener('click', () => {
                    // 기존 선택 해제
                    const currentSelected =
                        listContainer.querySelector('.selected');
                    if (currentSelected)
                        currentSelected.classList.remove('selected');

                    // 새 항목 선택
                    item.classList.add('selected');
                    selectedCostCodeId = code.id;
                    confirmBtn.disabled = false;
                });

                listContainer.appendChild(item);
            });
        }

        // 검색 이벤트 리스너
        searchInput.addEventListener('input', () =>
            renderList(searchInput.value.toLowerCase())
        );

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
    if (!currentProjectId) {
        renderMemberMarkAssignmentRulesetTable([]);
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/rules/member-mark-assignment/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('일람부호 할당 룰셋 로딩 실패');
        loadedMemberMarkAssignmentRules = await response.json();
        renderMemberMarkAssignmentRulesetTable(loadedMemberMarkAssignmentRules);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleMemberMarkAssignmentRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        renderMemberMarkAssignmentRulesetTable(
            loadedMemberMarkAssignmentRules,
            ruleId
        );
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderMemberMarkAssignmentRulesetTable(loadedMemberMarkAssignmentRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('정말 이 규칙을 삭제하시겠습니까?')) return;
        const response = await fetch(
            `/connections/api/rules/member-mark-assignment/${currentProjectId}/${ruleId}/`,
            {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        if (response.ok) {
            showToast('규칙이 삭제되었습니다.', 'success');
            loadMemberMarkAssignmentRules();
        } else {
            showToast('삭제 실패', 'error');
        }
    } else if (target.classList.contains('save-rule-btn')) {
        let conditions;
        try {
            conditions = JSON.parse(
                ruleRow.querySelector('.rule-conditions-input').value || '[]'
            );
        } catch (e) {
            showToast('적용 조건이 유효한 JSON 형식이 아닙니다.', 'error');
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            name: ruleRow.querySelector('.rule-name-input').value,
            priority:
                parseInt(ruleRow.querySelector('.rule-priority-input').value) ||
                0,
            conditions: conditions,
            mark_expression: ruleRow.querySelector('.rule-expression-input')
                .value,
        };

        const response = await fetch(
            `/connections/api/rules/member-mark-assignment/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(ruleData),
            }
        );
        const result = await response.json();
        if (response.ok) {
            showToast(result.message, 'success');
            loadMemberMarkAssignmentRules();
        } else {
            showToast(result.message, 'error');
        }
    }
}

async function loadCostCodeAssignmentRules() {
    if (!currentProjectId) {
        renderCostCodeAssignmentRulesetTable([]);
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/rules/cost-code-assignment/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('공사코드 할당 룰셋 로딩 실패');
        loadedCostCodeAssignmentRules = await response.json();
        renderCostCodeAssignmentRulesetTable(loadedCostCodeAssignmentRules);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleCostCodeAssignmentRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        renderCostCodeAssignmentRulesetTable(
            loadedCostCodeAssignmentRules,
            ruleId
        );
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderCostCodeAssignmentRulesetTable(loadedCostCodeAssignmentRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('정말 이 규칙을 삭제하시겠습니까?')) return;
        const response = await fetch(
            `/connections/api/rules/cost-code-assignment/${currentProjectId}/${ruleId}/`,
            {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        if (response.ok) {
            showToast('규칙이 삭제되었습니다.', 'success');
            loadCostCodeAssignmentRules();
        } else {
            showToast('삭제 실패', 'error');
        }
    } else if (target.classList.contains('save-rule-btn')) {
        let conditions, expressions;
        try {
            conditions = JSON.parse(
                ruleRow.querySelector('.rule-conditions-input').value || '[]'
            );
        } catch (e) {
            showToast('적용 조건이 유효한 JSON 형식이 아닙니다.', 'error');
            return;
        }
        try {
            expressions = JSON.parse(
                ruleRow.querySelector('.rule-expression-input').value || '{}'
            );
        } catch (e) {
            showToast(
                'CostCode 표현식이 유효한 JSON 형식이 아닙니다.',
                'error'
            );
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            name: ruleRow.querySelector('.rule-name-input').value,
            priority:
                parseInt(ruleRow.querySelector('.rule-priority-input').value) ||
                0,
            conditions: conditions,
            cost_code_expressions: expressions,
        };

        const response = await fetch(
            `/connections/api/rules/cost-code-assignment/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(ruleData),
            }
        );
        const result = await response.json();
        if (response.ok) {
            showToast(result.message, 'success');
            loadCostCodeAssignmentRules();
        } else {
            showToast(result.message, 'error');
        }
    }
}
// 기존의 applyAssignmentRules 함수를 찾아서 아래 코드로 전체를 교체해주세요.

async function applyAssignmentRules(skipConfirmation = false) {
    // [변경] 파라미터 추가
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }

    // [변경] skipConfirmation이 false일 때만 확인 창을 띄우도록 수정
    if (
        !skipConfirmation &&
        !confirm(
            '정의된 모든 할당 룰셋(일람부호, 공사코드)을 전체 부재에 적용하시겠습니까?\n이 작업은 기존 할당 정보를 덮어쓰거나 추가할 수 있습니다.'
        )
    ) {
        return;
    }

    showToast('룰셋을 적용하고 있습니다. 잠시만 기다려주세요...', 'info', 5000);
    try {
        const response = await fetch(
            `/connections/api/quantity-members/apply-assignment-rules/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');

        await loadCostCodes();
        await loadMemberMarks();
        await loadQuantityMembers();

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
    detailsPanel
        .querySelectorAll('.detail-tab-button.active')
        .forEach((btn) => btn.classList.remove('active'));
    detailsPanel
        .querySelectorAll('.detail-tab-content.active')
        .forEach((content) => content.classList.remove('active'));

    // 클릭된 버튼과 그에 맞는 컨텐츠에 'active' 클래스 추가
    clickedButton.classList.add('active');
    const targetContent = detailsPanel.querySelector(
        `.detail-tab-content[data-tab="${targetTab}"]`
    );
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

// ▼▼▼ [추가] 파일의 맨 아래에 아래 이벤트 리스너와 함수들을 추가해주세요. ▼▼▼

// --- '집계' 탭 이벤트 리스너 ---

async function loadBoqGroupingFields() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    // ▼▼▼ [핵심 수정] 탭에 진입할 때마다 필드 목록을 새로 가져오도록 기존 캐싱 로직(if 문)을 삭제합니다. ▼▼▼
    console.log('[DEBUG] BOQ 탭의 그룹핑/표시 필드 목록을 서버에 요청합니다.');

    try {
        const response = await fetch(
            `/connections/api/boq/grouping-fields/${currentProjectId}/`
        );
        if (!response.ok) {
            throw new Error('그룹핑 필드 목록을 불러오는데 실패했습니다.');
        }

        availableBoqFields = await response.json();
        console.log(
            `[DEBUG] ${availableBoqFields.length}개의 사용 가능한 BOQ 필드를 수신했습니다.`,
            availableBoqFields
        );

        // 기존 UI 렌더링 로직은 그대로 유지합니다.
        renderBoqDisplayFieldControls(availableBoqFields);

        // 그룹핑 컨트롤 UI가 비어있을 때만 첫 번째 그룹핑 레벨을 추가합니다.
        if (document.querySelectorAll('.boq-group-level').length === 0) {
            addBoqGroupingLevel();
        } else {
            // 이미 그룹핑 컨트롤이 있다면, 필드 목록만 최신화합니다.
            const groupBySelects = document.querySelectorAll(
                '.boq-group-by-select'
            );
            let optionsHtml = availableBoqFields
                .map(
                    (field) =>
                        `<option value="${field.value}">${field.label}</option>`
                )
                .join('');

            groupBySelects.forEach((select) => {
                const selectedValue = select.value;
                select.innerHTML = optionsHtml;
                select.value = selectedValue; // 기존 선택값 유지
            });
            console.log(
                '[DEBUG] 기존 그룹핑 컨트롤의 필드 목록을 최신화했습니다.'
            );
        }
    } catch (error) {
        console.error('Error loading BOQ grouping fields:', error);
        showToast(error.message, 'error');
        availableBoqFields = []; // 에러 발생 시 목록 초기화
        renderBoqDisplayFieldControls([]);
    }
}

function addBoqGroupingLevel() {
    console.log("[DEBUG] '+ 그룹핑 추가' 버튼 클릭됨");
    const container = document.getElementById('boq-grouping-controls');
    const newIndex = container.children.length;

    if (availableBoqFields.length === 0) {
        showToast('그룹핑 필드 정보를 먼저 불러와야 합니다.', 'info');
        console.warn(
            '[DEBUG] availableBoqFields가 비어있어 그룹핑 레벨 추가 중단.'
        );
        return;
    }

    const newLevelDiv = document.createElement('div');
    newLevelDiv.className = 'boq-group-level';

    let optionsHtml = availableBoqFields
        .map(
            (field) => `<option value="${field.value}">${field.label}</option>`
        )
        .join('');

    newLevelDiv.innerHTML = `
        <label>${newIndex + 1}차:</label>
        <select class="boq-group-by-select">${optionsHtml}</select>
        <button class="remove-boq-group-level-btn" style="padding: 2px 6px; font-size: 12px;">-</button>
    `;
    container.appendChild(newLevelDiv);
    console.log(`[DEBUG] ${newIndex + 1}차 그룹핑 레벨 추가됨.`);

    newLevelDiv
        .querySelector('.remove-boq-group-level-btn')
        .addEventListener('click', function () {
            console.log('[DEBUG] 그룹핑 레벨 제거 버튼 클릭됨');
            this.parentElement.remove();
            container
                .querySelectorAll('.boq-group-level label')
                .forEach((label, index) => {
                    label.textContent = `${index + 1}차:`;
                });
            console.log('[DEBUG] 그룹핑 레벨 재정렬 완료.');
        });
}

async function generateBoqReport() {
    console.log("[DEBUG] '집계표 생성' 버튼 클릭됨 / 혹은 단가기준 변경됨");

    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        console.error('[DEBUG] 프로젝트가 선택되지 않아 중단됨.');
        return;
    }

    // --- [핵심 수정] 체크박스 상태 읽기를 함수 내부로 이동 ---
    // 상세견적(DD) 탭은 DD 활성 공사코드만 집계하도록 필터를 고정합니다.
    const filterAiChecked = false;
    const filterDdChecked = true;
    console.log(
        '[DEBUG] Detailed Estimation filter fixed to DD-only (AI=false, DD=true).'
    );
    // --- [핵심 수정] 여기까지 ---

    const groupBySelects = document.querySelectorAll('.boq-group-by-select');
    if (groupBySelects.length === 0 && activeTab === 'boq') {
        // activeTab 체크 추가
        showToast('하나 이상의 그룹핑 기준을 추가하세요.', 'error');
        console.error('[DEBUG] 그룹핑 기준이 없어 중단됨.');
        return;
    }

    const params = new URLSearchParams();
    groupBySelects.forEach((select) => params.append('group_by', select.value));
    console.log('[DEBUG] 그룹핑 기준:', params.getAll('group_by'));

    const displayByCheckboxes = document.querySelectorAll(
        '.boq-display-field-cb:checked'
    );
    displayByCheckboxes.forEach((cb) => params.append('display_by', cb.value));
    console.log('[DEBUG] 표시 필드:', params.getAll('display_by'));

    params.append('filter_ai', filterAiChecked); // 이미 함수 내에서 정의됨
    params.append('filter_dd', filterDdChecked); // 이미 함수 내에서 정의됨

    if (boqFilteredRawElementIds.size > 0) {
        boqFilteredRawElementIds.forEach((id) =>
            params.append('raw_element_ids', id)
        );
        console.log(
            `[DEBUG] Revit 필터링 ID ${boqFilteredRawElementIds.size}개 적용됨.`
        );
    }

    const tableContainer = document.getElementById('boq-table-container');
    tableContainer.innerHTML =
        '<p style="padding: 20px;">집계 데이터를 생성 중입니다...</p>';
    showToast('집계표 생성 중...', 'info');
    console.log(
        `[DEBUG] 서버에 집계표 데이터 요청 시작... /connections/api/boq/report/${currentProjectId}/?${params.toString()}`
    );

    try {
        const response = await fetch(
            `/connections/api/boq/report/${currentProjectId}/?${params.toString()}`
        );
        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(
                errorResult.message || `서버 오류 (${response.status})`
            );
        }

        const data = await response.json();
        console.log('[DEBUG] 서버로부터 집계표 데이터 수신 완료:', data);
        if (data.items_detail) {
            // [수정] SD탭과 변수를 공유하지 않도록 DD탭 전용 변수에 저장 (필요 시 변수명 변경)
            // loadedCostItems = data.items_detail; // 기존 코드 주석 처리 또는 제거
            // console.log(`[DEBUG] loadedCostItems 업데이트 완료 (${loadedCostItems.length}개 항목).`); // 로그 수정

            // DD탭에서 사용할 상세 아이템 데이터 저장 (예: 별도 변수 사용)
            loadedDdCostItems = data.items_detail; // 예시: DD용 변수 사용
            console.log(
                `[DEBUG] loadedDdCostItems 업데이트 완료 (${loadedDdCostItems.length}개 항목).`
            );
        } else {
            console.warn("[WARN] API 응답에 'items_detail' 필드가 없습니다.");
            loadedDdCostItems = []; // DD용 변수 초기화
        }
        loadedUnitPriceTypesForBoq = data.unit_price_types || [];
        console.log(
            `[DEBUG] ${loadedUnitPriceTypesForBoq.length}개의 단가 기준 목록 수신.`
        );

        // [추가] DD용 컬럼 상태 업데이트 (렌더링 전에 호출)
        updateDdBoqColumns();

        // [핵심 수정] renderBoqTable 호출 시 대상 컨테이너 ID 명시적 전달
        renderBoqTable(
            data.report,
            data.summary,
            loadedUnitPriceTypesForBoq,
            'boq-table-container'
        );
        setupBoqTableInteractions(); // DD 테이블 상호작용 설정 함수 호출 (setupSdBoqTableInteractions와 구분)
        console.log('[DEBUG] 집계표 렌더링 완료.');

        updateBoqDetailsPanel(null); // 하단 패널 초기화
    } catch (error) {
        console.error('[DEBUG] 집계표 생성 중 오류 발생:', error);
        tableContainer.innerHTML = `<p style="padding: 20px; color: red;">오류: ${error.message}</p>`;
        showToast(error.message, 'error');
    }
}

/**
 * 집계 테이블과 상세 정보 패널의 모든 상호작용을 위한 이벤트 리스너를 설정합니다.
 * (수정됨: 탭 클릭 리스너는 initializeBoqUI 함수로 이동)
 */
function setupBoqTableInteractions() {
    // 디버깅 로그 추가
    console.log('[DEBUG] Setting up BOQ table interactions...');
    const tableContainer = document.getElementById('boq-table-container');
    const table = tableContainer.querySelector('.boq-table');
    if (!table) {
        console.warn('[WARN] BOQ table element not found for interactions.'); // 디버깅
        return;
    }

    // --- 1. 메인 BOQ 테이블 상호작용 (열 이름 변경, 드래그앤드롭 등) ---
    const thead = table.querySelector('thead');
    if (thead && !thead.dataset.interactionsAttached) {
        // 중복 리스너 방지
        let draggedColumn = null;
        let startX, currentX;

        thead.addEventListener('dragstart', (e) => {
            draggedColumn = e.target.closest('th');
            if (!draggedColumn || !draggedColumn.draggable) return;
            startX = e.clientX;
            e.dataTransfer.effectAllowed = 'move';
            // Optional: Add a class for visual feedback
            draggedColumn.classList.add('dragging');
            console.log(
                `[DEBUG] Drag start: Column "${draggedColumn.dataset.columnId}"`
            ); // 디버깅
        });

        thead.addEventListener('dragend', (e) => {
            if (draggedColumn) {
                draggedColumn.classList.remove('dragging');
                draggedColumn = null;
                console.log('[DEBUG] Drag end'); // 디버깅
                // Remove visual cues from all headers
                thead.querySelectorAll('th').forEach((th) => {
                    th.classList.remove('drag-over-left', 'drag-over-right');
                });
            }
        });

        thead.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessary to allow drop
            const targetTh = e.target.closest('th');
            if (!targetTh || !draggedColumn || targetTh === draggedColumn)
                return;

            currentX = e.clientX;
            const rect = targetTh.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;

            // Remove previous visual cues
            thead.querySelectorAll('th').forEach((th) => {
                th.classList.remove('drag-over-left', 'drag-over-right');
            });

            // Add new visual cue based on cursor position
            if (currentX < midpoint) {
                targetTh.classList.add('drag-over-left');
            } else {
                targetTh.classList.add('drag-over-right');
            }
            e.dataTransfer.dropEffect = 'move';
        });

        thead.addEventListener('dragleave', (e) => {
            const targetTh = e.target.closest('th');
            if (targetTh) {
                targetTh.classList.remove('drag-over-left', 'drag-over-right');
            }
        });

        thead.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetTh = e.target.closest('th');
            if (!targetTh || !draggedColumn || targetTh === draggedColumn)
                return;

            targetTh.classList.remove('drag-over-left', 'drag-over-right');
            const rect = targetTh.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;

            console.log(
                `[DEBUG] Drop on column "${
                    targetTh.dataset.columnId
                }". Insert ${currentX < midpoint ? 'before' : 'after'}.`
            ); // 디버깅

            // Reorder the columns in the thead
            if (currentX < midpoint) {
                targetTh.parentNode.insertBefore(draggedColumn, targetTh);
            } else {
                targetTh.parentNode.insertBefore(
                    draggedColumn,
                    targetTh.nextSibling
                );
            }

            // Update the global column order based on the new DOM order
            currentBoqColumns = Array.from(thead.querySelectorAll('th')).map(
                (th) => {
                    const colId = th.dataset.columnId;
                    // Find the original column object to keep its properties
                    return (
                        currentBoqColumns.find((c) => c.id === colId) || {
                            id: colId,
                            label: colId,
                            isDynamic: true,
                        }
                    ); // Fallback
                }
            );
            console.log(
                '[DEBUG] currentBoqColumns updated based on drop:',
                currentBoqColumns
            ); // 디버깅

            // Re-render the table body with the new column order
            generateBoqReport(); // This will use the updated currentBoqColumns
            saveBoqColumnSettings(); // Save new column order
        });

        // Column name editing listener
        thead.addEventListener('click', (e) => {
            if (e.target.classList.contains('col-edit-btn')) {
                const th = e.target.closest('th');
                const colId = th.dataset.columnId;
                const currentAlias =
                    boqColumnAliases[colId] ||
                    currentBoqColumns.find((c) => c.id === colId)?.label ||
                    colId;
                const newAlias = prompt(
                    `'${currentAlias}' 열의 새 이름 입력:`,
                    currentAlias
                );

                if (newAlias && newAlias.trim() !== currentAlias) {
                    boqColumnAliases[colId] = newAlias.trim();
                    th.childNodes[0].nodeValue = `${newAlias.trim()} `; // Update header text (keep space for icon)
                    console.log(
                        `[DEBUG] Column alias updated for "${colId}": "${newAlias.trim()}"`
                    ); // 디버깅
                    saveBoqColumnSettings(); // Save new column alias
                    // No need to regenerate report, just update alias
                } else if (newAlias === '') {
                    // If user enters empty string, reset to default label
                    const defaultLabel =
                        currentBoqColumns.find((c) => c.id === colId)?.label ||
                        colId;
                    delete boqColumnAliases[colId];
                    th.childNodes[0].nodeValue = `${defaultLabel} `;
                    console.log(`[DEBUG] Column alias reset for "${colId}".`); // 디버깅
                    saveBoqColumnSettings(); // Save updated aliases
                }
            }
        });

        thead.dataset.interactionsAttached = 'true'; // Mark as attached
        console.log(
            '[DEBUG] BOQ table header interactions (drag/drop, edit) attached.'
        ); // 디버깅
    }

    // --- 2. 메인 BOQ 테이블 '행' 클릭 시 -> 중앙 하단 목록 업데이트 ---
    const tbody = table.querySelector('tbody');
    if (tbody && !tbody.dataset.rowClickListenerAttached) {
        // 중복 리스너 방지
        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr.boq-group-header');
            if (row && !e.target.matches('select, button, i')) {
                // 드롭다운, 버튼 클릭 시 행 선택 방지
                const currentSelected = table.querySelector(
                    'tr.selected-boq-row'
                );
                if (currentSelected)
                    currentSelected.classList.remove('selected-boq-row');
                row.classList.add('selected-boq-row');

                const itemIds = JSON.parse(row.dataset.itemIds || '[]');
                console.log(
                    `[DEBUG][Event] Main BOQ table row clicked. Item IDs: ${itemIds.length}`
                ); // 디버깅
                updateBoqDetailsPanel(itemIds); // 하단 CostItem 목록 및 상세 정보 업데이트 (★ 여기서 하단 테이블 그려짐)
            }
        });
        tbody.dataset.rowClickListenerAttached = 'true'; // 리스너 추가됨 표시
        console.log('[DEBUG] Main BOQ table row click listener attached.'); // 디버깅
    }

    // --- 3. 메인 BOQ 테이블 '단가기준' 드롭다운 변경 시 ---
    // (이 리스너는 tbody에 이미 위임되어 있음, 중복 추가 불필요)
    if (tbody && !tbody.dataset.unitPriceChangeListenerAttached) {
        // 중복 리스너 방지
        tbody.addEventListener('change', async (e) => {
            if (e.target.classList.contains('unit-price-type-select')) {
                const selectElement = e.target;
                const newTypeId = selectElement.value; // 선택된 새 UnitPriceType ID (빈 문자열 가능)
                const itemIdsToUpdate = JSON.parse(
                    selectElement.dataset.itemIds || '[]'
                );

                if (itemIdsToUpdate.length === 0) return;

                console.log(
                    `[DEBUG][Event] UnitPriceType changed for ${itemIdsToUpdate.length} items. New Type ID: ${newTypeId}`
                ); // 디버깅
                showToast('단가 기준을 업데이트 중입니다...', 'info');

                try {
                    const response = await fetch(
                        `/connections/api/boq/update-unit-price-type/${currentProjectId}/`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRFToken': csrftoken,
                            },
                            body: JSON.stringify({
                                cost_item_ids: itemIdsToUpdate,
                                unit_price_type_id: newTypeId || null, // 빈 문자열이면 null로 전송
                            }),
                        }
                    );
                    const result = await response.json();
                    if (!response.ok)
                        throw new Error(
                            result.message || '단가 기준 업데이트 실패'
                        );

                    showToast(result.message, 'success');
                    console.log(
                        `[DEBUG][Event] UnitPriceType update successful. Refreshing BOQ table...`
                    ); // 디버깅
                    // lastSelectedUnitPriceTypeId = newTypeId; // This was causing a bug where all dropdowns would change
                    // 중요: 업데이트 성공 후 BOQ 테이블 전체를 다시 그림
                    await generateBoqReport();
                } catch (error) {
                    console.error(
                        '[ERROR][Event] Failed to update UnitPriceType:',
                        error
                    ); // 디버깅
                    showToast(error.message, 'error');
                    // 실패 시 원래 값으로 되돌리기 (선택적)
                    const row = selectElement.closest('tr');
                    selectElement.value = row.dataset.currentTypeId || '';
                }
            }
        });
        tbody.dataset.unitPriceChangeListenerAttached = 'true'; // 리스너 추가됨 표시
        console.log(
            '[DEBUG] Main BOQ table unit price change listener attached.'
        ); // 디버깅
    }

    // ▼▼▼ 수정: 하단 테이블 클릭 리스너 수정 ▼▼▼
    // --- 4. 중앙 하단 '포함된 산출항목' 목록 클릭 시 -> 선택 상태 변경 및 왼쪽/오른쪽 상세 패널 업데이트 ---
    const itemListContainer = document.getElementById(
        'boq-item-list-container'
    );
    if (itemListContainer && !itemListContainer.dataset.clickListenerAttached) {
        // 중복 리스너 방지
        itemListContainer.addEventListener('click', (e) => {
            const itemRow = e.target.closest('tr[data-item-id]');
            const bimButton = e.target.closest(
                'button.select-in-client-btn-detail'
            );

            if (bimButton) {
                // BIM 연동 버튼 클릭 시 (기존 로직 유지)
                const costItemId = bimButton.dataset.costItemId;
                console.log(
                    `[DEBUG][Event] BIM link button clicked for CostItem ID: ${costItemId}`
                ); // 디버깅
                handleBoqSelectInClientFromDetail(costItemId); // 상세 목록용 함수 호출
            } else if (itemRow) {
                // 행의 다른 부분 클릭 시 (상세 정보 표시)
                const itemId = itemRow.dataset.itemId;
                console.log(
                    `[DEBUG][Event] Bottom BOQ item row clicked. Item ID: ${itemId}`
                ); // 디버깅

                // --- 여기가 수정된 핵심 로직 ---
                // a. 이전에 선택된 행의 'selected' 클래스 제거
                //    (★ 'selected-boq-row'가 아니라 '.selected' 사용 확인 ★)
                const currentSelectedRow =
                    itemListContainer.querySelector('tr.selected');
                if (currentSelectedRow) {
                    currentSelectedRow.classList.remove('selected');
                    console.log(
                        `[DEBUG][UI] Removed 'selected' class from previous bottom row.`
                    ); // 디버깅
                }
                // b. 클릭된 행에 'selected' 클래스 추가 (연두색 배경)
                itemRow.classList.add('selected');
                console.log(
                    `[DEBUG][UI] Added 'selected' class to bottom table row ID: ${itemId}`
                ); // 디버깅

                // c. 상세 정보 및 BIM 객체 요약 패널 업데이트 함수 호출
                //    (ID가 변경되었는지 여부와 관계없이 호출하여 항상 최신 상태 반영)
                renderBoqItemProperties(itemId); // 왼쪽 상세 정보 렌더링
                renderBoqBimObjectCostSummary(itemId); // 오른쪽 BIM 객체 요약 렌더링
                // --- 수정된 로직 끝 ---
            } else {
                console.log(
                    '[DEBUG][Event] Click inside bottom panel, but not on a data row or button.'
                ); // 디버깅
            }
        });
        itemListContainer.dataset.clickListenerAttached = 'true'; // 리스너 추가됨 표시
        console.log('[DEBUG] Bottom BOQ item list click listener attached.'); // 디버깅
    }
    // ▲▲▲ 수정 끝 ▲▲▲

    console.log('[DEBUG] BOQ table interactions setup complete.'); // 디버깅
}
/**
 * BOQ 하단 상세 목록 테이블의 'BIM 연동' 버튼 클릭 시 호출됩니다.
 * @param {string} costItemId - 클릭된 버튼이 속한 CostItem의 ID
 */
function handleBoqSelectInClientFromDetail(costItemId) {
    console.log(
        `[DEBUG] handleBoqSelectInClientFromDetail called for CostItem ID: ${costItemId}`
    );
    if (!costItemId) return;

    const costItem = loadedCostItems.find((ci) => ci.id === costItemId);
    const member = costItem?.quantity_member_id
        ? loadedQuantityMembers.find(
              (qm) => qm.id === costItem.quantity_member_id
          )
        : null;
    const rawElement = member?.raw_element_id
        ? allRevitData.find((re) => re.id === member.raw_element_id)
        : null;

    if (!rawElement || !rawElement.element_unique_id) {
        showToast('이 항목과 연동된 BIM 객체를 찾을 수 없습니다.', 'warning');
        console.warn(
            `[DEBUG] Could not find linked RawElement for CostItem ID: ${costItemId}`
        );
        return;
    }

    const uniqueIdToSend = rawElement.element_unique_id;
    console.log(`[DEBUG] Found Unique ID to send: ${uniqueIdToSend}`);

    const targetGroup =
        currentMode === 'revit'
            ? 'revit_broadcast_group'
            : 'blender_broadcast_group';
    frontendSocket.send(
        JSON.stringify({
            type: 'command_to_client',
            payload: {
                command: 'select_elements',
                unique_ids: [uniqueIdToSend], // 단일 객체 선택
                target_group: targetGroup,
            },
        })
    );

    const clientName = currentMode === 'revit' ? 'Revit' : 'Blender';
    showToast(
        `연관된 객체 선택 명령을 ${clientName}(으)로 보냈습니다.`,
        'success'
    );
    console.log(
        `[DEBUG] Sent select command for Unique ID ${uniqueIdToSend} to ${clientName}.`
    );
}

/**
 * [수정됨] 중앙 하단 패널에 포함된 산출항목 목록을 3열 테이블로 렌더링하고, 첫 항목의 상세 정보를 표시합니다.
 * @param {Array<String>} itemIds - 표시할 CostItem의 ID 배열
 */
function updateBoqDetailsPanel(itemIds) {
    const listContainer = document.getElementById('boq-item-list-container');
    // 디버깅 로그 추가
    console.log(
        `[DEBUG][UI] updateBoqDetailsPanel called with ${itemIds?.length} item IDs. Rendering list and resetting detail panels.` // 로그 메시지 수정
    );

    if (!itemIds || itemIds.length === 0) {
        listContainer.innerHTML =
            '<p style="padding: 10px;">이 그룹에 포함된 산출항목이 없습니다.</p>';
        // 초기 상태: 상세/요약 패널도 초기화
        renderBoqItemProperties(null);
        renderBoqBimObjectCostSummary(null);
        return;
    }

    // loadedCostItems에서 ID가 일치하는 항목들을 찾음 (items_detail에서 온 데이터)
    // ▼▼▼ 수정: loadedCostItems 대신 loadedDdCostItems 사용 ▼▼▼
    const itemsToRender = loadedDdCostItems.filter((item) =>
        itemIds.includes(item.id)
    );
    console.log(`[DEBUG][updateBoqDetailsPanel] Filtered itemsToRender:`, itemsToRender);
    // ▲▲▲ 수정 끝 ▲▲▲
    if (itemsToRender.length === 0) {
        listContainer.innerHTML =
            '<p style="padding: 10px;">산출항목 데이터를 찾을 수 없습니다.</p>';
        // 초기 상태: 상세/요약 패널도 초기화
        renderBoqItemProperties(null);
        renderBoqBimObjectCostSummary(null);
        return;
    }

    // --- 테이블 헤더 정의 (기존 3열 + 비용 + BIM 연동 버튼) ---
    const headers = [
        { id: 'cost_code_name', label: '산출항목' },
        { id: 'quantity', label: '수량', align: 'right' },
        { id: 'unit_price_type_name', label: '단가기준' },
        { id: 'total_cost_unit', label: '합계단가', align: 'right' },
        { id: 'material_cost_unit', label: '재료비단가', align: 'right' },
        { id: 'labor_cost_unit', label: '노무비단가', align: 'right' },
        { id: 'expense_cost_unit', label: '경비단가', align: 'right' },
        { id: 'total_cost_total', label: '합계금액', align: 'right' },
        { id: 'material_cost_total', label: '재료비', align: 'right' },
        { id: 'labor_cost_total', label: '노무비', align: 'right' },
        { id: 'expense_cost_total', label: '경비', align: 'right' },
        { id: 'linked_member_name', label: '연관 부재' }, // 연관 부재 이름 열 추가
        { id: 'linked_raw_name', label: 'BIM 원본 객체' }, // BIM 원본 이름 열 추가
        { id: 'actions', label: 'BIM 연동', align: 'center' },
    ];

    // --- 테이블 HTML 생성 ---
    let tableHtml = `<table class="boq-item-list-table"><thead><tr>`;
    headers.forEach(
        (h) =>
            (tableHtml += `<th style="text-align: ${h.align || 'left'};">${
                h.label
            }</th>`)
    );
    tableHtml += `</tr></thead><tbody>`;

    // --- 각 CostItem 행 생성 ---
    itemsToRender.forEach((item) => {
        console.log(`[DEBUG][updateBoqDetailsPanel] Processing item ID: ${item.id}`);
        console.log(`[DEBUG][updateBoqDetailsPanel] Item unit costs: totalUnit=${item.total_cost_unit}, materialUnit=${item.material_cost_unit}, laborUnit=${item.labor_cost_unit}, expenseUnit=${item.expense_cost_unit}`);
        // --- 이름 및 비용 정보 조회 로직 ---
        const costItemName = item.cost_code_name || '(이름 없는 항목)';
        const qtyStr = item.quantity || '0.0000'; // 백엔드에서 문자열로 옴

        // 연관 부재 정보 찾기
        const member = item.quantity_member_id
            ? loadedQuantityMembers.find(
                  (m) => m.id === item.quantity_member_id
              )
            : null;
        const memberName = member
            ? member.name || '(이름 없는 부재)'
            : '(연관 부재 없음)';

        // BIM 원본 객체 정보 찾기
        const rawElement = member?.raw_element_id
            ? allRevitData.find((el) => el.id === member.raw_element_id)
            : null;
        const rawElementName = rawElement
            ? rawElement.raw_data?.Name || '(이름 없는 원본)'
            : '(BIM 원본 없음)';

        // 단가 기준 이름 찾기
        const unitPriceType = loadedUnitPriceTypesForBoq.find(
            (t) => t.id === item.unit_price_type_id
        ); // loadedUnitPriceTypesForBoq 사용
        const unitPriceTypeName = unitPriceType
            ? unitPriceType.name
            : '(미지정)';

        // 비용 정보 (loadedCostItems 또는 loadedDdCostItems에 이미 문자열로 포함되어 있음)
        const totalUnit = item.total_cost_unit || '0.0000';
        const materialUnit = item.material_cost_unit || '0.0000';
        const laborUnit = item.labor_cost_unit || '0.0000';
        const expenseUnit = item.expense_cost_unit || '0.0000';
        const totalAmount = item.total_cost_total || '0.0000';
        const matAmount = item.material_cost_total || '0.0000';
        const labAmount = item.labor_cost_total || '0.0000';
        const expAmount = item.expense_cost_total || '0.0000';

        // BIM 객체 연동 버튼
        let bimButtonHtml = '';
        if (rawElement) {
            // rawElement가 있을 때만 버튼 생성
            bimButtonHtml = `<button class="select-in-client-btn-detail" data-cost-item-id="${item.id}" title="연동 프로그램에서 선택 확인">👁️</button>`;
        }

        // 행 생성 (selected 클래스 없음)
        tableHtml += `<tr data-item-id="${item.id}">`; // selected 클래스 제거 확인
        headers.forEach((h) => {
            let value = '';
            let style = h.align ? `style="text-align: ${h.align};"` : '';
            switch (h.id) {
                case 'cost_code_name':
                    value = costItemName;
                    break;
                case 'quantity':
                    value = qtyStr;
                    break; // 문자열 그대로 사용
                case 'unit_price_type_name':
                    value = unitPriceTypeName;
                    break;
                case 'total_cost_unit':
                    value = totalUnit;
                    break;
                case 'material_cost_unit':
                    value = materialUnit;
                    break;
                case 'labor_cost_unit':
                    value = laborUnit;
                    break;
                case 'expense_cost_unit':
                    value = expenseUnit;
                    break;
                case 'total_cost_total':
                    value = totalAmount;
                    break;
                case 'material_cost_total':
                    value = matAmount;
                    break;
                case 'labor_cost_total':
                    value = labAmount;
                    break;
                case 'expense_cost_total':
                    value = expAmount;
                    break;
                case 'linked_member_name':
                    value = memberName;
                    break; // 추가된 열
                case 'linked_raw_name':
                    value = rawElementName;
                    break; // 추가된 열
                case 'actions':
                    value = bimButtonHtml;
                    style = `style="text-align: center;"`;
                    break;
                default:
                    value = item[h.id] || '';
            }
            tableHtml += `<td ${style}>${value}</td>`;
        });
        tableHtml += `</tr>`;
    });

    tableHtml += '</tbody></table>';
    listContainer.innerHTML = tableHtml;
    console.log(
        '[DEBUG][UI] CostItem list table rendered in details panel (no initial selection).'
    );

    // ▼▼▼ 수정: 첫 번째 항목 자동 선택 및 상세/요약 렌더링 호출 제거하고, null로 호출하여 초기화 ▼▼▼
    // const firstItemId = itemsToRender[0].id; // 제거
    // renderBoqItemProperties(firstItemId);    // 제거
    // renderBoqBimObjectCostSummary(firstItemId); // 제거

    // ▼▼▼ 추가: 대신 초기 상태로 상세/요약 패널 렌더링 호출 ▼▼▼
    renderBoqItemProperties(null); // 왼쪽 패널 초기화
    renderBoqBimObjectCostSummary(null); // 오른쪽 패널 초기화
    // ▲▲▲ 추가 끝 ▲▲▲
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
    listContainer.querySelectorAll('tr').forEach((row) => {
        row.classList.toggle('selected', row.dataset.itemId === itemId);
    });

    const memberContainer = document.getElementById(
        'boq-details-member-container'
    );
    const markContainer = document.getElementById('boq-details-mark-container');
    const rawContainer = document.getElementById('boq-details-raw-container');

    // 오른쪽 패널 초기화
    if (!itemId) {
        memberContainer.innerHTML = '<p>항목을 선택하세요.</p>';
        markContainer.innerHTML = '<p>항목을 선택하세요.</p>';
        rawContainer.innerHTML = '<p>항목을 선택하세요.</p>';
        return;
    }

    const costItem = loadedCostItems.find(
        (item) => item.id.toString() === itemId.toString()
    );
    if (!costItem) {
        memberContainer.innerHTML = '<p>항목 정보를 찾을 수 없습니다.</p>';
        markContainer.innerHTML = '';
        rawContainer.innerHTML = '';
        return;
    }

    const member = costItem.quantity_member_id
        ? loadedQuantityMembers.find(
              (m) => m.id.toString() === costItem.quantity_member_id.toString()
          )
        : null;

    // 1. 부재 속성 렌더링
    if (
        member &&
        member.properties &&
        Object.keys(member.properties).length > 0
    ) {
        let tableHtml =
            '<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>';
        Object.keys(member.properties)
            .sort()
            .forEach((key) => {
                tableHtml += `<tr><td>${key}</td><td>${member.properties[key]}</td></tr>`;
            });
        memberContainer.innerHTML = tableHtml + '</tbody></table>';
    } else {
        memberContainer.innerHTML = '<p>연관된 부재 속성이 없습니다.</p>';
    }

    // 2. 일람부호 속성 렌더링 (핵심 수정 부분)
    if (member && member.member_mark_id) {
        const mark = loadedMemberMarks.find(
            (m) => m.id.toString() === member.member_mark_id.toString()
        );
        if (mark) {
            let header = `<h5>${mark.mark} (일람부호 속성)</h5>`;
            let tableHtml =
                '<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>';
            if (mark.properties && Object.keys(mark.properties).length > 0) {
                Object.keys(mark.properties)
                    .sort()
                    .forEach((key) => {
                        tableHtml += `<tr><td>${key}</td><td>${mark.properties[key]}</td></tr>`;
                    });
            } else {
                tableHtml +=
                    '<tr><td colspan="2">정의된 속성이 없습니다.</td></tr>';
            }
            markContainer.innerHTML = header + tableHtml + '</tbody></table>';
        } else {
            markContainer.innerHTML =
                '<p>연결된 일람부호 정보를 찾을 수 없습니다.</p>';
        }
    } else {
        markContainer.innerHTML = '<p>연관된 일람부호가 없습니다.</p>';
    }

    // 3. BIM 원본 데이터 렌더링
    const rawElement = member?.raw_element_id
        ? allRevitData.find(
              (el) => el.id.toString() === member.raw_element_id.toString()
          )
        : null;
    if (rawElement?.raw_data) {
        let header = `<h5>${rawElement.raw_data.Name || '이름 없음'}</h5>`;
        let tableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;
        const allKeys = new Set();
        Object.keys(rawElement.raw_data).forEach((k) => allKeys.add(k));
        Object.keys(rawElement.raw_data.Parameters || {}).forEach((k) =>
            allKeys.add(k)
        );
        Object.keys(rawElement.raw_data.TypeParameters || {}).forEach((k) =>
            allKeys.add(k)
        );
        Array.from(allKeys)
            .sort()
            .forEach((key) => {
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
    const ddTabContainer = document.getElementById('detailed-estimation-dd');
    if (!ddTabContainer) {
        console.warn(
            "[WARN] Detailed Estimation (DD) tab container '#detailed-estimation-dd' not found. UI initialization skipped."
        );
        return;
    }
    console.log(
        '[DEBUG] Initializing UI elements for Detailed Estimation (DD) tab...'
    );

    // UI 요소들 선택
    const leftToggleBtn = ddTabContainer.querySelector(
        '#boq-left-panel-toggle-btn'
    );
    const bottomToggleBtn = ddTabContainer.querySelector(
        '#boq-bottom-panel-toggle-btn'
    );
    const boqContainer = ddTabContainer.querySelector('.boq-container');
    const bottomPanel = ddTabContainer.querySelector('.boq-details-wrapper');
    const boqDetailsPanel = ddTabContainer.querySelector(
        '#boq-item-details-panel'
    ); // 왼쪽 상세 정보 패널

    // --- 1. 왼쪽 패널 접기/펴기 기능 ---
    if (leftToggleBtn && boqContainer) {
        if (!leftToggleBtn.dataset.listenerAttached) {
            leftToggleBtn.addEventListener('click', () => {
                boqContainer.classList.toggle('left-panel-collapsed');
                leftToggleBtn.textContent = boqContainer.classList.contains(
                    'left-panel-collapsed'
                )
                    ? '▶'
                    : '◀';
                console.log(
                    `[DEBUG] Left panel toggled. Collapsed: ${boqContainer.classList.contains(
                        'left-panel-collapsed'
                    )}`
                );
            });
            leftToggleBtn.dataset.listenerAttached = 'true';
            console.log('[DEBUG] Left panel toggle listener attached.');
        }
    } else {
        console.warn('[WARN] Left toggle button or BOQ container not found.');
    }

    // --- 2. 하단 패널 접기/펴기 기능 ---
    if (bottomToggleBtn && bottomPanel) {
        if (!bottomToggleBtn.dataset.listenerAttached) {
            bottomToggleBtn.addEventListener('click', () => {
                const isCollapsing =
                    !bottomPanel.classList.contains('collapsed');
                bottomPanel.classList.toggle('collapsed');
                bottomToggleBtn.textContent = isCollapsing ? '▲' : '▼';
                console.log(
                    `[DEBUG] Bottom panel toggled. Collapsed: ${isCollapsing}`
                );
            });
            bottomToggleBtn.dataset.listenerAttached = 'true';
            console.log('[DEBUG] Bottom panel toggle listener attached.');
        }
    } else {
        console.warn(
            '[WARN] Bottom toggle button or bottom panel wrapper not found.'
        );
    }

    // --- 3. ★★★ 왼쪽 상세 정보 패널 탭 클릭 기능 (여기로 이동) ★★★ ---
    if (boqDetailsPanel) {
        const tabsContainer = boqDetailsPanel.querySelector(
            '.details-panel-tabs'
        );
        if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
            // 중복 방지
            tabsContainer.addEventListener('click', (e) => {
                const clickedButton = e.target.closest('.detail-tab-button');
                if (
                    !clickedButton ||
                    clickedButton.classList.contains('active') ||
                    !clickedButton.closest('.details-panel-tabs')
                ) {
                    console.log(
                        '[DEBUG] DD Detail tab click ignored (not a button, already active, or outside container).'
                    );
                    return;
                }

                const targetTab = clickedButton.dataset.tab; // 클릭된 탭의 data-tab 값 (예: "boq-member-prop")
                console.log(`[DEBUG] DD Detail tab clicked: ${targetTab}`); // 상세 로그 추가

                // 현재 패널 내에서만 active 클래스 관리
                boqDetailsPanel
                    .querySelectorAll('.detail-tab-button.active')
                    .forEach((btn) => btn.classList.remove('active'));
                boqDetailsPanel
                    .querySelectorAll('.detail-tab-content.active')
                    .forEach((content) => content.classList.remove('active'));

                clickedButton.classList.add('active');
                const targetContent = boqDetailsPanel.querySelector(
                    `.detail-tab-content[data-tab="${targetTab}"]`
                );
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log(
                        `[DEBUG] DD Detail tab content activated: ${targetTab}`
                    );
                } else {
                    console.warn(
                        `[WARN] DD Detail tab content for '${targetTab}' not found.`
                    );
                }
            });
            tabsContainer.dataset.listenerAttached = 'true'; // 리스너 추가됨 표시
            console.log(
                '[DEBUG] DD Detail panel tab click listener attached (in initializeBoqUI).'
            );
        } else if (!tabsContainer) {
            console.warn(
                '[WARN] DD Detail panel tabs container not found within #boq-item-details-panel.'
            );
        }
    } else {
        console.warn(
            "[WARN] Left detail panel '#boq-item-details-panel' not found."
        );
    }
    // --- ★★★ 탭 리스너 이동 완료 ★★★ ---

    console.log('[DEBUG] Detailed Estimation (DD) UI initialization complete.');
}

function handleBoqSelectInClient() {
    console.log("[DEBUG] '연동 프로그램에서 선택 확인' 버튼 클릭됨");
    const selectedRow = document.querySelector(
        '.boq-table tr.selected-boq-row'
    );
    if (!selectedRow) {
        showToast('먼저 집계표에서 확인할 행을 선택하세요.', 'error');
        console.warn('[DEBUG] 집계표에서 선택된 행이 없음.');
        return;
    }

    const itemIds = JSON.parse(selectedRow.dataset.itemIds || '[]');
    if (itemIds.length === 0) {
        showToast('선택된 행에 연관된 산출항목이 없습니다.', 'info');
        console.warn('[DEBUG] 선택된 행에 item_ids가 없음.');
        return;
    }
    console.log(`[DEBUG] 선택된 행의 CostItem ID 목록:`, itemIds);

    const rawElementIds = new Set();
    itemIds.forEach((itemId) => {
        const costItem = loadedCostItems.find((ci) => ci.id === itemId);
        if (costItem && costItem.quantity_member_id) {
            const member = loadedQuantityMembers.find(
                (qm) => qm.id === costItem.quantity_member_id
            );
            if (member && member.raw_element_id) {
                rawElementIds.add(member.raw_element_id);
            }
        }
    });

    if (rawElementIds.size === 0) {
        showToast(
            '선택된 항목들은 BIM 객체와 직접 연관되어 있지 않습니다.',
            'info'
        );
        console.warn('[DEBUG] 연관된 BIM 객체를 찾지 못함.');
        return;
    }
    console.log(`[DEBUG] 최종 RawElement ID 목록:`, Array.from(rawElementIds));

    const uniqueIdsToSend = [];
    rawElementIds.forEach((rawId) => {
        const rawElement = allRevitData.find((re) => re.id === rawId);
        if (rawElement) {
            uniqueIdsToSend.push(rawElement.element_unique_id);
        }
    });

    if (uniqueIdsToSend.length > 0) {
        const targetGroup =
            currentMode === 'revit'
                ? 'revit_broadcast_group'
                : 'blender_broadcast_group';
        frontendSocket.send(
            JSON.stringify({
                type: 'command_to_client',
                payload: {
                    command: 'select_elements',
                    unique_ids: uniqueIdsToSend,
                    target_group: targetGroup,
                },
            })
        );
        const clientName = currentMode === 'revit' ? 'Revit' : 'Blender';
        showToast(
            `${uniqueIdsToSend.length}개 객체의 선택 명령을 ${clientName}(으)로 보냈습니다.`,
            'success'
        );
        console.log(
            `[DEBUG] ${clientName}으로 ${uniqueIdsToSend.length}개 객체 선택 명령 전송:`,
            uniqueIdsToSend
        );
    } else {
        showToast(
            '연동 프로그램으로 보낼 유효한 객체를 찾지 못했습니다.',
            'error'
        );
        console.error('[DEBUG] 전송할 최종 Unique ID를 찾지 못함.');
    }
}

function handleBoqGetFromClient() {
    console.log("[DEBUG] '선택 객체 가져오기 (BOQ)' 버튼 클릭됨");
    const targetGroup =
        currentMode === 'revit'
            ? 'revit_broadcast_group'
            : 'blender_broadcast_group';
    frontendSocket.send(
        JSON.stringify({
            type: 'command_to_client',
            payload: {
                command: 'get_selection',
                target_group: targetGroup,
            },
        })
    );
    const clientName = currentMode === 'revit' ? 'Revit' : 'Blender';
    showToast(`${clientName}에 선택 정보 가져오기를 요청했습니다.`, 'info');
    console.log(`[DEBUG] ${clientName}에 get_selection 명령 전송`);
}
function handleBoqClearFilter() {
    console.log("[DEBUG] '선택 필터 해제 (BOQ)' 버튼 클릭됨");
    // 1. 필터링 ID 목록을 비웁니다.
    boqFilteredRawElementIds.clear();
    console.log('[DEBUG] boqFilteredRawElementIds 초기화 완료.');

    // 2. 버튼을 다시 숨깁니다.
    document.getElementById('boq-clear-selection-filter-btn').style.display =
        'none';

    // 3. 필터 없이 전체 데이터를 기준으로 집계표를 다시 생성합니다.
    generateBoqReport();

    // 4. 사용자에게 알림을 표시합니다.
    showToast('Revit 선택 필터를 해제하고 전체 집계표를 표시합니다.', 'info');
}
function resetBoqColumnsAndRegenerate(skipConfirmation = false) {
    console.log("[DEBUG] '열 순서/이름 초기화' 버튼 클릭됨");

    // skipConfirmation이 false일 때만 확인 창을 띄웁니다.
    if (
        !skipConfirmation &&
        !confirm('테이블의 열 순서와 이름을 기본값으로 초기화하시겠습니까?')
    ) {
        console.log('[DEBUG] 초기화 취소됨.');
        return;
    }

    // localStorage에서 설정 제거
    localStorage.removeItem('boqColumnSettings');
    console.log('[DEBUG] BOQ column settings removed from localStorage.');

    // 전역 변수 초기화 (loadBoqColumnSettings가 기본값으로 다시 채울 것임)
    currentBoqColumns = [];
    boqColumnAliases = {};
    console.log(
        '[DEBUG] 열 상태(currentBoqColumns, boqColumnAliases) 초기화됨.'
    );

    // 설정 로드 함수를 다시 호출하여 기본값으로 채우고, 테이블 재생성
    loadBoqColumnSettings();
    showToast('열 상태를 초기화하고 집계표를 다시 생성합니다.', 'info');
    generateBoqReport();
}

function importTags(event) {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    const file = event.target.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('tag_file', file);

        fetch(`/connections/import-tags/${currentProjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData,
        })
            .then((res) => res.json())
            .then((data) => {
                showToast(
                    data.status === 'success'
                        ? '태그 파일을 성공적으로 가져왔습니다.'
                        : '파일 업로드에 실패했습니다.',
                    data.status === 'success' ? 'success' : 'error'
                );
                // 성공/실패 여부와 관계없이 파일 입력 초기화
                event.target.value = '';
            });
    }
}

function exportTags() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }
    // 간단하게 URL을 변경하여 파일 다운로드를 트리거합니다.
    window.location.href = `/connections/export-tags/${currentProjectId}/`;
}

function handleLeftPanelTabClick(event) {
    const clickedButton = event.target.closest('.left-panel-tab-button');
    if (!clickedButton || clickedButton.classList.contains('active')) {
        // 버튼이 아니거나 이미 활성화된 탭이면 아무것도 하지 않음
        return;
    }

    const tabContainer = clickedButton.closest('.left-panel-tab-container');
    const targetTabId = clickedButton.dataset.tab;

    // 현재 활성화된 탭과 콘텐츠를 비활성화
    tabContainer
        .querySelector('.left-panel-tab-button.active')
        .classList.remove('active');
    tabContainer
        .querySelector('.left-panel-tab-content.active')
        .classList.remove('active');

    // 클릭된 버튼과 그에 맞는 콘텐츠를 활성화
    clickedButton.classList.add('active');
    tabContainer.querySelector(`#${targetTabId}`).classList.add('active');
}

// =====================================================================
// 공간분류(SpaceClassification) 관리 관련 함수들
// =====================================================================

/**
 * 프로젝트의 모든 공간분류를 서버에서 불러와 화면을 갱신합니다.
 */
async function loadSpaceClassifications() {
    if (!currentProjectId) {
        renderSpaceClassificationTree([]);
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/space-classifications/${currentProjectId}/`
        );
        if (!response.ok)
            throw new Error('공간분류 목록을 불러오는데 실패했습니다.');
        loadedSpaceClassifications = await response.json();
        renderSpaceClassificationTree(loadedSpaceClassifications);

        // ▼▼▼ [추가] 수량산출부재 탭의 공간분류 드롭다운도 채웁니다. ▼▼▼
        const select = document.getElementById('qm-space-assign-select');
        if (select) {
            select.innerHTML = '<option value="">-- 공간분류 선택 --</option>'; // 초기화
            // 위계 구조를 시각적으로 표현하기 위해 재귀 함수 사용
            const buildOptions = (parentId = null, prefix = '') => {
                loadedSpaceClassifications
                    .filter((s) => s.parent_id === parentId)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach((space) => {
                        const option = document.createElement('option');
                        option.value = space.id;
                        option.textContent = `${prefix}${space.name}`;
                        select.appendChild(option);
                        buildOptions(space.id, prefix + '  - ');
                    });
            };
            buildOptions();
        }
    } catch (error) {
        console.error('Error loading space classifications:', error);
        showToast(error.message, 'error');
    }
}

/**
 * 공간분류 관련 CUD(생성, 수정, 삭제) 및 객체 할당 작업을 처리합니다.
 * @param {string} action - 수행할 작업 ('add_root', 'add_child', 'rename', 'delete', 'assign_elements')
 * @param {object} data - 작업에 필요한 데이터 (ID, 이름 등)
 */
async function handleSpaceActions(action, data = {}) {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    // ▼▼▼ [핵심 수정] 올바른 선택 ID 상태 객체를 가져옵니다. ▼▼▼
    const selectedIds = viewerStates['space-management'].selectedElementIds;
    let name, confirmed;

    switch (action) {
        case 'add_root':
        case 'add_child':
            const parentName =
                action === 'add_child' ? data.parentName : '최상위';
            name = prompt(
                `'${parentName}'의 하위에 추가할 공간의 이름을 입력하세요:`
            );
            if (!name || !name.trim()) return;

            await saveSpaceClassification({
                name: name.trim(),
                parent_id: data.parentId || null,
            });
            break;

        case 'rename':
            name = prompt('새 이름을 입력하세요:', data.name);
            if (!name || !name.trim() || name.trim() === data.name) return;

            await saveSpaceClassification(
                { id: data.id, name: name.trim() },
                true
            );
            break;

        case 'delete':
            confirmed = confirm(
                `'${data.name}'을(를) 삭제하시겠습니까?\n이 공간에 속한 모든 하위 공간들도 함께 삭제됩니다.`
            );
            if (!confirmed) return;

            await deleteSpaceClassification(data.id);
            break;

        case 'assign_elements':
            // ▼▼▼ [핵심 수정] 'spaceMgmtSelectedIds' 대신 'selectedIds'를 사용합니다. ▼▼▼
            if (selectedIds.size === 0) {
                if (
                    confirm(
                        `선택된 BIM 객체가 없습니다. '${data.name}' 공간의 모든 객체 할당을 해제하시겠습니까?`
                    )
                ) {
                    await applySpaceElementMapping(data.id, []);
                }
            } else {
                if (
                    confirm(
                        `'${data.name}' 공간에 선택된 ${selectedIds.size}개의 BIM 객체를 할당하시겠습니까?\n기존 할당 정보는 덮어쓰여집니다.`
                    )
                ) {
                    await applySpaceElementMapping(
                        data.id,
                        Array.from(selectedIds)
                    );
                }
            }
            break;
    }
}

/**
 * 공간분류를 서버에 저장(생성/수정)합니다.
 * @param {object} spaceData - 저장할 데이터
 * @param {boolean} isUpdate - 수정 작업인지 여부
 */
async function saveSpaceClassification(spaceData, isUpdate = false) {
    const url = isUpdate
        ? `/connections/api/space-classifications/${currentProjectId}/${spaceData.id}/`
        : `/connections/api/space-classifications/${currentProjectId}/`;
    const method = isUpdate ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify(spaceData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadSpaceClassifications(); // 성공 후 목록 새로고침
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * 공간분류를 서버에서 삭제합니다.
 * @param {string} spaceId - 삭제할 공간분류 ID
 */
async function deleteSpaceClassification(spaceId) {
    try {
        const response = await fetch(
            `/connections/api/space-classifications/${currentProjectId}/${spaceId}/`,
            {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadSpaceClassifications(); //
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * 공간 객체 맵핑을 위한 오른쪽 패널을 보여줍니다.
 * @param {string} spaceId - 대상 공간의 ID
 * @param {string} spaceName - 대상 공간의 이름
 */
function showSpaceMappingPanel(spaceId, spaceName) {
    const panel = document.getElementById('space-mapping-panel');
    const header = document.getElementById('space-mapping-header');

    // 맵핑 상태 업데이트
    spaceMappingState = {
        active: true,
        spaceId: spaceId,
        spaceName: spaceName,
    };

    // 헤더 텍스트 설정
    header.textContent = `'${spaceName}' 공간에 객체 할당`;

    // 이 공간에 이미 맵핑된 객체들을 미리 선택 상태로 표시
    selectedElementIds.clear();
    const spaceData = loadedSpaceClassifications.find((s) => s.id === spaceId);
    if (spaceData) {
        // 이 부분은 API가 맵핑된 element_id 목록을 반환해야 완벽하게 동작합니다.
        // 현재는 API가 반환하지 않으므로, 이 기능은 다음 개선사항으로 남겨두고 선택을 초기화합니다.
        // TODO: space_classifications_api가 맵핑된 element_id 목록도 반환하도록 개선
    }

    // BIM 데이터 테이블 렌더링
    // 수정된 renderDataTable 함수에 테이블을 그릴 컨테이너의 ID를 전달합니다.
    renderDataTable('space-mapping-table-container');

    // 패널 보이기
    panel.style.display = 'flex';

    showToast(
        "오른쪽 패널에서 할당할 객체를 선택하고 '선택 완료'를 누르세요.",
        'info',
        4000
    );
}

/**
 * 공간 객체 맵핑 패널을 숨기고 상태를 초기화합니다.
 */
function hideSpaceMappingPanel() {
    const panel = document.getElementById('space-mapping-panel');
    panel.style.display = 'none';

    // 상태 초기화
    spaceMappingState = { active: false, spaceId: null, spaceName: '' };

    // 선택된 객체 목록 초기화 및 BIM 원본 데이터 테이블 새로고침
    selectedElementIds.clear();
    renderDataTable(); // 기본 테이블 컨테이너를 새로고침
}

// 현재 활성화된 탭의 상태 객체를 가져오는 헬퍼 함수
function getCurrentViewerState() {
    // 'space-management' 탭에 있을 때도 BIM 데이터 뷰어의 상태를 참조해야 하므로,
    // 현재는 'data-management'를 기본으로 하되, 추후 확장성을 고려하여 구조를 유지합니다.
    // 여기서는 각 탭이 독립적인 상태를 갖도록 구현합니다.
    return viewerStates[
        activeTab === 'space-management'
            ? 'space-management'
            : 'data-management'
    ];
}

function addGroupingLevel(contextPrefix) {
    const container = document.getElementById(
        `${contextPrefix}-grouping-controls`
    );
    if (!container) return;

    const newIndex = container.children.length + 1;
    const newLevelDiv = document.createElement('div');
    newLevelDiv.className = 'group-level';
    newLevelDiv.innerHTML = `
        <label>${newIndex}차:</label>
        <select class="group-by-select"></select>
        <button class="remove-group-level-btn">-</button>
    `;
    container.appendChild(newLevelDiv);
    populateFieldSelection(); // 필드 목록 채우기

    newLevelDiv
        .querySelector('.remove-group-level-btn')
        .addEventListener('click', function () {
            this.parentElement.remove();
            renderDataTable(
                `${contextPrefix}-data-table-container`,
                contextPrefix
            );
        });
}

/**
 * [수정] 선택된 BIM 객체를 특정 공간에 할당하는 API를 호출합니다.
 * @param {string} spaceId 할당할 공간의 ID
 * @param {Array<string>} elementIds 할당할 BIM 원본 객체 ID 목록
 */
async function applySpaceElementMapping(spaceId, elementIds) {
    if (!spaceId) return;

    try {
        const response = await fetch(
            `/connections/api/space-classifications/manage-elements/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    space_id: spaceId,
                    element_ids: elementIds,
                    action: 'assign',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        await loadSpaceClassifications(); // 성공 후 트리 새로고침

        // ▼▼▼ [핵심 수정] 선택 상태 초기화 및 화면 갱신 로직을 수정합니다. ▼▼▼
        // 1. 올바른 상태 객체의 선택 목록을 비웁니다.
        viewerStates['space-management'].selectedElementIds.clear();

        // 2. 범용 렌더링 함수를 호출하여 테이블과 속성 뷰를 새로고침합니다.
        renderDataTable(
            'space-management-data-table-container',
            'space-management'
        );
        renderBimPropertiesTable('space-management');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * [신규] 여러 뷰 컨텍스트를 지원하는 범용 행 선택 처리 함수
 * @param {Event} event - 클릭 이벤트 객체
 * @param {HTMLElement} clickedRow - 클릭된 <tr> 요소
 * @param {string} contextPrefix - 뷰 상태를 식별하는 접두사 (예: 'data-management')
 */
function handleRowSelection(event, clickedRow, contextPrefix) {
    const state = viewerStates[contextPrefix];
    if (!state) return;

    const tableContainer = document.getElementById(
        `${contextPrefix}-data-table-container`
    );
    const allVisibleRows = Array.from(
        tableContainer.querySelectorAll('tr[data-db-id]')
    );

    const clickedRowIndex = allVisibleRows.findIndex(
        (r) => r.dataset.dbId === clickedRow.dataset.dbId
    );
    const elementDbId = clickedRow.dataset.dbId;

    if (!elementDbId) return;

    if (event.shiftKey && state.lastSelectedRowIndex > -1) {
        const start = Math.min(state.lastSelectedRowIndex, clickedRowIndex);
        const end = Math.max(state.lastSelectedRowIndex, clickedRowIndex);
        if (!event.ctrlKey) state.selectedElementIds.clear();
        for (let i = start; i <= end; i++) {
            const rowId = allVisibleRows[i]?.dataset.dbId;
            if (rowId) state.selectedElementIds.add(rowId);
        }
    } else if (event.ctrlKey) {
        if (state.selectedElementIds.has(elementDbId)) {
            state.selectedElementIds.delete(elementDbId);
        } else {
            state.selectedElementIds.add(elementDbId);
        }
    } else {
        state.selectedElementIds.clear();
        state.selectedElementIds.add(elementDbId);
    }
    state.lastSelectedRowIndex = clickedRowIndex;
}

/**
 * 특정 공간에 할당된 객체 목록을 API로 조회하고 모달창에 표시합니다.
 * @param {string} spaceId - 조회할 공간의 ID
 * @param {string} spaceName - 조회할 공간의 이름
 */

async function showAssignedElements(spaceId, spaceName) {
    if (!currentProjectId) return;

    const modal = document.getElementById('assigned-elements-modal');
    const unassignBtn = document.getElementById('modal-unassign-btn');

    unassignBtn.dataset.spaceId = spaceId; // 할당 해제 버튼에 spaceId 저장

    showToast('할당된 객체 목록을 불러오는 중...', 'info');
    try {
        const response = await fetch(
            `/connections/api/space-classifications/${currentProjectId}/${spaceId}/elements/`
        );
        if (!response.ok) {
            throw new Error('할당된 객체를 불러오는데 실패했습니다.');
        }
        const elements = await response.json();

        // 2. 나중에 테이블을 다시 그릴 때 사용하기 위해, 가져온 데이터를 모달 객체에 저장해 둡니다.
        modal.dataset.elements = JSON.stringify(elements);
        modal.dataset.spaceName = spaceName;

        // 3. 가져온 데이터로 테이블을 렌더링합니다. (처음에는 필드가 선택되지 않아 안내 메시지가 보임)
        renderAssignedElementsModal(elements, spaceName);

        // 4. 모든 준비가 끝나면 모달창을 보여줍니다.
        modal.style.display = 'flex';
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * 모달창에서 선택된 객체들의 할당을 해제합니다.
 */
async function handleUnassignElements() {
    const unassignBtn = document.getElementById('modal-unassign-btn');
    const spaceId = unassignBtn.dataset.spaceId;
    if (!spaceId) return;

    const modal = document.getElementById('assigned-elements-modal');
    const selectedCheckboxes = modal.querySelectorAll(
        '.unassign-checkbox:checked'
    );

    if (selectedCheckboxes.length === 0) {
        showToast('할당 해제할 항목을 선택하세요.', 'error');
        return;
    }

    if (
        !confirm(
            `${selectedCheckboxes.length}개의 객체를 이 공간에서 할당 해제하시겠습니까?`
        )
    ) {
        return;
    }

    // 현재 모달에 표시된 모든 객체의 ID (할당 해제 전 상태)
    const allAssignedIds = Array.from(
        modal.querySelectorAll('tr[data-element-id]')
    ).map((tr) => tr.dataset.elementId);

    // 할당 해제하기로 선택한 객체의 ID
    const idsToUnassign = Array.from(selectedCheckboxes).map((cb) => cb.value);

    // 최종적으로 할당 상태를 유지해야 할 객체들의 ID 목록
    const remainingIds = allAssignedIds.filter(
        (id) => !idsToUnassign.includes(id)
    );

    // 기존의 할당 API를 재사용하여, 남은 객체들로만 덮어씁니다.
    await applySpaceElementMapping(spaceId, remainingIds);

    // 작업 완료 후 모달을 닫습니다.
    modal.style.display = 'none';
    // 공간분류 트리는 applySpaceElementMapping 함수 내부에서 자동으로 새로고침됩니다.
}

// =====================================================================
// 공간분류 생성 룰셋(SpaceClassificationRule) 관리 및 적용 함수들
// =====================================================================

/**
 * 프로젝트의 모든 '공간분류 생성 룰셋'을 서버에서 불러와 화면을 다시 그립니다.
 */
async function loadSpaceClassificationRules() {
    if (!currentProjectId) {
        renderSpaceClassificationRulesetTable([]);
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/rules/space-classification/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('공간분류 생성 룰셋 로딩 실패');
        loadedSpaceClassificationRules = await response.json();
        renderSpaceClassificationRulesetTable(loadedSpaceClassificationRules);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * '공간분류 생성 룰셋' 테이블의 액션(저장, 수정, 취소, 삭제)을 처리합니다.
 */
async function handleSpaceClassificationRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        renderSpaceClassificationRulesetTable(
            loadedSpaceClassificationRules,
            ruleId
        );
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderSpaceClassificationRulesetTable(loadedSpaceClassificationRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('정말 이 규칙을 삭제하시겠습니까?')) return;
        const response = await fetch(
            `/connections/api/rules/space-classification/${currentProjectId}/${ruleId}/`,
            {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        if (response.ok) {
            showToast('규칙이 삭제되었습니다.', 'success');
            loadSpaceClassificationRules();
        } else {
            showToast('삭제 실패', 'error');
        }
    } else if (target.classList.contains('save-rule-btn')) {
        let bim_object_filter;
        try {
            bim_object_filter = JSON.parse(
                ruleRow.querySelector('.rule-bim-filter-input').value || '{}'
            );
        } catch (e) {
            showToast('BIM 객체 필터가 유효한 JSON 형식이 아닙니다.', 'error');
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            level_depth:
                parseInt(
                    ruleRow.querySelector('.rule-level-depth-input').value
                ) || 0,
            level_name: ruleRow.querySelector('.rule-level-name-input').value,
            bim_object_filter: bim_object_filter,
            name_source_param: ruleRow.querySelector('.rule-name-source-input')
                .value,
            parent_join_param: ruleRow.querySelector('.rule-parent-join-input')
                .value,
            child_join_param: ruleRow.querySelector('.rule-child-join-input')
                .value,
        };

        const response = await fetch(
            `/connections/api/rules/space-classification/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(ruleData),
            }
        );
        const result = await response.json();
        if (response.ok) {
            showToast(result.message, 'success');
            loadSpaceClassificationRules();
        } else {
            showToast(result.message, 'error');
        }
    }
}

/**
 * 정의된 룰셋을 적용하여 공간분류 자동 생성/동기화를 실행합니다.
 */
async function applySpaceClassificationRules() {
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    if (
        !confirm(
            '정의된 룰셋을 기반으로 공간분류를 자동 생성/동기화하시겠습니까?\n이 작업은 룰에 의해 생성된 항목만 영향을 주며, 수동으로 추가한 항목은 보존됩니다.'
        )
    ) {
        return;
    }

    showToast(
        '룰셋을 적용하여 공간분류를 동기화하고 있습니다. 잠시만 기다려주세요...',
        'info',
        5000
    );
    try {
        const response = await fetch(
            `/connections/api/space-classifications/apply-rules/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        // 동기화 후, 공간분류 트리 뷰를 새로고침합니다.
        await loadSpaceClassifications();
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
        // 버튼이 아니거나 이미 활성화된 버튼이면 무시
        return;
    }

    const targetTab = clickedButton.dataset.tab;
    const detailsPanel = clickedButton.closest('.details-panel');

    // 모든 탭 버튼과 컨텐츠에서 'active' 클래스 제거
    detailsPanel
        .querySelectorAll('.detail-tab-button.active')
        .forEach((btn) => btn.classList.remove('active'));
    detailsPanel
        .querySelectorAll('.detail-tab-content.active')
        .forEach((content) => content.classList.remove('active'));

    // 클릭된 버튼과 그에 맞는 컨텐츠에 'active' 클래스 추가
    clickedButton.classList.add('active');
    const targetContent = detailsPanel.querySelector(
        `.detail-tab-content[data-tab="${targetTab}"]`
    );
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

// DOM이 로드된 후, 누락되었던 이벤트 리스너를 추가합니다.
document.addEventListener('DOMContentLoaded', () => {
    // '수량산출부재' 탭의 오른쪽 상세 패널 탭 컨테이너에 이벤트 리스너를 추가합니다.
    const qmDetailsPanel = document.querySelector(
        '#quantity-members .details-panel-tabs'
    );
    if (qmDetailsPanel) {
        qmDetailsPanel.addEventListener('click', handleQmDetailTabClick);
    }

    // '수량산출부재' 탭의 왼쪽 뷰 탭(수량산출부재 뷰, 공사코드별 뷰)에 대한 이벤트 리스너
    const qmViewTabs = document.querySelector('#quantity-members .view-tabs');
    if (qmViewTabs) {
        qmViewTabs.addEventListener('click', handleQmViewTabClick);
    }
});

// =====================================================================
// [신규] 수량산출부재의 공간분류 수동/자동 할당 관련 함수들
// =====================================================================

/**
 * 선택된 수량산출부재에 할당된 공간분류 목록을 화면 우측에 표시합니다.
 */
function renderQmSpacesList() {
    const container = document.getElementById('qm-spaces-list');
    if (selectedQmIds.size === 0) {
        container.innerHTML = '공간분류를 보려면 부재를 선택하세요.';
        return;
    }

    const selectedMembers = loadedQuantityMembers.filter((m) =>
        selectedQmIds.has(m.id)
    );
    if (selectedMembers.length === 0) {
        container.innerHTML = '선택된 부재를 찾을 수 없습니다.';
        return;
    }

    const firstMemberSpaces = new Set(
        selectedMembers[0].space_classification_ids || []
    );
    const commonSpaceIds = [...firstMemberSpaces].filter((spaceId) =>
        selectedMembers.every((member) =>
            (member.space_classification_ids || []).includes(spaceId)
        )
    );

    if (commonSpaceIds.length === 0) {
        container.innerHTML =
            '선택된 부재들에 공통으로 할당된 공간분류가 없습니다.';
        return;
    }

    container.innerHTML =
        '<ul>' +
        commonSpaceIds
            .map((spaceId) => {
                const space = loadedSpaceClassifications.find(
                    (s) => s.id === spaceId
                );
                return space
                    ? `<li>${space.name}</li>`
                    : `<li>알 수 없는 공간: ${spaceId}</li>`;
            })
            .join('') +
        '</ul>';
}

/**
 * 선택된 부재들에 공간분류를 할당합니다.
 */
async function assignSpaceToQm() {
    const spaceId = document.getElementById('qm-space-assign-select').value;
    if (!spaceId) {
        showToast('적용할 공간분류를 선택하세요.', 'error');
        return;
    }
    if (selectedQmIds.size === 0) {
        showToast('공간분류를 적용할 부재를 테이블에서 선택하세요.', 'error');
        return;
    }

    try {
        const response = await fetch(
            `/connections/api/quantity-members/manage-spaces/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    member_ids: Array.from(selectedQmIds),
                    space_id: spaceId,
                    action: 'assign',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        showToast(result.message, 'success');
        // 로컬 데이터 업데이트
        loadedQuantityMembers.forEach((member) => {
            if (selectedQmIds.has(member.id)) {
                if (!member.space_classification_ids)
                    member.space_classification_ids = [];
                if (!member.space_classification_ids.includes(spaceId)) {
                    member.space_classification_ids.push(spaceId);
                }
            }
        });
        renderQmSpacesList(); // 화면 새로고침
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * 선택된 부재들에서 모든 공간분류를 제거합니다.
 */
async function clearSpacesFromQm() {
    if (selectedQmIds.size === 0) {
        showToast('공간분류를 제거할 부재를 선택하세요.', 'error');
        return;
    }
    if (
        !confirm(
            `${selectedQmIds.size}개 부재의 모든 공간분류를 제거하시겠습니까?`
        )
    )
        return;

    try {
        const response = await fetch(
            `/connections/api/quantity-members/manage-spaces/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    member_ids: Array.from(selectedQmIds),
                    action: 'clear',
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        showToast(result.message, 'success');
        // 로컬 데이터 업데이트
        loadedQuantityMembers.forEach((member) => {
            if (selectedQmIds.has(member.id))
                member.space_classification_ids = [];
        });
        renderQmSpacesList(); // 화면 새로고침
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * 프로젝트의 모든 '공간분류 할당 룰셋'을 불러옵니다.
 */
async function loadSpaceAssignmentRules() {
    if (!currentProjectId) {
        renderSpaceAssignmentRulesetTable([]);
        return;
    }
    try {
        await loadSpaceClassifications(); // 룰셋 테이블을 그리기 전에 공간 목록이 먼저 필요합니다.
        const response = await fetch(
            `/connections/api/rules/space-assignment/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('공간분류 할당 룰셋 로딩 실패');
        loadedSpaceAssignmentRules = await response.json();
        renderSpaceAssignmentRulesetTable(loadedSpaceAssignmentRules);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * '공간분류 할당 룰셋' 테이블의 액션을 처리합니다.
 */
async function handleSpaceAssignmentRuleActions(event) {
    const target = event.target;
    const ruleRow = target.closest('tr');
    if (!ruleRow) return;
    const ruleId = ruleRow.dataset.ruleId;

    if (target.classList.contains('edit-rule-btn')) {
        renderSpaceAssignmentRulesetTable(loadedSpaceAssignmentRules, ruleId);
    } else if (target.classList.contains('cancel-edit-btn')) {
        renderSpaceAssignmentRulesetTable(loadedSpaceAssignmentRules);
    } else if (target.classList.contains('delete-rule-btn')) {
        if (!confirm('정말 이 규칙을 삭제하시겠습니까?')) return;
        const response = await fetch(
            `/connections/api/rules/space-assignment/${currentProjectId}/${ruleId}/`,
            {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        if (response.ok) {
            showToast('규칙이 삭제되었습니다.', 'success');
            loadSpaceAssignmentRules();
        } else {
            showToast('삭제 실패', 'error');
        }
    } else if (target.classList.contains('save-rule-btn')) {
        let member_filter_conditions;
        try {
            const conditionsStr = ruleRow
                .querySelector('.rule-member-filter-input')
                .value.trim();
            member_filter_conditions = conditionsStr
                ? JSON.parse(conditionsStr)
                : [];
        } catch (e) {
            showToast('부재 필터 조건이 유효한 JSON 형식이 아닙니다.', 'error');
            return;
        }

        const ruleData = {
            id: ruleId !== 'new' ? ruleId : null,
            name: ruleRow.querySelector('.rule-name-input').value,
            priority:
                parseInt(ruleRow.querySelector('.rule-priority-input').value) ||
                0,
            member_filter_conditions: member_filter_conditions,
            member_join_property: ruleRow
                .querySelector('.rule-member-join-input')
                .value.trim(),
            space_join_property: ruleRow
                .querySelector('.rule-space-join-input')
                .value.trim(),
        };

        if (!ruleData.member_join_property || !ruleData.space_join_property) {
            showToast('부재 및 공간 연결 속성은 필수 항목입니다.', 'error');
            return;
        }

        const response = await fetch(
            `/connections/api/rules/space-assignment/${currentProjectId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(ruleData),
            }
        );
        const result = await response.json();
        if (response.ok) {
            showToast(result.message, 'success');
            loadSpaceAssignmentRules();
        } else {
            showToast(result.message, 'error');
        }
    }
}

// ▼▼▼ [추가] CSV 파일이 선택되었을 때 서버로 전송하는 함수 ▼▼▼
async function handleCsvFileSelect(event) {
    if (!currentProjectId || !currentCsvImportUrl) {
        showToast('프로젝트가 선택되지 않았거나, 잘못된 접근입니다.', 'error');
        return;
    }
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csv_file', file);

    try {
        const response = await fetch(currentCsvImportUrl, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData,
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || '파일 업로드에 실패했습니다.');
        }
        showToast(result.message, 'success');

        // 현재 활성화된 탭에 따라 올바른 데이터를 다시 로드합니다.
        if (activeTab === 'ruleset-management') {
            const activeRulesetContent = document.querySelector(
                '.ruleset-content.active'
            );
            if (activeRulesetContent) {
                const rulesetId = activeRulesetContent.id;
                if (rulesetId === 'classification-ruleset')
                    await loadClassificationRules();
                else if (rulesetId === 'mapping-ruleset')
                    await loadPropertyMappingRules();
                else if (rulesetId === 'costcode-ruleset')
                    await loadCostCodeRules();
                else if (rulesetId === 'member-mark-assignment-ruleset')
                    await loadMemberMarkAssignmentRules();
                else if (rulesetId === 'cost-code-assignment-ruleset')
                    await loadCostCodeAssignmentRules();
                else if (rulesetId === 'space-classification-ruleset')
                    await loadSpaceClassificationRules();
                else if (rulesetId === 'space-assignment-ruleset')
                    await loadSpaceAssignmentRules();
            }
        } else if (activeTab === 'cost-code-management') {
            await loadCostCodes();
        } else if (activeTab === 'member-mark-management') {
            await loadMemberMarks();
        } else if (activeTab === 'space-management') {
            // <<< [추가] 이 else if 블록을 추가합니다.
            await loadSpaceClassifications();
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        // 작업 완료 후, 파일 입력과 URL 변수 초기화
        event.target.value = '';
        currentCsvImportUrl = null;
    }
}
// ✅ REPLACE: main.js - function handleCostCodeActions(...)
async function handleCostCodeActions(event) {
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow) return;

    const codeId = actionRow.dataset.codeId;

    // --- 수정 버튼 ---
    if (target.classList.contains('edit-cost-code-btn')) {
        if (
            document.querySelector('#cost-codes-table-container .rule-edit-row')
        ) {
            showToast('이미 편집 중인 항목이 있습니다.', 'error');
            return;
        }
        renderCostCodesTable(loadedCostCodes, codeId);
    }

    // --- 삭제 버튼 ---
    else if (target.classList.contains('delete-cost-code-btn')) {
        if (!confirm('이 공사코드를 정말 삭제하시겠습니까?')) return;
        try {
            const response = await fetch(
                `/connections/api/cost-codes/${currentProjectId}/${codeId}/`,
                {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': csrftoken }, // ✅ CSRF
                    credentials: 'same-origin', // (안전) 쿠키 포함
                }
            );
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
            description: actionRow.querySelector('.cost-description-input')
                .value,
            // ✅ 체크박스 2개 포함
            ai_sd_enabled:
                !!actionRow.querySelector('.cost-ai-sd-input')?.checked,
            dd_enabled: !!actionRow.querySelector('.cost-dd-input')?.checked,
        };

        if (!codeData.code || !codeData.name) {
            showToast('코드와 품명은 반드시 입력해야 합니다.', 'error');
            return;
        }

        const isNew = codeId === 'new';
        const url = isNew
            ? `/connections/api/cost-codes/${currentProjectId}/`
            : `/connections/api/cost-codes/${currentProjectId}/${codeId}/`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken, // ✅ CSRF
                },
                credentials: 'same-origin', // (안전) 쿠키 포함
                body: JSON.stringify(codeData),
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

// ▼▼▼ [교체] 기존 handleSubNavClick 함수 전체를 아래 코드로 교체 ▼▼▼
function handleSubNavClick(e) {
    const clickedButton = e.currentTarget;
    const targetTabId = clickedButton.dataset.tab; // 클릭된 보조 탭 ID (예: "ruleset-management", "ai-model-manager")
    const targetContent = document.getElementById(targetTabId);
    console.log(
        `[DEBUG][handleSubNavClick] Clicked sub-tab button: ${targetTabId}`
    );

    // --- 이미 활성화된 탭이면 무시 ---
    if (
        activeTab === targetTabId &&
        targetContent &&
        targetContent.classList.contains('active')
    ) {
        console.log(
            `[DEBUG][handleSubNavClick] Tab '${targetTabId}' is already the active tab and content is visible. No action needed.`
        );
        return;
    }

    // --- 탭 UI 활성화/비활성화 처리 ---
    const parentNav = clickedButton.closest('.secondary-nav');
    if (parentNav) {
        parentNav
            .querySelector('.sub-nav-button.active')
            ?.classList.remove('active');
        clickedButton.classList.add('active');
    } else {
        console.warn(
            `[WARN][handleSubNavClick] Could not find parent .secondary-nav for clicked button.`
        );
    }

    activeTab = targetTabId; // 전역 activeTab 변수 업데이트
    console.log(
        `[DEBUG][handleSubNavClick] Active tab globally set to: ${activeTab}`
    );

    // 모든 메인 컨텐츠 영역 숨기기
    document
        .querySelectorAll('.main-content > .tab-content.active')
        .forEach((c) => c.classList.remove('active'));

    // 클릭된 탭에 해당하는 컨텐츠 영역 보이기
    if (targetContent) {
        targetContent.classList.add('active');
        console.log(
            `[DEBUG][handleSubNavClick] Content element ID '${targetTabId}' activated.`
        );
    } else {
        console.warn(
            `[WARN][handleSubNavClick] Content element with ID '${targetTabId}' not found.`
        );
        loadDataForActiveTab(); // 컨텐츠 없어도 일단 로드 시도
        return;
    }
    // --- 탭 UI 처리 끝 ---

    // --- 특정 탭 진입 시 하위 탭/데이터 로드 로직 ---
    if (targetTabId === 'ai-model-manager') {
        // 'AI 모델 관리' 탭 진입 시
        console.log(
            "[DEBUG][handleSubNavClick] Entering 'ai-model-manager' tab. Handling inner tabs..."
        );
        const innerNav = targetContent.querySelector('.inner-tab-nav');
        const innerContentContainer = targetContent.querySelector(
            '.inner-tab-content-container'
        );

        if (innerNav && innerContentContainer) {
            let activeInnerButton = innerNav.querySelector(
                '.inner-tab-button.active'
            );
            let targetInnerTabId = activeInnerButton
                ? activeInnerButton.dataset.innerTab
                : 'ai-model-list'; // 기본값 설정

            // 이전에 활성화된 내부 탭이 없거나, 현재 활성화된 내부 탭이 없다면 'ai-model-list'를 강제로 활성화
            if (!activeInnerButton) {
                console.log(
                    "[DEBUG][handleSubNavClick] No active inner AI tab found, forcing 'ai-model-list'."
                );
                targetInnerTabId = 'ai-model-list';
                // UI 강제 업데이트
                innerNav
                    .querySelector('.inner-tab-button.active')
                    ?.classList.remove('active');
                innerNav
                    .querySelector('[data-inner-tab="ai-model-list"]')
                    ?.classList.add('active');
                innerContentContainer
                    .querySelector('.inner-tab-content.active')
                    ?.classList.remove('active');
                innerContentContainer
                    .querySelector('#ai-model-list')
                    ?.classList.add('active');
                activeInnerButton = innerNav.querySelector(
                    '[data-inner-tab="ai-model-list"]'
                );
            } else {
                // 이미 활성화된 내부 탭이 있으면 해당 ID 사용
                targetInnerTabId = activeInnerButton.dataset.innerTab;
                console.log(
                    `[DEBUG][handleSubNavClick] Found previously active inner AI tab: ${targetInnerTabId}`
                );
            }

            // ★★★ 핵심: 결정된 내부 탭 ID로 데이터 로드 함수 호출 ★★★
            console.log(
                `[DEBUG][handleSubNavClick] Loading data for inner AI tab: ${targetInnerTabId}`
            );
            loadDataForAiInnerTab(targetInnerTabId); // 데이터 로드 호출 보장
        } else {
            console.warn(
                "[WARN][handleSubNavClick] Inner tab navigation or content container not found in 'ai-model-manager'. Loading default data for the tab."
            );
            loadDataForActiveTab();
        }
    } else if (targetTabId === 'ruleset-management') {
        // '룰셋 관리' 탭 진입 시 (기존 로직 유지)
        console.log(
            "[DEBUG][handleSubNavClick] Entering 'ruleset-management' tab. Handling ruleset types..."
        );
        const rulesetNavContainer = targetContent.querySelector('.ruleset-nav');
        if (rulesetNavContainer) {
            let activeRulesetButton = rulesetNavContainer.querySelector(
                '.ruleset-nav-button.active'
            );
            if (!activeRulesetButton) {
                activeRulesetButton = rulesetNavContainer.querySelector(
                    '[data-ruleset="classification-ruleset"]'
                );
                console.log(
                    "[DEBUG][handleSubNavClick] No active ruleset type, activating default 'classification-ruleset'."
                );
            }
            if (activeRulesetButton) {
                console.log(
                    `[DEBUG][handleSubNavClick] Programmatically clicking ruleset type button: ${activeRulesetButton.dataset.ruleset}`
                );
                // 클릭 이벤트는 loadSpecificRuleset을 호출하므로, 데이터 로드가 보장됨
                if (!activeRulesetButton.classList.contains('active')) {
                    // 이미 활성화된 상태가 아니라면 클릭
                    activeRulesetButton.click();
                } else {
                    // 이미 활성화 상태라면 직접 데이터 로드 함수 호출
                    loadSpecificRuleset(activeRulesetButton.dataset.ruleset);
                }
            } else {
                console.warn(
                    "[WARN][handleSubNavClick] Could not find default ruleset type button 'classification-ruleset'."
                );
                loadDataForActiveTab();
            }
        } else {
            console.warn(
                "[WARN][handleSubNavClick] Ruleset navigation container not found in 'ruleset-management'. Loading default data for the tab."
            );
            loadDataForActiveTab();
        }
    } else {
        // 다른 모든 보조 탭들은 바로 데이터 로드
        console.log(
            `[DEBUG][handleSubNavClick] Calling loadDataForActiveTab() directly for tab '${activeTab}'...`
        );
        loadDataForActiveTab();
    }
    console.log('[DEBUG][handleSubNavClick] Function end.');
}
// ▲▲▲ [교체] 여기까지 ▲▲▲

function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

// [추가] 컨텍스트별 디바운스된 렌더
const debouncedRender = (contextPrefix) =>
    debounce(() => {
        const containerId =
            contextPrefix === 'data-management'
                ? 'data-management-data-table-container'
                : 'space-management-data-table-container';
        renderDataTable(containerId, contextPrefix);
    }, 300);

/**
 * [임시] '집계' 탭의 내용을 Excel로 내보내는 기능 (현재는 미구현)
 */
function exportBoqReportToExcel() {
    console.log("[DEBUG] 'Excel 내보내기' 버튼 클릭됨 (현재 미구현).");
    showToast('Excel 내보내기 기능은 현재 준비 중입니다.', 'info');
    // TODO: SheetJS 등의 라이브러리를 사용하여 실제 Excel 내보내기 기능 구현
}

/**
 * 6단계의 자동화 프로세스를 순차적으로 실행하는 '일괄 자동 업데이트' 함수입니다.
 */
async function runBatchAutoUpdate() {
    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        return;
    }

    if (
        !confirm(
            '정말로 모든 자동화 프로세스를 순차적으로 실행하시겠습니까?\n이 작업은 시간이 다소 소요될 수 있습니다.'
        )
    ) {
        return;
    }

    console.log('[DEBUG] --- 일괄 자동 업데이트 시작 ---');

    // Promise를 사용하여 데이터 가져오기 완료를 기다리는 로직
    const waitForDataFetch = () =>
        new Promise((resolve, reject) => {
            // 완료 또는 실패 시 호출될 리스너 함수
            const listener = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'revit_data_complete') {
                    frontendSocket.removeEventListener('message', listener); // 리스너 정리
                    console.log(
                        '[DEBUG] (1/6) 데이터 가져오기 완료 신호 수신.'
                    );
                    resolve();
                }
            };

            // websocket 메시지 리스너 추가
            frontendSocket.addEventListener('message', listener);

            // 데이터 가져오기 시작
            console.log('[DEBUG] (1/6) BIM 원본데이터 가져오기 시작...');
            showToast('1/6: BIM 원본데이터를 가져옵니다...', 'info');
            fetchDataFromClient();

            // 타임아웃 설정 (예: 5분)
            setTimeout(() => {
                frontendSocket.removeEventListener('message', listener);
                reject(new Error('데이터 가져오기 시간 초과.'));
            }, 300000);
        });
    try {
        // 1. 데이터 가져오기 (완료될 때까지 대기)
        await waitForDataFetch();
        showToast('✅ (1/6) 데이터 가져오기 완료.', 'success');
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 다음 단계 전 잠시 대기

        // 2. 룰셋 일괄적용 (확인창 없이 실행)
        console.log('[DEBUG] (2/6) 분류 할당 룰셋 적용 시작...');
        showToast('2/6: 분류 할당 룰셋을 적용합니다...', 'info');
        await applyClassificationRules(true); // skipConfirmation = true
        showToast('✅ (2/6) 분류 할당 룰셋 적용 완료.', 'success');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 3. 수량산출부재 자동 생성 (확인창 없이 실행)
        console.log('[DEBUG] (3/6) 수량산출부재 자동 생성 시작...');
        showToast('3/6: 수량산출부재를 자동 생성합니다...', 'info');
        await createAutoQuantityMembers(true); // skipConfirmation = true
        showToast('✅ (3/6) 수량산출부재 자동 생성 완료.', 'success');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 4. 할당 룰셋 일괄 적용 (확인창 없이 실행)
        console.log('[DEBUG] (4/6) 할당 룰셋 일괄 적용 시작...');
        showToast(
            '4/6: 할당 룰셋(일람부호, 공사코드)을 일괄 적용합니다...',
            'info'
        );
        await applyAssignmentRules(true); // skipConfirmation = true
        showToast('✅ (4/6) 할당 룰셋 일괄 적용 완료.', 'success');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 5. 산출항목 자동 생성 (확인창 없이 실행)
        console.log('[DEBUG] (5/6) 산출항목 자동 생성 시작...');
        showToast('5/6: 산출항목을 자동 생성합니다...', 'info');
        await createAutoCostItems(true); // skipConfirmation = true
        showToast('✅ (5/6) 산출항목 자동 생성 완료.', 'success');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // ▼▼▼ [수정] 6번째 단계 - 집계표 생성 전 그룹핑 확인/설정 ▼▼▼
        console.log('[DEBUG] (6/6) 집계표 생성 준비...');
        showToast('6/6: 최종 집계표를 생성합니다...', 'info');

        // 상세견적(DD) 탭으로 강제 전환
        // ▼▼▼ [수정] 셀렉터 변경 ▼▼▼
        const ddTabButton = document.querySelector(
            '.main-nav .nav-button[data-primary-tab="detailed-estimation-dd"]'
        );
        // ▲▲▲ 수정 끝 ▲▲▲
        if (ddTabButton && !ddTabButton.classList.contains('active')) {
            console.log(
                '[DEBUG] Switching to Detailed Estimation (DD) tab for report generation...'
            );
            ddTabButton.click(); // 탭 클릭 이벤트 실행 (내부적으로 loadDataForActiveTab 호출됨)
            await new Promise((resolve) => setTimeout(resolve, 1500)); // 데이터 로드 시간 대기
        } else {
            // 이미 해당 탭이면 짧은 지연 시간만 줌
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const boqGroupingControls = document.getElementById(
            'boq-grouping-controls'
        );
        const groupBySelects = boqGroupingControls?.querySelectorAll(
            '.boq-group-by-select'
        );

        // 그룹핑 기준이 하나도 없는 경우, 첫 번째 사용 가능한 필드로 기본 그룹핑 추가
        if (
            boqGroupingControls &&
            (!groupBySelects || groupBySelects.length === 0)
        ) {
            console.log(
                '[DEBUG] No grouping criteria found. Adding default grouping...'
            );
            if (availableBoqFields.length > 0) {
                addBoqGroupingLevel(); // 첫 번째 레벨 추가
                const firstSelect = boqGroupingControls.querySelector(
                    '.boq-group-by-select'
                );
                if (firstSelect && availableBoqFields[0]) {
                    firstSelect.value = availableBoqFields[0].value; // 첫 번째 필드를 기본값으로 설정
                    console.log(
                        `[DEBUG] Default grouping set to: ${availableBoqFields[0].label}`
                    );
                } else {
                    console.warn(
                        '[WARN] Could not set default grouping value automatically.'
                    );
                }
            } else {
                console.error(
                    '[ERROR] Cannot add default grouping because availableBoqFields is empty.'
                );
                throw new Error(
                    '집계표를 생성하기 위한 그룹핑 필드 정보를 불러올 수 없습니다.'
                );
            }
        } else {
            console.log(
                '[DEBUG] Existing grouping criteria found or container not available.'
            );
        }

        // 집계표 생성 함수 호출 (함수 이름은 그대로 사용)
        generateBoqReport();
        showToast('✅ (6/6) 상세견적(DD) 집계표 생성 완료.', 'success');
        // ▲▲▲ [수정] 여기까지 입니다 ▲▲▲

        showToast('🎉 모든 자동화 프로세스가 완료되었습니다.', 'success', 5000);
        console.log('[DEBUG] --- 일괄 자동 업데이트 성공적으로 완료 ---');
    } catch (error) {
        console.error('[ERROR] 일괄 자동 업데이트 중 오류 발생:', error);
        showToast(`오류 발생: ${error.message}`, 'error', 5000);
    } finally {
        // 프로세스 종료 후 항상 프로젝트 선택 가능하도록 복원
        const projectSelector = document.getElementById('project-selector');
        if (projectSelector) projectSelector.disabled = false;
    }
}
async function loadCostCodesForUnitPrice() {
    console.log('[DEBUG][loadCostCodesForUnitPrice] Start');
    if (!currentProjectId) {
        console.log(
            '[INFO][loadCostCodesForUnitPrice] No project selected. Skipping load.'
        );
        renderCostCodeListForUnitPrice([]);
        return;
    }
    try {
        console.log(
            `[DEBUG][loadCostCodesForUnitPrice] Fetching cost codes for project ${currentProjectId}...`
        );
        const response = await fetch(
            `/connections/api/cost-codes/${currentProjectId}/`
        );
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to load cost codes: ${response.status} ${errorText}`
            );
        }
        loadedCostCodes = await response.json();
        console.log(
            `[DEBUG][loadCostCodesForUnitPrice] Successfully loaded ${loadedCostCodes.length} cost codes.`
        );
        renderCostCodeListForUnitPrice(loadedCostCodes);
    } catch (error) {
        console.error('[ERROR][loadCostCodesForUnitPrice] Failed:', error);
        showToast(`공사코드 목록 로딩 실패: ${error.message}`, 'error');
        renderCostCodeListForUnitPrice([]);
    }
}
function handleCostCodeSelectionForUnitPrice(event) {
    console.log('[DEBUG][handleCostCodeSelectionForUnitPrice] Start');
    const targetItem = event.target.closest('.cost-code-item');
    if (!targetItem) {
        console.log(
            '[DEBUG][handleCostCodeSelectionForUnitPrice] Clicked outside a cost code item.'
        );
        return;
    }

    const costCodeId = targetItem.dataset.id;
    if (!costCodeId) {
        console.warn(
            '[WARN][handleCostCodeSelectionForUnitPrice] Clicked item has no data-id.'
        );
        return;
    }

    if (costCodeId === selectedCostCodeIdForUnitPrice) {
        console.log(
            `[DEBUG][handleCostCodeSelectionForUnitPrice] Cost code ${costCodeId} is already selected.`
        );
        return; // 이미 선택된 항목이면 무시
    }

    // 다른 항목 편집 중이면 경고 후 중단
    const isEditingPrice = document.querySelector(
        '#unit-price-table-container .editable-row'
    );
    if (isEditingPrice) {
        showToast(
            '편집 중인 단가가 있습니다. 먼저 저장하거나 취소하세요.',
            'warning'
        );
        console.log(
            '[WARN][handleCostCodeSelectionForUnitPrice] Aborted due to ongoing price edit.'
        );
        return;
    }

    selectedCostCodeIdForUnitPrice = costCodeId;
    console.log(
        `[DEBUG][handleCostCodeSelectionForUnitPrice] Selected cost code ID set to: ${selectedCostCodeIdForUnitPrice}`
    );

    // UI 업데이트
    const container = document.getElementById('unit-price-cost-code-list');
    container
        .querySelector('.cost-code-item.selected')
        ?.classList.remove('selected');
    targetItem.classList.add('selected');
    console.log(
        `[DEBUG][handleCostCodeSelectionForUnitPrice] Item ${costCodeId} highlighted.`
    );

    const selectedCode = loadedCostCodes.find((c) => c.id === costCodeId);
    const header = document.getElementById('unit-price-list-header');
    if (header && selectedCode) {
        header.textContent = `단가 리스트 (${selectedCode.code} - ${selectedCode.name})`;
        console.log(
            `[DEBUG][handleCostCodeSelectionForUnitPrice] Price list header updated.`
        );
    }
    document.getElementById('add-unit-price-btn').disabled = false;
    console.log(
        `[DEBUG][handleCostCodeSelectionForUnitPrice] 'Add Unit Price' button enabled.`
    );

    // 단가 목록 로드
    loadUnitPrices(costCodeId);
    console.log('[DEBUG][handleCostCodeSelectionForUnitPrice] End');
}
async function loadUnitPriceTypes() {
    console.log('[DEBUG][loadUnitPriceTypes] Start');
    if (!currentProjectId) {
        console.log(
            '[INFO][loadUnitPriceTypes] No project selected. Skipping load.'
        );
        renderUnitPriceTypesTable([]);
        return;
    }
    try {
        console.log(
            `[DEBUG][loadUnitPriceTypes] Fetching unit price types for project ${currentProjectId}...`
        );
        const response = await fetch(
            `/connections/api/unit-price-types/${currentProjectId}/`
        );
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to load unit price types: ${response.status} ${errorText}`
            );
        }
        loadedUnitPriceTypes = await response.json();
        console.log(
            `[DEBUG][loadUnitPriceTypes] Successfully loaded ${loadedUnitPriceTypes.length} unit price types.`
        );
        renderUnitPriceTypesTable(loadedUnitPriceTypes);
    } catch (error) {
        console.error('[ERROR][loadUnitPriceTypes] Failed:', error);
        showToast(`단가 구분 목록 로딩 실패: ${error.message}`, 'error');
        renderUnitPriceTypesTable([]);
    }
}
async function handleUnitPriceTypeActions(event) {
    console.log('[DEBUG][handleUnitPriceTypeActions] Start');
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow) return;

    const typeId = actionRow.dataset.id;
    const isEditRow = document.querySelector(
        '#unit-price-type-table-container .editable-row'
    ); // 현재 편집 중인 행 (자신 포함)

    console.log(
        `[DEBUG][handleUnitPriceTypeActions] Clicked target: ${target.tagName}.${target.className}, Row ID: ${typeId}`
    );

    // 현재 수정/추가 중인 행이 있고, 클릭된 버튼이 해당 행의 버튼이 아니면 경고
    if (isEditRow && isEditRow !== actionRow && target.tagName === 'BUTTON') {
        showToast(
            '편집 중인 단가 구분이 있습니다. 먼저 저장하거나 취소하세요.',
            'warning'
        );
        console.log(
            '[WARN][handleUnitPriceTypeActions] Aborted due to ongoing edit in another row.'
        );
        return;
    }

    if (target.classList.contains('edit-type-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceTypeActions] Edit button clicked for ID: ${typeId}`
        );
        renderUnitPriceTypesTable(loadedUnitPriceTypes, typeId);
    } else if (target.classList.contains('delete-type-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceTypeActions] Delete button clicked for ID: ${typeId}`
        );
        const typeToDelete = loadedUnitPriceTypes.find((t) => t.id === typeId);
        if (
            confirm(
                `'${
                    typeToDelete?.name || typeId
                }' 단가 구분을 삭제하시겠습니까? (사용 중이면 삭제되지 않습니다)`
            )
        ) {
            await deleteUnitPriceType(typeId);
        } else {
            console.log(
                '[DEBUG][handleUnitPriceTypeActions] Delete cancelled by user.'
            );
        }
    } else if (target.classList.contains('save-type-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceTypeActions] Save button clicked for ID: ${typeId}`
        );
        const nameInput = actionRow.querySelector('.type-name-input');
        const descInput = actionRow.querySelector('.type-description-input');
        const typeData = {
            id: typeId === 'new' ? null : typeId,
            name: nameInput.value.trim(),
            description: descInput.value.trim(),
        };
        if (!typeData.name) {
            showToast('단가 구분 이름은 필수입니다.', 'error');
            return;
        }
        console.log(
            '[DEBUG][handleUnitPriceTypeActions] Calling saveUnitPriceType with data:',
            typeData
        );
        await saveUnitPriceType(typeData);
    } else if (target.classList.contains('cancel-type-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceTypeActions] Cancel button clicked for ID: ${typeId}`
        );
        renderUnitPriceTypesTable(loadedUnitPriceTypes);
    }
    console.log('[DEBUG][handleUnitPriceTypeActions] End');
}
async function saveUnitPriceType(typeData) {
    console.log('[DEBUG][saveUnitPriceType] Start, Data:', typeData);
    if (!currentProjectId) {
        console.error('[ERROR][saveUnitPriceType] Project ID is missing.');
        return;
    }

    const isNew = !typeData.id;
    const url = isNew
        ? `/connections/api/unit-price-types/${currentProjectId}/`
        : `/connections/api/unit-price-types/${currentProjectId}/${typeData.id}/`;
    const method = isNew ? 'POST' : 'PUT';

    try {
        console.log(
            `[DEBUG][saveUnitPriceType] Sending request: ${method} ${url}`
        );
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({
                name: typeData.name,
                description: typeData.description,
            }),
        });
        const result = await response.json();
        console.log('[DEBUG][saveUnitPriceType] Server response:', result);

        if (!response.ok)
            throw new Error(
                result.message || (isNew ? '생성 실패' : '수정 실패')
            );

        showToast(result.message, 'success');
        await loadUnitPriceTypes(); // 목록 새로고침
    } catch (error) {
        console.error('[ERROR][saveUnitPriceType] Failed:', error);
        showToast(error.message, 'error');
        renderUnitPriceTypesTable(loadedUnitPriceTypes); // 실패 시 편집 상태 해제
    }
}
async function deleteUnitPriceType(typeId) {
    console.log(`[DEBUG][deleteUnitPriceType] Start, ID: ${typeId}`);
    if (!currentProjectId) {
        console.error('[ERROR][deleteUnitPriceType] Project ID is missing.');
        return;
    }

    try {
        const url = `/connections/api/unit-price-types/${currentProjectId}/${typeId}/`;
        console.log(
            `[DEBUG][deleteUnitPriceType] Sending request: DELETE ${url}`
        );
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': csrftoken },
        });
        const result = await response.json();
        console.log('[DEBUG][deleteUnitPriceType] Server response:', result);

        if (!response.ok) throw new Error(result.message || '삭제 실패');

        showToast(result.message, 'success');
        await loadUnitPriceTypes(); // 목록 새로고침
    } catch (error) {
        console.error('[ERROR][deleteUnitPriceType] Failed:', error);
        showToast(error.message, 'error');
        // 삭제 실패해도 목록은 다시 그림 (보호된 경우 등 메시지 표시 후 상태 복귀)
        renderUnitPriceTypesTable(loadedUnitPriceTypes);
    }
}
async function loadUnitPrices(costCodeId) {
    console.log(`[DEBUG][loadUnitPrices] Start, CostCode ID: ${costCodeId}`);
    if (!currentProjectId) {
        console.log(
            '[INFO][loadUnitPrices] No project selected. Skipping load.'
        );
        renderUnitPricesTable([]);
        return;
    }
    if (!costCodeId) {
        console.warn(
            '[WARN][loadUnitPrices] CostCode ID is missing. Clearing table.'
        );
        renderUnitPricesTable([]);
        return;
    }
    try {
        console.log(
            `[DEBUG][loadUnitPrices] Fetching unit prices for project ${currentProjectId}, cost code ${costCodeId}...`
        );
        const url = `/connections/api/unit-prices/${currentProjectId}/${costCodeId}/`;
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to load unit prices: ${response.status} ${errorText}`
            );
        }
        loadedUnitPrices = await response.json();
        console.log(
            `[DEBUG][loadUnitPrices] Successfully loaded ${loadedUnitPrices.length} unit prices.`
        );
        renderUnitPricesTable(loadedUnitPrices);
    } catch (error) {
        console.error('[ERROR][loadUnitPrices] Failed:', error);
        showToast(`단가 목록 로딩 실패: ${error.message}`, 'error');
        renderUnitPricesTable([]);
    }
}

async function handleUnitPriceActions(event) {
    console.log('[DEBUG][handleUnitPriceActions] Start');
    const target = event.target;
    const actionRow = target.closest('tr');
    if (!actionRow) return;

    const priceId = actionRow.dataset.id;
    const isEditRow = document.querySelector(
        '#unit-price-table-container .editable-row'
    );

    console.log(
        `[DEBUG][handleUnitPriceActions] Clicked target: ${target.tagName}.${target.className}, Row ID: ${priceId}`
    );

    // 현재 수정/추가 중인 행이 있고, 클릭된 버튼이 해당 행의 버튼이 아니면 경고
    if (isEditRow && isEditRow !== actionRow && target.tagName === 'BUTTON') {
        showToast(
            '편집 중인 단가가 있습니다. 먼저 저장하거나 취소하세요.',
            'warning'
        );
        console.log(
            '[WARN][handleUnitPriceActions] Aborted due to ongoing edit in another row.'
        );
        return;
    }

    if (target.classList.contains('edit-price-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceActions] Edit button clicked for ID: ${priceId}`
        );
        // 수정 시작 시 원본 데이터 저장
        currentUnitPriceEditState.id = priceId;
        currentUnitPriceEditState.originalData = loadedUnitPrices.find(
            (p) => p.id === priceId
        );
        renderUnitPricesTable(loadedUnitPrices, priceId);
    } else if (target.classList.contains('delete-price-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceActions] Delete button clicked for ID: ${priceId}`
        );
        const priceToDelete = loadedUnitPrices.find((p) => p.id === priceId);
        if (
            confirm(
                `'${
                    priceToDelete?.unit_price_type_name || priceId
                }' 단가를 삭제하시겠습니까?`
            )
        ) {
            await deleteUnitPrice(priceId);
        } else {
            console.log(
                '[DEBUG][handleUnitPriceActions] Delete cancelled by user.'
            );
        }
    } else if (target.classList.contains('save-price-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceActions] Save button clicked for ID: ${priceId}`
        );
        const typeSelect = actionRow.querySelector('.price-type-select');
        const materialInput = actionRow.querySelector('.price-material-input');
        const laborInput = actionRow.querySelector('.price-labor-input');
        const expenseInput = actionRow.querySelector('.price-expense-input');
        // ▼▼▼ [추가] 합계 입력 필드 가져오기 ▼▼▼
        const totalInput = actionRow.querySelector('.price-total-input'); // 합계 필드 추가 가정 (ui.js 수정 필요)

        // 합계 직접 입력 가능 여부 확인 (M, L, E 필드가 모두 비어있거나 0인지)
        const isTotalDirectInput =
            (!materialInput.value || parseFloat(materialInput.value) === 0) &&
            (!laborInput.value || parseFloat(laborInput.value) === 0) &&
            (!expenseInput.value || parseFloat(expenseInput.value) === 0) &&
            totalInput &&
            totalInput.value &&
            parseFloat(totalInput.value) > 0;

        const priceData = {
            id: priceId === 'new' ? null : priceId,
            unit_price_type_id: typeSelect.value,
            material_cost: materialInput.value, // 문자열로 전달 (백엔드에서 Decimal 변환)
            labor_cost: laborInput.value,
            expense_cost: expenseInput.value,
            // ▼▼▼ [수정] 합계 필드 값도 전달 ▼▼▼
            total_cost: totalInput ? totalInput.value : '0.0', // 합계 필드가 있으면 그 값을 전달
        };

        console.log(
            '[DEBUG][handleUnitPriceActions] Price data to save:',
            priceData
        );

        if (!priceData.unit_price_type_id) {
            showToast('단가 구분을 선택하세요.', 'error');
            return;
        }

        // 입력값 유효성 검사 (숫자인지)
        const costs = [
            priceData.material_cost,
            priceData.labor_cost,
            priceData.expense_cost,
            priceData.total_cost,
        ];
        if (costs.some((cost) => cost && isNaN(parseFloat(cost)))) {
            showToast('단가 값은 유효한 숫자로 입력해야 합니다.', 'error');
            console.error(
                '[ERROR][handleUnitPriceActions] Invalid number input detected.'
            );
            return;
        }

        await saveUnitPrice(priceData);
        currentUnitPriceEditState = { id: null, originalData: null }; // 저장 후 상태 초기화
    } else if (target.classList.contains('cancel-price-btn')) {
        console.log(
            `[DEBUG][handleUnitPriceActions] Cancel button clicked for ID: ${priceId}`
        );
        currentUnitPriceEditState = { id: null, originalData: null }; // 취소 시 상태 초기화
        renderUnitPricesTable(loadedUnitPrices);
    }
    console.log('[DEBUG][handleUnitPriceActions] End');
}

/**
 * 단가 저장 API 호출
 */
async function saveUnitPrice(priceData) {
    console.log('[DEBUG][saveUnitPrice] Start, Data:', priceData);
    if (!currentProjectId || !selectedCostCodeIdForUnitPrice) {
        console.error(
            '[ERROR][saveUnitPrice] Project ID or selected Cost Code ID is missing.'
        );
        return;
    }

    const isNew = !priceData.id;
    const url = isNew
        ? `/connections/api/unit-prices/${currentProjectId}/${selectedCostCodeIdForUnitPrice}/`
        : `/connections/api/unit-prices/${currentProjectId}/${selectedCostCodeIdForUnitPrice}/${priceData.id}/`;
    const method = isNew ? 'POST' : 'PUT';

    // 백엔드로 보낼 데이터 준비 (Decimal 변환은 백엔드에서)
    const payload = {
        unit_price_type_id: priceData.unit_price_type_id,
        material_cost: priceData.material_cost || '0.0', // 빈 문자열 대신 '0.0'
        labor_cost: priceData.labor_cost || '0.0',
        expense_cost: priceData.expense_cost || '0.0',
        total_cost: priceData.total_cost || '0.0', // 합계도 전달
    };
    console.log(
        `[DEBUG][saveUnitPrice] Payload for ${method} ${url}:`,
        payload
    );

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        console.log('[DEBUG][saveUnitPrice] Server response:', result);

        if (!response.ok)
            throw new Error(
                result.message || (isNew ? '추가 실패' : '수정 실패')
            );

        showToast(result.message, 'success');
        await loadUnitPrices(selectedCostCodeIdForUnitPrice); // 목록 새로고침
    } catch (error) {
        console.error('[ERROR][saveUnitPrice] Failed:', error);
        showToast(error.message, 'error');
        // 실패 시 편집 상태 유지 또는 해제 결정 필요 (현재는 해제)
        renderUnitPricesTable(loadedUnitPrices);
    }
}

/**
 * 단가 삭제 API 호출
 */
async function deleteUnitPrice(priceId) {
    console.log(`[DEBUG][deleteUnitPrice] Start, ID: ${priceId}`);
    if (!currentProjectId || !selectedCostCodeIdForUnitPrice) {
        console.error(
            '[ERROR][deleteUnitPrice] Project ID or selected Cost Code ID is missing.'
        );
        return;
    }

    try {
        const url = `/connections/api/unit-prices/${currentProjectId}/${selectedCostCodeIdForUnitPrice}/${priceId}/`;
        console.log(`[DEBUG][deleteUnitPrice] Sending request: DELETE ${url}`);
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': csrftoken },
        });
        const result = await response.json();
        console.log('[DEBUG][deleteUnitPrice] Server response:', result);

        if (!response.ok) throw new Error(result.message || '삭제 실패');

        showToast(result.message, 'success');
        await loadUnitPrices(selectedCostCodeIdForUnitPrice); // 목록 새로고침
    } catch (error) {
        console.error('[ERROR][deleteUnitPrice] Failed:', error);
        showToast(error.message, 'error');
        // 실패해도 목록 다시 그림
        renderUnitPricesTable(loadedUnitPrices);
    }
}

/**
 * [수정] 단가 입력 필드 변경 시 합계 자동 계산 + 합계 직접 입력 가능 로직
 */
function handleUnitPriceInputChange(event) {
    const input = event.target;
    const row = input.closest('tr.editable-row');
    if (!row) return; // 편집 중인 행이 아니면 무시

    console.log(
        `[DEBUG][handleUnitPriceInputChange] Input changed in row ${row.dataset.id}, field: ${input.className}`
    );

    const materialInput = row.querySelector('.price-material-input');
    const laborInput = row.querySelector('.price-labor-input');
    const expenseInput = row.querySelector('.price-expense-input');
    const totalInput = row.querySelector('.price-total-input'); // 합계 'input' 가정
    const totalOutput = row.querySelector('.price-total-output'); // 보기 모드 합계 'td'

    // 입력된 필드가 M, L, E 중 하나인지 확인
    const isComponentInput =
        input === materialInput ||
        input === laborInput ||
        input === expenseInput;
    // 입력된 필드가 T 인지 확인
    const isTotalInput = input === totalInput;

    let material = parseFloat(materialInput?.value) || 0;
    let labor = parseFloat(laborInput?.value) || 0;
    let expense = parseFloat(expenseInput?.value) || 0;
    let total = parseFloat(totalInput?.value) || 0; // 현재 합계 필드 값

    if (isComponentInput) {
        // M, L, E 중 하나라도 값이 입력되면 합계를 자동으로 계산하고 업데이트
        const calculatedTotal = material + labor + expense;
        console.log(
            `[DEBUG][handleUnitPriceInputChange] Component input changed. Calculated total: ${calculatedTotal}`
        );
        if (totalInput) {
            totalInput.value = calculatedTotal.toFixed(4); // 합계 input 업데이트
            // 합계 필드를 읽기 전용으로 만들거나 비활성화하여 직접 수정을 막을 수도 있음
            // totalInput.readOnly = true;
        }
        if (totalOutput) {
            // 보기 모드에서도 업데이트 (현재 구조상 필요 없을 수 있음)
            totalOutput.textContent = calculatedTotal.toFixed(4);
        }
    } else if (isTotalInput) {
        // 합계 필드가 직접 수정되면 M, L, E 값을 0으로 설정하거나 비활성화
        console.log(
            `[DEBUG][handleUnitPriceInputChange] Total input changed directly to: ${total}`
        );
        if (total > 0) {
            // 합계가 0보다 클 때만
            if (materialInput) materialInput.value = '0.0000';
            if (laborInput) laborInput.value = '0.0000';
            if (expenseInput) expenseInput.value = '0.0000';
            console.log(
                '[DEBUG][handleUnitPriceInputChange] Component inputs cleared because total was entered directly.'
            );
            // M, L, E 필드를 읽기 전용/비활성화 할 수도 있음
            // materialInput.readOnly = true; laborInput.readOnly = true; expenseInput.readOnly = true;
        } else {
            // 합계가 0이면 M, L, E 입력 가능하게 복원 (필요 시)
            // materialInput.readOnly = false; laborInput.readOnly = false; expenseInput.readOnly = false;
        }
        if (totalOutput) {
            // 보기 모드 업데이트
            totalOutput.textContent = total.toFixed(4);
        }
    }
}
// ▼▼▼ [교체] 기존 loadDataForActiveTab 함수 전체를 아래 코드로 교체 ▼▼▼
function loadDataForActiveTab() {
    console.log(
        `[DEBUG][loadDataForActiveTab] Loading data for active tab: ${activeTab}`
    ); // 디버깅
    if (!currentProjectId) {
        console.warn(
            '[WARN][loadDataForActiveTab] No project selected. Clearing UI and aborting data load.'
        ); // 디버깅
        clearAllTabData(); // 프로젝트 없으면 모든 UI 클리어
        return;
    }

    // --- 각 탭에 필요한 데이터 로드 로직 ---
    switch (activeTab) {
        case 'ruleset-management':
            // 룰셋 종류 탭(handleRulesetNavClick -> loadSpecificRuleset)에서 실제 로드가 일어나므로 여기서는 패스
            console.log(
                `[DEBUG][loadDataForActiveTab] Ruleset tab activated. Specific ruleset will be loaded by its handler.`
            ); // 디버깅
            // 혹시 모를 초기 상태 위해 기본 룰셋 로드 호출 (선택적)
            // loadSpecificRuleset('classification-ruleset');
            break;
        case 'cost-code-management':
            console.log(`[DEBUG][loadDataForActiveTab] Loading Cost Codes.`); // 디버깅
            loadCostCodes();
            break;
        case 'member-mark-management':
            console.log(`[DEBUG][loadDataForActiveTab] Loading Member Marks.`); // 디버깅
            loadMemberMarks();
            break;
        case 'tag-management':
            console.log(
                `[DEBUG][loadDataForActiveTab] Tags are loaded via WebSocket. Ensuring UI consistency.`
            ); // 디버깅
            updateTagLists(allTags); // 현재 메모리에 있는 태그로 UI 갱신
            break;
        case 'space-management':
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading Space Classifications and initializing UI.`
            ); // 디버깅
            loadSpaceClassifications(); // 공간 트리 로드
            populateFieldSelection(); // 테이블용 필드 목록 채우기
            renderDataTable(
                'space-management-data-table-container',
                'space-management'
            ); // 테이블 초기 렌더링 (데이터 로드 전)
            break;
        case 'unit-price-management':
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading Unit Price data (CostCodes, Types) and initializing UI.`
            ); // 디버깅
            loadCostCodesForUnitPrice(); // 왼쪽 공사코드 목록
            loadUnitPriceTypes(); // 오른쪽 위 단가 구분 목록
            // UI 초기화 (선택된 코드 없음 상태)
            selectedCostCodeIdForUnitPrice = null;
            document.getElementById('add-unit-price-btn').disabled = true;
            document.getElementById('unit-price-list-header').textContent =
                '단가 리스트 (공사코드를 선택하세요)';
            renderUnitPricesTable([]); // 오른쪽 아래 단가 목록 비우기
            break;
        case 'data-management':
            console.log(
                `[DEBUG][loadDataForActiveTab] Initializing Data Management UI. Data loaded via WebSocket.`
            ); // 디버깅
            populateFieldSelection(); // 필드 목록 채우기
            // BIM 데이터(allRevitData)는 WebSocket 'all_elements' 수신 시 채워짐
            renderDataTable(
                'data-management-data-table-container',
                'data-management'
            ); // 테이블 초기 렌더링 (데이터 로드 전)
            break;
        case 'quantity-members':
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading QM dependencies (Members, Codes, Marks, Spaces).`
            ); // 디버깅
            loadQuantityMembers(); // 부재 목록 (핵심)
            loadCostCodes(); // 오른쪽 패널 드롭다운용
            loadMemberMarks(); // 오른쪽 패널 드롭다운용
            loadSpaceClassifications(); // 오른쪽 패널 드롭다운용
            break;
        case 'cost-item-management':
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading CI dependencies (Items, Members, Codes, Marks).`
            ); // 디버깅
            loadCostItems(); // 산출 항목 목록 (핵심)
            loadQuantityMembers(); // 오른쪽 패널 상세 정보용
            loadCostCodes(); // 오른쪽 패널 상세 정보용 (필요 시)
            loadMemberMarks(); // 오른쪽 패널 상세 정보용
            break;
        case 'detailed-estimation-dd':
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading DD dependencies (Items, Members, BIM, BOQ Fields, Unit Types).`
            ); // 디버깅
            // BOQ 생성에 필요한 데이터 로드
            loadCostItems(); // BOQ는 CostItem 기반
            loadQuantityMembers(); // CostItem -> QM 참조
            loadMemberMarks(); // CostItem -> QM -> MM 참조
            loadUnitPriceTypes(); // 단가 기준 목록용 (loadedUnitPriceTypesForBoq 아님)
            loadBoqGroupingFields(); // 그룹핑 필드 목록 로드

            // BIM 데이터 확인 및 필요시 요청
            if (
                allRevitData.length === 0 &&
                frontendSocket &&
                frontendSocket.readyState === WebSocket.OPEN
            ) {
                console.log(
                    "[DEBUG][loadDataForActiveTab] Requesting BIM data (all_elements) for DD tab as it's empty."
                ); // 디버깅
                frontendSocket.send(
                    JSON.stringify({
                        type: 'get_all_elements',
                        payload: { project_id: currentProjectId },
                    })
                );
            }
            initializeBoqUI(); // DD 탭 UI 초기화 (토글 버튼, 상세 탭 등)
            // 테이블은 '집계표 생성' 버튼 클릭 시 로드되므로 여기서는 초기화만
            clearContainer(
                'boq-table-container',
                '<p style="padding: 20px;">집계 기준 설정 후 \'집계표 생성\' 버튼을 누르세요.</p>'
            );
            clearContainer(
                'boq-item-list-container',
                '<p style="padding: 10px;">상단 집계표 행을 선택하세요.</p>'
            );
            clearContainer(
                'boq-bim-object-cost-summary',
                '<p style="padding: 10px;">하단 목록에서 산출항목을 선택하면...</p>'
            );
            clearContainer('boq-details-member-container');
            clearContainer('boq-details-mark-container');
            clearContainer('boq-details-raw-container');
            break;
        case 'ai-model-manager': // 'AI 모델 관리' 탭 진입 시
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading AI Models and initializing UI.`
            ); // 디버깅
            // 활성화된 내부 탭 로드 (handleSubNavClick에서 이미 처리되었을 수 있지만 안전하게 다시 호출)
            const activeInnerButton = document.querySelector(
                '#ai-model-manager .inner-tab-button.active'
            );
            const innerTabId = activeInnerButton
                ? activeInnerButton.dataset.innerTab
                : 'ai-model-list'; // 기본값
            loadDataForAiInnerTab(innerTabId);
            break;
        case 'schematic-estimation-sd': // '개산견적(SD)' 탭 진입 시
            console.log(
                `[DEBUG][loadDataForActiveTab] Loading SD dependencies and initializing UI.`
            ); // 디버깅
            // [수정] 데이터 로딩 순서 조정 및 BOQ 관련 호출 추가
            loadAiModelsForSd(); // 상단 AI 모델 드롭다운 채우기 (비동기)
            loadSdCostCodes(); // 입력값 연동용 공사코드 목록+수량 로드 (비동기)
            // loadSdCostItems(); // 하단 테이블 데이터는 generateBoqReport 호출 시 로드됨

            // [추가] BOQ 그룹핑 필드 로드 (SD 탭 하단 테이블용)
            // loadBoqGroupingFields 함수는 내부적으로 availableBoqFields 를 채움
            loadBoqGroupingFields()
                .then(() => {
                    // 그룹핑 필드 로드 완료 후 SD용 그룹핑 컨트롤 초기화
                    console.log(
                        '[DEBUG][loadDataForActiveTab-SD] BOQ grouping fields loaded. Initializing SD grouping controls.'
                    );
                    initializeSdBoqControls(); // SD용 그룹핑/표시 필드 컨트롤 초기화 및 이벤트 리스너 설정

                    // [수정] generateBoqReport 호출하여 하단 테이블 채우기 (AI 필터 적용)
                    // generateBoqReport 함수는 이제 items_detail도 반환하므로 loadSdCostItems 호출 불필요
                    console.log(
                        '[DEBUG][loadDataForActiveTab-SD] Calling generateBoqReport for SD tab table.'
                    );
                    generateSdBoqReport(); // SD 탭 전용 집계 함수 호출
                })
                .catch((error) => {
                    console.error(
                        '[ERROR][loadDataForActiveTab-SD] Failed to load BOQ grouping fields:',
                        error
                    );
                    showToast('하단 테이블 그룹핑 필드 로딩 실패.', 'error');
                    // 필드 로드 실패 시에도 기본 UI 초기화는 진행
                    initializeSdUI();
                    initializeSdBoqControls(); // 컨트롤 영역은 보이도록 초기화
                    clearContainer(
                        'sd-table-container',
                        '<p style="padding: 20px; color: red;">그룹핑 필드 로딩 실패</p>'
                    );
                });

            // SD 상단 UI 초기화 (모델 선택, 입력 필드 등)
            initializeSdUI();
            break;
        default:
            console.log(
                `[DEBUG][loadDataForActiveTab] No specific data loading function defined for currently active tab: ${activeTab}`
            ); // 디버깅
            // 정의되지 않은 탭이면 기본 UI 클리어
            clearAllTabData();
    }
    console.log(
        `[DEBUG][loadDataForActiveTab] Finished loading initiation for tab: ${activeTab}`
    ); // 디버깅
}
// ▲▲▲ [교체] 여기까지 ▲▲▲s

// --- [신규 추가] 룰셋 종류에 따라 로드 함수를 호출하는 헬퍼 함수 ---
function loadSpecificRuleset(rulesetType) {
    console.log(`[DEBUG][loadSpecificRuleset] Loading ruleset: ${rulesetType}`);
    if (!currentProjectId) return; // 프로젝트 ID 없으면 중단

    switch (rulesetType) {
        case 'classification-ruleset':
            loadClassificationRules();
            break;
        case 'mapping-ruleset':
            loadPropertyMappingRules();
            break;
        case 'costcode-ruleset':
            loadCostCodeRules();
            break;
        case 'member-mark-assignment-ruleset':
            loadMemberMarkAssignmentRules();
            break;
        case 'cost-code-assignment-ruleset':
            loadCostCodeAssignmentRules();
            break;
        case 'space-classification-ruleset':
            loadSpaceClassificationRules();
            break;
        case 'space-assignment-ruleset':
            loadSpaceAssignmentRules();
            break;
        default:
            console.error(
                `[ERROR][loadSpecificRuleset] Unknown ruleset type: ${rulesetType}`
            );
    }
}

// ▼▼▼ [교체] 기존 clearAllTabData 함수 전체를 아래 코드로 교체 ▼▼▼
function clearAllTabData() {
    console.log(
        '[DEBUG][clearAllTabData] Clearing all global data, states, and UI elements.'
    ); // 디버깅

    // --- 전역 데이터 배열 및 객체 초기화 ---
    allRevitData = [];
    allTags = [];
    loadedCostCodes = [];
    loadedMemberMarks = [];
    loadedSpaceClassifications = [];
    loadedQuantityMembers = [];
    loadedCostItems = [];
    loadedUnitPriceTypes = [];
    loadedUnitPrices = [];
    loadedClassificationRules = [];
    loadedPropertyMappingRules = [];
    loadedCostCodeRules = [];
    loadedMemberMarkAssignmentRules = [];
    loadedCostCodeAssignmentRules = [];
    loadedSpaceClassificationRules = [];
    loadedSpaceAssignmentRules = [];
    availableBoqFields = [];
    loadedUnitPriceTypesForBoq = [];
    // AI & SD 데이터 초기화
    loadedAiModels = [];
    currentTrainingTaskId = null;
    currentTrainingStatus = {};
    uploadedCsvFilename = null;
    csvHeaders = [];
    trainedModelTempFilename = null;
    trainedModelMetadata = null;
    sdEnabledCostCodes = [];
    selectedSdModelId = null;
    loadedSdCostItems = [];

    // --- 상태 변수 초기화 ---
    Object.keys(viewerStates).forEach((context) => {
        const state = viewerStates[context];
        state.selectedElementIds.clear();
        state.revitFilteredIds.clear();
        state.columnFilters = {};
        state.isFilterToSelectionActive = false;
        state.collapsedGroups = {};
        state.currentGroupByFields = [];
        state.lastSelectedRowIndex = -1;
        state.activeView = 'raw-data-view'; // 기본 뷰로 리셋
    });
    qmColumnFilters = {};
    selectedQmIds.clear();
    qmCollapsedGroups = {};
    currentQmGroupByFields = [];
    lastSelectedQmRowIndex = -1;
    activeQmView = 'quantity-member-view'; // QM 뷰 리셋
    ciColumnFilters = {};
    selectedCiIds.clear();
    ciCollapsedGroups = {};
    currentCiGroupByFields = [];
    lastSelectedCiRowIndex = -1;
    boqFilteredRawElementIds.clear();
    currentBoqColumns = [];
    boqColumnAliases = {};
    lastBoqItemIds = [];
    currentBoqDetailItemId = null;
    sdColumnFilters = {};
    selectedSdItemIds.clear();
    sdCollapsedGroups = {};
    currentSdGroupByFields = [];
    selectedCostCodeIdForUnitPrice = null;
    currentUnitPriceEditState = { id: null, originalData: null };
    spaceMappingState = { active: false, spaceId: null, spaceName: '' };
    currentCsvImportUrl = null;

    // --- 차트 인스턴스 파기 ---
    if (trainingChartInstance) {
        trainingChartInstance.destroy();
        trainingChartInstance = null;
        console.log('[DEBUG] Training chart destroyed.');
    }
    if (sdPredictionChartInstance) {
        sdPredictionChartInstance.destroy();
        sdPredictionChartInstance = null;
        console.log('[DEBUG] SD prediction chart destroyed.');
    }

    console.log(
        '[DEBUG][clearAllTabData] Global data and states reset complete.'
    ); // 디버깅

    /**
     * 지정된 ID의 컨테이너 내용을 비우고 메시지를 표시하는 헬퍼 함수
     * @param {string} id - 컨테이너 요소의 ID
     * @param {string} message - 표시할 HTML 메시지 (기본값: '<p>프로젝트를 선택하세요.</p>')
     */

    const clearSelect = (id, defaultOptionText = '-- 선택 --') => {
        const select = document.getElementById(id);
        if (select)
            select.innerHTML = `<option value="">${defaultOptionText}</option>`;
    };

    // 관리 탭 하위
    document
        .querySelectorAll('.ruleset-table-container')
        .forEach((c) => (c.innerHTML = '<p>프로젝트를 선택하세요.</p>'));
    clearContainer('cost-codes-table-container');
    clearContainer('member-marks-table-container');
    clearContainer('tag-list');
    clearSelect('tag-assign-select', '-- 분류 선택 --');
    clearContainer('space-tree-container');
    clearContainer('unit-price-cost-code-list');
    clearContainer('unit-price-type-table-container');
    clearContainer('unit-price-table-container');
    const priceListHeader = document.getElementById('unit-price-list-header');
    if (priceListHeader)
        priceListHeader.textContent = '단가 리스트 (공사코드를 선택하세요)';
    const addPriceBtn = document.getElementById('add-unit-price-btn');
    if (addPriceBtn) addPriceBtn.disabled = true;

    // AI 모델 관리 탭
    clearContainer('ai-model-list-container');
    resetTrainingUI(); // 학습 UI 초기화 함수 호출

    // 산출 탭 하위
    clearContainer(
        'data-management-data-table-container',
        '데이터가 여기에 표시됩니다...'
    );
    clearContainer('system-field-container');
    clearContainer('revit-field-container');
    clearContainer(
        'selected-bim-properties-container',
        '<p>BIM 속성을 보려면 테이블에서 하나의 항목만 선택하세요.</p>'
    );
    clearContainer('selected-tags-list', '항목을 선택하세요.');
    clearContainer(
        'space-management-data-table-container',
        '데이터가 여기에 표시됩니다...'
    );
    clearContainer('sm-system-field-container');
    clearContainer('sm-revit-field-container');
    clearContainer(
        'sm-selected-bim-properties-container',
        '<p>BIM 속성을 보려면 테이블에서 하나의 항목만 선택하세요.</p>'
    );
    // QM 탭
    clearContainer('qm-table-container');
    clearContainer('qm-properties-container', '부재를 하나만 선택하세요.');
    clearContainer(
        'qm-cost-codes-list',
        '공사코드를 보려면 부재를 선택하세요.'
    );
    clearSelect('qm-cost-code-assign-select', '-- 공사코드 선택 --');
    clearContainer(
        'qm-member-mark-details-container',
        '부재를 하나만 선택하세요.'
    );
    clearSelect('qm-member-mark-assign-select', '-- 일람부호 선택 --');
    clearContainer(
        'qm-linked-raw-element-properties-container',
        '<p>부재를 하나만 선택하면 원본 데이터가 표시됩니다.</p>'
    );
    clearContainer('qm-spaces-list', '공간분류를 보려면 부재를 선택하세요.');
    clearSelect('qm-space-assign-select', '-- 공간분류 선택 --');
    // CI 탭
    clearContainer('ci-table-container');
    clearContainer(
        'ci-linked-member-info-header',
        '<p>산출항목을 선택하면 정보가 표시됩니다.</p>'
    );
    clearContainer('ci-linked-member-properties-container');
    clearContainer('ci-linked-mark-properties-container');
    clearContainer('ci-linked-raw-element-properties-container');

    // 상세견적(DD) 탭
    clearContainer(
        'boq-table-container',
        '<p style="padding: 20px;">프로젝트를 선택하세요.</p>'
    );
    clearContainer(
        'boq-item-list-container',
        '<p style="padding: 10px;">상단 집계표 행을 선택하세요.</p>'
    );
    clearContainer(
        'boq-bim-object-cost-summary',
        '<p style="padding: 10px;">하단 목록에서 산출항목을 선택하면...</p>'
    );
    clearContainer('boq-details-member-container', '<p>항목을 선택하세요.</p>');
    clearContainer('boq-details-mark-container', '<p>항목을 선택하세요.</p>');
    clearContainer('boq-details-raw-container', '<p>항목을 선택하세요.</p>');
    clearContainer(
        'boq-display-fields-container',
        '<small>프로젝트를 선택하세요.</small>'
    );
    clearContainer('boq-grouping-controls');

    // 개산견적(SD) 탭
    initializeSdUI(); // SD 탭 전용 초기화 함수 호출

    // 기타 UI
    document.getElementById('clear-selection-filter-btn').style.display =
        'none';

    console.log('[DEBUG][clearAllTabData] UI elements cleared/reset.'); // 디버깅
}
// ▲▲▲ [교체] 여기까지 ▲▲▲
// ▼▼▼ [추가] 파일 맨 아래에 아래 함수들을 모두 추가 ▼▼▼
function clearContainer(id, message = '<p>프로젝트를 선택하세요.</p>') {
    const container = document.getElementById(id);
    if (container) {
        container.innerHTML = message;
        // console.log(`[DEBUG][UI] Cleared container: #${id}`); // 필요 시 디버깅 로그 활성화
    } else {
        console.warn(`[WARN][UI] Container not found for clearing: #${id}`); // 컨테이너 못 찾으면 경고
    }
}
// =====================================================================
// [신규] AI 모델 관리 관련 함수들
// =====================================================================

// AI 모델 관리 내부 탭 클릭 핸들러
function handleAiInnerTabClick(event) {
    const clickedButton = event.target.closest('.inner-tab-button');
    if (!clickedButton || clickedButton.classList.contains('active')) return;

    const targetInnerTabId = clickedButton.dataset.innerTab; // "ai-model-list" 또는 "ai-model-training"
    console.log(
        `[DEBUG][handleAiInnerTabClick] Inner tab clicked: ${targetInnerTabId}`
    );

    // 모든 내부 탭 버튼과 컨텐츠 비활성화
    const container = clickedButton.closest('#ai-model-manager'); // 부모 컨텐츠 영역
    container
        .querySelectorAll('.inner-tab-button.active')
        .forEach((btn) => btn.classList.remove('active'));
    container
        .querySelectorAll('.inner-tab-content.active')
        .forEach((content) => content.classList.remove('active'));

    // 클릭된 버튼과 컨텐츠 활성화
    clickedButton.classList.add('active');
    const targetContent = container.querySelector(`#${targetInnerTabId}`); // 내부 컨텐츠 ID
    if (targetContent) {
        targetContent.classList.add('active');
        console.log(
            `[DEBUG][handleAiInnerTabClick] Inner content activated: ${targetInnerTabId}`
        );
        // ★★★ 핵심: 내부 탭 전환 시 필요한 데이터 로드 함수 호출 ★★★
        loadDataForAiInnerTab(targetInnerTabId);
    } else {
        console.warn(
            `[WARN][handleAiInnerTabClick] Inner content element not found for ID: ${targetInnerTabId}`
        );
    }
}

// AI 모델 관리 내부 탭 데이터 로드 함수
function loadDataForAiInnerTab(innerTabId) {
    console.log(
        `[DEBUG][loadDataForAiInnerTab] Loading data for AI inner tab: ${innerTabId}`
    ); // 디버깅
    if (!currentProjectId) {
        console.warn('[WARN][loadDataForAiInnerTab] No project selected.'); // 디버깅
        return;
    }

    if (innerTabId === 'ai-model-list') {
        loadAiModels(); // 모델 목록 로드 API 호출
    } else if (innerTabId === 'ai-model-training') {
        console.log(
            `[DEBUG][loadDataForAiInnerTab] Initializing AI training UI.`
        ); // 디버깅
        resetTrainingUI(); // 학습 UI 초기 상태로 설정
    } else {
        console.warn(
            `[WARN][loadDataForAiInnerTab] Unknown inner tab ID: ${innerTabId}`
        ); // 디버깅
    }
}

// AI 모델 목록 로드 API 호출
async function loadAiModels() {
    console.log('[DEBUG][loadAiModels] Loading AI models list...'); // 디버깅
    if (!currentProjectId) {
        renderAiModelsTable([]); // 빈 테이블 렌더링 (ui.js 함수)
        console.warn('[WARN][loadAiModels] No project selected.'); // 디버깅
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/ai-models/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('AI 모델 목록 로딩 실패');
        loadedAiModels = await response.json(); // 전역 변수 업데이트
        console.log(
            `[DEBUG][loadAiModels] Loaded ${loadedAiModels.length} models.`
        ); // 디버깅
        renderAiModelsTable(loadedAiModels); // ui.js 함수 호출하여 테이블 렌더링
        // SD 탭 모델 드롭다운도 갱신 (선택 사항 - 필요 시 호출)
        // populateSdModelSelect(loadedAiModels);
    } catch (error) {
        console.error('[ERROR][loadAiModels] Failed:', error); // 디버깅
        showToast(error.message, 'error');
        renderAiModelsTable([]); // 오류 시 빈 테이블
    }
}

// AI 모델 파일 선택 트리거
function triggerAiFileUpload() {
    console.log(
        '[DEBUG][triggerAiFileUpload] Triggering file inputs for AI model upload (.h5 and .json).'
    ); // 디버깅
    document.getElementById('ai-model-h5-input')?.click();
    document.getElementById('ai-model-json-input')?.click(); // 메타데이터 파일도 같이 선택 유도
}

// 파일 선택 시 버튼 텍스트 변경 (헬퍼 함수 - 이전 코드에 이미 있음, 디버깅 강화)
function displaySelectedFileName(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    let fileNames = '';
    if (input && input.files.length > 0) {
        fileNames = Array.from(input.files)
            .map((f) => f.name)
            .join(', ');
        console.log(
            `[DEBUG][displaySelectedFileName] File selected for ${inputId}: ${fileNames}`
        ); // 디버깅
    } else {
        console.log(
            `[DEBUG][displaySelectedFileName] No file selected or selection cleared for ${inputId}.`
        ); // 디버깅
    }

    // 버튼 텍스트 업데이트 로직 (여러 파일 입력을 하나의 버튼에 표시)
    if (button) {
        let baseText = '';
        if (buttonId === 'upload-ai-model-files-btn') baseText = '파일 선택';
        else if (buttonId === 'upload-csv-btn') baseText = 'CSV 업로드 및 분석';
        else baseText = button.textContent.split('(')[0].trim(); // 기본 텍스트 추출

        const h5File =
            document.getElementById('ai-model-h5-input')?.files[0]?.name;
        const jsonFile = document.getElementById('ai-model-json-input')
            ?.files[0]?.name;
        const csvFile =
            document.getElementById('training-csv-input')?.files[0]?.name;

        let displayFiles = [];
        if (buttonId === 'upload-ai-model-files-btn') {
            if (h5File) displayFiles.push(h5File);
            if (jsonFile) displayFiles.push(jsonFile);
        } else if (buttonId === 'upload-csv-btn' && csvFile) {
            displayFiles.push(csvFile);
        }

        if (displayFiles.length > 0) {
            button.textContent = `${baseText} (${displayFiles.join(', ')})`;
        } else {
            button.textContent = baseText; // 파일 선택 없으면 기본 텍스트
        }
    }
}

// AI 모델 업로드 API 호출
async function uploadAiModel() {
    console.log(
        '[DEBUG][uploadAiModel] Attempting to upload AI model via API.'
    ); // 디버깅
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }

    const nameInput = document.getElementById('new-ai-model-name');
    const h5Input = document.getElementById('ai-model-h5-input');
    const jsonInput = document.getElementById('ai-model-json-input');
    const metadataManualInput = document.getElementById(
        'ai-model-metadata-manual'
    );

    const name = nameInput.value.trim();
    const h5File = h5Input.files[0];
    const jsonFile = jsonInput.files[0];
    const metadataManual = metadataManualInput.value.trim();

    if (!name || !h5File) {
        showToast('모델 이름과 .h5 파일은 필수입니다.', 'error');
        console.log('[DEBUG][uploadAiModel] Missing required name or h5 file.'); // 디버깅
        return;
    }
    // 이름 중복 검사 (선택 사항 - 클라이언트 측)
    if (loadedAiModels.some((m) => m.name === name)) {
        showToast('이미 사용 중인 모델 이름입니다.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('h5_file', h5File);
    if (jsonFile) {
        formData.append('json_file', jsonFile);
        console.log('[DEBUG][uploadAiModel] Using metadata from json_file.'); // 디버깅
    } else if (metadataManual) {
        formData.append('metadata_manual', metadataManual);
        console.log('[DEBUG][uploadAiModel] Using metadata from manual input.'); // 디버깅
    } else {
        console.log(
            '[WARN][uploadAiModel] No metadata file or manual input provided. Default metadata will be used.'
        ); // 디버깅
    }
    // description 필드 추가 (선택 사항)
    // formData.append('description', '...');

    showToast('AI 모델 업로드 중...', 'info');
    try {
        const response = await fetch(
            `/connections/api/ai-models/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
                body: formData,
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '업로드 실패');

        showToast(result.message, 'success');
        console.log(
            `[DEBUG][uploadAiModel] Upload successful. New model ID: ${result.model_id}`
        ); // 디버깅
        loadAiModels(); // 목록 새로고침

        // 입력 필드 초기화
        nameInput.value = '';
        h5Input.value = '';
        jsonInput.value = '';
        metadataManualInput.value = '';
        displaySelectedFileName(
            'ai-model-h5-input',
            'upload-ai-model-files-btn'
        ); // 버튼 텍스트 초기화
    } catch (error) {
        console.error('[ERROR][uploadAiModel] Upload failed:', error); // 디버깅
        showToast(error.message, 'error');
    }
}

// AI 모델 목록 테이블 액션 처리 (수정, 삭제, 다운로드)
async function handleAiModelListActions(event) {
    const target = event.target;
    const modelRow = target.closest('tr[data-model-id]');
    if (!modelRow) return;
    const modelId = modelRow.dataset.modelId;

    if (target.classList.contains('edit-ai-model-btn')) {
        console.log(
            `[DEBUG][handleAiModelListActions] Edit button clicked for model ID: ${modelId}`
        ); // 디버깅
        // TODO: 수정 UI 구현 (예: 모달 팝업 또는 인라인 편집)
        showToast('모델 정보 수정 기능은 아직 구현되지 않았습니다.', 'info');
    } else if (target.classList.contains('delete-ai-model-btn')) {
        console.log(
            `[DEBUG][handleAiModelListActions] Delete button clicked for model ID: ${modelId}`
        ); // 디버깅
        const modelName = modelRow.cells[0].textContent; // 테이블에서 이름 가져오기
        if (confirm(`AI 모델 '${modelName}'을(를) 삭제하시겠습니까?`)) {
            console.log(
                `[DEBUG][handleAiModelListActions] Sending DELETE request for model ID: ${modelId}`
            ); // 디버깅
            try {
                const response = await fetch(
                    `/connections/api/ai-models/${currentProjectId}/${modelId}/`,
                    {
                        method: 'DELETE',
                        headers: { 'X-CSRFToken': csrftoken },
                    }
                );
                const result = await response.json();
                if (!response.ok)
                    throw new Error(result.message || '삭제 실패');
                showToast(result.message, 'success');
                console.log(
                    `[DEBUG][handleAiModelListActions] Model deleted successfully.`
                ); // 디버깅
                loadAiModels(); // 목록 새로고침
            } catch (error) {
                console.error(
                    '[ERROR][handleAiModelListActions] Delete failed:',
                    error
                ); // 디버깅
                showToast(error.message, 'error');
            }
        } else {
            console.log('[DEBUG][handleAiModelListActions] Delete cancelled.'); // 디버깅
        }
    } else if (target.classList.contains('download-ai-model-h5-btn')) {
        console.log(
            `[DEBUG][handleAiModelListActions] Download H5 button clicked for model ID: ${modelId}`
        ); // 디버깅
        window.location.href = `/connections/api/ai-models/${currentProjectId}/${modelId}/download/?type=h5`;
    } else if (target.classList.contains('download-ai-model-json-btn')) {
        console.log(
            `[DEBUG][handleAiModelListActions] Download JSON button clicked for model ID: ${modelId}`
        ); // 디버깅
        window.location.href = `/connections/api/ai-models/${currentProjectId}/${modelId}/download/?type=json`;
    }
}

// =====================================================================
// [신규] AI 모델 학습 관련 함수들
// =====================================================================

// CSV 업로드 및 분석 API 호출
async function uploadAndAnalyzeCsv() {
    console.log(
        '[DEBUG][uploadAndAnalyzeCsv] Attempting to upload and analyze CSV for training.'
    ); // 디버깅
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    const csvInput = document.getElementById('training-csv-input');
    if (csvInput.files.length === 0) {
        showToast('학습용 CSV 파일을 선택하세요.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('training_csv', csvInput.files[0]);

    showToast('CSV 파일 업로드 및 분석 중...', 'info');
    try {
        const response = await fetch(
            `/connections/api/ai-training/${currentProjectId}/upload-csv/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
                body: formData,
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'CSV 분석 실패');

        showToast(result.message, 'success');
        console.log(
            `[DEBUG][uploadAndAnalyzeCsv] CSV analyzed. Headers: ${result.headers.length}, Temp file: ${result.temp_filename}`
        ); // 디버깅
        uploadedCsvFilename = result.temp_filename; // 임시 파일명 저장
        csvHeaders = result.headers; // 헤더 목록 저장

        // UI 업데이트: 1단계 숨기고 2단계 표시, 피처 목록 채우기
        document.getElementById('training-step-1').style.display = 'none';
        document.getElementById('training-step-2').style.display = 'block';
        document.getElementById('training-step-3').style.display = 'none'; // 3단계 숨김
        renderFeatureSelectionLists(csvHeaders); // ui.js 함수 호출
    } catch (error) {
        console.error('[ERROR][uploadAndAnalyzeCsv] Failed:', error); // 디버깅
        showToast(error.message, 'error');
        resetTrainingUI(); // 오류 시 UI 초기화
    }
}

// 입력/출력 피처 선택 처리 (체크박스 변경 시)
function handleFeatureSelection(event) {
    if (event.target.type === 'checkbox') {
        const featureName = event.target.value;
        const isInputList = event.currentTarget.id === 'input-feature-list';
        // 선택 시 다른 목록에서 자동 해제 (Input과 Output은 중복 불가)
        const otherListId = isInputList
            ? 'output-feature-list'
            : 'input-feature-list';
        const escapedFeatureName =
            typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
                ? CSS.escape(featureName)
                : featureName.replace(/["\\]/g, '\\$&');
        const otherCheckbox = document.querySelector(
            `#${otherListId} input[value="${escapedFeatureName}"]`
        );
        if (event.target.checked && otherCheckbox && otherCheckbox.checked) {
            otherCheckbox.checked = false;
            console.log(
                `[DEBUG][handleFeatureSelection] Feature '${featureName}' deselected from ${
                    isInputList ? 'Output' : 'Input'
                } list due to selection in ${
                    isInputList ? 'Input' : 'Output'
                } list.`
            ); // 디버깅
        }
        console.log(
            `[DEBUG][handleFeatureSelection] Feature '${featureName}' selection changed in ${
                isInputList ? 'Input' : 'Output'
            } list. Checked: ${event.target.checked}`
        ); // 디버깅
    }
}

// 학습 시작 API 호출
async function startTraining() {
    console.log(
        '[DEBUG][startTraining] Validating inputs and preparing to start AI training...'
    );
    if (!currentProjectId || !uploadedCsvFilename) {
        showToast('프로젝트 선택 및 CSV 파일 업로드가 필요합니다.', 'error');
        return;
    }

    // 선택된 입력/출력 피처 가져오기
    const inputFeatures = Array.from(
        document.querySelectorAll('#input-feature-list input:checked')
    ).map((cb) => cb.value);
    const outputFeatures = Array.from(
        document.querySelectorAll('#output-feature-list input:checked')
    ).map((cb) => cb.value);
    const modelName = document
        .getElementById('training-model-name')
        .value.trim();

    // 유효성 검사
    if (inputFeatures.length === 0 || outputFeatures.length === 0) {
        showToast('입력 및 출력 피처를 하나 이상 선택하세요.', 'error');
        return;
    }
    if (!modelName) {
        showToast('학습된 모델의 이름을 입력하세요.', 'error');
        return;
    }
    if (loadedAiModels.some((m) => m.name === modelName)) {
        showToast(
            '이미 사용 중인 모델 이름입니다. 다른 이름을 사용하세요.',
            'error'
        );
        return;
    }

    // --- 새로운 설정값 수집 ---
    // 동적 레이어 설정 수집 (JavaScript 변수: hiddenLayersConfig - 카멜케이스)
    const hiddenLayersConfig = []; // <<< 변수 정의 (카멜케이스)
    document
        .querySelectorAll('#hidden-layers-config .layer-config-row')
        .forEach((row) => {
            const nodes =
                parseInt(row.querySelector('.nodes-input').value) || 64;
            const activation =
                row.querySelector('.activation-select').value || 'relu';
            hiddenLayersConfig.push({ nodes, activation }); // <<< 변수 사용 (카멜케이스)
        });
    if (hiddenLayersConfig.length === 0) {
        // <<< 변수 사용 (카멜케이스)
        showToast('최소 1개 이상의 은닉층을 설정해야 합니다.', 'error');
        return;
    }

    // 하이퍼파라미터 수집
    const loss_function = document.getElementById('loss-function').value;
    const optimizer = document.getElementById('optimizer').value;
    const metricsSelect = document.getElementById('metrics');
    const metrics = metricsSelect
        ? Array.from(metricsSelect.selectedOptions).map(
              (option) => option.value
          )
        : ['mae'];
    const learning_rate =
        parseFloat(document.getElementById('learning-rate').value) || 0.001;
    const epochs = parseInt(document.getElementById('epochs').value) || 10;
    const normalize_inputs =
        document.getElementById('normalize-inputs').checked;

    // 데이터 분할 설정 수집
    const train_ratio =
        parseInt(document.getElementById('train-ratio').value) || 70;
    const val_ratio =
        parseInt(document.getElementById('val-ratio').value) || 15;
    if (train_ratio + val_ratio >= 100 || train_ratio <= 0 || val_ratio <= 0) {
        showToast(
            'Train과 Validation 비율의 합은 100 미만이어야 하며, 각각 0보다 커야 합니다.',
            'error'
        );
        return;
    }
    const use_random_seed = document.getElementById('use-random-seed').checked;
    const random_seed_value =
        parseInt(document.getElementById('random-seed-value').value) || 42;
    // --- 설정값 수집 끝 ---

    // config 객체 생성 (백엔드로 보낼 JSON 데이터)
    const config = {
        temp_filename: uploadedCsvFilename,
        model_name: modelName,
        input_features: inputFeatures,
        output_features: outputFeatures,
        // ▼▼▼ 속성 이름은 스네이크케이스, 값은 JavaScript 변수(카멜케이스) ▼▼▼
        hidden_layers_config: hiddenLayersConfig, // <<< JavaScript 변수(hiddenLayersConfig)를 사용
        loss_function: loss_function,
        optimizer: optimizer,
        metrics: metrics,
        learning_rate: learning_rate,
        epochs: epochs,
        normalize_inputs: normalize_inputs,
        train_ratio: train_ratio,
        val_ratio: val_ratio,
        use_random_seed: use_random_seed,
        random_seed_value: random_seed_value,
        // ▲▲▲ 여기까지 ▲▲▲
    };
    // 오류가 발생한 라인
    console.log(
        '[DEBUG][startTraining] Training configuration prepared:',
        config
    );

    // --- UI 업데이트 및 API 호출 (이하 동일) ---
    document.getElementById('training-step-1').style.display = 'none';
    document.getElementById('training-step-2').style.display = 'none';
    document.getElementById('training-step-3').style.display = 'block';
    document.getElementById('training-progress-info').textContent =
        '학습 시작 요청 중...';
    document.getElementById('training-results').innerHTML = '';
    document.getElementById('test-set-evaluation-results').innerHTML = '';
    document.getElementById('training-actions').style.display = 'none';
    if (trainingChartInstance) trainingChartInstance.destroy();
    const ctx = document
        .getElementById('training-progress-chart')
        .getContext('2d');
    trainingChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Loss', data: [], borderColor: 'red', fill: false },
                {
                    label: 'Validation Loss',
                    data: [],
                    borderColor: 'blue',
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'Epoch' } },
                y: { title: { display: true, text: 'Loss' } },
            },
        },
    });
    console.log(
        '[DEBUG][startTraining] Training UI updated to Step 3 (Progress). Chart initialized.'
    );

    showToast('AI 모델 학습 시작 요청...', 'info');
    try {
        const response = await fetch(
            `/connections/api/ai-training/${currentProjectId}/start/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(config), // 생성된 config 객체 전송
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '학습 시작 실패');

        showToast(result.message, 'success');
        currentTrainingTaskId = result.task_id;
        currentTrainingStatus = {
            status: 'queued',
            message: '학습 대기 중...',
        };
        console.log(
            `[DEBUG][startTraining] Training start request successful. Task ID: ${currentTrainingTaskId}`
        );
    } catch (error) {
        console.error(
            '[ERROR][startTraining] Failed to start training:',
            error
        );
        showToast(error.message, 'error');
        document.getElementById(
            'training-progress-info'
        ).textContent = `오류: ${error.message}`;
        resetTrainingUI();
    }
}

// WebSocket 으로 학습 진행률 업데이트 처리 (websocket.js 에서 호출됨)
function handleTrainingProgressUpdate(data) {
    // 요청한 작업 ID와 일치하는지, 그리고 현재 학습 UI가 보이는지 확인
    if (
        data.task_id !== currentTrainingTaskId ||
        activeTab !== 'ai-model-manager' ||
        document.getElementById('ai-model-training')?.style.display === 'none'
    ) {
        // console.log(`[DEBUG][handleTrainingProgressUpdate] Received progress for irrelevant task (${data.task_id}) or tab, ignoring.`); // 너무 빈번할 수 있음
        return;
    }

    currentTrainingStatus = data.progress; // 최신 상태 저장
    console.log(
        '[DEBUG][handleTrainingProgressUpdate] Received progress update:',
        currentTrainingStatus
    ); // 디버깅

    const progressInfo = document.getElementById('training-progress-info');
    const resultsDiv = document.getElementById('training-results');
    const actionsDiv = document.getElementById('training-actions');
    const evaluationContainer = document.getElementById(
        'test-set-evaluation-results'
    );
    const chart = trainingChartInstance;

    // 진행률 메시지 업데이트
    if (currentTrainingStatus.status === 'running') {
        progressInfo.textContent = `Epoch ${
            currentTrainingStatus.current_epoch || '-'
        }/${currentTrainingStatus.total_epochs || '-'} 진행 중... Loss: ${
            currentTrainingStatus.loss?.toFixed(4) ?? 'N/A'
        }, Val Loss: ${currentTrainingStatus.val_loss?.toFixed(4) ?? 'N/A'}`;
    } else {
        progressInfo.textContent =
            currentTrainingStatus.message || '상태 업데이트 중...';
    }

    // 차트 업데이트 (epoch_history 데이터 사용)
    if (
        chart &&
        currentTrainingStatus.epoch_history &&
        currentTrainingStatus.epoch_history.length > 0
    ) {
        const history = currentTrainingStatus.epoch_history;
        chart.data.labels = history.map((h) => h.epoch);
        chart.data.datasets[0].data = history.map((h) => h.loss); // Loss
        chart.data.datasets[1].data = history.map((h) => h.val_loss); // Validation Loss
        try {
            chart.update();
        } catch (e) {
            console.warn('Chart update error:', e);
        } // 차트 업데이트 오류 방지
    }

    // 상태에 따른 UI 처리 (완료 또는 오류)
    // 상태에 따른 UI 처리 (완료 또는 오류)
    if (currentTrainingStatus.status === 'completed') {
        progressInfo.textContent = `✅ 학습 완료! ${currentTrainingStatus.message}`;
        // Validation 결과 표시 (기존)
        resultsDiv.innerHTML = `<ul><li>최종 검증 손실(Final Validation Loss): ${
            currentTrainingStatus.final_val_loss?.toFixed(4) ?? 'N/A'
        }</li></ul>`;

        // ▼▼▼ [추가] Test Set 평가 결과 렌더링 호출 ▼▼▼
        if (currentTrainingStatus.metadata?.test_set_evaluation) {
            renderTestSetEvaluationResults(
                currentTrainingStatus.metadata.test_set_evaluation
            );
        } else {
            evaluationContainer.innerHTML =
                '<h4>Test Set 평가 결과</h4><p>Test Set 평가 결과 데이터가 없습니다.</p>';
        }
        // ▲▲▲ [추가] 여기까지 ▲▲▲

        actionsDiv.style.display = 'block'; // 완료 후 버튼 표시
        trainedModelTempFilename = currentTrainingStatus.trained_model_filename;
        trainedModelMetadata = currentTrainingStatus.metadata;
        console.log(
            `[DEBUG][handleTrainingProgressUpdate] Training completed. Temp file: ${trainedModelTempFilename}`
        );
    } else if (currentTrainingStatus.status === 'error') {
        progressInfo.textContent = `❌ 오류: ${currentTrainingStatus.message}`;
        resultsDiv.innerHTML = '';
        evaluationContainer.innerHTML = ''; // 오류 시 평가 결과 영역도 비움
        actionsDiv.style.display = 'none';
        console.error(
            `[ERROR][handleTrainingProgressUpdate] Training failed: ${currentTrainingStatus.message}`
        );
        currentTrainingTaskId = null;
    } else {
        // 학습 진행 중이면 결과/액션 숨김
        resultsDiv.innerHTML = '';
        evaluationContainer.innerHTML = ''; // 진행 중 평가 결과 영역 비움
        actionsDiv.style.display = 'none';
    }
}

// 학습된 모델 저장 API 호출 (DB에)
async function saveTrainedModel() {
    console.log(
        '[DEBUG][saveTrainedModel] Attempting to save trained model to database via API.'
    ); // 디버깅
    const modelName =
        currentTrainingStatus?.metadata?.training_config?.model_name; // 학습 설정에서 이름 가져오기

    if (
        !currentProjectId ||
        !trainedModelTempFilename ||
        !trainedModelMetadata ||
        !modelName
    ) {
        showToast(
            '학습이 완료되지 않았거나 저장할 모델 정보가 없습니다.',
            'error'
        );
        console.error(
            '[ERROR][saveTrainedModel] Missing required data (project, temp_filename, metadata, model_name).'
        ); // 디버깅
        return;
    }
    // 모델 이름 중복 다시 확인 (저장 직전)
    if (loadedAiModels.some((m) => m.name === modelName)) {
        showToast(
            `모델 이름 '${modelName}'이(가) 이미 존재합니다. 학습 시 다른 이름을 사용했어야 합니다.`,
            'error'
        );
        return;
    }

    showToast(`모델 '${modelName}' 저장 요청 중...`, 'info');
    try {
        // 백엔드에 임시 파일명과 메타데이터를 보내 DB 저장을 요청하는 새 API 호출
        const response = await fetch(
            `/connections/api/ai-models/${currentProjectId}/save-trained/`,
            {
                // << 백엔드에 이 URL 구현 필요
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    temp_h5_filename: trainedModelTempFilename, // 임시 h5 파일 이름
                    name: modelName,
                    metadata: trainedModelMetadata,
                    description: `Trained on ${new Date().toLocaleDateString()}`, // 간단한 설명
                }),
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '모델 저장 실패');

        showToast(result.message, 'success');
        console.log(
            `[DEBUG][saveTrainedModel] Model saved successfully to database. New ID: ${result.model_id}`
        ); // 디버깅
        loadAiModels(); // 모델 목록 새로고침 ('목록/업로드' 탭으로 자동 전환은 X)

        // 저장 후 임시 정보 초기화 (선택적)
        // trainedModelTempFilename = null;
        // trainedModelMetadata = null;
        // 버튼 비활성화 등 추가 처리 가능
        document.getElementById('save-trained-model-btn').disabled = true; // 저장 버튼 비활성화
    } catch (error) {
        console.error('[ERROR][saveTrainedModel] Failed:', error); // 디버깅
        showToast(error.message, 'error');
    }
}

// 학습된 모델 파일 다운로드 (.h5 또는 .json)
function downloadTrainedModelFile(type) {
    // type: 'h5' or 'json'
    console.log(
        `[DEBUG][downloadTrainedModelFile] Requesting download for trained model file. Type: ${type}`
    ); // 디버깅
    const modelName =
        currentTrainingStatus?.metadata?.training_config?.model_name;

    if (
        !currentProjectId ||
        !trainedModelTempFilename ||
        !trainedModelMetadata ||
        !modelName
    ) {
        showToast('다운로드할 학습된 모델 정보가 없습니다.', 'error');
        console.error(
            '[ERROR][downloadTrainedModelFile] Missing required data (project, temp_filename, metadata, model_name).'
        ); // 디버깅
        return;
    }

    if (type === 'h5') {
        // 백엔드에 임시 h5 파일 다운로드 API 요청 (새 API 엔드포인트 필요)
        console.log(
            `[DEBUG][downloadTrainedModelFile] Triggering H5 download for temp file: ${trainedModelTempFilename}`
        ); // 디버깅
        // 백엔드에 임시 파일명과 원하는 다운로드 파일명을 전달
        window.location.href = `/connections/api/ai-training/download-temp/?filename=${trainedModelTempFilename}&type=h5&download_name=${encodeURIComponent(
            modelName
        )}.h5`; // << 백엔드에 이 URL 구현 필요
    } else if (type === 'json') {
        // 메타데이터는 프론트엔드에 있으므로 직접 Blob 생성하여 다운로드
        console.log(
            `[DEBUG][downloadTrainedModelFile] Generating JSON metadata file for download.`
        ); // 디버깅
        const metadataString = JSON.stringify(trainedModelMetadata, null, 2);
        const blob = new Blob([metadataString], {
            type: 'application/json;charset=utf-8',
        }); // UTF-8 명시
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${modelName}_metadata.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(
            `[DEBUG][downloadTrainedModelFile] JSON metadata download initiated.`
        ); // 디버깅
    } else {
        console.error(
            `[ERROR][downloadTrainedModelFile] Invalid download type specified: ${type}`
        ); // 디버깅
    }
}
/**
 * 학습 UI를 초기 상태로 리셋합니다.
 * @param {boolean} fullReset - true이면 CSV 업로드 상태까지 완전히 초기화, false이면 설정값만 초기화 (기본값: true)
 */
function resetTrainingUI(fullReset = true) {
    console.log(
        `[DEBUG][resetTrainingUI] Resetting AI training UI. Full reset: ${fullReset}`
    );

    if (fullReset) {
        // 1단계(CSV 업로드) 표시, 나머지 숨김
        document.getElementById('training-step-1').style.display = 'block';
        document.getElementById('training-step-2').style.display = 'none';
        document.getElementById('training-step-3').style.display = 'none';

        // CSV 관련 UI 및 변수 초기화
        const csvInput = document.getElementById('training-csv-input');
        if (csvInput) csvInput.value = '';
        displaySelectedFileName('training-csv-input', 'upload-csv-btn');
        document.getElementById('csv-info').innerHTML = '';
        uploadedCsvFilename = null;
        csvHeaders = [];
    } else {
        // 설정값만 리셋하는 경우 (2단계 표시 유지)
        document.getElementById('training-step-1').style.display = 'none';
        document.getElementById('training-step-2').style.display = 'block';
        document.getElementById('training-step-3').style.display = 'none';
    }

    // --- 공통 초기화 로직 (설정값, 진행상태, 결과, 차트, 관련 변수) ---
    document.getElementById('input-feature-list').innerHTML = '';
    document.getElementById('output-feature-list').innerHTML = '';
    document.getElementById('training-model-name').value = '';

    // 모델 구조 리셋
    resetHiddenLayersConfig();
    // 하이퍼파라미터 리셋
    document.getElementById('loss-function').value = 'mse';
    document.getElementById('optimizer').value = 'adam';
    const metricsSelect = document.getElementById('metrics');
    if (metricsSelect) {
        Array.from(metricsSelect.options).forEach((option, index) => {
            option.selected = index === 0;
        });
    }
    document.getElementById('learning-rate').value = 0.001;
    document.getElementById('epochs').value = 50;
    document.getElementById('normalize-inputs').checked = true;
    // 데이터 분할 리셋
    document.getElementById('train-ratio').value = 70;
    document.getElementById('val-ratio').value = 15;
    document.getElementById('test-ratio-display').textContent =
        'Test 비율(%): 15';
    document.getElementById('use-random-seed').checked = false;
    document.getElementById('random-seed-value').value = 42;
    document.getElementById('random-seed-value').style.display = 'none';

    // 진행률/결과/액션 초기화
    document.getElementById('training-progress-info').textContent =
        '학습 대기 중...';
    document.getElementById('training-results').innerHTML = '';
    document.getElementById('test-set-evaluation-results').innerHTML = '';
    document.getElementById('training-actions').style.display = 'none';
    document.getElementById('save-trained-model-btn').disabled = false;
    // 차트 초기화
    if (trainingChartInstance) {
        trainingChartInstance.destroy();
        trainingChartInstance = null;
    }
    // 관련 전역 변수 초기화 (task ID, status 등)
    currentTrainingTaskId = null;
    currentTrainingStatus = {};
    trainedModelTempFilename = null;
    trainedModelMetadata = null;
    // --- 공통 초기화 로직 끝 ---

    console.log(
        '[DEBUG][resetTrainingUI] Training UI and relevant state variables reset.'
    );
}

// =====================================================================
// [신규] 개산견적 (SD) 관련 함수들
// =====================================================================

// SD 탭 진입 시 AI 모델 목록 로드 (드롭다운 채우기)
async function loadAiModelsForSd() {
    console.log(
        '[DEBUG][loadAiModelsForSd] Loading AI models for SD tab dropdown (Forced Refresh).'
    ); // 로그 수정
    const select = document.getElementById('sd-model-select');
    if (!select) {
        console.error(
            '[ERROR][loadAiModelsForSd] SD model select dropdown not found.'
        );
        return;
    }
    if (!currentProjectId) {
        console.warn(
            '[WARN][loadAiModelsForSd] No project selected. Clearing dropdown.'
        );
        select.innerHTML = '<option value="">-- 프로젝트 선택 --</option>';
        return;
    }

    // --- [수정] 캐싱 로직 제거: 항상 API 호출 ---
    console.log(
        '[DEBUG][loadAiModelsForSd] Fetching AI models list from API...'
    ); // 디버깅
    try {
        const apiUrl = `/connections/api/ai-models/${currentProjectId}/`;
        console.log(`[DEBUG][loadAiModelsForSd] Fetching from: ${apiUrl}`);
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `AI 모델 목록 로딩 실패 (Status: ${response.status}, Response: ${errorText})`
            );
        }
        const fetchedModels = await response.json();
        if (!Array.isArray(fetchedModels)) {
            console.error(
                '[ERROR][loadAiModelsForSd] API response is not an array:',
                fetchedModels
            );
            throw new Error('API로부터 잘못된 형식의 응답을 받았습니다.');
        }
        // [수정] 전역 변수 업데이트는 계속 유지 (다른 곳에서 사용할 수 있으므로)
        loadedAiModels = fetchedModels;
        console.log(
            `[DEBUG][loadAiModelsForSd] Fetched ${loadedAiModels.length} models successfully.`
        );
        populateSdModelSelect(loadedAiModels); // 가져온 데이터로 드롭다운 채우기
    } catch (error) {
        console.error(
            '[ERROR][loadAiModelsForSd] Failed to fetch or process AI models:',
            error
        );
        showToast(`AI 모델 목록 로딩 실패: ${error.message}`, 'error');
        select.innerHTML = '<option value="">모델 로딩 실패</option>';
        loadedAiModels = []; // 오류 시 전역 변수 초기화
    }
    // --- [수정] 캐싱 로직 제거 끝 ---
}

// AI 모델 목록으로 SD 탭 드롭다운 채우기 (헬퍼 함수)
function populateSdModelSelect(models) {
    console.log(
        `[DEBUG][populateSdModelSelect] Populating SD model select with ${
            models ? models.length : 0
        } models.`
    ); // 디버깅
    const select = document.getElementById('sd-model-select');
    if (!select) {
        console.error(
            '[ERROR][populateSdModelSelect] SD model select element not found.'
        ); // 디버깅 추가
        return;
    }

    select.innerHTML = '<option value="">-- 모델 선택 --</option>'; // 초기화
    if (!Array.isArray(models) || models.length === 0) {
        console.warn(
            '[WARN][populateSdModelSelect] No models provided to populate.'
        ); // 디버깅 추가
        // 모델이 없어도 초기화된 상태로 두면 됨
    } else {
        models.forEach((model) => {
            // 모델 객체와 이름 속성 확인
            if (model && model.id && model.name) {
                const optionText = `${model.name} (${new Date(
                    model.created_at
                ).toLocaleDateString()})`;
                select.add(new Option(optionText, model.id));
                // console.log(`[DEBUG][populateSdModelSelect] Added option: ${optionText} (ID: ${model.id})`); // 너무 많을 수 있음
            } else {
                console.warn(
                    '[WARN][populateSdModelSelect] Invalid model data found:',
                    model
                ); // 디버깅 추가
            }
        });
        console.log(
            `[DEBUG][populateSdModelSelect] Finished adding ${models.length} options.`
        ); // 디버깅
    }

    // 이전에 선택된 모델 복원
    if (
        selectedSdModelId &&
        models &&
        models.some((m) => m && m.id === selectedSdModelId)
    ) {
        select.value = selectedSdModelId;
        console.log(
            `[DEBUG][populateSdModelSelect] Restored SD model selection: ${selectedSdModelId}`
        ); // 디버깅
        // 모델 선택 핸들러 호출하여 입력 필드 렌더링 (주의: 무한 루프 가능성 확인)
        // handleSdModelSelection({ target: select }); // 여기서 호출하면 무한 루프 발생 가능성 있음. 호출 제거.
        // 대신 모델 선택 후 UI 업데이트 로직 확인 필요. loadAiModelsForSd 호출 후 handleSdModelSelection이 다시 호출되는지?
        // loadAiModelsForSd 내부에서 populate 후에는 핸들러를 다시 호출하지 않도록 해야 함.
        // handleProjectChange나 탭 전환 시 초기 로드에서만 복원 로직 실행
        // -> 현재 구조는 populate 후 핸들러 호출 안 함. 정상.
    } else {
        console.log(
            `[DEBUG][populateSdModelSelect] No previous selection or invalid ID (${selectedSdModelId}). Resetting selection.`
        ); // 디버깅
        selectedSdModelId = null; // 유효하지 않으면 초기화
        document.getElementById('sd-input-fields').innerHTML =
            '<p>모델을 선택하면 입력 항목이 표시됩니다.</p>';
        document.getElementById('sd-predict-btn').disabled = true;
    }
    console.log(
        '[DEBUG][populateSdModelSelect] SD model select dropdown population finished.'
    ); // 디버깅
}

// SD 탭 진입 시 연동 가능한 공사코드+수량 로드
async function loadSdCostCodes() {
    console.log(
        '[DEBUG][loadSdCostCodes] Loading SD-enabled cost codes with quantities...'
    ); // 디버깅
    if (!currentProjectId) {
        sdEnabledCostCodes = [];
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/sd/cost-codes/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('SD용 공사코드 목록 로딩 실패');
        sdEnabledCostCodes = await response.json(); // 전역 변수 업데이트
        console.log(
            `[DEBUG][loadSdCostCodes] Loaded ${sdEnabledCostCodes.length} SD cost codes for linking.`
        ); // 디버깅
        // 로드된 데이터는 입력 필드 렌더링 시 사용됨 (renderSdInputFields)
        // 만약 모델이 이미 선택되어 있다면 입력 필드 다시 렌더링하여 콤보박스 채우기
        if (selectedSdModelId) {
            const selectedModel = loadedAiModels.find(
                (m) => m.id === selectedSdModelId
            );
            if (selectedModel?.metadata?.input_features) {
                renderSdInputFields(selectedModel.metadata.input_features);
                console.log(
                    '[DEBUG][loadSdCostCodes] Refreshed SD input fields with loaded cost codes.'
                ); // 디버깅
            }
        }
    } catch (error) {
        console.error('[ERROR][loadSdCostCodes] Failed:', error); // 디버깅
        showToast(error.message, 'error');
        sdEnabledCostCodes = [];
    }
}

// SD 탭에서 AI 모델 선택 시 처리
function handleSdModelSelection(event) {
    selectedSdModelId = event.target.value;
    console.log(
        `[DEBUG][handleSdModelSelection] SD AI model selected: ${selectedSdModelId}`
    );
    const predictBtn = document.getElementById('sd-predict-btn');
    const inputFieldsDiv = document.getElementById('sd-input-fields');
    const resultsTableDiv = document.getElementById(
        'sd-prediction-results-table'
    );

    // 결과 영역 초기화
    resultsTableDiv.innerHTML = '<p>예측 결과가 여기에 표시됩니다.</p>';
    if (sdPredictionChartInstance) {
        sdPredictionChartInstance.destroy();
        sdPredictionChartInstance = null;
    }

    if (selectedSdModelId) {
        const selectedModel = loadedAiModels.find(
            (m) => m.id === selectedSdModelId
        );

        // --- [핵심 수정] selectedModel.metadata.input_features 대신 selectedModel.input_features 확인 ---
        if (
            selectedModel?.input_features &&
            Array.isArray(selectedModel.input_features)
        ) {
            console.log(
                '[DEBUG][handleSdModelSelection] Rendering SD input fields based on selected model.'
            );
            // input_features를 직접 전달
            renderSdInputFields(selectedModel.input_features);
            predictBtn.disabled = false;
        } else {
            // 경고 메시지 수정: metadata가 아니라 input_features가 없는 경우로 명확화
            console.warn(
                `[WARN][handleSdModelSelection] Input features missing or invalid for model: ${selectedSdModelId}. Model data:`,
                selectedModel
            ); // 모델 데이터 전체 로깅
            inputFieldsDiv.innerHTML =
                '<p style="color: red;">선택된 모델의 입력 피처 정보가 없거나 유효하지 않습니다.</p>'; // 메시지 수정
            predictBtn.disabled = true;
        }
        // --- [핵심 수정] 여기까지 ---
    } else {
        // 모델 선택 해제 시 초기화
        console.log('[DEBUG][handleSdModelSelection] SD Model deselected.');
        inputFieldsDiv.innerHTML =
            '<p>모델을 선택하면 입력 항목이 표시됩니다.</p>';
        predictBtn.disabled = true;
    }
}

// SD 입력 필드 변경 시 처리 (직접 입력 or 공사코드 연동)
function handleSdInputChange(event) {
    const target = event.target;
    // 콤보박스 변경 시: 연결된 숫자 입력 필드 자동 채우기/읽기전용 설정
    if (
        target.tagName === 'SELECT' &&
        target.dataset.inputType === 'costCodeLink'
    ) {
        const inputId = target.dataset.inputId; // 연결된 숫자 입력 필드 ID
        const selectedCostCodeId = target.value;
        const numberInput = document.getElementById(inputId);
        console.log(
            `[DEBUG][handleSdInputChange] Cost code link changed for input '${inputId}'. Selected code ID: ${selectedCostCodeId}`
        ); // 디버깅

        if (selectedCostCodeId && numberInput) {
            const selectedCodeData = sdEnabledCostCodes.find(
                (c) => c.id === selectedCostCodeId
            );
            if (selectedCodeData) {
                numberInput.value = parseFloat(
                    selectedCodeData.total_quantity || 0
                ).toFixed(4); // 수량 자동 입력 (소수점 4자리)
                numberInput.readOnly = true; // 직접 수정 불가
                console.log(
                    `[DEBUG][handleSdInputChange] Auto-filled quantity: ${numberInput.value}`
                ); // 디버깅
            } else {
                console.warn(
                    `[WARN][handleSdInputChange] Quantity data not found for cost code ID: ${selectedCostCodeId}`
                ); // 디버깅
                numberInput.value = '0.0000'; // 못 찾으면 0
                numberInput.readOnly = false; // 직접 입력 가능
            }
        } else if (numberInput) {
            console.log(
                `[DEBUG][handleSdInputChange] Cost code link cleared for input '${inputId}'. Enabling direct input.`
            ); // 디버깅
            numberInput.readOnly = false; // '-- 직접 입력 --' 시 직접 입력 가능
            numberInput.value = ''; // 값 비우기
        }
    }
    // 숫자 입력 필드 직접 변경 시: 연결된 콤보박스 초기화
    else if (
        target.tagName === 'INPUT' &&
        target.type === 'number' &&
        !target.readOnly // <<< 읽기 전용 아닐 때만 (직접 입력 시)
    ) {
        const inputId = target.id; // 현재 변경된 input의 ID
        console.log(
            `[DEBUG][handleSdInputChange] Direct numeric input changed for '${inputId}': ${target.value}`
        ); // 디버깅

        // --- [핵심 수정] data-select-id 속성을 사용하여 연결된 select 요소 찾기 ---
        const selectId = target.dataset.selectId; // 이 input과 연결된 select의 ID 가져오기
        if (selectId) {
            const linkedSelect = document.getElementById(selectId);
            if (linkedSelect && linkedSelect.value !== '') {
                linkedSelect.value = ''; // '-- 직접 입력 --'으로 변경
                console.log(
                    `[DEBUG][handleSdInputChange] Cleared linked cost code selection (ID: ${selectId}) due to direct input in '${inputId}'.`
                ); // 디버깅
            } else if (!linkedSelect) {
                console.warn(
                    `[WARN][handleSdInputChange] Could not find linked select element with ID: ${selectId}`
                );
            }
        } else {
            console.warn(
                `[WARN][handleSdInputChange] data-select-id attribute not found on input element: ${inputId}`
            );
        }
        // --- [핵심 수정] 여기까지 ---
    }
}

// SD 예측 실행 API 호출
async function runSdPrediction() {
    console.log('[DEBUG][runSdPrediction] Starting SD prediction API call...'); // 디버깅
    if (!currentProjectId || !selectedSdModelId) {
        showToast('프로젝트와 예측 모델을 선택하세요.', 'error');
        console.error(
            '[ERROR][runSdPrediction] Project or Model not selected.'
        ); // 디버깅
        return;
    }

    const inputFieldsDiv = document.getElementById('sd-input-fields');
    const numberInputs = inputFieldsDiv.querySelectorAll(
        'input[type="number"]'
    );
    const inputData = {};
    let isValid = true;

    // 입력값 수집 및 유효성 검사
    numberInputs.forEach((input) => {
        const featureName = input.dataset.featureName;
        const valueStr = input.value.trim();
        if (valueStr === '' || isNaN(parseFloat(valueStr))) {
            showToast(
                `입력값 '${featureName}'이(가) 유효하지 않습니다.`,
                'error'
            );
            console.error(
                `[ERROR][runSdPrediction] Invalid input for ${featureName}: '${valueStr}'`
            ); // 디버깅
            isValid = false;
        }
        inputData[featureName] = valueStr; // 문자열로 전달 (백엔드에서 float 변환)
    });

    if (!isValid) {
        console.log(
            '[DEBUG][runSdPrediction] Input validation failed. Aborting.'
        ); // 디버깅
        return;
    }

    console.log(
        '[DEBUG][runSdPrediction] Input data for prediction:',
        inputData
    ); // 디버깅
    showToast('AI 모델 예측 중...', 'info');
    const predictBtn = document.getElementById('sd-predict-btn');
    predictBtn.disabled = true; // 중복 실행 방지
    console.log('[DEBUG][runSdPrediction] Predict button disabled.'); // 디버깅

    try {
        const response = await fetch(
            `/connections/api/sd/predict/${currentProjectId}/${selectedSdModelId}/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify(inputData),
            }
        );
        const result = await response.json();
        if (!response.ok) {
            // 서버 오류 메시지 우선 사용
            const errorMsg =
                result.message || `예측 실패 (Status: ${response.status})`;
            throw new Error(errorMsg);
        }

        showToast('예측 성공!', 'success');
        console.log(
            '[DEBUG][runSdPrediction] Prediction successful. API Response:',
            result
        ); // 디버깅 (API 응답 전체 확인)

        // result.predictions 안에 { feature: { predicted: v, min: v_min, max: v_max } } 구조 확인
        if (result.predictions && typeof result.predictions === 'object') {
            console.log(
                '[DEBUG][runSdPrediction] Rendering results table and chart...'
            ); // 디버깅
            renderSdResultsTable(result.predictions); // ui.js 함수 호출 (테이블) - 수정됨
            renderSdPredictionChart(result.predictions); // ui.js 함수 호출 (차트) - 수정됨
        } else {
            console.warn(
                '[WARN][runSdPrediction] Prediction results format is unexpected:',
                result.predictions
            ); // 디버깅
            // 결과 형식이 이상해도 일단 테이블/차트 렌더링 시도 (오류 처리는 각 함수에서)
            renderSdResultsTable({});
            renderSdPredictionChart({});
        }
    } catch (error) {
        console.error('[ERROR][runSdPrediction] Prediction failed:', error); // 디버깅
        showToast(error.message, 'error');
        document.getElementById(
            'sd-prediction-results-table'
        ).innerHTML = `<p style="color: red;">예측 오류: ${error.message}</p>`;
        if (sdPredictionChartInstance) {
            sdPredictionChartInstance.destroy();
            sdPredictionChartInstance = null;
            console.log(
                '[DEBUG][runSdPrediction] Prediction chart destroyed due to error.'
            ); // 디버깅
        } // 오류 시 차트 제거
    } finally {
        predictBtn.disabled = false; // 버튼 다시 활성화
        console.log('[DEBUG][runSdPrediction] Predict button enabled.'); // 디버깅
    }
}

// SD 탭 하단 테이블 데이터 로드 API 호출
async function loadSdCostItems() {
    console.log(
        '[DEBUG][loadSdCostItems] Loading SD cost items for bottom table...'
    ); // 디버깅
    if (!currentProjectId) {
        renderSdCostItemsTable([]); // 빈 테이블
        return;
    }
    try {
        const response = await fetch(
            `/connections/api/sd/cost-items/${currentProjectId}/`
        );
        if (!response.ok) throw new Error('SD 산출항목 목록 로딩 실패');
        loadedSdCostItems = await response.json(); // 전역 변수 업데이트
        console.log(
            `[DEBUG][loadSdCostItems] Loaded ${loadedSdCostItems.length} SD cost items.`
        ); // 디버깅
        renderSdCostItemsTable(loadedSdCostItems); // ui.js 함수 호출하여 테이블 렌더링
        // TODO: SD 테이블 그룹핑 필드 설정 함수 호출 (필요 시)
        // populateSdFieldSelection(loadedSdCostItems);
    } catch (error) {
        console.error('[ERROR][loadSdCostItems] Failed:', error); // 디버깅
        showToast(error.message, 'error');
        renderSdCostItemsTable([]); // 오류 시 빈 테이블
    }
}

// SD 테이블 클릭 처리 (행 선택)
function handleSdTableClick(event) {
    const row = event.target.closest('tr[data-id]');
    if (!row) return; // 데이터 행이 아니면 무시

    // TODO: 그룹 헤더 토글 기능 추가 시 여기에 분기

    const itemId = row.dataset.id;
    if (itemId) {
        console.log(
            `[DEBUG][handleSdTableClick] Row clicked. SD Item ID: ${itemId}`
        ); // 디버깅
        // 단일 선택 처리 (Ctrl/Shift 키 조합은 필요 시 추가)
        selectedSdItemIds.clear();
        selectedSdItemIds.add(itemId);
        console.log(
            `[DEBUG][handleSdTableClick] Selected SD Item ID set to: ${itemId}`
        ); // 디버깅
        renderSdCostItemsTable(loadedSdCostItems); // 선택 상태 반영하여 다시 렌더링
    }
}

// SD 테이블 선택 항목 BIM 연동 실행
function selectSdItemsInClient() {
    console.log(
        `[DEBUG][selectSdItemsInClient] Attempting to select ${selectedSdItemIds.size} SD items in ${currentMode}...`
    ); // 디버깅
    if (selectedSdItemIds.size === 0) {
        showToast('테이블에서 연동할 산출항목을 선택하세요.', 'error');
        return;
    }

    const uniqueIdsToSend = [];
    selectedSdItemIds.forEach((itemId) => {
        const item = loadedSdCostItems.find((i) => i.id === itemId);
        // raw_element_unique_id 가 있는지 확인
        if (item?.raw_element_unique_id) {
            uniqueIdsToSend.push(item.raw_element_unique_id);
        } else {
            console.warn(
                `[WARN][selectSdItemsInClient] BIM Unique ID not found for SD item ID: ${itemId}. Skipping.`
            ); // 디버깅
        }
    });

    if (uniqueIdsToSend.length === 0) {
        showToast('선택된 항목 중 연동 가능한 BIM 객체가 없습니다.', 'warning');
        console.log(
            '[DEBUG][selectSdItemsInClient] No valid Unique IDs found to send.'
        ); // 디버깅
        return;
    }

    const targetGroup =
        currentMode === 'revit'
            ? 'revit_broadcast_group'
            : 'blender_broadcast_group';
    console.log(
        `[DEBUG][selectSdItemsInClient] Sending 'select_elements' command to group ${targetGroup} with ${uniqueIdsToSend.length} IDs.`
    ); // 디버깅
    frontendSocket.send(
        JSON.stringify({
            type: 'command_to_client',
            payload: {
                command: 'select_elements',
                unique_ids: uniqueIdsToSend,
                target_group: targetGroup,
            },
        })
    );
    showToast(`${uniqueIdsToSend.length}개 객체 선택 명령 전송.`, 'info');
}

// SD 탭 UI 초기화 함수
function initializeSdUI() {
    console.log(
        '[DEBUG][initializeSdUI] Initializing Schematic Estimation (SD) UI elements.'
    ); // 디버깅
    // 모델 선택 드롭다운
    const modelSelect = document.getElementById('sd-model-select');
    if (modelSelect)
        modelSelect.innerHTML = '<option value="">-- 모델 선택 --</option>';
    // 입력 필드
    const inputFields = document.getElementById('sd-input-fields');
    if (inputFields)
        inputFields.innerHTML =
            '<p>모델을 선택하면 입력 항목이 표시됩니다.</p>';
    // 예측 버튼
    const predictBtn = document.getElementById('sd-predict-btn');
    if (predictBtn) predictBtn.disabled = true;
    // 결과 테이블
    const resultsTable = document.getElementById('sd-prediction-results-table');
    if (resultsTable)
        resultsTable.innerHTML = '<p>예측 결과가 여기에 표시됩니다.</p>';
    // 결과 차트
    if (sdPredictionChartInstance) {
        sdPredictionChartInstance.destroy();
        sdPredictionChartInstance = null;
    }
    // 하단 테이블
    const itemTable = document.getElementById('sd-cost-item-table-container');
    if (itemTable) itemTable.innerHTML = '<p>프로젝트를 선택하세요.</p>';
    // 관련 전역 변수 초기화 (필요 시 더 추가)
    selectedSdModelId = null;
    selectedSdItemIds.clear();
    console.log('[DEBUG][initializeSdUI] SD UI elements reset.'); // 디버깅
}

// ▲▲▲ [추가] 여기까지 ▲▲▲
// ▼▼▼ [추가] 프로젝트 내보내기 함수 ▼▼▼
function exportCurrentProject() {
    console.log(
        "[DEBUG][exportCurrentProject] '프로젝트 내보내기' button clicked."
    ); // 디버깅
    if (!currentProjectId) {
        showToast('내보낼 프로젝트를 먼저 선택하세요.', 'error');
        console.warn(
            '[WARN][exportCurrentProject] No project selected for export.'
        ); // 디버깅
        return;
    }
    console.log(
        `[DEBUG][exportCurrentProject] Triggering project export for ID: ${currentProjectId}`
    ); // 디버깅
    // 서버의 export_project URL로 요청을 보냅니다.
    window.location.href = `/connections/export-project/${currentProjectId}/`;
}
// ▲▲▲ [추가] 여기까지 ▲▲▲
// ▼▼▼ [추가] 프로젝트 내보내기 함수 ▼▼▼
function exportCurrentProject() {
    console.log(
        "[DEBUG][exportCurrentProject] '프로젝트 내보내기' button clicked."
    ); // 디버깅
    if (!currentProjectId) {
        showToast('내보낼 프로젝트를 먼저 선택하세요.', 'error');
        console.warn(
            '[WARN][exportCurrentProject] No project selected for export.'
        ); // 디버깅
        return;
    }
    console.log(
        `[DEBUG][exportCurrentProject] Triggering project export for ID: ${currentProjectId}`
    ); // 디버깅
    // 서버의 export_project URL로 요청을 보냅니다.
    window.location.href = `/connections/export-project/${currentProjectId}/`;
}
// ▲▲▲ [추가] 여기까지 ▲▲▲
// ▼▼▼ [추가] 프로젝트 가져오기 처리 함수 ▼▼▼
async function handleProjectImport(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('[DEBUG][handleProjectImport] File selection cancelled.'); // 디버깅
        return;
    }

    console.log(
        `[DEBUG][handleProjectImport] File selected: ${file.name}. Starting upload...`
    ); // 디버깅
    showToast('프로젝트 파일을 업로드하고 있습니다...', 'info', 10000);

    const formData = new FormData();
    formData.append('project_file', file);

    try {
        const response = await fetch('/connections/import-project/', {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData,
        });

        const result = await response.json();
        // [수정] 응답 상태(ok) 먼저 확인
        if (!response.ok) {
            // 서버에서 보낸 에러 메시지 사용, 없으면 기본 메시지
            throw new Error(
                result.message ||
                    `프로젝트 가져오기에 실패했습니다. Status: ${response.status}`
            );
        }

        showToast(result.message, 'success');
        console.log(
            '[DEBUG][handleProjectImport] Project import successful. Reloading page...'
        ); // 디버깅
        // 성공 시 페이지 새로고침하여 새 프로젝트 목록 로드
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    } catch (error) {
        console.error(
            '[ERROR][handleProjectImport] Error during import:',
            error
        ); // 디버깅
        showToast(`오류: ${error.message}`, 'error', 7000); // 에러 메시지 상세 표시 및 시간 늘림
    } finally {
        // 성공/실패 여부와 관계없이 파일 입력 초기화
        event.target.value = '';
    }
}
// ▲▲▲ [추가] 여기까지 ▲▲▲
// ▼▼▼ [추가] 파일 맨 아래에 아래 함수들을 모두 추가 (중복 시 기존 것 유지) ▼▼▼

// --- 유틸리티 함수 ---
function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

// --- 공통 CSV 파일 처리 ---
async function handleCsvFileSelect(event) {
    console.log('[DEBUG][handleCsvFileSelect] CSV file selected.'); // 디버깅
    if (!currentProjectId || !currentCsvImportUrl) {
        showToast(
            '프로젝트가 선택되지 않았거나, 잘못된 CSV 가져오기 요청입니다.',
            'error'
        );
        console.error(
            '[ERROR][handleCsvFileSelect] Missing project ID or import URL.'
        ); // 디버깅
        event.target.value = ''; // Reset file input
        return;
    }
    const file = event.target.files[0];
    if (!file) {
        console.log('[DEBUG][handleCsvFileSelect] File selection cancelled.'); // 디버깅
        return;
    }

    const formData = new FormData();
    formData.append('csv_file', file);
    const importUrl = currentCsvImportUrl; // 임시 저장된 URL 사용
    currentCsvImportUrl = null; // 사용 후 초기화

    showToast(`CSV 파일 (${file.name}) 가져오는 중...`, 'info');
    console.log(`[DEBUG][handleCsvFileSelect] Uploading CSV to: ${importUrl}`); // 디버깅
    try {
        const response = await fetch(importUrl, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData,
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || '파일 업로드/처리 실패');
        }
        showToast(result.message, 'success');
        console.log(`[DEBUG][handleCsvFileSelect] CSV import successful.`); // 디버깅

        // 가져오기 성공 후 현재 활성 탭 데이터 새로고침
        console.log(
            `[DEBUG][handleCsvFileSelect] Reloading data for active tab: ${activeTab}`
        ); // 디버깅
        loadDataForActiveTab();
    } catch (error) {
        console.error('[ERROR][handleCsvFileSelect] CSV import failed:', error); // 디버깅
        showToast(`CSV 가져오기 실패: ${error.message}`, 'error');
    } finally {
        // 성공/실패 여부와 관계없이 파일 입력 초기화
        event.target.value = '';
    }
}

// --- 룰셋 CSV 버튼 설정 및 핸들러 ---
function setupRulesetCsvButtons() {
    console.log('[DEBUG] Setting up Ruleset CSV import/export buttons...');
    const rulesetActions = {
        classification: {
            importBtn: 'import-classification-rules-btn',
            exportBtn: 'export-classification-rules-btn',
            path: 'classification',
        },
        'property-mapping': {
            importBtn: 'import-mapping-rules-btn',
            exportBtn: 'export-mapping-rules-btn',
            path: 'property-mapping',
        },
        'cost-code': {
            importBtn: 'import-costcode-rules-btn',
            exportBtn: 'export-costcode-rules-btn',
            path: 'cost-code',
        },
        'member-mark-assignment': {
            importBtn: 'import-member-mark-assignment-rules-btn',
            exportBtn: 'export-member-mark-assignment-rules-btn',
            path: 'member-mark-assignment',
        },
        'cost-code-assignment': {
            importBtn: 'import-cost-code-assignment-rules-btn',
            exportBtn: 'export-cost-code-assignment-rules-btn',
            path: 'cost-code-assignment',
        },
        'space-classification': {
            importBtn: 'import-space-classification-rules-btn',
            exportBtn: 'export-space-classification-rules-btn',
            path: 'space-classification',
        },
        'space-assignment': {
            importBtn: 'import-space-assignment-rules-btn',
            exportBtn: 'export-space-assignment-rules-btn',
            path: 'space-assignment',
        },
    };

    for (const key in rulesetActions) {
        const action = rulesetActions[key];
        const importButton = document.getElementById(action.importBtn);
        const exportButton = document.getElementById(action.exportBtn);
        if (importButton) {
            importButton.addEventListener('click', () =>
                triggerRulesetImport(action.path)
            );
        } else {
            console.warn(
                `[WARN] Ruleset Import button not found: ${action.importBtn}`
            );
        }
        if (exportButton) {
            exportButton.addEventListener('click', () =>
                exportRuleset(action.path)
            );
        } else {
            console.warn(
                `[WARN] Ruleset Export button not found: ${action.exportBtn}`
            );
        }
    }
    console.log('[DEBUG] Ruleset CSV buttons setup complete.');
}

function triggerRulesetImport(rulesetPath) {
    console.log(
        `[DEBUG] Triggering CSV import for ruleset path: ${rulesetPath}`
    );
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    // 공통 CSV 파일 입력(`csv-file-input`)을 사용하고, 업로드할 URL을 임시 저장
    currentCsvImportUrl = `/connections/api/rules/${rulesetPath}/${currentProjectId}/import/`;
    document.getElementById('csv-file-input')?.click();
}

function exportRuleset(rulesetPath) {
    console.log(
        `[DEBUG] Triggering CSV export for ruleset path: ${rulesetPath}`
    );
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    window.location.href = `/connections/api/rules/${rulesetPath}/${currentProjectId}/export/`;
}

// --- 공사코드 CSV 핸들러 ---
function exportCostCodes() {
    console.log('[DEBUG] Triggering Cost Codes CSV export.');
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    window.location.href = `/connections/api/cost-codes/${currentProjectId}/export/`;
}
function triggerCostCodesImport() {
    console.log('[DEBUG] Triggering Cost Codes CSV import.');
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    currentCsvImportUrl = `/connections/api/cost-codes/${currentProjectId}/import/`;
    document.getElementById('csv-file-input')?.click();
}

// --- 일람부호 CSV 핸들러 ---
function exportMemberMarks() {
    console.log('[DEBUG] Triggering Member Marks CSV export.');
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    window.location.href = `/connections/api/member-marks/${currentProjectId}/export/`;
}
function triggerMemberMarksImport() {
    console.log('[DEBUG] Triggering Member Marks CSV import.');
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    currentCsvImportUrl = `/connections/api/member-marks/${currentProjectId}/import/`;
    document.getElementById('csv-file-input')?.click();
}

// --- 공간분류 CSV 핸들러 ---
function exportSpaceClassifications() {
    console.log('[DEBUG] Triggering Space Classifications CSV export.');
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    window.location.href = `/connections/api/space-classifications/${currentProjectId}/export/`;
}
function triggerSpaceClassificationsImport() {
    console.log('[DEBUG] Triggering Space Classifications CSV import.');
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    currentCsvImportUrl = `/connections/api/space-classifications/${currentProjectId}/import/`;
    document.getElementById('csv-file-input')?.click();
}

// --- 공간 관리 관련 핸들러 ---
function handleSpaceTreeActions(e) {
    const target = e.target;
    const li = target.closest('li[data-id]');
    if (!li) return;
    const spaceId = li.dataset.id;
    const spaceName = li.dataset.name;

    if (target.classList.contains('add-child-space-btn'))
        handleSpaceActions('add_child', {
            parentId: spaceId,
            parentName: spaceName,
        });
    else if (target.classList.contains('rename-space-btn'))
        handleSpaceActions('rename', { id: spaceId, name: spaceName });
    else if (target.classList.contains('delete-space-btn'))
        handleSpaceActions('delete', { id: spaceId, name: spaceName });
    else if (target.classList.contains('assign-elements-btn'))
        handleSpaceActions('assign_elements', {
            id: spaceId,
            name: spaceName,
        });
    // 객체 할당 시작
    else if (target.classList.contains('view-assigned-btn'))
        showAssignedElements(spaceId, spaceName); // 할당된 객체 보기
}

function closeAssignedElementsModal() {
    const modal = document.getElementById('assigned-elements-modal');
    if (modal) modal.style.display = 'none';
    console.log('[DEBUG] Closed Assigned Elements Modal.');
}

function handleAssignedElementsTableClick(e) {
    // 전체 선택 체크박스 처리
    if (e.target.id === 'unassign-select-all') {
        const isChecked = e.target.checked;
        e.currentTarget.querySelectorAll('.unassign-checkbox').forEach((cb) => {
            cb.checked = isChecked;
        });
        console.log(
            `[DEBUG] Assigned elements table: Select All toggled to ${isChecked}`
        );
    }
    // 개별 체크박스 상태 변경 시 전체 선택 체크박스 상태 업데이트 (선택 사항)
    else if (e.target.classList.contains('unassign-checkbox')) {
        const allCheckboxes =
            e.currentTarget.querySelectorAll('.unassign-checkbox');
        const allChecked = Array.from(allCheckboxes).every((cb) => cb.checked);
        const selectAllCheckbox = document.getElementById(
            'unassign-select-all'
        );
        if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
    }
}

// --- 할당 룰셋 일괄 적용 ---
async function applyAssignmentRules(skipConfirmation = false) {
    console.log(
        '[DEBUG][applyAssignmentRules] Attempting to apply assignment rules...'
    ); // 디버깅
    if (!currentProjectId) {
        showToast('프로젝트를 선택하세요.', 'error');
        return;
    }
    if (
        !skipConfirmation &&
        !confirm(
            '정의된 모든 할당 룰셋(일람부호, 공사코드, 공간)을 전체 부재에 적용하시겠습니까?\n이 작업은 기존 할당 정보를 덮어쓰거나 추가할 수 있습니다.'
        )
    ) {
        console.log('[DEBUG][applyAssignmentRules] User cancelled.'); // 디버깅
        return;
    }

    showToast('룰셋을 적용하고 있습니다. 잠시만 기다려주세요...', 'info', 5000);
    try {
        const response = await fetch(
            `/connections/api/quantity-members/apply-assignment-rules/${currentProjectId}/`,
            {
                method: 'POST',
                headers: { 'X-CSRFToken': csrftoken },
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '룰셋 적용 실패');

        showToast(result.message, 'success');
        console.log(`[DEBUG][applyAssignmentRules] Success: ${result.message}`); // 디버깅

        // 룰셋 적용 후 관련 데이터 및 UI 새로고침
        console.log(
            '[DEBUG][applyAssignmentRules] Reloading related data (CostCodes, MemberMarks, QM, QM UI)...'
        ); // 디버깅
        await loadCostCodes(); // 공사코드 목록 (룰에 의해 새로 생성되었을 수 있음)
        await loadMemberMarks(); // 일람부호 목록 (룰에 의해 새로 생성되었을 수 있음)
        await loadQuantityMembers(); // 부재 목록 (할당 정보 업데이트됨)
        // QM 탭의 오른쪽 상세 정보 패널 업데이트
        renderQmCostCodesList();
        renderQmMemberMarkDetails();
        renderQmSpacesList(); // 공간 정보도 업데이트
    } catch (error) {
        console.error('[ERROR][applyAssignmentRules] Failed:', error); // 디버깅
        showToast(`룰셋 적용 실패: ${error.message}`, 'error');
    }
}

// --- BOQ Excel 내보내기 ---
function exportBoqReportToExcel() {
    console.log(
        '[DEBUG][exportBoqReportToExcel] Export to Excel button clicked.'
    ); // 디버깅
    showToast('Excel 내보내기 기능은 현재 준비 중입니다.', 'info');
    // TODO: SheetJS 등의 라이브러리를 사용하여 실제 Excel 내보내기 기능 구현
}

// --- 커넥터 모드 변경 핸들러 ---
function handleConnectorModeChange(e) {
    currentMode = e.target.value;
    showToast(
        `${currentMode === 'revit' ? 'Revit' : 'Blender'} 모드로 전환합니다.`,
        'info'
    );
    console.log(`[UI] Connector mode changed to: ${currentMode}`); // 디버깅
}

// --- 좌측 패널 탭 클릭 핸들러 (Data Management, Space Management 공통) ---
function handleLeftPanelTabClick(event) {
    const clickedButton = event.target.closest('.left-panel-tab-button');
    if (!clickedButton || clickedButton.classList.contains('active')) {
        return; // 버튼 아니거나 이미 활성이면 무시
    }

    const tabContainer = clickedButton.closest('.left-panel-tab-container');
    const targetTabId = clickedButton.dataset.tab; // 예: "fields", "classification", "bim-properties"
    console.log(
        `[DEBUG][handleLeftPanelTabClick] Clicked left panel tab: ${targetTabId}`
    ); // 디버깅

    // 현재 활성 탭/콘텐츠 비활성화
    tabContainer
        .querySelector('.left-panel-tab-button.active')
        ?.classList.remove('active');
    tabContainer
        .querySelector('.left-panel-tab-content.active')
        ?.classList.remove('active');

    // 클릭된 탭/콘텐츠 활성화
    clickedButton.classList.add('active');
    const targetContent = tabContainer.querySelector(`#${targetTabId}`);
    if (targetContent) {
        targetContent.classList.add('active');
        console.log(
            `[DEBUG][handleLeftPanelTabClick] Activated left panel content: #${targetTabId}`
        ); // 디버깅
    } else {
        console.warn(
            `[WARN][handleLeftPanelTabClick] Left panel content not found for ID: ${targetTabId}`
        ); // 디버깅
    }
}

// connections/static/connections/main.js

// ▼▼▼ [추가] 파일 맨 아래에 아래 함수들을 모두 추가 ▼▼▼

// =====================================================================
// [신규] 개산견적 (SD) 탭 - 하단 BOQ 테이블 관련 함수들
// =====================================================================

// --- 전역 변수 (SD BOQ 테이블 상태 관리용) ---
let currentSdBoqColumns = []; // SD 테이블의 현재 컬럼 목록
let sdBoqColumnAliases = {}; // SD 테이블 컬럼 별칭

/**
 * SD 탭 하단의 BOQ 컨트롤 (그룹핑, 표시 필드) UI를 초기화하고 이벤트 리스너 설정
 */
function initializeSdBoqControls() {
    console.log('[DEBUG][SD BOQ] Initializing SD BOQ controls.');
    // 그룹핑 컨트롤 초기화
    const sdGroupingContainer = document.getElementById('sd-grouping-controls');
    if (sdGroupingContainer) sdGroupingContainer.innerHTML = ''; // 기존 레벨 제거

    // 표시 필드 컨트롤 초기화 (availableBoqFields 사용)
    const sdDisplayFieldsContainer = document.getElementById(
        'sd-display-fields-container'
    );
    if (sdDisplayFieldsContainer) {
        if (!availableBoqFields || availableBoqFields.length === 0) {
            sdDisplayFieldsContainer.innerHTML =
                '<small>표시 필드 로딩 실패</small>';
            console.warn(
                '[WARN][SD BOQ] Cannot initialize SD display fields: availableBoqFields is empty.'
            );
        } else {
            // '수량', '항목 수' 제외
            const creatableFields = availableBoqFields.filter(
                (f) => f.value !== 'quantity' && f.value !== 'count'
            );
            sdDisplayFieldsContainer.innerHTML = creatableFields
                .map(
                    (field) => `
                <label>
                    <input type="checkbox" class="sd-display-field-cb" value="${field.value}">
                    ${field.label}
                </label>
            `
                )
                .join('');
            console.log(
                `[DEBUG][SD BOQ] Initialized ${creatableFields.length} SD display field checkboxes.`
            );
        }
    } else {
        console.warn('[WARN][SD BOQ] SD display fields container not found.');
    }

    // 그룹핑 레벨 추가 (최소 1개) - 필드가 로드된 후 호출되어야 함
    if (
        sdGroupingContainer &&
        sdGroupingContainer.children.length === 0 &&
        availableBoqFields.length > 0
    ) {
        console.log(
            '[DEBUG][SD BOQ] Adding initial grouping level for SD BOQ.'
        );
        addSdGroupingLevel();
    }
}

/**
 * SD 탭 하단 BOQ 테이블에 그룹핑 레벨 추가
 */
function addSdGroupingLevel() {
    console.log('[DEBUG][SD BOQ] Adding grouping level for SD BOQ.');
    const container = document.getElementById('sd-grouping-controls');
    if (!container) {
        console.warn(
            '[WARN][SD BOQ] SD grouping controls container not found.'
        );
        return;
    }
    const newIndex = container.children.length;

    if (!availableBoqFields || availableBoqFields.length === 0) {
        showToast('그룹핑 필드 정보를 먼저 불러와야 합니다.', 'info');
        console.warn(
            '[WARN][SD BOQ] availableBoqFields is empty, cannot add grouping level.'
        );
        return;
    }

    const newLevelDiv = document.createElement('div');
    newLevelDiv.className = 'sd-group-level'; // 클래스 이름 변경

    let optionsHtml = availableBoqFields
        .map(
            (field) => `<option value="${field.value}">${field.label}</option>`
        )
        .join('');

    newLevelDiv.innerHTML = `
        <label>${newIndex + 1}차:</label>
        <select class="sd-group-by-select">${optionsHtml}</select> 
        <button class="remove-sd-group-level-btn" style="padding: 2px 6px; font-size: 12px;">-</button> 
    `;
    container.appendChild(newLevelDiv);
    console.log(`[DEBUG][SD BOQ] ${newIndex + 1}차 SD grouping level added.`);

    // 제거 버튼 리스너 (이벤트 위임 대신 직접 추가)
    newLevelDiv
        .querySelector('.remove-sd-group-level-btn')
        .addEventListener('click', function () {
            console.log('[DEBUG][SD BOQ] Removing SD grouping level.');
            this.parentElement.remove();
            // 레벨 번호 재정렬
            container
                .querySelectorAll('.sd-group-level label')
                .forEach((label, index) => {
                    label.textContent = `${index + 1}차:`;
                });
            // 제거 후 바로 테이블 다시 그리기 (generateSdBoqReport에서 처리)
            // generateSdBoqReport(); // setup listener에서 처리
        });
}

/**
 * SD 탭 하단 BOQ 테이블 컬럼 목록(currentSdBoqColumns)을 현재 UI 상태에 맞게 업데이트
 */
function updateSdBoqColumns() {
    console.log('[DEBUG][SD BOQ] Updating SD BOQ column definitions...');
    sdBoqColumnAliases = {}; // 별칭 초기화 (SD는 별칭 편집 기능 없음)

    const selectedDisplayFields = Array.from(
        document.querySelectorAll('.sd-display-field-cb:checked') // SD용 체크박스 사용
    ).map((cb) => ({
        id: cb.value.replace(/__/g, '_'),
        label: cb.parentElement.textContent.trim(),
        isDynamic: true,
    }));

    // SD용 기본 컬럼 + 선택된 동적 컬럼 + 비용 컬럼 (DD와 동일 구조)
    currentSdBoqColumns = [
        { id: 'name', label: '구분', isDynamic: false, align: 'left' },
        // SD에서는 단가 기준 선택 기능 제외
        // { id: 'unit_price_type_id', label: '단가기준', isDynamic: false, align: 'center', width: '150px'},
        { id: 'quantity', label: '수량', isDynamic: false, align: 'right' },
        { id: 'count', label: '항목 수', isDynamic: false, align: 'right' },
        ...selectedDisplayFields,
        // 비용 관련 컬럼 (SD는 예측값이므로 '단가'는 의미 없을 수 있음 - 일단 DD와 동일하게 유지)
        {
            id: 'total_cost_total',
            label: '합계금액 (예측)',
            isDynamic: false,
            align: 'right',
        },
        // SD에서는 재료비/노무비/경비 구분 예측 안 할 수 있음 - 일단 주석 처리
        // { id: 'material_cost_total', label: '재료비 (예측)', isDynamic: false, align: 'right' },
        // { id: 'labor_cost_total', label: '노무비 (예측)', isDynamic: false, align: 'right' },
        // { id: 'expense_cost_total', label: '경비 (예측)', isDynamic: false, align: 'right' },
    ];
    console.log(
        '[DEBUG][SD BOQ] Updated currentSdBoqColumns:',
        currentSdBoqColumns
    );
}

/**
 * SD 탭 하단 BOQ 테이블 데이터를 서버에 요청하고 렌더링 (DD와 유사하나 필터 고정)
 */
async function generateSdBoqReport() {
    console.log('[DEBUG][SD BOQ] Generating BOQ report for SD tab...');

    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        console.error('[ERROR][SD BOQ] Project not selected.');
        return;
    }

    const groupBySelects = document.querySelectorAll('.sd-group-by-select'); // SD용 셀렉터 사용
    if (groupBySelects.length === 0) {
        // 그룹핑 필드가 로드되기 전일 수 있으므로 에러 대신 정보 메시지 표시
        showToast('그룹핑 기준을 추가하세요 (필드 로딩 중일 수 있음).', 'info');
        console.warn(
            '[WARN][SD BOQ] No grouping criteria selected for SD BOQ.'
        );
        // 테이블 초기화
        clearContainer(
            'sd-table-container',
            '<p style="padding: 20px;">그룹핑 기준을 설정해주세요.</p>'
        );
        return; // 집계 중단
    }

    const params = new URLSearchParams();
    groupBySelects.forEach((select) => params.append('group_by', select.value));
    console.log(
        '[DEBUG][SD BOQ] Grouping criteria:',
        params.getAll('group_by')
    );

    const displayByCheckboxes = document.querySelectorAll(
        '.sd-display-field-cb:checked'
    ); // SD용 체크박스 사용
    displayByCheckboxes.forEach((cb) => params.append('display_by', cb.value));
    console.log('[DEBUG][SD BOQ] Display fields:', params.getAll('display_by'));

    // SD 필터 고정
    params.append('filter_ai', 'true');
    params.append('filter_dd', 'false');
    console.log('[DEBUG][SD BOQ] Filters: filter_ai=true, filter_dd=false');

    // Revit 필터링 ID는 SD 하단 테이블에는 적용하지 않음 (선택 사항)
    // if (boqFilteredRawElementIds.size > 0) { ... }

    const tableContainer = document.getElementById('sd-table-container'); // SD용 컨테이너 ID
    if (!tableContainer) {
        console.error(
            "[ERROR][SD BOQ] SD table container '#sd-table-container' not found."
        );
        return;
    }
    tableContainer.innerHTML =
        '<p style="padding: 20px;">집계 데이터를 생성 중입니다...</p>';
    showToast('개산견적(SD) 집계표 생성 중...', 'info');
    console.log(
        `[DEBUG][SD BOQ] Requesting BOQ report data from server... /connections/api/boq/report/${currentProjectId}/?${params.toString()}`
    );

    try {
        const response = await fetch(
            `/connections/api/boq/report/${currentProjectId}/?${params.toString()}`
        );
        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(
                errorResult.message || `서버 오류 (${response.status})`
            );
        }

        const data = await response.json();
        console.log('[DEBUG][SD BOQ] Received BOQ report data:', data);

        // 전역 변수 업데이트 (SD 탭에서도 상세 정보 확인 위해)
        if (data.items_detail) {
            loadedSdCostItems = data.items_detail; // SD용 데이터 저장
            console.log(
                `[DEBUG][SD BOQ] loadedSdCostItems updated (${loadedSdCostItems.length} items).`
            );
            // SD에서는 단가 타입 정보는 불필요할 수 있으나, renderBoqTable 호환성을 위해 유지
            loadedUnitPriceTypesForBoq = data.unit_price_types || [];
        } else {
            console.warn("[WARN][SD BOQ] API response missing 'items_detail'.");
            loadedSdCostItems = [];
        }

        // SD용 컬럼 상태 업데이트
        updateSdBoqColumns();

        // renderBoqTable 함수 재사용 (컨테이너 ID 전달)
        renderBoqTable(
            data.report,
            data.summary,
            loadedUnitPriceTypesForBoq,
            'sd-table-container'
        );
        setupSdBoqTableInteractions(); // SD 테이블 상호작용 설정 함수 호출
        console.log('[DEBUG][SD BOQ] SD BOQ table rendered.');
    } catch (error) {
        console.error(
            '[ERROR][SD BOQ] Failed to generate SD BOQ report:',
            error
        );
        tableContainer.innerHTML = `<p style="padding: 20px; color: red;">오류: ${error.message}</p>`;
        showToast(`SD 집계표 생성 실패: ${error.message}`, 'error');
    }
}

/**
 * SD 탭 하단 BOQ 테이블 상호작용 설정 (DD와 유사하나 일부 기능 제외/수정)
 */
function setupSdBoqTableInteractions() {
    console.log('[DEBUG][SD BOQ] Setting up interactions for SD BOQ table.');
    const tableContainer = document.getElementById('sd-table-container');
    const table = tableContainer.querySelector('.boq-table'); // renderBoqTable이 생성한 테이블
    if (!table) {
        console.warn(
            '[WARN][SD BOQ] SD BOQ table element not found for setting up interactions.'
        );
        return;
    }

    // --- 1. 테이블 '행' 클릭 시 처리 (선택 효과만) ---
    const tbody = table.querySelector('tbody');
    if (tbody && !tbody.dataset.clickListenerAttached) {
        // 중복 리스너 방지
        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr.boq-group-header'); // 그룹 헤더 행
            if (row && !e.target.matches('select, button, i')) {
                // 이전에 선택된 행 해제
                const currentSelected = table.querySelector(
                    'tr.selected-sd-boq-row'
                ); // SD용 클래스 사용
                if (currentSelected)
                    currentSelected.classList.remove('selected-sd-boq-row');
                // 현재 행 선택
                row.classList.add('selected-sd-boq-row'); // SD용 클래스 사용
                console.log(
                    `[DEBUG][SD BOQ] Row selected in SD BOQ table. Item IDs: ${row.dataset.itemIds}`
                );
                // SD에서는 행 선택 시 하단 상세 패널 업데이트 없음
                // updateBoqDetailsPanel(itemIds);
            }
        });
        tbody.dataset.clickListenerAttached = 'true';
        console.log(
            '[DEBUG][SD BOQ] Row click listener attached to SD BOQ table body.'
        );
    } else if (!tbody) {
        console.warn('[WARN][SD BOQ] SD BOQ table body not found.');
    }

    // --- 2. 단가 기준 드롭다운 없음 ---
    // DD 탭의 단가 기준 변경 로직은 SD 탭에는 필요 없음

    // --- 3. 컬럼 이름 변경/순서 변경 기능 없음 ---
    // DD 탭의 헤더 드래그앤드롭 및 이름 변경 로직은 SD 탭에는 적용하지 않음
}

/**
 * SD 탭 하단 BOQ 테이블 클릭 이벤트 핸들러 (그룹 토글 및 행 선택)
 */
function handleSdBoqTableClick(event) {
    const row = event.target.closest('tr'); // 클릭된 행 (헤더 또는 데이터)
    if (!row) return;

    const tableContainer = document.getElementById('sd-table-container');
    const tableDataStr =
        tableContainer.querySelector('table')?.dataset.tableData;
    if (!tableDataStr) return; // 테이블 데이터 없으면 중단

    // 그룹 헤더 클릭 시 (토글 기능은 아직 미구현)
    if (row.classList.contains('boq-group-header')) {
        // TODO: 그룹 토글 로직 추가 (DD와 유사하게 상태 관리 필요)
        const itemIds = JSON.parse(row.dataset.itemIds || '[]');
        console.log(
            `[DEBUG][SD BOQ Click] Group header clicked. Item IDs: ${itemIds.length}`
        );

        // 행 선택 효과 적용
        const currentSelected = row
            .closest('tbody')
            .querySelector('tr.selected-sd-boq-row');
        if (currentSelected)
            currentSelected.classList.remove('selected-sd-boq-row');
        row.classList.add('selected-sd-boq-row');

        // ★★★ 중간 목록 업데이트 함수 호출 ★★★
        renderSdAssociatedItemsTable(itemIds);
    }
    // 데이터 행 클릭 시 (SD에서는 데이터 행 클릭 시 동작 없음 - 그룹 단위로만 처리)
    // else if (row.dataset.itemIds) { ... }
}

/**
 * SD 탭 하단 BOQ 테이블에서 선택된 항목과 연관된 BIM 객체를 연동 프로그램에서 선택
 */
function handleSdBoqSelectInClient() {
    console.log(
        "[DEBUG][SD BOQ SelectInClient] '연동 프로그램에서 선택 확인' button clicked for SD."
    );
    const selectedRow = document.querySelector(
        '#sd-table-container tr.selected-sd-boq-row'
    ); // SD 테이블에서 선택된 행
    if (!selectedRow) {
        showToast('먼저 SD 집계표에서 확인할 행을 선택하세요.', 'error');
        console.warn(
            '[WARN][SD BOQ SelectInClient] No row selected in SD BOQ table.'
        );
        return;
    }

    const itemIds = JSON.parse(selectedRow.dataset.itemIds || '[]');
    if (itemIds.length === 0) {
        showToast('선택된 행에 연관된 산출항목이 없습니다.', 'info');
        console.warn(
            '[WARN][SD BOQ SelectInClient] Selected row has no item_ids.'
        );
        return;
    }
    console.log(
        `[DEBUG][SD BOQ SelectInClient] Selected row Item IDs:`,
        itemIds
    );

    // loadedSdCostItems (또는 generateBoqReport에서 반환된 items_detail) 사용
    const rawElementIds = new Set();
    const itemsToProcess = loadedSdCostItems || []; // items_detail 데이터 사용

    itemIds.forEach((itemId) => {
        // items_detail에서 해당 CostItem 찾기
        const costItem = itemsToProcess.find((ci) => ci.id === itemId);
        if (costItem && costItem.quantity_member_id) {
            // loadedQuantityMembers에서 QuantityMember 찾기
            const member = loadedQuantityMembers.find(
                (qm) => qm.id === costItem.quantity_member_id
            );
            if (member && member.raw_element_id) {
                rawElementIds.add(member.raw_element_id);
            }
        }
    });

    if (rawElementIds.size === 0) {
        showToast(
            '선택된 항목들은 BIM 객체와 직접 연관되어 있지 않습니다.',
            'info'
        );
        console.warn(
            '[WARN][SD BOQ SelectInClient] No linked RawElement IDs found.'
        );
        return;
    }
    console.log(
        `[DEBUG][SD BOQ SelectInClient] Found RawElement IDs:`,
        Array.from(rawElementIds)
    );

    // RawElement ID를 Unique ID로 변환
    const uniqueIdsToSend = [];
    rawElementIds.forEach((rawId) => {
        const rawElement = allRevitData.find((re) => re.id === rawId);
        if (rawElement && rawElement.element_unique_id) {
            uniqueIdsToSend.push(rawElement.element_unique_id);
        } else {
            console.warn(
                `[WARN][SD BOQ SelectInClient] Could not find Unique ID for RawElement ID: ${rawId}`
            );
        }
    });

    if (uniqueIdsToSend.length > 0) {
        const targetGroup =
            currentMode === 'revit'
                ? 'revit_broadcast_group'
                : 'blender_broadcast_group';
        console.log(
            `[DEBUG][SD BOQ SelectInClient] Sending 'select_elements' command to ${targetGroup} with ${uniqueIdsToSend.length} Unique IDs:`,
            uniqueIdsToSend
        );
        frontendSocket.send(
            JSON.stringify({
                type: 'command_to_client',
                payload: {
                    command: 'select_elements',
                    unique_ids: uniqueIdsToSend,
                    target_group: targetGroup,
                },
            })
        );
        showToast(
            `${uniqueIdsToSend.length}개 객체 선택 명령 전송 완료.`,
            'success'
        );
    } else {
        showToast(
            '연동 프로그램으로 보낼 유효한 객체를 찾지 못했습니다.',
            'error'
        );
        console.error(
            '[ERROR][SD BOQ SelectInClient] No valid Unique IDs found to send.'
        );
    }
}

/**
 * DD 탭 하단 BOQ 테이블 컬럼 목록(currentBoqColumns)을 현재 UI 상태에 맞게 업데이트
 */
function updateDdBoqColumns() {
    console.log('[DEBUG][DD BOQ] Updating DD BOQ column definitions...');
    // 별칭 업데이트 (DD 탭은 별칭 편집 기능 사용)
    boqColumnAliases = {}; // Reset first
    document.querySelectorAll('#boq-table-container thead th').forEach((th) => {
        const colId = th.dataset.columnId;
        const currentText = th.childNodes[0].nodeValue.trim(); // Get only the text node value
        const defaultLabel = currentBoqColumns.find(
            (c) => c.id === colId
        )?.label; // Find default label if columns already exist
        if (colId && defaultLabel && currentText !== defaultLabel) {
            boqColumnAliases[colId] = currentText;
        }
    });
    console.log('[DEBUG][DD BOQ] Updated boqColumnAliases:', boqColumnAliases);

    // 표시 필드 선택 상태 반영
    const selectedDisplayFields = Array.from(
        document.querySelectorAll('.boq-display-field-cb:checked') // DD용 체크박스 사용
    ).map((cb) => ({
        id: cb.value.replace(/__/g, '_'),
        label: cb.parentElement.textContent.trim(),
        isDynamic: true,
    }));

    // DD용 기본 컬럼 + 선택된 동적 컬럼 + 비용 컬럼
    currentBoqColumns = [
        { id: 'name', label: '구분', isDynamic: false, align: 'left' },
        {
            id: 'unit_price_type_id',
            label: '단가기준',
            isDynamic: false,
            align: 'center',
            width: '150px',
        }, // DD는 단가기준 포함
        { id: 'quantity', label: '수량', isDynamic: false, align: 'right' },
        { id: 'count', label: '항목 수', isDynamic: false, align: 'right' },
        // 추가된 단가 관련 컬럼
        { id: 'total_cost_unit', label: '합계단가', isDynamic: true, align: 'right' },
        { id: 'material_cost_unit', label: '재료비단가', isDynamic: true, align: 'right' },
        { id: 'labor_cost_unit', label: '노무비단가', isDynamic: true, align: 'right' },
        { id: 'expense_cost_unit', label: '경비단가', isDynamic: true, align: 'right' },
        ...selectedDisplayFields,
        // 비용 관련 컬럼 (DD)
        {
            id: 'total_cost_total',
            label: '합계금액',
            isDynamic: false,
            align: 'right',
        },
        {
            id: 'material_cost_total',
            label: '재료비',
            isDynamic: false,
            align: 'right',
        },
        {
            id: 'labor_cost_total',
            label: '노무비',
            isDynamic: false,
            align: 'right',
        },
        {
            id: 'expense_cost_total',
            label: '경비',
            isDynamic: false,
            align: 'right',
        },
    ];
    console.log(
        '[DEBUG][DD BOQ] Updated currentBoqColumns:',
        currentBoqColumns
    );
}

/**
 * BOQ 테이블의 컬럼 순서와 별칭 설정을 localStorage에 저장합니다.
 */
function saveBoqColumnSettings() {
    try {
        const settings = {
            columnOrder: currentBoqColumns.map(col => col.id),
            columnAliases: boqColumnAliases
        };
        localStorage.setItem('boqColumnSettings', JSON.stringify(settings));
        console.log('[DEBUG] BOQ column settings saved to localStorage.');
    } catch (e) {
        console.error('[ERROR] Failed to save BOQ column settings to localStorage:', e);
    }
}

/**
 * localStorage에서 BOQ 테이블의 컬럼 순서와 별칭 설정을 로드합니다.
 * 로드된 설정은 currentBoqColumns와 boqColumnAliases에 적용됩니다.
 */
function loadBoqColumnSettings() {
    try {
        const savedSettings = localStorage.getItem('boqColumnSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            if (settings.columnOrder && Array.isArray(settings.columnOrder)) {
                // 기본 컬럼 정의를 기반으로 순서 재구성
                const defaultColumns = [
                    { id: 'name', label: '구분', isDynamic: false, align: 'left' },
                    { id: 'unit_price_type_id', label: '단가기준', isDynamic: false, align: 'center', width: '150px' },
                    { id: 'quantity', label: '수량', isDynamic: false, align: 'right' },
                    { id: 'count', label: '항목 수', isDynamic: false, align: 'right' },
                    { id: 'total_cost_unit', label: '합계단가', isDynamic: true, align: 'right' },
                    { id: 'material_cost_unit', label: '재료비단가', isDynamic: true, align: 'right' },
                    { id: 'labor_cost_unit', label: '노무비단가', isDynamic: true, align: 'right' },
                    { id: 'expense_cost_unit', label: '경비단가', isDynamic: true, align: 'right' },
                    { id: 'total_cost_total', label: '합계금액', isDynamic: false, align: 'right' },
                    { id: 'material_cost_total', label: '재료비', isDynamic: false, align: 'right' },
                    { id: 'labor_cost_total', label: '노무비', isDynamic: false, align: 'right' },
                    { id: 'expense_cost_total', label: '경비', isDynamic: false, align: 'right' },
                ];
                
                const reorderedColumns = [];
                settings.columnOrder.forEach(colId => {
                    const found = defaultColumns.find(dc => dc.id === colId);
                    if (found) {
                        reorderedColumns.push(found);
                    } else {
                        // 동적으로 추가된 필드 (예: BIM 속성) 처리
                        // availableBoqFields에서 찾거나, 임시 객체 생성
                        const dynamicField = availableBoqFields.find(f => f.value === colId);
                        if (dynamicField) {
                            reorderedColumns.push({ id: dynamicField.value, label: dynamicField.label, isDynamic: true, align: 'left' });
                        } else {
                             // 만약 저장된 컬럼이 현재 availableBoqFields에 없으면 기본값으로 추가 (예: 삭제된 필드)
                            reorderedColumns.push({ id: colId, label: colId, isDynamic: true, align: 'left' });
                        }
                    }
                });
                // 저장된 순서에 없는 기본 컬럼 추가 (새로 추가된 기본 컬럼 등)
                defaultColumns.forEach(defaultCol => {
                    if (!reorderedColumns.some(rc => rc.id === defaultCol.id)) {
                        reorderedColumns.push(defaultCol);
                    }
                });
                currentBoqColumns = reorderedColumns;
            }
            if (settings.columnAliases) {
                boqColumnAliases = settings.columnAliases;
            }
            console.log('[DEBUG] BOQ column settings loaded from localStorage.');
        } else {
            console.log('[DEBUG] No BOQ column settings found in localStorage. Using defaults.');
            // 기본 컬럼 설정 (초기 로드 시)
            currentBoqColumns = [
                { id: 'name', label: '구분', isDynamic: false, align: 'left' },
                { id: 'unit_price_type_id', label: '단가기준', isDynamic: false, align: 'center', width: '150px' },
                { id: 'quantity', label: '수량', isDynamic: false, align: 'right' },
                { id: 'count', label: '항목 수', isDynamic: false, align: 'right' },
                { id: 'total_cost_unit', label: '합계단가', isDynamic: true, align: 'right' },
                { id: 'material_cost_unit', label: '재료비단가', isDynamic: true, align: 'right' },
                { id: 'labor_cost_unit', label: '노무비단가', isDynamic: true, align: 'right' },
                { id: 'expense_cost_unit', label: '경비단가', isDynamic: true, align: 'right' },
                { id: 'total_cost_total', label: '합계금액', isDynamic: false, align: 'right' },
                { id: 'material_cost_total', label: '재료비', isDynamic: false, align: 'right' },
                { id: 'labor_cost_total', label: '노무비', isDynamic: false, align: 'right' },
                { id: 'expense_cost_total', label: '경비', isDynamic: false, align: 'right' },
            ];
            boqColumnAliases = {};
        }
    } catch (e) {
        console.error('[ERROR] Failed to load BOQ column settings from localStorage:', e);
        // 오류 발생 시 기본값으로 초기화
        currentBoqColumns = [
            { id: 'name', label: '구분', isDynamic: false, align: 'left' },
            { id: 'unit_price_type_id', label: '단가기준', isDynamic: false, align: 'center', width: '150px' },
            { id: 'quantity', label: '수량', isDynamic: false, align: 'right' },
            { id: 'count', label: '항목 수', isDynamic: false, align: 'right' },
            { id: 'total_cost_unit', label: '합계단가', isDynamic: true, align: 'right' },
            { id: 'material_cost_unit', label: '재료비단가', isDynamic: true, align: 'right' },
            { id: 'labor_cost_unit', label: '노무비단가', isDynamic: true, align: 'right' },
            { id: 'expense_cost_unit', label: '경비단가', isDynamic: true, align: 'right' },
            { id: 'total_cost_total', label: '합계금액', isDynamic: false, align: 'right' },
            { id: 'material_cost_total', label: '재료비', isDynamic: false, align: 'right' },
            { id: 'labor_cost_total', label: '노무비', isDynamic: false, align: 'right' },
            { id: 'expense_cost_total', label: '경비', isDynamic: false, align: 'right' },
        ];
        boqColumnAliases = {};
    }
}

