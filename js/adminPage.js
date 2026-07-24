import { BUDGET_RULES } from "./config.js?v=14";
import "./companyAuth.js?v=6";
import {
  applyDueElection,
  deleteProjectAsAdmin,
  endGame,
  getGlobalTerraforming,
  getState,
  initializeSharedState,
  processResourceShipments,
  resetState,
  skipRankGrantInterval,
  toggleTimePaused
} from "./dataStore.js?v=21";
import { impactClass, money, outcomeClass, percent, signedPercent } from "./aiEvaluator.js?v=16";

const ADMIN_PASSWORD = "bojeong09";

const loginPanel = document.querySelector("#loginPanel");
const adminDashboard = document.querySelector("#adminDashboard");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const loginMessage = document.querySelector("#loginMessage");
const adminActionMessage = document.querySelector("#adminActionMessage");
const adminSummary = document.querySelector("#adminSummary");
const adminCompanyList = document.querySelector("#adminCompanyList");
const toggleTimeButton = document.querySelector("#toggleTimeButton");
const skipGrantButton = document.querySelector("#skipGrantButton");
const endGameButton = document.querySelector("#endGameButton");
const deleteConfirmPanel = document.querySelector("#deleteConfirmPanel");
const deleteConfirmMessage = document.querySelector("#deleteConfirmMessage");
const cancelDeleteButton = document.querySelector("#cancelDeleteButton");
const confirmDeleteButton = document.querySelector("#confirmDeleteButton");
const requestResetButton = document.querySelector("#requestResetButton");
const resetConfirmPanel = document.querySelector("#resetConfirmPanel");
const cancelResetButton = document.querySelector("#cancelResetButton");
const confirmResetButton = document.querySelector("#confirmResetButton");

const formatDate = (date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));

const companyNameMarkup = (company) => `
  <span class="company-name-ko">${company.name}</span>
  ${company.englishName && company.englishName !== company.name ? `<span class="company-name-en">${company.englishName}</span>` : ""}
`;

const escapeAttribute = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

let pendingDelete = null;

const projectMarkup = (project) => `
  <article class="admin-project-item ${outcomeClass(project.evaluation)}">
    <div>
      <time>${formatDate(project.createdAt)}</time>
      <h3>${project.name}</h3>
      <strong class="project-outcome-text">${project.evaluation.outcome?.label || "성공"}</strong>
      <p>${project.tech}</p>
    </div>
    <dl>
      <div><dt>가격</dt><dd>${money(project.price)}</dd></div>
      <div><dt>가능성</dt><dd>${percent(project.evaluation.possibility, 1)}</dd></div>
      <div><dt>실패 확률</dt><dd>${percent(project.evaluation.failureProbability, 1)}</dd></div>
      <div><dt>기대효과 충당</dt><dd>${percent(project.evaluation.expectedEffectFulfillment, 1)}</dd></div>
      <div><dt>효과</dt><dd>${project.evaluation.projectScore}/10</dd></div>
      <div><dt>기여도</dt><dd class="impact-value ${impactClass(project.evaluation.totalContributionPercent)}">${signedPercent(project.evaluation.totalContributionPercent)}</dd></div>
    </dl>
    <div class="admin-project-effect project-breakdown">
      <p><strong>기대효과</strong>${project.expectedEffect || project.effect || ""}</p>
      <p><strong>신기술 실현 방식</strong>${project.realizationMethod || "기록 없음"}</p>
      <p><strong>적용 방식</strong>${project.applicationMethod || "기록 없음"}</p>
    </div>
    <button class="ghost-button danger-button admin-delete-project" type="button" data-delete-project="${project.id}" data-delete-company="${project.companyId}" data-delete-type="registered" data-delete-name="${escapeAttribute(project.name)}">삭제</button>
  </article>
`;

