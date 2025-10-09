// connections/static/connections/ui.js

function getValueForItem(item, field) {
    if (!item || !field) return "";
    if (field === "classification_tags")
        return Array.isArray(item.classification_tags)
            ? item.classification_tags.join(", ")
            : "";
    const raw_data = item.raw_data || {};
    if (field in item && field !== "raw_data") return item[field] ?? "";
    if (field.startsWith("TypeParameters.")) {
        const subKey = field.substring(15);
        return raw_data.TypeParameters
            ? raw_data.TypeParameters[subKey] ?? ""
            : "";
    }
    if (raw_data.Parameters && field in raw_data.Parameters)
        return raw_data.Parameters[field] ?? "";
    if (field in raw_data) return raw_data[field] ?? "";
    return "";
}
function populateFieldSelection() {
    // 1. 수정 전, 현재 탭별로 체크된 필드 값을 미리 저장합니다.
    const getCheckedValues = (contextSelector) =>
        Array.from(
            document.querySelectorAll(
                `${contextSelector} .field-checkbox:checked`
            )
        ).map((cb) => cb.value);

    const dmCheckedFields = getCheckedValues("#data-management");
    const smCheckedFields = getCheckedValues("#space-management");

    // 2. 기존 로직: 컨테이너 탐색 및 키 계산 (이 부분은 동일합니다)
    const dmSystemContainer = document.getElementById("system-field-container");
    const dmRevitContainer = document.getElementById("revit-field-container");
    const smSystemContainer = document.getElementById(
        "sm-system-field-container"
    );
    const smRevitContainer = document.getElementById(
        "sm-revit-field-container"
    );

    if (allRevitData.length === 0) return;

    const systemKeys = ["id", "element_unique_id", "classification_tags"];
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
                if (k !== "Parameters" && k !== "TypeParameters")
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
            .join("");
        revContainer.innerHTML = sortedRevitKeys
            .map(
                (k) =>
                    `<label><input type="checkbox" class="field-checkbox" value="${k}"> ${k}</label>`
            )
            .join("");
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

    restoreCheckedState("#data-management", dmCheckedFields);
    restoreCheckedState("#space-management", smCheckedFields);

    // 5. 기존 로직: 모든 그룹핑 드롭다운 메뉴를 업데이트합니다. (이 부분은 동일합니다)
    const allKeysSorted = [...systemKeys, ...sortedRevitKeys].sort();
    const allGroupBySelects = document.querySelectorAll(".group-by-select");
    let optionsHtml =
        '<option value="">-- 필드 선택 --</option>' +
        allKeysSorted
            .map((key) => `<option value="${key}">${key}</option>`)
            .join("");
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
    const newLevelDiv = document.createElement("div");
    newLevelDiv.className = "group-level";
    newLevelDiv.innerHTML = `
        <label>${newIndex}차:</label>
        <select class="group-by-select"></select>
        <button class="remove-group-level-btn">-</button>
    `;
    container.appendChild(newLevelDiv);

    populateFieldSelection();

    newLevelDiv
        .querySelector(".remove-group-level-btn")
        .addEventListener("click", function () {
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
        tableContainer.innerHTML = "표시할 데이터가 없습니다.";
        return;
    }

    const state = viewerStates[contextPrefix];
    if (!state) return;

    const fieldCheckboxSelector =
        contextPrefix === "data-management"
            ? "#fields .field-checkbox:checked"
            : "#sm-fields .field-checkbox:checked";

    const selectedFields = Array.from(
        document.querySelectorAll(fieldCheckboxSelector)
    ).map((cb) => cb.value);

    if (selectedFields.length === 0) {
        tableContainer.innerHTML = "표시할 필드를 하나 이상 선택하세요.";
        return;
    }

    if (state.activeView === "raw-data-view") {
        renderRawDataTable(containerId, selectedFields, state);
    } else if (state.activeView === "classification-view") {
        renderClassificationTable(containerId, selectedFields, state);
    }
}

function renderRawDataTable(containerId, selectedFields, state) {
    const tableContainer = document.getElementById(containerId);
    if (!tableContainer) return;

    let dataToRender = state.isFilterToSelectionActive
        ? allRevitData.filter((item) => state.revitFilteredIds.has(item.id))
        : allRevitData;

    let filteredData = dataToRender.filter((item) =>
        Object.keys(state.columnFilters).every((field) => {
            const filterValue = state.columnFilters[field];
            return (
                !filterValue ||
                getValueForItem(item, field)
                    .toString()
                    .toLowerCase()
                    .includes(filterValue)
            );
        })
    );

    const groupingControlsContainer = tableContainer
        .closest(".table-area")
        ?.querySelector(".table-controls");
    const groupBySelects = groupingControlsContainer
        ? groupingControlsContainer.querySelectorAll(".group-by-select")
        : [];
    const currentGroupByFields = Array.from(groupBySelects)
        .map((s) => s.value)
        .filter(Boolean);

    let tableHtml = "<table><thead><tr>";
    selectedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            state.columnFilters[field] || ""
        }" placeholder="필터..."></th>`;
    });
    tableHtml += "</tr></thead><tbody>";

    function renderGroup(items, level, parentPath) {
        if (level >= currentGroupByFields.length || items.length === 0) {
            items.forEach((item) => {
                tableHtml += `<tr data-db-id="${item.id}" class="${
                    state.selectedElementIds.has(item.id) ? "selected-row" : ""
                }" style="cursor: pointer;">`;
                selectedFields.forEach(
                    (field) =>
                        (tableHtml += `<td>${getValueForItem(
                            item,
                            field
                        )}</td>`)
                );
                tableHtml += "</tr>";
            });
            return;
        }
        const groupField = currentGroupByFields[level];
        const grouped = items.reduce((acc, item) => {
            const key = getValueForItem(item, groupField) || "(값 없음)";
            (acc[key] = acc[key] || []).push(item);
            return acc;
        }, {});
        Object.keys(grouped)
            .sort()
            .forEach((key) => {
                const currentPath = `${parentPath}|${groupField}:${key}`;
                const isCollapsed = state.collapsedGroups[currentPath];
                const indentPixels = level * 20;

                tableHtml += `<tr class="group-header group-level-${level}" data-group-path="${currentPath}">
                            <td colspan="${
                                selectedFields.length
                            }" style="padding-left: ${indentPixels}px;">
                                <span class="toggle-icon">${
                                    isCollapsed ? "▶" : "▼"
                                }</span>
                                ${groupField}: ${key} (${grouped[key].length}개)
                            </td>
                          </tr>`;
                if (!isCollapsed)
                    renderGroup(grouped[key], level + 1, currentPath);
            });
    }
    renderGroup(filteredData, 0, "");
    tableHtml += "</tbody></table>";
    tableContainer.innerHTML = tableHtml;
}

