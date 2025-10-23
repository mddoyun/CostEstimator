// connections/static/connections/ui.js

function getValueForItem(item, field) {
    if (!item || !field) return '';
    if (field === 'classification_tags')
        return Array.isArray(item.classification_tags)
            ? item.classification_tags.join(', ')
            : '';
    const raw_data = item.raw_data || {};
    if (field in item && field !== 'raw_data') return item[field] ?? '';
    if (field.startsWith('TypeParameters.')) {
        const subKey = field.substring(15);
        return raw_data.TypeParameters
            ? raw_data.TypeParameters[subKey] ?? ''
            : '';
    }
    if (raw_data.Parameters && field in raw_data.Parameters)
        return raw_data.Parameters[field] ?? '';
    if (field in raw_data) return raw_data[field] ?? '';
    return '';
}

const lowerValueCache = new Map(); // key: `${item.id}::${field}` -> value: string

function getLowerValueForItem(item, field) {
    const key = `${item?.id ?? ''}::${field}`;
    if (lowerValueCache.has(key)) return lowerValueCache.get(key);
    const v = (getValueForItem(item, field) ?? '').toString().toLowerCase();
    lowerValueCache.set(key, v);
    return v;
}

// [도우미] 필터 일치 검사
function matchesFilter(item, filters) {
    // filters: state.columnFilters (소문자 저장됨)
    for (const field in filters) {
        const needle = filters[field];
        if (!needle) continue;
        const hay = getLowerValueForItem(item, field);
        if (!hay.includes(needle) === true) return false;
    }
    return true;
}

function populateFieldSelection() {
    // 1. 수정 전, 현재 탭별로 체크된 필드 값을 미리 저장합니다.
    const getCheckedValues = (contextSelector) =>
        Array.from(
            document.querySelectorAll(
                `${contextSelector} .field-checkbox:checked`
            )
        ).map((cb) => cb.value);

    const dmCheckedFields = getCheckedValues('#data-management');
    const smCheckedFields = getCheckedValues('#space-management');

    // 2. 기존 로직: 컨테이너 탐색 및 키 계산 (이 부분은 동일합니다)
    const dmSystemContainer = document.getElementById('system-field-container');
    const dmRevitContainer = document.getElementById('revit-field-container');
    const smSystemContainer = document.getElementById(
        'sm-system-field-container'
    );
    const smRevitContainer = document.getElementById(
        'sm-revit-field-container'
    );

    if (allRevitData.length === 0) return;

    const systemKeys = ['id', 'element_unique_id', 'classification_tags'];
    const revitKeysSet = new Set();
    allRevitData.forEach((item) => {
        const raw = item.raw_data;
        if (raw) {
            if (raw.Parameters)
                Object.keys(raw.Parameters).forEach((k) => revitKeysSet.add(k));
            if (raw.TypeParameters)
                Object.keys(raw.TypeParameters).forEach((k) =>
                    revitKeysSet.add(`TypeParameters.${k}`)
                );
            Object.keys(raw).forEach((k) => {
                if (k !== 'Parameters' && k !== 'TypeParameters')
                    revitKeysSet.add(k);
            });
        }
    });
    const sortedRevitKeys = Array.from(revitKeysSet).sort();

    // 3. 기존 로직: UI를 다시 그립니다 (innerHTML 덮어쓰기)
    const fillContainers = (sysContainer, revContainer) => {
        if (!sysContainer || !revContainer) return;
        sysContainer.innerHTML = systemKeys
            .map(
                (k) =>
                    `<label><input type="checkbox" class="field-checkbox" value="${k}"> ${k}</label>`
            )
            .join('');
        revContainer.innerHTML = sortedRevitKeys
            .map(
                (k) =>
                    `<label><input type="checkbox" class="field-checkbox" value="${k}"> ${k}</label>`
            )
            .join('');
    };

    fillContainers(dmSystemContainer, dmRevitContainer);
    fillContainers(smSystemContainer, smRevitContainer);

    // 4. 추가된 로직: 저장해두었던 값으로 체크 상태를 복원합니다.
    const restoreCheckedState = (contextSelector, checkedValues) => {
        checkedValues.forEach((value) => {
            // CSS.escape()를 사용하여 특수문자가 포함된 값도 안전하게 처리합니다.
            const checkbox = document.querySelector(
                `${contextSelector} .field-checkbox[value="${CSS.escape(
                    value
                )}"]`
            );
            if (checkbox) checkbox.checked = true;
        });
    };

    restoreCheckedState('#data-management', dmCheckedFields);
    restoreCheckedState('#space-management', smCheckedFields);

    // 5. 기존 로직: 모든 그룹핑 드롭다운 메뉴를 업데이트합니다. (이 부분은 동일합니다)
    const allKeysSorted = [...systemKeys, ...sortedRevitKeys].sort();
    const allGroupBySelects = document.querySelectorAll('.group-by-select');
    let optionsHtml =
        '<option value="">-- 필드 선택 --</option>' +
        allKeysSorted
            .map((key) => `<option value="${key}">${key}</option>`)
            .join('');
    allGroupBySelects.forEach((select) => {
        const selectedValue = select.value;
        select.innerHTML = optionsHtml;
        select.value = selectedValue;
    });
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

    populateFieldSelection();

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

function renderDataTable(containerId, contextPrefix) {
    const tableContainer = document.getElementById(containerId);
    if (!tableContainer) return;

    if (allRevitData.length === 0) {
        tableContainer.innerHTML = '표시할 데이터가 없습니다.';
        return;
    }

    const state = viewerStates[contextPrefix];
    if (!state) return;

    const fieldCheckboxSelector =
        contextPrefix === 'data-management'
            ? '#fields .field-checkbox:checked'
            : '#sm-fields .field-checkbox:checked';

    const selectedFields = Array.from(
        document.querySelectorAll(fieldCheckboxSelector)
    ).map((cb) => cb.value);

    if (selectedFields.length === 0) {
        tableContainer.innerHTML = '표시할 필드를 하나 이상 선택하세요.';
        return;
    }

    if (state.activeView === 'raw-data-view') {
        renderRawDataTable(containerId, selectedFields, state);
    } else if (state.activeView === 'classification-view') {
        renderClassificationTable(containerId, selectedFields, state);
    }
}

function renderRawDataTable(containerId, selectedFields, state) {
    const tableContainer = document.getElementById(containerId);
    if (!tableContainer) return;

    const dataToRender = state.isFilterToSelectionActive
        ? allRevitData.filter((item) => state.revitFilteredIds.has(item.id))
        : allRevitData;

    const filteredData = dataToRender.filter((item) =>
        matchesFilter(item, state.columnFilters)
    );

    // 그룹핑 필드 수집
    const groupingControlsContainer = tableContainer
        .closest('.table-area')
        ?.querySelector('.table-controls');
    const groupBySelects = groupingControlsContainer
        ? groupingControlsContainer.querySelectorAll('.group-by-select')
        : [];
    const currentGroupByFields = Array.from(groupBySelects)
        .map((s) => s.value)
        .filter(Boolean);

    // 기존처럼 전체 문자열을 만들지 말고, DOM을 점진적으로 구성
    tableContainer.innerHTML = '';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');

    // 머리글 + 필터 입력 상자
    selectedFields.forEach((field) => {
        const th = document.createElement('th');
        const label = document.createElement('div');
        label.textContent = field;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'column-filter';
        input.dataset.field = field;
        input.value = state.columnFilters[field] || '';
        input.placeholder = '필터...';

        th.appendChild(label);
        th.appendChild(input);
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableContainer.appendChild(table);

    // 그룹핑이 없으면 행만 배치 추가
    if (currentGroupByFields.length === 0) {
        const BATCH = 1000; // 환경에 맞춰 500~1500 사이로 조절
        let i = 0;

        function appendBatch() {
            const frag = document.createDocumentFragment();
            for (let c = 0; c < BATCH && i < filteredData.length; c++, i++) {
                const item = filteredData[i];
                const row = document.createElement('tr');
                row.dataset.dbId = item.id;
                if (state.selectedElementIds.has(item.id))
                    row.classList.add('selected-row');
                row.style.cursor = 'pointer';

                selectedFields.forEach((field) => {
                    const td = document.createElement('td');
                    td.textContent = getValueForItem(item, field);
                    frag.appendChild(td); // <- 실수 방지: td는 row에 붙여야 함
                    row.appendChild(td);
                });
                frag.appendChild(row);
            }
            tbody.appendChild(frag);
            if (i < filteredData.length) {
                requestAnimationFrame(appendBatch);
            }
        }
        requestAnimationFrame(appendBatch);
        return;
    }

    // 그룹핑이 있는 경우: 그룹 헤더/자식도 프레임 분할로 추가
    // 그룹 트리 구성
    function groupItems(items, level) {
        if (level >= currentGroupByFields.length) return { __leaf__: items };
        const field = currentGroupByFields[level];
        const map = {};
        for (const it of items) {
            const key = getValueForItem(it, field) || '(값 없음)';
            (map[key] ??= []).push(it);
        }
        const result = {};
        // 정렬 유지
        Object.keys(map)
            .sort()
            .forEach((k) => {
                result[k] = groupItems(map[k], level + 1);
            });
        return result;
    }

    const root = groupItems(filteredData, 0);
    const tasks = []; // 렌더 작업 큐 (헤더/행 생성 단위)

    function enqueueGroup(node, level, parentPath) {
        if (node['__leaf__']) {
            for (const item of node['__leaf__']) {
                tasks.push(() => {
                    const row = document.createElement('tr');
                    row.dataset.dbId = item.id;
                    if (state.selectedElementIds.has(item.id))
                        row.classList.add('selected-row');
                    row.style.cursor = 'pointer';
                    selectedFields.forEach((field) => {
                        const td = document.createElement('td');
                        td.textContent = getValueForItem(item, field);
                        row.appendChild(td);
                    });
                    tbody.appendChild(row);
                });
            }
            return;
        }

        Object.keys(node).forEach((key) => {
            const groupField = currentGroupByFields[level];
            const currentPath = `${parentPath}|${groupField}:${key}`;
            const isCollapsed = !!state.collapsedGroups[currentPath];

            tasks.push(() => {
                const indentPixels = level * 20;
                const headerRow = document.createElement('tr');
                headerRow.className = `group-header group-level-${level}`;
                headerRow.dataset.groupPath = currentPath;

                const td = document.createElement('td');
                td.colSpan = selectedFields.length;
                td.style.paddingLeft = `${indentPixels}px`;

                const icon = document.createElement('span');
                icon.className = 'toggle-icon';
                icon.textContent = isCollapsed ? '▶' : '▼';

                td.appendChild(icon);
                td.appendChild(
                    document.createTextNode(` ${groupField}: ${key}`)
                );
                headerRow.appendChild(td);
                tbody.appendChild(headerRow);
            });

            if (!isCollapsed) enqueueGroup(node[key], level + 1, currentPath);
        });
    }

    enqueueGroup(root, 0, '');

    // 프레임 분할로 작업 수행
    const STEP = 800; // 한 프레임에 처리할 작업 수 (환경/데이터에 맞춰 조절)
    let idx = 0;
    function runChunk() {
        for (let c = 0; c < STEP && idx < tasks.length; c++, idx++) {
            tasks[idx]();
        }
        if (idx < tasks.length) requestAnimationFrame(runChunk);
    }
    requestAnimationFrame(runChunk);
}

function renderClassificationTable(containerId, selectedFields, state) {
    const tableContainer = document.getElementById(containerId);
    if (!tableContainer) return;

    let dataToRender = state.isFilterToSelectionActive
        ? allRevitData.filter((item) => state.revitFilteredIds.has(item.id))
        : allRevitData;

    const groupingControlsContainer = tableContainer
        .closest('.table-area')
        ?.querySelector('.table-controls');
    const groupBySelects = groupingControlsContainer
        ? groupingControlsContainer.querySelectorAll('.group-by-select')
        : [];
    const currentGroupByFields = Array.from(groupBySelects)
        .map((s) => s.value)
        .filter(Boolean);

    const dataByTag = {};
    dataToRender.forEach((item) => {
        const tags = item.classification_tags;
        if (tags && tags.length > 0) {
            tags.forEach((tag) => {
                if (!dataByTag[tag]) dataByTag[tag] = [];
                dataByTag[tag].push(item);
            });
        } else {
            if (!dataByTag['(분류 없음)']) dataByTag['(분류 없음)'] = [];
            dataByTag['(분류 없음)'].push(item);
        }
    });

    let tableHtml = '<table><thead><tr>';
    selectedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            state.columnFilters[field] || ''
        }" placeholder="필터..."></th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    function renderSubGroup(items, level, parentPath) {
        if (level >= currentGroupByFields.length || items.length === 0) {
            items.forEach((item) => {
                tableHtml += `<tr data-db-id="${item.id}" class="${
                    state.selectedElementIds.has(item.id) ? 'selected-row' : ''
                }" style="cursor: pointer;">`;
                selectedFields.forEach(
                    (field) =>
                        (tableHtml += `<td>${getValueForItem(
                            item,
                            field
                        )}</td>`)
                );
                tableHtml += '</tr>';
            });
            return;
        }

        const groupField = currentGroupByFields[level];
        const grouped = items.reduce((acc, item) => {
            const key = getValueForItem(item, groupField) || '(값 없음)';
            (acc[key] = acc[key] || []).push(item);
            return acc;
        }, {});

        Object.keys(grouped)
            .sort()
            .forEach((key) => {
                const currentPath = `${parentPath}|${groupField}:${key}`;
                const isCollapsed = state.collapsedGroups[currentPath];
                const indentPixels = 20 + level * 20;

                tableHtml += `<tr class="group-header group-level-${
                    level + 1
                }" data-group-path="${currentPath}">
                            <td colspan="${
                                selectedFields.length
                            }" style="padding-left: ${indentPixels}px;">
                                <span class="toggle-icon">${
                                    isCollapsed ? '▶' : '▼'
                                }</span>
                                ${groupField}: ${key} (${grouped[key].length}개)
                            </td>
                          </tr>`;

                if (!isCollapsed) {
                    renderSubGroup(grouped[key], level + 1, currentPath);
                }
            });
    }

    Object.keys(dataByTag)
        .sort()
        .forEach((tag) => {
            const items = dataByTag[tag].filter((item) =>
                matchesFilter(item, state.columnFilters)
            );

            if (items.length === 0) return;

            const groupPath = `tag|${tag}`;
            const isCollapsed = state.collapsedGroups[groupPath];

            tableHtml += `<tr class="group-header group-level-0" data-group-path="${groupPath}">
                        <td colspan="${selectedFields.length}">
                            <span class="toggle-icon">${
                                isCollapsed ? '▶' : '▼'
                            }</span>
                            분류: ${tag} (${items.length}개)
                        </td>
                      </tr>`;

            if (!isCollapsed) {
                renderSubGroup(items, 0, groupPath);
            }
        });

    tableHtml += '</tbody></table>';
    tableContainer.innerHTML = tableHtml;
}

function updateTagLists(tags) {
    const tagListDiv = document.getElementById('tag-list');
    const tagAssignSelect = document.getElementById('tag-assign-select');
    tagListDiv.innerHTML = tags
        .map(
            (tag) => `
        <div>
            <span>${tag.name}</span>
            <div class="tag-actions">
                <button class="rename-tag-btn" data-id="${tag.id}" data-name="${tag.name}">수정</button>
                <button class="delete-tag-btn" data-id="${tag.id}">삭제</button>
            </div>
        </div>
    `
        )
        .join('');
    if (tagAssignSelect) {
        let optionsHtml = '<option value="">-- 적용할 분류 선택 --</option>';
        tags.forEach((tag) => {
            optionsHtml += `<option value="${tag.id}">${tag.name}</option>`;
        });
        tagAssignSelect.innerHTML = optionsHtml;
    }
}

const toastQueue = [];
let activeToasts = 0;
const MAX_ACTIVE_TOASTS = 3;

function processToastQueue() {
    // 1. 표시할 공간이 없거나, 대기열에 알림이 없으면 함수를 종료합니다.
    if (activeToasts >= MAX_ACTIVE_TOASTS || toastQueue.length === 0) {
        return;
    }

    // 2. 대기열에서 다음 알림 데이터를 가져오고, 활성 알림 수를 1 증가시킵니다.
    const toastData = toastQueue.shift();
    activeToasts++;

    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-message ${toastData.type}`;
    toast.textContent = toastData.message;
    container.appendChild(toast);

    // 3. 잠시 후 'show' 클래스를 추가하여 화면에 나타나는 애니메이션을 실행합니다.
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // 4. 지정된 시간(duration)이 지나면 알림을 사라지게 합니다.
    setTimeout(() => {
        toast.classList.remove('show');

        // 5. [핵심 수정] 'transitionend' 이벤트 대신 고정된 시간(500ms)을 기다립니다.
        // 이 시간은 style.css의 .toast-message { transition: all 0.5s; } 와 일치해야 합니다.
        setTimeout(() => {
            toast.remove(); // DOM에서 알림 요소를 완전히 제거합니다.
            activeToasts--; // 활성 알림 수를 1 감소시킵니다.
            processToastQueue(); // 이제 공간이 생겼으므로, 대기열에 다음 알림이 있는지 확인하고 처리합니다.
        }, 500); // CSS 애니메이션 지속 시간
    }, toastData.duration);
}

function showToast(message, type = 'info', duration = 3000) {
    toastQueue.push({ message, type, duration });
    processToastQueue();
}

function renderClassificationRulesetTable(rules, editingRuleId = null) {
    const container = document.querySelector(
        '#classification-ruleset .ruleset-table-container'
    );
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하고 규칙을 추가하세요.</p>';
        return;
    }

    const tagOptions = Array.from(
        document.querySelectorAll('#tag-assign-select option')
    )
        .filter((opt) => opt.value)
        .map((opt) => `<option value="${opt.value}">${opt.text}</option>`)
        .join('');

    let tableHtml = `
        <table class="ruleset-table">
            <thead>
                <tr>
                    <th style="width: 10%;">우선순위</th>
                    <th style="width: 25%;">설명</th>
                    <th style="width: 15%;">대상 분류</th>
                    <th>조건 (JSON 형식)</th>
                    <th style="width: 15%;">작업</th>
                </tr>
            </thead>
            <tbody>
    `;

    // 기존 규칙들을 순회하며 행 생성
    rules.forEach((rule) => {
        if (rule.id === editingRuleId) {
            // 편집 모드 행
            tableHtml += `
                <tr class="rule-edit-row" data-rule-id="${rule.id}">
                    <td><input type="number" class="rule-priority-input" value="${
                        rule.priority
                    }"></td>
                    <td><input type="text" class="rule-description-input" value="${
                        rule.description
                    }" placeholder="예: 모든 RC벽 분류"></td>
                    <td><select class="rule-tag-select">${tagOptions}</select></td>
                    <td><textarea class="rule-conditions-input" placeholder='[{"parameter": "Category", "operator": "equals", "value": "Walls"}]'>${JSON.stringify(
                        rule.conditions,
                        null,
                        2
                    )}</textarea></td>
                    <td>
                        <button class="save-rule-btn">저장</button>
                        <button class="cancel-edit-btn">취소</button>
                    </td>
                </tr>
            `;
        } else {
            // 일반 보기 모드 행
            tableHtml += `
                <tr data-rule-id="${rule.id}">
                    <td>${rule.priority}</td>
                    <td>${rule.description}</td>
                    <td>${rule.target_tag_name}</td>
                    <td><pre>${JSON.stringify(
                        rule.conditions,
                        null,
                        2
                    )}</pre></td>
                    <td>
                        <button class="edit-rule-btn">수정</button>
                        <button class="delete-rule-btn">삭제</button>
                    </td>
                </tr>
            `;
        }
    });

    // 새 규칙 추가 행 (editingRuleId가 'new'일 경우)
    if (editingRuleId === 'new') {
        tableHtml += `
            <tr class="rule-edit-row" data-rule-id="new">
                <td><input type="number" class="rule-priority-input" value="0"></td>
                <td><input type="text" class="rule-description-input" placeholder="예: 모든 RC벽 분류"></td>
                <td><select class="rule-tag-select"><option value="">-- 분류 선택 --</option>${tagOptions}</select></td>
                <td><textarea class="rule-conditions-input" placeholder='[{"parameter": "Category", "operator": "equals", "value": "Walls"}]'></textarea></td>
                <td>
                    <button class="save-rule-btn">저장</button>
                    <button class="cancel-edit-btn">취소</button>
                </td>
            </tr>
        `;
    }

    if (rules.length === 0 && editingRuleId !== 'new') {
        tableHtml +=
            '<tr><td colspan="5">정의된 규칙이 없습니다. 새 규칙을 추가하세요.</td></tr>';
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;

    // 편집 모드일 때, select 요소의 현재 값을 설정
    if (editingRuleId && editingRuleId !== 'new') {
        const rule = rules.find((r) => r.id === editingRuleId);
        if (rule) {
            const selectElement = container.querySelector(
                `tr[data-rule-id="${rule.id}"] .rule-tag-select`
            );
            if (selectElement) selectElement.value = rule.target_tag_id;
        }
    }
}

/**
 * '수량산출부재' 데이터를 그룹핑, 필터링, 선택 상태를 반영하여 테이블로 렌더링합니다. (수량산출부재 뷰 전용)
 * @param {Array} members - 렌더링할 전체 수량산출부재 데이터
 * @param {String|null} editingMemberId - 현재 편집 중인 부재의 ID
 */
function renderRawQmTable(members, editingMemberId = null) {
    const container = document.getElementById('qm-table-container');
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }

    const getQmValue = (item, field) => {
        if (!field) return '';

        if (field.startsWith('BIM원본.')) {
            const key = field.substring(6);
            if (item.raw_element_id) {
                const rawElement = allRevitData.find(
                    (el) => el.id === item.raw_element_id
                );
                return rawElement ? getValueForItem(rawElement, key) : '';
            }
            return '';
        }

        if (field.startsWith('일람부호.')) {
            const key = field.substring(5);
            if (item.member_mark_id) {
                const mark = loadedMemberMarks.find(
                    (m) => m.id === item.member_mark_id
                );
                if (mark) {
                    if (key === 'Mark') {
                        return mark.mark;
                    }
                    return mark.properties?.[key] ?? '';
                }
            }
            return '';
        }

        if (field === 'mapping_expression') {
            const value = item[field];
            if (
                value &&
                typeof value === 'object' &&
                Object.keys(value).length > 0
            ) {
                return JSON.stringify(value);
            }
            return '';
        }
        return item[field] ?? '';
    };

    const filteredMembers = members.filter((member) =>
        Object.keys(qmColumnFilters).every((field) => {
            const filterValue = qmColumnFilters[field];
            return (
                !filterValue ||
                getQmValue(member, field)
                    .toString()
                    .toLowerCase()
                    .includes(filterValue)
            );
        })
    );

    currentQmGroupByFields = Array.from(
        document.querySelectorAll('#qm-grouping-controls .qm-group-by-select')
    )
        .map((s) => s.value)
        .filter(Boolean);

    const sortedFields = [
        'name',
        'classification_tag_name',
        'mapping_expression',
        'raw_element_id',
    ];

    let tableHtml = '<table><thead><tr>';
    sortedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            qmColumnFilters[field] || ''
        }" placeholder="필터..."></th>`;
    });
    tableHtml += `<th>작업</th></tr></thead><tbody>`;

    function renderGroup(items, level, parentPath) {
        if (level >= currentQmGroupByFields.length || items.length === 0) {
            items.forEach((m) => {
                if (m.id === editingMemberId) {
                    const tagOptions = allTags
                        .map(
                            (opt) =>
                                `<option value="${opt.id}" ${
                                    opt.id == m.classification_tag_id
                                        ? 'selected'
                                        : ''
                                }>${opt.name}</option>`
                        )
                        .join('');

                    tableHtml += `
                        <tr class="qm-edit-row" data-id="${m.id}">
                            <td><input type="text" class="qm-name-input" value="${
                                m.name || ''
                            }"></td>
                            <td><select class="qm-tag-select"><option value="">-- 분류 없음 --</option>${tagOptions}</select></td>
                            <td>
                                <div style="margin-bottom: 5px;">
                                    <small style="font-weight: bold;">맵핑식 (JSON):</small>
                                    <textarea class="qm-mapping-expression-input" rows="3" placeholder="{}">${JSON.stringify(
                                        m.mapping_expression || {},
                                        null,
                                        2
                                    )}</textarea>
                                </div>
                                <div style="margin-bottom: 5px;">
                                    <small style="font-weight: bold;">개별 일람부호 룰:</small>
                                    <input type="text" class="qm-mark-expr-input" value="${
                                        m.member_mark_expression || ''
                                    }" placeholder="'C' + {층}">
                                </div>
                                <div>
                                    <small style="font-weight: bold;">개별 공사코드 룰 (JSON):</small>
                                    <textarea class="qm-cc-expr-input" rows="3">${JSON.stringify(
                                        m.cost_code_expressions || [],
                                        null,
                                        2
                                    )}</textarea>
                                </div>
                            </td>
                            <td>${getQmValue(m, 'raw_element_id')}</td>
                            <td style="vertical-align: middle; text-align: center;">
                                <button class="save-qm-btn" data-id="${
                                    m.id
                                }">저장</button>
                                <br><br>
                                <button class="cancel-qm-btn" data-id="${
                                    m.id
                                }">취소</button>
                            </td>
                        </tr>`;
                } else {
                    tableHtml += `
                        <tr data-id="${m.id}" class="${
                        selectedQmIds.has(m.id.toString()) ? 'selected-row' : ''
                    }" style="cursor: pointer;">
                            ${sortedFields
                                .map(
                                    (field) =>
                                        `<td>${getQmValue(m, field)}</td>`
                                )
                                .join('')}
                            <td>
                                <button class="edit-qm-btn" data-id="${
                                    m.id
                                }">수정</button>
                                <button class="delete-qm-btn" data-id="${
                                    m.id
                                }">삭제</button>
                            </td>
                        </tr>`;
                }
            });
            return;
        }

        const groupField = currentQmGroupByFields[level];
        const grouped = items.reduce((acc, item) => {
            const key = getQmValue(item, groupField) || '(값 없음)';
            (acc[key] = acc[key] || []).push(item);
            return acc;
        }, {});

        Object.keys(grouped)
            .sort()
            .forEach((key) => {
                const currentPath = `${parentPath}|${groupField}:${key}`;
                const isCollapsed = qmCollapsedGroups[currentPath];
                const indentPixels = level * 20;

                // ▼▼▼ [수정] onClick 이벤트 핸들러를 제거합니다. 이벤트 위임으로 처리됩니다. ▼▼▼
                tableHtml += `<tr class="group-header group-level-${level}" data-group-path="${currentPath}">
                            <td colspan="${
                                sortedFields.length + 1
                            }" style="padding-left: ${indentPixels}px;">
                                <span class="toggle-icon">${
                                    isCollapsed ? '▶' : '▼'
                                }</span>
                                ${groupField}: ${key} (${grouped[key].length}개)
                            </td>
                          </tr>`;

                if (!isCollapsed)
                    renderGroup(grouped[key], level + 1, currentPath);
            });
    }

    if (filteredMembers.length === 0) {
        tableHtml += `<tr><td colspan="${
            sortedFields.length + 1
        }">표시할 데이터가 없습니다.</td></tr>`;
    } else {
        renderGroup(filteredMembers, 0, '');
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

/**
 * '공사코드별 뷰' 테이블을 렌더링합니다.
 * @param {Array} members - 렌더링할 전체 수량산출부재 데이터
 */
function renderCostCodeViewTable(members) {
    const container = document.getElementById('qm-table-container');
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }

    // getQmValue 함수 (renderRawQmTable과 동일)
    const getQmValue = (item, field) => {
        if (!field) return '';
        if (field.startsWith('BIM원본.')) {
            const key = field.substring(6);
            const rawElement = item.raw_element_id
                ? allRevitData.find((el) => el.id === item.raw_element_id)
                : null;
            return rawElement ? getValueForItem(rawElement, key) : '';
        }
        if (field.startsWith('일람부호.')) {
            const key = field.substring(5);
            const mark = item.member_mark_id
                ? loadedMemberMarks.find((m) => m.id === item.member_mark_id)
                : null;
            if (mark)
                return key === 'Mark'
                    ? mark.mark
                    : mark.properties?.[key] ?? '';
            return '';
        }
        return item[field] ?? '';
    };

    const dataByCostCode = {};
    members.forEach((member) => {
        const codes = member.cost_code_ids;
        if (codes && codes.length > 0) {
            codes.forEach((codeId) => {
                const costCode = loadedCostCodes.find((c) => c.id === codeId);
                const codeName = costCode
                    ? `${costCode.code} - ${costCode.name}`
                    : `(알 수 없는 코드: ${codeId})`;
                if (!dataByCostCode[codeName]) dataByCostCode[codeName] = [];
                dataByCostCode[codeName].push(member);
            });
        } else {
            if (!dataByCostCode['(공사코드 없음)'])
                dataByCostCode['(공사코드 없음)'] = [];
            dataByCostCode['(공사코드 없음)'].push(member);
        }
    });

    currentQmGroupByFields = Array.from(
        document.querySelectorAll('#qm-grouping-controls .qm-group-by-select')
    )
        .map((s) => s.value)
        .filter(Boolean);
    const displayedFields = [
        'name',
        'classification_tag_name',
        'raw_element_id',
    ]; // 공사코드 뷰에서는 공사코드 정보가 그룹 헤더에 있으므로 테이블에서는 제외

    let tableHtml = '<table><thead><tr>';
    displayedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            qmColumnFilters[field] || ''
        }" placeholder="필터..."></th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    // 재귀적으로 하위 그룹을 렌더링하는 함수 (renderClassificationTable과 유사)
    function renderSubGroup(items, level, parentPath) {
        if (level >= currentQmGroupByFields.length || items.length === 0) {
            items.forEach((item) => {
                tableHtml += `<tr data-id="${item.id}" class="${
                    selectedQmIds.has(item.id.toString()) ? 'selected-row' : ''
                }" style="cursor: pointer;">`;
                displayedFields.forEach(
                    (field) =>
                        (tableHtml += `<td>${getQmValue(item, field)}</td>`)
                );
                tableHtml += '</tr>';
            });
            return;
        }

        const groupField = currentQmGroupByFields[level];
        const grouped = items.reduce((acc, item) => {
            const key = getQmValue(item, groupField) || '(값 없음)';
            (acc[key] = acc[key] || []).push(item);
            return acc;
        }, {});

        Object.keys(grouped)
            .sort()
            .forEach((key) => {
                const currentPath = `${parentPath}|${groupField}:${key}`;
                const isCollapsed = qmCollapsedGroups[currentPath];
                const indentPixels = 20 + level * 20;

                tableHtml += `<tr class="group-header group-level-${
                    level + 1
                }" data-group-path="${currentPath}">
                            <td colspan="${
                                displayedFields.length
                            }" style="padding-left: ${indentPixels}px;">
                                <span class="toggle-icon">${
                                    isCollapsed ? '▶' : '▼'
                                }</span>
                                ${groupField}: ${key} (${grouped[key].length}개)
                            </td>
                          </tr>`;

                if (!isCollapsed) {
                    renderSubGroup(grouped[key], level + 1, currentPath);
                }
            });
    }

    Object.keys(dataByCostCode)
        .sort()
        .forEach((codeName) => {
            const items = dataByCostCode[codeName].filter((item) =>
                Object.keys(qmColumnFilters).every(
                    (field) =>
                        !qmColumnFilters[field] ||
                        getQmValue(item, field)
                            .toString()
                            .toLowerCase()
                            .includes(qmColumnFilters[field])
                )
            );
            if (items.length === 0) return;

            const groupPath = `costcode|${codeName}`;
            const isCollapsed = qmCollapsedGroups[groupPath];

            tableHtml += `<tr class="group-header group-level-0" data-group-path="${groupPath}">
                        <td colspan="${displayedFields.length}">
                            <span class="toggle-icon">${
                                isCollapsed ? '▶' : '▼'
                            }</span>
                            공사코드: ${codeName} (${items.length}개)
                        </td>
                      </tr>`;

            if (!isCollapsed) {
                renderSubGroup(items, 0, groupPath);
            }
        });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

