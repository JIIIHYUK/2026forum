import { COMPANIES } from "./config.js?v=14";

const SESSION_PREFIX = "marsTerraformingCompanyAccess.";
const CUTE_BANNER_KEY = "marsTerraformingCuteHeeju";
const CUTE_COMPANY_ID = "1";
const CUTE_PASSWORD = "CUTE09";
const PASSWORD_PATTERN = /^[a-z]{4}\d{3}$/i;

const normalizePassword = (value) => String(value || "").trim().toUpperCase();

export const getCompanyAccessInfo = (companyId) => COMPANIES.find((company) => company.id === String(companyId));

export const isValidCompanyPasswordFormat = (value) => PASSWORD_PATTERN.test(String(value || "").trim());

export function hasCompanyAccess(companyId) {
  const company = getCompanyAccessInfo(companyId);
  if (!company) return false;
  return window.sessionStorage.getItem(`${SESSION_PREFIX}${company.id}`) === normalizePassword(company.password);
}

export function grantCompanyAccess(companyId, input) {
  const company = getCompanyAccessInfo(companyId);
  if (!company) return false;
  const normalizedInput = normalizePassword(input);
  const normalizedPassword = normalizePassword(company.password);

  if (company.id === CUTE_COMPANY_ID && normalizedInput === CUTE_PASSWORD) {
    window.sessionStorage.setItem(`${SESSION_PREFIX}${company.id}`, normalizedPassword);
    window.sessionStorage.setItem(CUTE_BANNER_KEY, "1");
    mountCuteHeejuBanner();
    return true;
  }

  if (!isValidCompanyPasswordFormat(normalizedInput) || normalizedInput !== normalizedPassword) {
    window.alert("암호가 맞지 않습니다.");
    return false;
  }

  window.sessionStorage.setItem(`${SESSION_PREFIX}${company.id}`, normalizedPassword);
  return true;
}

export function requestCompanyAccess(companyId) {
  if (hasCompanyAccess(companyId)) return true;
  mountCompanyAccessGate(companyId);
  return false;
}

export function mountCompanyAccessGate(companyId) {
  const company = getCompanyAccessInfo(companyId);
  if (!company || document.querySelector(".company-auth-gate")) return;

  const gate = document.createElement("section");
  gate.className = "company-auth-gate";
  gate.innerHTML = `
    <form class="company-auth-card" id="companyAccessForm">
      <div class="company-card-mark">${company.mark}</div>
      <div>
        <span class="section-kicker">Company Access</span>
        <h1 class="company-name-stack">
          <span class="company-name-ko">${company.name}</span>
          ${company.englishName && company.englishName !== company.name ? `<span class="company-name-en">${company.englishName}</span>` : ""}
        </h1>
      </div>
      <label>
        <span>기업 암호</span>
        <input id="companyAccessPassword" type="password" autocomplete="off" placeholder="영어 4자 + 숫자 3개" required />
      </label>
      <button class="primary-button" type="submit">입장</button>
      <a class="ghost-link" href="./index.html">공용 페이지로 나가기</a>
      <p class="auth-message" id="companyAccessMessage"></p>
    </form>
  `;
  document.body.append(gate);
  document.body.classList.add("company-locked");

  const form = gate.querySelector("#companyAccessForm");
  const input = gate.querySelector("#companyAccessPassword");
  const message = gate.querySelector("#companyAccessMessage");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (grantCompanyAccess(company.id, input.value)) {
      window.location.reload();
      return;
    }
    message.textContent = "암호가 맞지 않습니다.";
    input.select();
  });
  input.focus();
}

export function requireCompanyAccess(companyId) {
  if (hasCompanyAccess(companyId)) return true;
  mountCompanyAccessGate(companyId);
  return false;
}

export function mountCuteHeejuBanner() {
  if (window.sessionStorage.getItem(CUTE_BANNER_KEY) !== "1") return;
  if (document.querySelector(".cute-heeju-banner")) return;

  const banner = document.createElement("div");
  banner.className = "cute-heeju-banner";
  banner.textContent = "큐티 희주";
  document.body.prepend(banner);
  document.body.classList.add("has-cute-heeju-banner");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountCuteHeejuBanner, { once: true });
} else {
  mountCuteHeejuBanner();
}