function renderClassificationTable(containerId, selectedFields, state) {
    const tableContainer = document.getElementById(containerId);
    if (!tableContainer) return;

    let dataToRender = state.isFilterToSelectionActive
        ? allRevitData.filter((item) => state.revitFilteredIds.has(item.id))
        : allRevitData;

    const groupingControlsContainer = tableContainer
        .closest(".table-area")
        ?.querySelector(".table-controls");
    const groupBySelects = groupingControlsContainer
        ? groupingControlsContainer.querySelectorAll(".group-by-select")
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
            if (!dataByTag["(분류 없음)"]) dataByTag["(분류 없음)"] = [];
            dataByTag["(분류 없음)"].push(item);
        }
    });

    let tableHtml = "<table><thead><tr>";
    selectedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            state.columnFilters[field] || ""
        }" placeholder="필터..."></th>`;
    });
    tableHtml += "</tr></thead><tbody>";

    function renderSubGroup(items, level, parentPath) {
        if (level >= currentGroupByFields.length || items.length === 0) {
            items.forEach((item) => {
                tableHtml += `<tr data-db-id="${item.id}" class="${
                    state.selectedElementIds.has(item.id) ? "selected-row" : ""
                }" style="cursor: pointer;">`;
                selectedFields.forEach(
                    (field) =>
                        (tableHtml += `<td>${getValueForItem(
                            item,
                            field
                        )}</td>`)
                );
                tableHtml += "</tr>";
            });
            return;
        }

        const groupField = currentGroupByFields[level];
        const grouped = items.reduce((acc, item) => {
            const key = getValueForItem(item, groupField) || "(값 없음)";
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
                                    isCollapsed ? "▶" : "▼"
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
                Object.keys(state.columnFilters).every(
                    (field) =>
                        !state.columnFilters[field] ||
                        getValueForItem(item, field)
                            .toString()
                            .toLowerCase()
                            .includes(state.columnFilters[field])
                )
            );
            if (items.length === 0) return;

            const groupPath = `tag|${tag}`;
            const isCollapsed = state.collapsedGroups[groupPath];

            tableHtml += `<tr class="group-header group-level-0" data-group-path="${groupPath}">
                        <td colspan="${selectedFields.length}">
                            <span class="toggle-icon">${
                                isCollapsed ? "▶" : "▼"
                            }</span>
                            분류: ${tag} (${items.length}개)
                        </td>
                      </tr>`;

            if (!isCollapsed) {
                renderSubGroup(items, 0, groupPath);
            }
        });

    tableHtml += "</tbody></table>";
    tableContainer.innerHTML = tableHtml;
}

function updateTagLists(tags) {
    const tagListDiv = document.getElementById("tag-list");
    const tagAssignSelect = document.getElementById("tag-assign-select");
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
        .join("");
    if (tagAssignSelect) {
        let optionsHtml = '<option value="">-- 적용할 분류 선택 --</option>';
        tags.forEach((tag) => {
            optionsHtml += `<option value="${tag.id}">${tag.name}</option>`;
        });
        tagAssignSelect.innerHTML = optionsHtml;
    }
}

function showToast(message, type = "info", duration = 3000) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("show");
    }, 100);
    setTimeout(() => {
        toast.classList.remove("show");
        toast.addEventListener("transitionend", () => toast.remove());
    }, duration);
}