/**
 * 현재 활성화된 '수량산출부재' 탭의 뷰에 따라 적절한 렌더링 함수를 호출합니다.
 * @param {String|null} editingMemberId - 현재 편집 중인 부재의 ID
 */
function renderActiveQmView(editingMemberId = null) {
    // const editingId = editingMemberId || document.querySelector('#qm-table-container .qm-edit-row')?.dataset.id;

    if (activeQmView === 'quantity-member-view') {
        renderRawQmTable(loadedQuantityMembers, editingMemberId);
    } else if (activeQmView === 'cost-code-view') {
        // 공사코드 뷰에서는 인라인 편집을 지원하지 않으므로 editingId를 무시합니다.
        renderCostCodeViewTable(loadedQuantityMembers);
    }
}

// ▼▼▼ [수정] 이 함수를 아래 코드로 교체해주세요. ▼▼▼
function toggleQmGroup(groupPath) {
    qmCollapsedGroups[groupPath] = !qmCollapsedGroups[groupPath];
    renderActiveQmView();
}
/**
 * '수량산출부재' 데이터와 연관된 모든 속성을 분석하여 그룹핑 필드 목록을 동적으로 채웁니다.
 * @param {Array} members - 수량산출부재 데이터 배열
 */
function populateQmFieldSelection(members) {
    if (members.length === 0) return;

    const fieldKeys = new Set(['name', 'classification_tag_name']);

    const membersToScan = members.slice(0, 50);
    membersToScan.forEach((member) => {
        if (member.member_mark_id) {
            const mark = loadedMemberMarks.find(
                (m) => m.id === member.member_mark_id
            );
            if (mark) {
                // '일람부호.Mark'를 그룹핑 옵션에 추가
                fieldKeys.add('일람부호.Mark');
                if (mark.properties) {
                    Object.keys(mark.properties).forEach((key) =>
                        fieldKeys.add(`일람부호.${key}`)
                    );
                }
            }
        }

        if (member.raw_element_id) {
            const rawElement = allRevitData.find(
                (el) => el.id === member.raw_element_id
            );
            if (rawElement && rawElement.raw_data) {
                const rawData = rawElement.raw_data;
                // 'BIM원본' 관련 속성을 그룹핑 옵션에 추가
                if (rawData.Parameters)
                    Object.keys(rawData.Parameters).forEach((k) =>
                        fieldKeys.add(`BIM원본.${k}`)
                    );
                if (rawData.TypeParameters)
                    Object.keys(rawData.TypeParameters).forEach((k) =>
                        fieldKeys.add(`BIM원본.TypeParameters.${k}`)
                    );
                Object.keys(rawData).forEach((k) => {
                    if (
                        k !== 'Parameters' &&
                        k !== 'TypeParameters' &&
                        typeof rawData[k] !== 'object'
                    ) {
                        fieldKeys.add(`BIM원본.${k}`);
                    }
                });
            }
        }
    });

    const sortedKeys = Array.from(fieldKeys).sort();
    const groupBySelects = document.querySelectorAll('.qm-group-by-select');
    let optionsHtml =
        '<option value="">-- 그룹핑 기준 선택 --</option>' +
        sortedKeys
            .map((key) => `<option value="${key}">${key}</option>`)
            .join('');

    groupBySelects.forEach((select) => {
        const selectedValue = select.value;
        select.innerHTML = optionsHtml;
        select.value = selectedValue;
    });
}
/**
 * 선택된 수량산출부재의 속성을 테이블로 렌더링합니다.
 * 편집 모드일 경우, 속성을 직접 수정할 수 있는 UI를 제공합니다.
 * @param {String|null} editingMemberId - 현재 편집 중인 부재의 ID
 */
function renderQmPropertiesTable(editingMemberId = null) {
    const container = document.getElementById('qm-properties-container');
    const actionsContainer = document.getElementById('qm-properties-actions');
    actionsContainer.innerHTML = ''; // 액션 버튼 초기화

    if (selectedQmIds.size !== 1) {
        container.innerHTML =
            '속성을 보려면 위 테이블에서 부재를 하나만 선택하세요.';
        return;
    }

    const selectedId = selectedQmIds.values().next().value;
    const member = loadedQuantityMembers.find(
        (m) => m.id.toString() === selectedId
    );

    if (!member) {
        container.innerHTML = '선택된 부재 정보를 찾을 수 없습니다.';
        return;
    }

    const isEditMode = editingMemberId && editingMemberId === selectedId;
    const properties = member.properties || {};

    let tableHtml = `
        <table class="properties-table">
            <thead>
                <tr>
                    <th>속성 (Property)</th>
                    <th>값 (Value)</th>
                    ${isEditMode ? '<th>작업</th>' : ''}
                </tr>
            </thead>
            <tbody>
    `;

    if (Object.keys(properties).length === 0 && !isEditMode) {
        tableHtml += '<tr><td colspan="2">표시할 속성이 없습니다.</td></tr>';
    } else {
        Object.keys(properties)
            .sort()
            .forEach((key) => {
                if (isEditMode) {
                    // 편집 모드: input 필드로 렌더링
                    tableHtml += `
                    <tr class="property-edit-row">
                        <td><input type="text" class="prop-key-input" value="${key}"></td>
                        <td><input type="text" class="prop-value-input" value="${properties[key]}"></td>
                        <td><button class="delete-prop-btn">삭제</button></td>
                    </tr>
                `;
                } else {
                    // 일반 모드: 텍스트로 렌더링
                    tableHtml += `
                    <tr>
                        <td>${key}</td>
                        <td>${properties[key]}</td>
                    </tr>
                `;
                }
            });
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;

    // 편집 모드일 때만 '속성 추가' 버튼을 표시
    if (isEditMode) {
        actionsContainer.innerHTML =
            '<button id="add-property-btn">속성 추가</button>';
    }
}

/**
 * '산출항목' 데이터를 그룹핑, 필터링, 선택 상태를 반영하여 테이블로 렌더링합니다.
 * @param {Array} items - 렌더링할 전체 산출항목 데이터
 * @param {String|null} editingItemId - 현재 편집 중인 항목의 ID
 */
function renderCostItemsTable(items, editingItemId = null) {
    const container = document.getElementById('ci-table-container');
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }

    // [핵심 수정] 복합적인 필드 이름(예: '부재속성.면적')에 대한 값을 찾는 로직
    const getCiValue = (item, field) => {
        if (!field) return '';

        if (field.startsWith('부재속성.')) {
            const key = field.substring(5);
            return item.quantity_member_properties?.[key] ?? '';
        }
        if (field.startsWith('일람부호.')) {
            const key = field.substring(5);
            return item.member_mark_properties?.[key] ?? '';
        }
        if (field.startsWith('BIM원본.')) {
            // ▼▼▼ 이 숫자를 5에서 6으로 변경합니다. ▼▼▼
            const key = field.substring(6);
            return item.raw_element_properties?.[key] ?? '';
        }

        // 기존 필드 처리
        if (field === 'quantity_mapping_expression') {
            const value = item[field];
            return value &&
                typeof value === 'object' &&
                Object.keys(value).length > 0
                ? JSON.stringify(value)
                : '';
        }
        return item[field] ?? '';
    };

    const filteredItems = items.filter((item) =>
        Object.keys(ciColumnFilters).every((field) => {
            const filterValue = ciColumnFilters[field];
            return (
                !filterValue ||
                getCiValue(item, field)
                    .toString()
                    .toLowerCase()
                    .includes(filterValue)
            );
        })
    );

    currentCiGroupByFields = Array.from(
        document.querySelectorAll('#ci-grouping-controls .ci-group-by-select')
    )
        .map((s) => s.value)
        .filter(Boolean);
    const sortedFields = [
        'cost_code_name',
        'quantity',
        'quantity_mapping_expression',
        'quantity_member_id',
        'description',
    ];

    let tableHtml = '<table><thead><tr>';
    sortedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            ciColumnFilters[field] || ''
        }" placeholder="필터..."></th>`;
    });
    tableHtml += `<th>작업</th></tr></thead><tbody>`;

    function renderGroup(groupItems, level, parentPath) {
        if (level >= currentCiGroupByFields.length || groupItems.length === 0) {
            groupItems.forEach((item) => {
                if (item.id === editingItemId) {
                    tableHtml += `
                        <tr class="ci-edit-row" data-id="${item.id}">
                            <td>${getCiValue(item, 'cost_code_name')}</td>
                            <td><input type="number" step="any" class="ci-quantity-input" value="${
                                item.quantity
                            }"></td>
                            <td><textarea class="ci-mapping-expression-input" rows="2">${JSON.stringify(
                                item.quantity_mapping_expression || {},
                                null,
                                2
                            )}</textarea></td>
                            <td>${getCiValue(item, 'quantity_member_id')}</td>
                            <td><input type="text" class="ci-description-input" value="${
                                item.description || ''
                            }"></td>
                            <td>
                                <button class="save-ci-btn" data-id="${
                                    item.id
                                }">저장</button>
                                <button class="cancel-ci-btn" data-id="${
                                    item.id
                                }">취소</button>
                            </td>
                        </tr>`;
                } else {
                    tableHtml += `
                        <tr data-id="${item.id}" class="${
                        selectedCiIds.has(item.id.toString())
                            ? 'selected-row'
                            : ''
                    }" style="cursor: pointer;">
                            ${sortedFields
                                .map(
                                    (field) =>
                                        `<td>${getCiValue(item, field)}</td>`
                                )
                                .join('')}
                            <td>
                                <button class="edit-ci-btn" data-id="${
                                    item.id
                                }">수정</button>
                                <button class="delete-ci-btn" data-id="${
                                    item.id
                                }">삭제</button>
                            </td>
                        </tr>`;
                }
            });
            return;
        }

        const groupField = currentCiGroupByFields[level];
        const grouped = groupItems.reduce((acc, item) => {
            const key = getCiValue(item, groupField) || '(값 없음)';
            (acc[key] = acc[key] || []).push(item);
            return acc;
        }, {});

        Object.keys(grouped)
            .sort()
            .forEach((key) => {
                const currentPath = `${parentPath}|${groupField}:${key}`;
                const isCollapsed = ciCollapsedGroups[currentPath];
                const indentPixels = level * 20;

                tableHtml += `<tr class="group-header group-level-${level}" data-group-path="${currentPath}">
                            <td colspan="${
                                sortedFields.length + 1
                            }" style="padding-left: ${indentPixels}px;">
                                <span class="toggle-icon">${
                                    isCollapsed ? '▶' : '▼'
                                }</span>
                                ${groupField}: ${key} (${grouped[key].length}개)
                            </td>
                          </tr>`;

                if (!isCollapsed)
                    renderGroup(grouped[key], level + 1, currentPath);
            });
    }

    if (filteredItems.length === 0) {
        tableHtml += `<tr><td colspan="${
            sortedFields.length + 1
        }">표시할 데이터가 없습니다.</td></tr>`;
    } else {
        renderGroup(filteredItems, 0, '');
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}
/**
 * '산출항목' 데이터와 연관된 모든 속성을 분석하여 그룹핑 필드 목록을 동적으로 채웁니다.
 * @param {Array} items - API에서 받은 풍부한 산출항목 데이터 배열
 */
