import * as tasksRepo from "../db/tasksRepo.js";
import { findTimeConflict } from "../core/schedule.js";
import { playSave, playError, playToggle, playDelete, playUndo, playOpen } from "../core/sounds.js";
import { el, buildEmptyState, formatTimeRange } from "./components.js";
import { showConfirmDialog, showToast } from "./toast.js";
import { t } from "../core/i18n.js";

export async function renderTasks(container) {
  container.innerHTML = "";
  const tasks = await tasksRepo.getAllTasks();

  const list = el("div", { class: "task-manage-list" });
  if (tasks.length === 0) {
    list.appendChild(
      buildEmptyState("plus", t("tasks.emptyTitle"), t("tasks.emptyDesc"))
    );
  } else {
    tasks.forEach((task) => list.appendChild(buildTaskRow(task, container)));
  }
  initDrag(list, container);

  container.append(
    el("h2", { class: "section-title", text: t("tasks.title") }),
    buildAddForm(container),
    list
  );
}

function buildAddForm(container) {
  const nameInput = el("input", {
    type: "text",
    placeholder: t("tasks.namePlaceholder"),
    class: "input",
    required: true,
    maxlength: "60",
  });
  const expInput = el("input", {
    type: "number",
    placeholder: t("tasks.expPlaceholder"),
    class: "input input--small",
    required: true,
    min: "1",
    max: "1000",
    value: "10",
  });
  const startInput = el("input", { type: "time", class: "input input--time", title: t("tasks.startPlaceholder") });
  const endInput = el("input", { type: "time", class: "input input--time", title: t("tasks.endPlaceholder") });
  const errorMsg = el("p", { class: "form-error" });

  return el(
    "form",
    {
      class: "task-form",
      onsubmit: async (e) => {
        e.preventDefault();
        errorMsg.textContent = "";
        const name = nameInput.value.trim();
        const exp = Number(expInput.value);
        if (!name) {
          playError();
          errorMsg.textContent = t("tasks.giveName");
          return;
        }
        if (!exp || exp < 1 || exp > 1000) {
          playError();
          errorMsg.textContent = t("tasks.expRange");
          return;
        }

        try {
          if (startInput.value) {
            if (endInput.value && endInput.value < startInput.value) {
              playError();
              errorMsg.textContent = t("tasks.overnight");
              return;
            }
            const activeTasks = await tasksRepo.getActiveTasks();
            const conflict = findTimeConflict(startInput.value, endInput.value, activeTasks, null);
            if (conflict) {
              playError();
              errorMsg.textContent = t("tasks.conflict", { name: conflict.name, time: formatTimeRange(conflict) });
              return;
            }
          }

          await tasksRepo.createTask({
            name,
            expValue: exp,
            startTime: startInput.value,
            endTime: endInput.value,
          });
          playSave();
          renderTasks(container);
        } catch (err) {
          playError();
          errorMsg.textContent = t("tasks.addFailed") + ": " + err.message;
        }
      },
    },
    [nameInput, expInput, startInput, endInput, el("button", { type: "submit", class: "btn btn--primary", text: t("tasks.add") }), errorMsg]
  );
}

function buildTaskRow(task, container) {
  const errorMsg = el("p", { class: "form-error" });
  const row = el("div", {
    class: `task-manage-row ${task.isActive ? "" : "task-manage-row--inactive"}`,
    "data-task-id": task.id,
  });
  const timeRange = formatTimeRange(task);
  const nameCell = el("a", { href: `#/task/${task.id}`, class: "task-manage-row__name task-manage-row__name--link" }, [
    task.name,
    timeRange ? el("span", { class: "task-row__time", text: timeRange }) : null,
    task.notes
      ? el("span", {
          class: "task-manage-row__notes",
          text: task.notes.length > 80 ? `${task.notes.slice(0, 77)}\u2026` : task.notes,
        })
      : null,
  ]);

  const activeToggle = el("button", {
    class: `chip ${task.isActive ? "chip--on" : "chip--off"}`,
    type: "button",
    text: task.isActive ? t("tasks.active") : t("tasks.inactive"),
    onclick: async () => {
      errorMsg.textContent = "";
      try {
        // Reactivating a scheduled task must not reintroduce an overlap that
        // the create/edit paths would have rejected.
        if (!task.isActive && task.startTime) {
          const conflict = findTimeConflict(
            task.startTime,
            task.endTime,
            await tasksRepo.getActiveTasks(),
            task.id
          );
          if (conflict) {
            playError();
            errorMsg.textContent = t("tasks.conflict", { name: conflict.name, time: formatTimeRange(conflict) });
            return;
          }
        }
        await tasksRepo.updateTask(task.id, { isActive: !task.isActive });
        playToggle();
        renderTasks(container);
      } catch (err) {
        playError();
        errorMsg.textContent = t("tasks.updateFailed") + ": " + err.message;
      }
    },
  });

  const editBtn = el("button", {
    class: "icon-btn",
    type: "button",
    text: t("tasks.edit"),
    onclick: () => {
      playOpen();
      enterEditMode(row, task, container);
    },
  });

  const deleteBtn = el("button", {
    class: "icon-btn icon-btn--danger",
    type: "button",
    text: t("tasks.delete"),
    onclick: async () => {
      const confirmed = await showConfirmDialog({
        title: t("tasks.deleteTitle"),
        message: t("tasks.deleteMsg", { name: task.name }),
        confirmText: t("tasks.delete"),
        danger: true,
      });
      if (!confirmed) return;
      try {
        // Full snapshot (id included) so Undo restores the exact task,
        // reconnecting it to its history records.
        await tasksRepo.deleteTask(task.id);
        playDelete();
        showToast(t("tasks.deleted", { name: task.name }), "info", 5000, {
          text: t("tasks.undo"),
          onAction: async () => {
            playUndo();
            try {
              await tasksRepo.restoreTask(task);
              renderTasks(container);
            } catch (err) {
              playError();
              showToast(t("tasks.undoFailed") + ": " + err.message, "error");
            }
          },
        });
        renderTasks(container);
      } catch (err) {
        playError();
        showToast(t("tasks.deleteFailed") + ": " + err.message, "error");
      }
    },
  });

  row.append(
    ...(task.startTime ? [] : [el("div", { class: "drag-handle", text: "\u2261", title: t("tasks.dragHint") })]),
    nameCell,
    el("span", { class: "task-manage-row__exp", text: `${task.expValue} EXP` }),
    activeToggle,
    editBtn,
    deleteBtn,
    errorMsg
  );
  return row;
}

