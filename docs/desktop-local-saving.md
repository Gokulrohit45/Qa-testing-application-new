# Desktop local saving

The preview supports multiple named desktop tests per project. Save test locally updates only the selected test; New test starts a separate draft. Previous single saved tests remain available as Saved desktop test. New saves protect step targets and values with Windows account-bound DPAPI encryption. Metadata such as test names remains readable. Use disposable test data, not production credentials. No cloud migration or synchronization is included.

Legacy plaintext tests remain readable and are protected when saved again. Old backups and SQLite free pages may still retain earlier plaintext; this is not secure erasure. Copying the database to another Windows account is not a supported migration path. If Windows protection fails, the save is rejected without overwriting the previous test. Protection at rest does not defend against software already running as the same Windows user or replace a credential vault.

Opening a project restores saved steps, never window handles or authorization. Refresh windows, select the intended disposable document and inspect controls again. Targets missing from the new inspection prevent execution until reselected.

Runs started from the workspace save step outcomes locally, including failures and cancellations. An unfinished record without a live job is labelled interrupted on history retrieval, never passed. Run records exclude input values and window identity. They are not a replayable snapshot of the test definition. Existing runs from before this update cannot be recovered.

Restart the source preview after this backend update. Save the two-step Notepad test, close and reopen the preview, verify steps restore and Run remains disabled until window inspection and confirmation. Run the test and reopen the project to check history.

Latest validation: 40 desktop backend tests passed, including real Windows encryption, legacy read/resave and failed-save preservation. Full backend suite: 79 passed. Five browser UI tests and the frontend production build passed; the existing large-bundle warning remains. Native restart acceptance was previously user-confirmed for Notepad. Nothing released or pushed.