function populateCiFieldSelection(items) {
    if (items.length === 0) return;

    const fieldKeys = new Set([
        // CostItem 자체의 기본 필드
        'cost_code_name',
        'quantity_member_id',
    ]);

    // 데이터 일부만 순회하여 모든 가능한 키를 수집합니다. (성능 최적화)
    const itemsToScan = items.slice(0, 50);
    itemsToScan.forEach((item) => {
        // 수량산출부재 속성 키 추가 (예: '부재속성.면적')
        if (item.quantity_member_properties) {
            Object.keys(item.quantity_member_properties).forEach((key) =>
                fieldKeys.add(`부재속성.${key}`)
            );
        }
        // 일람부호 속성 키 추가 (예: '일람부호.철근')
        if (item.member_mark_properties) {
            Object.keys(item.member_mark_properties).forEach((key) =>
                fieldKeys.add(`일람부호.${key}`)
            );
        }
        // 원본BIM객체 속성 키 추가 (예: 'BIM원본.Name')
        if (item.raw_element_properties) {
            Object.keys(item.raw_element_properties).forEach((key) =>
                fieldKeys.add(`BIM원본.${key}`)
            );
        }
    });

    const sortedKeys = Array.from(fieldKeys).sort();
    const groupBySelects = document.querySelectorAll('.ci-group-by-select');
    let optionsHtml =
        '<option value="">-- 그룹핑 기준 선택 --</option>' +
        sortedKeys
            .map((key) => `<option value="${key}">${key}</option>`)
            .join('');

    groupBySelects.forEach((select) => {
        const selectedValue = select.value; // 기존 선택값 유지
        select.innerHTML = optionsHtml;
        select.value = selectedValue;
    });
}
// ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

// ▼▼▼ [추가] 공사코드 룰셋 테이블 렌더링 함수 ▼▼▼
function renderCostCodeRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        'costcode-ruleset-table-container'
    );
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }

    const costCodeOptions = loadedCostCodes
        .map(
            (opt) =>
                `<option value="${opt.id}">${opt.code} - ${opt.name}</option>`
        )
        .join('');

    let tableHtml = `<table class="ruleset-table"><thead>
        <tr>
            <th style="width: 5%;">우선순위</th>
            <th style="width: 15%;">이름/설명</th>
            <th style="width: 20%;">대상 공사코드</th>
            <th style="width: 30%;">적용 조건 (QuantityMember 속성 기준)</th>
            <th style="width: 20%;">수량 계산식 (JSON)</th>
            <th style="width: 10%;">작업</th>
        </tr>
    </thead><tbody>`;

    const renderRow = (rule) => {
        if (rule.id === editId) {
            return `
                <tr class="rule-edit-row" data-rule-id="${rule.id}">
                    <td><input type="number" class="rule-priority-input" value="${
                        rule.priority || 0
                    }"></td>
                    <td><input type="text" class="rule-name-input" value="${
                        rule.name || ''
                    }" placeholder="규칙 이름"></td>
                    <td><select class="rule-cost-code-select">${costCodeOptions}</select></td>
                    <td><textarea class="rule-conditions-input" placeholder='[{"parameter": "분류", "operator": "contains", "value": "벽"}]'>${JSON.stringify(
                        rule.conditions || [],
                        null,
                        2
                    )}</textarea></td>
                    <td><textarea class="rule-quantity-mapping-input" placeholder='{"수량": "{면적} * 2"}' rows="3">${JSON.stringify(
                        rule.quantity_mapping_script || {},
                        null,
                        2
                    )}</textarea></td>
                    <td>
                        <button class="save-rule-btn">저장</button>
                        <button class="cancel-edit-btn">취소</button>
                    </td>
                </tr>`;
        }
        return `
            <tr data-rule-id="${rule.id}">
                <td>${rule.priority}</td>
                <td><strong>${rule.name}</strong><br><small>${
            rule.description || ''
        }</small></td>
                <td>${rule.target_cost_code_name}</td>
                <td><pre>${JSON.stringify(rule.conditions, null, 2)}</pre></td>
                <td><pre>${JSON.stringify(
                    rule.quantity_mapping_script,
                    null,
                    2
                )}</pre></td>
                <td>
                    <button class="edit-rule-btn">수정</button>
                    <button class="delete-rule-btn">삭제</button>
                </td>
            </tr>`;
    };

    rules.forEach((rule) => {
        tableHtml += renderRow(rule);
    });
    if (editId === 'new') {
        tableHtml += renderRow({ id: 'new' });
    }
    if (rules.length === 0 && editId !== 'new') {
        tableHtml +=
            '<tr><td colspan="6">정의된 규칙이 없습니다. 새 규칙을 추가하세요.</td></tr>';
    }
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;

    if (editId && editId !== 'new') {
        const rule = rules.find((r) => r.id === editId);
        if (rule)
            container.querySelector(
                `tr[data-rule-id="${rule.id}"] .rule-cost-code-select`
            ).value = rule.target_cost_code_id;
    }
}
/**
 * 선택된 CostItem에 연결된 QuantityMember의 정보와
 * 더 나아가 QuantityMember에 연결된 MemberMark 및 RawElement의 속성을 하단에 렌더링합니다.
 */
function renderCiLinkedMemberPropertiesTable() {
    // 1. HTML 요소들의 핸들을 가져옵니다.
    const headerContainer = document.getElementById(
        'ci-linked-member-info-header'
    );
    const memberPropsContainer = document.getElementById(
        'ci-linked-member-properties-container'
    );
    const markPropsContainer = document.getElementById(
        'ci-linked-mark-properties-container'
    );
    const rawElementPropsContainer = document.getElementById(
        'ci-linked-raw-element-properties-container'
    );

    // 모든 컨테이너 초기화
    headerContainer.innerHTML =
        '<p>산출항목을 선택하면 연관된 부재의 정보가 여기에 표시됩니다.</p>';
    memberPropsContainer.innerHTML = '';
    markPropsContainer.innerHTML = '';
    rawElementPropsContainer.innerHTML = '';

    // 2. 항목이 하나만 선택되었는지 확인합니다.
    if (selectedCiIds.size !== 1) {
        return;
    }

    const selectedId = selectedCiIds.values().next().value;
    const costItem = loadedCostItems.find(
        (item) => item.id.toString() === selectedId
    );

    // 3. 선택된 CostItem 객체와 QuantityMember ID가 있는지 확인합니다.
    if (!costItem || !costItem.quantity_member_id) {
        headerContainer.innerHTML =
            '<p>선택된 항목에 연관된 수량산출부재가 없습니다.</p>';
        return;
    }

    // 4. QuantityMember ID를 이용해 전체 부재 목록에서 해당 부재를 찾습니다.
    const member = loadedQuantityMembers.find(
        (m) => m.id.toString() === costItem.quantity_member_id.toString()
    );
    if (!member) {
        headerContainer.innerHTML =
            '<p>연관된 부재 정보를 찾을 수 없습니다.</p>';
        return;
    }

    // 5. 찾은 부재의 이름과 분류를 소제목(header) 영역에 렌더링합니다.
    headerContainer.innerHTML = `
        <h4>${member.name || '이름 없는 부재'}</h4>
        <small>${member.classification_tag_name || '미지정 분류'}</small>
    `;

    // 6. 부재의 속성을 첫 번째 컨테이너에 테이블 형태로 렌더링합니다.
    memberPropsContainer.innerHTML = '<h5>부재 속성</h5>';
    const memberProperties = member.properties || {};
    let memberTableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;
    if (Object.keys(memberProperties).length === 0) {
        memberTableHtml +=
            '<tr><td colspan="2">표시할 속성이 없습니다.</td></tr>';
    } else {
        Object.keys(memberProperties)
            .sort()
            .forEach((key) => {
                memberTableHtml += `<tr><td>${key}</td><td>${memberProperties[key]}</td></tr>`;
            });
    }
    memberTableHtml += '</tbody></table>';
    memberPropsContainer.innerHTML += memberTableHtml;

    // ▼▼▼ [핵심 수정] 7번 로직 전체를 아래와 같이 변경합니다. ▼▼▼
    // 7. 부재에 연결된 일람부호를 찾아 두 번째 컨테이너에 이름과 속성을 렌더링합니다.
    const markId = member.member_mark_id; // member_mark_ids -> member_mark_id 로 변경
    if (markId) {
        const mark = loadedMemberMarks.find((m) => m.id === markId);
        if (mark) {
            markPropsContainer.innerHTML = `<h5>${mark.mark} (일람부호 속성)</h5>`;
            const markProperties = mark.properties || {};
            let markTableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;
            if (Object.keys(markProperties).length === 0) {
                markTableHtml +=
                    '<tr><td colspan="2">표시할 속성이 없습니다.</td></tr>';
            } else {
                Object.keys(markProperties)
                    .sort()
                    .forEach((key) => {
                        markTableHtml += `<tr><td>${key}</td><td>${markProperties[key]}</td></tr>`;
                    });
            }
            markTableHtml += '</tbody></table>';
            markPropsContainer.innerHTML += markTableHtml;
        } else {
            markPropsContainer.innerHTML =
                '<h5>일람부호 속성</h5><p>연결된 일람부호 정보를 찾을 수 없습니다.</p>';
        }
    } else {
        markPropsContainer.innerHTML =
            '<h5>일람부호 속성</h5><p>연계된 일람부호가 없습니다.</p>';
    }
    // ▲▲▲ [핵심 수정] 여기까지 입니다. ▲▲▲

    // 8. 부재에 연결된 RawElement를 찾아 세 번째 컨테이너에 렌더링합니다.
    const rawElementId = member.raw_element_id;
    if (rawElementId) {
        const rawElement = allRevitData.find((el) => el.id === rawElementId);
        if (rawElement && rawElement.raw_data) {
            rawElementPropsContainer.innerHTML = `<h5>BIM 원본 데이터 (${
                rawElement.raw_data.Name || '이름 없음'
            })</h5>`;
            const rawData = rawElement.raw_data;
            let rawTableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;

            const allKeys = new Set(Object.keys(rawData));
            if (rawData.Parameters)
                Object.keys(rawData.Parameters).forEach((k) =>
                    allKeys.add(`Parameters.${k}`)
                );
            if (rawData.TypeParameters)
                Object.keys(rawData.TypeParameters).forEach((k) =>
                    allKeys.add(`TypeParameters.${k}`)
                );

            Array.from(allKeys)
                .sort()
                .forEach((key) => {
                    let value;
                    if (key.startsWith('Parameters.')) {
                        value = rawData.Parameters[key.substring(11)];
                    } else if (key.startsWith('TypeParameters.')) {
                        value = rawData.TypeParameters[key.substring(15)];
                    } else if (
                        key !== 'Parameters' &&
                        key !== 'TypeParameters'
                    ) {
                        value = rawData[key];
                    }

                    if (typeof value !== 'object') {
                        rawTableHtml += `<tr><td>${key}</td><td>${value}</td></tr>`;
                    }
                });

            rawTableHtml += '</tbody></table>';
            rawElementPropsContainer.innerHTML += rawTableHtml;
        } else {
            rawElementPropsContainer.innerHTML =
                '<h5>BIM 원본 데이터</h5><p>연결된 원본 BIM 객체 정보를 찾을 수 없습니다.</p>';
        }
    } else {
        rawElementPropsContainer.innerHTML =
            '<h5>BIM 원본 데이터</h5><p>연계된 원본 BIM 객체가 없습니다. (수동 생성된 부재)</p>';
    }
}

/**
 * 선택된 수량산출부재에 할당된 일람부호의 상세 정보(속성 포함)를 화면 우측에 표시합니다.
 */
function renderQmMemberMarkDetails() {
    const container = document.getElementById(
        'qm-member-mark-details-container'
    );

    if (selectedQmIds.size !== 1) {
        container.innerHTML = '부재를 하나만 선택하세요.';
        return;
    }

    const selectedId = Array.from(selectedQmIds)[0];
    const member = loadedQuantityMembers.find((m) => m.id === selectedId);

    if (!member || !member.member_mark_id) {
        container.innerHTML = '할당된 일람부호가 없습니다.';
        return;
    }

    const mark = loadedMemberMarks.find((m) => m.id === member.member_mark_id);
    if (!mark) {
        container.innerHTML = '<p>일람부호 정보를 찾을 수 없습니다.</p>';
        return;
    }

    let propertiesHtml = `<h5>${mark.mark} (일람부호 속성)</h5>`;
    const markProperties = mark.properties || {};
    let tableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;

    if (Object.keys(markProperties).length === 0) {
        tableHtml += '<tr><td colspan="2">정의된 속성이 없습니다.</td></tr>';
    } else {
        Object.keys(markProperties)
            .sort()
            .forEach((key) => {
                tableHtml += `<tr><td>${key}</td><td>${markProperties[key]}</td></tr>`;
            });
    }
    tableHtml += '</tbody></table>';

    container.innerHTML = propertiesHtml + tableHtml;
}

/**
 * 선택된 QuantityMember에 연결된 RawElement의 속성을 렌더링합니다.
 */
function renderQmLinkedRawElementPropertiesTable() {
    const container = document.getElementById(
        'qm-linked-raw-element-properties-container'
    );

    if (selectedQmIds.size !== 1) {
        container.innerHTML =
            '<p>부재를 하나만 선택하면 원본 데이터가 표시됩니다.</p>';
        return;
    }

    const selectedId = Array.from(selectedQmIds)[0];
    const member = loadedQuantityMembers.find((m) => m.id === selectedId);

    if (!member || !member.raw_element_id) {
        container.innerHTML =
            '<p>연관된 BIM 원본 객체가 없습니다. (수동 생성된 부재)</p>';
        return;
    }

    const rawElement = allRevitData.find(
        (el) => el.id === member.raw_element_id
    );
    if (!rawElement || !rawElement.raw_data) {
        container.innerHTML =
            '<p>연결된 원본 BIM 객체 정보를 찾을 수 없습니다.</p>';
        return;
    }

    const rawData = rawElement.raw_data;
    let headerHtml = `<h5>${rawData.Name || '이름 없음'} (${
        rawData.Category || ''
    })</h5>`;
    let tableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;

    const allKeys = new Set(Object.keys(rawData));
    if (rawData.Parameters)
        Object.keys(rawData.Parameters).forEach((k) =>
            allKeys.add(`Parameters.${k}`)
        );
    if (rawData.TypeParameters)
        Object.keys(rawData.TypeParameters).forEach((k) =>
            allKeys.add(`TypeParameters.${k}`)
        );

    Array.from(allKeys)
        .sort()
        .forEach((key) => {
            let value;
            if (key.startsWith('Parameters.')) {
                value = rawData.Parameters[key.substring(11)];
            } else if (key.startsWith('TypeParameters.')) {
                value = rawData.TypeParameters[key.substring(15)];
            } else if (key !== 'Parameters' && key !== 'TypeParameters') {
                value = rawData[key];
            }

            if (value !== undefined && typeof value !== 'object') {
                tableHtml += `<tr><td>${key}</td><td>${value}</td></tr>`;
            }
        });

    tableHtml += '</tbody></table>';
    container.innerHTML = headerHtml + tableHtml;
}

/**
 * '일람부호 할당 룰셋' 데이터를 HTML 테이블 형태로 화면에 그립니다.
 * @param {Array} rules - 서버에서 받아온 룰셋 데이터 배열
 * @param {String} editId - 현재 편집 중인 규칙의 ID (새 규칙은 'new')
 */
function renderMemberMarkAssignmentRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        'member-mark-assignment-ruleset-table-container'
    );
    let tableHtml = `<table class="ruleset-table"><thead>
        <tr>
            <th style="width: 10%;">우선순위</th>
            <th style="width: 20%;">규칙 이름</th>
            <th style="width: 35%;">적용 조건 (QuantityMember 속성 기준)</th>
            <th style="width: 25%;">Mark 표현식</th>
            <th style="width: 10%;">작업</th>
        </tr>
    </thead><tbody>`;

    const renderRow = (rule) => {
        if (rule.id === editId) {
            return `<tr class="rule-edit-row" data-rule-id="${rule.id}">
                <td><input type="number" class="rule-priority-input" value="${
                    rule.priority || 0
                }"></td>
                <td><input type="text" class="rule-name-input" value="${
                    rule.name || ''
                }" placeholder="규칙 이름"></td>
                <td><textarea class="rule-conditions-input" placeholder='[{"parameter": "분류", "operator": "contains", "value": "기둥"}]'>${JSON.stringify(
                    rule.conditions || [],
                    null,
                    2
                )}</textarea></td>
                <td><input type="text" class="rule-expression-input" value="${
                    rule.mark_expression || ''
                }" placeholder="'C' + {층}"></td>
                <td><button class="save-rule-btn">저장</button> <button class="cancel-edit-btn">취소</button></td>
            </tr>`;
        }
        return `<tr data-rule-id="${rule.id}">
            <td>${rule.priority}</td>
            <td>${rule.name}</td>
            <td><pre>${JSON.stringify(rule.conditions, null, 2)}</pre></td>
            <td><code>${rule.mark_expression}</code></td>
            <td><button class="edit-rule-btn">수정</button> <button class="delete-rule-btn">삭제</button></td>
        </tr>`;
    };

    rules.forEach((rule) => {
        tableHtml += renderRow(rule);
    });
    if (editId === 'new') tableHtml += renderRow({ id: 'new' });
    if (rules.length === 0 && editId !== 'new')
        tableHtml += '<tr><td colspan="5">정의된 규칙이 없습니다.</td></tr>';

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

/**
 * '공사코드 할당 룰셋' 데이터를 HTML 테이블 형태로 화면에 그립니다.
 */
function renderCostCodeAssignmentRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        'cost-code-assignment-ruleset-table-container'
    );
    let tableHtml = `<table class="ruleset-table"><thead>
        <tr>
            <th style="width: 10%;">우선순위</th>
            <th style="width: 20%;">규칙 이름</th>
            <th style="width: 30%;">적용 조건 (QuantityMember 속성 기준)</th>
            <th style="width: 30%;">CostCode 표현식 (JSON)</th>
            <th style="width: 10%;">작업</th>
        </tr>
    </thead><tbody>`;

    const renderRow = (rule) => {
        if (rule.id === editId) {
            return `<tr class="rule-edit-row" data-rule-id="${rule.id}">
                <td><input type="number" class="rule-priority-input" value="${
                    rule.priority || 0
                }"></td>
                <td><input type="text" class="rule-name-input" value="${
                    rule.name || ''
                }" placeholder="규칙 이름"></td>
                <td><textarea class="rule-conditions-input" placeholder='[{"parameter": "분류", "operator": "contains", "value": "벽"}]'>${JSON.stringify(
                    rule.conditions || [],
                    null,
                    2
                )}</textarea></td>
                <td><textarea class="rule-expression-input" rows="4">${JSON.stringify(
                    rule.cost_code_expressions || {},
                    null,
                    2
                )}</textarea></td>
                <td><button class="save-rule-btn">저장</button> <button class="cancel-edit-btn">취소</button></td>
            </tr>`;
        }
        return `<tr data-rule-id="${rule.id}">
            <td>${rule.priority}</td>
            <td>${rule.name}</td>
            <td><pre>${JSON.stringify(rule.conditions, null, 2)}</pre></td>
            <td><pre>${JSON.stringify(
                rule.cost_code_expressions,
                null,
                2
            )}</pre></td>
            <td><button class="edit-rule-btn">수정</button> <button class="delete-rule-btn">삭제</button></td>
        </tr>`;
    };

    rules.forEach((rule) => {
        tableHtml += renderRow(rule);
    });
    if (editId === 'new') tableHtml += renderRow({ id: 'new' });
    if (rules.length === 0 && editId !== 'new')
        tableHtml += '<tr><td colspan="5">정의된 규칙이 없습니다.</td></tr>';

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

// connections/static/connections/ui.js

// ... (기존 함수들 유지) ...

/**
 * [수정됨] 서버 데이터를 기반으로 동적인 BOQ 테이블을 특정 컨테이너에 렌더링합니다.
 * @param {Array} reportData - 중첩된 구조의 집계 데이터 배열
 * @param {Object} summaryData - 전체 합계 데이터
 * @param {Array} unitPriceTypes - 프로젝트의 단가 기준 목록
 * @param {String} targetContainerId - 테이블을 렌더링할 컨테이너 요소의 ID (예: 'boq-table-container' 또는 'sd-table-container')
 */
function renderBoqTable(
    reportData,
    summaryData,
    unitPriceTypes,
    targetContainerId
) {
    const container = document.getElementById(targetContainerId);
    console.log(
        `[DEBUG][Render] renderBoqTable called for container #${targetContainerId}.`
    );
    console.log(`[DEBUG][renderBoqTable] Received reportData:`, reportData);
    console.log(`[DEBUG][renderBoqTable] Received unitPriceTypes:`, unitPriceTypes);

    if (!container) {
        console.error(
            `[ERROR][Render] Target container #${targetContainerId} not found.`
        );
        showToast(
            `테이블을 표시할 영역(${targetContainerId})을 찾을 수 없습니다.`,
            'error'
        );
        return;
    }

    if (!reportData || reportData.length === 0) {
        container.innerHTML =
            '<p style="padding: 20px;">집계할 데이터가 없습니다.</p>';
        console.log('[DEBUG][Render] No report data to render.');
        return;
    }

    // --- 1. 컬럼 정의 (DD/SD 구분) ---
    const isSdTab = targetContainerId === 'sd-table-container'; // SD 탭 여부 확인
    const columnsToUse = isSdTab ? currentSdBoqColumns : currentBoqColumns;
    const aliasesToUse = isSdTab ? sdBoqColumnAliases : boqColumnAliases;

    // ▼▼▼ [수정] SD 탭일 경우 특정 컬럼 제외 ▼▼▼
    const columnsToRender = columnsToUse.filter((col) => {
        if (isSdTab) {
            // SD 탭에서는 '합계금액', '단가기준' 등 제외
            return ![
                'total_cost_total',
                'material_cost_total',
                'labor_cost_total',
                'expense_cost_total',
                'unit_price_type_id',
            ].includes(col.id);
        }
        return true; // DD 탭은 모든 컬럼 포함
    });
    // ▲▲▲ [수정] 여기까지 ▲▲▲

    if (columnsToRender.length === 0) {
        console.warn(
            `[WARN][Render] Column definitions are empty for ${targetContainerId}.`
        );
        container.innerHTML =
            '<p style="padding: 20px; color: orange;">테이블 컬럼 정보가 초기화되지 않았습니다.</p>';
        return;
    }

    // --- 2. 테이블 헤더 생성 ---
    let tableHtml = `<table class="boq-table" data-table-data='${JSON.stringify(
        {
            report: reportData,
            summary: summaryData,
            unitPriceTypes: unitPriceTypes,
        }
    )}'>
        <thead>
            <tr>`;
    columnsToRender.forEach((column) => {
        const displayName = aliasesToUse[column.id] || column.label;
        const thStyle = column.width ? `style="width: ${column.width};"` : '';
        const canEditName =
            !isSdTab &&
            (column.isDynamic ||
                ['name', 'unit_price_type_id'].includes(column.id)); // SD 탭은 편집 불가
        tableHtml += `<th draggable="${!isSdTab}" data-column-id="${
            column.id
        }" ${thStyle}>
                        ${displayName}
                        ${canEditName ? '<i class="col-edit-btn">✏️</i>' : ''}
                      </th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    // --- 3. 단가 기준 드롭다운 옵션 HTML 생성 (DD용) ---
    let unitPriceTypeOptionsHtml = '<option value="">-- 기준 선택 --</option>';
    if (!isSdTab && unitPriceTypes && unitPriceTypes.length > 0) {
        // SD 탭에서는 생성 안 함
        unitPriceTypes.forEach((type) => {
            unitPriceTypeOptionsHtml += `<option value="${type.id}">${type.name}</option>`;
        });
    }
    const variousOptionHtml =
        '<option value="various" disabled>-- 다양함 --</option>';

    // --- 4. 재귀적으로 그룹 행 렌더링 ---
    function renderGroupNode(node) {
        const indent = node.level * 25;
        let rowTds = '';
        let rowHasMissingPrice = node.has_missing_price;

        console.log(`[DEBUG][renderBoqTable] Node level: ${node.level}, Name: ${node.name}, UnitPriceTypeId: ${node.unit_price_type_id}`);
        if (node.level === 0) {
            console.log(`[DEBUG][renderBoqTable] Available UnitPriceTypes:`, unitPriceTypes);
        }

        columnsToRender.forEach((column) => {
            let cellValue = '';
            let cellStyle = column.align ? `text-align: ${column.align};` : '';

            // --- [수정] 단가 기준 열 렌더링 로직 (DD 전용) ---
            if (column.id === 'unit_price_type_id' && !isSdTab) {
                // DD 탭에서만
                let optionsHtmlForSelect = '';
                // Determine the selected value, prioritizing node.unit_price_type_id, then lastSelectedUnitPriceTypeId
                const effectiveUnitPriceTypeId = node.unit_price_type_id === undefined ? lastSelectedUnitPriceTypeId : node.unit_price_type_id;

                if (effectiveUnitPriceTypeId === 'various') {
                    optionsHtmlForSelect += `<option value="various" disabled selected>-- 다양함 --</option>`;
                } else {
                    optionsHtmlForSelect += '<option value="">-- 기준 선택 --</option>'; // Default empty option
                }

                if (!isSdTab && unitPriceTypes && unitPriceTypes.length > 0) {
                    unitPriceTypes.forEach((type) => {
                        const isSelected = type.id === effectiveUnitPriceTypeId;
                        optionsHtmlForSelect += `<option value="${type.id}" ${isSelected ? 'selected' : ''}>${type.name}</option>`;
                    });
                }

                const titleAttr = rowHasMissingPrice
                    ? 'title="주의: 일부 하위 항목의 단가 정보가 누락되어 합계가 부정확할 수 있습니다."'
                    : '';
                const warningClass = rowHasMissingPrice
                    ? 'missing-price-warning'
                    : '';

                cellValue = `<td style="${cellStyle}" class="${warningClass}" ${titleAttr}>
                                 <select class="unit-price-type-select" data-item-ids='${JSON.stringify(
                                     node.item_ids
                                 )}'>
                                     ${optionsHtmlForSelect}
                                 </select>
                              </td>`;
            }
            // --- 다른 컬럼 값 렌더링 (DD/SD 공통 처리) ---
            else {
                let displayValue = '';
                switch (column.id) {
                    case 'name':
                        displayValue = `<span style="padding-left: ${
                            indent + 10
                        }px;">${node.name}</span>`;
                        break;
                    case 'quantity':
                    case 'count':
                        displayValue = node[column.id];
                        break; // 숫자
                    // 비용 관련 컬럼들 (SD에서는 필터링됨)
                    case 'material_cost_unit':
                    case 'material_cost_total':
                    case 'labor_cost_unit':
                    case 'labor_cost_total':
                    case 'expense_cost_unit':
                    case 'expense_cost_total':
                    case 'total_cost_unit':
                    case 'total_cost_total':
                        displayValue = node[column.id] || '0.0000';
                        break;
                    // 동적 표시 필드
                    default:
                        displayValue = node.display_values[column.id] || '';
                        break;
                }
                const warningClass =
                    rowHasMissingPrice && column.id.includes('_cost_')
                        ? 'missing-price-warning-value'
                        : '';
                cellValue = `<td style="${cellStyle}" class="${warningClass}">${displayValue}</td>`;
            }
            rowTds += cellValue;
        });

        tableHtml += `<tr class="boq-group-header group-level-${
            node.level
        }" data-item-ids='${JSON.stringify(
            node.item_ids
        )}' data-current-type-id="${node.unit_price_type_id || ''}">
                        ${rowTds}
                      </tr>`;

        if (node.children && node.children.length > 0) {
            node.children.forEach(renderGroupNode);
        }
    }

    reportData.forEach(renderGroupNode);

    // --- 5. 테이블 푸터 (총계) 생성 ---
    let footerTds = '';
    columnsToRender.forEach((column) => {
        let cellValue = '';
        let cellStyle = column.align ? `text-align: ${column.align};` : '';
        switch (column.id) {
            case 'name':
                cellValue = '총계';
                break;
            case 'quantity':
                cellValue = summaryData.total_quantity;
                break;
            case 'count':
                cellValue = summaryData.total_count;
                break;
            // 비용 관련 (SD 탭에서는 필터링 됨)
            case 'material_cost_total':
                cellValue = summaryData.total_material_cost;
                break;
            case 'labor_cost_total':
                cellValue = summaryData.total_labor_cost;
                break;
            case 'expense_cost_total':
                cellValue = summaryData.total_expense_cost;
                break;
            case 'total_cost_total':
                cellValue = summaryData.total_total_cost;
                break;
            default:
                cellValue = '';
        }
        footerTds += `<td style="${cellStyle}">${cellValue}</td>`;
    });

    tableHtml += `</tbody>
            <tfoot>
                <tr class="boq-summary-row">${footerTds}</tr>
            </tfoot>
        </table>`;

    container.innerHTML = tableHtml;
    console.log(
        `[DEBUG][Render] Table HTML generated for #${targetContainerId}.`
    );

    // --- 6. 드롭다운 초기 값 설정 (DD 탭에서만 실행) ---
    if (!isSdTab) {
        // DD 탭에서만
        container
            .querySelectorAll('.unit-price-type-select')
            .forEach((select) => {
                const row = select.closest('tr');
                const currentTypeId = row.dataset.currentTypeId;
                if (currentTypeId) {
                    select.value = currentTypeId;
                }
            });
        console.log('[DEBUG][Render] Dropdown values set for DD BOQ table.');
    }
}
// ▲▲▲ [교체] 여기까지 입니다 ▲▲▲

// ▼▼▼ [수정] updateBoqDetailsPanel 함수 전체를 아래 코드로 교체해주세요 ▼▼▼
/**
 * [수정됨] 중앙 하단 패널에 포함된 산출항목 목록 테이블 (비용 정보 포함)을 렌더링하고,
 * 첫 항목의 상세 정보 및 BIM 객체 비용 요약을 표시합니다.
 * @param {Array<String>} itemIds - 표시할 CostItem의 ID 배열
 */
