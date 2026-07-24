import "./companyAuth.js?v=6";
import { getGlobalTerraforming, getRanking, getState, initializeSharedState } from "./dataStore.js?v=26";
import { impactClass, money, outcomeClass, percent, signedPercent } from "./aiEvaluator.js?v=16";

const resultsSummary = document.querySelector("#resultsSummary");
const finalRanking = document.querySelector("#finalRanking");
const effectiveProjects = document.querySelector("#effectiveProjects");
const failedProjects = document.querySelector("#failedProjects");
const politicsResultSummary = document.querySelector("#politicsResultSummary");
const politicsChart = document.querySelector("#politicsChart");

const formatDate = (date) =>
  date
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(date))
    : "기록 없음";

const companyNameMarkup = (company) => `
  <span class="company-name-ko">${company.name}</span>
  ${company.englishName && company.englishName !== company.name ? `<span class="company-name-en">${company.englishName}</span>` : ""}
`;

const projectCard = (project) => `
  <article class="result-project-card ${outcomeClass(project.evaluation)}">
    <div>
      <time>${formatDate(project.createdAt)}</time>
      <h3>${project.name}</h3>
      <p>${project.companyName}${project.companyEnglishName ? ` / ${project.companyEnglishName}` : ""}</p>
    </div>
    <dl>
      <div><dt>기여도</dt><dd class="impact-value ${impactClass(project.evaluation.totalContributionPercent)}">${signedPercent(project.evaluation.totalContributionPercent)}</dd></div>
      <div><dt>효과</dt><dd>${project.evaluation.projectScore}/10</dd></div>
      <div><dt>가능성</dt><dd>${percent(project.evaluation.possibility, 1)}</dd></div>
      <div><dt>비용</dt><dd>${money(project.price)}</dd></div>
    </dl>
  </article>
`;

const countBy = (items, keyFn) =>
  items.reduce((counts, item) => {
    const key = keyFn(item);
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

const maxCompanyByCount = (counts, companies) => {
  const rows = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return Number(a[0]) - Number(b[0]);
  });
  if (!rows.length) return null;
  const [companyId, count] = rows[0];
  const company = companies.find((item) => item.id === companyId);
  return company ? { company, count } : null;
};

const topSeatRecord = (history, companies) => {
  let best = null;
  history.forEach((election) => {
    companies.forEach((company) => {
      const seats = Number(election.seatsByCompany?.[company.id] || 0);
      if (!best || seats > best.seats) best = { company, seats };
    });
  });
  return best;
};

const renderPoliticsChart = (history, companies) => {
  const orderedHistory = [...history].reverse();
  if (!orderedHistory.length) {
    politicsChart.innerHTML = `<div class="empty-state">아직 선거 기록이 없습니다.</div>`;
    return;
  }

  politicsChart.innerHTML = orderedHistory
    .map((election, index) => {
      const rows = companies
        .map((company) => ({
          company,
          seats: Number(election.seatsByCompany?.[company.id] || 0)
        }))
        .filter((row) => row.seats > 0)
        .sort((a, b) => b.seats - a.seats);
      const independentSeats = Number(election.independentSeats || 0);
      return `
        <article class="politics-chart-row">
          <div class="politics-chart-head">
            <strong>${index + 1}차 선거</strong>
            <span>${formatDate(election.createdAt)}</span>
          </div>
          <div class="seat-bars">
            ${rows
              .map(
                ({ company, seats }) => `
                  <div class="seat-bar-line">
                    <span>${company.name}</span>
                    <div class="seat-bar-track"><i class="power-seat-${company.id}" style="width:${seats}%"></i></div>
                    <strong>${seats}석</strong>
                  </div>
                `
              )
              .join("")}
            ${
              independentSeats
                ? `<div class="seat-bar-line"><span>무소속</span><div class="seat-bar-track"><i class="power-seat-independent" style="width:${independentSeats}%"></i></div><strong>${independentSeats}석</strong></div>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
};

const renderResults = () => {
  const state = getState();
  const ranking = getRanking(state);
  const projects = [...(state.projects || [])];
  const successfulProjects = projects
    .filter((project) => !project.evaluation?.outcome?.failed && Number(project.evaluation?.totalContributionPercent || 0) > 0)
    .sort((a, b) => {
      if (b.evaluation.totalContributionPercent !== a.evaluation.totalContributionPercent) {
        return b.evaluation.totalContributionPercent - a.evaluation.totalContributionPercent;
      }
      return b.evaluation.projectScore - a.evaluation.projectScore;
    });
  const failed = projects
    .filter((project) => project.evaluation?.outcome?.failed)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const currentParliament = state.politics?.parliament;
  const history = (state.politics?.electionHistory || []).length
    ? state.politics.electionHistory
    : currentParliament
      ? [
          {
            id: "current-parliament",
            createdAt: currentParliament.createdAt,
            seatsByCompany: currentParliament.seatsByCompany || {},
            independentSeats: currentParliament.independentSeats || 0,
            chairCompanyId: currentParliament.chairCompanyId,
            viceChairCompanyId: currentParliament.viceChairCompanyId,
            ranking: currentParliament.ranking || []
          }
        ]
      : [];
  const chairWinner = maxCompanyByCount(countBy(history, (election) => election.chairCompanyId), state.companies);
  const topSeatCompany = topSeatRecord(history, state.companies);

  resultsSummary.innerHTML = `
    <div><span>종합 테라포밍</span><strong class="impact-value ${impactClass(getGlobalTerraforming(state))}">${signedPercent(getGlobalTerraforming(state))}</strong></div>
    <div><span>정식 프로젝트</span><strong>${projects.length}개</strong></div>
    <div><span>실패 프로젝트</span><strong>${failed.length}개</strong></div>
    <div><span>종료 시간</span><strong>${formatDate(state.gameEndedAt || state.updatedAt)}</strong></div>
  `;

  finalRanking.innerHTML = ranking
    .map(
      (company, index) => `
        <article class="final-rank-card">
          <span class="rank-number">${index + 1}</span>
          <div>
            <h3 class="company-name-stack">${companyNameMarkup(company)}</h3>
            <p>${company.projects.length}개 프로젝트 · 예산 ${money(company.budget)}</p>
          </div>
          <strong class="impact-value ${impactClass(company.contribution)}">${signedPercent(company.contribution)}</strong>
        </article>
      `
    )
    .join("");

  effectiveProjects.innerHTML = successfulProjects.length
    ? successfulProjects.map(projectCard).join("")
    : `<div class="empty-state">효과 프로젝트가 없습니다.</div>`;
  failedProjects.innerHTML = failed.length ? failed.map(projectCard).join("") : `<div class="empty-state">실패 프로젝트가 없습니다.</div>`;

  politicsResultSummary.innerHTML = `
    <div><span>선거 횟수</span><strong>${history.length}회</strong></div>
    <div><span>가장 많은 의석</span><strong>${topSeatCompany ? `${topSeatCompany.company.name} ${topSeatCompany.seats}석` : "기록 없음"}</strong></div>
    <div><span>가장 많은 위원장</span><strong>${chairWinner ? `${chairWinner.company.name} ${chairWinner.count}회` : "기록 없음"}</strong></div>
  `;
  renderPoliticsChart(history, state.companies);
};

initializeSharedState().then(renderResults);
window.addEventListener("terraforming-state-change", renderResults);
