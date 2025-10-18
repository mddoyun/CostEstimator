// main.js
let allRevitData = [];
let currentProjectId = null;
let currentMode = 'revit';
// ✅ ADD: CSRF 토큰 헬퍼 & 전역 상수
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2)
        return decodeURIComponent(parts.pop().split(';').shift());
    return null;
}

// 템플릿에 {% csrf_token %}이 이미 있으므로 우선 DOM에서, 없으면 쿠키에서
let csrftoken =
    document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
    getCookie('csrftoken');
let activeTab = 'data-management';
let loadedQuantityMembers = []; //
let loadedPropertyMappingRules = []; //
let qmColumnFilters = {};
let selectedQmIds = new Set();
let qmCollapsedGroups = {};
let currentQmGroupByFields = [];
let lastSelectedQmRowIndex = -1;
let loadedSpaceClassifications = []; //
let loadedCostCodes = []; //
let loadedMemberMarks = [];
let activeQmView = 'quantity-member-view'; //

let loadedCostItems = [];
let ciColumnFilters = {};
let selectedCiIds = new Set();
let ciCollapsedGroups = {};
let currentCiGroupByFields = [];
let lastSelectedCiRowIndex = -1;
let loadedCostCodeRules = [];
let loadedMemberMarkAssignmentRules = [];
let loadedCostCodeAssignmentRules = [];
let loadedSpaceClassificationRules = []; // <<< [추가] 새 룰셋 데이터를 담을 변수
let loadedSpaceAssignmentRules = []; // <<< [추가] 새 룰셋 데이터를 담을 변수

let currentCsvImportUrl = null; // <<< [추가] 현재 진행 중인 CSV 가져오기 URL을 저장할 변수

let allTags = []; // 프로젝트의 모든 태그를 저장해 둘 변수
let boqFilteredRawElementIds = new Set(); // BOQ 탭에서 Revit 선택 필터링을 위한 ID 집합
let spaceMappingState = { active: false, spaceId: null, spaceName: '' }; // 공간 맵핑 모드 상태
let spaceMgmtColumnFilters = {};
let spaceMgmtSelectedIds = new Set();
let spaceMgmtCollapsedGroups = {};
let lastSpaceMgmtSelectedRowIndex = -1;
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

let loadedUnitPriceTypes = [];
let loadedUnitPrices = [];
let selectedCostCodeIdForUnitPrice = null;
let currentUnitPriceEditState = { id: null, originalData: null }; // 단가 수정 시 원본 데이터 저장용

// main.js

