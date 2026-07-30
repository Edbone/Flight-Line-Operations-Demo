import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCollectionMutation,
  buildCollectionMutation,
  deletedItemsForMutation,
  itemKey
} from "../data-reliability.mjs";

test("concurrent additions are preserved when a stale browser saves", () => {
  const baseline = [{ id: "existing", value: 1 }];
  const browserSave = [...baseline, { id: "browser-a", value: 2 }];
  const mutation = buildCollectionMutation(browserSave, baseline, false);
  const currentAtCommit = [...baseline, { id: "browser-b", value: 3 }];

  assert.deepEqual(applyCollectionMutation(currentAtCommit, mutation), [
    { id: "existing", value: 1 },
    { id: "browser-a", value: 2 },
    { id: "browser-b", value: 3 }
  ]);
});

test("unchanged stale records do not overwrite another browser's edit", () => {
  const baseline = [{ id: "edited-elsewhere", value: 1 }, { id: "my-record", value: 1 }];
  const browserSave = [{ id: "edited-elsewhere", value: 1 }, { id: "my-record", value: 2 }];
  const mutation = buildCollectionMutation(browserSave, baseline, false);
  const currentAtCommit = [{ id: "edited-elsewhere", value: 99 }, { id: "my-record", value: 1 }];

  assert.deepEqual(applyCollectionMutation(currentAtCommit, mutation), [
    { id: "edited-elsewhere", value: 99 },
    { id: "my-record", value: 2 }
  ]);
});

test("a deletion removes only records seen by the deleting browser", () => {
  const baseline = [{ id: "keep" }, { id: "delete" }];
  const mutation = buildCollectionMutation([{ id: "keep" }], baseline, true);
  const currentAtCommit = [...baseline, { id: "new-from-another-browser" }];

  assert.deepEqual(applyCollectionMutation(currentAtCommit, mutation), [
    { id: "keep" },
    { id: "new-from-another-browser" }
  ]);
  assert.deepEqual(deletedItemsForMutation(currentAtCommit, mutation), [{ id: "delete" }]);
});

test("later mutations replay cleanly over recovered offline work", () => {
  const remote = [{ id: "one", value: 1 }];
  const offlineAdd = buildCollectionMutation([...remote, { id: "two", value: 2 }], remote, false);
  const offlineEdit = buildCollectionMutation([
    { id: "one", value: 1 },
    { id: "two", value: 20 },
    { id: "three", value: 3 }
  ], [...remote, { id: "two", value: 2 }], false);

  assert.deepEqual([offlineAdd, offlineEdit].reduce(applyCollectionMutation, remote), [
    { id: "one", value: 1 },
    { id: "two", value: 20 },
    { id: "three", value: 3 }
  ]);
});

test("stable keys support legacy student records without ids", () => {
  assert.equal(itemKey({ studentId: "student-7", name: "A" }), "studentId:student-7");
  assert.equal(itemKey({ b: 2, a: 1 }), itemKey({ a: 1, b: 2 }));
});
