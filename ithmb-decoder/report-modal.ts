import { findSuccess } from "./cards.js";
import { t } from "./i18n.js";
import { sharedSubmissionIds } from "./state.js";
import { submitTelemetry } from "./telemetry.js";
import { bytesToHex, showToast } from "./utils.js";

interface ReportLinkParams {
  cardId: string;
  bytes: Uint8Array;
  prefix: number;
  fileSize: number;
}

// Build the success "Image looks wrong?" report link. Clicking it opens the
// SHARED report modal (one container in the HTML, populated per-click) — the
// original contribute-workflow UX: centered dialog over a dimmed + blurred
// backdrop. The same link/entry is used by the success card AND the viewer
// stage (same fb-<cardId> dedup key, honest feedback).
export function createReportLink({
  cardId,
  bytes,
  prefix,
  fileSize,
}: ReportLinkParams): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "success-report";
  const link = document.createElement("a");
  link.href = "#";
  link.setAttribute("data-report", cardId);
  link.textContent = t("share.imageLooksWrong");
  wrap.appendChild(link);

  const fbKey = "fb-" + cardId;

  // Reflect a report already made from the other surface (card ↔ viewer).
  if (sharedSubmissionIds.has(fbKey)) {
    link.textContent = t("share.thanksShared");
    link.style.pointerEvents = "none";
  }

  link.addEventListener("click", (e) => {
    e.preventDefault();
    if (sharedSubmissionIds.has(fbKey)) return;
    openReportModal(cardId, bytes, prefix, fileSize);
  });

  return wrap;
}

const ISSUES: Array<[string, string]> = [
  ["color_space", "share.issueColorSpace"],
  ["dimensions", "share.issueDimensions"],
  ["stride", "share.issueStride"],
  ["offset", "share.issueOffset"],
  ["byte_order", "share.issueByteOrder"],
  ["other", "share.issueOther"],
];
// Close the shared report modal (idempotent).
function closeReportModal(): void {
  const overlay = document.getElementById("reportModal");
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
}

// Backdrop click closes the modal. Bound ONCE at module scope — the old
// per-open addEventListener accumulated a listener on every report click.
const reportModalOverlay = document.getElementById("reportModal");
if (reportModalOverlay) {
  reportModalOverlay.addEventListener("click", (e) => {
    if (e.target === reportModalOverlay) closeReportModal();
  });
}

// Open the shared report modal, populated for this card's file.
function openReportModal(
  cardId: string,
  bytes: Uint8Array,
  prefix: number,
  fileSize: number,
): void {
  const overlay = document.getElementById("reportModal");
  const content = document.getElementById("reportModalContent");
  if (!overlay || !content) return;

  const fbKey = "fb-" + cardId;

  // Thumbnail of the decoded image at the top of the modal (like the
  // original contribute modal) — the user sees WHAT looks wrong while
  // picking an issue.
  const thumb = document.createElement("img");
  thumb.className = "report-thumb";
  thumb.alt = "";
  const entry = findSuccess(cardId);
  if (entry && entry.canvas) {
    try {
      thumb.src = entry.canvas.toDataURL("image/jpeg", 0.7);
    } catch (e) {
      thumb.style.display = "none";
    }
  } else {
    thumb.style.display = "none";
  }

  const form = document.createElement("div");
  form.className = "report-form";
  const grid = document.createElement("div");
  grid.className = "report-issues";
  const group = "report-issue-" + cardId;
  for (const [value, key] of ISSUES) {
    const label = t(key);
    const labelEl = document.createElement("label");
    labelEl.className = "report-issue";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = group;
    input.value = value;
    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(label));
    grid.appendChild(labelEl);
  }
  const detail = document.createElement("input");
  detail.type = "text";
  detail.className = "report-detail";
  detail.maxLength = 200;
  detail.placeholder = t("share.whatLooksWrong");
  const actions = document.createElement("div");
  actions.className = "report-form-actions";
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "btn btn-small btn-primary";
  submitBtn.textContent = t("share.submit");
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-small btn-outline";
  cancelBtn.textContent = t("share.cancel");
  // Right-aligned actions: Cancel on the left, Submit (primary) on the
  // far right — the standard modal convention (Material/Windows).
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(thumb);
  form.appendChild(grid);
  form.appendChild(detail);
  form.appendChild(actions);
  content.innerHTML = "";
  content.appendChild(form);

  const close = closeReportModal;
  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", async () => {
    if (sharedSubmissionIds.has(fbKey)) return;
    const checked = grid.querySelector<HTMLInputElement>("input:checked");
    if (!checked) {
      showToast(t("share.selectIssue"));
      return;
    }
    const issueDetail = detail.value.trim();
    // Mark synchronously so a fast second submit cannot double-post.
    sharedSubmissionIds.add(fbKey);
    // Optimistic update: close + show success immediately, fire the POST in
    // the background.
    close();
    // Update BOTH surfaces' links (card + viewer stage share the dedup key).
    const links = document.querySelectorAll<HTMLElement>(`[data-report="${cardId}"]`);
    for (const l of links) {
      l.textContent = t("share.thanksShared");
      l.style.pointerEvents = "none";
    }
    showToast(t("share.reportSharedToast"));
    submitTelemetry({
      prefix,
      fileSize,
      status: "success",
      header: bytesToHex(bytes.slice(0, 16), ""),
      issue: checked.value,
      issue_detail: issueDetail || null,
    }).then((ok) => {
      if (!ok) {
        // Server rejected — roll back so the user can retry, and tell the truth.
        sharedSubmissionIds.delete(fbKey);
        const links2 = document.querySelectorAll<HTMLElement>(`[data-report="${cardId}"]`);
        for (const l of links2) {
          l.textContent = t("share.imageLooksWrong");
          l.style.pointerEvents = "";
        }
        showToast(t("share.failedToast"));
      }
    });
  });

  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");
}