// ▼▼▼ [교체] 기존 DOMContentLoaded 이벤트 리스너 전체를 아래 코드로 교체해주세요. ▼▼▼
document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
    if (tokenInput && tokenInput.value) {
        csrftoken = tokenInput.value; // 전역 let 변수에 안전하게 갱신
    }
    setupWebSocket();
    const projectSelector = document.getElementById('project-selector');

    // --- 이벤트 리스너 설정 (Null-safe) ---
    projectSelector?.addEventListener('change', handleProjectChange);

    // --- 각 탭 내부에 있는 요소들에 대한 이벤트 리스너 ---
    // 각 요소가 존재하는지 확인 후 이벤트를 등록합니다.
    document
        .getElementById('add-ci-group-level-btn')
        ?.addEventListener('click', addCiGroupingLevel);

    // 테이블 컨테이너에 이벤트 위임을 사용하여 모든 하위 요소의 이벤트를 처리
    const ciTableContainer = document.getElementById('ci-table-container');
    if (ciTableContainer) {
        // '수정', '삭제', '저장', '취소' 버튼 및 행 선택, 그룹 토글 클릭 처리
        ciTableContainer.addEventListener('click', handleCostItemActions);

        // 컬럼 필터 입력 처리 (Enter 키 입력 시)
        ciTableContainer.addEventListener('keyup', handleCiColumnFilter);
    }
    // 주 내비게이션 버튼 이벤트 리스너
    document.querySelectorAll('.main-nav .nav-button').forEach((button) => {
        button.addEventListener('click', handleMainNavClick);
    });

    // 보조 내비게이션 버튼 이벤트 리스너
    document.querySelectorAll('.sub-nav-button').forEach((button) => {
        button.addEventListener('click', handleSubNavClick);
    });

    // 페이지 로드 시 기본 탭(관리 -> 룰셋 관리)을 강제로 활성화
    const defaultPrimaryTab = document.querySelector(
        '.main-nav .nav-button[data-primary-tab="management"]'
    );
    if (defaultPrimaryTab) {
        // 약간의 지연을 주어 다른 스크립트가 로드될 시간을 확보
        setTimeout(() => defaultPrimaryTab.click(), 100);
    }

    const filterAiCheckbox = document.getElementById('boq-filter-ai');
    const filterDdCheckbox = document.getElementById('boq-filter-dd');

    if (filterAiCheckbox) {
        filterAiCheckbox.addEventListener('change', generateBoqReport);
    }
    if (filterDdCheckbox) {
        filterDdCheckbox.addEventListener('change', generateBoqReport);
    }
    // --- 각 탭 내부에 있는 요소들에 대한 이벤트 리스너 ---
    // 각 요소가 존재하는지 확인 후 이벤트를 등록합니다.

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
        .querySelectorAll('input[name="connector_mode"]')
        .forEach((radio) => {
            radio.addEventListener('change', (e) => {
                currentMode = e.target.value;
                showToast(
                    `${
                        currentMode === 'revit' ? 'Revit' : 'Blender'
                    } 모드로 전환합니다.`,
                    'info'
                );
            });
        });

    const createProjectBtn = document.getElementById('create-project-btn');
    if (createProjectBtn)
        createProjectBtn.addEventListener('click', createNewProject);

    const createTagBtn = document.getElementById('create-tag-btn');
    if (createTagBtn) createTagBtn.addEventListener('click', createNewTag);

    const tagList = document.getElementById('tag-list');
    if (tagList) tagList.addEventListener('click', handleTagListActions);

    const importTagsBtn = document.getElementById('import-tags-btn');
    if (importTagsBtn)
        importTagsBtn.addEventListener('click', () =>
            document.getElementById('tag-file-input').click()
        );

    const tagFileInput = document.getElementById('tag-file-input');
    if (tagFileInput) tagFileInput.addEventListener('change', importTags);

    const exportTagsBtn = document.getElementById('export-tags-btn');
    if (exportTagsBtn) exportTagsBtn.addEventListener('click', exportTags);

    const renderTableBtn = document.getElementById('render-table-btn');
    if (renderTableBtn)
        renderTableBtn.addEventListener('click', () =>
            renderDataTable(
                'data-management-data-table-container',
                'data-management'
            )
        );

    document
        .querySelectorAll('#data-management .view-tab-button')
        .forEach((button) => {
            button.addEventListener('click', handleViewTabClick);
        });

    const addGroupLevelBtn = document.getElementById('add-group-level-btn');
    if (addGroupLevelBtn)
        addGroupLevelBtn.addEventListener('click', () =>
            addGroupingLevel('data-management')
        );

    const dmGroupingControls = document.getElementById(
        'data-management-grouping-controls'
    );
    if (dmGroupingControls) {
        dmGroupingControls.addEventListener('change', () =>
            renderDataTable(
                'data-management-data-table-container',
                'data-management'
            )
        );
    }

    const clearSelectionFilterBtn = document.getElementById(
        'clear-selection-filter-btn'
    );
    if (clearSelectionFilterBtn)
        clearSelectionFilterBtn.addEventListener('click', clearSelectionFilter);

    const assignTagBtn = document.getElementById('assign-tag-btn');
    if (assignTagBtn)
        assignTagBtn.addEventListener('click', assignTagsToSelection);

    const applyRulesBtn = document.getElementById('apply-rules-btn');
    if (applyRulesBtn)
        applyRulesBtn.addEventListener('click', applyClassificationRules);

    const clearTagsBtn = document.getElementById('clear-tags-btn');
    if (clearTagsBtn)
        clearTagsBtn.addEventListener('click', clearTagsFromSelection);

    const tableContainer = document.getElementById(
        'data-management-data-table-container'
    ); // 이렇게 바꾸고,
    if (tableContainer) {
        tableContainer.addEventListener('keyup', (e) =>
            handleColumnFilter(e, 'data-management')
        );

        // 클릭 이벤트 리스너를 아래와 같이 수정합니다.
        tableContainer.addEventListener('click', (e) =>
            handleTableClick(e, 'data-management')
        );
    }

    document.querySelectorAll('.ruleset-nav-button').forEach((button) => {
        button.addEventListener('click', handleRulesetNavClick);
    });

    const createQmManualBtn = document.getElementById('create-qm-manual-btn');
    if (createQmManualBtn)
        createQmManualBtn.addEventListener('click', createManualQuantityMember);

    const createQmAutoBtn = document.getElementById('create-qm-auto-btn');
    if (createQmAutoBtn)
        createQmAutoBtn.addEventListener('click', createAutoQuantityMembers);
    document
        .getElementById('apply-assignment-rules-btn')
        ?.addEventListener('click', applyAssignmentRules);

    const qmTableContainer = document.getElementById('qm-table-container');
    if (qmTableContainer)
        qmTableContainer.addEventListener('click', handleQuantityMemberActions);

    const qmClearCostCodesBtn = document.getElementById(
        'qm-clear-cost-codes-btn'
    );
    if (qmClearCostCodesBtn)
        qmClearCostCodesBtn.addEventListener('click', clearCostCodesFromQm);

    const qmAssignCostCodeBtn = document.getElementById(
        'qm-assign-cost-code-btn'
    );
    if (qmAssignCostCodeBtn) {
        qmAssignCostCodeBtn.addEventListener('click', assignCostCodeToQm);
    }
    const costCodesContainer = document.getElementById(
        'cost-codes-table-container'
    );
    if (costCodesContainer)
        costCodesContainer.addEventListener('click', handleCostCodeActions);

    // ▼▼▼ [추가] 이 코드 블록을 추가해주세요. ▼▼▼
    const qmAssignMemberMarkBtn = document.getElementById(
        'qm-assign-member-mark-btn'
    );
    if (qmAssignMemberMarkBtn) {
        qmAssignMemberMarkBtn.addEventListener('click', assignMemberMarkToQm);
    }

    const qmClearMemberMarksBtn = document.getElementById(
        'qm-clear-member-marks-btn'
    );
    if (qmClearMemberMarksBtn) {
        qmClearMemberMarksBtn.addEventListener('click', clearMemberMarksFromQm);
    }

    document
        .getElementById('create-ci-manual-btn')
        ?.addEventListener('click', createManualCostItem);

    document
        .getElementById('create-ci-auto-btn')
        ?.addEventListener('click', createAutoCostItems);
    // ... (이하 모든 addEventListener에 대해 동일한 패턴으로 null-check를 적용했다고 가정합니다) ...
    // 제공된 파일 기준으로 모든 리스너를 안전하게 감쌌습니다.

    const classificationRuleset = document.getElementById(
        'classification-ruleset'
    );
    if (classificationRuleset)
        classificationRuleset.addEventListener(
            'click',
            handleClassificationRuleActions
        );

    const leftPanelTabs = document.querySelector('.left-panel-tabs');
    if (leftPanelTabs) {
        leftPanelTabs.addEventListener('click', handleLeftPanelTabClick);
    }

    const addClassificationRuleBtn = document.getElementById(
        'add-classification-rule-btn'
    );
    if (addClassificationRuleBtn) {
        addClassificationRuleBtn.addEventListener('click', () => {
            // 'new' 상태로 테이블을 다시 그려 새 규칙 입력 행을 추가합니다.
            renderClassificationRulesetTable(loadedClassificationRules, 'new');
        });
    }

    const addMappingRuleBtn = document.getElementById('add-mapping-rule-btn');
    if (addMappingRuleBtn) {
        addMappingRuleBtn.addEventListener('click', () => {
            renderPropertyMappingRulesetTable(
                loadedPropertyMappingRules,
                'new'
            );
        });
    }

    const addCostCodeRuleBtn = document.getElementById('add-costcode-rule-btn');
    if (addCostCodeRuleBtn) {
        addCostCodeRuleBtn.addEventListener('click', () => {
            renderCostCodeRulesetTable(loadedCostCodeRules, 'new');
        });
    }

    const addMemberMarkAssignmentRuleBtn = document.getElementById(
        'add-member-mark-assignment-rule-btn'
    );
    if (addMemberMarkAssignmentRuleBtn) {
        addMemberMarkAssignmentRuleBtn.addEventListener('click', () => {
            renderMemberMarkAssignmentRulesetTable(
                loadedMemberMarkAssignmentRules,
                'new'
            );
        });
    }

    const addCostCodeAssignmentRuleBtn = document.getElementById(
        'add-cost-code-assignment-rule-btn'
    );
    if (addCostCodeAssignmentRuleBtn) {
        addCostCodeAssignmentRuleBtn.addEventListener('click', () => {
            renderCostCodeAssignmentRulesetTable(
                loadedCostCodeAssignmentRules,
                'new'
            );
        });
    }

    // 2. 각 룰셋 테이블 내부의 동작(수정, 삭제, 저장 등)을 위한 이벤트 리스너 (이벤트 위임)
    if (classificationRuleset) {
        classificationRuleset.addEventListener(
            'click',
            handleClassificationRuleActions
        );
    }

    const mappingRuleset = document.getElementById(
        'mapping-ruleset-table-container'
    );
    if (mappingRuleset) {
        mappingRuleset.addEventListener(
            'click',
            handlePropertyMappingRuleActions
        );
    }

    const costCodeRuleset = document.getElementById(
        'costcode-ruleset-table-container'
    );
    if (costCodeRuleset) {
        costCodeRuleset.addEventListener('click', handleCostCodeRuleActions);
    }

    const memberMarkAssignmentRuleset = document.getElementById(
        'member-mark-assignment-ruleset-table-container'
    );
    if (memberMarkAssignmentRuleset) {
        memberMarkAssignmentRuleset.addEventListener(
            'click',
            handleMemberMarkAssignmentRuleActions
        );
    }

    const addRootSpaceBtn = document.getElementById('add-root-space-btn');
    if (addRootSpaceBtn) {
        addRootSpaceBtn.addEventListener('click', () =>
            handleSpaceActions('add_root')
        );
    }

    const spaceTreeContainer = document.getElementById('space-tree-container');
    if (spaceTreeContainer) {
        spaceTreeContainer.addEventListener('click', (e) => {
            const target = e.target;
            const li = target.closest('li');
            if (!li) return;

            const spaceId = li.dataset.id;
            const spaceName = li.dataset.name;

            if (target.classList.contains('add-child-space-btn')) {
                handleSpaceActions('add_child', {
                    parentId: spaceId,
                    parentName: spaceName,
                });
            } else if (target.classList.contains('rename-space-btn')) {
                handleSpaceActions('rename', { id: spaceId, name: spaceName });
            } else if (target.classList.contains('delete-space-btn')) {
                handleSpaceActions('delete', { id: spaceId, name: spaceName });
            } else if (target.classList.contains('assign-elements-btn')) {
                handleSpaceActions('assign_elements', {
                    id: spaceId,
                    name: spaceName,
                });
            }
            // ▼▼▼ [추가] 이 else if 블록을 추가합니다. ▼▼▼
            else if (target.classList.contains('view-assigned-btn')) {
                showAssignedElements(spaceId, spaceName);
            }
        });
    }

    const costCodeAssignmentRuleset = document.getElementById(
        'cost-code-assignment-ruleset-table-container'
    );
    if (costCodeAssignmentRuleset) {
        costCodeAssignmentRuleset.addEventListener(
            'click',
            handleCostCodeAssignmentRuleActions
        );
    }

    currentProjectId = projectSelector ? projectSelector.value : null;
    initializeBoqUI();
    const confirmSpaceMapBtn = document.getElementById(
        'confirm-space-mapping-btn'
    );
    if (confirmSpaceMapBtn)
        confirmSpaceMapBtn.addEventListener('click', applySpaceElementMapping);

    const cancelSpaceMapBtn = document.getElementById(
        'cancel-space-mapping-btn'
    );
    if (cancelSpaceMapBtn)
        cancelSpaceMapBtn.addEventListener('click', hideSpaceMappingPanel);

    const spaceTableContainer = document.getElementById(
        'space-data-table-container'
    );
    if (spaceTableContainer) {
        // spaceTableContainer.addEventListener("keyup", (e) => handleColumnFilter(e, 'space-management')); // 필요 시 필터 기능 추가
        spaceTableContainer.addEventListener('click', (e) =>
            handleTableClick(e, 'space-management')
        );
    }

    const spaceRightPanelTabs = document.getElementById(
        'space-right-panel-tabs'
    );
    if (spaceRightPanelTabs) {
        spaceRightPanelTabs.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.left-panel-tab-button');
            if (!clickedButton || clickedButton.classList.contains('active'))
                return;

            const tabContainer = clickedButton.closest(
                '.left-panel-tab-container'
            );
            const targetTabId = clickedButton.dataset.tab;

            tabContainer
                .querySelector('.left-panel-tab-button.active')
                .classList.remove('active');
            tabContainer
                .querySelector('.left-panel-tab-content.active')
                .classList.remove('active');

            clickedButton.classList.add('active');
            tabContainer
                .querySelector(`#${targetTabId}`)
                .classList.add('active');
        });
    }
    const smPanel = document.getElementById('space-management');
    if (smPanel) {
        // 탭 전환 (BIM속성, 필드선택)
        smPanel
            .querySelector('.left-panel-tabs')
            ?.addEventListener('click', (e) => {
                const button = e.target.closest('.left-panel-tab-button');
                if (!button || button.classList.contains('active')) return;

                const tabContainer = button.closest(
                    '.left-panel-tab-container'
                );

                tabContainer
                    .querySelector('.left-panel-tab-button.active')
                    .classList.remove('active');
                tabContainer
                    .querySelector('.left-panel-tab-content.active')
                    .classList.remove('active');

                button.classList.add('active');
                const contentId = button.dataset.tab;
                tabContainer
                    .querySelector(`#${contentId}`)
                    .classList.add('active');

                if (contentId === 'sm-bim-properties') {
                    renderBimPropertiesTable('space-management');
                }
            });

        // '테이블에 선택 적용' 버튼
        document
            .getElementById('sm-render-table-btn')
            ?.addEventListener('click', () =>
                renderDataTable(
                    'space-management-data-table-container',
                    'space-management'
                )
            );

        // '그룹핑 추가' 버튼
        document
            .getElementById('add-space-management-group-level-btn')
            ?.addEventListener('click', () =>
                addGroupingLevel('space-management')
            );

        // 그룹핑 Select 변경
        document
            .getElementById('space-management-grouping-controls')
            ?.addEventListener('change', () =>
                renderDataTable(
                    'space-management-data-table-container',
                    'space-management'
                )
            );

        // 테이블 내 이벤트 위임 (필터, 행 선택, 그룹 토글)
        const smTableContainer = document.getElementById(
            'space-management-data-table-container'
        );
        if (smTableContainer) {
            smTableContainer.addEventListener('keyup', (e) =>
                handleColumnFilter(e, 'space-management')
            );
            smTableContainer.addEventListener('click', (e) =>
                handleTableClick(e, 'space-management')
            );
        }
    }

    const assignedElementsModal = document.getElementById(
        'assigned-elements-modal'
    );
    if (assignedElementsModal) {
        // 모달 닫기 버튼 (X 버튼, 닫기 버튼)
        assignedElementsModal
            .querySelector('.modal-close-btn')
            .addEventListener('click', () => {
                assignedElementsModal.style.display = 'none';
            });
        document
            .getElementById('modal-close-assigned-elements')
            .addEventListener('click', () => {
                assignedElementsModal.style.display = 'none';
            });

        // '선택 항목 할당 해제' 버튼
        document
            .getElementById('modal-unassign-btn')
            .addEventListener('click', handleUnassignElements);

        // 테이블 내부 이벤트 위임 (전체 선택 체크박스)
        const tableContainer = assignedElementsModal.querySelector(
            '#assigned-elements-table-container'
        );
        tableContainer.addEventListener('click', (e) => {
            if (e.target.id === 'unassign-select-all') {
                tableContainer
                    .querySelectorAll('.unassign-checkbox')
                    .forEach((cb) => {
                        cb.checked = e.target.checked;
                    });
            }
        });
    }
    document
        .getElementById('add-space-classification-rule-btn')
        ?.addEventListener('click', () => {
            renderSpaceClassificationRulesetTable(
                loadedSpaceClassificationRules,
                'new'
            );
        });

    document
        .getElementById('space-classification-ruleset-table-container')
        ?.addEventListener('click', handleSpaceClassificationRuleActions);

    document
        .getElementById('apply-space-rules-btn')
        ?.addEventListener('click', applySpaceClassificationRules);

    document
        .getElementById('qm-assign-space-btn')
        ?.addEventListener('click', assignSpaceToQm);
    document
        .getElementById('qm-clear-spaces-btn')
        ?.addEventListener('click', clearSpacesFromQm);

    document
        .getElementById('add-space-assignment-rule-btn')
        ?.addEventListener('click', () => {
            renderSpaceAssignmentRulesetTable(
                loadedSpaceAssignmentRules,
                'new'
            );
        });
    document
        .getElementById('space-assignment-ruleset-table-container')
        ?.addEventListener('click', handleSpaceAssignmentRuleActions);

    // ▼▼▼ [추가] 룰셋 CSV 가져오기/내보내기 버튼 이벤트 리스너 ▼▼▼
    const csvFileInput = document.getElementById('csv-file-input');
    if (csvFileInput) {
        csvFileInput.addEventListener('change', handleCsvFileSelect);
    }

    // 이벤트 핸들러 맵
    const rulesetActions = {
        'classification-rules': {
            importBtn: 'import-classification-rules-btn',
            exportBtn: 'export-classification-rules-btn',
            path: 'classification',
            loadFunc: loadClassificationRules,
        },
        'mapping-rules': {
            importBtn: 'import-mapping-rules-btn',
            exportBtn: 'export-mapping-rules-btn',
            path: 'property-mapping',
            loadFunc: loadPropertyMappingRules,
        },
        'costcode-rules': {
            importBtn: 'import-costcode-rules-btn',
            exportBtn: 'export-costcode-rules-btn',
            path: 'cost-code',
            loadFunc: loadCostCodeRules,
        },
        'member-mark-assignment-rules': {
            importBtn: 'import-member-mark-assignment-rules-btn',
            exportBtn: 'export-member-mark-assignment-rules-btn',
            path: 'member-mark-assignment',
            loadFunc: loadMemberMarkAssignmentRules,
        },
        'cost-code-assignment-rules': {
            importBtn: 'import-cost-code-assignment-rules-btn',
            exportBtn: 'export-cost-code-assignment-rules-btn',
            path: 'cost-code-assignment',
            loadFunc: loadCostCodeAssignmentRules,
        },
        'space-classification-rules': {
            importBtn: 'import-space-classification-rules-btn',
            exportBtn: 'export-space-classification-rules-btn',
            path: 'space-classification',
            loadFunc: loadSpaceClassificationRules,
        },
        'space-assignment-rules': {
            importBtn: 'import-space-assignment-rules-btn',
            exportBtn: 'export-space-assignment-rules-btn',
            path: 'space-assignment',
            loadFunc: loadSpaceAssignmentRules,
        },
    };

    // 맵을 순회하며 이벤트 리스너 동적 할당
    for (const key in rulesetActions) {
        const action = rulesetActions[key];
        const importBtn = document.getElementById(action.importBtn);
        const exportBtn = document.getElementById(action.exportBtn);

        if (importBtn) {
            importBtn.addEventListener('click', () => {
                currentCsvImportUrl = `/connections/api/rules/${action.path}/${currentProjectId}/import/`;
                csvFileInput.click();
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!currentProjectId) {
                    showToast('먼저 프로젝트를 선택하세요.', 'error');
                    return;
                }
                window.location.href = `/connections/api/rules/${action.path}/${currentProjectId}/export/`;
            });
        }
    }
    const addCostCodeBtn = document.getElementById('add-cost-code-btn');
    if (addCostCodeBtn) {
        addCostCodeBtn.addEventListener('click', () => {
            // 'new' 상태로 테이블을 다시 그려 새 코드 입력 행을 추가합니다.
            renderCostCodesTable(loadedCostCodes, 'new');
        });
    }

    const addMemberMarkBtn = document.getElementById('add-member-mark-btn');
    if (addMemberMarkBtn) {
        addMemberMarkBtn.addEventListener('click', () => {
            // 'new' 상태로 테이블을 다시 그려 새 일람부호 입력 행을 추가합니다.
            renderMemberMarksTable(loadedMemberMarks, 'new');
        });
    }
    const costCodesTableContainer = document.getElementById(
        'cost-codes-table-container'
    );
    if (costCodesTableContainer) {
        costCodesTableContainer.addEventListener(
            'click',
            handleCostCodeActions
        );
    }

    const memberMarksTableContainer = document.getElementById(
        'member-marks-table-container'
    );
    if (memberMarksTableContainer) {
        memberMarksTableContainer.addEventListener(
            'click',
            handleMemberMarkActions
        );
    }

    const exportCostCodesBtn = document.getElementById('export-cost-codes-btn');
    if (exportCostCodesBtn) {
        exportCostCodesBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('프로젝트를 선택하세요.', 'error');
                return;
            }
            window.location.href = `/connections/api/cost-codes/${currentProjectId}/export/`;
        });
    }

    const importCostCodesBtn = document.getElementById('import-cost-codes-btn');
    if (importCostCodesBtn) {
        importCostCodesBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('프로젝트를 선택하세요.', 'error');
                return;
            }
            currentCsvImportUrl = `/connections/api/cost-codes/${currentProjectId}/import/`;
            csvFileInput.click();
        });
    }

    const exportMemberMarksBtn = document.getElementById(
        'export-member-marks-btn'
    );
    if (exportMemberMarksBtn) {
        exportMemberMarksBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('프로젝트를 선택하세요.', 'error');
                return;
            }
            window.location.href = `/connections/api/member-marks/${currentProjectId}/export/`;
        });
    }

    const importMemberMarksBtn = document.getElementById(
        'import-member-marks-btn'
    );
    if (importMemberMarksBtn) {
        importMemberMarksBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('프로젝트를 선택하세요.', 'error');
                return;
            }
            currentCsvImportUrl = `/connections/api/member-marks/${currentProjectId}/import/`;
            csvFileInput.click();
        });
    }

    const exportSpacesBtn = document.getElementById(
        'export-space-classifications-btn'
    );
    if (exportSpacesBtn) {
        exportSpacesBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('프로젝트를 선택하세요.', 'error');
                return;
            }
            window.location.href = `/connections/api/space-classifications/${currentProjectId}/export/`;
        });
    }

    const importSpacesBtn = document.getElementById(
        'import-space-classifications-btn'
    );
    if (importSpacesBtn) {
        importSpacesBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('프로젝트를 선택하세요.', 'error');
                return;
            }
            currentCsvImportUrl = `/connections/api/space-classifications/${currentProjectId}/import/`;
            csvFileInput.click();
        });
    }

    // --- '집계' 탭 버튼 이벤트 리스너 ---
    const generateBoqBtn = document.getElementById('generate-boq-btn');
    if (generateBoqBtn) {
        generateBoqBtn.addEventListener('click', generateBoqReport);
    }

    const boqResetColumnsBtn = document.getElementById('boq-reset-columns-btn');
    if (boqResetColumnsBtn) {
        boqResetColumnsBtn.addEventListener(
            'click',
            resetBoqColumnsAndRegenerate
        );
    }

    const exportBoqBtn = document.getElementById('export-boq-btn');
    if (exportBoqBtn) {
        // Excel 내보내기 기능은 아직 구현되지 않았으므로, 임시 함수를 연결합니다.
        exportBoqBtn.addEventListener('click', exportBoqReportToExcel);
    }

    const boqGetFromClientBtn = document.getElementById(
        'boq-get-from-client-btn'
    );
    if (boqGetFromClientBtn) {
        boqGetFromClientBtn.addEventListener('click', handleBoqGetFromClient);
    }

    const boqSelectInClientBtn = document.getElementById(
        'boq-select-in-client-btn'
    );
    if (boqSelectInClientBtn) {
        boqSelectInClientBtn.addEventListener('click', handleBoqSelectInClient);
    }

    const boqClearFilterBtn = document.getElementById(
        'boq-clear-selection-filter-btn'
    );
    if (boqClearFilterBtn) {
        boqClearFilterBtn.addEventListener('click', handleBoqClearFilter);
    }

    const addBoqGroupLevelBtn = document.getElementById(
        'add-boq-group-level-btn'
    );
    if (addBoqGroupLevelBtn) {
        addBoqGroupLevelBtn.addEventListener('click', addBoqGroupingLevel);
    }

    const exportProjectBtn = document.getElementById('project-export-btn');
    if (exportProjectBtn) {
        exportProjectBtn.addEventListener('click', () => {
            if (!currentProjectId) {
                showToast('내보낼 프로젝트를 먼저 선택하세요.', 'error');
                return;
            }
            console.log(
                `[DEBUG] 프로젝트 내보내기 버튼 클릭 (ID: ${currentProjectId})`
            );
            window.location.href = `/connections/export-project/${currentProjectId}/`;
        });
    }

    const importProjectBtn = document.getElementById('project-import-btn');
    const importProjectInput = document.getElementById('project-import-input');

    if (importProjectBtn && importProjectInput) {
        importProjectBtn.addEventListener('click', () => {
            console.log(
                '[DEBUG] 프로젝트 가져오기 버튼 클릭. 파일 선택창을 엽니다.'
            );
            importProjectInput.click();
        });

        importProjectInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) {
                console.log('[DEBUG] 파일 선택이 취소되었습니다.');
                return;
            }

            console.log(
                `[DEBUG] 파일 선택됨: ${file.name}. 서버로 업로드를 시작합니다.`
            );
            showToast(
                '프로젝트 파일을 업로드하고 있습니다. 용량에 따라 시간이 걸릴 수 있습니다.',
                'info',
                10000
            );

            const formData = new FormData();
            formData.append('project_file', file);

            try {
                const response = await fetch('/connections/import-project/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrftoken },
                    body: formData,
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(
                        result.message || '프로젝트 가져오기에 실패했습니다.'
                    );
                }

                showToast(result.message, 'success');
                console.log(
                    '[DEBUG] 프로젝트 가져오기 성공. 페이지를 새로고침합니다.'
                );
                // 가장 확실한 방법은 페이지를 새로고침하여 프로젝트 목록과 모든 상태를 갱신하는 것입니다.
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } catch (error) {
                console.error('[ERROR] 프로젝트 가져오기 중 오류 발생:', error);
                showToast(error.message, 'error');
            } finally {
                // 다음 업로드를 위해 파일 입력 필드를 초기화합니다.
                event.target.value = '';
            }
        });
    }

    const batchAutoUpdateBtn = document.getElementById('batch-auto-update-btn');
    if (batchAutoUpdateBtn) {
        batchAutoUpdateBtn.addEventListener('click', runBatchAutoUpdate);
    }
    const costCodeSearchInput = document.getElementById(
        'unit-price-cost-code-search'
    );
    if (costCodeSearchInput) {
        costCodeSearchInput.addEventListener(
            'input',
            debounce(() => {
                console.log(
                    '[DEBUG] Cost code search input changed, rendering list...'
                );
                renderCostCodeListForUnitPrice(loadedCostCodes);
            }, 300)
        ); // 300ms 디바운스 적용
    } else {
        console.warn('[WARN] Element #unit-price-cost-code-search not found.');
    }

    const costCodeListContainer = document.getElementById(
        'unit-price-cost-code-list'
    );
    if (costCodeListContainer) {
        costCodeListContainer.addEventListener(
            'click',
            handleCostCodeSelectionForUnitPrice
        );
    } else {
        console.warn('[WARN] Element #unit-price-cost-code-list not found.');
    }

    const addTypeBtn = document.getElementById('add-unit-price-type-btn');
    if (addTypeBtn) {
        addTypeBtn.addEventListener('click', () => {
            console.log("[DEBUG] 'Add Unit Price Type' button clicked.");
            // 다른 행이 편집 중인지 확인
            const existingEditRow = document.querySelector(
                '#unit-price-type-table-container .editable-row'
            );
            if (existingEditRow && existingEditRow.dataset.id !== 'new') {
                showToast(
                    '이미 편집 중인 단가 구분이 있습니다. 먼저 저장하거나 취소하세요.',
                    'warning'
                );
                return;
            }
            if (existingEditRow && existingEditRow.dataset.id === 'new') {
                console.log("[DEBUG] Already in 'new type' edit mode.");
                return; // 이미 새 항목 추가 모드면 무시
            }
            renderUnitPriceTypesTable(loadedUnitPriceTypes, 'new');
        });
    } else {
        console.warn('[WARN] Element #add-unit-price-type-btn not found.');
    }

    const typeTableContainer = document.getElementById(
        'unit-price-type-table-container'
    );
    if (typeTableContainer) {
        typeTableContainer.addEventListener(
            'click',
            handleUnitPriceTypeActions
        );
    } else {
        console.warn(
            '[WARN] Element #unit-price-type-table-container not found.'
        );
    }

    const addPriceBtn = document.getElementById('add-unit-price-btn');
    if (addPriceBtn) {
        addPriceBtn.addEventListener('click', () => {
            console.log("[DEBUG] 'Add Unit Price' button clicked.");
            if (!selectedCostCodeIdForUnitPrice) {
                showToast('먼저 왼쪽에서 공사코드를 선택하세요.', 'warning');
                return;
            }
            // 다른 행이 편집 중인지 확인
            const existingEditRow = document.querySelector(
                '#unit-price-table-container .editable-row'
            );
            if (existingEditRow && existingEditRow.dataset.id !== 'new') {
                showToast(
                    '이미 편집 중인 단가가 있습니다. 먼저 저장하거나 취소하세요.',
                    'warning'
                );
                return;
            }
            if (existingEditRow && existingEditRow.dataset.id === 'new') {
                console.log("[DEBUG] Already in 'new price' edit mode.");
                return; // 이미 새 항목 추가 모드면 무시
            }
            renderUnitPricesTable(loadedUnitPrices, 'new');
        });
    } else {
        console.warn('[WARN] Element #add-unit-price-btn not found.');
    }

    const priceTableContainer = document.getElementById(
        'unit-price-table-container'
    );
    if (priceTableContainer) {
        priceTableContainer.addEventListener('click', handleUnitPriceActions);
        priceTableContainer.addEventListener(
            'input',
            handleUnitPriceInputChange
        ); // 실시간 합계 계산
    } else {
        console.warn('[WARN] Element #unit-price-table-container not found.');
    }
    // ▲▲▲ [수정] 여기까지 입니다 ▲▲▲

    console.log('[DEBUG] DOMContentLoaded end');
    //DOMContentLoaded 끝
});