function renderClassificationRulesetTable(rules, editingRuleId = null) {
    const container = document.querySelector(
        "#classification-ruleset .ruleset-table-container"
    );
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하고 규칙을 추가하세요.</p>";
        return;
    }

    const tagOptions = Array.from(
        document.querySelectorAll("#tag-assign-select option")
    )
        .filter((opt) => opt.value)
        .map((opt) => `<option value="${opt.value}">${opt.text}</option>`)
        .join("");

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
    if (editingRuleId === "new") {
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

    if (rules.length === 0 && editingRuleId !== "new") {
        tableHtml +=
            '<tr><td colspan="5">정의된 규칙이 없습니다. 새 규칙을 추가하세요.</td></tr>';
    }

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;

    // 편집 모드일 때, select 요소의 현재 값을 설정
    if (editingRuleId && editingRuleId !== "new") {
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
    const container = document.getElementById("qm-table-container");
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하세요.</p>";
        return;
    }

    const getQmValue = (item, field) => {
        if (!field) return "";

        if (field.startsWith("BIM원본.")) {
            const key = field.substring(6);
            if (item.raw_element_id) {
                const rawElement = allRevitData.find(
                    (el) => el.id === item.raw_element_id
                );
                return rawElement ? getValueForItem(rawElement, key) : "";
            }
            return "";
        }

        if (field.startsWith("일람부호.")) {
            const key = field.substring(5);
            if (item.member_mark_id) {
                const mark = loadedMemberMarks.find(
                    (m) => m.id === item.member_mark_id
                );
                if (mark) {
                    if (key === "Mark") {
                        return mark.mark;
                    }
                    return mark.properties?.[key] ?? "";
                }
            }
            return "";
        }

        if (field === "mapping_expression") {
            const value = item[field];
            if (
                value &&
                typeof value === "object" &&
                Object.keys(value).length > 0
            ) {
                return JSON.stringify(value);
            }
            return "";
        }
        return item[field] ?? "";
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
        document.querySelectorAll("#qm-grouping-controls .qm-group-by-select")
    )
        .map((s) => s.value)
        .filter(Boolean);

    const sortedFields = [
        "name",
        "classification_tag_name",
        "mapping_expression",
        "raw_element_id",
    ];

    let tableHtml = "<table><thead><tr>";
    sortedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            qmColumnFilters[field] || ""
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
                                        ? "selected"
                                        : ""
                                }>${opt.name}</option>`
                        )
                        .join("");

                    tableHtml += `
                        <tr class="qm-edit-row" data-id="${m.id}">
                            <td><input type="text" class="qm-name-input" value="${
                                m.name || ""
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
                                        m.member_mark_expression || ""
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
                            <td>${getQmValue(m, "raw_element_id")}</td>
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
                        selectedQmIds.has(m.id.toString()) ? "selected-row" : ""
                    }" style="cursor: pointer;">
                            ${sortedFields
                                .map(
                                    (field) =>
                                        `<td>${getQmValue(m, field)}</td>`
                                )
                                .join("")}
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
            const key = getQmValue(item, groupField) || "(값 없음)";
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
                                    isCollapsed ? "▶" : "▼"
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
        renderGroup(filteredMembers, 0, "");
    }

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

/**
 * '공사코드별 뷰' 테이블을 렌더링합니다.
 * @param {Array} members - 렌더링할 전체 수량산출부재 데이터
 */
