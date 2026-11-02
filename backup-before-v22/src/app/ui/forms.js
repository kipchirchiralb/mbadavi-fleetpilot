import { toast } from "./dialogs.js";

/* ---------- form edit mode ----------
   Clicking ✎ on a row loads it into the form above and turns the form's
   "+ Add …" button into "✓ Update …". This also shows a "Cancel edit" button
   next to it, so an edit can be abandoned without saving (before, the form
   stayed stuck in update mode until something was saved). */
export function setEditMode(btnId, editing, onCancel) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (!btn.dataset.addLabel) btn.dataset.addLabel = btn.textContent;
  let cancelBtn = document.getElementById(btnId + "Cancel");
  if (editing) {
    btn.textContent =
      "✓ Update " + btn.dataset.addLabel.replace(/^\+\s*Add\s*/, "");
    if (!cancelBtn) {
      cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.id = btnId + "Cancel";
      cancelBtn.className = "btn";
      cancelBtn.style.cssText =
        "width:auto;padding:9px 18px;margin-top:8px;display:inline-block;";
      cancelBtn.textContent = "✕ Cancel edit";
      btn.after(cancelBtn);
    }
    cancelBtn.onclick = () => {
      if (onCancel) onCancel();
      setEditMode(btnId, false);
      toast("Edit cancelled");
    };
  } else {
    btn.textContent = btn.dataset.addLabel;
    if (cancelBtn) cancelBtn.remove();
  }
}
export function clearFields(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}