function handleProjectChange(e) {
    currentProjectId = e.target.value;
    allRevitData = [];

    Object.keys(viewerStates).forEach((context) => {
        const state = viewerStates[context];
        state.selectedElementIds.clear();
        state.revitFilteredIds.clear();
        state.columnFilters = {};
        state.isFilterToSelectionActive = false;
        state.collapsedGroups = {};
        state.currentGroupByFields = [];
    });

    const groupingControls = document.getElementById('grouping-controls');
    if (groupingControls) groupingControls.innerHTML = '';

    const clearSelectionBtn = document.getElementById(
        'clear-selection-filter-btn'
    );
    if (clearSelectionBtn) clearSelectionBtn.style.display = 'none';

    // ▼▼▼ [수정] renderDataTable 호출 시 올바른 컨테이너 ID를 전달합니다. ▼▼▼
    // 기존: "data-table-container" -> 수정: "data-management-data-table-container"
    renderDataTable('data-management-data-table-container', 'data-management');
    renderBimPropertiesTable('data-management');
    renderAssignedTagsTable('data-management');
    // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

    const tagList = document.getElementById('tag-list');
    if (tagList) tagList.innerHTML = '프로젝트를 선택하세요.';

    allTags = [];

    if (currentProjectId) {
        showToast(
            `프로젝트 '${
                e.target.options[e.target.selectedIndex].text
            }' 선택됨.`,
            'info'
        );
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
        );
    }
}

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
function handleMainNavClick(e) {
    const clickedButton = e.currentTarget;
    const primaryTabId = clickedButton.dataset.primaryTab;

    // 이미 활성 탭이면 아무것도 안함
    if (clickedButton.classList.contains('active') && primaryTabId !== 'boq') {
        return;
    }

    // 모든 주 탭 비활성화
    document
        .querySelectorAll('.main-nav .nav-button.active')
        .forEach((btn) => btn.classList.remove('active'));
    // 모든 보조 탭 컨테이너 숨기기
    document
        .querySelectorAll('.secondary-nav.active')
        .forEach((nav) => nav.classList.remove('active'));
    // 모든 컨텐츠 숨기기
    document
        .querySelectorAll('.tab-content.active')
        .forEach((content) => content.classList.remove('active'));

    // 클릭된 주 탭 활성화
    clickedButton.classList.add('active');

    if (primaryTabId === 'boq') {
        // '집계' 탭은 보조 탭이 없으므로 바로 컨텐츠 표시
        document.getElementById('boq').classList.add('active');
        activeTab = 'boq';
        // '집계' 탭에 필요한 데이터 로드 함수 호출
        if (activeTab === 'boq') {
            loadCostItems();
            loadQuantityMembers();
            if (allRevitData.length === 0) {
                fetchDataFromClient();
            }
            loadBoqGroupingFields();
        }
    } else {
        // '관리', '산출', '견적' 탭 처리
        const secondaryNav = document.getElementById(
            `secondary-nav-${primaryTabId}`
        );
        if (secondaryNav) {
            secondaryNav.classList.add('active');
            // ▼▼▼ [핵심 수정] ▼▼▼
            // 해당 보조 탭에서 이미 'active' 상태인 버튼을 찾거나, 없으면 첫 번째 버튼을 클릭
            let targetSubNavButton = secondaryNav.querySelector(
                '.sub-nav-button.active'
            );
            if (!targetSubNavButton) {
                targetSubNavButton =
                    secondaryNav.querySelector('.sub-nav-button');
            }

            if (targetSubNavButton) {
                targetSubNavButton.click();
            }
            // ▲▲▲ [핵심 수정] 여기까지 입니다. ▲▲▲
        }
    }
}
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
    if (targetButton.classList.contains('active')) {
        return; // 이미 활성화된 버튼이면 아무것도 안함
    }

    // [수정] 이전에 활성화된 버튼이 없을 수도 있는 경우를 대비하여 null 체크를 추가합니다.
    const currentActiveButton = document.querySelector(
        '.ruleset-nav-button.active'
    );
    if (currentActiveButton) {
        currentActiveButton.classList.remove('active');
    }

    // 클릭된 버튼 활성화
    targetButton.classList.add('active');

    const targetRulesetId = targetButton.dataset.ruleset;

    // 모든 룰셋 컨텐츠 숨기기
    document
        .querySelectorAll('.ruleset-content')
        .forEach((content) => content.classList.remove('active'));

    // [수정] 보여줄 컨텐츠가 존재하는지 확인 후 active 클래스를 추가합니다.
    const targetContent = document.getElementById(targetRulesetId);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    // [수정] strong 태그가 없는 경우를 대비하여 null 체크를 추가합니다.
    const buttonText =
        targetButton.querySelector('strong')?.innerText || '선택된 룰셋';
    showToast(`${buttonText} 탭으로 전환합니다.`, 'info');
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

