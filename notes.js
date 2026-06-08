import { loadCollectionData, saveCollectionData } from "./firebase.js";
import { demoNotes } from "./demo-data.js";

const NOTES_STORAGE_KEY = "aoa-staff-notes-v1";

const form = document.querySelector("#note-form");
const notesList = document.querySelector("#notes-list");
const searchInput = document.querySelector("#notes-search");
const resultCount = document.querySelector("#notes-result-count");
const emptyState = document.querySelector("#notes-empty-state");
let notes = [];

async function loadNotes() {
  const loaded = await loadCollectionData("notes", NOTES_STORAGE_KEY);
  return Array.isArray(loaded) && loaded.length > 0 ? loaded : demoNotes;
}

async function saveNotes() {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  await saveCollectionData("notes", notes);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function normalizeNote(note) {
  return {
    id: String(note?.id || crypto.randomUUID()),
    message: String(note?.message || "").trim(),
    author: String(note?.author || "").trim(),
    createdAt: note?.createdAt || new Date().toISOString(),
    parentId: note?.parentId ? String(note.parentId) : null,
    isPinned: Boolean(note?.isPinned && !note?.parentId)
  };
}

function sortByPinnedAndDate(items) {
  return [...items].sort((a, b) => {
    if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return Number(b.isPinned) - Number(a.isPinned);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function sortReplies(items) {
  return [...items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getReplies(parentId) {
  return sortReplies(notes.filter((note) => note.parentId === parentId));
}

function noteMatches(note, term) {
  if (!term) return true;
  const ownFields = [note.message, note.author];
  const replyFields = getReplies(note.id).flatMap((reply) => [reply.message, reply.author]);
  return [...ownFields, ...replyFields].some((value) => String(value || "").toLowerCase().includes(term));
}

function replyMarkup(reply) {
  return `
    <article class="note-reply">
      <p>${escapeHtml(reply.message)}</p>
      <footer>
        <div>
          <strong>${escapeHtml(reply.author)}</strong>
          <time datetime="${escapeHtml(reply.createdAt)}">${formatDate(reply.createdAt)}</time>
        </div>
        <button class="row-action" type="button" data-delete="${escapeHtml(reply.id)}">Delete</button>
      </footer>
    </article>
  `;
}

function noteMarkup(note) {
  const replies = getReplies(note.id);
  return `
    <article class="note-card${note.isPinned ? " note-card-pinned" : ""}">
      <div class="note-card-header">
        <div class="note-badges">
          ${note.isPinned ? '<span class="note-badge">Pinned</span>' : ""}
          ${replies.length ? `<span class="note-badge subtle">${replies.length} ${replies.length === 1 ? "reply" : "replies"}</span>` : ""}
        </div>
        <div class="note-actions">
          <button class="row-action" type="button" data-pin="${escapeHtml(note.id)}">${note.isPinned ? "Unpin" : "Pin"}</button>
          <button class="row-action" type="button" data-reply-toggle="${escapeHtml(note.id)}">Reply</button>
          <button class="row-action" type="button" data-delete="${escapeHtml(note.id)}">Delete</button>
        </div>
      </div>
      <p>${escapeHtml(note.message)}</p>
      <footer>
        <div>
          <strong>${escapeHtml(note.author)}</strong>
          <time datetime="${escapeHtml(note.createdAt)}">${formatDate(note.createdAt)}</time>
        </div>
      </footer>
      <section class="note-replies">
        ${replies.length ? `<div class="note-replies-list">${replies.map(replyMarkup).join("")}</div>` : ""}
        <form class="note-reply-form" data-reply-form="${escapeHtml(note.id)}" hidden>
          <label>
            Reply
            <textarea name="message" rows="3" maxlength="1500" required placeholder="Add a reply to this note"></textarea>
          </label>
          <label>
            Sign off with your name
            <input name="author" type="text" maxlength="80" autocomplete="name" required placeholder="Your full name" />
          </label>
          <div class="note-reply-actions">
            <button class="button primary" type="submit">Post reply</button>
            <button class="button secondary" type="button" data-reply-cancel="${escapeHtml(note.id)}">Cancel</button>
          </div>
        </form>
      </section>
    </article>
  `;
}

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = sortByPinnedAndDate(
    notes
      .filter((note) => !note.parentId)
      .filter((note) => noteMatches(note, term))
  );

  notesList.innerHTML = filtered.map(noteMarkup).join("");
  resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? "note thread" : "note threads"}`;
  emptyState.hidden = filtered.length > 0;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const message = String(data.get("message") || "").trim();
  const author = String(data.get("author") || "").trim();
  const isPinned = data.get("isPinned") === "on";
  form.elements.message.setCustomValidity(message ? "" : "Please enter a note.");
  form.elements.author.setCustomValidity(author ? "" : "Please sign the note with your name.");
  if (!message || !author) {
    form.reportValidity();
    return;
  }
  notes.push(normalizeNote({
    id: crypto.randomUUID(),
    message,
    author,
    createdAt: new Date().toISOString(),
    parentId: null,
    isPinned
  }));
  await saveNotes();
  form.reset();
  render();
});

notesList.addEventListener("click", async (event) => {
  const deleteId = event.target.dataset.delete;
  if (deleteId) {
    const targetNote = notes.find((note) => note.id === deleteId);
    const isParent = targetNote && !targetNote.parentId;
    const prompt = isParent ? "Delete this note and all replies?" : "Delete this reply?";
    if (!confirm(prompt)) return;
    notes = notes.filter((note) => note.id !== deleteId && note.parentId !== deleteId);
    await saveNotes();
    render();
    return;
  }

  const pinId = event.target.dataset.pin;
  if (pinId) {
    notes = notes.map((note) => note.id === pinId ? { ...note, isPinned: !note.isPinned } : note);
    await saveNotes();
    render();
    return;
  }

  const toggleId = event.target.dataset.replyToggle;
  if (toggleId) {
    const replyForm = notesList.querySelector(`[data-reply-form="${CSS.escape(toggleId)}"]`);
    if (!replyForm) return;
    replyForm.hidden = !replyForm.hidden;
    if (!replyForm.hidden) {
      replyForm.elements.author.value = form.elements.author.value.trim();
      replyForm.elements.message.focus();
    }
    return;
  }

  const cancelId = event.target.dataset.replyCancel;
  if (cancelId) {
    const replyForm = notesList.querySelector(`[data-reply-form="${CSS.escape(cancelId)}"]`);
    if (!replyForm) return;
    replyForm.reset();
    replyForm.hidden = true;
  }
});

notesList.addEventListener("submit", async (event) => {
  const replyForm = event.target.closest("[data-reply-form]");
  if (!replyForm) return;
  event.preventDefault();
  const parentId = replyForm.dataset.replyForm;
  const data = new FormData(replyForm);
  const message = String(data.get("message") || "").trim();
  const author = String(data.get("author") || "").trim();
  replyForm.elements.message.setCustomValidity(message ? "" : "Please enter a reply.");
  replyForm.elements.author.setCustomValidity(author ? "" : "Please sign the reply with your name.");
  if (!message || !author) {
    replyForm.reportValidity();
    return;
  }
  notes.push(normalizeNote({
    id: crypto.randomUUID(),
    message,
    author,
    createdAt: new Date().toISOString(),
    parentId,
    isPinned: false
  }));
  await saveNotes();
  render();
});

form.elements.message.addEventListener("input", () => form.elements.message.setCustomValidity(""));
form.elements.author.addEventListener("input", () => form.elements.author.setCustomValidity(""));
notesList.addEventListener("input", (event) => {
  if (event.target.name === "message") event.target.setCustomValidity("");
  if (event.target.name === "author") event.target.setCustomValidity("");
});
searchInput.addEventListener("input", render);

(async () => {
  notes = (await loadNotes()).map(normalizeNote);
  render();
})();