function updateBoqDetailsPanel(itemIds) {
    const listContainer = document.getElementById('boq-item-list-container');
    // 디버깅 로그 추가
    console.log(
        `[DEBUG][UI] updateBoqDetailsPanel called with ${itemIds?.length} item IDs. Initial rendering without selection.`
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
    const itemsToRender = loadedCostItems.filter((item) =>
        itemIds.includes(item.id)
    );
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
        { id: 'material_cost_unit', label: '재료비단가', align: 'right' },
        { id: 'labor_cost_unit', label: '노무비단가', align: 'right' },
        { id: 'expense_cost_unit', label: '경비단가', align: 'right' },
        { id: 'total_cost_unit', label: '합계단가', align: 'right' },
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

        // 비용 정보 (loadedCostItems에 이미 문자열로 포함되어 있음)
        const matUnit = item.material_cost_unit || '0.0000';
        const labUnit = item.labor_cost_unit || '0.0000';
        const expUnit = item.expense_cost_unit || '0.0000';
        const totalUnit = item.total_cost_unit || '0.0000';
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

        // ▼▼▼ 수정: selected 클래스를 초기 렌더링 시 제거 ▼▼▼
        tableHtml += `<tr data-item-id="${item.id}">`; // selected 클래스 제거
        // ▲▲▲ 수정 끝 ▲▲▲
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
                case 'material_cost_unit':
                    value = matUnit;
                    break;
                case 'labor_cost_unit':
                    value = labUnit;
                    break;
                case 'expense_cost_unit':
                    value = expUnit;
                    break;
                case 'total_cost_unit':
                    value = totalUnit;
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

    // ▼▼▼ 수정: 첫 번째 항목 자동 선택 및 상세/요약 렌더링 호출 제거 ▼▼▼
    // const firstItemId = itemsToRender[0].id; // 제거
    // renderBoqItemProperties(firstItemId);    // 제거
    // renderBoqBimObjectCostSummary(firstItemId); // 제거

    // ▼▼▼ 추가: 대신 초기 상태로 상세/요약 패널 렌더링 호출 ▼▼▼
    renderBoqItemProperties(null);
    renderBoqBimObjectCostSummary(null);
    // ▲▲▲ 추가 끝 ▲▲▲
}
// ▲▲▲ [수정] 여기까지 입니다 ▲▲▲

/**
 * [수정됨] 선택된 CostItem과 연관된 BIM 객체(RawElement)를 찾고,
 * 해당 BIM 객체에 연결된 모든 CostItem들의 비용을 합산하여 표시합니다.
 * @param {String | null} selectedCostItemId - 현재 중앙 하단 목록에서 선택된 CostItem의 ID
 */
function renderBoqBimObjectCostSummary(selectedCostItemId) {
    const container = document.getElementById('boq-bim-object-cost-summary');
    const header = document.getElementById('boq-bim-object-summary-header');
    // 디버깅 로그 추가
    console.log(
        `[DEBUG][UI] renderBoqBimObjectCostSummary called for CostItem ID: ${selectedCostItemId}`
    );

    // ▼▼▼ 수정: itemId가 null일 경우 초기 메시지 명확화 ▼▼▼
    if (!selectedCostItemId) {
        header.textContent = 'BIM 객체 비용 요약';
        container.innerHTML =
            '<p style="padding: 10px;">하단 목록에서 산출항목을 선택하면 연관된 BIM 객체의 비용 요약이 여기에 표시됩니다.</p>'; // 메시지 수정
        console.log(
            '[DEBUG][UI] Cleared BIM object cost summary panel as no item is selected.'
        ); // 디버깅
        return;
    }
    // ▲▲▲ 수정 끝 ▲▲▲

    // [수정] loadedCostItems 대신 loadedDdCostItems 사용
    const selectedCostItem = loadedDdCostItems.find(
        (item) => item.id === selectedCostItemId
    );
    const member = selectedCostItem?.quantity_member_id
        ? loadedQuantityMembers.find(
              (m) => m.id === selectedCostItem.quantity_member_id
          )
        : null;
    const rawElement = member?.raw_element_id
        ? allRevitData.find((el) => el.id === member.raw_element_id)
        : null;

    if (!rawElement) {
        header.textContent = 'BIM 객체 비용 요약';
        container.innerHTML =
            '<p style="padding: 10px;">선택된 항목과 연관된 BIM 객체가 없습니다.</p>';
        console.log('[DEBUG][UI] No linked BIM object found.'); // 디버깅
        return;
    }

    const rawElementId = rawElement.id;
    const rawElementName =
        rawElement.raw_data?.Name || `(ID: ${rawElement.element_unique_id})`;
    header.textContent = `[${rawElementName}] 비용 요약`;
    console.log(
        `[DEBUG][UI] Found linked BIM object: ${rawElementName} (ID: ${rawElementId})`
    ); // 디버깅

    // 이 BIM 객체(rawElementId)에 연결된 모든 QuantityMember를 찾습니다.
    const linkedMemberIds = loadedQuantityMembers
        .filter((qm) => qm.raw_element_id === rawElementId)
        .map((qm) => qm.id);

    // 이 QuantityMember들에 연결된 모든 CostItem을 찾습니다.
    // [수정] loadedCostItems 대신 loadedDdCostItems 사용
    const relatedCostItems = loadedDdCostItems.filter((ci) =>
        linkedMemberIds.includes(ci.quantity_member_id)
    );
    console.log(
        `[DEBUG][UI] Found ${relatedCostItems.length} related CostItems for this BIM object.`
    ); // 디버깅

    // --- 상세 로깅: 비용 합산 전 데이터 확인 ---
    // console.log('[DEBUG][UI] Data used for BIM object cost summary:', JSON.stringify(relatedCostItems, null, 2)); // 필요 시 주석 해제

    if (relatedCostItems.length === 0) {
        container.innerHTML =
            '<p style="padding: 10px;">이 BIM 객체와 연관된 산출항목이 없습니다.</p>';
        return;
    }

    // 비용 합계 계산 (parseFloat 사용 유지, || '0'으로 NaN 방지)
    let totalMat = 0;
    let totalLab = 0;
    let totalExp = 0;
    let totalTot = 0;
    let tableHtml = `<table class="boq-item-list-table">
        <thead>
            <tr>
                <th>공사코드</th>
                <th>품명</th>
                <th style="text-align: right;">수량</th>
                <th style="text-align: right;">합계금액</th>
                <th style="text-align: right;">재료비</th>
                <th style="text-align: right;">노무비</th>
                <th style="text-align: right;">경비</th>
            </tr>
        </thead>
        <tbody>`;

    relatedCostItems.forEach((item) => {
        // 백엔드에서 문자열로 받은 값을 parseFloat로 변환, 없으면 0으로 처리
        const mat = parseFloat(item.material_cost_total || '0');
        const lab = parseFloat(item.labor_cost_total || '0');
        const exp = parseFloat(item.expense_cost_total || '0');
        const tot = parseFloat(item.total_cost_total || '0');

        totalMat += mat;
        totalLab += lab;
        totalExp += exp;
        totalTot += tot;

        // ▼▼▼ 수정: cost_code 정보 조회 로직 보강 ▼▼▼
        let code = '?';
        let name = item.cost_code_name || '?'; // cost_code_name 필드 활용
        const costCode = loadedCostCodes.find(
            (cc) => cc.id === item.cost_code_id
        );
        if (costCode) {
            code = costCode.code;
            // name = costCode.name; // cost_code_name이 있으므로 덮어쓰지 않아도 됨
        }
        // ▲▲▲ 수정 끝 ▲▲▲

        // quantity도 문자열로 오므로 parseFloat 후 toFixed 사용
        const qty = parseFloat(item.quantity || 0).toFixed(4);

        tableHtml += `
            <tr>
                <td>${escapeHtml(code)}</td>
                <td>${escapeHtml(name)}</td>
                <td style="text-align: right;">${qty}</td>
                <td style="text-align: right;">${tot.toFixed(4)}</td>
                <td style="text-align: right;">${mat.toFixed(4)}</td>
                <td style="text-align: right;">${lab.toFixed(4)}</td>
                <td style="text-align: right;">${exp.toFixed(4)}</td>
            </tr>`;
    });

    tableHtml += `
        </tbody>
        <tfoot>
            <tr class="boq-summary-row">
                <td colspan="3" style="text-align: center; font-weight: bold;">합계</td>
                <td style="text-align: right;">${totalTot.toFixed(4)}</td>
                <td style="text-align: right;">${totalMat.toFixed(4)}</td>
                <td style="text-align: right;">${totalLab.toFixed(4)}</td>
                <td style="text-align: right;">${totalExp.toFixed(4)}</td>
            </tr>
        </tfoot>
        </table>`;

    container.innerHTML = tableHtml;
    console.log('[DEBUG][UI] BIM object cost summary table rendered.'); // 디버깅
}
// ▲▲▲ [신규] 여기까지 입니다 ▲▲▲

// ▼▼▼ [수정] renderBoqItemProperties 함수 수정 ▼▼▼
/**
 * [수정됨] ID에 해당하는 CostItem의 상세 속성을 **왼쪽 상세정보 패널**에 렌더링합니다.
 * @param {String | null} itemId - 상세 정보를 표시할 CostItem의 ID
 */
function renderBoqItemProperties(itemId) {
    currentBoqDetailItemId = itemId; // 현재 선택된 아이템 ID 업데이트
    // 디버깅 로그 추가
    console.log(
        `[DEBUG][UI] renderBoqItemProperties called for Item ID: ${itemId}. Rendering left details panel ONLY.`
    );

    // ▼▼▼ 제거: 하단 테이블 선택 상태 업데이트 로직 제거 ▼▼▼
    // const listContainer = document.getElementById('boq-item-list-container');
    // listContainer.querySelectorAll('tr[data-item-id]').forEach((row) => {
    //     row.classList.toggle('selected', row.dataset.itemId === String(itemId));
    // });
    // ▲▲▲ 제거 끝 ▲▲▲

    // 왼쪽 상세 패널의 컨테이너들
    const memberContainer = document.getElementById(
        'boq-details-member-container'
    );
    const markContainer = document.getElementById('boq-details-mark-container');
    const rawContainer = document.getElementById('boq-details-raw-container');

    // 패널 초기화 (itemId가 null일 경우)
    if (!itemId) {
        const initialMsg = '<p>하단 목록에서 항목을 선택하세요.</p>'; // 초기 메시지 변경
        memberContainer.innerHTML = initialMsg;
        markContainer.innerHTML = initialMsg;
        rawContainer.innerHTML = initialMsg;
        console.log(
            '[DEBUG][UI] Cleared left details panel as no item is selected.'
        ); // 디버깅
        return;
    }

    const costItem = loadedCostItems.find(
        (item) => item.id.toString() === itemId.toString()
    );
    if (!costItem) {
        memberContainer.innerHTML = '<p>항목 정보를 찾을 수 없습니다.</p>';
        markContainer.innerHTML = '';
        rawContainer.innerHTML = '';
        console.warn(`[WARN][UI] CostItem data not found for ID: ${itemId}`); // 디버깅
        return;
    }

    const member = costItem.quantity_member_id
        ? loadedQuantityMembers.find(
              (m) => m.id.toString() === costItem.quantity_member_id.toString()
          )
        : null;

    // 1. 부재 속성 렌더링
    renderPropertyTable(memberContainer, member?.properties, '부재 속성');

    // 2. 일람부호 속성 렌더링
    const mark = member?.member_mark_id
        ? loadedMemberMarks.find(
              (m) => m.id.toString() === member.member_mark_id.toString()
          )
        : null;
    renderPropertyTable(
        markContainer,
        mark?.properties,
        mark ? `${mark.mark} (일람부호 속성)` : '연관된 일람부호 없음'
    );

    // 3. BIM 원본 데이터 렌더링 (단순화된 키-값)
    const rawElement = member?.raw_element_id
        ? allRevitData.find(
              (el) => el.id.toString() === member.raw_element_id.toString()
          )
        : null;
    const rawProperties = {};
    if (rawElement?.raw_data) {
        // costItems_api에서 만든 raw_element_properties 구조를 활용하거나 유사하게 재구성
        const rawData = rawElement.raw_data;
        for (const key in rawData) {
            if (
                !['Parameters', 'TypeParameters'].includes(key) &&
                typeof rawData[key] !== 'object'
            ) {
                rawProperties[key] = rawData[key];
            }
        }
        for (const key in rawData.TypeParameters || {})
            rawProperties[`Type.${key}`] = rawData.TypeParameters[key];
        for (const key in rawData.Parameters || {})
            rawProperties[key] = rawData.Parameters[key];
    }
    renderPropertyTable(
        rawContainer,
        rawProperties,
        rawElement
            ? `${rawElement.raw_data?.Name || '원본 객체'} (BIM 원본)`
            : '연관된 BIM 원본 없음'
    );
    console.log(
        `[DEBUG][UI] Left details panel rendered for Item ID: ${itemId}`
    ); // 디버깅
}

/**
 * 속성 객체를 받아 테이블 HTML을 생성하고 컨테이너에 렌더링하는 헬퍼 함수
 * @param {HTMLElement} container - 테이블을 표시할 DOM 요소
 * @param {Object|null} properties - 표시할 속성 객체
 * @param {String} title - 테이블 제목
 */
function renderPropertyTable(container, properties, title) {
    let headerHtml = `<h5>${title}</h5>`;
    if (!properties || Object.keys(properties).length === 0) {
        container.innerHTML = headerHtml + '<p>표시할 속성이 없습니다.</p>';
        return;
    }

    let tableHtml = `<table class="properties-table"><thead><tr><th>속성</th><th>값</th></tr></thead><tbody>`;
    Object.keys(properties)
        .sort()
        .forEach((key) => {
            tableHtml += `<tr><td>${key}</td><td>${properties[key]}</td></tr>`;
        });
    tableHtml += '</tbody></table>';
    container.innerHTML = headerHtml + tableHtml;
}
// ▲▲▲ [수정] 여기까지 입니다 ▲▲▲

// ... (파일의 나머지 부분은 그대로 유지) ...
/**
 * 서버로부터 받은 집계 데이터를 기반으로 동적인 BOQ 테이블을 렌더링합니다.
 * @param {Array} reportData - 중첩된 구조의 집계 데이터 배열
 * @param {Object} summaryData - 전체 합계 데이터
 */

// ▼▼▼ [추가] 이 함수를 파일 맨 아래에 추가해주세요. ▼▼▼
/**
 * BOQ 탭에서 집계 결과에 함께 표시할 필드를 선택하는 체크박스 UI를 생성합니다.
 * @param {Array} fields - 서버에서 받은 표시 가능한 필드 목록
 */
function renderBoqDisplayFieldControls(fields) {
    const container = document.getElementById('boq-display-fields-container');
    if (!fields || fields.length === 0) {
        container.innerHTML =
            '<small>표시할 필드를 불러올 수 없습니다.</small>';
        return;
    }

    // '수량'과 '항목 수'는 기본 표시 항목이므로 체크박스 목록에서는 제외합니다. -> 이 필터링을 제거합니다.
    const creatableFields = fields; // 모든 필드를 포함하도록 변경

    container.innerHTML = creatableFields
        .map(
            (field) => `
        <label>
            <input type="checkbox" class="boq-display-field-cb" value="${field.value}">
            ${field.label}
        </label>
    `
        )
        .join('');
}


// ▼▼▼ [교체] 기존 renderBimPropertiesTable 함수 전체를 아래 코드로 교체 ▼▼▼
/**
 * [수정됨] 현재 활성화된 탭 컨텍스트('data-management' 또는 'space-management')에 따라
 * 올바른 위치에 선택된 단일 BIM 객체의 속성 테이블을 렌더링합니다.
 * @param {string} contextPrefix - 'data-management' 또는 'space-management'
 */
function renderBimPropertiesTable(contextPrefix) {
    console.log(
        `[DEBUG][Render] Rendering BIM Properties table for context: ${contextPrefix}`
    ); // 디버깅

    // 1. contextPrefix에 따라 올바른 컨테이너 ID와 상태 객체를 선택합니다.
    const containerId =
        contextPrefix === 'space-management'
            ? 'sm-selected-bim-properties-container' // 공간 관리 탭의 컨테이너 ID
            : 'selected-bim-properties-container'; // 데이터 관리 탭의 컨테이너 ID
    const container = document.getElementById(containerId);
    const state = viewerStates[contextPrefix];

    if (!container) {
        console.warn(
            `[WARN][Render] BIM Properties container not found for ID: ${containerId}`
        ); // 디버깅
        return;
    }
    if (!state) {
        console.warn(
            `[WARN][Render] Viewer state not found for context: ${contextPrefix}`
        ); // 디버깅
        container.innerHTML = '<p>뷰 상태 정보를 찾을 수 없습니다.</p>';
        return;
    }

    // 2. 단일 항목 선택 여부 확인
    if (state.selectedElementIds.size !== 1) {
        container.innerHTML =
            '<p>BIM 속성을 보려면 테이블에서 하나의 항목만 선택하세요.</p>';
        // console.log(`[DEBUG][Render] BIM Properties: ${state.selectedElementIds.size} items selected. Clearing table.`); // 디버깅 (선택 변경 시 매번 출력될 수 있음)
        return;
    }

    // 3. 선택된 항목 데이터 조회
    const selectedId = state.selectedElementIds.values().next().value;
    const selectedItem = allRevitData.find((item) => item.id === selectedId);
    console.log(
        `[DEBUG][Render] BIM Properties: Rendering for element ID: ${selectedId}`
    ); // 디버깅

    if (!selectedItem || !selectedItem.raw_data) {
        container.innerHTML =
            '<p>선택된 항목의 BIM 원본 데이터를 찾을 수 없습니다.</p>';
        console.warn(
            `[WARN][Render] Raw data not found for selected element ID: ${selectedId}`
        ); // 디버깅
        return;
    }

    // 4. 속성 데이터 추출 및 정렬
    const properties = [];
    const rawData = selectedItem.raw_data;
    // 최상위 속성
    for (const key in rawData) {
        if (typeof rawData[key] !== 'object' && rawData[key] !== null) {
            // 객체/배열/null 제외
            properties.push({ key: key, value: rawData[key], source: 'Root' });
        }
    }
    // Parameters 속성
    if (typeof rawData.Parameters === 'object' && rawData.Parameters !== null) {
        for (const paramKey in rawData.Parameters) {
            properties.push({
                key: paramKey,
                value: rawData.Parameters[paramKey],
                source: 'Parameters',
            });
        }
    }
    // TypeParameters 속성
    if (
        typeof rawData.TypeParameters === 'object' &&
        rawData.TypeParameters !== null
    ) {
        for (const paramKey in rawData.TypeParameters) {
            properties.push({
                key: `Type.${paramKey}`,
                value: rawData.TypeParameters[paramKey],
                source: 'TypeParameters',
            }); // 'Type.' 접두사 추가
        }
    }
    // 속성 키 기준으로 정렬
    properties.sort((a, b) => a.key.localeCompare(b.key));
    console.log(
        `[DEBUG][Render] BIM Properties: Extracted ${properties.length} properties.`
    ); // 디버깅

    // 5. HTML 테이블 생성
    let tableHtml = `<table class="properties-table"><thead><tr><th style="width: 40%;">속성 (Property)</th><th>값 (Value)</th></tr></thead><tbody>`;
    if (properties.length === 0) {
        tableHtml += '<tr><td colspan="2">표시할 속성이 없습니다.</td></tr>';
    } else {
        properties.forEach((prop) => {
            // 값이 너무 길면 잘라서 표시 (선택 사항)
            const displayValue =
                String(prop.value).length > 100
                    ? String(prop.value).substring(0, 97) + '...'
                    : prop.value;
            tableHtml += `<tr title="${prop.key}: ${prop.value} (Source: ${prop.source})"><td>${prop.key}</td><td>${displayValue}</td></tr>`; // title 속성에 전체 값 표시
        });
    }
    tableHtml += '</tbody></table>';

    // 6. 컨테이너에 렌더링
    container.innerHTML = tableHtml;
    console.log(
        `[DEBUG][Render] BIM Properties table rendered successfully in #${containerId}.`
    ); // 디버깅
}
// ▲▲▲ [교체] 여기까지 ▲▲▲

function renderAssignedTagsTable(contextPrefix) {
    const listContainer = document.getElementById('selected-tags-list');
    const state = viewerStates[contextPrefix];

    if (!listContainer || !state) return;

    if (state.selectedElementIds.size === 0) {
        listContainer.innerHTML = '항목을 선택하세요.';
        return;
    }

    const selectedItems = allRevitData.filter((item) =>
        state.selectedElementIds.has(item.id)
    );
    const assignedTags = new Set();
    selectedItems.forEach((item) => {
        if (item.classification_tags)
            item.classification_tags.forEach((tag) => assignedTags.add(tag));
    });

    if (assignedTags.size === 0) {
        listContainer.innerHTML = '할당된 분류가 없습니다.';
        return;
    }

    listContainer.innerHTML = Array.from(assignedTags)
        .sort()
        .map((tag) => `<div>${tag}</div>`)
        .join('');
}
/**
 * [수정] '선택항목 분류' 탭의 내용을 렌더링하는 범용 함수
 * @param {string} contextPrefix
 */
function renderAssignedTagsTable(contextPrefix) {
    const listContainer = document.getElementById('selected-tags-list');
    const state = viewerStates[contextPrefix];

    if (!listContainer || !state) return;

    if (state.selectedElementIds.size === 0) {
        listContainer.innerHTML = '항목을 선택하세요.';
        return;
    }

    const selectedItems = allRevitData.filter((item) =>
        state.selectedElementIds.has(item.id)
    );
    const assignedTags = new Set();
    selectedItems.forEach((item) => {
        if (item.classification_tags)
            item.classification_tags.forEach((tag) => assignedTags.add(tag));
    });

    if (assignedTags.size === 0) {
        listContainer.innerHTML = '할당된 분류가 없습니다.';
        return;
    }

    listContainer.innerHTML = Array.from(assignedTags)
        .sort()
        .map((tag) => `<div>${tag}</div>`)
        .join('');
}
/**
 * 서버에서 받은 공간분류 데이터를 위계적인 HTML 트리로 렌더링합니다.
 * @param {Array} spaces - 프로젝트의 모든 공간분류 데이터 배열
 */
function renderSpaceClassificationTree(spaces) {
    const container = document.getElementById('space-tree-container');
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }
    if (spaces.length === 0) {
        container.innerHTML =
            "<p>정의된 공간분류가 없습니다. '최상위 공간 추가' 버튼으로 시작하세요.</p>";
        return;
    }

    const spaceMap = {};
    const roots = [];
    spaces.forEach((space) => {
        spaceMap[space.id] = { ...space, children: [] };
    });

    Object.values(spaceMap).forEach((space) => {
        if (space.parent_id && spaceMap[space.parent_id]) {
            spaceMap[space.parent_id].children.push(space);
        } else {
            roots.push(space);
        }
    });

    function buildTreeHtml(nodes) {
        if (nodes.length === 0) return '';
        let html = '<ul>';
        nodes.forEach((node) => {
            const count = node.mapped_elements_count || 0;
            // ▼▼▼ [핵심 수정] span 태그에 view-assigned-btn 클래스를 추가합니다. ▼▼▼
            const countBadge =
                count > 0
                    ? `<span class="element-count-badge view-assigned-btn" title="할당된 객체 보기">${count}</span>`
                    : '';

            html += `
                <li data-id="${node.id}" data-name="${node.name}">
                    <div class="space-tree-item">
                        <span class="item-name">
                            <strong>${node.name}</strong>
                            ${countBadge}
                        </span>
                        <div class="item-actions">
                            <button class="assign-elements-btn" title="BIM 객체 할당">객체 할당</button>
                            <button class="add-child-space-btn" title="하위 공간 추가">+</button>
                            <button class="rename-space-btn" title="이름 수정">수정</button>
                            <button class="delete-space-btn" title="삭제">삭제</button>
                        </div>
                    </div>
                    ${buildTreeHtml(node.children)}
                </li>
            `;
        });
        html += '</ul>';
        return html;
    }

    container.innerHTML = buildTreeHtml(roots);
}
/**
 * 할당된 객체 목록을 모든 속성을 포함하는 2열(속성-값) 테이블로 모달창에 렌더링합니다.
 * @param {Array} elements - 할당된 객체 데이터 배열
 * @param {string} spaceName - 현재 공간의 이름
 */