const companyMarkup = (company) => {
  const projects = company.projects || [];
  const pendingProjects = company.pendingProjects || [];
  const pendingMarkup = pendingProjects
    .map(
      (project) => `
        <article class="admin-project-item pending-project">
          <div>
            <time>${formatDate(project.createdAt)}</time>
            <h3>${project.name}</h3>
            <strong class="project-outcome-text">예비 상태</strong>
            <p>${project.tech}</p>
          </div>
          <dl>
            <div><dt>프로젝트 비용</dt><dd>${money(project.price)}</dd></div>
            <div><dt>자원 비용</dt><dd>${money(project.evaluation.resourceTotalCost || 0)}</dd></div>
            <div><dt>총 필요 비용</dt><dd>${money(project.evaluation.totalRequiredCost || project.price || 0)}</dd></div>
            <div><dt>가능성</dt><dd>${percent(project.evaluation.possibility, 1)}</dd></div>
            <div><dt>예상 기여도</dt><dd class="impact-value ${impactClass(project.evaluation.totalContributionPercent)}">${signedPercent(project.evaluation.totalContributionPercent)}</dd></div>
          </dl>
          <div class="admin-project-effect project-breakdown">
            <p><strong>필요 자원</strong>${(project.evaluation.resourceRequirements || [])
              .map((resource) => `${resource.label} ${resource.units}단위`)
              .join(" · ")}</p>
          </div>
          <button class="ghost-button danger-button admin-delete-project" type="button" data-delete-project="${project.id}" data-delete-company="${company.id}" data-delete-type="pending" data-delete-name="${escapeAttribute(project.name)}">삭제</button>
        </article>
      `
    )
    .join("");
  return `
    <section class="admin-company-card">
      <div class="admin-company-head">
        <span class="company-card-mark">${company.mark}</span>
        <div>
          <h2 class="company-name-stack">${companyNameMarkup(company)}</h2>
          <p>${company.feature}</p>
        </div>
      </div>
      <dl class="admin-company-stats">
        <div><dt>현재 예산</dt><dd>${money(company.budget)}</dd></div>
        <div><dt>총 기여도</dt><dd class="impact-value ${impactClass(company.contribution)}">${signedPercent(company.contribution)}</dd></div>
        <div><dt>인지도</dt><dd>${percent(company.awareness, 2)}</dd></div>
        <div><dt>프로젝트</dt><dd>${projects.length}개 / 예비 ${pendingProjects.length}개</dd></div>
        <div><dt>추가 가능</dt><dd>${Math.max(
          0,
          BUDGET_RULES.projectLimitPerFundingCycle - Number(company.projectAddsSinceFunding || 0)
        )}/${BUDGET_RULES.projectLimitPerFundingCycle}회</dd></div>
        <div><dt>획득 예산</dt><dd>${money(Number(company.governmentReceived || 0) + Number(company.rankGrantReceived || 0))}</dd></div>
      </dl>
      <div class="admin-project-list">
        ${pendingProjects.length || projects.length ? `${pendingMarkup}${projects.map(projectMarkup).join("")}` : `<div class="empty-state">아직 한 일이 없습니다.</div>`}
      </div>
    </section>
  `;
};

