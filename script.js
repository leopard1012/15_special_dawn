document.addEventListener('DOMContentLoaded', () => {
    // --- 설정 ---
    // !!! 중요 !!!: 여기에 위에서 배포하고 복사한 Google Apps Script 웹 앱 URL을 붙여넣으세요!
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfaIB0Ebfdp4eRs-vwAdDat3ehedS4QsBq-Y7ejc9iV2Mb-MWJlZtf2LLBcpVU8iCMiA/exec';
    // !!! 중요 !!!: URL이 정확하지 않으면 작동하지 않습니다! 'YOUR_..._HERE' 부분을 실제 URL로 바꿔주세요.

    // URL 설정 확인
    // if (APPS_SCRIPT_URL === 'https://script.google.com/macros/s/AKfycbwO5VQDm4bllhMERnFjNVIO0P0QC8TtbjOe2sTQ6rIeEdEGSgx2PkpoYTLBPQTf7ps/exec' || !APPS_SCRIPT_URL) {
    //     alert("스크립트 설정 오류: Apps Script 웹 앱 URL이 script.js 파일에 설정되지 않았습니다! 관리자에게 문의하세요.");
    //     // 사용자에게 오류 상태 표시
    //     const statusMessage = document.getElementById('status-message');
    //     if(statusMessage) {
    //         statusMessage.textContent = "설정 오류: 관리자에게 문의하세요 (Apps Script URL 누락).";
    //         statusMessage.className = 'error';
    //     }
    //     // 치명적 오류이므로 이후 코드 실행 중단
    //     console.error("Apps Script URL이 설정되지 않았습니다!");         
    //     return;
    // }

    // --- 상태 변수 ---
    let mokjaDataCache = null; // 목자 데이터 캐시 (API 호출 줄이기 위함)
    let currentMembers = []; // 현재 선택된 목장의 구성원 이름 배열
    let currentAttendanceData = {}; // 현재 화면에 로드된 출석 데이터 객체

    // --- DOM 요소 참조 ---
    // (이전 코드와 동일)
    const regionSelect = document.getElementById('region-select');
    const groupSelect = document.getElementById('group-select');
    const mokjangSelect = document.getElementById('mokjang-select');
    // const yearSelect = document.getElementById('year-select');
    // const monthSelect = document.getElementById('month-select');
    const viewAttendanceBtn = document.getElementById('view-attendance-btn');
    const selectionError = document.getElementById('selection-error');
    const selectionPage = document.getElementById('selection-page');
    const attendancePage = document.getElementById('attendance-page');
    const attendanceHeader = document.getElementById('attendance-header');
    const backBtn = document.getElementById('back-to-selection-btn');
    const tableContainer = document.getElementById('attendance-table-container');
    const saveBtn = document.getElementById('save-attendance-btn');
    const statusMessage = document.getElementById('status-message');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- 상수 ---
    const ATTENDANCE_STATES = {
        ABSENT: 0,  // 미출석
        ONLINE: 1,  // 비대면 출석
        IN_PERSON: 2 // 대면 출석
    };

    // --- 초기화 함수 ---
    async function init() {
        console.log("애플리케이션 초기화 시작...");
        showLoadingMessage("초기 설정 로딩 중..."); // 로딩 표시
        // populateYearMonthSelectors(); // 연/월 드롭다운 채우기
        setupEventListeners(); // 이벤트 리스너 설정

        try {
            // 시작 시 목자 데이터 미리 로드 (API 호출)
            await fetchMokjaData();
            populateRegionDropdown(); // 지역 드롭다운 채우기
            regionSelect.disabled = false; // 지역 선택 활성화
            hideLoadingMessage(); // 로딩 메시지 숨기기
            console.log("초기화 완료.");
        } catch (error) {
            console.error("초기화 중 오류 발생:", error);
            // 사용자에게 오류 메시지 표시
            showErrorMessage(`초기 데이터 로딩 실패: ${error.message}. 페이지를 새로고침 해보세요.`);
        }
    }

    // 연도 및 월 선택 드롭다운 채우기 (변경 없음)
    // function populateYearMonthSelectors() {
    //     const currentYear = new Date().getFullYear();
    //     for (let i = currentYear + 2; i >= currentYear - 5; i--) {
    //         const option = document.createElement('option'); option.value = i; option.textContent = `${i}년`; yearSelect.appendChild(option);
    //     }
    //     yearSelect.value = currentYear;
    //     for (let i = 1; i <= 12; i++) {
    //         const option = document.createElement('option'); option.value = i; option.textContent = `${i}월`; monthSelect.appendChild(option);
    //     }
    //     monthSelect.value = new Date().getMonth() + 1;
    // }

    // 이벤트 리스너 설정 (변경 없음)
    function setupEventListeners() {
        regionSelect.addEventListener('change', handleRegionChange);
        groupSelect.addEventListener('change', handleGroupChange);
        mokjangSelect.addEventListener('change', checkSelections);
        // yearSelect.addEventListener('change', checkSelections);
        // monthSelect.addEventListener('change', checkSelections);
        viewAttendanceBtn.addEventListener('click', showAttendance);
        backBtn.addEventListener('click', showSelectionPage);
        saveBtn.addEventListener('click', saveAttendance);
        tableContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('attendance-checkbox')) {
                handleCheckboxClick(event.target);
            }
        });
    }

    // --- 데이터 가져오기 (Apps Script 호출) ---

    /**
     * Google Apps Script를 호출하여 데이터를 가져오는 범용 비동기 함수
     * @param {string} action 수행할 작업 식별자
     * @param {object} params URL 쿼리 파라미터로 전달할 객체 (선택 사항)
     * @returns {Promise<any>} Apps Script에서 반환된 데이터 (JSON 파싱됨)
     * @throws {Error} 네트워크 오류 또는 Apps Script 오류 발생 시
     */
    async function fetchDataFromAppsScript(action, params = {}) {
        showGlobalSpinner();

        try {
            const url = new URL(APPS_SCRIPT_URL);
            url.searchParams.append('action', action);
            for (const key in params) {
                // 파라미터 값이 배열이나 객체일 경우 JSON 문자열로 변환
                const value = typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key];
                url.searchParams.append(key, value);
            }

            console.log(`Apps Script 호출 (${action}): ${url.toString()}`); // 호출 URL 로그

            const response = await fetch(url);

            if (!response.ok) {
                // 서버 응답 코드가 200-299 범위가 아닐 때
                const errorText = await response.text(); // 오류 응답 내용 확인 시도
                console.error(`서버 응답 오류 (${response.status}): ${errorText}`);
                throw new Error(`서버 응답 오류: ${response.status} ${response.statusText}`);
            }

            const result = await response.json(); // 응답 본문을 JSON으로 파싱

            if (!result.success) {
                // Apps Script에서 success: false 와 함께 오류 메시지를 보낸 경우
                console.error("Apps Script 오류:", result.error);
                throw new Error(result.error || "Apps Script에서 알 수 없는 오류 발생");
            }

            console.log(`Apps Script 응답 (${action}):`, result.data);
            return result.data; // 성공 시 data 필드 반환
        } catch (error) {
            console.error(`WorkspaceDataFromAppsScript (${action}) 실패:`, error);
            throw error; // 에러를 다시 던져 호출한 함수에서 처리할 수 있도록 함
        } finally {
            hideGlobalSpinner(); // <<< 스피너 숨김
        }
    }

    // '목자' 시트 데이터 가져오기 (캐시 활용)
    async function fetchMokjaData() {
        if (mokjaDataCache) { // 캐시에 데이터가 있으면
            console.log("캐시된 목자 데이터 사용");
            return mokjaDataCache; // 캐시된 데이터 반환
        }
        console.log("Apps Script에서 목자 데이터 로딩 중...");
        mokjaDataCache = await fetchDataFromAppsScript('getMokjaData'); // API 호출
        return mokjaDataCache;
    }

    // 특정 목장의 구성원 명단 가져오기
    async function fetchMembers(region, group, mokja) {
        console.log(`'${region}-${group}-${mokja}' 목장 명단 로딩 중 (Apps Script)...`);
        return await fetchDataFromAppsScript('getMembers', { region, group, mokja });
    }

    // 특정 연/월의 출석 데이터 가져오기
    async function fetchAttendanceData(members) {
        console.log(`출석 데이터 로딩 중 (Apps Script)...`);
        if (!members || members.length === 0) {
            console.log("출석 데이터 조회: 멤버 목록이 비어있어 조회를 건너<0xEB><0x84><0x91>니다.");
            return {}; // 멤버 없으면 빈 데이터 반환
        }
        // members 배열은 fetchDataFromAppsScript 함수 내에서 자동으로 JSON 문자열화됨
        return await fetchDataFromAppsScript('getAttendanceData', { members });
    }


    // --- 드롭다운 로직 ---
    // (populateDropdown, populateRegionDropdown, handleRegionChange, handleGroupChange, checkSelections 함수는 이전 코드와 동일하게 유지)
    function populateDropdown(selectElement, options, defaultOptionText, isMokjang = false) {
        selectElement.innerHTML = `<option value="">-- ${defaultOptionText} --</option>`;
        options.forEach(optionValue => {
            const option = document.createElement('option'); option.value = optionValue;
            if (isMokjang) { option.textContent = `${optionValue} 목장`; option.dataset.mokja = optionValue; }
            else { option.textContent = optionValue; }
            selectElement.appendChild(option);
        });
        selectElement.disabled = false;
    }
    function populateRegionDropdown() {
        if (!mokjaDataCache) { console.error("지역 목록 로드 실패: 목자 데이터 캐시 없음."); showErrorMessage("초기 데이터 로딩 오류. 새로고침 해주세요."); return; }
        const regions = [...new Set(mokjaDataCache.map(row => row[0]))].sort();
        populateDropdown(regionSelect, regions, '지역 선택');
    }
    function handleRegionChange() {
        const selectedRegion = regionSelect.value;
        groupSelect.innerHTML = '<option value="">-- 조 선택 --</option>'; groupSelect.disabled = true;
        mokjangSelect.innerHTML = '<option value="">-- 목장 선택 --</option>'; mokjangSelect.disabled = true;
        if (selectedRegion && mokjaDataCache) {
            const groups = [...new Set(mokjaDataCache.filter(row => row[0] === selectedRegion).map(row => row[1]))].sort();
            populateDropdown(groupSelect, groups, '조 선택');
        }
        checkSelections();
    }
    function handleGroupChange() {
        const selectedRegion = regionSelect.value; const selectedGroup = groupSelect.value;
        mokjangSelect.innerHTML = '<option value="">-- 목장 선택 --</option>'; mokjangSelect.disabled = true;
        if (selectedRegion && selectedGroup && mokjaDataCache) {
            const mokjas = [...new Set(mokjaDataCache.filter(row => row[0] === selectedRegion && row[1] === selectedGroup).map(row => row[2]))].sort();
            populateDropdown(mokjangSelect, mokjas, '목장 선택', true);
        }
        checkSelections();
    }
    function checkSelections() {
        const allSelected = regionSelect.value && groupSelect.value && mokjangSelect.value; // && yearSelect.value && monthSelect.value;
        viewAttendanceBtn.disabled = !allSelected;
        selectionError.textContent = '';
    }


    // --- 출석 현황 표시 로직 ---
    // (showSelectionPage, calculateSundays, createAttendanceTable, handleCheckboxClick 함수는 이전 코드와 거의 동일하게 유지)
    function showSelectionPage() {
        attendancePage.style.display = 'none'; selectionPage.style.display = 'block'; clearStatusMessage();
    }
    async function showAttendance() {
        // 선택된 값 가져오기
        const region = regionSelect.value; const group = groupSelect.value;
        const selectedMokjangOption = mokjangSelect.options[mokjangSelect.selectedIndex];
        const mokja = selectedMokjangOption.dataset.mokja; const mokjangDisplayName = selectedMokjangOption.text;
        // const year = yearSelect.value; const month = monthSelect.value;

        if (!region || !group || !mokja) { selectionError.textContent = "모든 항목을 선택해주세요."; return; }

        // 화면 전환 및 로딩 표시
        selectionPage.style.display = 'none'; attendancePage.style.display = 'block';
        attendanceHeader.textContent = `${region} ${group} ${mokjangDisplayName} 출석 현황`;
        tableContainer.innerHTML = ''; // 이전 테이블 내용 삭제
        showLoadingMessage("출석 데이터 로딩 중...", tableContainer);
        saveBtn.disabled = true; clearStatusMessage();

        try {
            // 데이터 로드 (Apps Script 호출)
            currentMembers = await fetchMembers(region, group, mokja);
            if (!currentMembers || currentMembers.length === 0) { showInfoMessage('선택된 목장에 해당하는 명단이 없습니다.', tableContainer); return; }

            const spdays = calculateSpecialdays(); // 'M/D' 형식
            if (spdays.length === 0) { showInfoMessage('선택된 월에 일요일이 없습니다.', tableContainer); return; }

            currentAttendanceData = await fetchAttendanceData(currentMembers); // Apps Script 호출

            // 테이블 생성
            hideLoadingMessage(tableContainer);
            createAttendanceTable(currentMembers, spdays, currentAttendanceData);
            saveBtn.disabled = false; // 저장 버튼 활성화
            console.log("출석 테이블 표시 완료.");

        } catch (error) {
            console.error("출석 데이터 표시 중 오류:", error);
            hideLoadingMessage(tableContainer);
            showErrorMessage(`출석 데이터 로딩 실패: ${error.message}`, tableContainer);
            clearStatusMessage();
        }
    }
    function calculateSpecialdays() { // M/D 형식 반환 (변경 없음)
        const spdays = []; 
        const date = new Date(2025, 8, 25);
        for (let days = 0; days < 21; days++) {
            let newDate = new Date(date.getTime());
            newDate.setDate(newDate.getDate() + days);
            // date.setDate(date.getDate + day);
            // spdays.push(newDate.toLocaleDateString('ko-KR'));
            let month = newDate.getMonth();
            let day = newDate.getDate();
            spdays.push(`${month}/${day}`);
        }
        return spdays;
    }
    function createAttendanceTable(members, spdays, attendanceData) {
        const table = document.createElement('table'); 
        table.id = 'attendance-table'; 
        // table.classList.add('attendance-table');
        const thead = table.createTHead(); 
        const headerRow = thead.insertRow();
        const cornerTh = document.createElement('th');
        // headerRow.insertCell();
        cornerTh.textContent = '이름/날짜';
        headerRow.appendChild(cornerTh);

        spdays.forEach(sundayDate => {
            const th = document.createElement('th'); 
            th.textContent = sundayDate; 
            headerRow.appendChild(th); 
        });

        const tbody = table.createTBody();
        members.forEach(memberName => {
            const row = tbody.insertRow(); 
            row.insertCell().textContent = memberName;
            spdays.forEach(sundayDate => {
                const cell = row.insertCell(); const checkbox = document.createElement('div');
                checkbox.classList.add('attendance-checkbox'); checkbox.dataset.name = memberName; checkbox.dataset.date = sundayDate;
                let initialState = ATTENDANCE_STATES.ABSENT;
                if (attendanceData[memberName] && attendanceData[memberName][sundayDate] !== undefined) {
                    initialState = Number(attendanceData[memberName][sundayDate]); // Apps Script가 0,1,2 반환
                }
                checkbox.dataset.state = initialState;
                cell.appendChild(checkbox);
            });
        });
        tableContainer.innerHTML = ''; tableContainer.appendChild(table);
    }
    function handleCheckboxClick(checkboxElement) { // (변경 없음)
        // 1번 선택은 비대면, 2번선택은 대면
        // let currentState = parseInt(checkboxElement.dataset.state); let nextState = (currentState + 1) % 3;

        let currentState = parseInt(checkboxElement.dataset.state);
        let nextState;

        // 상태 전환 로직 변경
        // 0 (불참) -> 2 (대면) -> 1 (비대면) -> 0 (불참)
        if (currentState === ATTENDANCE_STATES.ABSENT) { // 현재 상태: 불참 (0)
            nextState = ATTENDANCE_STATES.IN_PERSON;     // 다음 상태: 대면 참석 (2)
        } else if (currentState === ATTENDANCE_STATES.IN_PERSON) { // 현재 상태: 대면 참석 (2)
            nextState = ATTENDANCE_STATES.ONLINE;        // 다음 상태: 비대면 참석 (1)
        } else if (currentState === ATTENDANCE_STATES.ONLINE) { // 현재 상태: 비대면 참석 (1)
            nextState = ATTENDANCE_STATES.ABSENT;        // 다음 상태: 불참 (0)
        } else {
            // 예외 처리: 혹시 모를 다른 상태 값일 경우 불참(0)으로 초기화
            nextState = ATTENDANCE_STATES.ABSENT;
        }
        
        checkboxElement.dataset.state = nextState;
        console.log(`체크박스 변경: 이름=${checkboxElement.dataset.name}, 날짜=${checkboxElement.dataset.date}, 새 상태=${nextState}`);
    }


    // --- 저장 로직 (Apps Script 호출) ---
    async function saveAttendance() {
        console.log("저장 버튼 클릭됨. 데이터 수집 시작...");
        saveBtn.disabled = true; // 저장 시작 시 버튼 비활성화
        showLoadingMessage("저장 중..."); // 로딩 메시지 표시

        const table = document.getElementById('attendance-table');
        if (!table) { showErrorMessage('오류: 저장할 테이블이 없습니다.'); saveBtn.disabled = false; return; }

        // const year = yearSelect.value;
        // const month = monthSelect.value;

        // 테이블에서 현재 상태 데이터 수집 {'이름': {'M/D': 상태코드, ...}}
        const dataToSave = {};
        const checkboxes = table.querySelectorAll('.attendance-checkbox');
        checkboxes.forEach(cb => {
            const name = cb.dataset.name; const date = cb.dataset.date; const state = parseInt(cb.dataset.state);
            if (!dataToSave[name]) { dataToSave[name] = {}; }
            dataToSave[name][date] = state;
        });

        // Apps Script로 보낼 최종 데이터 객체
        const payload = {
            // year: parseInt(year),
            // month: parseInt(month),
            dataToSave: dataToSave // 수집된 데이터 포함
        };

        console.log("Apps Script로 전송할 데이터:", payload);

        try {
            // Apps Script에 POST 요청 보내기
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                // 'Content-Type': 'application/json' 헤더는 fetch가 자동으로 body 타입에 맞춰 설정하는 경우가 많음.
                // Apps Script doPost는 e.postData.contents를 사용하므로 text/plain이나 application/json 모두 처리 가능.
                // 명시적으로 설정: headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload) // JavaScript 객체를 JSON 문자열로 변환하여 body에 담음
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`서버 응답 오류 (${response.status}): ${errorText}`);
                throw new Error(`서버 응답 오류: ${response.status} ${response.statusText}`);
            }

            // Apps Script로부터 받은 응답(JSON) 처리
            const result = await response.json();
            console.log("Apps Script 저장 응답:", result);

            if (result.success) { // Apps Script에서 success: true를 반환하면
                showSuccessMessage(result.message || "성공적으로 저장되었습니다!");
                // 저장 성공 후, 로컬 데이터 캐시 업데이트 (선택 사항)
                currentAttendanceData = dataToSave;
            } else { // Apps Script에서 success: false 또는 오류 메시지를 반환하면
                throw new Error(result.error || "Apps Script에서 저장 중 오류 발생");
            }

        } catch (error) { // 네트워크 오류 또는 Apps Script 처리 중 예외 발생 시
            console.error("저장 작업 중 오류 발생:", error);
            showErrorMessage(`저장 실패: ${error.message}`);
        } finally {
            // 성공/실패 여부와 관계 없이 로딩 메시지 숨기고 버튼 다시 활성화
            hideLoadingMessage();
            saveBtn.disabled = false;
        }
    }

    // --- 유틸리티 함수 (메시지 표시 등) ---
    // (showLoadingMessage, hideLoadingMessage, showErrorMessage, showSuccessMessage, showInfoMessage, clearStatusMessage 함수는 이전 코드와 동일하게 유지)
     function showLoadingMessage(message, container = statusMessage) {
        if(container === statusMessage) { container.textContent = message; container.className = 'loading'; }
        else { container.innerHTML = `<p class="loading">${message}</p>`; }
    }
    function hideLoadingMessage(container = statusMessage) {
         if(container === statusMessage) { if (container.classList.contains('loading')) { container.textContent = ''; container.className = ''; } }
         else { const loadingElement = container.querySelector('p.loading'); if (loadingElement) { loadingElement.remove(); } }
    }
    function showErrorMessage(message, container = statusMessage) {
         if(container === statusMessage) { container.textContent = message; container.className = 'error'; }
         else { container.innerHTML = `<p class="error-message">${message}</p>`; }
    }
    function showSuccessMessage(message) { statusMessage.textContent = message; statusMessage.className = 'success'; }
    function showInfoMessage(message, container = tableContainer ) { container.innerHTML = `<p>${message}</p>`; }
    function clearStatusMessage() { statusMessage.textContent = ''; statusMessage.className = ''; }

    function showGlobalSpinner() {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
    }
    
    function hideGlobalSpinner() {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    // --- 애플리케이션 시작 ---
    init(); // 초기화 함수 호출

});