// --- '집계' 탭 관련 함수들 ---
let availableBoqFields = []; // BOQ 그룹핑 필드 목록을 저장할 전역 변수

let currentBoqColumns = []; // 현재 테이블에 표시된 열의 순서와 정보 저장
let boqColumnAliases = {}; // 사용자가 수정한 열 이름(별칭) 저장
let lastBoqItemIds = []; // BOQ 상세 목록으로 돌아가기 위해 마지막으로 선택한 Item ID 목록을 저장
let currentBoqDetailItemId = null;

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
    console.log("[DEBUG] '집계표 생성' 버튼 클릭됨");

    if (!currentProjectId) {
        showToast('먼저 프로젝트를 선택하세요.', 'error');
        console.error('[DEBUG] 프로젝트가 선택되지 않아 중단됨.');
        return;
    }
    const groupBySelects = document.querySelectorAll('.boq-group-by-select');
    if (groupBySelects.length === 0) {
        showToast('하나 이상의 그룹핑 기준을 추가하세요.', 'error');
        console.error('[DEBUG] 그룹핑 기준이 없어 중단됨.');
        return;
    }

    // ▼▼▼ [추가] 체크박스 상태 읽기 ▼▼▼
    const filterAiChecked = document.getElementById('boq-filter-ai').checked;
    const filterDdChecked = document.getElementById('boq-filter-dd').checked;
    console.log(
        `[DEBUG] 필터 상태 - AI: ${filterAiChecked}, DD: ${filterDdChecked}`
    );
    // ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

    const params = new URLSearchParams();
    groupBySelects.forEach((select) => params.append('group_by', select.value));
    console.log('[DEBUG] 그룹핑 기준:', params.getAll('group_by'));

    const displayByCheckboxes = document.querySelectorAll(
        '.boq-display-field-cb:checked'
    );
    displayByCheckboxes.forEach((cb) => params.append('display_by', cb.value));
    console.log('[DEBUG] 표시 필드:', params.getAll('display_by'));

    // ▼▼▼ [추가] 체크박스 상태를 파라미터로 추가 ▼▼▼
    params.append('filter_ai', filterAiChecked);
    params.append('filter_dd', filterDdChecked);
    // ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

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
        '[DEBUG] 서버에 집계표 데이터 요청 시작...',
        `/connections/api/boq/report/${currentProjectId}/?${params.toString()}`
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

        renderBoqTable(data.report, data.summary);
        setupBoqTableInteractions();
        console.log('[DEBUG] 집계표 렌더링 완료.');
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
            const column = currentBoqColumns.find((c) => c.id === columnId);
            if (column) {
                const currentName = boqColumnAliases[columnId] || column.label;
                const newName = prompt(
                    `'${column.label}' 열의 새 이름을 입력하세요:`,
                    currentName
                );
                if (newName && newName.trim() !== '') {
                    boqColumnAliases[columnId] = newName.trim();
                    const tableData = JSON.parse(table.dataset.tableData);
                    renderBoqTable(tableData.report, tableData.summary);
                    setupBoqTableInteractions();
                }
            }
        }
    });
    headers.forEach((th) => {
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
            headers.forEach((h) =>
                h.classList.remove('drag-over-left', 'drag-over-right')
            );
            if (e.clientX < midpoint) targetTh.classList.add('drag-over-left');
            else targetTh.classList.add('drag-over-right');
        });
        th.addEventListener('dragleave', (e) =>
            e.currentTarget.classList.remove(
                'drag-over-left',
                'drag-over-right'
            )
        );
        th.addEventListener('drop', (e) => {
            e.preventDefault();
            headers.forEach((h) =>
                h.classList.remove('drag-over-left', 'drag-over-right')
            );
            const targetColumnId = e.currentTarget.dataset.columnId;
            if (draggedColumnId === targetColumnId) return;
            const draggedIndex = currentBoqColumns.findIndex(
                (c) => c.id === draggedColumnId
            );
            const [draggedItem] = currentBoqColumns.splice(draggedIndex, 1);
            const targetIndex = currentBoqColumns.findIndex(
                (c) => c.id === targetColumnId
            );
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
            if (currentSelected)
                currentSelected.classList.remove('selected-boq-row');
            row.classList.add('selected-boq-row');
            const itemIds = JSON.parse(row.dataset.itemIds || '[]');
            updateBoqDetailsPanel(itemIds);
        }
    });

    // --- 3. 중앙 하단 '포함된 산출항목' 목록 클릭 시 -> 왼쪽 상세 패널 업데이트 ---
    document
        .getElementById('boq-item-list-container')
        .addEventListener('click', (e) => {
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
        listContainer.innerHTML =
            '<p style="padding: 10px;">이 그룹에 포함된 산출항목이 없습니다.</p>';
        renderBoqItemProperties(null);
        return;
    }

    const itemsToRender = loadedCostItems.filter((item) =>
        itemIds.includes(item.id)
    );
    if (itemsToRender.length === 0) {
        listContainer.innerHTML =
            '<p style="padding: 10px;">산출항목 데이터를 찾을 수 없습니다.</p>';
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

    itemsToRender.forEach((item) => {
        let memberName = '(연관 부재 없음)';
        let rawElementName = '(BIM 원본 없음)';

        if (item.quantity_member_id) {
            const member = loadedQuantityMembers.find(
                (m) => m.id === item.quantity_member_id
            );
            if (member) {
                memberName = member.name || '(이름 없는 부재)';
                if (member.raw_element_id) {
                    const rawElement = allRevitData.find(
                        (re) => re.id === member.raw_element_id
                    );
                    rawElementName =
                        rawElement?.raw_data?.Name || '(이름 없는 원본)';
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
    const boqTab = document.getElementById('boq');
    if (!boqTab) return;

    // UI 요소들을 선택합니다.
    const leftToggleBtn = boqTab.querySelector('#boq-left-panel-toggle-btn');
    const bottomToggleBtn = boqTab.querySelector(
        '#boq-bottom-panel-toggle-btn'
    );
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
            if (!clickedButton || !clickedButton.closest('.details-panel-tabs'))
                return;
            if (clickedButton.classList.contains('active')) return;

            const targetTab = clickedButton.dataset.tab;

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
            }
        });
    }
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

    currentBoqColumns = [];
    boqColumnAliases = {};
    console.log(
        '[DEBUG] 열 상태(currentBoqColumns, boqColumnAliases) 초기화됨.'
    );

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

function handleSubNavClick(e) {
    console.log('[DEBUG][handleSubNavClick] Start');
    const clickedButton = e.currentTarget;
    const targetTabId = clickedButton.dataset.tab;
    const targetContent = document.getElementById(targetTabId);
    console.log(
        `[DEBUG][handleSubNavClick] Clicked button for tab: ${targetTabId}`
    );

    if (targetContent && targetContent.classList.contains('active')) {
        console.log(
            `[DEBUG][handleSubNavClick] Tab '${targetTabId}' is already active. Preventing re-load.`
        );
        return;
    }

    const parentNav = clickedButton.closest('.secondary-nav');
    if (parentNav) {
        // parentNav가 null일 수 있는 경우 방지
        parentNav
            .querySelector('.sub-nav-button.active')
            ?.classList.remove('active');
    } else {
        console.warn(
            `[WARN][handleSubNavClick] Could not find parent .secondary-nav for button.`
        );
    }
    clickedButton.classList.add('active');

    activeTab = clickedButton.dataset.tab;
    console.log(
        `[DEBUG][handleSubNavClick] Active tab changed to: ${activeTab}`
    );

    document
        .querySelectorAll('.tab-content.active')
        .forEach((c) => c.classList.remove('active'));
    const activeContent = document.getElementById(activeTab);
    if (activeContent) {
        activeContent.classList.add('active');
        console.log(
            `[DEBUG][handleSubNavClick] Content for tab '${activeTab}' displayed.`
        );
    } else {
        console.warn(
            `[WARN][handleSubNavClick] Content element with ID '${activeTab}' not found.`
        );
    }

    // --- 각 탭 로딩 로직 ---
    console.log(
        `[DEBUG][handleSubNavClick] Loading data for active tab '${activeTab}'...`
    );
    // ... (룰셋, 수량산출부재 등 다른 탭 로딩 로직은 동일하게 유지) ...
    if (activeTab === 'ruleset-management') {
        /* ... */
    } else if (activeTab === 'quantity-members') {
        /* ... */
    } else if (activeTab === 'cost-item-management') {
        /* ... */
    } else if (activeTab === 'cost-code-management') {
        loadCostCodes();
    } // 공사코드 관리 탭
    else if (activeTab === 'member-mark-management') {
        loadMemberMarks();
    } // 일람부호 관리 탭
    // ▼▼▼ [수정] 단가 관리 탭 로딩 로직 ▼▼▼
    else if (activeTab === 'unit-price-management') {
        console.log(
            '[DEBUG][handleSubNavClick] Loading data for Unit Price Management tab...'
        );
        // 공사코드 목록은 필요 시 항상 다시 로드 (다른 탭에서 변경될 수 있으므로)
        loadCostCodesForUnitPrice();
        // 단가 구분 목록도 필요 시 항상 다시 로드
        loadUnitPriceTypes();
        // 단가 리스트는 공사코드 선택 시 로드되므로 여기서는 초기화만
        selectedCostCodeIdForUnitPrice = null; // 선택된 공사코드 초기화
        document.getElementById('add-unit-price-btn').disabled = true; // '새 단가 추가' 버튼 비활성화
        document.getElementById('unit-price-list-header').textContent =
            '단가 리스트 (공사코드를 선택하세요)';
        renderUnitPricesTable([]); // 빈 테이블 표시
        console.log(
            '[DEBUG][handleSubNavClick] Initial data loaded for Unit Price Management tab.'
        );
    }
    // ▲▲▲ [수정] 여기까지 입니다 ▲▲▲
    else if (activeTab === 'space-management') {
        /* ... */
    } else if (activeTab === 'boq') {
        /* ... */
    } // BOQ 탭 로딩 로직 추가 필요 시 여기에

    console.log('[DEBUG][handleSubNavClick] End');
}
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

        // ▼▼▼ [수정] 6번째 단계를 '집계표 생성'으로 변경합니다. ▼▼▼
        console.log('[DEBUG] (6/6) 집계표 생성 시작...');
        showToast('6/6: 최종 집계표를 생성합니다...', 'info');
        generateBoqReport(); // resetBoqColumnsAndRegenerate(true) 대신 이 함수를 호출
        showToast('✅ (6/6) 집계표 생성 완료.', 'success');
        // ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

        showToast('🎉 모든 자동화 프로세스가 완료되었습니다.', 'success', 5000);
        console.log('[DEBUG] --- 일괄 자동 업데이트 성공적으로 완료 ---');
    } catch (error) {
        console.error('[ERROR] 일괄 자동 업데이트 중 오류 발생:', error);
        showToast(`오류 발생: ${error.message}`, 'error', 5000);
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
