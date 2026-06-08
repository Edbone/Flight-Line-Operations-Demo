import { loadCollectionData } from "./firebase.js";
import { demoNotes } from "./demo-data.js";

const HOME_NOTES_STORAGE_KEY = "aoa-staff-notes-v1";
const homeNotesList = document.querySelector("#home-notes-list");
const homeNotesEmpty = document.querySelector("#home-notes-empty");

async function loadHomeNotes() {
  const loaded = await loadCollectionData("notes", HOME_NOTES_STORAGE_KEY);
  return Array.isArray(loaded) && loaded.length > 0 ? loaded : demoNotes;
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

  homeNotesList.innerHTML = notes.map((note) => `
    <article class="home-note">
      <p>${escapeHomeNoteHtml(note.message)}</p>
      <footer>
        <strong>${escapeHomeNoteHtml(note.author)}</strong>
        <time datetime="${escapeHomeNoteHtml(note.createdAt)}">${formatHomeNoteDate(note.createdAt)}</time>
      </footer>
    </article>
  `).join("");
  homeNotesEmpty.hidden = notes.length > 0;
}

window.addEventListener("storage", (event) => {
  if (event.key === HOME_NOTES_STORAGE_KEY) renderHomeNotes();
});
window.addEventListener("focus", renderHomeNotes);
renderHomeNotes();
