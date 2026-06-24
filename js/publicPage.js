import { BUDGET_RULES } from "./config.js";
import {
  applyDueRankGrants,
  getGlobalTerraforming,
  getNextGrantMs,
  getRanking,
  getState
} from "./dataStore.js";
import { impactClass, money, outcomeClass, percent, signedPercent } from "./aiEvaluator.js?v=4";
import { mountMarsScene } from "./marsScene.js";

const canvas = document.querySelector("#marsCanvas");
const rankingList = document.querySelector("#rankingList");
const leftCompanies = document.querySelector("#leftCompanies");
const rightCompanies = document.querySelector("#rightCompanies");
const projectFeed = document.querySelector("#projectFeed");
const projectCount = document.querySelector("#projectCount");
const globalTerraforming = document.querySelector("#globalTerraforming");
const countdown = document.querySelector("#nextGrantCountdown");
const drawer = document.querySelector("#newsDrawer");
const newsHandle = document.querySelector("#newsHandle");
const settleGrantsButton = document.querySelector("#settleGrantsButton");

const formatTime = (ms) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const companyCard = (company) => `
  <a class="company-card" href="./company.html?id=${company.id}" aria-label="${company.name} 세부사항">
    <span class="company-card-mark">${company.mark}</span>
    <span>
      <strong>${company.name}</strong>
      <em>${percent(company.contribution)}</em>
    </span>
  </a>
`;

const renderCompanies = (companies) => {
  leftCompanies.innerHTML = companies.slice(0, 3).map(companyCard).join("");
  rightCompanies.innerHTML = companies.slice(3, 6).map(companyCard).join("");
};

const renderRanking = (state) => {
  const ranking = getRanking(state);
  rankingList.innerHTML = ranking
    .map((company, index) => {
      const grant = BUDGET_RULES.rankGrants[index] || 0;
      return `
        <li>
          <span class="rank-number">${index + 1}</span>
          <span class="rank-name">${company.name}</span>
          <strong>${percent(company.contribution)}</strong>
          <small>30분 지원 ${money(grant)}</small>
        </li>
      `;
    })
    .join("");
};

const renderFeed = (state) => {
  const projects = [...state.projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  projectCount.textContent = `${projects.length}개`;
  if (!projects.length) {
    projectFeed.innerHTML = `<div class="empty-state">아직 등록된 프로젝트가 없습니다.</div>`;
    return;
  }

  projectFeed.innerHTML = projects
    .map(
      (project) => `
        <article class="feed-item ${outcomeClass(project.evaluation)}">
          <time>${new Intl.DateTimeFormat("ko-KR", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          }).format(new Date(project.createdAt))}</time>
          <div>
            <h3>${project.name}</h3>
            <strong class="project-outcome-text">${project.evaluation.outcome?.label || "성공"}</strong>
            <p>${project.companyName} · ${project.field === "bio" ? "생화" : "물리"}</p>
          </div>
          <dl>
            <div><dt>프로젝트 평가</dt><dd>${project.evaluation.projectScore}/10</dd></div>
            <div><dt>실패 확률</dt><dd>${percent(project.evaluation.failureProbability, 1)}</dd></div>
            <div><dt>총 기여도</dt><dd class="impact-value ${impactClass(project.evaluation.totalContributionPercent)}">${signedPercent(project.evaluation.totalContributionPercent)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");
};

const render = () => {
  const state = applyDueRankGrants();
  renderCompanies(state.companies);
  renderRanking(state);
  renderFeed(state);
  globalTerraforming.textContent = percent(getGlobalTerraforming(state));
  countdown.textContent = formatTime(getNextGrantMs(state));
};

const setDrawerOpen = (open) => {
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-expanded", String(open));
};

let dragStartY = 0;
newsHandle.addEventListener("click", () => setDrawerOpen(!drawer.classList.contains("is-open")));
newsHandle.addEventListener("pointerdown", (event) => {
  dragStartY = event.clientY;
  newsHandle.setPointerCapture(event.pointerId);
});
newsHandle.addEventListener("pointerup", (event) => {
  const delta = event.clientY - dragStartY;
  if (delta < -24) setDrawerOpen(true);
  if (delta > 24) setDrawerOpen(false);
});

settleGrantsButton.addEventListener("click", () => {
  applyDueRankGrants(true);
  render();
});

window.addEventListener("terraforming-state-change", render);
mountMarsScene(canvas);
render();
window.setInterval(render, 1000);