function renderCostCodeViewTable(members) {
    const container = document.getElementById("qm-table-container");
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하세요.</p>";
        return;
    }

    // getQmValue 함수 (renderRawQmTable과 동일)
    const getQmValue = (item, field) => {
        if (!field) return "";
        if (field.startsWith("BIM원본.")) {
            const key = field.substring(6);
            const rawElement = item.raw_element_id
                ? allRevitData.find((el) => el.id === item.raw_element_id)
                : null;
            return rawElement ? getValueForItem(rawElement, key) : "";
        }
        if (field.startsWith("일람부호.")) {
            const key = field.substring(5);
            const mark = item.member_mark_id
                ? loadedMemberMarks.find((m) => m.id === item.member_mark_id)
                : null;
            if (mark)
                return key === "Mark"
                    ? mark.mark
                    : mark.properties?.[key] ?? "";
            return "";
        }
        return item[field] ?? "";
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
            if (!dataByCostCode["(공사코드 없음)"])
                dataByCostCode["(공사코드 없음)"] = [];
            dataByCostCode["(공사코드 없음)"].push(member);
        }
    });

    currentQmGroupByFields = Array.from(
        document.querySelectorAll("#qm-grouping-controls .qm-group-by-select")
    )
        .map((s) => s.value)
        .filter(Boolean);
    const displayedFields = [
        "name",
        "classification_tag_name",
        "raw_element_id",
    ]; // 공사코드 뷰에서는 공사코드 정보가 그룹 헤더에 있으므로 테이블에서는 제외

    let tableHtml = "<table><thead><tr>";
    displayedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            qmColumnFilters[field] || ""
        }" placeholder="필터..."></th>`;
    });
    tableHtml += "</tr></thead><tbody>";

    // 재귀적으로 하위 그룹을 렌더링하는 함수 (renderClassificationTable과 유사)
    function renderSubGroup(items, level, parentPath) {
        if (level >= currentQmGroupByFields.length || items.length === 0) {
            items.forEach((item) => {
                tableHtml += `<tr data-id="${item.id}" class="${
                    selectedQmIds.has(item.id.toString()) ? "selected-row" : ""
                }" style="cursor: pointer;">`;
                displayedFields.forEach(
                    (field) =>
                        (tableHtml += `<td>${getQmValue(item, field)}</td>`)
                );
                tableHtml += "</tr>";
            });
            return;
        }

        const groupField = currentQmGroupByFields[level];
        const grouped = items.reduce((acc, item) => {
            const key = getQmValue(item, groupField) || "(값 없음)";
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
                                    isCollapsed ? "▶" : "▼"
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
                                isCollapsed ? "▶" : "▼"
                            }</span>
                            공사코드: ${codeName} (${items.length}개)
                        </td>
                      </tr>`;

            if (!isCollapsed) {
                renderSubGroup(items, 0, groupPath);
            }
        });

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

/**
 * 현재 활성화된 '수량산출부재' 탭의 뷰에 따라 적절한 렌더링 함수를 호출합니다.
 * @param {String|null} editingMemberId - 현재 편집 중인 부재의 ID
 */
function renderActiveQmView(editingMemberId = null) {
    // const editingId = editingMemberId || document.querySelector('#qm-table-container .qm-edit-row')?.dataset.id;

    if (activeQmView === "quantity-member-view") {
        renderRawQmTable(loadedQuantityMembers, editingMemberId);
    } else if (activeQmView === "cost-code-view") {
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

    const fieldKeys = new Set(["name", "classification_tag_name"]);

    const membersToScan = members.slice(0, 50);
    membersToScan.forEach((member) => {
        if (member.member_mark_id) {
            const mark = loadedMemberMarks.find(
                (m) => m.id === member.member_mark_id
            );
            if (mark) {
                // '일람부호.Mark'를 그룹핑 옵션에 추가
                fieldKeys.add("일람부호.Mark");
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
                        k !== "Parameters" &&
                        k !== "TypeParameters" &&
                        typeof rawData[k] !== "object"
                    ) {
                        fieldKeys.add(`BIM원본.${k}`);
                    }
                });
            }
        }
    });

    const sortedKeys = Array.from(fieldKeys).sort();
    const groupBySelects = document.querySelectorAll(".qm-group-by-select");
    let optionsHtml =
        '<option value="">-- 그룹핑 기준 선택 --</option>' +
        sortedKeys
            .map((key) => `<option value="${key}">${key}</option>`)
            .join("");

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
    const container = document.getElementById("qm-properties-container");
    const actionsContainer = document.getElementById("qm-properties-actions");
    actionsContainer.innerHTML = ""; // 액션 버튼 초기화

    if (selectedQmIds.size !== 1) {
        container.innerHTML =
            "속성을 보려면 위 테이블에서 부재를 하나만 선택하세요.";
        return;
    }

    const selectedId = selectedQmIds.values().next().value;
    const member = loadedQuantityMembers.find(
        (m) => m.id.toString() === selectedId
    );

    if (!member) {
        container.innerHTML = "선택된 부재 정보를 찾을 수 없습니다.";
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
                    ${isEditMode ? "<th>작업</th>" : ""}
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

    tableHtml += "</tbody></table>";
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
    const container = document.getElementById("ci-table-container");
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하세요.</p>";
        return;
    }

    // [핵심 수정] 복합적인 필드 이름(예: '부재속성.면적')에 대한 값을 찾는 로직
    const getCiValue = (item, field) => {
        if (!field) return "";

        if (field.startsWith("부재속성.")) {
            const key = field.substring(5);
            return item.quantity_member_properties?.[key] ?? "";
        }
        if (field.startsWith("일람부호.")) {
            const key = field.substring(5);
            return item.member_mark_properties?.[key] ?? "";
        }
        if (field.startsWith("BIM원본.")) {
            // ▼▼▼ 이 숫자를 5에서 6으로 변경합니다. ▼▼▼
            const key = field.substring(6);
            return item.raw_element_properties?.[key] ?? "";
        }

        // 기존 필드 처리
        if (field === "quantity_mapping_expression") {
            const value = item[field];
            return value &&
                typeof value === "object" &&
                Object.keys(value).length > 0
                ? JSON.stringify(value)
                : "";
        }
        return item[field] ?? "";
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
        document.querySelectorAll("#ci-grouping-controls .ci-group-by-select")
    )
        .map((s) => s.value)
        .filter(Boolean);
    const sortedFields = [
        "cost_code_name",
        "quantity",
        "quantity_mapping_expression",
        "quantity_member_id",
        "description",
    ];

    let tableHtml = "<table><thead><tr>";
    sortedFields.forEach((field) => {
        tableHtml += `<th>${field}<br><input type="text" class="column-filter" data-field="${field}" value="${
            ciColumnFilters[field] || ""
        }" placeholder="필터..."></th>`;
    });
    tableHtml += `<th>작업</th></tr></thead><tbody>`;

    function renderGroup(groupItems, level, parentPath) {
        if (level >= currentCiGroupByFields.length || groupItems.length === 0) {
            groupItems.forEach((item) => {
                if (item.id === editingItemId) {
                    tableHtml += `
                        <tr class="ci-edit-row" data-id="${item.id}">
                            <td>${getCiValue(item, "cost_code_name")}</td>
                            <td><input type="number" step="any" class="ci-quantity-input" value="${
                                item.quantity
                            }"></td>
                            <td><textarea class="ci-mapping-expression-input" rows="2">${JSON.stringify(
                                item.quantity_mapping_expression || {},
                                null,
                                2
                            )}</textarea></td>
                            <td>${getCiValue(item, "quantity_member_id")}</td>
                            <td><input type="text" class="ci-description-input" value="${
                                item.description || ""
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
                            ? "selected-row"
                            : ""
                    }" style="cursor: pointer;">
                            ${sortedFields
                                .map(
                                    (field) =>
                                        `<td>${getCiValue(item, field)}</td>`
                                )
                                .join("")}
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
            const key = getCiValue(item, groupField) || "(값 없음)";
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
                                    isCollapsed ? "▶" : "▼"
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
        renderGroup(filteredItems, 0, "");
    }

    tableHtml += "</tbody></table>";
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
        "cost_code_name",
        "quantity_member_id",
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
    const groupBySelects = document.querySelectorAll(".ci-group-by-select");
    let optionsHtml =
        '<option value="">-- 그룹핑 기준 선택 --</option>' +
        sortedKeys
            .map((key) => `<option value="${key}">${key}</option>`)
            .join("");

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
        "costcode-ruleset-table-container"
    );
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하세요.</p>";
        return;
    }

    const costCodeOptions = loadedCostCodes
        .map(
            (opt) =>
                `<option value="${opt.id}">${opt.code} - ${opt.name}</option>`
        )
        .join("");

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
                        rule.name || ""
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
            rule.description || ""
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
    if (editId === "new") {
        tableHtml += renderRow({ id: "new" });
    }
    if (rules.length === 0 && editId !== "new") {
        tableHtml +=
            '<tr><td colspan="6">정의된 규칙이 없습니다. 새 규칙을 추가하세요.</td></tr>';
    }
    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;

    if (editId && editId !== "new") {
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
        "ci-linked-member-info-header"
    );
    const memberPropsContainer = document.getElementById(
        "ci-linked-member-properties-container"
    );
    const markPropsContainer = document.getElementById(
        "ci-linked-mark-properties-container"
    );
    const rawElementPropsContainer = document.getElementById(
        "ci-linked-raw-element-properties-container"
    );

    // 모든 컨테이너 초기화
    headerContainer.innerHTML =
        "<p>산출항목을 선택하면 연관된 부재의 정보가 여기에 표시됩니다.</p>";
    memberPropsContainer.innerHTML = "";
    markPropsContainer.innerHTML = "";
    rawElementPropsContainer.innerHTML = "";

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
            "<p>선택된 항목에 연관된 수량산출부재가 없습니다.</p>";
        return;
    }

    // 4. QuantityMember ID를 이용해 전체 부재 목록에서 해당 부재를 찾습니다.
    const member = loadedQuantityMembers.find(
        (m) => m.id.toString() === costItem.quantity_member_id.toString()
    );
    if (!member) {
        headerContainer.innerHTML =
            "<p>연관된 부재 정보를 찾을 수 없습니다.</p>";
        return;
    }

    // 5. 찾은 부재의 이름과 분류를 소제목(header) 영역에 렌더링합니다.
    headerContainer.innerHTML = `
        <h4>${member.name || "이름 없는 부재"}</h4>
        <small>${member.classification_tag_name || "미지정 분류"}</small>
    `;

    // 6. 부재의 속성을 첫 번째 컨테이너에 테이블 형태로 렌더링합니다.
    memberPropsContainer.innerHTML = "<h5>부재 속성</h5>";
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
    memberTableHtml += "</tbody></table>";
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
            markTableHtml += "</tbody></table>";
            markPropsContainer.innerHTML += markTableHtml;
        } else {
            markPropsContainer.innerHTML =
                "<h5>일람부호 속성</h5><p>연결된 일람부호 정보를 찾을 수 없습니다.</p>";
        }
    } else {
        markPropsContainer.innerHTML =
            "<h5>일람부호 속성</h5><p>연계된 일람부호가 없습니다.</p>";
    }
    // ▲▲▲ [핵심 수정] 여기까지 입니다. ▲▲▲

    // 8. 부재에 연결된 RawElement를 찾아 세 번째 컨테이너에 렌더링합니다.
    const rawElementId = member.raw_element_id;
    if (rawElementId) {
        const rawElement = allRevitData.find((el) => el.id === rawElementId);
        if (rawElement && rawElement.raw_data) {
            rawElementPropsContainer.innerHTML = `<h5>BIM 원본 데이터 (${
                rawElement.raw_data.Name || "이름 없음"
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
                    if (key.startsWith("Parameters.")) {
                        value = rawData.Parameters[key.substring(11)];
                    } else if (key.startsWith("TypeParameters.")) {
                        value = rawData.TypeParameters[key.substring(15)];
                    } else if (
                        key !== "Parameters" &&
                        key !== "TypeParameters"
                    ) {
                        value = rawData[key];
                    }

                    if (typeof value !== "object") {
                        rawTableHtml += `<tr><td>${key}</td><td>${value}</td></tr>`;
                    }
                });

            rawTableHtml += "</tbody></table>";
            rawElementPropsContainer.innerHTML += rawTableHtml;
        } else {
            rawElementPropsContainer.innerHTML =
                "<h5>BIM 원본 데이터</h5><p>연결된 원본 BIM 객체 정보를 찾을 수 없습니다.</p>";
        }
    } else {
        rawElementPropsContainer.innerHTML =
            "<h5>BIM 원본 데이터</h5><p>연계된 원본 BIM 객체가 없습니다. (수동 생성된 부재)</p>";
    }
}

/**
 * 선택된 수량산출부재에 할당된 일람부호의 상세 정보(속성 포함)를 화면 우측에 표시합니다.
 */
function renderQmMemberMarkDetails() {
    const container = document.getElementById(
        "qm-member-mark-details-container"
    );

    if (selectedQmIds.size !== 1) {
        container.innerHTML = "부재를 하나만 선택하세요.";
        return;
    }

    const selectedId = Array.from(selectedQmIds)[0];
    const member = loadedQuantityMembers.find((m) => m.id === selectedId);

    if (!member || !member.member_mark_id) {
        container.innerHTML = "할당된 일람부호가 없습니다.";
        return;
    }

    const mark = loadedMemberMarks.find((m) => m.id === member.member_mark_id);
    if (!mark) {
        container.innerHTML = "<p>일람부호 정보를 찾을 수 없습니다.</p>";
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
    tableHtml += "</tbody></table>";

    container.innerHTML = propertiesHtml + tableHtml;
}

/**
 * 선택된 QuantityMember에 연결된 RawElement의 속성을 렌더링합니다.
 */
function renderQmLinkedRawElementPropertiesTable() {
    const container = document.getElementById(
        "qm-linked-raw-element-properties-container"
    );

    if (selectedQmIds.size !== 1) {
        container.innerHTML =
            "<p>부재를 하나만 선택하면 원본 데이터가 표시됩니다.</p>";
        return;
    }

    const selectedId = Array.from(selectedQmIds)[0];
    const member = loadedQuantityMembers.find((m) => m.id === selectedId);

    if (!member || !member.raw_element_id) {
        container.innerHTML =
            "<p>연관된 BIM 원본 객체가 없습니다. (수동 생성된 부재)</p>";
        return;
    }

    const rawElement = allRevitData.find(
        (el) => el.id === member.raw_element_id
    );
    if (!rawElement || !rawElement.raw_data) {
        container.innerHTML =
            "<p>연결된 원본 BIM 객체 정보를 찾을 수 없습니다.</p>";
        return;
    }

    const rawData = rawElement.raw_data;
    let headerHtml = `<h5>${rawData.Name || "이름 없음"} (${
        rawData.Category || ""
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
            if (key.startsWith("Parameters.")) {
                value = rawData.Parameters[key.substring(11)];
            } else if (key.startsWith("TypeParameters.")) {
                value = rawData.TypeParameters[key.substring(15)];
            } else if (key !== "Parameters" && key !== "TypeParameters") {
                value = rawData[key];
            }

            if (value !== undefined && typeof value !== "object") {
                tableHtml += `<tr><td>${key}</td><td>${value}</td></tr>`;
            }
        });

    tableHtml += "</tbody></table>";
    container.innerHTML = headerHtml + tableHtml;
}

/**
 * '일람부호 할당 룰셋' 데이터를 HTML 테이블 형태로 화면에 그립니다.
 * @param {Array} rules - 서버에서 받아온 룰셋 데이터 배열
 * @param {String} editId - 현재 편집 중인 규칙의 ID (새 규칙은 'new')
 */
function renderMemberMarkAssignmentRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        "member-mark-assignment-ruleset-table-container"
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
                    rule.name || ""
                }" placeholder="규칙 이름"></td>
                <td><textarea class="rule-conditions-input" placeholder='[{"parameter": "분류", "operator": "contains", "value": "기둥"}]'>${JSON.stringify(
                    rule.conditions || [],
                    null,
                    2
                )}</textarea></td>
                <td><input type="text" class="rule-expression-input" value="${
                    rule.mark_expression || ""
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
    if (editId === "new") tableHtml += renderRow({ id: "new" });
    if (rules.length === 0 && editId !== "new")
        tableHtml += '<tr><td colspan="5">정의된 규칙이 없습니다.</td></tr>';

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

/**
 * '공사코드 할당 룰셋' 데이터를 HTML 테이블 형태로 화면에 그립니다.
 */
function renderCostCodeAssignmentRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        "cost-code-assignment-ruleset-table-container"
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
                    rule.name || ""
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
    if (editId === "new") tableHtml += renderRow({ id: "new" });
    if (rules.length === 0 && editId !== "new")
        tableHtml += '<tr><td colspan="5">정의된 규칙이 없습니다.</td></tr>';

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

/* ui.js 파일에 있는 renderBoqTable 함수가 아래 코드와 완전히 동일한지 확인해주세요. */
/**
 * 서버로부터 받은 집계 데이터를 기반으로 동적인 BOQ 테이블을 렌더링합니다.
 * @param {Array} reportData - 중첩된 구조의 집계 데이터 배열
 * @param {Object} summaryData - 전체 합계 데이터
 */
function renderBoqTable(reportData, summaryData) {
    const container = document.getElementById("boq-table-container");

    if (!reportData || reportData.length === 0) {
        container.innerHTML =
            '<p style="padding: 20px;">집계할 데이터가 없습니다.</p>';
        return;
    }

    if (currentBoqColumns.length === 0) {
        boqColumnAliases = {};
        const selectedDisplayFields = Array.from(
            document.querySelectorAll(".boq-display-field-cb:checked")
        ).map((cb) => ({
            id: cb.value.replace(/__/g, "_"),
            label: cb.parentElement.textContent.trim(),
            isDynamic: true,
        }));

        currentBoqColumns = [
            { id: "name", label: "구분", isDynamic: false },
            { id: "quantity", label: "수량", isDynamic: false },
            { id: "count", label: "항목 수", isDynamic: false },
            ...selectedDisplayFields,
        ];
    }

    let tableHtml = `<table class="boq-table" data-table-data='${JSON.stringify(
        { report: reportData, summary: summaryData }
    )}'>
        <thead>
            <tr>`;

    currentBoqColumns.forEach((column) => {
        const displayName = boqColumnAliases[column.id] || column.label;
        tableHtml += `<th draggable="true" data-column-id="${column.id}">
                        ${displayName}
                        <i class="col-edit-btn">✏️</i>
                      </th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    // 재귀적으로 그룹 행을 렌더링하는 내부 함수
    function renderGroupNode(node) {
        const indent = node.level * 25;
        let rowTds = "";
        currentBoqColumns.forEach((column) => {
            let cellValue = "";
            switch (column.id) {
                case "name":
                    cellValue = `<td style="padding-left: ${indent + 10}px;">${
                        node.name
                    }</td>`;
                    break;
                case "quantity":
                    cellValue = `<td>${node.quantity.toFixed(4)}</td>`;
                    break;
                case "count":
                    cellValue = `<td>${node.count}</td>`;
                    break;
                default:
                    cellValue = `<td>${
                        node.display_values[column.id] || ""
                    }</td>`;
                    break;
            }
            rowTds += cellValue;
        });

        // [핵심 확인!] 아래 tr 태그에 data-item-ids 속성이 포함되어야 합니다.
        tableHtml += `<tr class="boq-group-header group-level-${
            node.level
        }" data-item-ids='${JSON.stringify(node.item_ids)}'>${rowTds}</tr>`;

        if (node.children && node.children.length > 0) {
            node.children.forEach(renderGroupNode);
        }
    }

    reportData.forEach(renderGroupNode);

    let footerTds = "";
    currentBoqColumns.forEach((column) => {
        let cellValue = "";
        switch (column.id) {
            case "name":
                cellValue = "<td>총계</td>";
                break;
            case "quantity":
                cellValue = "<td></td>";
                break;
            case "count":
                cellValue = `<td>${summaryData.total_count}</td>`;
                break;
            default:
                cellValue = "<td></td>";
                break;
        }
        footerTds += cellValue;
    });

    tableHtml += `</tbody>
            <tfoot>
                <tr class="boq-summary-row">${footerTds}</tr>
            </tfoot>
        </table>`;

    container.innerHTML = tableHtml;
}

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
    const container = document.getElementById("boq-display-fields-container");
    if (!fields || fields.length === 0) {
        container.innerHTML =
            "<small>표시할 필드를 불러올 수 없습니다.</small>";
        return;
    }

    // '수량'과 '항목 수'는 기본 표시 항목이므로 체크박스 목록에서는 제외합니다.
    const creatableFields = fields.filter(
        (f) => f.value !== "quantity" && f.value !== "count"
    );

    container.innerHTML = creatableFields
        .map(
            (field) => `
        <label>
            <input type="checkbox" class="boq-display-field-cb" value="${field.value}">
            ${field.label}
        </label>
    `
        )
        .join("");
}