function enterEditMode(row, task, container) {
  row.innerHTML = "";
  const nameInput = el("input", { type: "text", class: "input", value: task.name, maxlength: "60" });
  const expInput = el("input", {
    type: "number",
    class: "input input--small",
    value: String(task.expValue),
    min: "1",
    max: "1000",
  });
  const startInput = el("input", { type: "time", class: "input input--time", title: t("tasks.startPlaceholder") });
  const endInput = el("input", { type: "time", class: "input input--time", title: t("tasks.endPlaceholder") });
  startInput.value = task.startTime || "";
  endInput.value = task.endTime || "";
  const errorMsg = el("p", { class: "form-error" });

  const saveBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("tasks.save"),
    onclick: async () => {
      errorMsg.textContent = "";
      const name = nameInput.value.trim();
      const exp = Number(expInput.value);
      if (!name) {
        playError();
        errorMsg.textContent = t("tasks.giveName");
        return;
      }
      if (!exp || exp < 1 || exp > 1000) {
        playError();
        errorMsg.textContent = t("tasks.expRange");
        return;
      }

      try {
        if (startInput.value) {
          if (endInput.value && endInput.value < startInput.value) {
            playError();
            errorMsg.textContent = t("tasks.overnight");
            return;
          }
          const activeTasks = await tasksRepo.getActiveTasks();
          const conflict = findTimeConflict(startInput.value, endInput.value, activeTasks, task.id);
          if (conflict) {
            playError();
            errorMsg.textContent = t("tasks.conflict", { name: conflict.name, time: formatTimeRange(conflict) });
            return;
          }
        }

        await tasksRepo.updateTask(task.id, {
          name,
          expValue: exp,
          startTime: startInput.value,
          endTime: endInput.value,
        });
        playSave();
        renderTasks(container);
      } catch (err) {
        playError();
        errorMsg.textContent = t("tasks.saveFailed") + ": " + err.message;
      }
    },
  });
  const cancelBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("tasks.cancel"),
    onclick: () => renderTasks(container),
  });

  row.append(nameInput, expInput, startInput, endInput, saveBtn, cancelBtn, errorMsg);
}

function initDrag(listEl) {
  let state = null;

  listEl.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    const row = handle.closest(".task-manage-row");
    if (!row) return;
    e.preventDefault();
    state = { row, startY: e.clientY };
    row.classList.add("task-manage-row--dragging");
    row.setPointerCapture(e.pointerId);
  });

  listEl.addEventListener("pointermove", (e) => {
    if (!state) return;
    const dy = e.clientY - state.startY;
    state.row.style.transform = `translateY(${dy}px)`;
    state.row.style.zIndex = "10";
    state.row.style.position = "relative";

    const rows = [...listEl.querySelectorAll(".task-manage-row")];
    const fromIdx = rows.indexOf(state.row);
    const midpoints = rows.map((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });

    for (let i = 0; i < rows.length; i++) {
      if (i === fromIdx) continue;
      if (e.clientY < midpoints[i] && i < fromIdx) {
        listEl.insertBefore(state.row, rows[i]);
        state.startY = e.clientY;
        state.row.style.transform = "translateY(0)";
        break;
      }
      if (e.clientY > midpoints[i] && i > fromIdx) {
        listEl.insertBefore(state.row, rows[i].nextSibling);
        state.startY = e.clientY;
        state.row.style.transform = "translateY(0)";
        break;
      }
    }
  });

  listEl.addEventListener("pointerup", async (e) => {
    if (!state) return;
    state.row.classList.remove("task-manage-row--dragging");
    state.row.style.cssText = "";
    const ids = [...listEl.querySelectorAll(".task-manage-row")]
      .map((r) => r.dataset.taskId)
      .filter(Boolean);
    if (ids.length) {
      try {
        await tasksRepo.setTaskOrder(ids);
      } catch {
        /* order is cosmetic; ignore persistence failure */
      }
    }
    state = null;
  });
}