const renderAdmin = () => {
  processResourceShipments();
  applyDueElection();
  const state = getState();
  const pendingProjectCount = state.companies.reduce((sum, company) => sum + (company.pendingProjects || []).length, 0);
  const projectCount = state.projects.length;
  const totalFunding = state.companies.reduce(
    (sum, company) => sum + Number(company.governmentReceived || 0) + Number(company.rankGrantReceived || 0),
    0
  );
  const parliament = state.politics?.parliament;
  const chair = parliament?.chairCompanyId ? state.companies.find((company) => company.id === parliament.chairCompanyId) : null;
  const viceChair = parliament?.viceChairCompanyId
    ? state.companies.find((company) => company.id === parliament.viceChairCompanyId)
    : null;

  adminSummary.innerHTML = `
    <div><span>시간 상태</span><strong>${state.timeControl?.paused ? "정지" : "진행"}</strong></div>
    <div><span>전체 프로젝트</span><strong>${projectCount}개 / 예비 ${pendingProjectCount}개</strong></div>
    <div><span>종합 테라포밍</span><strong class="impact-value ${impactClass(getGlobalTerraforming(state))}">${signedPercent(getGlobalTerraforming(state))}</strong></div>
    <div><span>전체 획득 예산</span><strong>${money(totalFunding)}</strong></div>
    <div><span>의원장</span><strong>${chair ? chair.name : "없음"}</strong></div>
    <div><span>부의원장</span><strong>${viceChair ? viceChair.name : "없음"}</strong></div>
    <div><span>무소속 의석</span><strong>${parliament ? `${parliament.independentSeats || 0}석` : "0석"}</strong></div>
    <div><span>의원장 권한</span><strong>${parliament ? `${Math.max(0, 3 - Number(parliament.chairPowerUsed || 0))}/3회` : "0/3회"}</strong></div>
  `;
  toggleTimeButton.textContent = state.timeControl?.paused ? "시간재개" : "시간정지";
  adminCompanyList.innerHTML = state.companies.map(companyMarkup).join("");
  adminCompanyList.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      pendingDelete = {
        companyId: button.dataset.deleteCompany,
        projectId: button.dataset.deleteProject,
        type: button.dataset.deleteType,
        name: button.dataset.deleteName
      };
      deleteConfirmMessage.textContent = `"${pendingDelete.name}" 프로젝트를 삭제할까요? 삭제하면 예산, 지원금, 기대 효과, 기여도 등 수치가 프로젝트가 없던 상태로 되돌아갑니다.`;
      deleteConfirmPanel.classList.remove("is-hidden");
      deleteConfirmPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
};

const enterAdmin = () => {
  loginPanel.classList.add("is-hidden");
  adminDashboard.classList.remove("is-hidden");
  renderAdmin();
};

adminLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (adminPassword.value === ADMIN_PASSWORD) {
    window.sessionStorage.setItem("marsAdminUnlocked", "true");
    enterAdmin();
    return;
  }
  loginMessage.textContent = "비밀번호가 맞지 않습니다.";
  adminPassword.select();
});

requestResetButton.addEventListener("click", () => {
  resetConfirmPanel.classList.remove("is-hidden");
});

cancelResetButton.addEventListener("click", () => {
  resetConfirmPanel.classList.add("is-hidden");
});

cancelDeleteButton.addEventListener("click", () => {
  pendingDelete = null;
  deleteConfirmPanel.classList.add("is-hidden");
});

confirmDeleteButton.addEventListener("click", () => {
  if (!pendingDelete) return;
  const result = deleteProjectAsAdmin(pendingDelete.companyId, pendingDelete.projectId, pendingDelete.type);
  adminActionMessage.textContent = result.reason;
  pendingDelete = null;
  deleteConfirmPanel.classList.add("is-hidden");
  renderAdmin();
});

confirmResetButton.addEventListener("click", () => {
  resetState();
  resetConfirmPanel.classList.add("is-hidden");
  renderAdmin();
});

skipGrantButton.addEventListener("click", () => {
  skipRankGrantInterval();
  adminActionMessage.textContent = "30분을 스킵해 순위 지원금을 지급했고 프로젝트 추가 횟수를 재조정했습니다.";
  renderAdmin();
});

toggleTimeButton.addEventListener("click", () => {
  const state = toggleTimePaused();
  adminActionMessage.textContent = state.timeControl?.paused ? "30분 지원 타이머와 선거 타이머를 정지했습니다." : "시간을 재개했습니다.";
  renderAdmin();
});

endGameButton.addEventListener("click", () => {
  endGame();
  window.location.href = "./results.html";
});

if (window.sessionStorage.getItem("marsAdminUnlocked") === "true") {
  enterAdmin();
}

window.addEventListener("terraforming-state-change", () => {
  if (!adminDashboard.classList.contains("is-hidden")) renderAdmin();
});
initializeSharedState().then(() => {
  if (!adminDashboard.classList.contains("is-hidden")) renderAdmin();
});