function renderAssignedElementsModal(elements, spaceName) {
    const title = document.getElementById('assigned-elements-modal-title');
    const container = document.getElementById(
        'assigned-elements-table-container'
    );

    title.textContent = `'${spaceName}'에 할당된 BIM 객체 (${elements.length}개)`;

    if (elements.length === 0) {
        container.innerHTML =
            '<p style="padding: 20px;">할당된 객체가 없습니다.</p>';
        return;
    }

    // 2열 테이블 구조를 생성합니다.
    let tableHtml = `<table class="properties-table">
        <thead>
            <tr>
                <th style="width: 5%;"><input type="checkbox" id="unassign-select-all" title="전체 선택/해제"></th>
                <th style="width: 40%;">속성 (Property)</th>
                <th>값 (Value)</th>
            </tr>
        </thead>
        <tbody>`;

    // 각 객체별로 속성을 나열합니다.
    elements.forEach((item) => {
        const elementName =
            getValueForItem(item, 'Name') || `객체 (ID: ${item.id})`;

        // 각 객체를 구분하기 위한 헤더 행을 추가합니다.
        tableHtml += `
            <tr class="group-header" data-element-id="${item.id}">
                <td style="text-align: center;"><input type="checkbox" class="unassign-checkbox" value="${item.id}"></td>
                <td colspan="2"><strong>${elementName}</strong></td>
            </tr>
        `;

        // 해당 객체의 모든 속성을 수집합니다.
        const properties = [];
        const systemKeys = ['id', 'element_unique_id', 'classification_tags'];
        const revitKeysSet = new Set();
        const raw = item.raw_data;

        if (raw) {
            if (raw.Parameters)
                Object.keys(raw.Parameters).forEach((k) => revitKeysSet.add(k));
            if (raw.TypeParameters)
                Object.keys(raw.TypeParameters).forEach((k) =>
                    revitKeysSet.add(`TypeParameters.${k}`)
                );
            Object.keys(raw).forEach((k) => {
                if (k !== 'Parameters' && k !== 'TypeParameters')
                    revitKeysSet.add(k);
            });
        }

        const allKeys = [...systemKeys, ...Array.from(revitKeysSet).sort()];

        // 속성 이름과 값을 테이블 행으로 추가합니다.
        allKeys.forEach((key) => {
            const value = getValueForItem(item, key);
            // 값이 있는 속성만 표시합니다.
            if (value !== '' && value !== null && value !== undefined) {
                tableHtml += `
                    <tr>
                        <td></td> 
                        <td>${key}</td>
                        <td>${value}</td>
                    </tr>
                `;
            }
        });
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

/**
 * '공간분류 생성 룰셋' 데이터를 HTML 테이블 형태로 화면에 그립니다.
 * @param {Array} rules - 서버에서 받아온 룰셋 데이터 배열
 * @param {String} editId - 현재 편집 중인 규칙의 ID (새 규칙은 'new')
 */
function renderSpaceClassificationRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        'space-classification-ruleset-table-container'
    );

    let tableHtml = `<table class="ruleset-table">
        <thead>
            <tr>
                <th style="width: 5%;">레벨</th>
                <th style="width: 15%;">위계 이름</th>
                <th style="width: 25%;">BIM 객체 필터 (JSON)</th>
                <th style="width: 15%;">이름 속성</th>
                <th style="width: 15%;">상위 연결 속성</th>
                <th style="width: 15%;">하위 연결 속성</th>
                <th style="width: 10%;">작업</th>
            </tr>
        </thead>
        <tbody>`;

    const renderRow = (rule) => {
        if (rule.id === editId) {
            return `<tr class="rule-edit-row" data-rule-id="${rule.id}">
                <td><input type="number" class="rule-level-depth-input" value="${
                    rule.level_depth || 0
                }"></td>
                <td><input type="text" class="rule-level-name-input" value="${
                    rule.level_name || ''
                }" placeholder="예: Building"></td>
                <td><textarea class="rule-bim-filter-input" placeholder='{"parameter": "IfcEntityType", "value": "IfcBuilding"}' rows="3">${JSON.stringify(
                    rule.bim_object_filter || {},
                    null,
                    2
                )}</textarea></td>
                <td><input type="text" class="rule-name-source-input" value="${
                    rule.name_source_param || ''
                }" placeholder="예: Name"></td>
                <td><input type="text" class="rule-parent-join-input" value="${
                    rule.parent_join_param || ''
                }" placeholder="예: GlobalId"></td>
                <td><input type="text" class="rule-child-join-input" value="${
                    rule.child_join_param || ''
                }" placeholder="예: SiteGlobalId"></td>
                <td><button class="save-rule-btn">저장</button> <button class="cancel-edit-btn">취소</button></td>
            </tr>`;
        }
        return `<tr data-rule-id="${rule.id}">
            <td>${rule.level_depth}</td>
            <td>${rule.level_name}</td>
            <td><pre>${JSON.stringify(
                rule.bim_object_filter,
                null,
                2
            )}</pre></td>
            <td>${rule.name_source_param}</td>
            <td>${rule.parent_join_param}</td>
            <td>${rule.child_join_param}</td>
            <td><button class="edit-rule-btn">수정</button> <button class="delete-rule-btn">삭제</button></td>
        </tr>`;
    };

    rules.sort((a, b) => a.level_depth - b.level_depth); // 레벨 순으로 정렬

    rules.forEach((rule) => {
        tableHtml += renderRow(rule);
    });

    if (editId === 'new') {
        const newLevel =
            rules.length > 0
                ? Math.max(...rules.map((r) => r.level_depth)) + 1
                : 0;
        tableHtml += renderRow({ id: 'new', level_depth: newLevel });
    }

    if (rules.length === 0 && editId !== 'new') {
        tableHtml += '<tr><td colspan="7">정의된 규칙이 없습니다.</td></tr>';
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

// ▼▼▼ [추가] 공간분류 할당 룰셋 테이블 렌더링 함수 ▼▼▼
function renderSpaceAssignmentRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        'space-assignment-ruleset-table-container'
    );
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }

    let tableHtml = `<table class="ruleset-table"><thead>
        <tr>
            <th style="width: 5%;">우선순위</th>
            <th style="width: 15%;">규칙 이름</th>
            <th style="width: 30%;">부재 필터 조건 (JSON)</th>
            <th style="width: 20%;">부재 연결 속성</th>
            <th style="width: 20%;">공간 연결 속성</th>
            <th style="width: 10%;">작업</th>
        </tr>
    </thead><tbody>`;

    const renderRow = (rule) => {
        if (rule.id === editId) {
            return `<tr class="rule-edit-row" data-rule-id="${rule.id}">
                <td><input type="number" class="rule-priority-input" value="${
                    rule.priority || 0
                }"></td>
                <td><input type="text" class="rule-name-input" value="${
                    rule.name || ''
                }" placeholder="규칙 이름"></td>
                <td><textarea class="rule-member-filter-input" placeholder="(선택사항) 부재 필터링 조건 입력">${JSON.stringify(
                    rule.member_filter_conditions || [],
                    null,
                    2
                )}</textarea></td>
                <td><input type="text" class="rule-member-join-input" value="${
                    rule.member_join_property || ''
                }" placeholder="예: BIM원본.참조 레벨"></td>
                <td><input type="text" class="rule-space-join-input" value="${
                    rule.space_join_property || ''
                }" placeholder="예: Name 또는 BIM원본.Name"></td>
                <td><button class="save-rule-btn">저장</button> <button class="cancel-edit-btn">취소</button></td>
            </tr>`;
        }
        return `<tr data-rule-id="${rule.id}">
            <td>${rule.priority}</td>
            <td>${rule.name}</td>
            <td><pre>${JSON.stringify(
                rule.member_filter_conditions,
                null,
                2
            )}</pre></td>
            <td><code>${rule.member_join_property}</code></td>
            <td><code>${rule.space_join_property}</code></td>
            <td><button class="edit-rule-btn">수정</button> <button class="delete-rule-btn">삭제</button></td>
        </tr>`;
    };

    rules.forEach((rule) => {
        tableHtml += renderRow(rule);
    });
    if (editId === 'new') tableHtml += renderRow({ id: 'new' });
    if (rules.length === 0 && editId !== 'new')
        tableHtml += '<tr><td colspan="6">정의된 규칙이 없습니다.</td></tr>';

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

function renderCostCodeListForUnitPrice(costCodes) {
    console.log('[DEBUG][Render] renderCostCodeListForUnitPrice - Start');
    const container = document.getElementById('unit-price-cost-code-list');
    const searchInput = document.getElementById('unit-price-cost-code-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    if (!container) {
        console.error(
            '[ERROR][Render] Cost code list container #unit-price-cost-code-list not found.'
        );
        return;
    }

    let filteredCodes = costCodes || []; // Ensure costCodes is an array

    if (searchTerm) {
        filteredCodes = filteredCodes.filter(
            (code) =>
                (code.code && code.code.toLowerCase().includes(searchTerm)) ||
                (code.name && code.name.toLowerCase().includes(searchTerm))
        );
        console.log(
            `[DEBUG][Render] Applied search term '${searchTerm}', found ${filteredCodes.length} codes.`
        );
    }

    if (filteredCodes.length === 0) {
        container.innerHTML = `<p style="padding: 10px;">${
            searchTerm ? '검색 결과가 없습니다.' : '표시할 공사코드가 없습니다.'
        }</p>`;
        console.log('[DEBUG][Render] No cost codes to display.');
        return;
    }

    let listHtml = '';
    filteredCodes.forEach((code) => {
        const isSelected = code.id === selectedCostCodeIdForUnitPrice;
        listHtml += `
            <div class="cost-code-item ${
                isSelected ? 'selected' : ''
            }" data-id="${code.id}">
                <span class="item-code" title="${code.code}">${code.code}</span>
                <span class="item-category" title="${code.category || ''}">${
            code.category || '-'
        }</span>
                <span class="item-name" title="${code.name}">${code.name}</span>
                <span class="item-spec" title="${code.spec || ''}">${
            code.spec || '-'
        }</span>
                <span class="item-unit">${code.unit || '-'}</span>
            </div>
        `;
    });

    container.innerHTML = listHtml;
    console.log(
        `[DEBUG][Render] renderCostCodeListForUnitPrice - Rendered ${filteredCodes.length} items.`
    );
}

function renderUnitPriceTypesTable(types, editId = null) {
    console.log(
        `[DEBUG][Render] renderUnitPriceTypesTable - Start (editId: ${editId})`
    );
    const container = document.getElementById(
        'unit-price-type-table-container'
    );
    if (!container) {
        console.error(
            '[ERROR][Render] Unit price type table container #unit-price-type-table-container not found.'
        );
        return;
    }

    let tableHtml = `
        <table>
            <thead>
                <tr>
                    <th style="width: 35%;">구분 이름</th>
                    <th style="width: 45%;">설명</th>
                    <th style="width: 20%;">작업</th>
                </tr>
            </thead>
            <tbody>
    `;

    const renderRow = (type) => {
        const isEditMode = type.id === editId;
        console.log(
            `[DEBUG][Render] Rendering row for type ID: ${type.id}, Edit mode: ${isEditMode}`
        );
        if (isEditMode) {
            return `
                <tr class="editable-row" data-id="${type.id}">
                    <td><input type="text" class="type-name-input" value="${
                        type.name || ''
                    }" placeholder="예: 표준단가"></td>
                    <td><input type="text" class="type-description-input" value="${
                        type.description || ''
                    }" placeholder="선택 사항"></td>
                    <td>
                        <button class="save-type-btn" title="저장">💾</button>
                        <button class="cancel-type-btn" title="취소">❌</button>
                    </td>
                </tr>`;
        } else {
            return `
                <tr data-id="${type.id}">
                    <td>${type.name}</td>
                    <td>${type.description || ''}</td>
                    <td>
                        <button class="edit-type-btn" title="수정">✏️</button>
                        <button class="delete-type-btn" title="삭제">🗑️</button>
                    </td>
                </tr>`;
        }
    };

    let hasRows = false;
    if (editId === 'new') {
        tableHtml += renderRow({ id: 'new' });
        hasRows = true;
    }

    (types || []).forEach((type) => {
        // Ensure types is an array
        // Avoid rendering the item being edited in view mode if editId is set
        if (editId !== type.id) {
            tableHtml += renderRow(type);
            hasRows = true;
        } else if (editId && editId !== 'new') {
            // Render the item being edited in edit mode
            tableHtml += renderRow(types.find((t) => t.id === editId));
            hasRows = true;
        }
    });

    if (!hasRows) {
        tableHtml +=
            '<tr><td colspan="3" style="text-align: center; padding: 15px;">정의된 단가 구분이 없습니다. "새 구분 추가" 버튼으로 시작하세요.</td></tr>';
        console.log('[DEBUG][Render] No unit price types to display.');
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    console.log('[DEBUG][Render] renderUnitPriceTypesTable - End');
}
function renderUnitPricesTable(prices, editId = null) {
    console.log(
        `[DEBUG][Render] renderUnitPricesTable - Start (editId: ${editId})`
    );
    const container = document.getElementById('unit-price-table-container');
    if (!container) {
        console.error(
            '[ERROR][Render] Unit price table container #unit-price-table-container not found.'
        );
        return;
    }

    // 단가 구분 드롭다운 옵션 준비
    let typeOptionsHtml = '<option value="">-- 구분 선택 --</option>';
    (loadedUnitPriceTypes || []).forEach((type) => {
        // Ensure loadedUnitPriceTypes is an array
        typeOptionsHtml += `<option value="${type.id}">${type.name}</option>`;
    });

    let tableHtml = `
        <table>
            <thead>
                <tr>
                    <th style="width: 20%;">구분</th>
                    <th style="width: 15%;">재료비</th>
                    <th style="width: 15%;">노무비</th>
                    <th style="width: 15%;">경비</th>
                    <th style="width: 15%;">합계</th>
                    <th style="width: 20%;">작업</th>
                </tr>
            </thead>
            <tbody>
    `;

    const renderRow = (price) => {
        const isEditMode = price.id === editId;
        // Decimal 문자열을 숫자로 변환 (실패 시 0)
        const mat = parseFloat(price.material_cost || '0');
        const lab = parseFloat(price.labor_cost || '0');
        const exp = parseFloat(price.expense_cost || '0');
        const tot = parseFloat(price.total_cost || '0'); // DB에 저장된 total 값
        const calculatedTotal = mat + lab + exp; // M+L+E 계산 값

        // 표시할 합계 결정: M/L/E 합이 0보다 크면 계산값, 아니면 DB의 total 값 사용
        const displayTotal =
            mat > 0 || lab > 0 || exp > 0 ? calculatedTotal : tot;

        console.log(
            `[DEBUG][Render] Rendering row for price ID: ${price.id}, Edit mode: ${isEditMode}`
        );
        console.log(
            `  Values: M=${mat}, L=${lab}, E=${exp}, T_DB=${tot}, T_Calc=${calculatedTotal}, T_Display=${displayTotal}`
        );

        if (isEditMode) {
            // 현재 가격의 type ID를 selected로 설정
            const currentTypeOptions = (loadedUnitPriceTypes || [])
                .map(
                    (type) =>
                        `<option value="${type.id}" ${
                            type.id == price.unit_price_type_id
                                ? 'selected'
                                : ''
                        }>${type.name}</option>`
                )
                .join('');

            return `
                <tr class="editable-row" data-id="${price.id}">
                    <td><select class="price-type-select"><option value="">-- 구분 선택 --</option>${currentTypeOptions}</select></td>
                    <td><input type="number" step="any" class="price-material-input" value="${mat.toFixed(
                        4
                    )}"></td>
                    <td><input type="number" step="any" class="price-labor-input" value="${lab.toFixed(
                        4
                    )}"></td>
                    <td><input type="number" step="any" class="price-expense-input" value="${exp.toFixed(
                        4
                    )}"></td>
                    <td><input type="number" step="any" class="price-total-input" value="${displayTotal.toFixed(
                        4
                    )}"></td>
                    <td>
                        <button class="save-price-btn" title="저장">💾</button>
                        <button class="cancel-price-btn" title="취소">❌</button>
                    </td>
                </tr>`;
        } else {
            // 보기 모드 행
            return `
                <tr data-id="${price.id}">
                    <td>${price.unit_price_type_name || '?'}</td>
                    <td>${mat.toFixed(4)}</td>
                    <td>${lab.toFixed(4)}</td>
                    <td>${exp.toFixed(4)}</td>
                    <td>${displayTotal.toFixed(4)}</td> 
                    <td>
                        <button class="edit-price-btn" title="수정">✏️</button>
                        <button class="delete-price-btn" title="삭제">🗑️</button>
                    </td>
                </tr>`;
        }
    };

    let hasRows = false;
    if (editId === 'new') {
        tableHtml += renderRow({
            id: 'new',
            material_cost: '0.0',
            labor_cost: '0.0',
            expense_cost: '0.0',
            total_cost: '0.0',
        });
        hasRows = true;
    }

    (prices || []).forEach((price) => {
        // Ensure prices is an array
        if (editId !== price.id) {
            tableHtml += renderRow(price);
            hasRows = true;
        } else if (editId && editId !== 'new') {
            tableHtml += renderRow(prices.find((p) => p.id === editId));
            hasRows = true;
        }
    });

    if (!hasRows) {
        tableHtml += `<tr><td colspan="6" style="text-align: center; padding: 15px;">이 공사코드에 등록된 단가가 없습니다. "새 단가 추가" 버튼으로 시작하세요.</td></tr>`;
        console.log(
            '[DEBUG][Render] No unit prices to display for this cost code.'
        );
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    console.log('[DEBUG][Render] renderUnitPricesTable - End');
}
/**
 * 상세견적(DD) 탭의 UI 요소들(패널 토글 버튼, 상세 정보 탭)에 이벤트 리스너를 설정합니다.
 */
function initializeBoqUI() {
    // 상세견적(DD) 탭의 메인 컨테이너 찾기
    const ddTabContainer = document.getElementById('detailed-estimation-dd');
    if (!ddTabContainer) {
        console.warn(
            "[WARN] Detailed Estimation (DD) tab container '#detailed-estimation-dd' not found. UI initialization skipped."
        );
        return; // 탭 컨테이너가 없으면 함수 종료
    }
    console.log(
        '[DEBUG] Initializing UI elements for Detailed Estimation (DD) tab...'
    );

    // UI 요소들 선택 (탭 컨테이너 내부에서 찾음)
    const leftToggleBtn = ddTabContainer.querySelector(
        '#boq-left-panel-toggle-btn'
    );
    const bottomToggleBtn = ddTabContainer.querySelector(
        '#boq-bottom-panel-toggle-btn'
    );
    const boqContainer = ddTabContainer.querySelector('.boq-container'); // 내부 클래스는 그대로 사용
    const bottomPanel = ddTabContainer.querySelector('.boq-details-wrapper'); // 내부 클래스는 그대로 사용
    const boqDetailsPanel = ddTabContainer.querySelector(
        '#boq-item-details-panel'
    ); // 왼쪽 상세 정보 패널 (탭 포함)

    // --- 1. 왼쪽 패널 접기/펴기 기능 ---
    if (leftToggleBtn && boqContainer) {
        // 이벤트 리스너 중복 방지
        if (!leftToggleBtn.dataset.listenerAttached) {
            leftToggleBtn.addEventListener('click', () => {
                boqContainer.classList.toggle('left-panel-collapsed');
                // 버튼 아이콘 변경
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
            leftToggleBtn.dataset.listenerAttached = 'true'; // 리스너 추가됨 표시
            console.log('[DEBUG] Left panel toggle listener attached.');
        }
    } else {
        console.warn('[WARN] Left toggle button or BOQ container not found.');
    }

    // --- 2. 하단 패널 접기/펴기 기능 ---
    if (bottomToggleBtn && bottomPanel) {
        // 이벤트 리스너 중복 방지
        if (!bottomToggleBtn.dataset.listenerAttached) {
            bottomToggleBtn.addEventListener('click', () => {
                const isCollapsing =
                    !bottomPanel.classList.contains('collapsed');
                bottomPanel.classList.toggle('collapsed');
                // 버튼 아이콘 변경
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

    // --- 3. 왼쪽 상세 정보 패널 탭 클릭 기능 ---
    if (boqDetailsPanel) {
        const tabsContainer = boqDetailsPanel.querySelector(
            '.details-panel-tabs'
        );
        if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
            tabsContainer.addEventListener('click', (e) => {
                const clickedButton = e.target.closest('.detail-tab-button');
                // 클릭된 요소가 탭 버튼이고, 이미 활성화된 상태가 아니며, 탭 버튼 컨테이너(.details-panel-tabs) 안에 있는지 확인
                if (
                    !clickedButton ||
                    clickedButton.classList.contains('active')
                ) {
                    return;
                }

                const targetTab = clickedButton.dataset.tab; // 클릭된 탭의 data-tab 값 (예: "boq-member-prop")
                console.log(`[DEBUG] Detail tab clicked: ${targetTab}`);

                // 모든 탭 버튼과 컨텐츠에서 'active' 클래스 제거 (현재 패널 내에서만)
                boqDetailsPanel
                    .querySelectorAll('.detail-tab-button.active')
                    .forEach((btn) => btn.classList.remove('active'));
                boqDetailsPanel
                    .querySelectorAll('.detail-tab-content.active')
                    .forEach((content) => content.classList.remove('active'));

                // 클릭된 버튼과 그에 맞는 컨텐츠에 'active' 클래스 추가
                clickedButton.classList.add('active');
                const targetContent = boqDetailsPanel.querySelector(
                    `.detail-tab-content[data-tab="${targetTab}"]`
                );
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log(
                        `[DEBUG] Detail tab content activated: ${targetTab}`
                    );
                } else {
                    console.warn(
                        `[WARN] Detail tab content for '${targetTab}' not found.`
                    );
                }
            });
            tabsContainer.dataset.listenerAttached = 'true'; // 탭 컨테이너에 리스너 추가됨 표시
            console.log('[DEBUG] Detail panel tab click listener attached.');
        } else if (!tabsContainer) {
            console.warn(
                '[WARN] Detail panel tabs container not found within #boq-item-details-panel.'
            );
        }
    } else {
        console.warn(
            "[WARN] Left detail panel '#boq-item-details-panel' not found."
        );
    }

    console.log('[DEBUG] Detailed Estimation (DD) UI initialization complete.');
}
// ▼▼▼ [추가] ui.js 파일 맨 아래에 아래 함수들을 모두 추가 ▼▼▼

// =====================================================================
// [신규] AI 모델 관리 UI 렌더링 함수들
// =====================================================================

/**
 * AI 모델 목록을 테이블 형태로 렌더링합니다.
 * @param {Array} models - 서버에서 받아온 AI 모델 데이터 배열 [{id, name, description, metadata: {input_features, output_features, performance}, created_at}, ...]
 */
function renderAiModelsTable(models) {
    console.log(
        `[DEBUG][Render] Rendering AI Models table with ${models.length} items.`
    ); // 디버깅
    const container = document.getElementById('ai-model-list-container');
    if (!container) {
        console.error(
            "[ERROR][Render] AI Model list container '#ai-model-list-container' not found."
        );
        return;
    }
    if (!currentProjectId) {
        // 프로젝트 미선택 시
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }
    if (!Array.isArray(models) || models.length === 0) {
        // 모델 없을 시
        container.innerHTML =
            '<p>등록된 AI 모델이 없습니다. 새 모델을 업로드하세요.</p>';
        return;
    }

    let tableHtml = `
        <table class="ruleset-table"> <thead>
                <tr>
                    <th style="width: 20%;">이름</th>
                    <th style="width: 25%;">설명</th>
                    <th>입력 피처</th>
                    <th>출력 피처</th>
                    <th style="width: 10%;">성능 (Loss)</th>
                    <th style="width: 10%;">생성일</th>
                    <th style="width: 15%;">작업</th>
                </tr>
            </thead>
            <tbody>
    `;

    // 날짜 포맷 함수 (간단 버전)
    const formatDate = (isoString) =>
        isoString ? new Date(isoString).toLocaleDateString() : 'N/A';

    models.forEach((model) => {
        // [확인] 아래 필드들이 models 배열의 각 객체에 직접 접근하는지 확인
        const inputFeatures = Array.isArray(model.input_features)
            ? model.input_features.join(', ')
            : 'N/A';
        const outputFeatures = Array.isArray(model.output_features)
            ? model.output_features.join(', ')
            : 'N/A';
        const performanceMetric =
            model.performance?.final_validation_loss?.toFixed(4) ?? 'N/A'; // model.performance 직접 접근
        const createdAt = formatDate(model.created_at);

        tableHtml += `
            <tr data-model-id="${model.id}">
                <td>${model.name || 'N/A'}</td>
                <td>${model.description || ''}</td>
                
                <td title="${inputFeatures}">${inputFeatures.substring(0, 30)}${
            inputFeatures.length > 30 ? '...' : ''
        }</td>
                <td title="${outputFeatures}">${outputFeatures.substring(
            0,
            30
        )}${outputFeatures.length > 30 ? '...' : ''}</td>
                
                <td>${performanceMetric}</td>
                <td>${createdAt}</td>
                <td>
                </td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    console.log('[DEBUG][Render] AI Models table rendered successfully.'); // 디버깅
}

/**
 * 학습 완료 후 Test Set 평가 결과를 HTML 테이블로 렌더링합니다.
 * @param {Object} evaluationData - 백엔드에서 받은 test_set_evaluation 데이터
 */
function renderTestSetEvaluationResults(evaluationData) {
    const container = document.getElementById('test-set-evaluation-results');
    if (!container) return;

    container.innerHTML = '<h4>Test Set 평가 결과</h4>'; // 제목 초기화

    if (
        !evaluationData ||
        typeof evaluationData !== 'object' ||
        Object.keys(evaluationData).length === 0
    ) {
        container.innerHTML += '<p>Test Set 평가 결과 데이터가 없습니다.</p>';
        return;
    }

    let tableHtml = `<table class="ruleset-table" style="font-size: 13px;">
        <thead>
            <tr>
                <th>출력 항목</th>
                <th style="text-align: right;">MAE</th>
                <th style="text-align: right;">RMSE</th>
                <th style="text-align: right; background-color: #fffbe0;">평균 오차율(MAPE %)</th>
                <th style="text-align: right;">오차율 StdDev (%)</th>
                <th style="text-align: right;">최대 오차율 (%)</th>
                <th style="text-align: right;">최소 오차율 (%)</th>
            </tr>
        </thead>
        <tbody>`;

    const formatMetric = (value, digits = 4) =>
        typeof value === 'number' ? value.toFixed(digits) : 'N/A';
    const formatPercent = (value) =>
        typeof value === 'number' ? value.toFixed(2) + '%' : 'N/A';

    // 개별 출력 항목 결과 렌더링
    for (const outputName in evaluationData) {
        if (outputName === 'overall') continue; // 전체 평균은 마지막에

        const metrics = evaluationData[outputName];
        tableHtml += `
            <tr>
                <td>${escapeHtml(outputName)}</td>
                <td style="text-align: right;">${formatMetric(metrics.mae)}</td>
                <td style="text-align: right;">${formatMetric(
                    metrics.rmse
                )}</td>
                <td style="text-align: right; background-color: #fffbe0;">${formatPercent(
                    metrics.mean_ape_percent
                )}</td>
                <td style="text-align: right;">${formatPercent(
                    metrics.std_dev_ape_percent
                )}</td>
                <td style="text-align: right;">${formatPercent(
                    metrics.max_ape_percent
                )}</td>
                <td style="text-align: right;">${formatPercent(
                    metrics.min_ape_percent
                )}</td>
            </tr>
        `;
    }

    // 전체 평균 결과 렌더링 (있을 경우)
    if (evaluationData.overall) {
        const overallMetrics = evaluationData.overall;
        tableHtml += `
            <tr style="font-weight: bold; border-top: 2px solid #ccc;">
                <td>전체 평균 (Overall)</td>
                <td style="text-align: right;">${formatMetric(
                    overallMetrics.mae
                )}</td>
                <td style="text-align: right;">${formatMetric(
                    overallMetrics.rmse
                )}</td>
                <td style="text-align: right; background-color: #fffbe0;">${formatPercent(
                    overallMetrics.mean_ape_percent
                )}</td>
                <td style="text-align: right;">${formatPercent(
                    overallMetrics.std_dev_ape_percent
                )}</td>
                <td style="text-align: right;">${formatPercent(
                    overallMetrics.max_ape_percent
                )}</td>
                <td style="text-align: right;">${formatPercent(
                    overallMetrics.min_ape_percent
                )}</td>
            </tr>
        `;
    }

    tableHtml += '</tbody></table>';
    container.innerHTML += tableHtml;
}

/**
 * 학습용 CSV 헤더를 기반으로 입력/출력 피처 선택 체크박스 리스트를 렌더링합니다.
 * @param {Array<string>} headers - CSV 파일의 헤더(컬럼명) 배열
 */
function renderFeatureSelectionLists(headers) {
    console.log(
        '[DEBUG][Render] Rendering feature selection lists for AI training.'
    ); // 디버깅
    const inputListDiv = document.getElementById('input-feature-list');
    const outputListDiv = document.getElementById('output-feature-list');
    if (!inputListDiv || !outputListDiv) {
        console.error('[ERROR][Render] Feature list containers not found.');
        return;
    }
    inputListDiv.innerHTML = ''; // 초기화
    outputListDiv.innerHTML = ''; // 초기화

    if (!Array.isArray(headers) || headers.length === 0) {
        const message = '<small>CSV 헤더 정보를 읽을 수 없습니다.</small>';
        inputListDiv.innerHTML = message;
        outputListDiv.innerHTML = message;
        console.warn(
            '[WARN][Render] Cannot render feature lists, headers array is invalid or empty.'
        ); // 디버깅
        return;
    }

    headers.forEach((header) => {
        // XSS 방지: header 문자열을 textContent로 설정
        const inputLabel = document.createElement('label');
        const inputCheckbox = document.createElement('input');
        inputCheckbox.type = 'checkbox';
        inputCheckbox.name = 'input_feature';
        inputCheckbox.value = header;
        inputLabel.appendChild(inputCheckbox);
        inputLabel.appendChild(document.createTextNode(` ${header}`)); // 텍스트 노드로 추가
        inputListDiv.appendChild(inputLabel);

        const outputLabel = document.createElement('label');
        const outputCheckbox = document.createElement('input');
        outputCheckbox.type = 'checkbox';
        outputCheckbox.name = 'output_feature';
        outputCheckbox.value = header;
        outputLabel.appendChild(outputCheckbox);
        outputLabel.appendChild(document.createTextNode(` ${header}`)); // 텍스트 노드로 추가
        outputListDiv.appendChild(outputLabel);
    });
    console.log(
        `[DEBUG][Render] ${headers.length} feature selection checkboxes rendered.`
    ); // 디버깅
}

function addHiddenLayerRow() {
    const container = document.getElementById('hidden-layers-config');
    if (!container) return;
    const layerIndex = container.children.length; // 0부터 시작
    const newRow = document.createElement('div');
    newRow.className = 'layer-config-row';
    newRow.dataset.layerIndex = layerIndex;
    newRow.innerHTML = `
        <span>Layer ${layerIndex + 1}:</span>
        <input type="number" class="nodes-input" value="64" min="1" title="노드 수">
        <select class="activation-select" title="활성화 함수">
            <option value="relu" selected>relu</option>
            <option value="sigmoid">sigmoid</option>
            <option value="tanh">tanh</option>
            <option value="elu">elu</option>
            <option value="selu">selu</option>
            <option value="swish">swish</option>
            </select>
        <button class="remove-layer-btn" style="padding: 2px 5px; font-size: 10px;">-</button>
    `;
    container.appendChild(newRow);

    // 새로 추가된 제거 버튼에 이벤트 리스너 추가
    newRow
        .querySelector('.remove-layer-btn')
        .addEventListener('click', removeHiddenLayerRow);
}

/**
 * 특정 은닉층 설정 행을 제거하고 레이블을 업데이트합니다.
 * @param {Event} event - 클릭 이벤트 객체
 */
function removeHiddenLayerRow(event) {
    const rowToRemove = event.target.closest('.layer-config-row');
    const container = document.getElementById('hidden-layers-config');
    if (!rowToRemove || !container) return;

    // 최소 1개의 레이어는 유지
    if (container.children.length <= 1) {
        showToast('최소 1개의 은닉층이 필요합니다.', 'warning');
        return;
    }

    rowToRemove.remove();

    // 레이어 번호 재정렬
    Array.from(container.children).forEach((row, index) => {
        row.dataset.layerIndex = index;
        const span = row.querySelector('span');
        if (span) span.textContent = `Layer ${index + 1}:`;
    });
}

/**
 * 은닉층 설정을 초기 상태(1개 레이어)로 리셋합니다.
 */
function resetHiddenLayersConfig() {
    const container = document.getElementById('hidden-layers-config');
    if (!container) return;
    container.innerHTML = ''; // 기존 행 모두 제거
    addHiddenLayerRow(); // 첫 번째 행 추가
}

// =====================================================================
// [신규] 개산견적 (SD) UI 렌더링 함수들
// =====================================================================

/**
 * 선택된 AI 모델의 입력 피처에 따라 SD 탭의 입력 필드를 동적으로 생성합니다.
 * @param {Array<string>} inputFeatures - 모델 메타데이터의 입력 피처 이름 배열
 */
function renderSdInputFields(inputFeatures) {
    console.log(
        '[DEBUG][Render] Rendering SD input fields based on selected AI model (ensuring unique IDs).'
    ); // 디버깅
    const container = document.getElementById('sd-input-fields');
    if (!container) {
        console.error(
            "[ERROR][Render] SD input fields container '#sd-input-fields' not found."
        );
        return;
    }
    container.innerHTML = ''; // 기존 필드 초기화

    if (!Array.isArray(inputFeatures) || inputFeatures.length === 0) {
        container.innerHTML =
            '<p>선택된 모델에 필요한 입력 정보가 없습니다.</p>';
        console.warn('[WARN][Render] No input features provided for SD model.'); // 디버깅
        return;
    }

    // 연동 가능한 공사코드 옵션 HTML 생성 (sdEnabledCostCodes 전역 변수 사용)
    let costCodeOptionsHtml = '<option value="">-- 직접 입력 --</option>';
    if (Array.isArray(sdEnabledCostCodes)) {
        sdEnabledCostCodes.forEach((code) => {
            const quantityDisplay = parseFloat(
                code.total_quantity || 0
            ).toFixed(4); // 소수점 4자리
            const codeText = escapeHtml(code.code);
            const nameText = escapeHtml(code.name);
            const unitText = escapeHtml(code.unit || '');
            const optionText = `${codeText} ${nameText} (${quantityDisplay} ${unitText})`;
            costCodeOptionsHtml += `<option value="${escapeHtml(
                code.id
            )}">${optionText}</option>`;
        });
    } else {
        console.warn(
            '[WARN][Render] sdEnabledCostCodes is not an array, cannot populate cost code options.'
        ); // 디버깅
    }

    // --- [핵심 수정] forEach 루프에 index 추가 ---
    inputFeatures.forEach((feature, index) => {
        // <<< index 추가
        // --- [핵심 수정] ID 생성 시 index 포함하여 고유성 보장 ---
        const featureIdPart =
            feature.replace(/[^a-zA-Z0-9]/g, '-') + `-${index}`; // <<< index 추가
        const inputId = `sd-input-${featureIdPart}`;
        const selectId = `sd-select-${featureIdPart}`;
        // --- [핵심 수정] 여기까지 ---

        const groupDiv = document.createElement('div');
        groupDiv.className = 'input-group';

        const label = document.createElement('label');
        label.htmlFor = inputId;
        label.textContent = `${feature}:`;

        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.id = inputId; // 고유 ID 적용
        numberInput.dataset.featureName = feature;
        numberInput.placeholder = '값 입력...';
        numberInput.step = 'any';
        numberInput.dataset.selectId = selectId; // 연결된 고유 select ID 저장

        const select = document.createElement('select');
        select.id = selectId; // 고유 ID 적용
        select.dataset.inputId = inputId; // 연결된 고유 input ID 저장
        select.dataset.inputType = 'costCodeLink';
        select.title = '연동할 공사코드 선택 (선택 시 수량 자동 입력)';
        select.innerHTML = costCodeOptionsHtml;

        groupDiv.appendChild(label);
        groupDiv.appendChild(numberInput);
        groupDiv.appendChild(select);
        container.appendChild(groupDiv);
    });
    console.log(
        `[DEBUG][Render] Rendered ${inputFeatures.length} SD input fields with unique IDs.`
    ); // 디버깅
}

// HTML 문자열 이스케이프 헬퍼 함수
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * SD 예측 결과를 테이블 형태로 렌더링합니다.
 * @param {Object} predictions - 예측 결과 객체 (Key: 출력 피처 이름, Value: 예측값)
 */
function renderSdResultsTable(predictions) {
    console.log(
        '[DEBUG][Render] Rendering SD prediction results table (with range).'
    ); // 디버깅
    const container = document.getElementById('sd-prediction-results-table');
    if (!container) {
        console.error(
            '[ERROR][Render] SD prediction results table container not found.'
        );
        return;
    }
    if (
        !predictions ||
        typeof predictions !== 'object' ||
        Object.keys(predictions).length === 0
    ) {
        container.innerHTML = '<p>예측 결과가 없습니다.</p>';
        console.log(
            '[DEBUG][Render] No SD prediction data to render in table.'
        ); // 디버깅
        return;
    }

    let tableHtml = `
        <table>
            <thead>
                <tr>
                    <th>항목 (Output Feature)</th>
                    <th style="text-align: right;">최소 예측값</th>
                    <th style="text-align: right;">평균 예측값</th>
                    <th style="text-align: right;">최대 예측값</th>
                </tr>
            </thead>
            <tbody>
    `;
    for (const feature in predictions) {
        const result = predictions[feature];
        // 결과 객체 구조 확인 및 기본값 설정
        const predValue =
            typeof result?.predicted === 'number' ? result.predicted : 0;
        const minValue =
            typeof result?.min === 'number' ? result.min : predValue; // min 없으면 predicted 사용
        const maxValue =
            typeof result?.max === 'number' ? result.max : predValue; // max 없으면 predicted 사용
        const lossUsed =
            typeof result?.loss_used === 'number'
                ? result.loss_used.toFixed(4)
                : 'N/A'; // 계산에 사용된 loss

        // 숫자 포맷팅 (지역화, 소수점 2자리)
        const formatNumber = (num) =>
            typeof num === 'number'
                ? num.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                  })
                : 'N/A';

        tableHtml += `
            <tr title="Loss used for range: ${lossUsed}">
                <td>${escapeHtml(feature)}</td>
                <td style="text-align: right;">${formatNumber(minValue)}</td>
                <td style="text-align: right; font-weight: bold;">${formatNumber(
                    predValue
                )}</td>
                <td style="text-align: right;">${formatNumber(maxValue)}</td>
            </tr>
        `;
    }
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    console.log(
        '[DEBUG][Render] SD prediction results table (with range) rendered successfully.'
    ); // 디버깅
}

/**
 * SD 예측 결과를 Chart.js를 사용하여 막대 그래프로 렌더링합니다.
 * @param {Object} predictions - 예측 결과 객체
 */
function renderSdPredictionChart(predictions) {
    console.log('[DEBUG][Render] Rendering SD prediction chart.');
    const canvas = document.getElementById('sd-prediction-chart');
    if (!canvas) {
        console.warn('[WARN][Render] SD prediction chart canvas #sd-prediction-chart not found.');
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error(
            '[ERROR][Render] Failed to get 2D context for SD prediction chart.'
        );
        return;
    }

    const hasPredictionData =
        predictions &&
        typeof predictions === 'object' &&
        Object.keys(predictions).length > 0;

    if (!hasPredictionData) {
        console.log('[DEBUG][Render] No SD prediction data. Cleaning up chart canvas.');
        if (sdPredictionChartInstance) {
            sdPredictionChartInstance.destroy();
            sdPredictionChartInstance = null;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    if (sdPredictionChartInstance) {
        console.log('[DEBUG][Render] Destroying previous SD prediction chart instance.');
        sdPredictionChartInstance.destroy();
        sdPredictionChartInstance = null;
    }

    const featureKeys = Object.keys(predictions);
    const palette = [
        '#2F80ED',
        '#BB6BD9',
        '#27AE60',
        '#F2994A',
        '#EB5757',
        '#9B51E0',
        '#219653',
        '#F2C94C',
    ];

    const normalPdf = (x, mean, stdDev) => {
        if (!isFinite(stdDev) || stdDev <= 0) return 0;
        const exponent = -0.5 * Math.pow((x - mean) / stdDev, 2);
        return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    };

    const hexToRgba = (hex, alpha) => {
        const sanitized = hex.replace('#', '');
        if (sanitized.length !== 6) return `rgba(47, 128, 237, ${alpha})`;
        const bigint = parseInt(sanitized, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const datasets = [];
    const annotations = {};
    let globalMinX = Number.POSITIVE_INFINITY;
    let globalMaxX = Number.NEGATIVE_INFINITY;
    let globalMaxY = 0;

    featureKeys.forEach((feature, index) => {
        const result = predictions[feature] || {};
        const predictedRaw = Number(result?.predicted);
        const mean = Number.isFinite(predictedRaw) ? predictedRaw : 0;
        const minRaw = Number(result?.min);
        const minVal = Number.isFinite(minRaw) ? minRaw : mean;
        const maxRaw = Number(result?.max);
        const maxVal = Number.isFinite(maxRaw) ? maxRaw : mean;
        const rangeSpan = maxVal - minVal;
        const lowerDelta = Math.abs(mean - minVal);
        const upperDelta = Math.abs(maxVal - mean);
        const positiveDeltas = [lowerDelta, upperDelta].filter((delta) => delta > 0);

        let stdDev;
        if (positiveDeltas.length === 0) {
            stdDev = Math.max(Math.abs(mean) * 0.001, 0.05);
        } else if (positiveDeltas.length === 1) {
            stdDev = positiveDeltas[0] / 2;
        } else {
            stdDev = (positiveDeltas[0] + positiveDeltas[1]) / 4;
        }
        if (!isFinite(stdDev) || stdDev <= 0) {
            stdDev = Math.max(Math.abs(mean) * 0.001, 0.05);
        }

        let sampleStart;
        let sampleEnd;
        if (rangeSpan > 0) {
            sampleStart = minVal;
            sampleEnd = maxVal;
        } else {
            sampleStart = mean - stdDev;
            sampleEnd = mean + stdDev;
        }

        if (!isFinite(sampleStart) || !isFinite(sampleEnd) || sampleStart === sampleEnd) {
            sampleStart = mean - Math.max(stdDev, 0.05);
            sampleEnd = mean + Math.max(stdDev, 0.05);
        }

        const paddingBase = sampleEnd - sampleStart;
        const padding =
            Math.max(paddingBase * 0.05, stdDev * 0.1, 0.05);
        sampleStart -= padding;
        sampleEnd += padding;

        const sampleCount = 120;
        const step = sampleCount > 1 ? (sampleEnd - sampleStart) / (sampleCount - 1) : 1;

        const curveData = [];
        for (let i = 0; i < sampleCount; i += 1) {
            const x = sampleStart + step * i;
            const y = normalPdf(x, mean, stdDev);
            curveData.push({ x, y });
            if (x < globalMinX) globalMinX = x;
            if (x > globalMaxX) globalMaxX = x;
            if (y > globalMaxY) globalMaxY = y;
        }

        [minVal, mean, maxVal].forEach((anchorX) => {
            if (!Number.isFinite(anchorX)) return;
            const existing = curveData.find((point) => Math.abs(point.x - anchorX) < step / 2);
            if (!existing) {
                const y = normalPdf(anchorX, mean, stdDev);
                curveData.push({ x: anchorX, y });
                if (anchorX < globalMinX) globalMinX = anchorX;
                if (anchorX > globalMaxX) globalMaxX = anchorX;
                if (y > globalMaxY) globalMaxY = y;
            }
        });
        curveData.sort((a, b) => a.x - b.x);

        const color = palette[index % palette.length];
        datasets.push({
            label: feature,
            data: curveData,
            parsing: false,
            showLine: true,
            fill: true,
            tension: 0.35,
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.28),
            pointRadius: 0,
            pointHoverRadius: 3,
        });

        const addAnnotationLine = (id, value, borderColor, borderDash, labelText, labelBgAlpha = 0.85) => {
            annotations[id] = {
                type: 'line',
                scaleID: 'x',
                value,
                borderColor,
                borderWidth: id.includes('mean') ? 2 : 1,
                borderDash,
                label: {
                    content: labelText,
                    enabled: true,
                    position: 'start',
                    yAdjust: -6,
                    backgroundColor: hexToRgba(borderColor, labelBgAlpha),
                    color: '#000',
                    font: { size: 10 },
                },
            };
        };

        addAnnotationLine(
            `sd-mean-${index}`,
            mean,
            color,
            [],
            `${feature} \u03bc`
        );
        addAnnotationLine(`sd-min-${index}`, minVal, color, [6, 6], `${feature} min`);
        addAnnotationLine(`sd-max-${index}`, maxVal, color, [6, 6], `${feature} max`);
    });

    if (!Number.isFinite(globalMinX) || !Number.isFinite(globalMaxX)) {
        globalMinX = 0;
        globalMaxX = 1;
    }
    if (!Number.isFinite(globalMaxY) || globalMaxY <= 0) {
        globalMaxY = 1;
    }

    console.log('[DEBUG][Render] SD chart datasets:', datasets);

    try {
        sdPredictionChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: datasets.length > 1,
                        position: 'bottom',
                    },
                    title: {
                        display: true,
                        text: 'AI 예측 분포 (정규분포 근사)',
                    },
                    tooltip: {
                        mode: 'nearest',
                        intersect: false,
                        callbacks: {
                            label(context) {
                                const { dataset, parsed } = context;
                                if (!dataset || !parsed) return '';
                                const feature = dataset.label || '';
                                const prediction = predictions[feature] || {};
                                const mean = prediction.predicted;
                                const min = prediction.min;
                                const max = prediction.max;
                                const metricName = prediction.metric_used_for_range;
                                const metricValue = prediction.metric_value;
                                const formattedMetricValue =
                                    typeof metricValue === 'number'
                                        ? metricValue.toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                          })
                                        : metricValue;
                                const metricDisplay =
                                    metricName && formattedMetricValue != null && formattedMetricValue !== ''
                                        ? `${metricName}: ${formattedMetricValue}`
                                        : '';

                                return [
                                    feature,
                                    `x: ${parsed.x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                    `밀도: ${parsed.y.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
                                    `예상값(μ): ${mean?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                    `범위: ${min?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ~ ${max?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                    metricDisplay,
                                ].filter(Boolean);
                            },
                        },
                    },
                    annotation: { annotations },
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: '예측 값',
                        },
                        suggestedMin: globalMinX,
                        suggestedMax: globalMaxX,
                    },
                    y: {
                        title: {
                            display: true,
                            text: '상대 확률 밀도',
                        },
                        suggestedMin: 0,
                        suggestedMax: globalMaxY * 1.05,
                        ticks: {
                            callback(value) {
                                return Number(value).toFixed(3);
                            },
                        },
                    },
                },
            },
        });
        console.log('[DEBUG][Render] SD prediction chart rendered successfully.');
    } catch (error) {
        console.error('[ERROR][Render] Failed to render SD chart:', error);
        showToast('Failed to render SD prediction chart.', 'error');
    }
}


