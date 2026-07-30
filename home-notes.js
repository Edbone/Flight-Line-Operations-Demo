import { loadCollectionData } from "./firebase.js";

const HOME_NOTES_STORAGE_KEY = "aoa-staff-notes-v1";
const homeNotesList = document.querySelector("#home-notes-list");
const homeNotesEmpty = document.querySelector("#home-notes-empty");

async function loadHomeNotes() {
  return await loadCollectionData("notes", HOME_NOTES_STORAGE_KEY);
}

function escapeHomeNoteHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function formatHomeNoteDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

async function renderHomeNotes() {
  const notes = (await loadHomeNotes())
    .filter((note) => !note.parentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)))
    .slice(0, 3);

  homeNotesList.innerHTML = notes.map((note) => {
    const author = note.author || "Unknown author";
    return `
    <article class="home-note${note.isPinned ? " home-note-pinned" : ""}">
      ${note.isPinned ? '<div class="home-note-meta"><span>Pinned note</span></div>' : ""}
      <p>${escapeHomeNoteHtml(note.message)}</p>
      <footer>
        <span>Posted by <strong>${escapeHomeNoteHtml(author)}</strong></span>
        <time datetime="${escapeHomeNoteHtml(note.createdAt)}">${formatHomeNoteDate(note.createdAt)}</time>
      </footer>
    </article>
  `;
  }).join("");
  homeNotesEmpty.hidden = notes.length > 0;
}

window.addEventListener("storage", (event) => {
  if (event.key === HOME_NOTES_STORAGE_KEY) renderHomeNotes();
});
window.addEventListener("focus", renderHomeNotes);
renderHomeNotes();