// connections/static/connections/ui.js

// 파일 맨 아래에 아래 함수 전체를 추가해주세요.

/**
 * BOQ 탭에서 집계 결과에 함께 표시할 필드를 선택하는 체크박스 UI를 생성합니다.
 * @param {Array} fields - 서버에서 받은 표시 가능한 필드 목록
 */
function renderBoqDisplayFieldControls(fields) {
    const container = document.getElementById("boq-display-fields-container");
    if (!fields || fields.length === 0) {
        container.innerHTML =
            "<small>표시할 필드를 불러올 수 없습니다.</small>";
        return;
    }

    // '수량'과 '항목 수'는 기본 표시 항목이므로 체크박스 목록에서는 제외합니다.
    const creatableFields = fields.filter(
        (f) => f.value !== "quantity" && f.value !== "count"
    );

    container.innerHTML = creatableFields
        .map(
            (field) => `
        <label>
            <input type="checkbox" class="boq-display-field-cb" value="${field.value}">
            ${field.label}
        </label>
    `
        )
        .join("");
}
/**
 * [수정됨] 현재 활성화된 탭 컨텍스트에 따라 올바른 위치에 BIM 속성 테이블을 렌더링합니다.
 * @param {string} contextPrefix - 'data-management' 또는 'space-management'
 */