/**
 * 개산견적(SD) 탭 하단 테이블에 CostItem 목록을 렌더링합니다.
 * @param {Array} items - 서버에서 받아온 SD용 CostItem 데이터 배열 [{id, quantity, cost_code_name, cost_code_unit, quantity_member_name, ...}, ...]
 */
function renderSdCostItemsTable(items) {
    console.log(
        `[DEBUG][Render] Rendering SD Cost Items table with ${items.length} items.`
    ); // 디버깅
    const container = document.getElementById('sd-cost-item-table-container');
    if (!container) {
        console.error(
            '[ERROR][Render] SD Cost Item table container not found.'
        );
        return;
    }
    if (!currentProjectId) {
        container.innerHTML = '<p>프로젝트를 선택하세요.</p>';
        return;
    }
    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = '<p>개산견적(SD) 대상 산출항목이 없습니다.</p>';
        return;
    }

    // TODO: 그룹핑 기능 추가 시 그룹핑 로직 구현 필요

    // 기본 테이블 렌더링 (그룹핑 미구현 상태)
    const columns = [
        // 표시할 컬럼 정의
        { id: 'cost_code_name', label: '산출항목 (공사코드)' },
        { id: 'quantity', label: '수량', align: 'right' },
        { id: 'cost_code_unit', label: '단위' },
        { id: 'quantity_member_name', label: '연관 부재' },
        { id: 'classification_tag_name', label: '부재 분류' },
        { id: 'member_mark_name', label: '일람부호' },
        { id: 'raw_element_unique_id', label: 'BIM Unique ID' }, // BIM 연동 위해 추가
    ];

    let tableHtml = `<table class="ruleset-table"><thead><tr>`; // ruleset-table 스타일 재사용
    columns.forEach(
        (col) =>
            (tableHtml += `<th style="text-align: ${
                col.align || 'left'
            }">${escapeHtml(col.label)}</th>`)
    );
    tableHtml += `</tr></thead><tbody>`;

    items.forEach((item) => {
        // 선택된 행 강조
        const isSelected = selectedSdItemIds.has(item.id);
        tableHtml += `<tr data-id="${item.id}" class="${
            isSelected ? 'selected-row' : ''
        }" style="cursor: pointer;">`; // 선택 가능하도록 cursor 추가
        columns.forEach((col) => {
            let value = item[col.id] ?? ''; // null/undefined 방지
            if (col.id === 'quantity' && typeof value === 'number') {
                value = value.toFixed(4); // 소수점 4자리
            }
            tableHtml += `<td style="text-align: ${
                col.align || 'left'
            }">${escapeHtml(value)}</td>`; // 값 이스케이프
        });
        tableHtml += `</tr>`;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    console.log('[DEBUG][Render] SD Cost Items table rendered successfully.'); // 디버깅
}

// ▲▲▲ [추가] 여기까지 ▲▲▲
// connections/static/connections/ui.js

// ▼▼▼ [교체] 기존 initializeSdUI 함수 전체를 아래 코드로 교체 ▼▼▼
function initializeSdUI() {
    console.log(
        '[DEBUG][initializeSdUI] Initializing Schematic Estimation (SD) UI elements.'
    ); // 디버깅
    // --- 상단 패널 초기화 ---
    const modelSelect = document.getElementById('sd-model-select');
    if (modelSelect)
        modelSelect.innerHTML = '<option value="">-- 모델 선택 --</option>';
    const inputFields = document.getElementById('sd-input-fields');
    if (inputFields)
        inputFields.innerHTML =
            '<p>모델을 선택하면 입력 항목이 표시됩니다.</p>';
    const predictBtn = document.getElementById('sd-predict-btn');
    if (predictBtn) predictBtn.disabled = true;
    const resultsTable = document.getElementById('sd-prediction-results-table');
    if (resultsTable)
        resultsTable.innerHTML = '<p>예측 결과가 여기에 표시됩니다.</p>';

    // --- 결과 차트 초기화 ---
    if (sdPredictionChartInstance) {
        sdPredictionChartInstance.destroy();
        sdPredictionChartInstance = null;
    }
    const canvas = document.getElementById('sd-prediction-chart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); // 캔버스 내용 지우기
    }

    // --- 하단 패널 BOQ 테이블 컨테이너 초기화 ---
    // [수정] 하단 테이블 컨테이너 초기화 (renderBoqTable 호출 전 상태)
    clearContainer(
        'sd-table-container',
        '<p>프로젝트를 선택하고 그룹핑 기준을 설정하세요.</p>'
    );

    // [수정] 하단 패널 BOQ 컨트롤 초기화 (initializeSdBoqControls 호출은 loadDataForActiveTab에서)
    const sdGroupingContainer = document.getElementById('sd-grouping-controls');
    if (sdGroupingContainer) sdGroupingContainer.innerHTML = '';
    const sdDisplayFieldsContainer = document.getElementById(
        'sd-display-fields-container'
    );
    if (sdDisplayFieldsContainer)
        sdDisplayFieldsContainer.innerHTML = '<small>필드 로딩 중...</small>';

    // 관련 전역 변수 초기화
    selectedSdModelId = null;
    // selectedSdItemIds.clear(); // BOQ 테이블 선택 상태는 유지할 수도 있음 (선택적)
    // currentSdBoqColumns = []; // 컬럼 상태는 generateSdBoqReport에서 관리
    // sdBoqColumnAliases = {};

    console.log('[DEBUG][initializeSdUI] SD UI elements reset.'); // 디버깅
}
// ▲▲▲ [교체] 여기까지 ▲▲▲

// ▼▼▼ [수정] resetTrainingUI 함수 내부 수정 ▼▼▼
// 학습 UI 초기화 (CSV 업로드 단계로)
function resetTrainingUI() {
    console.log(
        '[DEBUG][resetTrainingUI] Resetting AI training UI to Step 1 (CSV Upload).'
    );
    // 단계 표시 초기화
    document.getElementById('training-step-1').style.display = 'block';
    document.getElementById('training-step-2').style.display = 'none';
    document.getElementById('training-step-3').style.display = 'none';
    // 입력 값 초기화 (기존)
    const csvInput = document.getElementById('training-csv-input');
    if (csvInput) csvInput.value = '';
    displaySelectedFileName('training-csv-input', 'upload-csv-btn');
    document.getElementById('csv-info').innerHTML = '';
    document.getElementById('input-feature-list').innerHTML = '';
    document.getElementById('output-feature-list').innerHTML = '';
    document.getElementById('training-model-name').value = '';

    // ▼▼▼ [추가] 새로운 UI 요소 초기화 ▼▼▼
    // 모델 구조 리셋
    resetHiddenLayersConfig();
    // 하이퍼파라미터 리셋 (기본값으로)
    document.getElementById('loss-function').value = 'mse';
    document.getElementById('optimizer').value = 'adam';
    // Metrics 다중 선택 초기화 (첫 번째 옵션만 선택)
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
        'Test 비율(%): 15'; // 초기값
    document.getElementById('use-random-seed').checked = false;
    document.getElementById('random-seed-value').value = 42;
    document.getElementById('random-seed-value').style.display = 'none'; // 숨김
    // ▲▲▲ [추가] 여기까지 ▲▲▲

    // 진행률/결과/액션 초기화 (기존)
    document.getElementById('training-progress-info').textContent =
        '학습 대기 중...';
    document.getElementById('training-results').innerHTML = '';
    // ▼▼▼ [추가] 평가 결과 영역 초기화 ▼▼▼
    document.getElementById('test-set-evaluation-results').innerHTML = '';
    // ▲▲▲ [추가] 여기까지 ▲▲▲
    document.getElementById('training-actions').style.display = 'none';
    document.getElementById('save-trained-model-btn').disabled = false;
    // 차트 초기화 (기존)
    if (trainingChartInstance) {
        trainingChartInstance.destroy();
        trainingChartInstance = null;
    }
    // 전역 변수 초기화 (기존)
    uploadedCsvFilename = null;
    csvHeaders = [];
    currentTrainingTaskId = null;
    currentTrainingStatus = {};
    trainedModelTempFilename = null;
    trainedModelMetadata = null;
    console.log(
        '[DEBUG][resetTrainingUI] Training UI and state variables reset.'
    );
}
// connections/static/connections/ui.js

// ... (다른 함수들 유지) ...

// ▼▼▼ [추가] SD 연관 항목 목록 렌더링 함수 ▼▼▼
/**
 * SD 탭 중간 패널에 연관된 산출항목 목록 테이블을 렌더링합니다.
 * @param {Array<string>} itemIds - 표시할 CostItem ID 목록
 */
function renderSdAssociatedItemsTable(itemIds) {
    const container = document.getElementById('sd-item-list-container');
    console.log(
        `[DEBUG][Render] Rendering SD associated items list for ${itemIds?.length} IDs.`
    );

    if (!container) {
        console.error(
            '[ERROR][Render] SD item list container #sd-item-list-container not found.'
        );
        return;
    }
    if (!itemIds || itemIds.length === 0) {
        container.innerHTML =
            '<p style="padding: 15px;">왼쪽 테이블에서 그룹 행을 선택하세요.</p>';
        // 상세 속성 패널도 초기화
        renderSdItemProperties(null);
        return;
    }

    // loadedSdCostItems 전역 변수에서 필요한 데이터 필터링
    const itemsToRender = (loadedSdCostItems || []).filter((item) =>
        itemIds.includes(item.id)
    );
    if (itemsToRender.length === 0) {
        container.innerHTML =
            '<p style="padding: 15px;">선택된 그룹에 포함된 산출항목 데이터를 찾을 수 없습니다.</p>';
        renderSdItemProperties(null);
        return;
    }

    // 표시할 컬럼 정의 (요청사항 반영)
    const headers = [
        { id: 'cost_code_name', label: '산출항목' },
        { id: 'quantity', label: '수량', align: 'right' },
        { id: 'linked_member_name', label: '연관 부재' },
        { id: 'linked_raw_name', label: 'BIM 원본 객체' },
        { id: 'actions', label: 'BIM 연동', align: 'center' },
    ];

    let tableHtml = `<table class="boq-item-list-table"><thead><tr>`; // DD와 동일한 클래스 사용
    headers.forEach(
        (h) =>
            (tableHtml += `<th style="text-align: ${h.align || 'left'};">${
                h.label
            }</th>`)
    );
    tableHtml += `</tr></thead><tbody>`;

    itemsToRender.forEach((item) => {
        // 데이터 조회 (DD 테이블 렌더링 로직 재활용)
        const costItemName = item.cost_code_name || '(이름 없는 항목)';
        const qtyStr = parseFloat(item.quantity || 0).toFixed(4); // 숫자 변환 후 포맷팅

        const member = item.quantity_member_id
            ? loadedQuantityMembers.find(
                  (m) => m.id === item.quantity_member_id
              )
            : null;
        const memberName = member
            ? member.name || '(이름 없는 부재)'
            : '(연관 부재 없음)';

        const rawElement = member?.raw_element_id
            ? allRevitData.find((el) => el.id === member.raw_element_id)
            : null;
        const rawElementName = rawElement
            ? rawElement.raw_data?.Name || '(이름 없는 원본)'
            : '(BIM 원본 없음)';

        let bimButtonHtml = '';
        if (rawElement) {
            bimButtonHtml = `<button class="select-in-client-btn-detail" data-cost-item-id="${item.id}" title="연동 프로그램에서 선택 확인">👁️</button>`;
        }

        tableHtml += `<tr data-item-id="${item.id}">`; // 행 선택 가능하도록 data-item-id 추가
        headers.forEach((h) => {
            let value = '';
            let style = h.align ? `style="text-align: ${h.align};"` : '';
            switch (h.id) {
                case 'cost_code_name':
                    value = costItemName;
                    break;
                case 'quantity':
                    value = qtyStr;
                    break;
                case 'linked_member_name':
                    value = memberName;
                    break;
                case 'linked_raw_name':
                    value = rawElementName;
                    break;
                case 'actions':
                    value = bimButtonHtml;
                    style = `style="text-align: center;"`;
                    break;
                default:
                    value = item[h.id] || '';
            }
            tableHtml += `<td ${style}>${escapeHtml(value)}</td>`;
        });
        tableHtml += `</tr>`;
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
    console.log(
        `[DEBUG][Render] SD associated items list rendered (${itemsToRender.length} items).`
    );

    // 첫 번째 항목의 상세 정보 표시 (선택사항) 또는 초기화
    renderSdItemProperties(null); // 초기에는 상세 정보 비움
}
// ▲▲▲ [추가] 여기까지 ▲▲▲
// connections/static/connections/ui.js

// ... (다른 함수들 유지) ...

// ▼▼▼ [추가] SD 상세 속성 렌더링 함수 ▼▼▼
/**
 * SD 탭 오른쪽 패널에 선택된 항목의 상세 속성(부재, 일람부호, BIM 원본)을 렌더링합니다.
 * DD의 renderBoqItemProperties 로직을 재사용하되, 대상 컨테이너 ID만 다릅니다.
 * @param {String | null} itemId - 상세 정보를 표시할 CostItem의 ID
 */
function renderSdItemProperties(itemId) {
    console.log(
        `[DEBUG][Render] Rendering SD item properties for Item ID: ${itemId}`
    );

    // 중간 목록에서 현재 선택된 행 강조 (선택 사항)
    const listContainer = document.getElementById('sd-item-list-container');
    if (listContainer) {
        listContainer.querySelectorAll('tr[data-item-id]').forEach((row) => {
            row.classList.toggle('selected', row.dataset.itemId === itemId);
        });
    }

    // 오른쪽 상세 패널의 컨테이너들
    const memberContainer = document.getElementById(
        'sd-details-member-container'
    );
    const markContainer = document.getElementById('sd-details-mark-container');
    const rawContainer = document.getElementById('sd-details-raw-container');

    // 패널 초기화 (itemId가 null일 경우)
    if (!itemId) {
        const initialMsg = '<p>중간 목록에서 항목을 선택하세요.</p>';
        if (memberContainer) memberContainer.innerHTML = initialMsg;
        if (markContainer) markContainer.innerHTML = initialMsg;
        if (rawContainer) rawContainer.innerHTML = initialMsg;
        console.log('[DEBUG][Render] Cleared SD details panel.');
        return;
    }

    // [수정] loadedCostItems 대신 loadedSdCostItems 사용
    const costItem = (loadedSdCostItems || []).find(
        (item) => item.id.toString() === itemId.toString()
    );
    if (!costItem) {
        const errorMsg = '<p>항목 정보를 찾을 수 없습니다.</p>';
        if (memberContainer) memberContainer.innerHTML = errorMsg;
        if (markContainer) markContainer.innerHTML = '';
        if (rawContainer) rawContainer.innerHTML = '';
        console.warn(
            `[WARN][Render] SD CostItem data not found for ID: ${itemId}`
        );
        return;
    }

    const member = costItem.quantity_member_id
        ? (loadedQuantityMembers || []).find(
              (m) => m.id.toString() === costItem.quantity_member_id.toString()
          )
        : null;

    // 1. 부재 속성 렌더링 (renderPropertyTable 헬퍼 사용 - ui.js에 있어야 함)
    if (memberContainer) {
        renderPropertyTable(memberContainer, member?.properties, '부재 속성');
    }

    // 2. 일람부호 속성 렌더링
    const mark = member?.member_mark_id
        ? (loadedMemberMarks || []).find(
              (m) => m.id.toString() === member.member_mark_id.toString()
          )
        : null;
    if (markContainer) {
        renderPropertyTable(
            markContainer,
            mark?.properties,
            mark ? `${mark.mark} (일람부호 속성)` : '연관된 일람부호 없음'
        );
    }

    // 3. BIM 원본 데이터 렌더링
    const rawElement = member?.raw_element_id
        ? (allRevitData || []).find(
              (el) => el.id.toString() === member.raw_element_id.toString()
          )
        : null;
    const rawProperties = {};
    if (rawElement?.raw_data) {
        const rawData = rawElement.raw_data;
        for (const key in rawData) {
            if (
                !['Parameters', 'TypeParameters'].includes(key) &&
                typeof rawData[key] !== 'object'
            ) {
                rawProperties[key] = rawData[key];
            }
        }
        for (const key in rawData.TypeParameters || {})
            rawProperties[`Type.${key}`] = rawData.TypeParameters[key];
        for (const key in rawData.Parameters || {})
            rawProperties[key] = rawData.Parameters[key];
    }
    if (rawContainer) {
        renderPropertyTable(
            rawContainer,
            rawProperties,
            rawElement
                ? `${rawElement.raw_data?.Name || '원본 객체'} (BIM 원본)`
                : '연관된 BIM 원본 없음'
        );
    }

    console.log(
        `[DEBUG][Render] SD details panel rendered for Item ID: ${itemId}`
    );
}
// ▲▲▲ [추가] 여기까지 ▲▲▲
