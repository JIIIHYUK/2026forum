import { COMPANIES } from "./config.js?v=13";

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

export function requestCompanyAccess(companyId) {
  const company = getCompanyAccessInfo(companyId);
  if (!company) return false;
  if (hasCompanyAccess(company.id)) return true;

  const input = window.prompt(`${company.name}${company.englishName && company.englishName !== company.name ? ` / ${company.englishName}` : ""} 암호를 입력하세요. (영어 4자 + 숫자 3개)`);
  if (input === null) return false;
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

export function requireCompanyAccess(companyId) {
  if (requestCompanyAccess(companyId)) return true;
  window.location.replace("./index.html");
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
