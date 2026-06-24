import { BUDGET_RULES, PROMOTION_METHODS, TERRAFORMING_TARGETS } from "./config.js";
import {
  applyPromotionFunding,
  getCompany,
  getGlobalTerraforming,
  getState,
  recordProject
} from "./dataStore.js";
import {
  calculatePromotion,
  evaluateProject,
  impactClass,
  money,
  outcomeClass,
  percent,
  resolveProjectOutcome,
  signedPercent
} from "./aiEvaluator.js?v=4";

const params = new URLSearchParams(window.location.search);
const companyId = params.get("id") || "1";

const companyLogo = document.querySelector("#companyLogo");
const companyName = document.querySelector("#companyName");
const companyFeature = document.querySelector("#companyFeature");
const companyBudget = document.querySelector("#companyBudget");
const companyContribution = document.querySelector("#companyContribution");
const companyProjectCount = document.querySelector("#companyProjectCount");
const companyFunding = document.querySelector("#companyFunding");
const projectForm = document.querySelector("#projectForm");
const projectField = document.querySelector("#projectField");
const projectName = document.querySelector("#projectName");
const projectTech = document.querySelector("#projectTech");
const projectPrice = document.querySelector("#projectPrice");
const projectEffect = document.querySelector("#projectEffect");
const evaluationPanel = document.querySelector("#evaluationPanel");
const decisionPanel = document.querySelector("#decisionPanel");
const shortageMessage = document.querySelector("#shortageMessage");
const abandonProjectButton = document.querySelector("#abandonProjectButton");
const spendMoreButton = document.querySelector("#spendMoreButton");
const saveStatus = document.querySelector("#saveStatus");
const governmentGrantPreview = document.querySelector("#governmentGrantPreview");
const promotionMethod = document.querySelector("#promotionMethod");
const runPromotionButton = document.querySelector("#runPromotionButton");
const ageFundingTable = document.querySelector("#ageFundingTable");
const projectHistory = document.querySelector("#projectHistory");

let currentEvaluation = null;
let pendingProject = null;
let lastSavedEvaluation = null;

const readInput = () => ({
  field: projectField.value,
  name: projectName.value.trim(),
  tech: projectTech.value.trim(),
  price: Number(projectPrice.value || 0),
  effect: projectEffect.value.trim()
});

const hasEnoughInput = (input) => input.name || input.tech || input.price || input.effect;

const targetRows = (evaluation) =>
  evaluation.goalContributions
    .map((target) => {
      const rowImpactClass =
        target.contribution < 0 ? "is-negative" : target.contribution > 0 ? "is-positive" : "is-neutral";
      return `
        <div class="target-row ${rowImpactClass}">
          <span>${target.label}</span>
          <em>${target.target}</em>
          <strong class="impact-value ${impactClass(target.contribution)}">${signedPercent(target.contribution)}</strong>
        </div>
      `;
    })
    .join("");

const evaluationMarkup = (evaluation, label = "AI 평가") => `
  <div class="evaluation-label">${label}</div>
  ${
    evaluation.outcome
      ? `<div class="outcome-banner ${outcomeClass(evaluation)}">${evaluation.outcome.label} · ${
          evaluation.outcome.failed
            ? `긍정 효과 ${Math.round(evaluation.outcome.positiveRetention * 100)}% 적용, 부정 영향 유지`
            : "평가 효과 전체 적용"
        }</div>`
      : ""
  }
  <div class="evaluation-grid">
    <div>
      <span>가능성</span>
      <strong>${percent(evaluation.possibility, 1)}</strong>
    </div>
    <div>
      <span>프로젝트 효과</span>
      <strong>${evaluation.projectScore}/10</strong>
    </div>
    <div>
      <span>실패 확률</span>
      <strong class="risk-value">${percent(evaluation.failureProbability, 1)}</strong>
    </div>
    <div class="${evaluation.totalContributionPercent < 0 ? "is-negative" : "is-positive"}">
      <span>프로젝트 기여</span>
      <strong class="impact-value ${impactClass(evaluation.totalContributionPercent)}">${signedPercent(evaluation.totalContributionPercent)}</strong>
    </div>
    <div>
      <span>비용/효과 지수</span>
      <strong>${evaluation.costEffectIndex}</strong>
    </div>
  </div>
  <p class="ai-judgement">${evaluation.judgement}</p>
  <div class="targets-list">
    <div class="target-row target-head">
      <span>목표치</span>
      <em>기준</em>
      <strong>목표 영향</strong>
    </div>
    ${targetRows(evaluation)}
  </div>
  <div class="global-note">현재 종합 테라포밍 성립률: ${percent(getGlobalTerraforming(getState()))}</div>
`;

const renderEvaluation = () => {
  const company = getCompany(companyId);
  const input = readInput();
  if (!hasEnoughInput(input)) {
    currentEvaluation = null;
    const latestEvaluation = lastSavedEvaluation || company.projects[0]?.evaluation;
    if (latestEvaluation) {
      governmentGrantPreview.textContent = money(latestEvaluation.governmentGrant);
      evaluationPanel.innerHTML = evaluationMarkup(latestEvaluation, "최근 등록 결과");
      return;
    }
    evaluationPanel.innerHTML = `<div class="empty-state">입력값이 들어오면 AI 평가가 표시됩니다.</div>`;
    governmentGrantPreview.textContent = money(0);
    return;
  }

  currentEvaluation = evaluateProject(input, company);
  governmentGrantPreview.textContent = money(currentEvaluation.governmentGrant);
  evaluationPanel.innerHTML = evaluationMarkup(currentEvaluation);
};

