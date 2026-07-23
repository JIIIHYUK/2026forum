import { BUDGET_RULES } from "./config.js?v=10";
import { applyDueElection, getGlobalTerraforming, getState, initializeSharedState, resetState } from "./dataStore.js?v=13";
import { impactClass, money, outcomeClass, percent, signedPercent } from "./aiEvaluator.js?v=12";

const ADMIN_PASSWORD = "bojeong09";

const loginPanel = document.querySelector("#loginPanel");
const adminDashboard = document.querySelector("#adminDashboard");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const loginMessage = document.querySelector("#loginMessage");
const adminSummary = document.querySelector("#adminSummary");
const adminCompanyList = document.querySelector("#adminCompanyList");
const requestResetButton = document.querySelector("#requestResetButton");
const resetConfirmPanel = document.querySelector("#resetConfirmPanel");
const cancelResetButton = document.querySelector("#cancelResetButton");
const confirmResetButton = document.querySelector("#confirmResetButton");

const fieldLabel = (field) => (field === "bio" ? "생화" : "물리");

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

const projectMarkup = (project) => `
  <article class="admin-project-item ${outcomeClass(project.evaluation)}">
    <div>
      <time>${formatDate(project.createdAt)}</time>
      <h3>${project.name}</h3>
      <strong class="project-outcome-text">${project.evaluation.outcome?.label || "성공"}</strong>
      <p>${fieldLabel(project.field)} · ${project.tech}</p>
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
  </article>
`;

const companyMarkup = (company) => {
  const projects = company.projects || [];
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
        <div><dt>프로젝트</dt><dd>${projects.length}개</dd></div>
        <div><dt>추가 가능</dt><dd>${Math.max(
          0,
          BUDGET_RULES.projectLimitPerFundingCycle - Number(company.projectAddsSinceFunding || 0)
        )}/${BUDGET_RULES.projectLimitPerFundingCycle}회</dd></div>
        <div><dt>획득 예산</dt><dd>${money(Number(company.governmentReceived || 0) + Number(company.rankGrantReceived || 0))}</dd></div>
      </dl>
      <div class="admin-project-list">
        ${projects.length ? projects.map(projectMarkup).join("") : `<div class="empty-state">아직 한 일이 없습니다.</div>`}
      </div>
    </section>
  `;
};

const renderAdmin = () => {
  applyDueElection();
  const state = getState();
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
    <div><span>전체 프로젝트</span><strong>${projectCount}개</strong></div>
    <div><span>종합 테라포밍</span><strong class="impact-value ${impactClass(getGlobalTerraforming(state))}">${signedPercent(getGlobalTerraforming(state))}</strong></div>
    <div><span>전체 획득 예산</span><strong>${money(totalFunding)}</strong></div>
    <div><span>의원장</span><strong>${chair ? chair.name : "없음"}</strong></div>
    <div><span>부의원장</span><strong>${viceChair ? viceChair.name : "없음"}</strong></div>
    <div><span>무소속 의석</span><strong>${parliament ? `${parliament.independentSeats || 0}석` : "0석"}</strong></div>
    <div><span>의원장 권한</span><strong>${parliament ? `${Math.max(0, 3 - Number(parliament.chairPowerUsed || 0))}/3회` : "0/3회"}</strong></div>
  `;
  adminCompanyList.innerHTML = state.companies.map(companyMarkup).join("");
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

confirmResetButton.addEventListener("click", () => {
  resetState();
  resetConfirmPanel.classList.add("is-hidden");
  renderAdmin();
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