function renderBimPropertiesTable(contextPrefix) {
    // 1. [핵심 수정] contextPrefix에 따라 올바른 컨테이너 ID를 선택합니다.
    const containerId =
        contextPrefix === "space-management"
            ? "sm-selected-bim-properties-container"
            : "selected-bim-properties-container";
    const container = document.getElementById(containerId);

    const state = viewerStates[contextPrefix];

    if (!container || !state) return;

    // 2. 이하 로직은 기존과 동일합니다.
    if (state.selectedElementIds.size !== 1) {
        container.innerHTML =
            "<p>BIM 속성을 보려면 테이블에서 하나의 항목만 선택하세요.</p>";
        return;
    }

    const selectedId = state.selectedElementIds.values().next().value;
    const selectedItem = allRevitData.find((item) => item.id === selectedId);

    if (!selectedItem || !selectedItem.raw_data) {
        container.innerHTML =
            "<p>선택된 항목의 BIM 원본 데이터를 찾을 수 없습니다.</p>";
        return;
    }

    const properties = [];
    const rawData = selectedItem.raw_data;
    for (const key in rawData) {
        if (key === "Parameters" && typeof rawData[key] === "object") {
            for (const paramKey in rawData[key]) {
                properties.push({
                    key: paramKey,
                    value: rawData[key][paramKey],
                    source: "Parameters",
                });
            }
        } else if (
            key === "TypeParameters" &&
            typeof rawData[key] === "object"
        ) {
            for (const paramKey in rawData[key]) {
                properties.push({
                    key: paramKey,
                    value: rawData[key][paramKey],
                    source: "TypeParameters",
                });
            }
        } else if (typeof rawData[key] !== "object") {
            properties.push({ key: key, value: rawData[key], source: "Root" });
        }
    }
    properties.sort((a, b) => a.key.localeCompare(b.key));

    let tableHtml = `<table class="properties-table"><thead><tr><th style="width: 40%;">속성 (Property)</th><th>값 (Value)</th></tr></thead><tbody>`;
    if (properties.length === 0) {
        tableHtml += '<tr><td colspan="2">표시할 속성이 없습니다.</td></tr>';
    } else {
        properties.forEach((prop) => {
            tableHtml += `<tr><td>${prop.key}</td><td>${prop.value}</td></tr>`;
        });
    }
    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

function renderAssignedTagsTable(contextPrefix) {
    const listContainer = document.getElementById("selected-tags-list");
    const state = viewerStates[contextPrefix];

    if (!listContainer || !state) return;

    if (state.selectedElementIds.size === 0) {
        listContainer.innerHTML = "항목을 선택하세요.";
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
        listContainer.innerHTML = "할당된 분류가 없습니다.";
        return;
    }

    listContainer.innerHTML = Array.from(assignedTags)
        .sort()
        .map((tag) => `<div>${tag}</div>`)
        .join("");
}
/**
 * [수정] '선택항목 분류' 탭의 내용을 렌더링하는 범용 함수
 * @param {string} contextPrefix
 */
function renderAssignedTagsTable(contextPrefix) {
    const listContainer = document.getElementById("selected-tags-list");
    const state = viewerStates[contextPrefix];

    if (!listContainer || !state) return;

    if (state.selectedElementIds.size === 0) {
        listContainer.innerHTML = "항목을 선택하세요.";
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
        listContainer.innerHTML = "할당된 분류가 없습니다.";
        return;
    }

    listContainer.innerHTML = Array.from(assignedTags)
        .sort()
        .map((tag) => `<div>${tag}</div>`)
        .join("");
}
/**
 * 서버에서 받은 공간분류 데이터를 위계적인 HTML 트리로 렌더링합니다.
 * @param {Array} spaces - 프로젝트의 모든 공간분류 데이터 배열
 */
function renderSpaceClassificationTree(spaces) {
    const container = document.getElementById("space-tree-container");
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하세요.</p>";
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
        if (nodes.length === 0) return "";
        let html = "<ul>";
        nodes.forEach((node) => {
            const count = node.mapped_elements_count || 0;
            // ▼▼▼ [핵심 수정] span 태그에 view-assigned-btn 클래스를 추가합니다. ▼▼▼
            const countBadge =
                count > 0
                    ? `<span class="element-count-badge view-assigned-btn" title="할당된 객체 보기">${count}</span>`
                    : "";

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
        html += "</ul>";
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
    const title = document.getElementById("assigned-elements-modal-title");
    const container = document.getElementById(
        "assigned-elements-table-container"
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
            getValueForItem(item, "Name") || `객체 (ID: ${item.id})`;

        // 각 객체를 구분하기 위한 헤더 행을 추가합니다.
        tableHtml += `
            <tr class="group-header" data-element-id="${item.id}">
                <td style="text-align: center;"><input type="checkbox" class="unassign-checkbox" value="${item.id}"></td>
                <td colspan="2"><strong>${elementName}</strong></td>
            </tr>
        `;

        // 해당 객체의 모든 속성을 수집합니다.
        const properties = [];
        const systemKeys = ["id", "element_unique_id", "classification_tags"];
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
                if (k !== "Parameters" && k !== "TypeParameters")
                    revitKeysSet.add(k);
            });
        }

        const allKeys = [...systemKeys, ...Array.from(revitKeysSet).sort()];

        // 속성 이름과 값을 테이블 행으로 추가합니다.
        allKeys.forEach((key) => {
            const value = getValueForItem(item, key);
            // 값이 있는 속성만 표시합니다.
            if (value !== "" && value !== null && value !== undefined) {
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

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

/**
 * '공간분류 생성 룰셋' 데이터를 HTML 테이블 형태로 화면에 그립니다.
 * @param {Array} rules - 서버에서 받아온 룰셋 데이터 배열
 * @param {String} editId - 현재 편집 중인 규칙의 ID (새 규칙은 'new')
 */
function renderSpaceClassificationRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        "space-classification-ruleset-table-container"
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
                    rule.level_name || ""
                }" placeholder="예: Building"></td>
                <td><textarea class="rule-bim-filter-input" placeholder='{"parameter": "IfcEntityType", "value": "IfcBuilding"}' rows="3">${JSON.stringify(
                    rule.bim_object_filter || {},
                    null,
                    2
                )}</textarea></td>
                <td><input type="text" class="rule-name-source-input" value="${
                    rule.name_source_param || ""
                }" placeholder="예: Name"></td>
                <td><input type="text" class="rule-parent-join-input" value="${
                    rule.parent_join_param || ""
                }" placeholder="예: GlobalId"></td>
                <td><input type="text" class="rule-child-join-input" value="${
                    rule.child_join_param || ""
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

    if (editId === "new") {
        const newLevel =
            rules.length > 0
                ? Math.max(...rules.map((r) => r.level_depth)) + 1
                : 0;
        tableHtml += renderRow({ id: "new", level_depth: newLevel });
    }

    if (rules.length === 0 && editId !== "new") {
        tableHtml += '<tr><td colspan="7">정의된 규칙이 없습니다.</td></tr>';
    }

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}

// ▼▼▼ [추가] 공간분류 할당 룰셋 테이블 렌더링 함수 ▼▼▼
function renderSpaceAssignmentRulesetTable(rules, editId = null) {
    const container = document.getElementById(
        "space-assignment-ruleset-table-container"
    );
    if (!currentProjectId) {
        container.innerHTML = "<p>프로젝트를 선택하세요.</p>";
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
                    rule.name || ""
                }" placeholder="규칙 이름"></td>
                <td><textarea class="rule-member-filter-input" placeholder="(선택사항) 부재 필터링 조건 입력">${JSON.stringify(
                    rule.member_filter_conditions || [],
                    null,
                    2
                )}</textarea></td>
                <td><input type="text" class="rule-member-join-input" value="${
                    rule.member_join_property || ""
                }" placeholder="예: BIM원본.참조 레벨"></td>
                <td><input type="text" class="rule-space-join-input" value="${
                    rule.space_join_property || ""
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
    if (editId === "new") tableHtml += renderRow({ id: "new" });
    if (rules.length === 0 && editId !== "new")
        tableHtml += '<tr><td colspan="6">정의된 규칙이 없습니다.</td></tr>';

    tableHtml += "</tbody></table>";
    container.innerHTML = tableHtml;
}