const renderCompany = () => {
  const company = getCompany(companyId);
  companyLogo.textContent = company.mark;
  companyName.textContent = company.name;
  companyFeature.textContent = company.feature;
  companyBudget.textContent = money(company.budget);
  companyContribution.textContent = percent(company.contribution);
  companyProjectCount.textContent = `${company.projects.length}개`;
  companyFunding.textContent = money(
    Number(company.governmentReceived || 0) + Number(company.promotionReceived || 0) + Number(company.rankGrantReceived || 0)
  );
  document.title = `${company.name} 세부사항 | Mars Terraforming Commons`;
};

const renderHistory = () => {
  const company = getCompany(companyId);
  if (!company.projects.length) {
    projectHistory.innerHTML = `<div class="empty-state">등록된 프로젝트가 없습니다.</div>`;
    return;
  }
  projectHistory.innerHTML = company.projects
    .map(
      (project) => `
        <article class="history-item ${outcomeClass(project.evaluation)}">
          <div>
            <time>${new Intl.DateTimeFormat("ko-KR", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }).format(new Date(project.createdAt))}</time>
            <h3>${project.name}</h3>
            <strong class="project-outcome-text">${project.evaluation.outcome?.label || "성공"}</strong>
            <p>${project.tech}</p>
          </div>
          <dl>
            <div><dt>가격</dt><dd>${money(project.price)}</dd></div>
            <div><dt>가능성</dt><dd>${percent(project.evaluation.possibility, 1)}</dd></div>
            <div><dt>실패 확률</dt><dd>${percent(project.evaluation.failureProbability, 1)}</dd></div>
            <div><dt>효과</dt><dd>${project.evaluation.projectScore}/10</dd></div>
            <div><dt>기여도</dt><dd class="impact-value ${impactClass(project.evaluation.totalContributionPercent)}">${signedPercent(project.evaluation.totalContributionPercent)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");
};

const renderPromotionOptions = () => {
  promotionMethod.innerHTML = PROMOTION_METHODS.map(
    (method) => `<option value="${method.id}">${method.label}</option>`
  ).join("");
};

const renderPromotionTable = (result = null) => {
  const company = getCompany(companyId);
  const latestProject = company.projects[0] || null;
  const next = result || calculatePromotion(promotionMethod.value || PROMOTION_METHODS[0].id, latestProject);
  ageFundingTable.innerHTML = `
    <div class="age-row age-head">
      <span>나이대</span>
      <strong>반응</strong>
      <em>지원금</em>
    </div>
    ${next.rows
      .map(
        (row) => `
          <div class="age-row">
            <span>${row.label}</span>
            <strong>${percent(row.reaction, 1)}</strong>
            <em>${money(row.funding)}</em>
          </div>
        `
      )
      .join("")}
    <div class="age-total">추가 지원금 ${money(next.totalFunding)}</div>
  `;
};

const renderAll = () => {
  renderCompany();
  renderEvaluation();
  renderHistory();
  renderPromotionTable();
};

const saveProject = (projectInput, evaluation, extraBudget = 0) => {
  const realizedEvaluation = resolveProjectOutcome(evaluation);
  recordProject(companyId, projectInput, realizedEvaluation, { extraBudget, plannedEvaluation: evaluation });
  lastSavedEvaluation = realizedEvaluation;
  saveStatus.textContent = "등록 완료";
  pendingProject = null;
  decisionPanel.classList.add("is-hidden");
  projectForm.reset();
  renderAll();
};

projectForm.addEventListener("input", () => {
  saveStatus.textContent = "평가 중";
  renderEvaluation();
});

projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = readInput();
  const company = getCompany(companyId);
  const evaluation = evaluateProject(input, company);
  currentEvaluation = evaluation;

  if (evaluation.isBudgetShort) {
    pendingProject = { input, evaluation };
    shortageMessage.textContent = `${money(evaluation.budgetShortage)}이 부족합니다. 이 프로젝트를 포기하거나 추가 예산을 투입할 수 있습니다.`;
    decisionPanel.classList.remove("is-hidden");
    saveStatus.textContent = "결정 필요";
    renderEvaluation();
    return;
  }

  saveProject(input, evaluation);
});

abandonProjectButton.addEventListener("click", () => {
  pendingProject = null;
  decisionPanel.classList.add("is-hidden");
  saveStatus.textContent = "포기";
});

spendMoreButton.addEventListener("click", () => {
  if (!pendingProject) return;
  const extraBudget = Math.ceil(
    (pendingProject.evaluation.budgetShortage * BUDGET_RULES.emergencyReserveMultiplier) / 1000000
  ) * 1000000;
  saveProject(pendingProject.input, pendingProject.evaluation, extraBudget);
});

promotionMethod.addEventListener("change", () => renderPromotionTable());

runPromotionButton.addEventListener("click", () => {
  const company = getCompany(companyId);
  const latestProject = company.projects[0] || null;
  const result = calculatePromotion(promotionMethod.value, latestProject);
  applyPromotionFunding(companyId, result);
  renderPromotionTable(result);
  renderCompany();
});

renderPromotionOptions();
renderAll();

if (!TERRAFORMING_TARGETS.length) {
  evaluationPanel.innerHTML = `<div class="empty-state">목표치 설정이 비어 있습니다.</div>`;
}
